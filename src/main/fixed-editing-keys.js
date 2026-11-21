// @ts-check
'use strict';

const { FIXED_EDITING_KEYS, STANDARD_EDITING_CHORDS } = require('../shared/editing-keys');
const { catalog } = require('./shortcut-catalog');
const { packFor, packKeys, isInstalledWebApp } = require('./shortcut-packs');
const { LINUX_TERMINALS } = require('./shortcut-packs-linux');
const { US_LAYOUT, shortcutUnavailable } = require('./shortcut-guards');
const { annotateShortcut } = require('./shortcut-overrides');
const { withShortcutOverride } = require('../shared/shortcut-library');

const SHIFT_REDO = new Set(['photoshop', 'photoshop-web', 'illustrator', 'premiere', 'kicad', 'kicad-schematic',
  'kicad-footprint', 'kicad-symbol']);
const CONSOLES = new Set(['cmd.exe', 'powershell.exe', 'pwsh.exe', 'conhost.exe', 'openconsole.exe',
  'wsl.exe', 'wslhost.exe', 'wt.exe', 'mintty.exe', 'git-bash.exe']);
const REQUIRED_MODE = {
  photoshop: 'the Photoshop workspace',
  vscode: 'the VS Code editor',
  cursor: 'the Cursor editor',
};
/** Reviewed JSON binding rows by app id. @type {Map<string, any[]>} */
const CATALOG = new Map(catalog.apps.map((app) => [app.id, app.bindings]));

/** @typedef {{ chord?: string, guard?: any, unavailable?: string }} EditBinding */

function packGuard(pack, requirements = {}) {
  return { pack: pack.id, application: pack.name, platform: pack.platform ?? (pack.sites ? 'web' : 'windows'), ...requirements };
}

function bindingMode(pack, mode) {
  if (mode === 'document-editor') return `the ${pack.name} document editor`;
  if (mode === 'worksheet') return 'an Excel worksheet';
  return mode;
}

/** @returns {EditBinding | null} */
function reviewedBinding(command, pack, settings) {
  const bindings = CATALOG.get(pack.id)?.filter((entry) => entry.id === command && entry.hostPlatform === 'windows'
    && entry.platform === (pack.sites ? 'web' : 'windows'));
  if (!bindings?.length) return null;
  const language = settings.shortcutLanguage;
  const relevant = bindings.filter((entry) => !entry.language || entry.language === language || !language);
  if (!relevant.length) {
    return bindings.some((entry) => entry.verification.status === 'documented')
      ? { unavailable: 'No reviewed binding is available for the selected shortcut language.' } : null;
  }
  const disputed = relevant.find(({ verification }) => verification.status === 'ambiguous');
  if (disputed) return { unavailable: disputed.unavailable ?? 'The documented shortcut is ambiguous.' };
  const reviewed = relevant.map((entry) => {
    if (entry.verification.status !== 'documented' || !entry.chord || entry.unavailable) {
      return { unavailable: entry.unavailable ?? 'The shortcut binding is awaiting verification.' };
    }
    if (entry.appVersion) return { unavailable: 'Requires a verified app version.' };
    if (entry.layout && entry.layout !== 'US') return { unavailable: 'Requires keyboard layout verification.' };
    if (entry.language && !['en-US', 'it-IT'].includes(entry.language)) return { unavailable: 'Requires a supported shortcut language.' };
    const mode = entry.mode ? bindingMode(pack, entry.mode) : pack.editingMode;
    const guard = packGuard(pack, {
      ...(mode ? { mode } : {}),
      ...(entry.layout ? { layout: US_LAYOUT } : {}),
      ...(entry.language ? { language: entry.language } : {}),
      ...(entry.windowsBuild ? { minBuild: entry.windowsBuild } : {}),
    });
    const candidate = annotateShortcut(pack, { binding: entry, action: { type: 'hotkey', keys: entry.chord, shortcutGuard: guard } });
    const { action } = withShortcutOverride(candidate, settings.shortcutOverrides);
    return { chord: action.keys, guard: action.shortcutGuard, unavailable: shortcutUnavailable(action.shortcutGuard, settings) };
  });
  const available = reviewed.filter((item) => !item.unavailable);
  if (new Set(available.map(({ chord }) => chord.toLowerCase())).size > 1) return { unavailable: 'Several reviewed bindings match this context.' };
  return available[0] ?? reviewed[0];
}

/** @returns {EditBinding} */
function editBinding(command, pack, settings) {
  const { context, shortcutLanguage, shortcutOverrides } = settings;
  if (pack?.id === 'terminal') {
    if (command === 'cut') return { unavailable: 'Windows Terminal has no verified Cut shortcut.' };
    if (command === 'undo' || command === 'redo') return { unavailable: 'Windows Terminal has no verified editing-history shortcut.' };
    const variant = packKeys(pack, { ...context, shortcutLanguage, shortcutOverrides })
      .find(({ id }) => id === (command === 'copy' ? 'copy-selection' : command));
    // Without a selection Windows Terminal passes its Copy chord to the shell.
    const guard = packGuard(pack, { ...variant?.action?.shortcutGuard,
      ...(command === 'copy' ? { mode: 'a verified Windows Terminal text selection' } : {}) });
    return { chord: variant?.action?.keys, guard, unavailable: shortcutUnavailable(guard, settings) };
  }
  if (CONSOLES.has(context.executable.toLowerCase())) return { unavailable: 'A verified editing shortcut is unavailable in this console.' };
  if (!pack && context.platform === 'linux' && LINUX_TERMINALS.has(context.appId)) {
    return { unavailable: 'Configure an editing shortcut for this terminal in a custom app page.' };
  }
  if (!pack) {
    return isInstalledWebApp(context) ? { unavailable: 'The installed web app is unverified.' } : { chord: STANDARD_EDITING_CHORDS[command] };
  }
  const reviewed = reviewedBinding(command, pack, settings);
  if (reviewed) return reviewed;
  if (pack.id === 'sumatrapdf' && command !== 'copy') {
    return { unavailable: 'No verified editing shortcut is available in the SumatraPDF reader.' };
  }
  const variant = packKeys(pack, { ...context, shortcutLanguage, shortcutOverrides })
    .find(({ id, action }) => id === command && action?.type === 'hotkey');
  if (!variant && pack.editing === false) return { unavailable: 'No verified editing shortcut is available in this app.' };
  const chord = variant?.action.keys ?? (command === 'redo' && SHIFT_REDO.has(pack.id) ? 'Ctrl+Shift+Z' : STANDARD_EDITING_CHORDS[command]);
  const mode = pack.editingMode ?? REQUIRED_MODE[pack.id];
  const guard = mode ? packGuard(pack, { ...variant?.action.shortcutGuard, mode }) : variant?.action.shortcutGuard ?? packGuard(pack);
  return { chord, guard, unavailable: shortcutUnavailable(guard, settings) };
}

function fixedEditingKeys(profile, context, { pageActive = true, platform = process.platform } = {}) {
  const pack = packFor(context, profile.webApps);
  const { shortcutLanguage, shortcutOverrides } = profile;
  const settings = { context, activePack: pack, shortcutLanguage, shortcutOverrides, platform };
  const reason = !['win32', 'linux'].includes(platform) ? 'Requires Windows or Linux.' : !pageActive ? 'The target window is unavailable.'
    : context?.windowId == null || context.shell || !(platform === 'linux' ? context.appId : context.executable)
      ? 'Bring a verified app window to the foreground.' : undefined;
  return FIXED_EDITING_KEYS.map((/** @type {{ id: string, label: string, icon: string }} */ key) => {
    const command = key.id.slice('edit:'.length);
    const { chord, guard, unavailable = chord ? undefined : 'No verified shortcut binding is available.' } = reason
      ? { unavailable: reason } : editBinding(command, pack, settings);
    return { ...key, category: 'system', ...(chord ? { shortcut: chord } : {}), ...(guard?.confirm ? { confirm: true } : {}),
      ...(unavailable ? { unavailable } : {}),
      ...(!unavailable && chord ? { action: { type: 'hotkey', keys: chord, ...(guard ? { shortcutGuard: guard } : {}) } } : {}),
    };
  });
}

module.exports = { fixedEditingKeys };
