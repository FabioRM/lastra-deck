// @ts-check
'use strict';

const { createHash } = require('node:crypto');
const { release } = require('node:os');
const { findActions } = require('../editor/action-palette');
const { defaultSettings, catalog: widgets } = require('../shared/widget-layout');
const { DEFAULT_COMPOSITION } = require('../shared/widget-composition');
const { MIN_CHOICES, MAX_CHOICES, MAX_CHOICE_LENGTH } = require('../shared/decisions');
const { TIMER_KINDS, TIMER_COMMANDS, TIMER_DURATION } = require('../shared/timers');
const { SOUND_COMMANDS, SOUND_AGAIN, SOUND_VOLUME } = require('../shared/sounds');
const { WAIT_CONDITIONS, WAIT_TIMEOUT, REPEAT_COUNT, REPEAT_TIMEOUT, CHOICE_LIMIT, CHOICE_TIMEOUT, RANDOM_LIMIT } = require('../shared/action-flow');
const { shortcutRows, filterShortcutRows, shortcutGuardForAction } = require('../shared/shortcut-library');
const { previewPacks } = require('./shortcut-packs');
const { catalog } = require('./shortcut-catalog');
const { shortcutRequirements } = require('./shortcut-guards');
const { layouts } = require('./actions/keyboard-samples');

const VERSION = 1;
const MAX_LIMIT = 40;
const MAX_CACHED_SEARCHES = 4;
const kinds = ['action', 'widget', 'shortcut'];
const platforms = ['windows', 'web', 'macos', 'ipados', 'linux', 'chromeos', 'reference'];
const languages = ['en-US', 'it-IT'];
const layoutNames = Object.keys(layouts);
const text = { type: 'string' };
const number = { type: 'integer' };
const bool = { type: 'boolean' };
const strings = { type: 'array', items: text };
const nullable = (type) => ({ type: [type, 'null'] });
const enumOf = (values) => ({ type: 'string', enum: values });
const object = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
const info = (description) => ({ ...text, description });
const filterText = (description) => ({ ...info(description), maxLength: 160 });
const inputSchema = object({
  kind: { ...enumOf(['all', ...kinds]), description: 'Catalog to search. Defaults to all.' },
  query: filterText('Search words, an alias, or a chord such as Ctrl+Shift+T.'),
  app: filterText('App name or pack ID, such as Google Docs or gdocs.'),
  platform: enumOf(platforms), context: filterText('Shortcut group or mode, such as tabs, editor, or meeting.'),
  integration: filterText('Provider name or ID, such as OBS or Windows audio.'), tag: filterText('Category or intent tag.'),
  icon: filterText('Lucide icon name.'), shortcutLanguage: enumOf(languages), keyboardLayout: enumOf(layoutNames),
  limit: { ...number, minimum: 1, maximum: MAX_LIMIT, default: 20 },
  cursor: { ...text, maxLength: 48, description: 'Pass the previously returned nextCursor with the same filters and limit.' },
});

const compatibility = object({ status: enumOf(['supported', 'conditional', 'unavailable', 'reference-only']),
  reason: text, requirements: strings }, ['status', 'reason', 'requirements']);
const source = object({ kind: enumOf(['bundled', 'vendor', 'inventory']), reference: text, url: text, revision: text,
  catalogVersion: text, sourceId: text, terms: text, reuse: text, label: text }, ['kind', 'reference']);
const appSchema = object({ id: text, name: text }, ['id', 'name']);
const verification = object({ status: enumOf(['documented', 'ambiguous', 'unknown', 'installed-manifest']), date: nullable('string'), method: nullable('string') },
  ['status', 'date', 'method']);
const shortcutArgs = {
  type: 'object', maxProperties: 8,
  propertyNames: { type: 'string', maxLength: 48 },
  additionalProperties: { anyOf: [{ type: 'string', maxLength: 256 }, { type: ['number', 'boolean', 'null'] }] },
};
const binding = object({ actionId: nullable('string'), bindingId: nullable('string'), notation: nullable('string'), chord: nullable('string'),
  edition: nullable('string'), appVersion: nullable('string'), platform: nullable('string'), hostPlatform: nullable('string'),
  language: nullable('string'), layout: nullable('string'), mode: nullable('string'), contexts: strings, requiresConfirmation: bool,
  windowsBuild: nullable('integer'), verification, kind: text, command: text, requirement: text, trigger: text, when: text,
  strokes: { type: 'array', items: strings }, orderedChords: strings, args: shortcutArgs }, ['actionId', 'bindingId', 'notation', 'chord', 'edition', 'appVersion',
  'platform', 'hostPlatform', 'language', 'layout', 'mode', 'contexts', 'requiresConfirmation', 'windowsBuild', 'verification']);
const common = { id: text, name: text, description: text, category: text, icon: text, aliases: strings, tags: strings,
  integration: text, platforms: strings, source, compatibility, settings: { type: 'object' }, example: { type: ['object', 'null'] } };
const item = (kind, extra = {}, required = []) => object({ kind: { const: kind }, ...common, ...extra }, ['kind', ...Object.keys(common), ...required]);
const outputSchema = object({ version: { const: VERSION }, shortcutCatalogVersion: text, total: number, nextCursor: text,
  system: object({ platform: text, windowsBuild: nullable('integer'), shortcutLanguage: nullable('string'), keyboardLayout: nullable('string') },
    ['platform', 'windowsBuild', 'shortcutLanguage', 'keyboardLayout']),
  items: { type: 'array', maxItems: MAX_LIMIT, items: { oneOf: [item('action'), item('widget'),
    item('shortcut', { app: appSchema, binding: { anyOf: [binding, { type: 'null' }] } }, ['app', 'binding'])] } },
}, ['version', 'shortcutCatalogVersion', 'system', 'total', 'items']);

const device = enumOf(['output', 'microphone']);
const conditions = enumOf(Object.keys(WAIT_CONDITIONS));
const conditionValue = { type: ['string', 'boolean'] };
const action = { type: 'object' };
const actions = { type: 'array', items: action };
const actionInfo = {
  launch: ['square-terminal', 'Windows desktop', ['start app', 'run program'], { target: info('Executable'), args: strings,
    cwd: info('Working directory'), reuseWindow: bool }, { target: 'notepad.exe' }],
  open: ['external-link', 'Windows desktop', ['open site', 'open folder'], { target: info('URL or path') }, { target: 'https://example.com' }],
  workspace: ['layout-template', 'Workspaces', ['open project', 'position windows'], { workspace: info('Saved workspace ID') }, { workspace: 'work' }],
  hotkey: ['keyboard', 'Windows keyboard', ['key combination', 'send input'], { keys: info('Windows chord'), targetApps: strings }, { keys: 'Ctrl+Shift+S' }],
  text: ['text-cursor', 'Windows keyboard', ['type template', 'insert text'], { text: info('Text to type'), targetApps: strings }, { text: 'Meeting notes' }],
  media: ['music', 'Windows media', ['media playback', 'volume'], { key: enumOf(['playpause', 'next', 'prev', 'stop', 'mute', 'volup', 'voldown']) },
    { key: 'playpause' }],
  'spotify-playback': ['circle-play', 'Spotify desktop', ['play music', 'pause music'], {}, {}],
  'obs-scene': ['video', 'OBS WebSocket', ['switch camera', 'recall scene', 'streaming'], { scene: info('Exact OBS scene name'),
    bus: { ...enumOf(['program', 'preview']), default: 'program' } }, { scene: 'Wide shot' }],
  audio: ['mic', 'Windows audio', ['mute mic', 'mute speakers', 'toggle microphone'], { device }, { device: 'microphone' }],
  delay: ['timer', 'Lastra macros', ['pause macro', 'wait milliseconds'], { ms: { ...number, minimum: 0, maximum: 10_000 } }, { ms: 250 }],
  'wait-for': ['timer-reset', 'Windows or OBS', ['wait condition', 'wait on app'], { condition: conditions, expected: conditionValue,
    timeoutMs: { ...number, minimum: WAIT_TIMEOUT.min, maximum: WAIT_TIMEOUT.max, default: WAIT_TIMEOUT.value } },
    { condition: 'foreground', expected: 'Code.exe' }],
  if: ['git-branch', 'Windows or OBS', ['conditional macro', 'branch'], { condition: conditions, expected: conditionValue, then: action, else: action },
    { condition: 'microphones-muted', expected: true, then: { type: 'open', target: 'https://example.com' } }],
  sequence: ['list-ordered', 'Lastra macros', ['macro chain', 'action steps'], { steps: { ...actions, minItems: 1, maxItems: 20 } },
    { steps: [{ type: 'launch', target: 'notepad.exe' }, { type: 'delay', ms: 250 }] }],
  repeat: ['repeat', 'Lastra macros', ['loop', 'iterations', 'repeat while'], {
    count: { ...number, minimum: REPEAT_COUNT.min, maximum: REPEAT_COUNT.max }, condition: conditions, expected: conditionValue,
    timeoutMs: { ...number, minimum: REPEAT_TIMEOUT.min, maximum: REPEAT_TIMEOUT.max, default: REPEAT_TIMEOUT.value },
    steps: { ...actions, minItems: 1, maxItems: 20 },
  }, { count: 3, steps: [{ type: 'delay', ms: 250 }] }],
  choose: ['list-checks', 'Lastra macros', ['prompt', 'pick one', 'selection'], {
    id: info('Stable prompt ID'), prompt: info('Text displayed on the deck'),
    timeoutMs: { ...number, minimum: CHOICE_TIMEOUT.min, maximum: CHOICE_TIMEOUT.max, default: CHOICE_TIMEOUT.value },
    choices: { type: 'array', minItems: 2, maxItems: CHOICE_LIMIT, items: object({ id: info('Option ID'), label: info('Touch button label'), action }, ['id', 'label', 'action']) },
  }, { id: 'setup', prompt: 'Choose a workflow', choices: [
    { id: 'setup', label: 'Setup', action: { type: 'delay', ms: 100 } },
    { id: 'review', label: 'Review', action: { type: 'delay', ms: 250 } },
  ] }],
  random: ['shuffle', 'Lastra macros', ['random pick', 'shuffle', 'one of several'], {
    id: info('Stable ID that remembers the last pick'), pool: { ...actions, minItems: 2, maxItems: RANDOM_LIMIT },
    avoidRepeat: { ...bool, default: false },
  }, { id: 'greeting', pool: [{ type: 'text', text: 'Hello' }, { type: 'text', text: 'Good morning' }] }],
  timer: ['timer', 'Lastra timers', ['countdown', 'stopwatch', 'start timer', 'time remaining'], {
    id: info('Stable timer ID'), label: info('Timer name'), kind: { ...enumOf(Object.keys(TIMER_KINDS)), default: 'countdown' },
    durationMs: { ...number, minimum: TIMER_DURATION.min, maximum: TIMER_DURATION.max },
    command: { ...enumOf(Object.keys(TIMER_COMMANDS)), default: 'toggle' },
  }, { id: 'tea', label: 'Tea', durationMs: 180_000 }],
  sound: ['volume-2', 'Lastra soundboard', ['soundboard', 'play clip', 'sound effect', 'jingle'], {
    id: info('Stable clip ID'), file: info('Full path of a local audio file'),
    volume: { ...number, minimum: SOUND_VOLUME.min, maximum: SOUND_VOLUME.max, default: SOUND_VOLUME.value },
    output: info('Name of a Windows output. Omit for the default output.'),
    again: { ...enumOf(Object.keys(SOUND_AGAIN)), default: 'restart' }, command: { ...enumOf(Object.keys(SOUND_COMMANDS)), default: 'play' },
  }, { id: 'applause', file: 'C:\\Sounds\\applause.mp3' }],
  macro: ['layers', 'Lastra macros', ['shared action', 'reuse workflow', 'parameters'],
    { macro: info('ID of a shared macro in the profile'), args: { type: 'object', description: 'Values for the shared macro’s declared parameters.' } },
    { macro: 'start-meeting' }],
};

const widgetInfo = {
  'now-playing': ['music', ['media', 'track', 'album', 'playback']],
  spotify: ['circle-play', ['media', 'track', 'music']], netflix: ['film', ['media', 'streaming', 'watchlist']],
  'system-metric': ['activity', ['monitoring', 'CPU', 'GPU', 'RAM', 'temperature']],
  'audio-fader': ['sliders-horizontal', ['volume slider', 'speaker level', 'microphone gain']],
  'audio-encoder': ['circle-dot', ['step volume', 'fine adjustment', 'speaker level']],
  'virtual-dial': ['circle-dot', ['rotary control', 'fine adjustment', 'volume dial']],
  composition: ['layout-grid', ['custom tile', 'gauge', 'graph', 'icon', 'sensor']],
  timers: ['timer', ['countdown', 'stopwatch', 'time remaining']],
  decision: ['dice-5', ['coin flip', 'dice roll', 'random choice']],
};

const INVENTORY = new Map(catalog.apps.map((entry) => [entry.id, entry]));
const cachedShortcuts = new Map();
const cachedSearches = new Map();
const fold = (value) => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
const has = (values, filter) => !filter || values.some((value) => fold(value).includes(fold(filter)));
const words = (value) => fold(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const unique = (values) => [...new Set(values.filter(Boolean))];

function available(system, requirements = []) {
  if (system.platform !== 'windows') return { status: 'unavailable', reason: 'Lastra deck execution requires Windows.', requirements };
  return requirements.length ? { status: 'conditional', reason: requirements[0], requirements }
    : { status: 'supported', reason: 'Supported by the Lastra Windows profile format.', requirements };
}

function actionItems(system) {
  return findActions('', '').map(({ id, name, category, help }) => {
    const [icon, integration, aliases, properties, example] = actionInfo[id];
    const requirements = {
      launch: ['Use an installed executable.'], workspace: ['Configure the workspace ID in Apps → Workspaces.'],
      hotkey: ['The target app, current layout, and any shortcut guard must match.'], text: ['Focus the target text field.'],
      media: ['The player or endpoint must support the selected media key.'],
      'spotify-playback': ['Spotify desktop must publish a Windows media session.'],
      'obs-scene': ['Connect OBS WebSocket and select a scene on the matching Program or Studio Preview bus.'],
      audio: ['An available Windows audio endpoint is required.'],
      sound: ['The audio file must exist on this PC.'], 'wait-for': ['The selected condition must have a readable source.'],
      if: ['The selected condition must have a readable source.'],
      macro: ['Create the shared macro definition in the profile and supply its required parameters.'],
    }[id];
    return { kind: 'action', id, name, description: help, category, icon, aliases, tags: [category, ...aliases], integration,
      platforms: ['windows'], source: { kind: 'bundled', reference: 'docs/macros.md' }, compatibility: available(system, requirements),
      settings: object({ type: { const: id }, ...properties }, ['type', ...Object.keys(example)]), example: { type: id, ...example } };
  });
}

function widgetItems(system) {
  return Object.entries(widgets).map(([id, widget]) => {
    const [icon, tags] = widgetInfo[id];
    const { name, description, provider: integration, requirement, size, fields } = widget;
    /** @type {Record<string, any>} */
    const parameters = Object.fromEntries(Object.entries(fields).map(([key, { choices, label: title, min, max, value }]) => [key,
      choices ? { ...enumOf(Object.keys(choices)), title, default: value }
        : { ...number, title, minimum: min, maximum: max, default: value }]));
    if (id === 'composition') parameters.composition = { ...object({ name: text, grid: { type: 'object' }, parts: actions }, ['name', 'grid', 'parts']),
      default: DEFAULT_COMPOSITION };
    if (id === 'decision') parameters.options = { type: 'array', minItems: MIN_CHOICES, maxItems: MAX_CHOICES,
      uniqueItems: true, items: { ...text, minLength: 1, maxLength: MAX_CHOICE_LENGTH }, default: defaultSettings(id).options };
    return { kind: 'widget', id, name, description, category: 'Widgets', icon, tags, aliases: tags, integration, platforms: ['windows'],
      source: { kind: 'bundled', reference: 'docs/widgets.md' }, compatibility: available(system, [requirement]), settings: object(parameters),
      example: { id: 'sample-' + id, type: id, settings: id === 'composition' ? { composition: DEFAULT_COMPOSITION } : defaultSettings(id),
        layout: { column: 0, row: 0, ...size } } };
  });
}

function shortcutCompatibility(pack, key, system) {
  const review = key.binding;
  const rule = shortcutGuardForAction(key.action);
  const needs = unique([review?.unavailable, review?.requirement, review?.trigger, rule?.mode && `Requires ${rule.mode}.`, rule?.language && `Uses the ${rule.language} keymap.`,
    rule?.layout && `Requires the ${review?.layout ?? 'US'} keyboard layout.`,
    rule?.minBuild && `Requires Windows build ${rule.minBuild} or later.`, rule?.confirm && 'Requires Lastra confirmation.',
    pack.installedWebApp && 'Requires a matching installed Chromium web app.']);
  if (!rule || pack.availability || (review && review.verification.status !== 'documented')) {
    return { status: 'reference-only', reason: review?.unavailable ?? key.unavailable ?? pack.availability ?? 'The binding is awaiting verification.', requirements: needs };
  }
  const platform = available(system, needs);
  if (platform.status === 'unavailable') return platform;
  const reason = shortcutRequirements(rule, { build: system.windowsBuild ?? 0, shortcutLanguage: system.shortcutLanguage,
    keyboardLayout: layouts[system.keyboardLayout]?.id });
  const conflicting = (rule.minBuild && system.windowsBuild !== null && rule.minBuild > system.windowsBuild)
    || (rule.language && system.shortcutLanguage && rule.language !== system.shortcutLanguage)
    || (rule.layout && system.keyboardLayout && rule.layout !== layouts[system.keyboardLayout].id);
  return { status: conflicting ? 'unavailable' : 'conditional', reason: reason ?? review?.unavailable
    ?? (pack.installedWebApp ? 'Requires a matching installed Chromium web app and its active context.' : 'Requires the matching app and foreground context.'),
  requirements: needs };
}

function shortcutId({ pack, key }) {
  return `${pack.id}/${key.binding?.bindingId ?? key.id}`;
}

function shortcutSearchFields({ pack, key, contexts, platform }) {
  const category = key.binding?.category ?? key.group ?? key.category ?? 'Shortcuts';
  return {
    app: { id: pack.id, name: pack.name }, category, icon: key.icon ?? 'keyboard',
    tags: unique([category, ...contexts, key.category, platform]), platforms: [platform],
    integration: pack.installedWebApp ? 'Installed Chromium web app' : pack.name,
  };
}

function shortcutItem(row, system) {
  const { pack, key, contexts } = row;
  const data = key.binding;
  const guard = shortcutGuardForAction(key.action);
  const { app, category, icon, tags, integration, platforms } = shortcutSearchFields(row);
  /** @type {Record<string, any>} Reviewed binding fields plus optional catalog extras. */
  const binding = { actionId: data?.actionId ?? `${pack.id}:${key.id}`, bindingId: data?.bindingId ?? null,
    notation: data?.notation ?? key.notation ?? key.action?.keys ?? null, chord: data?.chord ?? key.action?.keys ?? null,
    edition: data?.edition ?? ({ 'outlook-new': 'new Outlook for Windows', 'outlook-classic': 'classic Outlook for Windows' }[pack.id]) ?? null,
    appVersion: data?.appVersion ?? null, platform: data?.platform ?? guard?.platform ?? null,
    hostPlatform: data?.hostPlatform ?? (guard ? 'windows' : null), language: data?.language ?? guard?.language ?? null,
    layout: data?.layout ?? (guard?.layout ? 'US' : null), mode: guard?.mode ?? data?.mode ?? null, contexts,
    requiresConfirmation: Boolean(key.confirm || guard?.confirm), windowsBuild: data?.windowsBuild ?? guard?.minBuild ?? null,
    verification: data?.verification ?? { status: 'unknown', date: null, method: null },
    ...Object.fromEntries(['kind', 'command', 'requirement', 'trigger', 'when', 'strokes', 'orderedChords', 'args']
      .filter((field) => data?.[field] !== undefined).map((field) => [field, data[field]])) };
  const url = data?.source ?? key.source ?? pack.source;
  const revision = data?.sourceRevision ?? pack.revision;
  const settings = { platform: binding.platform, hostPlatform: binding.hostPlatform, language: binding.language,
    layout: binding.layout, mode: binding.mode, windowsBuild: binding.windowsBuild, requiresConfirmation: binding.requiresConfirmation };
  return { kind: 'shortcut', id: shortcutId(row), name: key.label,
    description: `${pack.name} ${binding.kind === 'slash-command' ? 'slash command' : binding.kind === 'unassigned' ? 'unassigned action' : 'shortcut'}.`,
    category, icon, aliases: key.aliases ?? [], tags, integration, platforms, app, binding,
    source: { kind: url ? 'vendor' : 'bundled', reference: 'docs/shortcut-packs.md', catalogVersion: pack.catalogVersion,
      ...(url ? { url } : {}), ...(revision ? { revision } : {}), ...(data?.provenance?.terms ? { terms: data.provenance.terms } : {}),
      ...(data?.provenance ? { sourceId: data.provenance.sourceId, reuse: data.provenance.reuse, label: data.provenance.label } : {}) },
    compatibility: shortcutCompatibility(pack, key, system), settings,
    example: binding.notation ? { notation: binding.notation, ...(binding.bindingId ? { bindingId: binding.bindingId } : {}) } : null };
}

function shortcutCatalog(language) {
  if (cachedShortcuts.has(language)) return cachedShortcuts.get(language);
  const packs = previewPacks(language);
  const rows = shortcutRows(packs).map((row) => ({ ...row, key: { ...row.key, aliases: unique([...(row.key.aliases ?? []), row.key.icon,
    row.pack.installedWebApp && 'installed Chromium web app', row.key.group, row.key.binding?.edition, ...row.contexts]) } }));
  const empty = packs.filter((pack) => !pack.keys.length).map((/** @type {{ id: string, name: string, availability?: string }} */ pack) => ({ kind: 'shortcut', id: pack.id, name: pack.name,
    description: pack.availability, category: 'Shortcuts', icon: 'keyboard', aliases: [], tags: ['reference'], integration: pack.name,
    platforms: [...INVENTORY.get(pack.id)?.platforms ?? [], 'reference'], app: { id: pack.id, name: pack.name }, binding: null,
    source: { kind: 'inventory', reference: 'docs/shortcut-packs.md', url: catalog.attribution,
      catalogVersion: catalog.version },
    compatibility: { status: 'reference-only', reason: pack.availability, requirements: [] }, settings: {}, example: null }));
  const result = { rows, empty };
  cachedShortcuts.set(language, result);
  return result;
}

function parseSearch(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Use the catalog search parameters.');
  const filters = {};
  for (const [name, value] of Object.entries(args)) {
    const spec = Object.hasOwn(inputSchema.properties, name) && inputSchema.properties[name];
    if (!spec || (spec.type === 'string' && (typeof value !== 'string' || value.length > (spec.maxLength ?? 160) || /\p{Cc}/u.test(value)))
        || (spec.type === 'integer' && (!Number.isSafeInteger(value) || value < spec.minimum || value > spec.maximum))
        || (spec.enum && !spec.enum.includes(value))) throw new Error(`Invalid catalog search parameter ${name}.`);
    filters[name] = typeof value === 'string' ? value.trim() : value;
  }
  return filters;
}

function matchesFilters(entry, { app, integration, icon, tag }) {
  return has([entry.app?.id, entry.app?.name, entry.integration], app)
    && (!integration || ` ${words(entry.integration)} `.includes(` ${words(integration)} `))
    && (!icon || fold(entry.icon) === fold(icon)) && has(entry.tags, tag);
}

function buildSearch(scope, filters, system) {
  const { kind = 'all', query = '', context, platform, shortcutLanguage } = filters;
  const seen = new Set();
  const results = [];
  const identities = [];
  function add(kind, id, entry) {
    const identity = `${kind}:${id}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    identities.push([kind, id]);
    results.push(entry);
  }
  function addItem(entry) {
    if (!matchesFilters(entry, filters) || (platform && !entry.platforms.includes(platform)
        && !(platform === 'reference' && entry.compatibility.status === 'reference-only'))) return;
    add(entry.kind, entry.id, { item: entry });
  }
  if (!context) {
    const terms = fold(query).split(/\s+/);
    const items = [...(kind === 'all' || kind === 'action' ? actionItems(system) : []),
      ...(kind === 'all' || kind === 'widget' ? widgetItems(system) : [])];
    for (const entry of items) {
      if (terms.every((word) => has([entry.id, entry.name, entry.description, entry.integration, entry.icon,
        ...entry.aliases, ...entry.tags, JSON.stringify(entry.settings), JSON.stringify(entry.example)], word))) addItem(entry);
    }
  }
  if (kind === 'all' || kind === 'shortcut') {
    const { rows, empty } = shortcutCatalog(shortcutLanguage);
    const hasFieldFilters = filters.app || filters.integration || filters.icon || filters.tag;
    const scoped = (hasFieldFilters || context || platform) ? rows.filter((row) =>
      has(row.contexts, context)
      && (!hasFieldFilters || matchesFilters(shortcutSearchFields(row), filters))
      && (!platform || row.platform === platform
        || (platform === 'reference' && shortcutCompatibility(row.pack, row.key, system).status === 'reference-only'))) : rows;
    for (const row of query ? filterShortcutRows(scoped, { query }) : scoped) add('shortcut', shortcutId(row), { row });
    if (!context) {
      for (const entry of empty) {
        if (has([entry.name, entry.description, ...entry.platforms], query)) addItem(entry);
      }
    }
  }
  const prefix = `v${VERSION}:` + createHash('sha256').update(JSON.stringify([...scope, identities])).digest('hex').slice(0, 16) + ':';
  return { results, prefix };
}

/**
 * @param {any} [args] Untrusted tool arguments.
 * @param {{ platform?: NodeJS.Platform | 'windows', osRelease?: string }} [options]
 */
function searchCatalog(args = {}, { platform = process.platform, osRelease = release() } = {}) {
  const filters = parseSearch(args);
  const { kind = 'all', query = '', app, context, integration, icon, tag, platform: categoryPlatform, shortcutLanguage, keyboardLayout,
    limit = 20, cursor } = filters;
  const windows = platform === 'win32' || platform === 'windows';
  const build = Number(osRelease.split('.')[2]);
  const system = { platform: windows ? 'windows' : platform === 'darwin' ? 'macos' : platform,
    windowsBuild: windows && Number.isSafeInteger(build) ? build : null,
    shortcutLanguage: shortcutLanguage ?? null, keyboardLayout: keyboardLayout ?? null };
  const scope = [VERSION, catalog.version, kind, query, app, context, integration, icon, tag, categoryPlatform, limit, system];
  const cacheKey = JSON.stringify(scope);
  const cached = cachedSearches.get(cacheKey) ?? buildSearch(scope, filters, system);
  cachedSearches.delete(cacheKey);
  cachedSearches.set(cacheKey, cached);
  if (cachedSearches.size > MAX_CACHED_SEARCHES) cachedSearches.delete(cachedSearches.keys().next().value);
  const { results, prefix } = cached;
  const offset = cursor === undefined ? 0 : cursor.startsWith(prefix) && /^\d{1,8}$/.test(cursor.slice(prefix.length))
    ? Number(cursor.slice(prefix.length)) : -1;
  if (offset < 0 || (cursor !== undefined && (!offset || offset >= results.length || offset % limit !== 0))) {
    throw new Error('Invalid cursor for this catalog search.');
  }
  const end = offset + limit;
  const items = results.slice(offset, end).map(({ row, item }) => row ? shortcutItem(row, system) : structuredClone(item));
  return { version: VERSION, shortcutCatalogVersion: catalog.version, system, total: results.length, items,
    ...(end < results.length ? { nextCursor: prefix + end } : {}) };
}

module.exports = { searchCatalog, inputSchema, outputSchema };
