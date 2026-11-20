'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compileExpression, createExpressionScope } = require('../src/shared/value-expressions');
const { createProfileKeys } = require('../src/shared/profile-keys');
const { ProfileStore, validateProfile, toView } = require('../src/main/profile');
const { composeMacro } = require('../src/main/mcp-macros');
const { simulateGesture } = require('../src/main/mcp-simulate');
const { actionNeedsShortcutTarget, US_LAYOUT } = require('../src/main/shortcut-guards');
const { AgentDrafts } = require('../src/main/mcp-drafts');

const expression = (node) => ({ expression: node });
const op = (operator, ...args) => ({ op: operator, args });
const ref = (scope, id) => ({ scope, var: id });
const variable = (id, type, value) => ({ id, type, value });

test('explicit profile, page and run references remain distinct and runs have independent values', () => {
  const profile = createExpressionScope('profile', [variable('length', 'integer', 100), variable('prefix', 'string', 'step')]);
  const page = createExpressionScope('page', [variable('length', 'integer', expression(op('multiply', ref('profile', 'length'), 2)))], profile);
  const newRun = (amount) => createExpressionScope('run', [variable('length', 'integer', expression(op('add', ref('page', 'length'), amount)))], page);
  const first = newRun(20);
  const second = newRun(40);
  const title = expression(op('concat', ref('profile', 'prefix'), ' ', op('to-string', ref('run', 'length'))));
  profile.check();
  page.check();
  first.check();
  second.check();
  assert.equal(first.resolve(title, 'string'), 'step 220');
  assert.equal(second.resolve(title, 'string'), 'step 240');
  assert.equal(first.resolve(expression(ref('profile', 'length')), 'integer'), 100);
  assert.equal(first.resolve(expression(ref('page', 'length')), 'integer'), 200);
  assert.equal(first.resolve(title, 'string'), 'step 220');
  assert.deepEqual(profile.definitions[0], variable('length', 'integer', 100));
});

test('missing variables, inaccessible scopes, and even statically hidden cycles are reported', () => {
  const circular = createExpressionScope('profile', [variable('a', 'integer', expression(op('if', true, 5, ref('profile', 'b')))),
    variable('b', 'integer', expression(ref('profile', 'a')))]);
  assert.throws(() => circular.check(), { code: 'variable-cycle', message: /a → b → a/ });
  const profile = createExpressionScope('profile', [variable('page', 'integer', expression(ref('page', 'thing')))]);
  assert.throws(() => profile.check(), { code: 'missing-variable', message: /Scope “page” is unavailable/ });
  const bar = createExpressionScope('run', undefined, createExpressionScope('profile'));
  assert.throws(() => bar.resolve(expression(ref('profile', 'missing')), 'string'), { code: 'missing-variable', message: /profile\.missing/ });
  assert.throws(() => bar.resolve(expression(ref('page', 'hidden')), 'string'), { code: 'missing-variable', message: /page\.hidden/ });
});

test('computes typed, bounded values from enumerated operators and short circuits logical branches', () => {
  const run = createExpressionScope('run');
  assert.equal(run.resolve(expression(op('and', false, op('equal', op('divide', 1, 0), 1))), 'boolean'), false);
  assert.equal(run.resolve(expression(op('if', op('less-than', 2, 4), op('divide', 11, 2), op('divide', 1, 0))), 'integer'), 5);
  assert.throws(() => run.resolve(expression(op('concat', 'x', 1)), 'string'), { code: 'expression-type' });
  assert.throws(() => run.resolve(expression(op('if', false, 'left', true)), 'string'), { code: 'expression-type' });
  assert.throws(() => run.resolve(expression(op('divide', 1, 0)), 'integer'), { code: 'expression-range' });
  assert.throws(() => run.resolve(expression(op('add', Number.MAX_SAFE_INTEGER, 1)), 'integer'), { code: 'expression-range' });
  assert.throws(() => run.resolve(expression(op('concat', 'x'.repeat(4096), 'y')), 'string'), { code: 'expression-range' });
  assert.throws(() => run.resolve(expression(op('execute', 'file.exe')), 'string'), { code: 'invalid-expression' });
  assert.throws(() => run.resolve(expression(op('constructor', 1, 2)), 'string'), { code: 'invalid-expression' });
  assert.throws(() => run.resolve(expression(Array.from({ length: 30 }).reduce((node) => op('not', node), false)), 'boolean'), /deeply nested/);
  assert.equal(compileExpression(expression(op('add', ref('page', 'length'), 3)), 'integer').references[0].id, 'length');
});

test('the saved deck, macro argument, condition, and simulator use the same scoped values', async () => {
  const key = { id: 'camera', label: 'Fallback', icon: 'camera',
    labelExpression: expression(op('concat', 'Camera ', ref('page', 'name'))),
    iconExpression: expression(ref('profile', 'icon')),
    runVariables: [variable('pause', 'integer', expression(op('add', ref('page', 'pause'), 25)))],
    action: { type: 'macro', macro: 'select-scene', args: { delay: expression(ref('run', 'pause')) } } };
  const source = { variables: [variable('icon', 'string', 'video'), variable('ready', 'boolean', true)],
    macros: [{ id: 'select-scene', label: 'Scene', parameters: [{ id: 'delay', type: 'integer' }],
      action: { type: 'if', condition: 'obs-connected', expected: expression(ref('profile', 'ready')),
        then: { type: 'sequence', steps: [{ type: 'delay', ms: { parameter: 'delay' } },
          { type: 'obs-scene', scene: expression(ref('page', 'name')) }] } } }],
    pages: [
      { id: 'wide', variables: [variable('name', 'string', 'Wide'), variable('pause', 'integer', 100)], keys: [key] },
      { id: 'close', variables: [variable('name', 'string', 'Close'), variable('pause', 'integer', 275)], keys: [key] },
    ] };
  const profile = validateProfile(source);
  assert.deepEqual(profile.pages[0].keys[0].action, key.action);
  assert.deepEqual(profile.pages[0].variables, source.pages[0].variables);
  const store = new ProfileStore({});
  store.current = profile;
  assert.equal(store.findKey('camera', profile.pages[0]).action.then.steps[1].scene, 'Wide');
  assert.equal(store.findKey('camera', profile.pages[1]).action.then.steps[0].ms, 300);
  assert.equal(toView(profile, { page: profile.pages[0], icon: (name) => name }).slots[0].label, 'Camera Wide');
  assert.equal(toView(profile, { page: profile.pages[1], icon: (name) => name }).slots[0].icon, 'video');
  const inputs = { profile: source, key: 'camera', values: { 'obs-connected': true } };
  const results = await Promise.all(['wide', 'close'].map((page) => simulateGesture({ ...inputs, page })));
  assert.deepEqual(results.map(({ elapsedMs, effects }) => [elapsedMs, effects]), [
    [125, [{ atMs: 125, type: 'obs-scene', bus: 'program' }]], [300, [{ atMs: 300, type: 'obs-scene', bus: 'program' }]],
  ]);
  assert.deepEqual((await simulateGesture({ ...inputs, values: { 'obs-connected': false } })).effects, []);
  const clip = createProfileKeys(profile).materialize('page', profile.pages[0], profile.pages[0]);
  assert.equal(clip.variables, undefined);
  assert.equal(clip.keys[0].runVariables, undefined);
  assert.equal(clip.keys[0].labelExpression, undefined);
  assert.equal(clip.keys[0].action.then.steps[0].ms, 125);
  assert.doesNotThrow(() => validateProfile({ pages: [clip] }));
});

test('expanded chords pass through confirmation, target and layout checks, including after a computed delay', async () => {
  const guard = { pack: 'excel', application: 'Microsoft Excel', platform: 'windows', layout: US_LAYOUT, confirm: true };
  const key = { id: 'command', runVariables: [variable('pause', 'integer', 250)], action: { type: 'sequence', steps: [
    { type: 'delay', ms: expression(ref('run', 'pause')) }, { type: 'hotkey', shortcutGuard: guard, keys: expression(ref('profile', 'chord')) },
  ] } };
  const profile = { variables: [variable('chord', 'string', expression(op('concat', 'Ctrl+', 'F')))],
    pages: [{ id: 'work', apps: ['excel.exe'], keys: [key] }] };
  assert.throws(() => validateProfile(profile), /requires confirmation/);
  key.confirm = { mode: 'prompt' };
  const saved = validateProfile(profile);
  assert.equal(actionNeedsShortcutTarget(createProfileKeys(saved).resolve(saved.pages[0].keys[0], saved.pages[0]).action), true);
  const fixture = { profile, key: 'command', values: { foreground: 'excel.exe' }, windowId: 40, keyboardLayout: 'us' };
  assert.equal((await simulateGesture(fixture)).status, 'confirmation-required');
  const confirmed = { ...fixture, confirmed: true };
  assert.deepEqual((await simulateGesture(confirmed)).effects, [{ atMs: 250, type: 'chord' }]);
  const switched = await simulateGesture({ ...confirmed, timeline: [{ atMs: 80, windowId: 41 }] });
  assert.equal(switched.status, 'unavailable');
  assert.deepEqual(switched.effects, []);
  const mismatch = await simulateGesture({ ...confirmed, timeline: [{ atMs: 80, keyboardLayout: 'it' }] });
  assert.equal(mismatch.status, 'unavailable');
  assert.deepEqual(mismatch.effects, []);
});

test('scope errors identify the used field, and linked controls keep matching behavior across both surfaces', () => {
  const named = variable('device', 'string', 'output');
  const control = { id: 'volume', label: 'Audio', action: { type: 'audio', device: expression(ref('profile', 'device')) } };
  const placement = { id: 'audio', controlId: 'volume', labelExpression: expression(ref('page', 'name')) };
  const source = { variables: [named], controlBindings: [control],
    pages: [{ id: 'main', variables: [variable('name', 'string', 'Speakers'), variable('device', 'string', 'microphone')], keys: [placement] }],
    bar: { keys: [{ id: 'bar-audio', controlId: 'volume' }] } };
  const view = toView(validateProfile(source));
  assert.equal(view.slots[0].label, 'Speakers');
  assert.equal(view.slots[0].audio, 'output');
  assert.equal(view.bar.keys[0].audio, 'output');
  source.bar.keys[0].labelExpression = placement.labelExpression;
  assert.throws(() => validateProfile(source), { code: 'missing-variable', message: /persistent bar.*Key label.*page\.name/ });
  delete source.bar.keys[0].labelExpression;
  control.action.device = expression(ref('page', 'device'));
  assert.throws(() => validateProfile(source), { code: 'missing-variable', message: /linked control.*audio\.device.*page\.device/ });
  const protectedAction = { type: 'hotkey', keys: 'Ctrl+F', targetApps: expression(ref('profile', 'device')) };
  assert.throws(() => validateProfile({ variables: [named], keys: [{ id: 'key', action: protectedAction }] }), /hotkey\.targetApps.*literal/);
});

test('MCP composition reports typed variable errors and conflicts and drafts retain scoped definitions', () => {
  const chord = { type: 'hotkey', keys: expression(ref('run', 'chord')) };
  const profile = { variables: [variable('shared', 'string', 'Ctrl+F')], pages: [{ id: 'home', keys: [
    { id: 'command', action: { type: 'hotkey', keys: 'Ctrl+F' } }, { id: 'draft', action: { type: 'delay', ms: 100 } },
  ] }] };
  const edit = { target: { surface: 'page', id: 'draft', page: 'home' }, behavior: { tap: chord,
    runVariables: [variable('chord', 'string', expression(ref('profile', 'shared')))] } };
  const valid = composeMacro({ profile, edit });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.issues.map(({ code }) => code), ['duplicate-shortcut']);
  assert.equal(valid.edit.gestures.tap, 'hotkey');
  edit.behavior.runVariables[0].value = expression(ref('profile', 'missing'));
  assert.equal(composeMacro({ profile, edit }).issues[0].code, 'missing-variable');
  edit.behavior.runVariables[0].value = expression(op('divide', 1, 0));
  assert.equal(composeMacro({ profile, edit }).issues[0].code, 'expression-type');
  const drafts = new AgentDrafts();
  const draft = drafts.create('fixture', 'work', profile);
  const updated = drafts.change('fixture', 'work', { command: 'edit', draft: draft.id, revision: 1, edits: [
    { op: 'profile-settings', settings: { variables: [variable('shared', 'string', 'Ctrl+K')] } },
    { op: 'page-settings', page: 'home', settings: { variables: [variable('title', 'string', 'Home')] } },
  ] });
  assert.equal(updated.revision, 2);
});
