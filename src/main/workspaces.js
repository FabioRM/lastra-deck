// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: wait } = require('node:timers/promises');
const { expandEnv } = require('./actions');

const WORKSPACE_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const WINDOW_TIMEOUT = 6500;
const START_GRACE = 15_000;
const SETTLE_TIMEOUT = 750;
const POLL_MS = 150;

function localFile(value, extension, env) {
  const file = typeof value === 'string' && value.length <= 1024 ? expandEnv(value, env).trim() : '';
  if (!/^[a-z]:\\/i.test(file) || /[<>:"|?*\p{Cc}]/u.test(file.slice(2)) || path.win32.extname(file).toLowerCase() !== extension) {
    throw new Error(`Enter the full local ${extension} path`);
  }
  return path.win32.normalize(file);
}

function placement(raw) {
  if (raw === undefined) return null;
  const { display, x, y, width, height } = raw ?? {};
  if (display !== 'primary' && !Number.isSafeInteger(display)) throw new Error('Choose primary or a display ID');
  if (![x, y, width, height].every(Number.isFinite)
      || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
    throw new Error('Window placement must fit within the display work area using fractions from 0 to 1');
  }
  return { display, x, y, width, height };
}

function normalizeWorkspaces(config, env = process.env) {
  if (config?.version !== 1 || !Array.isArray(config.workspaces) || config.workspaces.length > 24) {
    throw new Error('Workspaces requires version 1 and a list of up to 24 workspaces');
  }
  const ids = new Set();
  return config.workspaces.map((entry) => {
    const { id, name, apps, powerToysShortcut } = entry ?? {};
    if (typeof id !== 'string' || !WORKSPACE_ID.test(id) || ids.has(id)) throw new Error('Use a unique lowercase workspace ID');
    ids.add(id);
    if (typeof name !== 'string' || !/^\P{Cc}{1,80}$/u.test(name.trim())) throw new Error('Enter a workspace name');
    if (powerToysShortcut !== undefined) {
      if (apps !== undefined) throw new Error('Choose apps or a PowerToys shortcut for the workspace');
      return { id, name: name.trim(), powerToysShortcut: localFile(powerToysShortcut, '.lnk', env) };
    }
    if (!Array.isArray(apps) || !apps.length || apps.length > 8) throw new Error('Choose 1 to 8 apps in each workspace');
    const targets = new Set();
    const entries = apps.map((app) => {
      const target = localFile(app?.target, '.exe', env);
      const identity = target.toLowerCase();
      if (targets.has(identity)) throw new Error('Use each executable once per workspace');
      targets.add(identity);
      const args = app.args ?? [];
      if (!Array.isArray(args) || args.length > 16 || args.some((arg) => typeof arg !== 'string' || arg.length > 1024 || arg.includes('\0'))) {
        throw new Error('App arguments must be a list of up to 16 strings');
      }
      return { target, identity, name: path.win32.basename(target), args, placement: placement(app.placement) };
    });
    return { id, name: name.trim(), apps: entries };
  });
}

function windowRect(workArea, position) {
  const left = Math.round(workArea.width * position.x);
  const top = Math.round(workArea.height * position.y);
  const right = Math.round(workArea.width * (position.x + position.width));
  const bottom = Math.round(workArea.height * (position.y + position.height));
  return { x: workArea.x + left, y: workArea.y + top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function confirmedBounds(actual, destination) {
  return actual && Object.keys(destination).every((key) => Math.abs(actual[key] - destination[key]) <= 2);
}

class Workspaces {
  constructor(file, { windows, displays, toScreenRect, run, openConfig, openShortcut = null, readShortcutLink,
    now = () => performance.now(), sleep = wait }) {
    this.file = file;
    this.windows = windows;
    this.displays = displays;
    this.toScreenRect = toScreenRect;
    this.run = run;
    this.openConfig = openConfig;
    this.openShortcut = openShortcut;
    this.readShortcutLink = readShortcutLink;
    this.now = now;
    this.sleep = sleep;
    this.starting = new Map();
  }

  entries() {
    try {
      return normalizeWorkspaces(JSON.parse(fs.readFileSync(this.file, 'utf8').replace(/^\uFEFF/, '')));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  snapshot() {
    const displays = this.displays().map(({ id, label, primary }) => ({ id, label, primary }));
    try {
      const entries = this.entries().map(({ id, name, apps }) => ({ id, name, apps: apps?.length }));
      return { status: 'available', displays, entries, running: this.running, last: this.last };
    } catch (error) {
      return { status: 'invalid', displays, error: error.message };
    }
  }

  /** @param {{ action?: string, id?: string }} [command] */
  async change({ action, id } = {}) {
    if (action === 'apply') return this.apply(id);
    if (action !== 'configure') throw new Error('Unknown workspace command');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    try {
      fs.writeFileSync(this.file, '{\n  "version": 1,\n  "workspaces": []\n}\n', { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    return this.openConfig(this.file);
  }

  async apply(id) {
    if (this.running) throw new Error('A workspace is already opening');
    const entry = this.entries().find((item) => item.id === id);
    if (!entry) throw new Error('Workspace is unavailable');
    this.running = id;
    try {
      if (entry.powerToysShortcut) {
        this.powerToysLink(entry.powerToysShortcut);
        const result = await this.run({ type: 'open', target: entry.powerToysShortcut });
        if (result.ok) this.last = { id, results: [{ name: entry.name, status: 'Sent to PowerToys Workspaces' }] };
        return result;
      }
      const windows = this.windows();
      if (!windows) throw new Error('Windows workspace placement is unavailable');
      const results = await Promise.all(entry.apps.map(async (app) => {
        try {
          const status = await this.restoreWindow(app, windows);
          return { name: app.name, status };
        } catch (error) {
          return { name: app.name, status: error.message, failed: true };
        }
      }));
      this.last = { id, results };
      const failures = results.filter(({ failed }) => failed);
      return failures.length
        ? { ok: false, message: failures.map(({ name, status }) => `${name}: ${status}`).join(' · ') }
        : { ok: true, message: `Restored ${entry.name}` };
    } finally {
      this.running = null;
    }
  }

  powerToysLink(file) {
    const link = this.readShortcutLink(file);
    if (path.win32.basename(link.target).toLowerCase() !== 'powertoys.workspaceslauncher.exe') {
      throw new Error('Choose a desktop shortcut created by PowerToys Workspaces');
    }
    return link;
  }

  externalLayout(entry) {
    if (!this.openShortcut) return null;
    try {
      const file = entry.powerToysShortcut;
      const shortcutStamp = this.launchStamp(file);
      if (!shortcutStamp) return null;
      const { target, args, cwd } = this.powerToysLink(file);
      const launcherStamp = this.launchStamp(target);
      return launcherStamp ? { file, target, args, cwd, shortcutStamp, launcherStamp } : null;
    } catch {
      return null;
    }
  }

  async applyExternal(plan, isCurrent) {
    const outcome = (status, attempted = 0) => ({ status, total: 1, attempted, confirmed: 0 });
    if (this.running || !isCurrent()) return outcome('unavailable');
    this.running = plan.entry.id;
    try {
      const error = await this.openShortcut(plan.external.file);
      if (error) return outcome('failed', 1);
      this.last = { id: plan.entry.id, results: [{ name: plan.entry.name, status: 'Sent to PowerToys Workspaces' }] };
      return outcome('unconfirmed', 1);
    } finally {
      this.running = null;
    }
  }

  async applyExisting(plan, isCurrent) {
    const total = plan.applications.length;
    const results = [];
    let attempted = 0;
    const report = (status) => ({ status, confirmed: results.filter(({ failed }) => !failed).length, total, attempted });
    if (plan.state !== 'ready' || this.running || !isCurrent()) return report('unavailable');
    const windows = this.windows();
    if (!windows?.workspaceWindows) return report('unavailable');
    this.running = plan.entry.id;
    const verify = () => { if (!isCurrent()) throw new Error('The approved workspace context changed'); };
    try {
      for (const { app, matches: [target], destination } of plan.applications) {
        try {
          verify();
          const resolve = () => {
            const current = windows.workspaceWindows([app.identity]);
            return current.length === 1 && current[0].id === target.id && current[0].path === app.identity ? current[0] : null;
          };
          const current = resolve();
          if (!current || current.minimized !== target.minimized || current.maximized !== target.maximized ||
              JSON.stringify(current.bounds) !== JSON.stringify(target.bounds)) throw new Error('The reviewed app window changed');
          verify();
          attempted++;
          const status = await this.showOrPlace(app, windows, target.id, true, destination, verify);
          if (!destination) {
            await this.confirmWindow(() => resolve()?.minimized === false, verify, 'Windows did not confirm the app was shown');
          }
          results.push({ name: app.name, status });
        } catch (error) {
          results.push({ name: app.name, status: error.message, failed: true });
          return report(!isCurrent() ? 'cancelled' : attempted ? 'unconfirmed' : 'unavailable');
        }
      }
      return report('confirmed');
    } finally {
      if (results.length) this.last = { id: plan.entry.id, results };
      this.running = null;
    }
  }

  launchStamp(target) {
    try {
      const resolved = fs.realpathSync.native(target);
      const stat = fs.statSync(resolved, { bigint: true });
      return stat.isFile() && /^[a-z]:\\/i.test(resolved) ? `${resolved}|${stat.dev}|${stat.ino}|${stat.size}|${stat.mtimeNs}` : null;
    } catch {
      return null;
    }
  }

  startingApp(identity) {
    return (this.starting.get(identity) ?? -Infinity) > this.now();
  }

  async performTarget(plan, isCurrent) {
    let attempted = 0;
    const report = (status) => ({ status, total: 1, attempted, confirmed: Number(status === 'confirmed') });
    const windows = this.windows();
    if (this.running || !windows?.workspaceWindows || !isCurrent()) return report('unavailable');
    const { app, operation } = plan;
    const verify = () => { if (!isCurrent()) throw new Error('The approved target changed'); };
    const matches = () => windows.workspaceWindows([app.identity]).filter(({ path }) => path === app.identity);
    this.running = plan.entry?.id ?? app.identity;
    try {
      if (operation === 'focus') {
        const prior = plan.window;
        const current = matches().find(({ id }) => id === prior.id);
        if (!current || current.minimized !== prior.minimized || current.maximized !== prior.maximized ||
            JSON.stringify(current.bounds) !== JSON.stringify(prior.bounds) || !windows.focusWindow || !windows.foreground) return report('unavailable');
        verify();
        attempted++;
        if (!windows.focusWindow(prior.id, app.identity)) return report('unconfirmed');
        await this.confirmWindow(() => {
          const active = windows.foreground({ appId: false, title: false });
          return active?.id === prior.id && active.path === app.identity;
        }, verify, 'The approved target did not take focus');
        return report('confirmed');
      }
      const time = this.now();
      for (const [identity, expires] of this.starting) if (expires <= time) this.starting.delete(identity);
      if (matches().length || this.startingApp(app.identity) || !plan.stamp || this.launchStamp(app.target) !== plan.stamp) return report('unavailable');
      verify();
      attempted++;
      const result = await this.run({ type: 'launch', target: app.target, args: app.args });
      if (!result.ok) return report('failed');
      this.starting.set(app.identity, this.now() + START_GRACE);
      const deadline = this.now() + WINDOW_TIMEOUT;
      do {
        await this.sleep(POLL_MS);
        verify();
        const observed = matches();
        if (observed.length > 1) return report('unconfirmed');
        if (observed.length === 1) {
          this.starting.delete(app.identity);
          return report('confirmed');
        }
      } while (this.now() < deadline);
      return report('unconfirmed');
    } catch {
      return report(!isCurrent() ? 'cancelled' : attempted ? 'unconfirmed' : 'unavailable');
    } finally {
      this.running = null;
    }
  }

  display(position) {
    const display = this.displays().find((item) => position.display === 'primary' ? item.primary : item.id === position.display);
    if (!display) throw new Error('The saved display is unavailable');
    return display;
  }

  async restoreWindow(app, windows) {
    const position = app.placement;
    if (position) this.display(position);
    const find = () => {
      const matches = windows.list((item) => item.path === app.identity, false);
      if (matches.length > 1) throw new Error('More than one matching window is open');
      return matches[0];
    };
    let window = find();
    const reused = Boolean(window);
    if (!window) {
      const time = this.now();
      for (const [key, retryAt] of this.starting) if (retryAt <= time) this.starting.delete(key);
      if (!this.starting.has(app.identity)) {
        const result = await this.run({ type: 'launch', target: app.target, args: app.args });
        if (!result.ok) throw new Error(result.message);
        this.starting.set(app.identity, this.now() + START_GRACE);
      }
      const deadline = this.now() + WINDOW_TIMEOUT;
      while (!window && this.now() < deadline) {
        await this.sleep(POLL_MS);
        window = find();
      }
      if (!window) throw new Error('No window appeared');
    }
    this.starting.delete(app.identity);
    const destination = position ? this.toScreenRect(windowRect(this.display(position).workArea, position)) : null;
    return this.showOrPlace(app, windows, window.id, reused, destination);
  }

  async showOrPlace(app, windows, id, reused, destination, verify = () => {}) {
    verify();
    if (!destination) {
      if (!windows.reveal(id, app.identity)) throw new Error('Windows could not show the app');
      return reused ? 'Reused' : 'Opened';
    }
    if (!windows.place(id, app.identity, destination)) throw new Error('Windows refused the placement');
    await this.confirmWindow(() => confirmedBounds(windows.bounds(id, app.identity), destination), verify,
      'The window did not settle at the saved position');
    return reused ? 'Reused and placed' : 'Opened and placed';
  }

  async confirmWindow(observed, verify, failure) {
    const deadline = this.now() + SETTLE_TIMEOUT;
    do {
      await this.sleep(POLL_MS);
      verify();
      if (observed()) return;
    } while (this.now() < deadline);
    throw new Error(failure);
  }
}

module.exports = { Workspaces, normalizeWorkspaces, windowRect };
