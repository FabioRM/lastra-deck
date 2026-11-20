'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createActionRunner } = require('../src/main/actions');
const { ActionHistory } = require('../src/main/action-history');
const { flowFeedback } = require('../src/renderer/flow-feedback');

const sequence = (...steps) => ({ type: 'sequence', steps });
const obs = { type: 'obs-scene', scene: 'Fixture' };
const emit = { type: 'text', text: 'Fixture' };
const delay = { type: 'delay', ms: 6_000, onError: 'continue' };

test('progress preserves repeat position, nested step path, and the current step type', async () => {
  const progress = [];
  const runner = createActionRunner({ readState: () => true, input: { sendText() {} } });
  const result = await runner.run({ type: 'repeat', count: 2, steps: [
    { type: 'if', condition: 'speaker-muted', expected: true, then: sequence(emit, emit) },
  ] }, [], { onStepProgress: (event) => progress.push(event) });
  assert.equal(result.ok, true);
  assert.equal(progress.at(-1), null);
  assert.deepEqual(progress.filter((step) => step?.type === 'text').map(({ path, step, total, iteration, iterations }) =>
    ({ path, step, total, iteration, iterations })), [
    { path: ['Iteration 1, step 1', 'then', 1], step: 1, total: 2, iteration: 1, iterations: 2 },
    { path: ['Iteration 1, step 1', 'then', 2], step: 2, total: 2, iteration: 1, iterations: 2 },
    { path: ['Iteration 2, step 1', 'then', 1], step: 1, total: 2, iteration: 2, iterations: 2 },
    { path: ['Iteration 2, step 1', 'then', 2], step: 2, total: 2, iteration: 2, iterations: 2 },
  ]);
  assert.deepEqual(flowFeedback(progress.at(-2)), {
    label: 'Iteration 2 of 2 · Step 2 of 2 · Type text', badge: '2/2', detail: 'Iteration 2, step 1 › then › Step 2',
  });
});

test('stopping a local delay interrupts it promptly and skips subsequent steps even with continue enabled', async () => {
  const controller = new AbortController();
  const slept = [];
  let sent = 0;
  const runner = createActionRunner({ now: () => 0, sleep: async (ms) => { slept.push(ms); controller.abort(); },
    input: { sendText() { sent++; } } });
  const history = new ActionHistory();
  const result = await history.run({ origin: 'deck', label: 'Fixture', gesture: 'tap' },
    () => runner.run(sequence(emit, delay, emit), [], { signal: controller.signal, trace: true }));
  assert.equal(result.cancelled, true);
  assert.equal(result.ok, false);
  assert.equal(sent, 1);
  assert.deepEqual(slept, [150]);
  assert.deepEqual(result.steps.map(({ status }) => status), ['cancelled', 'succeeded', 'cancelled', 'skipped']);
  assert.equal(history.snapshot().entries[0].outcome, 'cancelled');
});

test('a provider already dispatched preserves its own readback before stopping the remaining steps', async () => {
  const controller = new AbortController();
  const progress = [];
  let confirm;
  const runner = createActionRunner({ selectObsScene: () => new Promise((resolve) => { confirm = resolve; }),
    input: { sendText() { assert.fail('The subsequent action ran'); } } });
  const outcome = runner.run(sequence(obs, emit), [], { signal: controller.signal, trace: true, onStepProgress: (step) => progress.push(step) });
  assert.equal(progress.at(-1).type, 'obs-scene');
  controller.abort();
  confirm({ ok: true, message: 'Confirmed by OBS' });
  const result = await outcome;
  assert.equal(result.cancelled, true);
  assert.deepEqual(result.steps[1].attempts, [{ status: 'succeeded', message: 'Confirmed by OBS' }]);
  assert.deepEqual(result.steps[2].attempts, []);
  assert.equal(result.steps[2].status, 'skipped');
  assert.equal(progress.at(-1), null);
});

test('stop during the final sent provider call preserves success or failure as reported', async () => {
  for (const ok of [true, false]) {
    const controller = new AbortController();
    const runner = createActionRunner({ selectObsScene: async () => {
      controller.abort();
      return { ok, message: ok ? 'Confirmed by OBS' : 'OBS verification timed out' };
    } });
    const result = await runner.run(sequence(obs), [], { signal: controller.signal, trace: true });
    assert.equal(result.ok, ok);
    assert.equal(result.cancelled, undefined);
    assert.equal(result.steps.at(-1).status, ok ? 'succeeded' : 'failed');
  }
});

test('stopping between retries bypasses the next attempt and subsequent effects', async () => {
  const controller = new AbortController();
  const progress = [];
  const runner = createActionRunner({
    readState: () => false,
    now: () => time,
    sleep: async (ms) => { time += ms; if (time > 250) controller.abort(); },
    input: { sendText() { assert.fail('Skipped effect'); } },
  });
  let time = 0;
  const wait = { type: 'wait-for', condition: 'speaker-muted', expected: true, timeoutMs: 250, onError: 'retry' };
  const result = await runner.run(sequence(wait, emit), [], { signal: controller.signal, trace: true, onStepProgress: (step) => progress.push(step) });
  assert.equal(result.cancelled, true);
  assert.equal(time, 400);
  assert.equal(progress.filter((step) => step?.type === 'wait-for').length, 1);
  assert.equal(result.steps[1].status, 'failed');
  assert.equal(result.steps.at(-1).status, 'skipped');
  const blocked = await runner.run(sequence(emit), [], { signal: controller.signal, trace: true });
  assert.deepEqual(blocked.steps.map(({ status }) => status), ['skipped', 'skipped']);
});

test('a provider preflight can prevent dispatch and a cancelled choice skips all branches', async () => {
  const controller = new AbortController();
  const runner = createActionRunner({
    toggleSpotify: async (verify) => {
      controller.abort();
      verify();
      assert.fail('The provider should stop before dispatch');
    },
    chooseAction: async () => ({ cancelled: true, message: 'The choice was cancelled.' }),
    input: { sendText() { assert.fail('A cancelled branch ran'); } },
  });
  const spotify = await runner.run(sequence({ type: 'spotify-playback' }, emit), [], { signal: controller.signal, trace: true });
  assert.equal(spotify.cancelled, true);
  assert.equal(spotify.steps.at(-1).status, 'skipped');
  const choice = { type: 'choose', id: 'state', prompt: 'Choose a fixture', choices: [
    { id: 'first', label: 'First', action: emit }, { id: 'second', label: 'Second', action: emit },
  ] };
  const selected = await runner.run(sequence(choice, emit), [], { trace: true });
  assert.equal(selected.cancelled, true);
  assert.deepEqual(selected.steps.map(({ status }) => status), ['cancelled', 'cancelled', 'skipped', 'skipped', 'skipped']);
});
