import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const bus = Gio.DBus.session;

export function call(name, path, api, method, signature = '()', fields = [], timeout = 1200) {
  return new Promise((resolve, reject) => {
    bus.call(name, path, api, method, new GLib.Variant(signature, fields), null, Gio.DBusCallFlags.NONE, timeout, null,
      (connection, result) => {
        try { resolve(connection.call_finish(result).deep_unpack()); }
        catch (error) { reject(error); }
      });
  });
}

export function delay(ms, callback) {
  return GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { callback(); return GLib.SOURCE_REMOVE; });
}
