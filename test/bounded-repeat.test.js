'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createActionRunner } = require('../src/main/actions');
const { simulateGesture } = require('../src/main/mcp-simulate');
const { composeMacro } = require('../src/main/mcp-macros');
const { validateProfile } = require('../src/main/profile');

const delay = (ms) => ({ type: 'delay', ms });
const text = (value) => ({ type: 'text', text: value });
const repeat = (count, steps, options = {}) => ({ type: 'repeat', count, steps, ...options });
const source = (action) => ({ grid: { cols: 1, rows: 1 }, pages: [{ id: 'home', name: 'Home', keys: [{ id: 'loop', action }] }] });
const simulate = (action, options) => simulateGesture({ profile: source(action), key: 'loop', ...options });

test('bounded repeats record each iteration and can finish early when a condition changes', async () => {
  const fixed = await simulate(repeat(3, [text('example'), delay(150)]));
  assert.equal(fixed.status, 'success');
  assert.equal(fixed.elapsedMs, 450);
  assert.deepEqual(fixed.effects.map(({ atMs }) => atMs), [0, 150, 300]);
  assert.deepEqual(fixed.steps.filter(({ type }) => type === 'text').map(({ path }) => path[0]),
    ['Iteration 1, step 1', 'Iteration 2, step 1', 'Iteration 3, step 1']);
  const conditional = await simulate(repeat(3, [text('example'), delay(150)], { condition: 'speaker-muted', expected: true }), {
    values: { 'speaker-muted': true }, timeline: [{ atMs: 150, values: { 'speaker-muted': false } }],
  });
  assert.equal(conditional.status, 'success');
  assert.equal(conditional.effects.length, 1);
  assert.match(conditional.message, /completed 1 of 3/i);
});

test('timeout, cancellation and target change deny subsequent effects even with continue policies', async () => {
  const action = repeat(3, [text('example'), { ...delay(10_000), onError: 'continue' }], { timeoutMs: 400 });
  const timedOut = await simulate(action);
  assert.equal(timedOut.status, 'failed');
  assert.match(timedOut.message, /repeat timed out/i);
  assert.equal(timedOut.elapsedMs, 400);
  assert.equal(timedOut.effects.length, 1);
  const cancelled = await simulate(action, { timeline: [{ atMs: 150, cancel: true }] });
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.elapsedMs, 150);
  const changed = await simulate(action, { windowId: 10, values: { foreground: 'editor.exe' }, timeline: [{ atMs: 150, windowId: 11 }] });
  assert.equal(changed.status, 'unavailable');
  assert.equal(changed.effects.length, 1);
});

test('the runner reports live loop iterations and preserves a normal step continuation policy', async () => {
  let time = 0;
  const progress = [];
  let effects = 0;
  const runner = createActionRunner({ now: () => time, sleep: async (ms) => { time += ms; },
    input: { sendText() { effects++; } }, audio: { change() { throw new Error('Audio unavailable'); } } });
  const result = await runner.run(repeat(2, [{ type: 'audio', device: 'output', onError: 'continue' }, text('sample')]), [], {
    trace: true, onProgress: (value) => progress.push(value),
  });
  assert.deepEqual(progress, [{ iteration: 1, count: 2 }, { iteration: 2, count: 2 }, null]);
  assert.equal(effects, 2);
  assert.equal(result.ok, true);
  assert.match(result.message, /continued.*audio unavailable/i);
  assert.equal(result.steps[0].status, 'warning');
});

test('profile and agent macro validation prevent unbounded or nested repeats and resolve repeat variables', () => {
  assert.throws(() => validateProfile(source(repeat(11, [delay(5)]))), /iterations/);
  assert.throws(() => validateProfile(source(repeat(2, [repeat(1, [delay(5)])]))), /cannot contain another repeat/);
  assert.throws(() => validateProfile(source(repeat(10, Array.from({ length: 11 }, () => delay(5))))), /step attempts/);
  const profile = source(repeat({ expression: { scope: 'profile', var: 'times' } }, [delay(5)]));
  profile.variables = [{ id: 'times', type: 'integer', value: 2 }];
  assert.equal(composeMacro({ profile }).valid, true);
});
