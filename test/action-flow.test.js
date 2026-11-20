'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { createActionRunner } = require('../src/main/actions');
const { validateProfile } = require('../src/main/profile');
const { simulateAction } = require('../src/main/action-test');

const sequence = (...steps) => ({ type: 'sequence', steps });
const wait = (condition, expected, timeoutMs = 500) => ({ type: 'wait-for', condition, expected, timeoutMs });
const type = (text) => ({ type: 'text', text });
const profile = (action) => validateProfile({ grid: { cols: 1, rows: 1 }, keys: [{ id: 'test', action }] });

function fixture(dependencies = {}) {
  const sent = [];
  let now = 0;
  const runner = createActionRunner({
    input: { sendText: (text) => sent.push(text) },
    sleep: async (ms) => { now += ms; },
    now: () => now,
    ...dependencies,
  });
  return { runner, sent, time: () => now };
}

test('wait for state pauses subsequent steps and uses a bounded timeout', async () => {
  const matched = fixture({ readForeground: () => matched.time() >= 300 ? 'code.exe' : 'other.exe' });
  assert.deepEqual(await matched.runner.run(sequence(wait('foreground', 'Code.exe'), type('after foreground match'))), { ok: true, message: null });
  assert.equal(matched.time(), 300);
  assert.deepEqual(matched.sent, ['after foreground match']);

  const expired = fixture({ readState: () => undefined });
  const result = await expired.runner.run(sequence(wait('speaker-muted', false), type('should not run')));
  assert.match(result.message, /^Step 1: Timed out waiting for Speaker mute/);
  assert.equal(expired.time(), 500);
  assert.deepEqual(expired.sent, []);
});

test('if and else select one branch and unavailable source data stops the action', async () => {
  let current = 'Meeting';
  const { runner, sent } = fixture({ readState: () => current });
  const action = { type: 'if', condition: 'obs-scene', expected: 'Meeting', then: type('match'), else: type('otherwise') };
  assert.equal((await runner.run(action)).ok, true);
  current = 'Home';
  assert.equal((await runner.run(action)).ok, true);
  current = null;
  assert.match((await runner.run(action)).message, /OBS program scene is unavailable/);
  assert.deepEqual(sent, ['match', 'otherwise']);
});

test('a sequence can continue after a failed step and only retries supported steps', async () => {
  let starts = 0;
  const { runner, sent, time } = fixture({
    readState: () => false,
    spawn() {
      const child = new EventEmitter();
      child.unref = () => {};
      starts++;
      queueMicrotask(() => starts === 1 ? child.emit('error', new Error('Fixture failure')) : child.emit('spawn'));
      return child;
    },
  });
  const completed = await runner.run(sequence(
    { ...wait('obs-recording', true, 100), onError: 'continue' },
    { type: 'launch', target: 'fixture.exe', onError: 'retry', attempts: 2 },
    type('last'),
  ));
  assert.equal(completed.ok, true);
  assert.match(completed.message, /^Continued after Step 1: Timed out/);
  assert.equal(starts, 2);
  assert.equal(time(), 350);
  assert.deepEqual(sent, ['last']);
  assert.match((await runner.run(sequence({ ...type('unsafe'), onError: 'retry' }))).message, /cannot be retried safely/);
  assert.deepEqual(sent, ['last']);
});

test('profile validation checks branch actions, limits, and sequence retry policies', () => {
  assert.doesNotThrow(() => profile({ type: 'if', condition: 'obs-connected', expected: true, then: wait('obs-scene', 'Main') }));
  assert.throws(() => profile(wait('foreground', 'C:\\Windows\\notepad.exe')), /Use an executable name/);
  assert.throws(() => profile(wait('obs-connected', true, 30_001)), /Wait timeout/);
  assert.throws(() => profile({ type: 'if', condition: 'obs-connected', expected: true }), /if matched: missing action/);
  assert.throws(() => profile(sequence({ type: 'audio', device: 'output', onError: 'retry' })), /cannot be retried safely/);
  assert.throws(() => profile(sequence({ ...wait('obs-connected', true), onError: 'retry', attempts: 4 })), /two or three attempts/);
});

test('simulation uses virtual time and reports retry attempts, continued failures, and skipped branches', async () => {
  const action = sequence(
    { ...wait('obs-streaming', true, 100), onError: 'retry', attempts: 2 },
    { type: 'if', condition: 'obs-connected', expected: true, then: type('Never runs') },
  );
  const failed = await simulateAction({ action, values: { 'obs-streaming': false } });
  assert.equal(failed.ok, false);
  assert.equal(failed.elapsedMs, 450);
  assert.deepEqual(failed.steps.map(({ path, status, attempts }) => [path, status, attempts.length]), [
    [[], 'failed', 1], [[1], 'failed', 2], [[2], 'skipped', 0], [[2, 'then'], 'skipped', 0],
  ]);

  const continued = await simulateAction({ action: sequence(
    { ...wait('obs-streaming', true, 100), onError: 'continue' },
    { type: 'audio', device: 'output' },
    { type: 'if', condition: 'speaker-muted', expected: true, then: { type: 'open', target: 'https://example.invalid/' },
      else: type('Unchosen') },
  ), values: { 'speaker-muted': false } });
  assert.equal(continued.ok, true);
  assert.deepEqual(continued.steps.map(({ status }) => status), ['warning', 'failed', 'succeeded', 'succeeded', 'succeeded', 'skipped']);
});

test('simulation validates unsaved input and models the opt-in Photoshop test context', async () => {
  const action = { type: 'hotkey', keys: 'Ctrl+J', requiresPhotoshopWorkspace: true };
  const context = { apps: ['Photoshop.exe'], values: { foreground: 'Photoshop.exe' } };
  assert.match((await simulateAction({ action, ...context })).message, /Photoshop workspace/);
  assert.equal((await simulateAction({ action, ...context, photoshopWorkspace: true })).ok, true);
  assert.match((await simulateAction({ action: { ...action, keys: 'Ctrl+invalid' }, ...context })).message, /Unknown key/);
});
