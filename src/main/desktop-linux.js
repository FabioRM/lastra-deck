'use strict';

const { execFileSync } = require('node:child_process');
const { createX11Desktop } = require('./desktop-x11');
const { createPortalDesktop } = require('./desktop-wayland');
const { linuxChord } = require('./linux-keyboard');

const DECK_WINDOW_TITLE = 'Lastra Deck';
const ADDRESS = /^0x[1-9a-f][0-9a-f]*$/i;
const CHANGED = 'The shortcut target window changed.';

function linuxSession(env = process.env) {
  if (env.XDG_SESSION_TYPE === 'wayland' || env.WAYLAND_DISPLAY || env.WAYLAND_SOCKET) {
    if (env.HYPRLAND_INSTANCE_SIGNATURE) return 'hyprland';
    const desktops = `${env.XDG_CURRENT_DESKTOP ?? ''}:${env.XDG_SESSION_DESKTOP ?? ''}`.toLowerCase().split(':');
    if (desktops.includes('gnome')) return 'gnome';
    if (desktops.includes('kde') || desktops.includes('plasma') || env.KDE_FULL_SESSION === 'true') return 'kde';
    return 'wayland';
  }
  return env.DISPLAY ? 'x11' : 'unavailable';
}

function createHyprlandDesktop({ pid = process.pid, hyprctl = (...args) => execFileSync('hyprctl', args,
  { encoding: 'utf8', timeout: 250, maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim() } = {}) {
  if (hyprctl('eval', 'assert(hl.dsp.send_shortcut and hl.get_active_window)') !== 'ok') {
    throw new Error('Wayland shortcuts require Hyprland 0.55 or later with Lua configuration.');
  }

  function context() {
    try {
      const window = JSON.parse(hyprctl('-j', 'activewindow'));
      const name = window.initialClass || window.class;
      if (!ADDRESS.test(window.address) || typeof name !== 'string' || !name || !Number.isSafeInteger(window.pid)
          || window.pid <= 0 || window.pid === pid || /^lastra$/i.test(name)) return null;
      return { platform: 'linux', appId: name.toLowerCase(), executable: '', name, title: window.title,
        id: window.pid, windowId: window.address };
    } catch { return null; }
  }

  return { kind: 'hyprland', context,
    checkChord: linuxChord,
    sendChord(keys, target) {
      const { key, modifiers } = linuxChord(keys);
      if (!target || !ADDRESS.test(target.windowId) || !Number.isSafeInteger(target.id) || target.id <= 0) throw new Error(CHANGED);
      if (hyprctl('locked') !== 'false') throw new Error('The Hyprland session is locked or unavailable.');
      // Test focus and dispatch on the compositor thread in the same request. Only the validated
      // address, numeric PID and known XKB names enter the Lua expression; app titles stay out of it.
      const result = hyprctl('eval', [
        'local window = hl.get_active_window()',
        `assert(window and window.address == "${target.windowId}" and window.pid == ${target.id}, "Lastra target changed")`,
        `assert(hl.dispatch(hl.dsp.send_shortcut({mods = "${modifiers.join(' ')}", key = "${key}", window = window})).ok, "Lastra shortcut rejected")`,
      ].join('\n'));
      if (result !== 'ok') throw new Error(result.includes('Lastra target changed') ? CHANGED : 'Hyprland could not send the shortcut.');
    },
  };
}

function createLinuxDesktop({ env = process.env, x11Window = Boolean(env.DISPLAY), log = () => {}, onChange = () => {}, openX11 = createX11Desktop,
  openHyprland = createHyprlandDesktop, openPortal = createPortalDesktop } = {}) {
  const kind = linuxSession(env);
  const portal = kind === 'gnome' || kind === 'kde';
  const xwayland = portal && Boolean(env.DISPLAY) && x11Window;
  let reason = kind === 'wayland' ? 'Automatic profiles and shortcut input require GNOME, KDE Plasma, or Hyprland on Wayland.'
    : 'A supported Linux desktop session is required to send shortcuts.';
  try {
    if (kind === 'x11') return openX11();
    if (kind === 'hyprland') return openHyprland();
    if (xwayland) return Object.assign(openPortal({ kind, log, onChange, env }), { xwayland });
    if (portal) reason = 'The Lastra Deck window requires XWayland. Start with npm start or --ozone-platform=x11.';
  } catch (error) {
    log(`Linux desktop integration: ${error.message}`);
    if (portal) reason = 'Wayland shortcuts require GJS and the desktop Remote Desktop portal.';
    else if (kind === 'x11') reason = 'X11 shortcuts require a working display and the X11, XCB and XTEST libraries.';
    else reason = 'Hyprland shortcuts require version 0.55 or later, Lua configuration and hyprctl.';
  }
  const unavailable = () => { throw new Error(reason); };
  return { kind, reason, xwayland, checkChord: unavailable, sendChord: unavailable };
}

function linuxForeground(desktop) {
  const context = desktop.context;
  const read = () => context?.()?.appId ?? null;
  return Object.assign(read, { context, windowId: () => context?.()?.windowId ?? null });
}

function linuxInput(desktop) {
  return {
    requiresTarget: true,
    checkChord(keys, target) {
      if (desktop.reason) throw new Error(desktop.reason);
      if (target?.windowId == null) throw new Error('Bring the target window to the foreground.');
      desktop.checkChord(keys, target);
    },
    sendChord(keys, _layout, target) {
      if (!target) throw new Error('Sending a key on Linux requires a verified target window.');
      return desktop.sendChord(keys, target);
    },
    sendText() { throw new Error('Typing text from the Deck is unavailable on Linux.'); },
  };
}

module.exports = { createLinuxDesktop, createHyprlandDesktop, linuxSession, linuxForeground, linuxInput, DECK_WINDOW_TITLE };
