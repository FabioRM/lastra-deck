// @ts-check
'use strict';

const path = require('node:path');
const { cursorSurface, photoshopSurface, observeShortcutMode } = require('./shortcut-surface');
const { loadWin32, fn, readProcessPath } = require('./win32');
const SHELL_HOSTS = new Set(['startmenuexperiencehost.exe', 'shellexperiencehost.exe', 'searchhost.exe', 'searchapp.exe']);
const DESKTOP_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd']);

function createForegroundReader({ readAppIdentity = () => null, needsTitle = () => false } = {}) {
  if (process.platform !== 'win32') return () => null;
  const { koffi, pointerSize } = loadWin32();
  const foreground = fn('GetForegroundWindow');
  const processId = fn('GetWindowThreadProcessId');
  const keyboardLayout = fn('GetKeyboardLayout');
  const className = fn('GetClassNameW');
  const getWindowText = fn('GetWindowTextW');
  const getGuiThreadInfo = fn('GetGUIThreadInfo');
  const getWindow = fn('GetWindow');
  const getAncestor = fn('GetAncestor');
  const processPath = readProcessPath;
  let cached;

  function activeWindow() {
    const window = foreground();
    if (!window) return null;
    const id = [0];
    const thread = processId(window, id);
    if (!thread || id[0] === process.pid) return null;
    const windowId = koffi.address(window);
    const keyboardHandle = BigInt(keyboardLayout(thread));
    const layout = Number(keyboardHandle & 0xffffffffn);
    return { window, thread, pid: id[0], windowId, id: id[0] + ':' + windowId, keyboardLayout: layout, keyboardHandle };
  }

  function windowClass(window) {
    if (!window) return '';
    const buffer = Buffer.alloc(128);
    const length = className(window, buffer, buffer.length / 2);
    return buffer.toString('utf16le', 0, length * 2);
  }

  function shellSurface(window, executable) {
    return SHELL_HOSTS.has(executable) || (executable === 'explorer.exe' && DESKTOP_CLASSES.has(windowClass(window)));
  }

  function readSurface({ thread, window, windowId }) {
    const info = Buffer.alloc(8 + 6 * pointerSize + 16); // GUITHREADINFO
    info.writeUInt32LE(info.length);
    if (!getGuiThreadInfo(thread, info)) return null;
    const active = koffi.decode(info, 8, 'void *');
    const focus = koffi.decode(info, 8 + pointerSize, 'void *');
    const caret = koffi.decode(info, 8 + 5 * pointerSize, 'void *');
    const root = focus ? getAncestor(focus, 2) : null; // GA_ROOT
    return {
      windowClass: windowClass(window),
      focusClass: windowClass(focus),
      focusId: focus ? koffi.address(focus) : null,
      focusInWindow: Boolean(active && root && koffi.address(active) === windowId && koffi.address(root) === windowId),
      hasOwner: Boolean(getWindow(window, 4)), // GW_OWNER
      caretId: caret ? koffi.address(caret) : null,
      flags: info.readUInt32LE(4),
    };
  }

  function titleContext({ window }, executable) {
    const includeTitle = needsTitle();
    if (!includeTitle && executable !== 'cursor.exe') return {};
    const buffer = Buffer.alloc(2_048);
    const length = getWindowText(window, buffer, buffer.length / 2);
    const title = buffer.toString('utf16le', 0, length * 2);
    return { title: includeTitle ? title : undefined, mode: cursorSurface(executable, title) };
  }

  function context({ fresh = false } = {}) {
    const active = activeWindow();
    if (!active) return null;
    if (!fresh && cached?.id === active.id) {
      const { title, mode: titleMode } = titleContext(active, cached.executable);
      const observed = observeShortcutMode(cached.executable, active, activeWindow, readSurface);
      if (!observed) return null;
      const { keyboardLayout, keyboardHandle } = observed.active;
      const mode = observed.mode ?? titleMode;
      if (cached.keyboardHandle !== keyboardHandle || cached.mode !== mode || cached.title !== title) {
        cached = { ...cached, keyboardLayout, keyboardHandle, mode, title };
      }
      return cached;
    }

    const executablePath = processPath(active.pid);
    const name = path.win32.basename(executablePath);
    const executable = name.toLowerCase();
    const shell = shellSurface(active.window, executable);
    let appId = '';
    if (!shell) {
      try {
        const app = readAppIdentity();
        if (app?.id === active.id) appId = app.appId || '';
      } catch {
        // The executable path is sufficient for desktop windows.
      }
    }
    const current = activeWindow();
    if (current?.id !== active.id) return null;
    const { title, mode: titleMode } = titleContext(current, executable);
    const observed = observeShortcutMode(executable, current, activeWindow, readSurface);
    if (!observed) return null;
    const { keyboardLayout, keyboardHandle } = observed.active;
    cached = { id: active.id, windowId: active.windowId, pid: active.pid, keyboardLayout, keyboardHandle,
      executable, name, path: executablePath.toLowerCase(), appId, shell, mode: observed.mode ?? titleMode, title };
    return cached;
  }

  function readForeground() {
    return context()?.executable ?? null;
  }
  readForeground.context = context;
  readForeground.textTarget = () => {
    const active = activeWindow();
    if (!active) return null;
    const executable = path.win32.basename(processPath(active.pid)).toLowerCase();
    if (!executable || shellSurface(active.window, executable)) return null;
    const surface = readSurface(active);
    // Windows assigns flags 0x02–0x10 to moves, resizes and menu loops.
    if (!surface?.focusInWindow || (surface.flags & 0x1e) || activeWindow()?.id !== active.id) return null;
    return { id: active.id, focusId: surface.focusId };
  };
  readForeground.windowId = () => {
    const window = foreground();
    return window ? koffi.address(window) : null;
  };
  return readForeground;
}

module.exports = { createForegroundReader, photoshopSurface };
