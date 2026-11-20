// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { BUILT_IN_APP_VIEWS } = require('./app-view-catalog');
const { loadCustomViews, matchesCustomApp } = require('./custom-app-views');
const { writeAtomic } = require('./write-atomic');

function loadSettings(file, log) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (value?.version !== 1) throw new Error('Unrecognized app views settings');
    return value;
  } catch (err) {
    if (err.code !== 'ENOENT') log('Could not read app views settings:', err.message);
    return {};
  }
}

class AppViews {
  /**
   * @param {string} file
   * @param {{ views?: typeof BUILT_IN_APP_VIEWS, icon?: (name: string) => any,
   *   run?: (action: any, pageApps?: any, options?: Record<string, any>) => Promise<any>,
   *   providers?: Record<string, any>, log?: (...args: any[]) => void, customFile?: string, openConfig?: (file: string) => any,
   *   createWindows?: () => any, onUpdate?: (snapshot: any, focusChanged?: boolean) => void,
   *   actionHistory?: { run: (entry: Record<string, any>, execute: () => Promise<any>) => Promise<any> },
   *   windowIcons?: (entries: any[]) => Promise<any> }} [options]
   */
  constructor(file, { views = BUILT_IN_APP_VIEWS, icon = () => null, run = async () => ({ ok: false }),
    providers = {}, log = () => {}, customFile, openConfig, createWindows = () => null, onUpdate = () => {},
    actionHistory, windowIcons } = {}) {
    this.file = file;
    this.builtIn = views;
    this.icon = icon;
    this.run = run;
    this.providers = providers;
    this.log = log;
    this.customFile = customFile;
    this.openConfig = openConfig;
    this.createWindows = createWindows;
    this.onUpdate = onUpdate;
    this.actionHistory = actionHistory;
    this.windowIcons = windowIcons;
    this.custom = [];
    this.customError = null;
    const settings = loadSettings(file, log);
    this.settings = {
      version: 1,
      pinned: [...new Set(Array.isArray(settings.pinned) ? settings.pinned.filter((id) => typeof id === 'string') : [])],
      selected: typeof settings.selected === 'string' ? settings.selected : null,
      follow: settings.follow === true,
    };
    this.context = null;
    this.automatic = null;
    this.contextAllowed = true;
    if (this.customFile) this.watchCustom();
    this.loadCustom();
  }

  loadCustom() {
    if (this.customFile) {
      try {
        this.custom = loadCustomViews(this.customFile, this.builtIn.map(({ id }) => id));
        this.customError = null;
      } catch (err) {
        this.customError = err.message;
        this.log('Could not load custom app views:', err.message);
      }
    }
    this.views = new Map([...this.builtIn, ...this.custom].map((view) => [view.id, view]));
    this.contextFields = {
      appId: this.custom.some((view) => view.match.appId),
      title: this.custom.some((view) => view.match.title),
    };
    this.needsWindowContext = this.contextFields.appId || this.contextFields.title
      || this.custom.some((view) => view.match.executable?.includes('\\'));
  }

  watchCustom() {
    if (this.customWatcher) return;
    const directory = path.dirname(this.customFile);
    const key = (name) => process.platform === 'win32' ? name.toLowerCase() : name;
    const basename = key(path.basename(this.customFile));
    try {
      fs.mkdirSync(directory, { recursive: true });
      this.customWatcher = fs.watch(directory, { persistent: false }, (_event, filename) => {
        if (filename && key(filename) !== basename) return;
        clearTimeout(this.customTimer);
        this.customTimer = setTimeout(() => {
          this.loadCustom();
          const focusChanged = this.updateAutomatic() !== undefined;
          this.onUpdate(this.snapshot(), focusChanged);
        }, 150).unref();
      });
      this.customWatcher.on('error', (err) => {
        this.close();
        this.log('Could not watch custom app views:', err.message);
      });
    } catch (err) {
      this.log('Could not watch custom app views:', err.message);
    }
  }

  close() {
    clearTimeout(this.customTimer);
    this.customWatcher?.close();
    this.customWatcher = null;
  }

  windows() {
    if (this.nativeWindows === undefined) {
      try {
        this.nativeWindows = this.createWindows();
      } catch (err) {
        this.nativeWindows = null;
        this.log('App window data is unavailable:', err.message);
      }
    }
    return this.nativeWindows;
  }

  async editCustom() {
    if (!this.customFile || !this.openConfig) throw new Error('Custom app views are unavailable');
    fs.mkdirSync(path.dirname(this.customFile), { recursive: true });
    this.watchCustom();
    try {
      fs.writeFileSync(this.customFile, '{\n  "version": 1,\n  "views": []\n}\n', { flag: 'wx' });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    return this.openConfig(this.customFile);
  }

  snapshot() {
    const { follow } = this.settings;
    const pinned = this.settings.pinned.filter((id) => this.views.has(id));
    const selected = this.views.has(this.settings.selected) ? this.settings.selected : null;
    const listed = [...this.views.values()].map(({ id, name, category, summary, icon, commands, capabilities, widgets, provider, custom }) => ({
      id, name, category, summary, icon: this.icon(icon) || (custom ? this.icon('app-window') : null),
      capabilities, widgets: widgets ?? [], provider: provider ?? null, custom: Boolean(custom),
      commands: commands.map(({ id, label }) => ({ id, label })),
    }));
    const order = new Map(pinned.map((id, index) => [id, index]));
    listed.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity) || a.name.localeCompare(b.name, 'en'));
    return { views: listed, pinned, selected, follow, automatic: this.automatic, customError: this.customError };
  }

  observe(executable, allowed = true) {
    if (executable != null) this.context = executable;
    this.contextAllowed = allowed;
    return this.updateAutomatic();
  }

  updateAutomatic() {
    let next = null;
    if (this.contextAllowed && this.settings.follow) {
      const precise = this.needsWindowContext ? this.windows()?.foreground(this.contextFields) : null;
      const context = precise ?? { executable: this.context };
      next = this.custom.find((view) => matchesCustomApp(view.match, context))?.id
        ?? this.builtIn.find((view) => view.matches.includes(this.context))?.id ?? null;
    }
    if (next === this.automatic) return undefined;
    this.automatic = next;
    return next;
  }

  save(changes) {
    const settings = { ...this.settings, ...changes };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    writeAtomic(this.file, JSON.stringify(settings, null, 2) + '\n');
    this.settings = settings;
  }

  data(viewId) {
    const view = this.views.get(viewId);
    if (view?.custom) {
      const windows = this.windows();
      if (!windows) return { status: 'unavailable' };
      const entries = windows.list((window) => matchesCustomApp(view.match, window), Boolean(view.match.appId));
      if (!this.windowIcons || !entries.length) {
        return { status: 'available', windows: entries.map(({ id, title }) => ({ id, title })) };
      }
      return this.windowIcons(entries).then((icons) => {
        const fallback = this.icon(view.icon) || this.icon('app-window');
        const fallbackUrl = fallback ? `data:image/svg+xml;base64,${Buffer.from(fallback.replace(/currentColor/g, '#cad0d8')).toString('base64')}` : null;
        return { status: 'available', windows: entries.map(({ id, title }) => ({ id, title, icon: icons.get(id) || fallbackUrl })) };
      });
    }
    const provider = this.providers[view?.provider];
    return provider?.snapshot() ?? { status: 'unavailable' };
  }

  runCommand(view, label, execute) {
    return this.actionHistory
      ? this.actionHistory.run({ label, origin: 'app', context: view.name }, execute)
      : execute();
  }

  async change(command) {
    const view = this.views.get(command?.viewId);
    switch (command?.type) {
      case 'select': {
        const selected = command.viewId === null ? null : view?.id;
        if (selected === undefined) throw new Error('App view not found');
        if (this.settings.selected !== selected) this.save({ selected });
        break;
      }
      case 'pin': {
        if (!view || typeof command.pinned !== 'boolean') throw new Error('Invalid app view pin');
        const pinned = this.settings.pinned;
        if (pinned.includes(view.id) !== command.pinned) {
          this.save({ pinned: command.pinned ? [...pinned, view.id] : pinned.filter((id) => id !== view.id) });
        }
        break;
      }
      case 'follow':
        if (typeof command.enabled !== 'boolean') throw new Error('Invalid app view following setting');
        if (this.settings.follow !== command.enabled) this.save({ follow: command.enabled });
        this.updateAutomatic();
        break;
      case 'action': {
        const registered = view?.commands.find(({ id }) => id === command.actionId);
        if (!registered) throw new Error('App view command unavailable');
        return this.runCommand(view, registered.label, () => {
          const action = registered.action;
          if (view.custom && action.type === 'hotkey') {
            const focused = this.windows()?.foreground({ appId: Boolean(view.match.appId), title: Boolean(view.match.title) });
            if (!matchesCustomApp(view.match, focused)) throw new Error('Switch to a matching app window before using this shortcut');
          }
          return this.run(action, view.matches);
        });
      }
      case 'window': {
        if (!view?.custom || typeof command.windowId !== 'string' || !/^\d{1,10}:\d{1,20}$/.test(command.windowId)) {
          throw new Error('App window unavailable');
        }
        return this.runCommand(view, 'Switch window', () => {
          if (!this.windows()?.focus((window) => matchesCustomApp(view.match, window), command.windowId, Boolean(view.match.appId))) {
            throw new Error('Windows could not switch to that app window. It may have closed or moved.');
          }
          return { ok: true };
        });
      }
      case 'edit-custom':
        return this.editCustom();
      case 'provider': {
        const provider = this.providers[view?.provider];
        if (!provider?.change) throw new Error('App view commands are unavailable');
        return provider.change(command);
      }
      default:
        throw new Error('Unknown app view command');
    }
    return { ok: true, state: this.snapshot() };
  }
}

module.exports = { AppViews };
