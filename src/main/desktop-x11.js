'use strict';

const { linuxChord } = require('./linux-keyboard');
const { sameShortcutWindow } = require('./shortcut-guards');

const CORE_KEYBOARD = 0x0100;
const MAX_PROPERTY_BYTES = 4096;

function openX11(koffi) {
  const x11 = koffi.load('libX11.so.6');
  const bridge = koffi.load('libX11-xcb.so.1');
  const xcb = koffi.load('libxcb.so.1');
  const xtst = koffi.load('libXtst.so.6');
  // Resolve free in the process scope so it matches the allocator XCB uses under Chromium.
  const processSymbols = koffi.load(null);
  const free = processSymbols.func('void free(void *)');
  const copy = processSymbols.func('void *memcpy(void *, const void *, size_t)');
  const connect = x11.func('void *XOpenDisplay(const char *)');
  const disconnect = x11.func('int XCloseDisplay(void *)');
  const defaultRoot = x11.func('unsigned long XDefaultRootWindow(void *)');
  const intern = x11.func('unsigned long XInternAtom(void *, const char *, int)');
  const getConnection = bridge.func('void *XGetXCBConnection(void *)');
  const cookie = koffi.struct({ sequence: 'unsigned int' });
  const getProperty = xcb.func('xcb_get_property', cookie, ['void *', 'uint8_t', 'uint32_t', 'uint32_t', 'uint32_t', 'uint32_t', 'uint32_t']);
  const propertyReply = xcb.func('xcb_get_property_reply', 'void *', ['void *', cookie, 'void *']);
  const propertyData = xcb.func('void *xcb_get_property_value(void *)');
  const propertyLength = xcb.func('int xcb_get_property_value_length(void *)');
  const queryTree = xcb.func('xcb_query_tree', cookie, ['void *', 'uint32_t']);
  const treeReply = xcb.func('xcb_query_tree_reply', 'void *', ['void *', cookie, 'void *']);
  const grab = x11.func('int XGrabServer(void *)');
  const ungrab = x11.func('int XUngrabServer(void *)');
  const sync = x11.func('int XSync(void *, int)');
  const getFocus = x11.func('int XGetInputFocus(void *, _Out_ unsigned long *, _Out_ int *)');
  const getState = x11.func('int XkbGetState(void *, unsigned int, void *)');
  const getSymbol = x11.func('unsigned long XkbKeycodeToKeysym(void *, uint8_t, int, int)');
  const lookupSymbol = x11.func('unsigned long XStringToKeysym(const char *)');
  const keyRange = x11.func('int XDisplayKeycodes(void *, _Out_ int *, _Out_ int *)');
  const heldKeys = x11.func('int XQueryKeymap(void *, void *)');
  const queryTest = xtst.func('int XTestQueryExtension(void *, _Out_ int *, _Out_ int *, _Out_ int *, _Out_ int *)');
  const fakeKey = xtst.func('int XTestFakeKeyEvent(void *, unsigned int, int, unsigned long)');

  const display = connect(null);
  if (!display) throw new Error('Could not connect to the X11 display.');
  try {
    const connection = getConnection(display);
    const root = Number(defaultRoot(display));
    const atoms = Object.fromEntries(['_NET_ACTIVE_WINDOW', '_NET_WM_NAME', '_NET_WM_PID', 'WM_CLASS', 'WM_NAME']
      .map((name) => [name, Number(intern(display, name, 0))]));
    const min = [0], max = [0];
    keyRange(display, min, max);
    const canSend = Boolean(queryTest(display, [0], [0], [0], [0]));

    // XCB reply errors are local to the query. A window can disappear while we read its properties.
    function property(window, name, format) {
      const reply = propertyReply(connection, getProperty(connection, 0, window, atoms[name], 0, 0, MAX_PROPERTY_BYTES / 4), null);
      if (!reply) return null;
      try {
        if (koffi.decode(reply, 1, 'uint8_t') !== format) return null;
        const length = propertyLength(reply);
        if (length <= 0 || length > MAX_PROPERTY_BYTES) return null;
        // Copy into V8-owned memory so the property is safe after freeing the XCB reply.
        const bytes = Buffer.alloc(length);
        copy(bytes, propertyData(reply), length);
        return bytes;
      } finally { free(reply); }
    }
    const integer = (window, name) => property(window, name, 32)?.readUInt32LE() ?? 0;
    const activeWindow = () => integer(root, '_NET_ACTIVE_WINDOW') || null;

    function group() {
      const state = Buffer.alloc(32); // XkbStateRec, whose first byte is the effective group.
      if (getState(display, CORE_KEYBOARD, state) !== 0) throw new Error('The X11 keyboard layout is unavailable.');
      return state[0];
    }

    function focusBelongsTo(window) {
      const result = [0];
      getFocus(display, result, [0]);
      let focus = Number(result[0]);
      for (let depth = 0; focus > 1 && focus !== root && depth < 32; depth++) {
        if (focus === window) return true;
        const reply = treeReply(connection, queryTree(connection, focus), null);
        if (!reply) break;
        try { focus = koffi.decode(reply, 12, 'uint32_t'); }
        finally { free(reply); }
      }
      return false;
    }

    function keycode(symbol, layout, allowShift = false) {
      const wanted = lookupSymbol(symbol);
      for (const level of allowShift ? [0, 1] : [0]) {
        for (let code = min[0]; wanted && code <= max[0]; code++) {
          if (getSymbol(display, code, layout, level) === wanted) return { code, shift: level === 1 };
        }
      }
      throw new Error(`“${symbol}” is unavailable on the active X11 keyboard layout.`);
    }

    return { property, integer, activeWindow, group, keycode, focusBelongsTo, canSend,
      close: () => disconnect(display),
      withServer(callback) {
        grab(display);
        try {
          sync(display, 0);
          return callback();
        } finally {
          ungrab(display);
          sync(display, 0);
        }
      },
      press(codes, modifierCodes) {
        const held = Buffer.alloc(32);
        heldKeys(display, held);
        if ([...codes, ...modifierCodes].some((code) => held[code >> 3] & (1 << (code & 7)))) {
          throw new Error('Release the physical shortcut keys before pressing the Deck button.');
        }
        const pressed = [];
        try {
          for (const code of codes) {
            if (!fakeKey(display, code, 1, 0)) throw new Error('X11 rejected the shortcut.');
            pressed.push(code);
          }
        } finally {
          for (const code of pressed.reverse()) fakeKey(display, code, 0, 0);
        }
      },
    };
  } catch (error) {
    disconnect(display);
    throw error;
  }
}

function createX11Desktop({ pid = process.pid, open = () => openX11(require('koffi')) } = {}) {
  const x11 = open();
  const supportsInput = x11.canSend ? undefined : 'The X11 server does not support XTEST.';

  function context() {
    const windowId = x11.activeWindow();
    if (!windowId) return null;
    const owner = x11.integer(windowId, '_NET_WM_PID');
    const names = x11.property(windowId, 'WM_CLASS', 8)?.toString('utf8').split('\0');
    const name = names?.[1] || names?.[0];
    if (!name || owner === pid || /^lastra$/i.test(name)) return null;
    const title = (x11.property(windowId, '_NET_WM_NAME', 8) ?? x11.property(windowId, 'WM_NAME', 8))?.toString('utf8');
    const keyboardLayout = x11.group() + 1;
    if (x11.activeWindow() !== windowId) return null;
    return { platform: 'linux', appId: name.toLowerCase(), executable: '', name, title, id: owner, windowId, keyboardLayout };
  }

  function resolve(keys, layout) {
    if (supportsInput) throw new Error(supportsInput);
    const { key, modifierSymbols } = linuxChord(keys);
    const final = x11.keycode(key, layout, true);
    const modifiers = final.shift && !modifierSymbols.includes('Shift_L') ? [...modifierSymbols, 'Shift_L'] : modifierSymbols;
    return [...modifiers.map((symbol) => x11.keycode(symbol, layout).code), final.code];
  }

  return { kind: 'x11', context, close: x11.close,
    checkChord(keys, target) { resolve(keys, target.keyboardLayout - 1); },
    sendChord(keys, target) {
      x11.withServer(() => {
        const active = context();
        if (!sameShortcutWindow(target, active) || target.keyboardLayout !== active.keyboardLayout || !x11.focusBelongsTo(active.windowId)) {
          throw new Error('The shortcut target window or keyboard layout changed.');
        }
        // Reject unrelated physical modifiers as well, since they would change the shortcut.
        const layout = active.keyboardLayout - 1;
        const physicalModifiers = ['Control_L', 'Control_R', 'Shift_L', 'Shift_R', 'Alt_L', 'Alt_R', 'Super_L', 'Super_R', 'ISO_Level3_Shift']
          .flatMap((symbol) => { try { return [x11.keycode(symbol, layout).code]; } catch { return []; } });
        x11.press(resolve(keys, layout), physicalModifiers);
      });
    },
  };
}

module.exports = { createX11Desktop };
