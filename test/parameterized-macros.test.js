'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { ProfileStore, validateProfile, toView } = require('../src/main/profile');
const { createActionRunner } = require('../src/main/actions');
const { packFor } = require('../src/main/shortcut-packs');
const { actionNeedsShortcutTarget, shortcutUnavailable, US_LAYOUT } = require('../src/main/shortcut-guards');
const { createMacroResolver } = require('../src/shared/parameterized-macros');
const { createProfileKeys } = require('../src/shared/profile-keys');

const ref = (parameter) => ({ parameter });
const call = (macro, args, settings) => ({ type: 'macro', macro, ...(args ? { args } : {}), ...settings });
const macro = (id, parameters, action) => ({ id, label: id, parameters, action });
const sequence = (...steps) => ({ type: 'sequence', steps });

const configured = [
  macro('message', [{ id: 'message', type: 'string' }, { id: 'delay', type: 'integer', default: 125 }],
    sequence({ type: 'delay', ms: ref('delay') }, { type: 'text', text: ref('message') })),
  macro('workflow', [{ id: 'name', type: 'string' }, { id: 'wanted', type: 'boolean', default: false }], {
    type: 'if', condition: 'obs-recording', expected: ref('wanted'), then: call('message', { message: ref('name') }),
    else: { type: 'launch', target: 'fixture.exe', args: ['--name', ref('name')] },
  }),
];

test('macro expansion binds typed values, defaults and forwarded parameters without changing declarations', () => {
  const before = structuredClone(configured);
  const { resolve, sample, definitions } = createMacroResolver(configured);
  const literal = '${ordinary_text} && example';
  const expanded = resolve(call('workflow', { name: literal }));
  assert.deepEqual(expanded, { type: 'if', condition: 'obs-recording', expected: false,
    then: sequence({ type: 'delay', ms: 125 }, { type: 'text', text: literal }),
    else: { type: 'launch', target: 'fixture.exe', args: ['--name', literal] } });
  assert.deepEqual(configured, before);
  assert.equal(sample(definitions[1]).then.steps[1].text, 'sample');
  assert.equal(resolve(call('message', { message: 'second', delay: 0 })).steps[0].ms, 0);
  assert.equal(resolve(call('workflow', { name: 'third', wanted: true })).expected, true);
  const direct = sequence({ type: 'text', text: 'literal' });
  assert.equal(resolve(direct), direct);
});

test('errors identify missing, unknown and incompatible arguments without coercing them', () => {
  const { resolve } = createMacroResolver(configured);
  assert.throws(() => resolve(call('message')), /argument “message” is required/);
  assert.throws(() => resolve(call('unknown')), /macro .* is unavailable/);
  assert.throws(() => resolve(call('message', { message: 'hi', invalid: true })), /unknown argument/);
  assert.throws(() => resolve(call('message', { message: 'hi', delay: '20' })), /delay.*must be integer/);
  assert.throws(() => resolve(call('message', { message: ref('outside') })), /parameter .* is unavailable/);
  assert.throws(() => resolve(call('workflow', { name: 'hi', wanted: 0 })), /must be boolean/);
  assert.throws(() => createMacroResolver([macro('bad-default', [{ id: 'wait', type: 'integer', default: 1.25 }], { type: 'delay', ms: 5 })]), /default must be integer/);
});

test('parameters cannot alter action types, foreground guards, conditions, or a call’s policy', () => {
  for (const action of [
    { type: ref('value'), text: 'plain' },
    { type: 'hotkey', keys: 'Ctrl+F', targetApps: [ref('value')] },
    { type: 'hotkey', keys: 'Ctrl+F', shortcutGuard: { pack: ref('value') } },
    { type: 'if', condition: ref('value'), expected: true, then: { type: 'delay', ms: 20 } },
    call('inner', {}, { onError: ref('value') }),
  ]) {
    const library = createMacroResolver([macro('outer', [{ id: 'value', type: 'string' }], action),
      macro('inner', [], { type: 'delay', ms: 12 })]);
    assert.throws(() => library.resolve(call('outer', { value: 'text' })), /must use a literal value/);
  }
  const library = createMacroResolver([macro('outer', [{ id: 'value', type: 'string' }], call('inner', { delay: ref('value') })),
    macro('inner', [{ id: 'delay', type: 'integer' }], { type: 'delay', ms: ref('delay') })]);
  assert.throws(() => library.sample(library.definitions[0]), /must be integer/);
});

test('cycles and depth are bounded and deliberate clipboard copies resolve independently', () => {
  const cyclic = createMacroResolver([macro('alpha', [], call('beta')), macro('beta', [], sequence(call('alpha')))]);
  assert.throws(() => cyclic.sample(cyclic.definitions[0]), { code: 'macro-cycle', message: /alpha → beta → alpha/ });
  const chain = Array.from({ length: 18 }, (_, index) => macro(`macro-${index}`, [],
    index === 17 ? { type: 'delay', ms: 200 } : call(`macro-${index + 1}`)));
  assert.throws(() => createMacroResolver(chain).resolve(call('macro-0')), /up to 16/);
  const clipboard = createProfileKeys({ macros: configured }).materialize('group', { keys: [null,
    { id: 'test', action: call('message', { message: 'from clipboard' }) }] });
  assert.equal(clipboard.keys[0], null);
  assert.deepEqual(clipboard.keys[1].action, sequence({ type: 'delay', ms: 125 }, { type: 'text', text: 'from clipboard' }));
});

test('saved macro calls keep their identifiers while page and bar views use expanded audio and OBS actions', () => {
  const scene = { type: 'obs-scene', scene: ref('selected-scene') };
  const profile = validateProfile({ macros: [macro('camera', [{ id: 'selected-scene', type: 'string' }], scene),
    macro('mute', [{ id: 'device', type: 'string', default: 'output' }], { type: 'audio', device: ref('device') })],
  pages: [{ id: 'home', keys: [{ id: 'camera-one', action: call('camera', { 'selected-scene': 'Camera 1' }) }] }],
  bar: { keys: [{ id: 'camera-two', action: call('camera', { 'selected-scene': 'Camera 2' }) }, { id: 'audio', action: call('mute') }] } });
  const store = new ProfileStore({});
  store.current = profile;
  assert.equal(profile.pages[0].keys[0].action.type, 'macro');
  assert.deepEqual(store.findKey('camera-one').action, { type: 'obs-scene', scene: 'Camera 1' });
  assert.deepEqual(store.findKey('camera-two', profile.bar).action, { type: 'obs-scene', scene: 'Camera 2' });
  const view = toView(profile);
  assert.equal(view.slots[0].liveSource, 'obs-scene');
  assert.equal(view.slots[0].sceneTarget.scene, 'Camera 1');
  assert.equal(view.bar.keys[0].sceneTarget.scene, 'Camera 2');
  assert.equal(view.bar.keys[1].audio, 'output');
  assert.doesNotMatch(JSON.stringify(view), /"action"|selected-scene/);
});

test('expanded shortcuts preserve confirmation, the verified foreground and fixed editing comparisons', async () => {
  const rule = { pack: 'outlook-new', application: 'Outlook', platform: 'windows', mode: 'Mail', layout: US_LAYOUT };
  const source = { macros: [macro('mail-shortcut', [{ id: 'chord', type: 'string' }], { type: 'hotkey', keys: ref('chord'), shortcutGuard: rule })],
    keys: [{ id: 'remove-email', action: call('mail-shortcut', { chord: 'Shift+Delete' }) }] };
  assert.throws(() => validateProfile(source), /requires confirmation/);
  assert.throws(() => validateProfile({ ...source, keys: [{ id: 'hold', action: { type: 'delay', ms: 100 }, hold: source.keys[0].action }] }), /assign this shortcut.*confirmation/);
  const profile = validateProfile({ ...source, keys: [{ ...source.keys[0], confirm: { mode: 'prompt' } }] });
  const store = new ProfileStore({});
  store.current = profile;
  const key = store.findKey('remove-email');
  assert.equal(actionNeedsShortcutTarget(key.action), true);
  assert.equal(toView(profile).slots[0].confirm, 'prompt');
  assert.deepEqual(key.action.shortcutGuard, rule);
  let context = { id: '1:10', windowId: 10n, executable: 'olk.exe', mode: 'Calendar', keyboardLayout: US_LAYOUT };
  const calls = [];
  const readForeground = Object.assign(() => context.executable, { context: () => context, windowId: () => context.windowId });
  const runner = createActionRunner({ readForeground, readShortcutSettings: () => ({ platform: 'win32' }),
    input: { sendChord: (keys) => calls.push(keys.map(({ name }) => name)) } });
  assert.match(toView(profile, { unavailable: ({ action }) => shortcutUnavailable(action.shortcutGuard,
    { platform: 'win32', activePack: packFor(context), context }) }).slots[0].unavailable, /Mail/);
  assert.match((await runner.run(key.action)).message, /Mail/);
  context = { ...context, mode: 'Mail' };
  assert.equal((await runner.run(key.action)).ok, true);
  assert.deepEqual(calls, [['shift', 'delete']]);

  const copy = validateProfile({ macros: [macro('copy', [], { type: 'hotkey', keys: 'Ctrl+C' })],
    keys: [{ id: 'copy', action: call('copy') }] });
  assert.equal(toView(copy, { editingKeys: [{ id: 'edit:copy', shortcut: 'Ctrl+C' }] }).slots[0], null);
  assert.equal(toView(copy, { deduplicateEditing: false }).slots[0].id, 'copy');
});

test('a macro wrapper uses the caller’s retry policy and the existing simulated runner', async () => {
  const defs = [macro('start', [{ id: 'file', type: 'string' }], { type: 'launch', target: ref('file') }),
    macro('mute', [], { type: 'audio', device: 'output' })];
  const retry = { onError: 'retry', attempts: 2 };
  assert.throws(() => validateProfile({ macros: defs, keys: [{ id: 'bad', action: sequence(call('mute', {}, retry)) }] }), /cannot be retried safely/);
  const profile = validateProfile({ macros: defs, keys: [{ id: 'good', action: sequence(call('start', { file: 'fixture.exe' }, retry)) }] });
  const store = new ProfileStore({});
  store.current = profile;
  const calls = [];
  const runner = createActionRunner({ sleep: async () => {}, spawn(target) {
    const child = new EventEmitter();
    child.unref = () => {};
    calls.push(target);
    queueMicrotask(() => calls.length === 1 ? child.emit('error', new Error('Fixture')) : child.emit('spawn'));
    return child;
  } });
  assert.equal((await runner.run(store.findKey('good').action)).ok, true);
  assert.deepEqual(calls, ['fixture.exe', 'fixture.exe']);
});

test('profile validation checks the expanded receiver’s supported values at each call', () => {
  assert.throws(() => validateProfile({ macros: configured,
    keys: [{ id: 'bad', action: call('message', { message: 'fixture', delay: -1 }) }] }), /Invalid delay/);
  assert.throws(() => validateProfile({ macros: [macro('key', [{ id: 'chord', type: 'string' }], { type: 'hotkey', keys: ref('chord') })],
    keys: [{ id: 'bad', action: call('key', { chord: 'Ctrl+unknown-fixture' }) }] }), /Unknown key/);
});
