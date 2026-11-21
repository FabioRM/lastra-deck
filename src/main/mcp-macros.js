// @ts-check
'use strict';

const { validateProfile } = require('./profile');
const { packs, packFor } = require('./shortcut-packs');
const { webPacks } = require('./shortcut-packs-web');
const { isExecutableName } = require('./executable-name');
const { shortcutRequirements, shortcutUnavailable, needsShortcutConfirmation } = require('./shortcut-guards');
const { parseCombo, resolveCombo, mediaKey, VK } = require('./actions/keys');
const { layouts, mapSampleCharacter } = require('./actions/keyboard-samples');
const { conditionFields, waitFields, delayMs } = require('../shared/action-flow');
const { createProfileKeys } = require('../shared/profile-keys');
const { TYPES: VARIABLE_TYPES, MAX_VARIABLES } = require('../shared/value-expressions');

const VERSION = 1;
const MAX_ISSUES = 100;
const ID = /^[a-z0-9_-]{1,40}$/i;
const SURFACES = ['page', 'bar', 'control'];
const PROVIDERS = ['obs', 'audio', 'media'];
const STATUS = ['connected', 'simulated', 'unavailable', 'stale'];
const GESTURES = { tap: 'action', hold: 'hold', doubleTap: 'double' };
const EDIT_FIELDS = { ...GESTURES, confirmation: 'confirm', onBusy: 'onBusy', runVariables: 'runVariables' };
const MODE_PHOTOSHOP = 'the Photoshop workspace';
const UNSUPPORTED_FIELDS = new Set(['macros', 'sharedMacros', 'variables', 'variableRef', 'expressions', 'expression', 'parameters',
  'parameterBindings', 'macroRef', 'repeat', 'inputPrompt']);
const UNSUPPORTED_TYPES = new Set(['macro-ref', 'run-macro', 'call-macro', 'set-variable', 'expression', 'prompt', 'pick-one']);
const PACKS = new Map([...packs, ...webPacks].map((pack) => [pack.id, pack]));

const text = { type: 'string' };
const bool = { type: 'boolean' };
const number = { type: 'integer' };
const action = { type: 'object' };
const optional = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const strings = { type: 'array', items: text };
const object = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
const targetSchema = object({ surface: { enum: SURFACES }, id: text, page: text }, ['surface', 'id']);
const behaviorSchema = object({ tap: action, hold: optional(action), doubleTap: optional(action),
  confirmation: optional({ anyOf: [bool, object({ mode: { enum: ['hold', 'prompt'] }, holdMs: number }, ['mode'])] }),
  onBusy: optional({ enum: ['ignore', 'queue-one'] }), runVariables: optional({ type: 'array', maxItems: MAX_VARIABLES,
    items: object({ id: text, type: { enum: VARIABLE_TYPES }, value: { anyOf: [text, number, bool, action] } }, ['id', 'type', 'value']) }) });
const inputSchema = object({ profile: action, edit: object({ target: targetSchema, behavior: behaviorSchema }, ['target', 'behavior']),
  environment: object({ keyboardLayout: { enum: Object.keys(layouts) }, windowsBuild: { ...number, minimum: 1 },
    foreground: object({ executable: text, appId: text, mode: text }), workspaceIds: { ...strings, maxItems: 24 },
    providers: object(Object.fromEntries(PROVIDERS.map((provider) => [provider, { enum: STATUS }]))) }),
}, ['profile']);
const issueSchema = object({ severity: { enum: ['error', 'warning'] }, code: text, path: text, message: text, relatedPath: text },
  ['severity', 'code', 'path', 'message']);
const outputSchema = object({ version: { const: VERSION }, valid: bool, issues: { type: 'array', maxItems: MAX_ISSUES, items: issueSchema },
  errorCount: number, warningCount: number, truncated: bool, edit: object({ target: targetSchema,
    fields: strings, gestures: object({ tap: text, hold: text, doubleTap: text, confirm: text }),
    placements: number }, ['target', 'fields', 'gestures', 'placements']),
}, ['version', 'valid', 'issues', 'errorCount', 'warningCount', 'truncated']);

const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const pointer = (path, key) => `${path}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;

function allowFields(value, properties, label) {
  if (!record(value) || Object.keys(value).some((field) => !Object.hasOwn(properties, field))) throw new Error(`Use the supported ${label} fields.`);
}

function environmentOf(raw = {}) {
  allowFields(raw, inputSchema.properties.environment.properties, 'environment');
  const { keyboardLayout, windowsBuild, foreground, workspaceIds, providers = {} } = raw;
  if ((keyboardLayout !== undefined && !Object.hasOwn(layouts, keyboardLayout)) ||
      (windowsBuild !== undefined && (!Number.isSafeInteger(windowsBuild) || windowsBuild < 1)) ||
      (workspaceIds !== undefined && (!Array.isArray(workspaceIds) || workspaceIds.length > 24 ||
        workspaceIds.some((id) => typeof id !== 'string' || !ID.test(id))))) throw new Error('Choose a supported environment sample.');
  if (foreground !== undefined) {
    allowFields(foreground, inputSchema.properties.environment.properties.foreground.properties, 'foreground sample');
    if ((!foreground.executable && !foreground.appId) || Object.values(foreground).some((value) => typeof value !== 'string' ||
      !/^\P{Cc}{1,191}$/u.test(value)) || (foreground.executable && !isExecutableName(foreground.executable))) {
      throw new Error('Choose a foreground executable name or Windows app ID.');
    }
  }
  allowFields(providers, inputSchema.properties.environment.properties.providers.properties, 'provider sample');
  if (Object.values(providers).some((value) => !STATUS.includes(value))) throw new Error('Choose a supported provider status.');
  return { keyboardLayout: keyboardLayout ? layouts[keyboardLayout] : undefined, windowsBuild, foreground,
    workspaceIds: workspaceIds ? new Set(workspaceIds) : undefined, providers };
}

function preflight(value, path, issue, ancestors = new Set(), depth = 0, argumentNames = false) {
  if (!value || typeof value !== 'object') return;
  if (ancestors.has(value)) return issue('error', 'cycle', path, 'The supplied macro contains a circular object reference.');
  if (depth > 48) return issue('error', 'nested-data', path, 'The supplied data exceeds the supported nesting depth.');
  ancestors.add(value);
  if (UNSUPPORTED_TYPES.has(value.type)) issue('error', 'unsupported-action', pointer(path, 'type'), `The ${value.type} action is unavailable in Lastra.`);
  for (const [key, child] of Object.entries(value)) {
    const childPath = pointer(path, key);
    const variableDeclaration = key === 'variables' && (path === '/profile' || /^\/profile\/pages\/\d+$/.test(path));
    const declaration = (key === 'macros' && path === '/profile') || (key === 'parameters' && /^\/profile\/macros\/\d+$/.test(path))
      || variableDeclaration || (key === 'expression' && Object.keys(value).length === 1);
    if (variableDeclaration && !Array.isArray(child)) issue('error', 'invalid-variables', childPath, 'Use a list of typed variable definitions.');
    else if (UNSUPPORTED_FIELDS.has(key) && !declaration && !argumentNames) issue('error', 'unsupported-field', childPath, `Lastra has no runtime support for ${key}.`);
    else preflight(child, childPath, issue, ancestors, depth + 1, key === 'args' && value.type === 'macro');
  }
  ancestors.delete(value);
}

function editBehavior(profile, edit, issue) {
  allowFields(edit, inputSchema.properties.edit.properties, 'macro edit');
  const { target, behavior } = edit;
  allowFields(target, targetSchema.properties, 'macro target');
  allowFields(behavior, EDIT_FIELDS, 'macro behavior');
  if (!SURFACES.includes(target.surface) || typeof target.id !== 'string' || !ID.test(target.id)
      || (target.surface === 'page' ? typeof target.page !== 'string' || !ID.test(target.page) : target.page !== undefined)
      || !Object.keys(behavior).length) throw new Error('Choose a valid key or linked control and supply a gesture or confirmation change.');
  const pages = profile.pages ?? [{ id: 'home', keys: profile.keys }];
  const page = target.surface === 'page' && Array.isArray(pages) ? pages.find((item) => item?.id === target.page) : undefined;
  const collection = target.surface === 'control' ? profile.controlBindings : target.surface === 'bar' ? profile.bar?.keys : page?.keys;
  const destination = Array.isArray(collection) ? collection.find((key) => key?.id === target.id) : null;
  if (!destination) return issue('error', 'missing-target', '/edit/target', 'The target key or linked control is missing from the supplied profile.');
  if (destination.controlId) return issue('error', 'linked-placement', '/edit/target', 'Edit the shared definition with a control target, or detach the placement first.');
  if (target.surface === 'control' && Object.hasOwn(behavior, 'runVariables')) {
    return issue('error', 'invalid-variables', '/edit/behavior/runVariables', 'Use profile variables for a linked control’s shared actions.');
  }
  for (const [name, value] of Object.entries(behavior)) {
    const field = EDIT_FIELDS[name];
    if (value === null && name !== 'tap') delete destination[field];
    else destination[field] = value;
  }
  return { target, fields: Object.keys(behavior) };
}

function auditProvider(provider, path, environment, issue) {
  const status = environment.providers[provider];
  if (!status || status === 'unavailable' || status === 'stale') {
    const name = { audio: 'Windows audio', media: 'Windows media', obs: 'OBS' }[provider];
    issue('warning', status ? `provider-${status}` : 'provider-unverified', path, status ? `${name} is ${status} in the supplied sample.`
      : `Verify ${name} availability before running this macro.`);
  }
}

function auditGuard(action, path, profile, environment, issue) {
  const rule = action.shortcutGuard;
  if (!rule) return;
  const pack = PACKS.get(rule.pack);
  if (!pack || Boolean(pack.sites) !== (rule.platform === 'web')) {
    issue('error', 'unsupported-shortcut-pack', pointer(path, 'shortcutGuard'), 'This shortcut guard has no supported app pack for its platform.');
    return;
  }
  const { windowsBuild, foreground, keyboardLayout } = environment;
  const shortcutLanguage = profile.shortcutLanguage;
  const keyboard = keyboardLayout?.id;
  // The environment describes an explicit sample, never the active desktop.
  const target = foreground && { ...foreground, windowId: 1, keyboardLayout: keyboard };
  const reason = target ? shortcutUnavailable(rule, { platform: 'win32', context: target, activePack: packFor(target, profile.webApps),
    shortcutLanguage, build: windowsBuild ?? 0, keys: action.keys })
    : shortcutRequirements(rule, { build: windowsBuild ?? 0, keyboardLayout: keyboard, shortcutLanguage });
  if (reason) issue('warning', 'shortcut-requirement', pointer(path, 'shortcutGuard'), reason);
  if (!target) issue('warning', 'shortcut-target-unverified', pointer(path, 'shortcutGuard'), 'Verify the matching app and foreground window before running this shortcut.');
}

function auditAction(action, path, options, result, issue) {
  const { profile, environment, confirmed, page } = options;
  if (action.type === 'sequence' || action.type === 'repeat') {
    for (const [index, step] of action.steps.entries()) {
      auditAction(step, `${path}/steps/${index}`, options, result, issue);
    }
  }
  if (action.type === 'choose') {
    for (const [index, option] of action.choices.entries()) auditAction(option.action, `${path}/choices/${index}/action`, options, result, issue);
  }
  if (action.type === 'random') {
    for (const [index, option] of action.pool.entries()) auditAction(option, `${path}/pool/${index}`, options, result, issue);
  }
  if (action.type === 'if' || action.type === 'wait-for' || (action.type === 'repeat' && action.condition !== undefined)) {
    const { key } = action.type === 'wait-for' ? waitFields(action) : conditionFields(action);
    if (key.startsWith('obs-')) auditProvider('obs', path, environment, issue);
    if (key === 'speaker-muted' || key === 'microphones-muted') auditProvider('audio', path, environment, issue);
    if (action.type === 'if') {
      auditAction(action.then, `${path}/then`, options, result, issue);
      if (action.else) auditAction(action.else, `${path}/else`, options, result, issue);
    }
  }
  const provider = { audio: 'audio', 'obs-scene': 'obs', 'spotify-playback': 'media' }[action.type];
  if (provider) auditProvider(provider, path, environment, issue);
  if (action.type === 'workspace' && (!environment.workspaceIds || !environment.workspaceIds.has(action.workspace))) {
    issue('warning', environment.workspaceIds ? 'missing-workspace' : 'workspace-unverified', path, environment.workspaceIds
      ? 'The workspace ID is absent from the supplied workspace list.' : 'Verify that the workspace ID exists in Apps → Workspaces.');
  }
  if (['launch', 'open', 'text'].includes(action.type)) {
    const field = action.type === 'text' ? 'text' : 'target';
    if (typeof action[field] !== 'string' || !action[field].trim()) issue('error', 'missing-parameter', pointer(path, field), `Enter a nonempty ${field}.`);
    else if (action.type === 'launch' && /\.(cmd|bat)$/i.test(action.target)) issue('error', 'unsupported-launch', pointer(path, field),
      'Windows batch files require an explicit interpreter executable.');
  }
  if (action.type === 'delay' || action.type === 'media') {
    try { if (action.type === 'delay') delayMs(action); else mediaKey(action.key); }
    catch (problem) { issue('error', 'invalid-parameter', path, problem.message); }
  }
  if (['hotkey', 'text'].includes(action.type) && environment.foreground?.executable) {
    const allowed = action.targetApps ?? page?.apps;
    if (allowed?.length && !allowed.some((app) => app.trim().toLowerCase() === environment.foreground.executable.toLowerCase())) {
      issue('warning', 'foreground-mismatch', path, 'The supplied foreground executable is outside this action’s allowed apps.');
    }
  }
  auditGuard(action, path, profile, environment, issue);
  if (action.requiresPhotoshopWorkspace && !action.shortcutGuard && environment.foreground?.mode !== MODE_PHOTOSHOP) {
    issue('warning', 'shortcut-requirement', path, 'Requires the Photoshop workspace.');
  }
  if (action.type !== 'hotkey') return;
  let chord;
  try { chord = parseCombo(action.keys); }
  catch (problem) { issue('error', 'invalid-chord', pointer(path, 'keys'), problem.message); return; }
  const character = chord.find((key) => key.character !== undefined)?.character;
  if (character !== undefined) {
    if (!environment.keyboardLayout) issue('warning', 'keyboard-layout-unverified', pointer(path, 'keys'), 'A current keyboard layout is needed to map this chord.');
    else {
      const mapping = mapSampleCharacter(character, environment.keyboardLayout);
      if (mapping < 0) {
        issue('warning', 'keyboard-layout-unverified', pointer(path, 'keys'), 'This character is outside the supplied layout sample. Verify it on the active keyboard.');
      } else {
        try { chord = resolveCombo(chord, environment.keyboardLayout.id, () => mapping); }
        catch (problem) { issue('warning', 'layout-incompatible', pointer(path, 'keys'), problem.message); chord = undefined; }
      }
    }
  }
  if (!confirmed && !action.shortcutGuard && needsShortcutConfirmation('', action.keys)) {
    issue('warning', 'confirmation-advised', path, 'Review confirmation for this destructive shortcut.');
  }
  result.set(path, chord);
}

function chordId(chord) {
  if (!chord) return undefined;
  const modifiers = [];
  const keys = [];
  for (const { vk, character, scan, extended } of chord) {
    const id = vk === undefined ? character === undefined ? `scan:${scan}:${extended}` : `char:${character}` : `vk:${vk}`;
    ([VK.ctrl, VK.alt, VK.shift, VK.win, VK.rwin].includes(vk) ? modifiers : keys).push(id);
  }
  return [...modifiers.sort(), ...keys].join('+');
}

function nearbyShortcuts(page, pagePath, chords, controlPaths, resolver) {
  return page.keys.flatMap((key, index) => {
    if (!key) return [];
    const path = `${pagePath}/${index}`;
    const resolved = resolver.resolve(key, page);
    const actionPath = key.controlId ? controlPaths.get(key.controlId) : path;
    return Object.entries(GESTURES).flatMap(([gesture, field]) => {
      const action = resolved[field];
      const chord = action?.type === 'hotkey' && chordId(chords.get(`${actionPath}/${field}`));
      if (!chord) return [];
      const rule = action.shortcutGuard;
      const apps = action.targetApps ?? page.apps ?? [];
      const packApps = rule && PACKS.get(rule.pack)?.executables;
      const allowedApps = apps.length ? apps.map((app) => app.trim().toLowerCase()) : packApps ?? [];
      return [{ path: `${path}/${field}`, gesture: gesture === 'tap' && resolved.confirm ? 'confirm' : gesture,
        chord, rule, allowedApps, control: key.controlId }];
    });
  });
}

function duplicateShortcuts(entries, seen, issue) {
  const byChord = new Map();
  for (const key of entries) {
    const signature = `${key.gesture}/${key.chord}`;
    const previous = byChord.get(signature) ?? [];
    for (const candidate of previous) {
      if (key.control && key.control === candidate.control) continue;
      if (['pack', 'platform', 'mode', 'language', 'layout'].some((field) => key.rule?.[field] !== undefined &&
        candidate.rule?.[field] !== undefined && key.rule[field] !== candidate.rule[field])) continue;
      if (key.allowedApps.length && candidate.allowedApps.length && !key.allowedApps.some((app) => candidate.allowedApps.includes(app))) continue;
      const id = `${candidate.path}/${key.path}`;
      if (seen.has(id)) continue;
      seen.add(id);
      issue('warning', 'duplicate-shortcut', key.path, 'Two visible controls use the same chord for this gesture and may target the same app.', candidate.path);
    }
    previous.push(key);
    byChord.set(signature, previous);
  }
}

function auditProfile(profile, legacy, environment, issue) {
  const resolver = createProfileKeys(profile);
  const chords = new Map();
  const controlPaths = new Map();
  const audit = (raw, path, page) => {
    if (!raw || raw.controlId) return;
    const key = resolver.resolve(raw, page);
    for (const field of Object.values(GESTURES)) if (key[field]) {
      auditAction(key[field], `${path}/${field}`, { profile, environment, page, confirmed: Boolean(key.confirm) }, chords, issue);
    }
  };
  for (const [index, definition] of (profile.controlBindings ?? []).entries()) {
    const path = `/profile/controlBindings/${index}`;
    controlPaths.set(definition.id, path);
    audit(definition, path);
  }
  const seen = new Set();
  const barPath = '/profile/bar/keys';
  profile.bar.keys.forEach((key, index) => audit(key, `${barPath}/${index}`, profile.bar));
  const bar = nearbyShortcuts(profile.bar, barPath, chords, controlPaths, resolver);
  for (const [index, page] of profile.pages.entries()) {
    const path = legacy ? '/profile/keys' : `/profile/pages/${index}/keys`;
    page.keys.forEach((key, index) => audit(key, `${path}/${index}`, page));
    duplicateShortcuts([...nearbyShortcuts(page, path, chords, controlPaths, resolver), ...bar], seen, issue);
  }
}

function composeMacro(args) {
  allowFields(args, inputSchema.properties, 'macro request');
  if (!record(args.profile)) throw new Error('Supply a Lastra profile object.');
  const environment = environmentOf(args.environment);
  const errorIssues = [];
  const warningIssues = [];
  let errorCount = 0;
  let warningCount = 0;
  const issue = (severity, code, path, message, relatedPath) => {
    if (severity === 'error') errorCount++;
    else warningCount++;
    const list = severity === 'error' ? errorIssues : warningIssues;
    if (list.length < MAX_ISSUES) list.push({ severity, code, path: path.slice(0, 280), message: message.slice(0, 280),
      ...(relatedPath ? { relatedPath } : {}) });
  };
  const result = (edit) => ({ version: VERSION, valid: errorCount === 0, issues: [...errorIssues, ...warningIssues].slice(0, MAX_ISSUES),
    errorCount, warningCount, truncated: errorCount + warningCount > MAX_ISSUES, ...(edit ? { edit } : {}) });
  preflight(args.profile, '/profile', issue);
  preflight(args.edit, '/edit', issue);
  if (errorCount) return result();

  const raw = args.edit === undefined ? args.profile : structuredClone(args.profile);
  const edit = args.edit === undefined ? undefined : editBehavior(raw, structuredClone(args.edit), issue);
  if (errorCount) return result();
  let profile;
  try { profile = validateProfile(raw); }
  catch (problem) {
    issue('error', problem.code ?? 'invalid-profile', problem.code === 'macro-cycle' ? '/profile/macros' : '/profile', problem.message);
    return result();
  }
  auditProfile(profile, raw.pages === undefined, environment, issue);
  if (edit && !errorCount) {
    const { target } = edit;
    const page = target.surface === 'control' ? undefined : target.surface === 'bar' ? profile.bar : profile.pages.find(({ id }) => id === target.page);
    const collection = page?.keys ?? profile.controlBindings;
    const key = createProfileKeys(profile).resolve(collection.find((item) => item?.id === target.id), page);
    edit.gestures = Object.fromEntries(Object.entries(GESTURES).filter(([, field]) => key[field])
      .map(([gesture, field]) => [gesture === 'tap' && key.confirm ? 'confirm' : gesture, key[field].type]));
    edit.placements = target.surface === 'control' ? [...profile.pages, profile.bar].flatMap(({ keys }) => keys)
      .filter((item) => item?.controlId === target.id).length : 1;
  }
  return result(errorCount ? undefined : edit);
}

module.exports = { composeMacro, inputSchema, outputSchema };
