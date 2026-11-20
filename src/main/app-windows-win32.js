// @ts-check
'use strict';

const path = require('node:path');
const { loadWin32, fn, comCall, withQueryableProcess, readProcessPath } = require('./win32');

function createAppWindowReader() {
  if (process.platform !== 'win32') return null;
  const { koffi, types, pointerSize } = loadWin32();

  const foreground = fn('GetForegroundWindow');
  const processId = fn('GetWindowThreadProcessId');
  const windowText = fn('GetWindowTextW');
  const windowTextLength = fn('GetWindowTextLengthW');
  const isVisible = fn('IsWindowVisible');
  const isMinimized = fn('IsIconic');
  const isMaximized = fn('IsZoomed');
  const getWindowRect = fn('GetWindowRect');
  const setWindowPos = fn('SetWindowPos');
  const showWindow = fn('ShowWindowAsync');
  const setForeground = fn('SetForegroundWindow');
  const enumerate = fn('EnumWindows');
  const attributes = fn('DwmGetWindowAttribute');
  const readPath = readProcessPath;
  const processAppId = fn('GetApplicationUserModelId');
  const readProperties = fn('SHGetPropertyStoreForWindow');
  const initCom = fn('CoInitializeEx');
  const uninitCom = fn('CoUninitialize');
  const clearProperty = fn('PropVariantClear');

  // IPropertyStore and PKEY_AppUserModel_ID GUIDs in Windows memory order.
  const propertyStoreId = Buffer.from('eb8e6d88f28c46448d02cdba1dbdcf99', 'hex');
  const appIdProperty = Buffer.from('55284c9f799f394ba8d0e1d42de1d5f305000000', 'hex');

  function appIdFromWindow(window) {
    const com = initCom(null, 2); // COINIT_APARTMENTTHREADED
    try {
      const properties = [null];
      if (readProperties(window, propertyStoreId, properties) < 0 || !properties[0]) return '';
      const store = properties[0];
      try {
        const value = Buffer.alloc(pointerSize === 8 ? 24 : 16);
        try {
          if (comCall(store, 5, types.getProperty, appIdProperty, value) < 0 || value.readUInt16LE() !== 31) return ''; // VT_LPWSTR
          const text = koffi.decode(value, 8, 'void *');
          return text ? koffi.decode.string16(text).toLowerCase() : '';
        } finally {
          clearProperty(value);
        }
      } finally {
        comCall(store, 2, types.release);
      }
    } finally {
      if (com >= 0) uninitCom();
    }
  }

  function appIdFromProcess(pid) {
    return withQueryableProcess(pid, (handle) => {
      const length = [129];
      const buffer = Buffer.alloc(length[0] * 2);
      if (processAppId(handle, length, buffer) !== 0 || length[0] < 2) return '';
      return buffer.toString('utf16le', 0, (length[0] - 1) * 2).toLowerCase();
    }) ?? '';
  }

  function describe(window, { appId = true, title = true } = {}, paths = new Map()) {
    if (!window) return null;
    const pid = [0];
    if (!processId(window, pid) || pid[0] === process.pid) return null;
    if (!paths.has(pid[0])) paths.set(pid[0], readPath(pid[0]).toLowerCase());
    const executablePath = paths.get(pid[0]);
    const result = { executable: path.win32.basename(executablePath), path: executablePath };
    if (title) {
      const buffer = Buffer.alloc(2048);
      const length = windowText(window, buffer, buffer.length / 2);
      result.title = buffer.toString('utf16le', 0, length * 2);
    }
    if (appId) result.appId = appIdFromWindow(window) || appIdFromProcess(pid[0]);
    result.id = pid[0] + ':' + koffi.address(window).toString();
    return result;
  }

  function* matchingWindows(matches, options) {
    const handles = [];
    const enumerated = enumerate((window) => {
      if (isVisible(window)) handles.push(window);
      return 1;
    }, 0);
    if (!enumerated) throw new Error('Windows could not list open windows');
    const paths = new Map();
    for (const window of handles) {
      const cloaked = [0];
      if (attributes(window, 14, cloaked, 4) === 0 && cloaked[0]) continue; // DWMWA_CLOAKED
      const item = describe(window, options, paths);
      if (!item || !matches(item) || (options.title === false ? windowTextLength(window) <= 0 : !item.title)) continue;
      yield { window, item };
    }
  }

  function activate(window) {
    const active = foreground();
    if (active && koffi.address(active) === koffi.address(window)) return true;
    if (isMinimized(window)) showWindow(window, 9); // SW_RESTORE
    return Boolean(setForeground(window));
  }

  function windowById(id, executablePath) {
    for (const { window, item } of matchingWindows((entry) => entry.path === executablePath, { appId: false, title: false })) {
      if (item.id === id) return window;
    }
  }

  function readBounds(window) {
    const rect = Buffer.alloc(16);
    if (!getWindowRect(window, rect)) return null;
    const x = rect.readInt32LE(0);
    const y = rect.readInt32LE(4);
    return { x, y, width: rect.readInt32LE(8) - x, height: rect.readInt32LE(12) - y };
  }

  return {
    foreground: (options) => describe(foreground(), options),
    list(matches, appId) {
      const entries = [];
      for (const { item } of matchingWindows(matches, { appId })) {
        entries.push({ id: item.id, title: item.title, path: item.path });
        if (entries.length === 12) break;
      }
      return entries;
    },
    workspaceWindows(paths) {
      const approved = new Set(paths);
      if (!approved.size) return [];
      const counts = new Map();
      const entries = [];
      for (const { window, item } of matchingWindows((entry) => approved.has(entry.path), { appId: false, title: false })) {
        const count = counts.get(item.path) ?? 0;
        if (count >= 3) continue;
        counts.set(item.path, count + 1);
        const minimized = Boolean(isMinimized(window));
        entries.push({ id: item.id, path: item.path, minimized, maximized: Boolean(isMaximized(window)),
          bounds: minimized ? null : readBounds(window) });
      }
      return entries;
    },
    focus(matches, id, appId) {
      for (const { window, item } of matchingWindows(matches, { appId })) {
        if (item.id === id) return activate(window);
      }
      return false;
    },
    focusWindow(id, executablePath) {
      const window = windowById(id, executablePath);
      return Boolean(window && activate(window));
    },
    focusApp({ path: executablePath, executable }) {
      const active = foreground();
      const address = active ? koffi.address(active) : null;
      const matches = executablePath ? (item) => item.path === executablePath : (item) => item.executable === executable;
      let candidate;
      for (const entry of matchingWindows(matches, { appId: false })) {
        if (candidate && candidate.item.path !== entry.item.path) return 'ambiguous';
        if (!candidate || koffi.address(entry.window) === address) candidate = entry;
      }
      if (!candidate) return 'missing';
      return activate(candidate.window) ? 'focused' : 'blocked';
    },
    reveal(id, executablePath) {
      const window = windowById(id, executablePath);
      return Boolean(window && (!isMinimized(window) || showWindow(window, 4))); // SW_SHOWNOACTIVATE
    },
    place(id, executablePath, { x, y, width, height }) {
      const window = windowById(id, executablePath);
      if (!window) return false;
      if (isMinimized(window) || isMaximized(window)) showWindow(window, 4); // SW_SHOWNOACTIVATE
      // Keep the target's focus and stacking order. Queue the move on its thread.
      return Boolean(setWindowPos(window, null, x, y, width, height, 0x4214));
    },
    bounds(id, executablePath) {
      const window = windowById(id, executablePath);
      return window ? readBounds(window) : null;
    },
  };
}

module.exports = { createAppWindowReader };
