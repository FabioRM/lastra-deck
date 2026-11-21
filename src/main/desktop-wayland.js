'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const { createInterface } = require('node:readline');
const { linuxChord } = require('./linux-keyboard');

const HELPER = path.join(__dirname, '../../extensions/lastra-wayland/session.mjs');
const CONSENT = 'Start Lastra with --enable-wayland-keyboard to authorize keyboard shortcuts.';
const STOPPED = 'The Wayland keyboard session is unavailable.';

function foregroundContext(value, pid = process.pid) {
  if (!value || typeof value.appId !== 'string' || typeof value.windowId !== 'string' || !value.windowId
      || !Number.isSafeInteger(value.id) || value.id === pid || /^lastra(?:\.desktop)?$/i.test(value.appId)) return null;
  const appId = value.appId.replace(/\.desktop$/i, '').toLowerCase();
  if (!appId) return null;
  return { platform: 'linux', executable: '', appId, name: value.appId, id: value.id, windowId: value.windowId,
    title: typeof value.title === 'string' ? value.title : undefined };
}

function createPortalDesktop({ kind, log, onChange, env, pid = process.pid,
  launch = () => spawn('gjs', ['-m', HELPER, kind], { env, stdio: ['pipe', 'pipe', 'pipe'] }),
  lookup = require('koffi').load('libX11.so.6').func('unsigned long XStringToKeysym(const char *)'), now = Date.now }) {
  const child = launch();
  const waiting = new Map();
  let nextId = 0;
  let focus = null;
  let seen = 0;
  let focusReason = 'Starting the desktop foreground integration.';
  let keyboardReason = CONSENT;
  let permission;
  let stopped = false;

  function stop(reason = STOPPED) {
    if (stopped) return;
    stopped = true;
    focus = null;
    focusReason = reason;
    for (const { finish } of waiting.values()) finish(new Error(reason));
    onChange();
  }

  const output = createInterface({ input: child.stdout, crlfDelay: Infinity });
  output.on('line', (line) => {
    if (stopped) return;
    let event;
    try { event = JSON.parse(line); } catch { return; }
    if (event?.type === 'focus') {
      const previous = focusReason;
      focus = foregroundContext(event.window, pid);
      focusReason = typeof event.error === 'string' ? event.error : undefined;
      seen = now();
      if (previous !== focusReason) onChange();
    } else if (event?.type === 'keyboard') {
      keyboardReason = event.ready ? undefined : event.error || CONSENT;
      onChange();
    } else if (event?.type === 'reply') {
      waiting.get(event.id)?.finish(event.error ? new Error(event.error) : undefined);
    }
  });
  child.stderr.on('data', (chunk) => log('Wayland helper:', chunk.toString().trim().slice(0, 512)));
  child.on('error', (error) => {
    log('Wayland helper could not start:', error.message);
    stop('Install GJS to enable GNOME and KDE Plasma Wayland shortcuts.');
  });
  child.on('exit', () => stop());
  child.stdin.on('error', () => stop());

  function request(command, fields, timeout) {
    if (stopped) return Promise.reject(new Error(STOPPED));
    if (waiting.size >= 16) return Promise.reject(new Error('The Wayland keyboard is busy.'));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const finish = (error) => {
        clearTimeout(timer);
        waiting.delete(id);
        if (error) reject(error);
        else resolve(undefined);
      };
      const timer = setTimeout(() => finish(new Error('The Wayland keyboard request timed out.')), timeout);
      waiting.set(id, { finish });
      child.stdin.write(JSON.stringify({ id, command, ...fields }) + '\n');
    });
  }

  function keysyms(keys) {
    const { key, modifierSymbols } = linuxChord(keys);
    return [...modifierSymbols, key].map((symbol) => {
      const code = Number(lookup(symbol));
      if (!Number.isInteger(code) || code <= 0 || code > 0x7fffffff) throw new Error(`The key “${symbol}” has no Linux mapping.`);
      return code;
    });
  }

  return { kind,
    get reason() { return focusReason ?? keyboardReason; },
    context: () => now() - seen <= 1500 ? focus : null,
    checkChord: keysyms,
    enable() {
      if (!keyboardReason || permission) return permission;
      permission = request('enable', {}, 150_000).catch((error) => {
        keyboardReason = error.message;
        onChange();
      }).finally(() => { permission = undefined; });
      return permission;
    },
    sendChord(keys, target) {
      if (keyboardReason) throw new Error(keyboardReason);
      return request('chord', { keys: keysyms(keys), expires: Date.now() + 1800,
        target: { id: target.id, windowId: target.windowId, appId: target.appId } }, 2500);
    },
    close() {
      stop();
      child.stdin.end();
      setTimeout(() => child.kill(), 1000).unref();
    },
  };
}

module.exports = { createPortalDesktop, foregroundContext };
