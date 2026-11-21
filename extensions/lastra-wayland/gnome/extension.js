import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const NAME = 'io.github.FabioRM.Lastra.Foreground';
const PATH = '/io/github/FabioRM/Lastra/Foreground';
const API = `<node><interface name="${NAME}">
  <method name="GetForeground"><arg type="s" direction="out"/></method>
</interface></node>`;

function foreground() {
    const shellFocus = global.stage.get_key_focus();
    if (Main.sessionMode.isLocked || Main.sessionMode.isGreeter || Main.overview.visible
        || (shellFocus && shellFocus !== global.stage)) return null;
    const window = global.display.focus_window;
    if (!window?.has_focus()) return null;
    const appId = window.get_wm_class() || window.get_gtk_application_id();
    if (!appId) return null;
    return { appId, windowId: String(window.get_stable_sequence()), id: window.get_pid(), title: window.get_title() };
}

export default class LastraForegroundExtension extends Extension {
    enable() {
        this.object = Gio.DBusExportedObject.wrapJSObject(API, { GetForeground: () => JSON.stringify(foreground()) });
        this.object.export(Gio.DBus.session, PATH);
        this.owner = Gio.bus_own_name_on_connection(Gio.DBus.session, NAME, Gio.BusNameOwnerFlags.DO_NOT_QUEUE, null, null);
    }

    disable() {
        Gio.bus_unown_name(this.owner);
        this.object.unexport();
        this.object = null;
    }
}
