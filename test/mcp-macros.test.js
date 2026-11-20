'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { composeMacro, inputSchema, outputSchema } = require('../src/main/mcp-macros');
const { US_LAYOUT } = require('../src/main/shortcut-guards');
const { createSession } = require('../extensions/lastra-mcp/stdio');
const defaultProfile = require('../profiles/default.json');

const delay = (ms = 100) => ({ type: 'delay', ms });
const hotkey = (keys, targetApps) => ({ type: 'hotkey', keys, ...(targetApps ? { targetApps } : {}) });
const sequence = (...steps) => ({ type: 'sequence', steps });
const key = (id, action) => ({ id, action });
const patch = (id, behavior, surface = 'page') => ({ target: { surface, id, ...(surface === 'page' ? { page: 'home' } : {}) }, behavior });

test('offline macro edits compose gestures and confirmations without changing the supplied profile', () => {
  const profile = { keys: [key('pause', { type: 'unsupported-original' })] };
  const before = structuredClone(profile);
  const edit = patch('pause', { tap: delay(), hold: delay(500), doubleTap: delay(250), onBusy: 'queue-one' });
  const result = composeMacro({ profile, edit });
  assert.equal(result.valid, true);
  assert.deepEqual(result.edit, { target: edit.target, fields: ['tap', 'hold', 'doubleTap', 'onBusy'],
    gestures: { tap: 'delay', hold: 'delay', doubleTap: 'delay' }, placements: 1 });
  assert.deepEqual(profile, before);
  const confirmed = composeMacro({ profile: { keys: [{ ...key('pause', delay()), hold: delay() }] },
    edit: patch('pause', { confirmation: { mode: 'prompt' }, hold: null }) });
  assert.equal(confirmed.valid, true);
  assert.deepEqual(confirmed.edit.gestures, { confirm: 'delay' });
  const invalid = composeMacro({ profile: { keys: [key('pause', delay())] }, edit: patch('pause', { confirmation: true, hold: delay() }) });
  assert.equal(invalid.valid, false);
  assert.match(invalid.issues[0].message, /confirmation uses a single gesture/);
});

test('edits to linked definitions apply to every placement in the proposed profile', () => {
  const profile = { controlBindings: [{ id: 'linked', label: 'Shared', action: delay() }],
    pages: [{ id: 'home', keys: [{ id: 'page-key', controlId: 'linked' }] }], bar: { keys: [{ id: 'bar-key', controlId: 'linked' }] } };
  const definition = composeMacro({ profile, edit: patch('linked', { tap: delay(1250) }, 'control') });
  assert.equal(definition.valid, true);
  assert.equal(definition.edit.placements, 2);
  const wrong = composeMacro({ profile, edit: patch('bar-key', { hold: delay() }, 'bar') });
  assert.deepEqual(wrong.issues.map(({ code }) => code), ['linked-placement']);
  assert.equal(composeMacro({ profile, edit: patch('absent', { tap: delay() }) }).issues[0].code, 'missing-target');
  assert.equal(profile.controlBindings[0].action.ms, 100);
});

test('real action, widget, wait and retry validators supply definite errors', () => {
  assert.equal(composeMacro({ profile: defaultProfile }).valid, true);
  const errors = composeMacro({ profile: { keys: [key('invalid', sequence(hotkey('Ctrl+does-not-exist'), delay(70000),
    { type: 'launch', target: 'script.bat' }, { type: 'text', text: ' ' }, { type: 'media', key: 'unexpected' }))] } });
  assert.equal(errors.valid, false);
  assert.deepEqual(errors.issues.map(({ code, path }) => [code, path]), [
    ['invalid-chord', '/profile/keys/0/action/steps/0/keys'], ['invalid-parameter', '/profile/keys/0/action/steps/1'],
    ['unsupported-launch', '/profile/keys/0/action/steps/2/target'], ['missing-parameter', '/profile/keys/0/action/steps/3/text'],
    ['invalid-parameter', '/profile/keys/0/action/steps/4'],
  ]);
  for (const [action, message] of [
    [sequence({ type: 'audio', device: 'output', onError: 'retry' }), /cannot be retried safely/],
    [{ type: 'wait-for', condition: 'obs-connected', expected: true, timeoutMs: 0 }, /Wait timeout/],
    [{ type: 'if', condition: 'foreground', expected: true, then: delay() }, /expected value/],
    [{ ...hotkey('Ctrl+W'), shortcutGuard: { pack: 'chrome', application: 'Chrome', platform: 'windows', confirm: true } }, /requires confirmation/],
  ]) assert.match(composeMacro({ profile: { keys: [key('a', action)] } }).issues[0].message, message);
  assert.match(composeMacro({ profile: { keys: [], widgets: [{ id: 'x', type: 'audio-fader', settings: { defaultLevel: 105 } }] } })
    .issues[0].message, /invalid "defaultLevel"/);
});

test('configured samples identify stale providers, missing workspaces, guard mismatches and AltGr', () => {
  const guard = { pack: 'excel', application: 'Microsoft Excel', platform: 'windows', mode: 'an Excel worksheet', layout: US_LAYOUT };
  const profile = { keys: [key('production', sequence({ type: 'wait-for', condition: 'obs-connected', expected: true },
    { type: 'obs-scene', scene: 'Test scene' }, { type: 'audio', device: 'microphone' }, { type: 'workspace', workspace: 'demo' },
    { ...hotkey('Ctrl+char:`', ['excel.exe']), shortcutGuard: guard }, { type: 'spotify-playback' }))] };
  const environment = { keyboardLayout: 'it142', providers: { obs: 'unavailable', audio: 'stale', media: 'simulated' },
    workspaceIds: [], foreground: { executable: 'code.exe' }, windowsBuild: 26100 };
  const known = composeMacro({ profile, environment });
  assert.equal(known.valid, true);
  assert.deepEqual(known.issues.map(({ code }) => code), ['provider-unavailable', 'provider-unavailable', 'provider-stale',
    'missing-workspace', 'foreground-mismatch', 'shortcut-requirement', 'layout-incompatible']);
  assert.match(known.issues.at(-1).message, /AltGr/);
  assert.match(known.issues.find(({ code }) => code === 'shortcut-requirement').message, /Microsoft Excel/);
  const unknown = composeMacro({ profile });
  assert.ok(unknown.issues.some(({ code }) => code === 'keyboard-layout-unverified'));
  assert.ok(unknown.issues.some(({ code }) => code === 'shortcut-target-unverified'));
  assert.ok(unknown.issues.some(({ code }) => code === 'provider-unverified'));
  const outsideSample = composeMacro({ profile: { keys: [key('accent', hotkey('Ctrl+char:é'))] }, environment: { keyboardLayout: 'it' } });
  assert.equal(outsideSample.valid, true);
  assert.equal(outsideSample.issues[0].code, 'keyboard-layout-unverified');
  const supported = composeMacro({ profile: { keys: [key('guarded', { ...hotkey('Ctrl+F'), shortcutGuard: guard })] }, environment: {
    keyboardLayout: 'us', windowsBuild: 26100, foreground: { executable: 'excel.exe', mode: 'an Excel worksheet' },
  } });
  assert.deepEqual(supported.issues, []);
  const unsupported = composeMacro({ profile: { keys: [key('missing', { ...hotkey('Ctrl+F'), shortcutGuard: { ...guard, pack: 'made-up' } })] } });
  assert.equal(unsupported.issues[0].code, 'unsupported-shortcut-pack');
});

test('conflict detection compares co-visible chords without flagging linked copies or separate apps and pages', () => {
  const profile = { controlBindings: [{ id: 'linked', label: 'Shared action', action: hotkey('Ctrl+Shift+F', ['code.exe']) }],
    pages: [{ id: 'home', apps: ['code.exe'], keys: [{ id: 'shared', controlId: 'linked' }, key('same-scope', hotkey('Shift+Control+F'))] },
      { id: 'alternate', apps: ['chrome.exe'], keys: [key('different-scope', hotkey('Ctrl+Shift+F'))] }],
    bar: { keys: [{ id: 'shared-bar', controlId: 'linked' }] } };
  const { issues } = composeMacro({ profile });
  assert.deepEqual(issues.map(({ code, path, relatedPath }) => [code, path, relatedPath]), [
    ['duplicate-shortcut', '/profile/pages/0/keys/1/action', '/profile/pages/0/keys/0/action'],
    ['duplicate-shortcut', '/profile/bar/keys/0/action', '/profile/pages/0/keys/1/action'],
  ]);
});

test('detects circular structure and unsupported variable or macro features and limits report size', () => {
  const cyclic = sequence();
  cyclic.steps.push(cyclic);
  assert.equal(composeMacro({ profile: { keys: [key('loop', cyclic)] } }).issues[0].code, 'cycle');
  const unsupported = composeMacro({ profile: { variables: { example: 'hello' }, keys: [key('call', { type: 'call-macro', macroRef: 'sample' })] } });
  assert.equal(unsupported.valid, false);
  assert.deepEqual(unsupported.issues.map(({ code, path }) => [code, path]), [['invalid-variables', '/profile/variables'],
    ['unsupported-action', '/profile/keys/0/action/type'], ['unsupported-field', '/profile/keys/0/action/macroRef']]);
  const repeated = sequence(...Array.from({ length: 20 }, () => sequence(...Array.from({ length: 20 }, () => ({ type: 'audio', device: 'output' })))));
  const crowded = composeMacro({ profile: { keys: [key('many', sequence(repeated, hotkey('Ctrl+nonexistent')))] } });
  assert.equal(crowded.valid, false);
  assert.equal(crowded.issues[0].code, 'invalid-chord');
  assert.equal(crowded.issues.length, 100);
  assert.equal(crowded.warningCount, 400);
  assert.equal(crowded.truncated, true);
});

test('MCP finds and calls the macro auditor offline without exposing executable user data', async () => {
  for (const protocolVersion of ['2025-06-18', '2025-03-26']) {
    const responses = [];
    const session = createSession({ send: (response) => responses.push(response), connect: () => assert.fail('Offline macro tool connected to Lastra') });
    const request = async (method, params) => {
      await session.receive({ jsonrpc: '2.0', id: responses.length, method, params });
      return responses.at(-1).result;
    };
    await request('initialize', { protocolVersion });
    let cursor;
    let tool;
    do {
      const page = await request('tools/list', cursor ? { cursor } : {});
      tool ??= page.tools.find(({ name }) => name === 'compose_macro');
      cursor = page.nextCursor;
    } while (!tool && cursor);
    assert.deepEqual(tool.inputSchema, inputSchema);
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.deepEqual(tool.outputSchema, protocolVersion === '2025-06-18' ? outputSchema : undefined);
    const result = await request('tools/call', { name: tool.name, arguments: {
      profile: { keys: [key('draft', { type: 'text', text: 'sample sensitive text' })] },
      edit: patch('draft', { hold: delay() }),
    } });
    assert.doesNotMatch(result.content[0].text, /sample sensitive text/);
    const content = JSON.parse(result.content[0].text);
    assert.deepEqual(result.structuredContent, protocolVersion === '2025-06-18' ? content : undefined);
    assert.equal(content.valid, true);
    assert.deepEqual(content.edit.gestures, { tap: 'text', hold: 'delay' });
    session.close();
  }
});

test('the auditor resolves only supplied macro definitions before inspecting gestures and constraints', () => {
  const invoke = { type: 'macro', macro: 'input', args: { variables: 'Ctrl+F' } };
  const noLibrary = composeMacro({ profile: { keys: [key('draft', invoke)] } });
  assert.equal(noLibrary.issues[0].code, 'missing-macro');
  const definition = { id: 'input', label: 'Input', parameters: [{ id: 'variables', type: 'string' }],
    action: { type: 'hotkey', keys: { parameter: 'variables' } } };
  const profile = { macros: [definition], keys: [key('draft', delay()), key('duplicate', hotkey('Ctrl+F'))] };
  const result = composeMacro({ profile, edit: patch('draft', { tap: invoke }) });
  assert.equal(result.valid, true);
  assert.equal(result.edit.gestures.tap, 'hotkey');
  assert.deepEqual(result.issues.map(({ code }) => code), ['duplicate-shortcut']);
  const cycle = composeMacro({ profile: { keys: [], macros: [{ id: 'loop', label: 'Loop', action: { type: 'macro', macro: 'loop' } }] } });
  assert.equal(cycle.valid, false);
  assert.equal(cycle.issues[0].code, 'macro-cycle');
  assert.equal(cycle.issues[0].path, '/profile/macros');
});
