// @ts-check
'use strict';

const path = require('node:path');
const { createHash } = require('node:crypto');
const { packFor, groupedPackKeys, isInstalledWebApp } = require('./shortcut-packs');
const { applyShortcutPages } = require('../shared/shortcut-layouts');

const SHORTCUTS = [
  ['find', 'Find', 'search', 'Ctrl+F'],
  ['copy', 'Copy', 'copy', 'Ctrl+C'],
  ['paste', 'Paste', 'clipboard', 'Ctrl+V'],
  ['select-all', 'Select all', 'text-select', 'Ctrl+A'],
  ['undo', 'Undo', 'undo-2', 'Ctrl+Z'],
];
const TERMINAL_SHORTCUTS = [
  ['find', 'Find', 'search', 'Ctrl+Shift+F'],
  ['copy', 'Copy', 'copy', 'Ctrl+Shift+C'],
  ['paste', 'Paste', 'clipboard', 'Ctrl+Shift+V'],
];
const TERMINALS = new Set(['windowsterminal.exe', 'windowsterminalpreview.exe', 'wt.exe', 'openconsole.exe',
  'conhost.exe', 'cmd.exe', 'powershell.exe', 'pwsh.exe']);
const DISPLAY_NAMES = new Map([
  ['explorer.exe', 'File Explorer'], ['windowsterminal.exe', 'Windows Terminal'],
  ['powershell.exe', 'Windows PowerShell'], ['pwsh.exe', 'PowerShell'], ['cmd.exe', 'Command Prompt'],
  ['msedge.exe', 'Microsoft Edge'], ['chrome.exe', 'Google Chrome'], ['firefox.exe', 'Firefox'],
  ['ms-teams.exe', 'Microsoft Teams'], ['chatgpt.exe', 'ChatGPT'],
  ['systemsettings.exe', 'Windows Settings'], ['notepad.exe', 'Notepad'], ['code.exe', 'Visual Studio Code'],
]);
const HOST_EXECUTABLES = new Set(['applicationframehost.exe', 'wwahost.exe']);
const PACKAGE_NAMES = new Map([['windowscalculator', 'Calculator'], ['windowsnotepad', 'Notepad']]);

function contextFor(value) {
  const input = typeof value === 'string' ? { executable: value } : value;
  if (input?.shell) return null;
  const executable = typeof input?.executable === 'string' && /\.exe$/i.test(input.executable)
    ? input.executable.toLowerCase() : '';
  const executablePath = typeof input?.path === 'string' ? input.path.toLowerCase() : '';
  const appId = typeof input?.appId === 'string' ? input.appId.toLowerCase() : '';
  if (!appId && (!executable || HOST_EXECUTABLES.has(executable))) return null;
  return { executable, appId, path: executablePath, identity: JSON.stringify([executablePath || executable, appId]),
    id: input.id, windowId: input.windowId, keyboardLayout: input.keyboardLayout, keyboardHandle: input.keyboardHandle,
    mode: input.mode, title: input.title,
    originalName: typeof input.name === 'string' ? input.name : executable };
}

function sameWindow(expected, actual) {
  return expected?.windowId != null && expected.identity === actual?.identity
    && expected.windowId === actual.windowId && expected.id === actual.id;
}

function displayName(context) {
  const packaged = context.appId.split('!')[0].split('_')[0].split('.').at(-1);
  const usePackage = packaged && context.appId.includes('!') && (!context.executable || HOST_EXECUTABLES.has(context.executable));
  const known = usePackage ? PACKAGE_NAMES.get(packaged) : DISPLAY_NAMES.get(context.executable);
  if (known) return known;
  const raw = usePackage ? packaged : path.win32.basename(context.originalName || context.appId, '.exe').replace(/\.exe$/i, '');
  const spaced = raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!spaced) return 'Foreground app';
  return (spaced[0].toUpperCase() + spaced.slice(1)).slice(0, 48);
}

function generatedPage(context, grid, { shortcutLanguage, shortcutOverrides }, pack, custom) {
  const id = 'auto:' + createHash('sha256').update(context.identity).digest('hex').slice(0, 20);
  const choices = TERMINALS.has(context.executable) ? TERMINAL_SHORTCUTS : SHORTCUTS;
  const generic = () => choices.map(([key, label, icon, chord]) => ({
    id: key, label, icon, category: 'app', action: { type: 'hotkey', keys: chord },
  }));
  const keys = pack ? groupedPackKeys(pack, { ...context, shortcutLanguage, shortcutOverrides }) : generic().slice(0, grid.cols * grid.rows);
  return { id, name: pack?.name ?? displayName(context), pack: pack?.id,
    apps: context.executable ? [context.executable] : [], keys: custom ? applyShortcutPages(custom, keys) : keys, widgets: [],
    ...(custom ? { shortcutPages: custom.map(({ id, name }) => ({ id, name })) } : {}),
    generated: true, target: context.identity };
}

function titleMatches(rule, title) {
  if (!rule) return true;
  if (typeof title !== 'string') return false;
  const text = title.toLowerCase();
  const value = rule.value.toLowerCase();
  if (rule.mode === 'exact') return text === value;
  if (rule.mode === 'starts-with') return text.startsWith(value);
  return text.includes(value);
}

function matchScore(page, context) {
  if (!context || !titleMatches(page.windowTitle, context.title)) return 0;
  const appId = page.appIds?.includes(context.appId);
  const executable = !isInstalledWebApp(context) && page.apps.includes(context.executable);
  if (!appId && !executable) return 0;
  const specificity = { contains: 1, 'starts-with': 2, exact: 3 }[page.windowTitle?.mode] ?? 0;
  return ((page.priority ?? 0) + 100) * 10 + specificity * 2 + (appId ? 2 : 1);
}

function runPageAction(page, action, runner, readForeground, binding, current = () => true, options) {
  const changed = () => current() ? undefined : 'The deck page or target window changed.';
  if (!page.generated && !page.apps.length && !page.appIds?.length) {
    if (options?.shortcutTarget === undefined) return runner.run(action, page.apps, options);
    return runner.run(action, page.apps, { ...options, guard: () => options?.guard?.() ?? changed() });
  }
  const target = binding?.target;
  const unavailable = 'The target window for ' + page.name + ' is unavailable. Bring it to the foreground.';
  const guard = () => {
    const blocked = options?.guard?.() ?? changed();
    if (blocked) return blocked;
    const foreground = contextFor(readForeground.context?.({ fresh: true }));
    if (!sameWindow(target, foreground) || readForeground.windowId?.() !== target.windowId) return unavailable;
    if (page.windowTitle && (!titleMatches(page.windowTitle, foreground.title) || target.title !== foreground.title)) {
      return 'The target window title changed.';
    }
    if (page.pack && target.keyboardLayout !== foreground.keyboardLayout) return 'The foreground keyboard layout changed.';
    if (target.mode !== foreground.mode) return 'The active app surface changed.';
  };
  return runner.run(action, [], { ...options, guard });
}

class Pages {
  constructor() {
    this.manual = null;
    this.locked = false;
    this.foreground = null;
    this.revision = 0;
  }

  manualPage(profile) {
    return profile.pages.find((page) => page.id === this.manual) ?? profile.pages[0];
  }

  restore(profile, { page, locked, manualPage = page }, { contextOnly = false, contextReturn = 'manual' } = {}) {
    const hasPage = (wanted) => profile.pages.some(({ id }) => id === wanted);
    this.manual = hasPage(manualPage) ? manualPage : null;
    this.locked = locked;
    this.lockedId = locked ? (hasPage(page) ? page : this.manualPage(profile).id) : null;
    this.lockedContext = this.lockedBinding = this.overriddenFor = this.generated = undefined;
    this.contextOnly = contextOnly;
    this.contextReturn = contextReturn;
    this.returningFromContext = false;
  }

  setContextReturn(mode) {
    this.contextReturn = mode;
  }

  contextFallback(profile) {
    return this.contextReturn === 'home' && this.returningFromContext ? profile.pages[0] : this.manualPage(profile);
  }

  automaticPage(profile, app) {
    const { cols, rows } = profile.grid;
    const pack = packFor(app, profile.webApps);
    const custom = pack && profile.shortcutLayouts?.[pack.id];
    if (custom?.enabled === false || (this.contextOnly && custom?.enabled !== true)) return null;
    const key = JSON.stringify([app.identity, cols, rows, app.keyboardLayout, app.mode, profile.shortcutLanguage, pack?.id,
      profile.shortcutOverrides, custom?.pages]);
    if (this.generated?.key !== key) this.generated = { key, page: generatedPage(app, profile.grid, profile, pack, custom?.pages) };
    return this.generated.page;
  }

  selection(profile) {
    if (this.locked) {
      if (this.lockedContext) {
        if (sameWindow(this.lockedContext, this.foreground)) this.lockedContext = this.foreground;
        return { page: this.automaticPage(profile, this.lockedContext) ?? this.manualPage(profile), reason: 'locked' };
      }
      return { page: profile.pages.find((page) => page.id === this.lockedId) ?? this.manualPage(profile), reason: 'locked' };
    }
    if (!this.foreground || this.foreground.identity === this.overriddenFor) return { page: this.contextFallback(profile), reason: 'manual' };
    let linked;
    let highest = 0;
    for (const page of profile.pages) {
      const score = matchScore(page, this.foreground);
      if (score <= highest) continue;
      highest = score;
      linked = page;
    }
    if (linked) {
      this.returningFromContext = true;
      return { page: linked, reason: linked.windowTitle ? 'title' : linked.appIds?.includes(this.foreground.appId) ? 'app-id' : 'executable' };
    }
    const page = this.automaticPage(profile, this.foreground);
    if (!page) return { page: this.contextFallback(profile), reason: 'manual' };
    this.returningFromContext = true;
    return { page, reason: page.pack ? 'pack' : 'generic' };
  }

  current(profile) {
    return this.selection(profile).page;
  }

  select(profile, id) {
    if (!profile.pages.some((page) => page.id === id)) throw new Error('Page not found');
    this.manual = id;
    this.returningFromContext = false;
    this.overriddenFor = this.foreground?.identity;
    if (this.locked) {
      this.lockedId = id;
      this.lockedContext = null;
      this.lockedBinding = null;
    }
  }

  observe(window) {
    // Keep the last app context while the Lastra editor has focus.
    this.foregroundPresent = window != null;
    if (!this.foregroundPresent) return;
    const context = contextFor(window);
    const changedApp = context?.identity !== this.foreground?.identity;
    this.foreground = context;
    this.foregroundWindow = window.id ?? window.windowId ?? null;
    if (changedApp) this.overriddenFor = undefined;
  }

  binding(page) {
    if (!page.generated && !page.apps.length && !page.appIds?.length) return { active: true };
    const matches = (target) => page.generated ? target?.identity === page.target : matchScore(page, target) > 0;
    const foreground = matches(this.foreground) ? this.foreground : null;
    if (!this.locked) return { target: foreground, active: this.foregroundPresent && foreground?.windowId != null };
    if (!matches(this.lockedBinding) || sameWindow(this.lockedBinding, foreground)) this.lockedBinding = foreground;
    const target = this.lockedBinding ?? null;
    return { target, active: this.foregroundPresent && sameWindow(target, foreground) };
  }

  get savedPage() {
    return this.locked && this.lockedId ? this.lockedId : this.manual;
  }

  get following() {
    return !this.locked && this.overriddenFor === undefined;
  }

  follow(profile) {
    if (this.locked) this.toggleLock(profile);
    this.overriddenFor = undefined;
  }

  toggleLock(profile) {
    if (!this.locked) {
      const page = this.current(profile);
      this.lockedId = page.generated ? null : page.id;
      this.lockedContext = page.generated ? this.foreground : null;
      this.lockedBinding = this.binding(page).target;
    } else {
      this.lockedId = this.lockedContext = null;
      this.lockedBinding = null;
    }
    this.locked = !this.locked;
    this.overriddenFor = undefined;
  }
}

module.exports = { Pages, runPageAction };
