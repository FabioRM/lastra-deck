'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { setImmediate: tick } = require('node:timers/promises');
const { AgentMediaReader, obsParams } = require('../src/main/mcp-media');
const { AgentObsActions, obsActionParams, obsOutputParams } = require('../src/main/mcp-obs-actions');
const { ActionHistory } = require('../src/main/action-history');

const client = { id: 'firstclient1234' };
const other = { id: 'otherclient1234' };

function fixture() {
  const generation = 9;
  const obs = { view: { status: 'connected', generation, studio: false, program: 'Main', preview: 'Next',
    sourceScene: 'Main', scenes: ['Main', 'Next', 'Third'], items: [{ id: 12, name: 'Camera', visible: true }],
    detail: { id: 12, name: 'Camera', muted: false, filters: [] } } };
  const media = new AgentMediaReader({ obs: () => obs.view });
  const reads = (section, owner = client) => media.obsState(obsParams({ section }), owner.id);
  const scenes = reads('scenes').scenes;
  const source = reads('sources').sources[0].id;
  const changes = [];
  const holds = [];
  let allowed = true;
  let writable = true;
  obs.change = async (command) => { changes.push(command); return { ok: true }; };
  const history = new ActionHistory();
  const controller = new AgentObsActions({ obs, media, history, canReview: () => writable,
    approve: (view) => new Promise((resolve) => { holds.push({ view, resolve }); }), timeout: 1000 });
  const call = (input, owner = client) => controller.change(owner, obsActionParams(input), () => allowed);
  const status = (request) => call({ command: 'status', request }).status;
  const submit = (extra = {}) => call({ command: 'request', generation, action: 'scene', target: scenes[1].id,
    idempotencyKey: 'request-next-scene', ...extra });
  return { obs, reads, generation, scenes, source, changes, holds, controller, call, submit, status, history,
    setAllowed(value) { allowed = value; controller.checkPending(); }, setWritable(value) { writable = value; controller.checkPending(); } };
}

test('OBS scene selections use owner-scoped aliases, require approval and apply once', async () => {
  const f = fixture();
  assert.throws(() => f.submit({ target: f.reads('scenes', other).scenes[1].id }), /target changed/i);
  assert.throws(() => f.submit({ generation: f.generation - 1 }), /target changed/i);
  const pending = f.submit();
  assert.equal(pending.status, 'awaiting_confirmation');
  assert.equal(f.submit().request, pending.request);
  assert.throws(() => f.submit({ target: f.scenes[2].id }), /different request key/i);
  assert.throws(() => f.call({ command: 'status', request: pending.request }, other), /unavailable/i);
  assert.deepEqual(f.changes, []);
  assert.equal(f.holds[0].view.operation, 'Change the OBS program scene');
  assert.equal(f.holds[0].view.target, 'Next');
  f.holds[0].resolve(true);
  await tick();
  assert.equal(f.status(pending.request), 'confirmed');
  assert.deepEqual(f.changes, [{ type: 'scene', generation: f.generation, value: 'Next', studio: false }]);
  assert.equal(f.submit().status, 'confirmed');
  assert.equal(f.changes.length, 1);
  assert.deepEqual(f.history.snapshot().entries, [{
    label: 'Change the OBS program scene', origin: 'agent', context: `firstcli · ${f.scenes[1].id}`,
    gesture: undefined, at: f.call({ command: 'status', request: pending.request }).updatedAt, outcome: 'succeeded',
  }]);
});

test('source changes use the exact selected view and recheck OBS generation and state after approval', async () => {
  const f = fixture();
  const first = f.submit({ action: 'visibility', target: f.source, value: false });
  f.obs.view = { ...f.obs.view, sourceScene: 'Next' };
  f.controller.checkPending();
  assert.equal(f.status(first.request), 'stale');
  assert.equal(f.holds[0].view.signal.aborted, true);
  f.holds[0].resolve(true);
  await tick();
  assert.deepEqual(f.changes, []);
  f.obs.view = { ...f.obs.view, sourceScene: 'Main' };
  const mute = f.submit({ action: 'mute', target: f.source, value: true, idempotencyKey: 'mute-camera' });
  f.holds[1].resolve(true);
  await tick();
  assert.equal(f.status(mute.request), 'confirmed');
  assert.deepEqual(f.changes, [{ type: 'mute', generation: f.generation, scene: 'Main', item: 12, value: true, source: 'Camera' }]);
  f.obs.view = { ...f.obs.view, detail: null };
  assert.throws(() => f.submit({ action: 'mute', target: f.source, value: true, idempotencyKey: 'mute-unselected' }), /target changed/i);
});

test('cancellation, revocation and unavailable provider readback never resend an OBS write', async () => {
  const f = fixture();
  const pending = f.submit();
  f.setWritable(false);
  assert.equal(f.status(pending.request), 'cancelled');
  f.holds[0].resolve(true);
  await tick();
  assert.equal(f.changes.length, 0);
  f.setAllowed(false);
  assert.throws(() => f.submit({ idempotencyKey: 'denied-request' }), /grant changed/i);
  f.setAllowed(true);
  f.setWritable(true);
  f.obs.change = async (command) => { f.changes.push(command); throw new Error('OBS did not confirm the requested state.'); };
  const request = f.submit({ idempotencyKey: 'retry-request' });
  f.holds[1].resolve(true);
  await tick();
  assert.equal(f.status(request.request), 'unconfirmed');
  assert.equal(f.submit({ idempotencyKey: 'retry-request' }).status, 'unconfirmed');
  assert.equal(f.changes.length, 1);
  f.obs.change = async (command) => { f.changes.push(command); return { ok: false }; };
  const rejected = f.submit({ idempotencyKey: 'no-readback' });
  f.holds[2].resolve(true);
  await tick();
  assert.equal(f.status(rejected.request), 'unconfirmed');
  assert.equal(f.changes.length, 2);
  assert.deepEqual(f.history.snapshot().entries.map(({ outcome }) => outcome), ['failed', 'failed', 'cancelled']);
});

test('cancelled, revoked or hidden OBS reviews cannot record success for an in-flight effect', async () => {
  for (const change of ['cancel', 'grant', 'visibility', 'generation']) {
    const f = fixture();
    let guard;
    let reply;
    f.obs.change = (command, _owner, allow) => new Promise((resolve) => {
      assert.equal(allow(), true);
      guard = allow;
      reply = resolve;
      f.changes.push(command);
    });
    const active = f.submit();
    f.holds[0].resolve(true);
    await tick();
    assert.equal(f.status(active.request), 'applying');
    if (change === 'cancel') {
      assert.equal(f.call({ command: 'cancel', request: active.request }).status, 'cancel_requested');
    } else if (change === 'grant') {
      f.setAllowed(false);
    } else if (change === 'visibility') {
      f.setWritable(false);
    } else {
      f.obs.view.generation++;
    }
    assert.equal(guard(), false);
    reply({ ok: true });
    await tick();
    f.setAllowed(true);
    assert.equal(f.status(active.request), 'unconfirmed');
    assert.equal(f.changes.length, 1);
    const { entries } = f.history.snapshot();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].outcome, 'failed');
    assert.equal(entries[0].context, `firstcli · ${f.scenes[1].id}`);
    assert.doesNotMatch(JSON.stringify(entries), /Next|Camera|generation/);
  }
});

test('recording and streaming outputs require their expected settled state and refresh before dispatch', async () => {
  const view = { status: 'connected', generation: 3, recording: { active: false, paused: false, phase: null },
    streaming: { active: true, phase: 'reconnecting' } };
  const reviews = [];
  const writes = [];
  let observedRecording = false;
  let refreshes = 0;
  const obs = { view,
    async refresh() { refreshes++; view.recording.active = observedRecording; },
    async change(command) { writes.push(command); view.streaming.active = command.value; return { ok: true }; },
  };
  const history = new ActionHistory();
  const controller = new AgentObsActions({ obs, productionOutputs: true, canReview: () => true, history,
    approve: (plan) => new Promise((resolve) => { reviews.push({ plan, resolve }); }) });
  const call = (input) => controller.change(client, obsOutputParams(input), () => true);
  const request = (overrides = {}) => call({ command: 'request', generation: 3, action: 'record', before: false,
    value: true, idempotencyKey: 'record-output', ...overrides });
  const status = ({ request }) => call({ command: 'status', request }).status;
  assert.throws(() => request({ action: 'scene' }), /recording or streaming/i);
  assert.throws(() => request({ generation: 2 }), /target changed/i);
  assert.throws(() => request({ action: 'stream', before: true, value: false }), /target changed/i);
  const pending = request();
  assert.equal(reviews[0].plan.operation, 'Start OBS recording');
  assert.equal(reviews[0].plan.target, 'OBS recording output');
  assert.deepEqual(reviews[0].plan.details[0].value, { current: 'Stopped', requested: 'Active' });
  assert.deepEqual(writes, []);
  observedRecording = true;
  reviews[0].resolve(true);
  await tick();
  assert.equal(refreshes, 1);
  assert.equal(status(pending), 'stale');
  assert.deepEqual(writes, []);
  view.streaming.phase = null;
  const params = { action: 'stream', before: true, value: false, idempotencyKey: 'stream-output' };
  const stream = request(params);
  assert.equal(reviews[1].plan.operation, 'Stop OBS streaming');
  reviews[1].resolve(true);
  await tick();
  assert.equal(status(stream), 'confirmed');
  assert.equal(request(params).request, stream.request);
  assert.deepEqual(writes, [{ type: 'stream', generation: 3, value: false }]);
  const alreadyStopped = request({ ...params, before: false, idempotencyKey: 'same-stream-output' });
  reviews[2].resolve(true);
  await tick();
  assert.equal(status(alreadyStopped), 'confirmed');
  assert.equal(writes.length, 1);
  assert.deepEqual(history.snapshot().entries.map(({ context, outcome }) => [context, outcome]), [
    ['firstcli · obs-output-stream', 'succeeded'],
    ['firstcli · obs-output-stream', 'succeeded'],
    ['firstcli · obs-output-record', 'cancelled'],
  ]);
});
