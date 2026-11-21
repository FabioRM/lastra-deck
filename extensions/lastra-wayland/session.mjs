import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { delay } from './bus.mjs';
import { gnomeForeground, kdeForeground } from './foreground.mjs';
import { keyboardPortal } from './keyboard-portal.mjs';

const loop = new GLib.MainLoop(null, false);
let UnixInputStream;
try { UnixInputStream = globalThis.imports.gi.GioUnix.InputStream; }
catch { UnixInputStream = Gio.UnixInputStream; }
const input = new Gio.DataInputStream({ base_stream: new UnixInputStream({ fd: 0, close_fd: false }) });
const publish = (type, fields) => print(JSON.stringify({ type, ...fields }));
const keyboard = keyboardPortal((ready, error) => publish('keyboard', { ready, error }));
const kind = ARGV[0];
let foreground;
let initializing;
let closing = false;
let queue = Promise.resolve();

function desktop() {
  if (foreground) return Promise.resolve(foreground);
  if (!initializing) {
    initializing = (kind === 'kde' ? kdeForeground() : Promise.resolve(gnomeForeground()))
      .then((value) => { foreground = value; return value; }).finally(() => { initializing = undefined; });
  }
  return initializing;
}

async function poll() {
  try {
    const provider = await desktop();
    publish('focus', { window: await provider.read() });
  } catch (error) {
    const message = kind === 'kde' ? 'Lastra could not read the foreground window from KWin.' : error.message;
    publish('focus', { window: null, error: message });
  }
  if (!closing) delay(250, () => { void poll(); });
}

function sameWindow(expected, actual) {
  return actual?.appId && expected.id === actual.id && expected.windowId === actual.windowId
    && expected.appId === actual.appId.replace(/\.desktop$/i, '').toLowerCase();
}

async function chord({ keys, target, expires }) {
  if (!keyboard.ready) throw new Error('Authorize Wayland keyboard sharing before sending a shortcut.');
  if (!target || !Array.isArray(keys) || keys.length < 1 || keys.length > 6
      || keys.some((key) => !Number.isInteger(key) || key <= 0 || key > 0x7fffffff)) throw new Error('Invalid Wayland shortcut.');
  const provider = await desktop();
  if (provider.unlocked && !await provider.unlocked()) throw new Error('The desktop session is locked.');
  if (!sameWindow(target, await provider.read(true))) throw new Error('The shortcut target window changed.');
  if (closing || !(expires > Date.now())) throw new Error('The Wayland shortcut expired.');
  await keyboard.chord(keys);
}

async function run(message) {
  try {
    if (message.command === 'enable') {
      const provider = await desktop();
      await provider.read();
      await keyboard.enable();
    } else if (message.command === 'chord') await chord(message);
    else throw new Error('Unknown Wayland keyboard command.');
    publish('reply', { id: message.id });
  } catch (error) {
    publish('reply', { id: message.id, error: error.message });
  }
}

function receive() {
  input.read_line_async(GLib.PRIORITY_DEFAULT, null, (_input, result) => {
    try {
      const [line] = input.read_line_finish_utf8(result);
      if (line === null) { void close(); return; }
      const message = JSON.parse(line);
      if (message.command === 'enable') void run(message);
      else queue = queue.then(() => run(message));
      receive();
    } catch { void close(); }
  });
}

async function close() {
  if (closing) return;
  closing = true;
  try {
    await keyboard.close();
    await (foreground ?? await initializing?.catch(() => {}))?.close?.();
  } finally { loop.quit(); }
}

if (!['gnome', 'kde'].includes(kind)) throw new Error('Unsupported Wayland desktop.');
receive();
void poll();
loop.run();
