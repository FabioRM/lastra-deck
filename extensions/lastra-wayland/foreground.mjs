import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { bus, call, delay } from './bus.mjs';

const PREFIX = 'io.github.FabioRM.Lastra';
const PATH = '/io/github/FabioRM/Lastra';
const GNOME = `${PREFIX}.Foreground`;
const KWIN = 'org.kde.KWin';
const SCRIPTING = 'org.kde.kwin.Scripting';
const OBSERVATION = `${PREFIX}.KWin`;
const LOCKER = 'org.freedesktop.ScreenSaver';
const REPORT = `<node><interface name="${OBSERVATION}">
  <method name="Observe"><arg type="s" direction="in"/></method>
</interface></node>`;

export function gnomeForeground() {
  return { async read() {
    try {
      const [json] = await call(GNOME, `${PATH}/Foreground`, GNOME, 'GetForeground');
      return JSON.parse(json);
    } catch { throw new Error('Enable the Lastra Wayland Profiles extension in GNOME Shell.'); }
  } };
}

// The private recipient is this helper's unique bus connection. Each reply requests a fresh
// snapshot on KWin's scripting thread. No window name or keyboard action is evaluated as code.
function kwinScript() {
  return `function observe() {
    const window = workspace.activeWindow;
    const appId = window && (window.resourceClass || window.desktopFileName);
    const state = appId && !window.desktopWindow && !window.dock
      ? { appId: String(appId), windowId: String(window.internalId), id: window.pid, title: window.caption } : null;
    callDBus(${JSON.stringify(bus.get_unique_name())}, '${PATH}/KWin', '${OBSERVATION}', 'Observe', JSON.stringify(state), observe);
  }
  observe();`;
}

export async function kdeForeground() {
  const [owner] = await call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'GetNameOwner', '(s)', [KWIN]);
  const scriptId = `lastra-wayland-${GLib.uuid_string_random()}`;
  const directory = GLib.dir_make_tmp('lastra-kwin-XXXXXX');
  const script = `${directory}/foreground.js`;
  let loaded = false;
  let pending;
  let timer = 0;
  let waiter;

  function nextSample() {
    if (timer) GLib.source_remove(timer);
    timer = 0;
    const invocation = pending;
    pending = null;
    invocation?.return_value(new GLib.Variant('()', []));
  }

  const object = Gio.DBusExportedObject.wrapJSObject(REPORT, {
    ObserveAsync([json], invocation) {
      if (invocation.get_sender() !== owner || pending) {
        invocation.return_dbus_error(`${OBSERVATION}.Rejected`, 'Only the current KWin bridge can report focus.');
        return;
      }
      let value;
      try { value = JSON.parse(json); }
      catch { invocation.return_dbus_error(`${OBSERVATION}.Invalid`, 'Invalid foreground sample.'); return; }
      pending = invocation;
      timer = delay(1000, () => { timer = 0; nextSample(); });
      waiter?.(value);
    },
  });
  object.export(bus, `${PATH}/KWin`);

  async function close() {
    if (loaded) {
      await call(owner, '/Scripting', SCRIPTING, 'unloadScript', '(s)', [scriptId], 400).catch(() => {});
      loaded = false;
    }
    nextSample();
    object.unexport();
    GLib.unlink(script);
    GLib.rmdir(directory);
  }

  try {
    GLib.file_set_contents(script, kwinScript());
    const [id] = await call(owner, '/Scripting', SCRIPTING, 'loadScript', '(ss)', [script, scriptId]);
    if (!Number.isInteger(id) || id < 0) throw new Error('KWin refused the Lastra foreground script.');
    loaded = true;
    await call(owner, `/Scripting/Script${id}`, 'org.kde.kwin.Script', 'run');
  } catch (error) { await close(); throw error; }

  let reading;
  return { close,
    async unlocked() {
      const [locked] = await call(LOCKER, '/ScreenSaver', LOCKER, 'GetActive');
      return locked === false;
    },
    read(fresh = false) {
      if (reading) return fresh ? reading.then(() => this.read()) : reading;
      reading = new Promise((resolve, reject) => {
        const timeout = delay(650, () => { waiter = undefined; reject(new Error('KWin is not reporting the foreground window.')); });
        waiter = (state) => {
          GLib.source_remove(timeout);
          waiter = undefined;
          resolve(state);
        };
        nextSample();
      }).finally(() => { reading = undefined; });
      return reading;
    },
  };
}
