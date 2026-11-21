import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { bus, call, delay } from './bus.mjs';

const NAME = 'org.freedesktop.portal.Desktop';
const PATH = '/org/freedesktop/portal/desktop';
const REMOTE = 'org.freedesktop.portal.RemoteDesktop';
const REQUEST = 'org.freedesktop.portal.Request';
const SESSION = 'org.freedesktop.portal.Session';
const KEYBOARD = 1;
const variant = (type, value) => new GLib.Variant(type, value);
const token = () => 'lastra_' + GLib.uuid_string_random().replaceAll('-', '');

async function request(method, signature, fields, options, timeout = 8000) {
  const handleToken = token();
  const sender = bus.get_unique_name().slice(1).replaceAll('.', '_');
  const expected = `${PATH}/request/${sender}/${handleToken}`;
  let subscription;
  let timer;
  const response = new Promise((resolve) => {
    subscription = bus.signal_subscribe(NAME, REQUEST, 'Response', expected, null, Gio.DBusSignalFlags.NONE,
      (_bus, _sender, _path, _api, _signal, parameters) => resolve(parameters.deep_unpack()));
    timer = delay(timeout, () => { timer = 0; resolve(null); });
  });
  try {
    const [handle] = await call(NAME, PATH, REMOTE, method, signature, [...fields, { ...options, handle_token: variant('s', handleToken) }], 3500);
    if (handle !== expected) throw new Error('The desktop portal returned an unexpected request handle.');
    const result = await response;
    if (!result) {
      void call(NAME, handle, REQUEST, 'Close').catch(() => {});
      throw new Error('The desktop keyboard permission request timed out.');
    }
    const [status, data] = result;
    if (status !== 0) throw new Error('Keyboard permission was declined or the desktop portal could not start it.');
    return data;
  } finally {
    bus.signal_unsubscribe(subscription);
    if (timer) GLib.source_remove(timer);
  }
}

export function keyboardPortal(changed) {
  let session;
  let subscription;
  let ready = false;

  function reset() {
    if (subscription) bus.signal_unsubscribe(subscription);
    const previous = session;
    session = subscription = undefined;
    ready = false;
    return previous;
  }

  async function close() {
    const previous = reset();
    if (previous) await call(NAME, previous, SESSION, 'Close', '()', [], 400).catch(() => {});
  }

  return { close,
    get ready() { return ready; },
    async enable() {
      if (ready) return;
      changed(false, 'Approve keyboard sharing in the desktop portal.');
      try {
        const result = await request('CreateSession', '(a{sv})', [], { session_handle_token: variant('s', token()) });
        session = result.session_handle?.deep_unpack();
        if (!session) throw new Error('The desktop portal did not create a keyboard session.');
        subscription = bus.signal_subscribe(NAME, SESSION, 'Closed', session, null, Gio.DBusSignalFlags.NONE, () => {
          reset();
          changed(false, 'The desktop closed keyboard sharing. Start Lastra with --enable-wayland-keyboard to reconnect.');
        });
        await request('SelectDevices', '(oa{sv})', [session], { types: variant('u', KEYBOARD) });
        const started = await request('Start', '(osa{sv})', [session, ''], {}, 120_000);
        if (!session || !(started.devices?.deep_unpack() & KEYBOARD)) throw new Error('The desktop portal did not grant keyboard access.');
        ready = true;
        changed(true);
      } catch (error) {
        await close();
        throw error;
      }
    },
    async chord(keys) {
      if (!ready) throw new Error('Authorize Wayland keyboard sharing before sending a shortcut.');
      const current = session;
      const keysym = (symbol, pressed) => call(NAME, PATH, REMOTE, 'NotifyKeyboardKeysym', '(oa{sv}iu)', [current, {}, symbol, pressed], 350);
      const down = [];
      let pressFailure;
      try {
        for (const key of keys) {
          if (session !== current) throw new Error('The desktop closed keyboard sharing.');
          down.push(key);
          await keysym(key, 1);
        }
      } catch (error) { pressFailure = error; }
      let releaseFailure;
      for (const key of down.reverse()) {
        try { await keysym(key, 0); } catch (error) { releaseFailure = error; }
      }
      if (releaseFailure && session === current) {
        await close();
        changed(false, 'The desktop keyboard session ended after a key could not be released.');
      }
      if (pressFailure || releaseFailure) throw pressFailure ?? releaseFailure;
    },
  };
}
