// @ts-check
'use strict';

// Validate and watch the profile JSON for changes. The deck view contains
// key IDs, labels and icons. Commands stay in the main process.

const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const { writeAtomic } = require('./write-atomic');
const { retireStockPages, compactStockHome, retireHomeAppMicrophones } = require('./retired-stock-pages');
const { normalizeWidgetInstances, BAR_GRID } = require('./widgets');
const { embeddedImageDataUrl } = require('./icons');
const { normalizeCompositionPresets } = require('../shared/widget-composition');
const { toView, confirmationMode } = require('../shared/deck-view');
const { conditionFields, waitFields, repeatFields, choiceFields, randomFields, delayMs, stepPolicy } = require('../shared/action-flow');
const { keyLayout, occupiedCells, canPlace, cells } = require('../shared/widget-layout');
const { normalizeWebApp, chromiumWebAppId } = require('./shortcut-packs-web');
const { READOUTS } = require('../shared/key-readouts');
const { validShortcutGuard, shortcutNeedsConfirmation } = require('./shortcut-guards');
const { validateShortcutOverrides } = require('./shortcut-overrides');
const { CONTROL_FIELDS, MAX_CONTROLS, canRepeatTap, controlFields, sceneTarget } = require('../shared/linked-controls');
const { MacroError } = require('../shared/parameterized-macros');
const { ExpressionError } = require('../shared/value-expressions');
const { createProfileKeys } = require('../shared/profile-keys');
const { timerFields } = require('../shared/timers');
const { soundFields } = require('../shared/sounds');
const { parseCombo, mediaKey } = require('./actions/keys');

const ACTION_TYPES = new Set(['launch', 'open', 'workspace', 'hotkey', 'media', 'spotify-playback', 'obs-scene', 'text', 'delay', 'wait-for', 'if', 'sequence', 'repeat', 'choose', 'random', 'audio', 'timer', 'sound', 'macro']);
const CATEGORIES = new Set(['app', 'media', 'system', 'meeting']);
const MAX_COLS = 12;
const MAX_ROWS = 6;
const PROFILE_HISTORY_LIMIT = 10;
// Only the unmodified 0.2 stock profile qualifies for the language upgrade.
const LEGACY_STOCK_PROFILE_HASH = 'e8ae3e69c367063cfbb31c3789928025edfcfecaab817ce320f3923d31cd756a';
const AUTO_PAGES_BACKUP = '.before-automatic-pages.bak';
const HOME_LAYOUT_BACKUP = '.before-compact-home.bak';
const HOME_MIC_BACKUP = '.before-home-mic-removal.bak';
/** @type {[(text: string) => string | null | undefined | false, string][]} */
const STOCK_LAYOUT_UPGRADES = [
  [retireStockPages, AUTO_PAGES_BACKUP], [compactStockHome, HOME_LAYOUT_BACKUP], [retireHomeAppMicrophones, HOME_MIC_BACKUP],
];
const GESTURE_OPTIONS = {
  holdMs: { label: 'Long press (ms)', value: 550, min: 150, max: 3000 },
  doubleTapMs: { label: 'Double tap (ms)', value: 320, min: 150, max: 1000 },
  confirmMs: { label: 'Hold to confirm (ms)', value: 650, min: 250, max: 3000 },
  cancelDistance: { label: 'Cancel after moving (px)', value: 18, min: 5, max: 64 },
};

function fail(msg, code) {
  const error = /** @type {Error & { code?: string }} */ (new Error(`Invalid profile: ${msg}`));
  if (code) error.code = code;
  throw error;
}

const VALID_ID = /^[a-z0-9_-]{1,40}$/i;
const MAX_PAGES = 16;
const EXECUTABLE_NAME = /^[^\\/:*?"<>|\x00-\x1f]+\.exe$/i;
const APP_ID = /^[a-z0-9][a-z0-9._!{}-]{0,190}$/i;
const WINDOW_TITLE_MODES = new Set(['contains', 'starts-with', 'exact']);

function isExecutableName(value) {
  return typeof value === 'string' && EXECUTABLE_NAME.test(value.trim());
}

function checkAction(action, where, depth = 0, step = false, expanded = false, insideRepeat = false) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) fail(`${where}: missing action`);
  if (!ACTION_TYPES.has(action.type)) {
    fail(`${where}: unknown action type "${action.type}" (use ${[...ACTION_TYPES].join(', ')})`);
  }
  let options;
  let pool;
  try {
    if (step) stepPolicy(action);
    if (action.type === 'wait-for') waitFields(action);
    if (action.type === 'if') conditionFields(action);
    if (action.type === 'repeat') repeatFields(action);
    if (action.type === 'choose') options = choiceFields(action).options;
    if (action.type === 'random') pool = randomFields(action).pool;
    if (action.type === 'obs-scene') sceneTarget(action);
    if (action.type === 'timer') timerFields(action);
    if (action.type === 'sound') soundFields(action);
    if (expanded && action.type === 'delay') delayMs(action);
    if (expanded && action.type === 'hotkey') parseCombo(action.keys);
    if (expanded && action.type === 'media') mediaKey(action.key);
    if (expanded && ['launch', 'open', 'text', 'workspace'].includes(action.type)) {
      const field = ['text', 'workspace'].includes(action.type) ? action.type : 'target';
      if (typeof action[field] !== 'string' || !action[field].trim()) throw new Error(`Enter a nonempty ${field}.`);
    }
    if (expanded && action.type === 'launch' && action.args !== undefined &&
        (!Array.isArray(action.args) || action.args.some((argument) => typeof argument !== 'string'))) {
      throw new Error('Each launch argument must be a string.');
    }
  } catch (err) {
    fail(`${where}: ${err.message}`);
  }
  if (action.type === 'sequence' || action.type === 'repeat') {
    if (depth >= 3) fail(`${where}: too many nested ${action.type} blocks`);
    if (action.type === 'repeat' && insideRepeat) fail(`${where}: a repeat cannot contain another repeat`);
    if (!Array.isArray(action.steps) || action.steps.length < 1 || action.steps.length > 20) {
      fail(`${where}: a ${action.type} must contain 1 to 20 steps`);
    }
    action.steps.forEach((s, i) => checkAction(s, `${where}, step ${i + 1}`, depth + 1, true, expanded, insideRepeat || action.type === 'repeat'));
  }
  if (action.type === 'if') {
    if (depth >= 3) fail(`${where}: too many nested conditions`);
    checkAction(action.then, `${where}, if matched`, depth + 1, false, expanded, insideRepeat);
    if (action.else !== undefined) checkAction(action.else, `${where}, otherwise`, depth + 1, false, expanded, insideRepeat);
  }
  if (options) {
    if (depth >= 3) fail(`${where}: too many nested choice prompts`);
    options.forEach((choice, index) => checkAction(choice.action, `${where}, choice ${index + 1}`, depth + 1, false, expanded, insideRepeat));
  }
  if (pool) {
    if (depth >= 3) fail(`${where}: too many nested random actions`);
    pool.forEach((option, index) => checkAction(option, `${where}, option ${index + 1}`, depth + 1, false, expanded, insideRepeat));
  }
  if (action.type === 'audio' && !['output', 'microphone'].includes(action.device)) {
    fail(`${where}: use output or microphone for the audio action`);
  }
  if (action.type === 'launch' && action.reuseWindow !== undefined && typeof action.reuseWindow !== 'boolean') {
    fail(`${where}: "reuseWindow" must be true or false`);
  }
  if (action.type === 'workspace' && (typeof action.workspace !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(action.workspace))) {
    fail(`${where}: enter the lowercase ID of a configured workspace`);
  }
  if (['hotkey', 'text'].includes(action.type) && action.targetApps !== undefined
      && (!Array.isArray(action.targetApps) || !action.targetApps.length || !action.targetApps.every(isExecutableName))) {
    fail(`${where}: targetApps must list executable names such as Code.exe`);
  }
  if (action.requiresPhotoshopWorkspace !== undefined
      && (action.type !== 'hotkey' || typeof action.requiresPhotoshopWorkspace !== 'boolean')) {
    fail(`${where}: requiresPhotoshopWorkspace must be true or false on a hotkey`);
  }
  if (action.shortcutGuard !== undefined && (!['hotkey', 'spotify-playback'].includes(action.type)
      || !validShortcutGuard(action.shortcutGuard))) fail(`${where}: invalid shortcut requirements`);
  if (action.notation !== undefined && (action.type !== 'hotkey' || typeof action.notation !== 'string'
      || !/^\P{Cc}{1,160}$/u.test(action.notation))) fail(`${where}: invalid source shortcut notation`);
}

function validateGrid(value, label = 'grid', fallback = { cols: 8, rows: 3 }) {
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) fail(`${label} must be an object`);
  const cols = Number(value?.cols ?? fallback.cols);
  const rows = Number(value?.rows ?? fallback.rows);
  if (!Number.isInteger(cols) || cols < 1 || cols > MAX_COLS) fail(`${label}.cols must be between 1 and ${MAX_COLS}`);
  if (!Number.isInteger(rows) || rows < 1 || rows > MAX_ROWS) fail(`${label}.rows must be between 1 and ${MAX_ROWS}`);
  return { cols, rows };
}

function validateGestures(raw) {
  if (raw !== undefined && (!raw || typeof raw !== 'object' || Array.isArray(raw))) {
    fail('"gestures" must be an object');
  }
  return Object.fromEntries(Object.entries(GESTURE_OPTIONS).map(([key, options]) => {
    const value = Object.hasOwn(raw ?? {}, key) ? raw[key] : options.value;
    if (!Number.isInteger(value) || value < options.min || value > options.max) {
      fail(`gestures.${key} must be an integer between ${options.min} and ${options.max}`);
    }
    return [key, value];
  }));
}

function checkConfirmation(value, where) {
  if (value === undefined || typeof value === 'boolean') return;
  if (!value || typeof value !== 'object' || Array.isArray(value) || !['hold', 'prompt'].includes(value.mode)
      || Object.keys(value).some((key) => !['mode', 'holdMs'].includes(key))) {
    fail(`${where}: "confirm" must be true, false, or an object with mode "hold" or "prompt"`);
  }
  const { min, max } = GESTURE_OPTIONS.confirmMs;
  if (value.holdMs !== undefined && (value.mode !== 'hold' || !Number.isInteger(value.holdMs)
      || value.holdMs < min || value.holdMs > max)) {
    fail(`${where}: "confirm.holdMs" is for hold confirmation and must be an integer between ${min} and ${max}`);
  }
}

function valueValidation(operation, where = '') {
  try { return operation(); }
  catch (error) {
    if (error instanceof MacroError || error instanceof ExpressionError) fail(where + error.message, error.code);
    throw error;
  }
}

function validateKeyBehavior(raw, where, key) {
  checkAction(key.action, where, 0, false, key.action !== raw.action);
  if (key.hold !== undefined) checkAction(key.hold, `${where} (long press)`, 0, false, key.hold !== raw.hold);
  if (key.double !== undefined) checkAction(key.double, `${where} (double tap)`, 0, false, key.double !== raw.double);
  checkConfirmation(key.confirm, where);
  if (shortcutNeedsConfirmation(key.action) && !key.confirm) fail(`${where}: this shortcut requires confirmation`);
  if ([key.hold, key.double].some(shortcutNeedsConfirmation)) fail(`${where}: assign this shortcut to a key with confirmation`);
  if (key.confirm && (key.hold || key.double)) fail(`${where}: confirmation uses a single gesture`);
  if (key.onBusy !== undefined && !['ignore', 'queue-one'].includes(key.onBusy)) {
    fail(`${where}: "onBusy" must be "ignore" or "queue-one"`);
  }
  if (key.repeatOnHold !== undefined && typeof key.repeatOnHold !== 'boolean') {
    fail(`${where}: "repeatOnHold" must be true or false`);
  }
  if (key.repeatOnHold && !canRepeatTap(key)) {
    fail(`${where}: hold repeat requires a supported volume, navigation, or zoom action with a single unconfirmed tap`);
  }
}

function validateControlBindings(raw, resolver) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_CONTROLS) fail(`"controlBindings" must list up to ${MAX_CONTROLS} linked controls`);
  const ids = new Set();
  return raw.map((entry, i) => {
    const where = `linked control ${i + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.id !== 'string' ||
        !VALID_ID.test(entry.id) || ids.has(entry.id)) fail(`${where}: missing, invalid or duplicate ID`);
    if (typeof entry.label !== 'string' || !/^\P{Cc}{1,40}$/u.test(entry.label.trim())) fail(`${where}: enter a label up to 40 characters`);
    if (Object.keys(entry).some((field) => field !== 'id' && field !== 'label' && !CONTROL_FIELDS.includes(field))) {
      fail(`${where}: use a label and shared action settings`);
    }
    ids.add(entry.id);
    const behavior = controlFields(entry);
    validateKeyBehavior(behavior, where, valueValidation(() => resolver.resolve(behavior), `${where}: `));
    return { id: entry.id, label: entry.label.trim(), ...behavior };
  });
}

function validateKeys(keys, grid, prefix, controlIds, resolver, page) {
  const { cols, rows } = grid;
  if (!Array.isArray(keys)) fail(`${prefix}"keys" must be an array`);
  if (keys.length > cols * rows) fail(`${prefix}${keys.length} keys do not fit in a ${cols}x${rows}`);
  const seen = new Set();
  const occupied = new Set();
  return keys.map((k, i) => {
    if (k === null) return null; // empty slot
    const where = `${prefix}key ${i + 1}`;
    if (!k || typeof k !== 'object' || Array.isArray(k)) fail(`${where}: must be an object or null`);
    if (typeof k.id !== 'string' || !VALID_ID.test(k.id)) fail(`${where}: "id" is missing or contains invalid characters`);
    if (seen.has(k.id)) fail(`${where}: duplicate ID "${k.id}"`);
    seen.add(k.id);
    if (k.label !== undefined && typeof k.label !== 'string') fail(`${where}: "label" must be a string`);
    if (k.icon !== undefined && !/^[a-z0-9-]{1,60}$/.test(k.icon)) fail(`${where}: invalid icon name`);
    if (typeof k.image === 'string' && k.image.startsWith('data:') && !embeddedImageDataUrl(k.image)) {
      fail(`${where}: invalid embedded PNG image`);
    }
    if (k.readout !== undefined && (typeof k.readout !== 'string' || !Object.hasOwn(READOUTS, k.readout))) {
      fail(`${where}: invalid key readout`);
    }
    const category = k.category ?? 'app';
    if (!CATEGORIES.has(category)) fail(`${where}: unknown category "${category}" (use ${[...CATEGORIES].join(', ')})`);
    if (k.controlId !== undefined && (!controlIds.has(k.controlId) || CONTROL_FIELDS.some((field) => k[field] !== undefined))) {
      fail(`${where}: choose a known linked control without inline action settings`);
    }
    const effective = valueValidation(() => resolver.resolve(k, page), `${where}: `);
    if (k.controlId === undefined) validateKeyBehavior(k, where, effective);
    if (k.span !== undefined && (!k.span || typeof k.span !== 'object' || Array.isArray(k.span)
        || Object.entries(k.span).some(([property, value]) => !['cols', 'rows'].includes(property) || !Number.isInteger(value)))) {
      fail(`${where}: "span" must specify columns and rows`);
    }
    const placement = keyLayout(k, i, grid);
    if (!canPlace(placement, grid, occupied)) fail(`${where}: key span overlaps a key or falls outside the grid`);
    for (const cell of cells(placement, cols)) occupied.add(cell);
    return { ...k, label: (k.label ?? k.id).slice(0, 40), category };
  });
}

function validateWidgets(raw, grid, label, keys = []) {
  try {
    return normalizeWidgetInstances(raw, { grid, occupied: [...occupiedCells(grid, keys)], label });
  } catch (error) {
    fail(error.message);
  }
}

function validateWebApps(raw) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 32) fail('"webApps" must list up to 32 installed web apps');
  const seen = new Set();
  return raw.map((entry) => {
    let app;
    try { app = normalizeWebApp(entry); } catch (error) { fail(error.message); }
    const id = chromiumWebAppId(app.manifestId);
    if (seen.has(id)) fail('An installed web app is listed more than once');
    seen.add(id);
    return app;
  });
}

/** Also accepts the 0.1 single-grid format with "keys" at the root. */
function validateProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('the file must contain a JSON object');
  const grid = validateGrid(raw.grid ?? undefined);
  const resolver = valueValidation(() => createProfileKeys(raw));
  const { macros, profileScope } = resolver;
  valueValidation(() => profileScope.check());
  for (const definition of macros.definitions) {
    const label = `shared macro ${definition.id}`;
    checkAction(valueValidation(() => macros.sample(definition), `${label}: `), label, 0, false, true);
  }
  const controlBindings = validateControlBindings(raw.controlBindings, resolver);
  const controlIds = new Set(controlBindings.map(({ id }) => id));
  const paged = raw.pages !== undefined;
  const pages = paged ? raw.pages : [{ id: 'home', name: 'Home', keys: raw.keys, widgets: raw.widgets }];
  if (!Array.isArray(pages) || pages.length < 1 || pages.length > MAX_PAGES) {
    fail(`the profile must contain 1 to ${MAX_PAGES} pages`);
  }
  const ids = new Set();
  const matches = new Set();
  const appMatches = new Set();
  const normalized = pages.map((page, i) => {
    if (!page || typeof page.id !== 'string' || !VALID_ID.test(page.id) || ids.has(page.id)) {
      fail(`page ${i + 1}: missing, invalid or duplicate ID`);
    }
    ids.add(page.id);
    const apps = page.apps ?? [];
    if (!Array.isArray(apps) || !apps.every(isExecutableName)) {
      fail(`page ${page.id}: use executable names such as Code.exe`);
    }
    const windowTitle = page.windowTitle;
    if (windowTitle !== undefined && (!windowTitle || !WINDOW_TITLE_MODES.has(windowTitle.mode)
        || typeof windowTitle.value !== 'string' || !windowTitle.value.trim()
        || windowTitle.value.trim().length > 120 || /[\u0000-\u001f\u007f]/.test(windowTitle.value))) {
      fail(`page ${page.id}: provide a window title and a valid match mode`);
    }
    const title = windowTitle && { mode: windowTitle.mode, value: windowTitle.value.trim() };
    const qualifier = title ? ':' + title.mode + ':' + title.value.toLowerCase() : '';
    const rules = apps.map((name) => {
      const exe = name.trim().toLowerCase();
      if (matches.has(exe + qualifier)) fail(`the executable "${exe}" is already assigned to this match rule`);
      matches.add(exe + qualifier);
      return exe;
    });
    const appIds = page.appIds ?? [];
    if (!Array.isArray(appIds) || !appIds.every((id) => typeof id === 'string' && APP_ID.test(id.trim()))) {
      fail(`page ${page.id}: use Windows app IDs such as Microsoft.WindowsTerminal_8wekyb3d8bbwe!App`);
    }
    const appRules = appIds.map((id) => {
      const normalized = id.trim().toLowerCase();
      if (appMatches.has(normalized + qualifier)) fail(`the Windows app ID "${normalized}" is already assigned to this match rule`);
      appMatches.add(normalized + qualifier);
      return normalized;
    });
    if (title && !rules.length && !appRules.length) fail(`page ${page.id}: a window title rule requires an executable or Windows app ID`);
    const priority = page.priority ?? 0;
    if (!Number.isInteger(priority) || priority < -100 || priority > 100) {
      fail(`page ${page.id}: priority must be an integer from -100 to 100`);
    }
    const folder = page.folder ?? [];
    if (!Array.isArray(folder) || folder.length > 4 || folder.some((part) => typeof part !== 'string'
        || !part.trim() || part.trim().length > 32 || /[/\\\u0000-\u001f\u007f]/.test(part))) {
      fail(`page ${page.id}: use up to four folder names of 1 to 32 characters separated by /`);
    }
    const pageGrid = page.grid === undefined ? grid : validateGrid(page.grid, `page ${page.id} grid`, grid);
    const variables = valueValidation(() => {
      const scope = resolver.pageScope(page);
      scope.check();
      return scope.definitions;
    }, `page ${page.id}: `);
    const keys = validateKeys(page.keys, pageGrid, paged ? `page ${page.id}, ` : '', controlIds, resolver, page);
    return {
      id: page.id,
      name: (typeof page.name === 'string' && page.name.trim() ? page.name.trim() : page.id).slice(0, 40),
      apps: rules,
      ...(folder.length ? { folder: folder.map((part) => part.trim()) } : {}),
      ...(appRules.length ? { appIds: appRules } : {}),
      ...(title ? { windowTitle: title } : {}),
      ...(priority ? { priority } : {}),
      ...(page.grid !== undefined ? { grid: pageGrid } : {}),
      ...(variables.length ? { variables } : {}),
      keys,
      widgets: validateWidgets(page.widgets, pageGrid, `page ${page.id}`, keys),
    };
  });
  const locale = typeof raw.locale === 'string' ? raw.locale : 'en-GB';
  try {
    Intl.getCanonicalLocales(locale);
  } catch {
    fail('invalid "locale"');
  }
  if (raw.shortcutLanguage !== undefined && !['en-US', 'it-IT'].includes(raw.shortcutLanguage)) {
    fail('"shortcutLanguage" must be en-US or it-IT');
  }
  if (raw.bar !== undefined && (!raw.bar || typeof raw.bar !== 'object' || Array.isArray(raw.bar))) {
    fail('"bar" must be an object');
  }
  if (raw.bar?.variables !== undefined) fail('Use profile variables or a key’s run variables in the persistent bar.', 'invalid-variables');
  const barKeys = validateKeys(raw.bar?.keys === undefined ? [] : raw.bar.keys, BAR_GRID, 'persistent bar, ', controlIds, resolver);
  const webApps = validateWebApps(raw.webApps);
  const shortcutOverrides = validateShortcutOverrides(raw.shortcutOverrides);
  const widgetPresets = normalizeCompositionPresets(raw.widgetPresets);
  return {
    version: paged ? 2 : 1,
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'Profile',
    locale,
    ...(raw.shortcutLanguage ? { shortcutLanguage: raw.shortcutLanguage } : {}),
    ...(webApps.length ? { webApps } : {}),
    ...(Object.keys(shortcutOverrides).length ? { shortcutOverrides } : {}),
    ...(widgetPresets.length ? { widgetPresets } : {}),
    ...(controlBindings.length ? { controlBindings } : {}),
    ...(macros.definitions.length ? { macros: macros.definitions } : {}),
    ...(profileScope.definitions.length ? { variables: profileScope.definitions } : {}),
    grid,
    gestures: validateGestures(raw.gestures),
    bar: { keys: barKeys, widgets: validateWidgets(raw.bar?.widgets, BAR_GRID, 'persistent bar', barKeys) },
    pages: normalized,
    keys: normalized[0].keys,
  };
}

function parseProfile(text) {
  let raw;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (err) {
    fail(`malformed JSON (${err.message})`);
  }
  return validateProfile(raw);
}

function readProfileText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function profileToken(text) {
  return text === null ? 'missing' : createHash('sha256').update(text).digest('hex');
}

function isLegacyStock(text) {
  return profileToken(text.replace(/\r\n/g, '\n').trim()) === LEGACY_STOCK_PROFILE_HASH;
}

function readVersion(text, savedAt, source = 'history') {
  if (typeof text !== 'string' || !Number.isFinite(savedAt) || Math.abs(savedAt) > 8.64e15) return null;
  try {
    return { id: profileToken(text), text, savedAt, source, profile: parseProfile(text) };
  } catch {
    return null;
  }
}

function readStandaloneVersion(file, source) {
  try {
    const { mtimeMs } = fs.statSync(file);
    return readVersion(readProfileText(file), mtimeMs, source);
  } catch {
    return null;
  }
}

class ProfileStore extends EventEmitter {
  /** @param {{ file: string, defaultFile?: string }} options */
  constructor({ file, defaultFile }) {
    super();
    this.file = file;
    this.defaultFile = defaultFile;
    this.current = null;
    this.text = null;
    this.historyWarning = null;
    this.watcher = null;
    this.timer = null;
  }

  load({ upgradeStock = false } = {}) {
    let text = readProfileText(this.file);
    if (text === null) {
      if (this.backupVersions().length) throw new Error('Profile file is missing');
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      try {
        fs.copyFileSync(this.defaultFile, this.file, fs.constants.COPYFILE_EXCL);
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
      text = fs.readFileSync(this.file, 'utf8');
    }
    if (upgradeStock && isLegacyStock(text)) {
      const replacement = fs.readFileSync(this.defaultFile, 'utf8');
      parseProfile(replacement);
      const backup = `${this.file}.before-english.bak`;
      if (!fs.existsSync(backup)) writeAtomic(backup, text);
      writeAtomic(this.file, replacement);
      text = replacement;
    }
    let profile = parseProfile(text);
    for (const [upgrade, suffix] of upgradeStock ? STOCK_LAYOUT_UPGRADES : []) {
      const migrated = upgrade(text);
      if (!migrated) continue;
      const replacement = parseProfile(migrated);
      const backup = this.file + suffix;
      if (!fs.existsSync(backup)) writeAtomic(backup, text);
      this.recordVersion(text);
      if (profileToken(readProfileText(this.file)) !== profileToken(text)) throw new Error('The profile changed during the stock layout migration.');
      writeAtomic(this.file, migrated);
      profile = replacement;
      text = migrated;
    }
    this.current = profile;
    this.text = text;
    this.recordVersion(text);
    return this.current;
  }

  fallback() {
    const latest = this.recentVersions()[0];
    this.text = latest?.text ?? fs.readFileSync(this.defaultFile, 'utf8');
    this.current = latest?.profile ?? parseProfile(this.text);
    return this.current;
  }

  recentVersions() {
    const versions = new Map();
    try {
      const archive = JSON.parse(readProfileText(`${this.file}.history`));
      if (archive?.version === 1 && Array.isArray(archive.entries)) {
        for (const entry of archive.entries.slice(0, PROFILE_HISTORY_LIMIT)) {
          const version = readVersion(entry?.text, entry?.savedAt);
          if (version && !versions.has(version.id)) versions.set(version.id, version);
        }
      }
    } catch {
      // An unreadable archive must not prevent the profile from loading.
    }
    const history = [...versions.values()];
    const previous = readStandaloneVersion(`${this.file}.bak`, 'legacy');
    if (previous && !versions.has(previous.id)) {
      const index = history.findIndex(({ savedAt }) => previous.savedAt > savedAt);
      history.splice(index === -1 ? history.length : index, 0, previous);
    }
    return history.slice(0, PROFILE_HISTORY_LIMIT);
  }

  backupVersions() {
    const versions = this.recentVersions();
    for (const [suffix, source] of [['.before-english.bak', 'before-english'],
      [AUTO_PAGES_BACKUP, 'before-automatic-pages'], [HOME_LAYOUT_BACKUP, 'before-compact-home'],
      [HOME_MIC_BACKUP, 'before-home-mic-removal']]) {
      const checkpoint = readStandaloneVersion(this.file + suffix, source);
      if (checkpoint && !versions.some((version) => version.id === checkpoint.id)) versions.push(checkpoint);
    }
    return versions;
  }

  recordVersion(text) {
    if (this.file === this.defaultFile) return;
    try {
      const versions = this.recentVersions();
      const id = profileToken(text);
      if (versions[0]?.id !== id || versions[0].source !== 'history') {
        const earlier = versions.filter((version) => version.id !== id).slice(0, PROFILE_HISTORY_LIMIT - 1);
        const entries = [{ text, savedAt: Date.now() }, ...earlier.map(({ text, savedAt }) => ({ text, savedAt }))];
        writeAtomic(`${this.file}.history`, `${JSON.stringify({ version: 1, entries })}\n`);
      }
      this.historyWarning = null;
    } catch (err) {
      this.historyWarning = `Could not record profile history: ${err.message}`;
    }
  }

  diskSnapshot() {
    const text = readProfileText(this.file);
    let warning = null;
    let profile = this.current;
    try {
      if (text === null) throw new Error('Profile file is missing');
      profile = parseProfile(text);
    } catch (err) {
      warning = err.message;
    }
    return { text, profile, warning, token: profileToken(text) };
  }

  editorSnapshot() {
    const { profile, warning, token } = this.diskSnapshot();
    return { profile, warning, token, gestureOptions: GESTURE_OPTIONS };
  }

  loadedVersion() {
    return profileToken(this.text);
  }

  editorBackups() {
    const activeId = profileToken(readProfileText(this.file));
    return {
      versions: this.backupVersions().filter(({ id }) => id !== activeId)
        .map(({ id, profile, savedAt, source }) => ({ id, name: profile.name, savedAt, source })),
      warning: this.historyWarning,
    };
  }

  save(profile, token) {
    const current = this.checkEditorVersion(token);
    const { keys, ...normalized } = validateProfile(profile);
    const next = { ...normalized, version: 2 };
    return this.applyVersion(`${JSON.stringify(next, null, 2)}\n`, current);
  }

  restoreBackup(id, token) {
    const current = this.checkEditorVersion(token);
    const backup = this.backupVersions().find((version) => version.id === id && version.id !== current.token);
    if (!backup) throw new Error('This backup is no longer available. Reopen Profile backups and try again.');
    if (isLegacyStock(backup.text) || compactStockHome(backup.text)) {
      // Saving an intentional restore as an edited profile keeps it across startup.
      return this.save(backup.profile, token);
    }
    return this.applyVersion(backup.text, current);
  }

  checkEditorVersion(token) {
    const current = this.diskSnapshot();
    if (current.token !== token) {
      throw new Error('The file changed on disk. Reopen or reload the editor before applying changes.');
    }
    return current;
  }

  applyVersion(text, current) {
    if (current.text !== null) {
      writeAtomic(`${this.file}${current.warning ? '.invalid' : '.bak'}`, current.text);
      if (!current.warning) this.recordVersion(current.text);
    }
    if (profileToken(readProfileText(this.file)) !== current.token) {
      throw new Error('The file changed on disk. Reopen or reload the editor before applying changes.');
    }
    writeAtomic(this.file, text);
    this.emit('change', this.load());
    return this.editorSnapshot();
  }

  /** Reload changes from disk and keep the last valid profile on errors. */
  watch() {
    if (this.watcher) return;
    const dir = path.dirname(this.file);
    const base = path.basename(this.file);
    const rearm = (err) => {
      // A watcher on a removed, network or synced folder can fail. Report it, then watch again later
      // instead of letting the FSWatcher error escape as an uncaught exception.
      this.watcher?.close();
      this.watcher = null;
      if (this.listenerCount('error')) this.emit('error', new Error(`Could not watch the profile folder: ${err.message}`));
      clearTimeout(this.watchRetry);
      this.watchRetry = setTimeout(() => { this.watchRetry = null; this.watch(); }, 5_000);
      this.watchRetry.unref?.();
    };
    try {
      this.watcher = fs.watch(dir, (_event, filename) => {
        if (filename && filename !== base) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          try {
            if (!fs.existsSync(this.file)) throw new Error('Profile file is missing');
            if (fs.readFileSync(this.file, 'utf8') !== this.text) this.emit('change', this.load());
          } catch (err) {
            this.emit('error', err);
          }
        }, 200);
      });
    } catch (err) {
      rearm(err);
      return;
    }
    this.watcher.on('error', rearm);
  }

  close() {
    clearTimeout(this.timer);
    clearTimeout(this.watchRetry);
    this.watchRetry = null;
    this.watcher?.close();
    this.watcher = null;
  }

  findKey(id, page = this.current?.pages[0]) {
    const key = page?.keys.find((item) => item?.id === id);
    return key ? createProfileKeys(this.current).resolve(key, page) : null;
  }
}

module.exports = { validateProfile, toView, confirmationMode, ProfileStore, ACTION_TYPES, CATEGORIES };
