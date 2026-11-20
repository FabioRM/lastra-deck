'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { setImmediate: tick } = require('node:timers/promises');
const { ActionHistory } = require('../src/main/action-history');
const { AgentAudioReader } = require('../src/main/mcp-audio');
const { AgentAudioActions, audioActionParams, audioMuteParams } = require('../src/main/mcp-audio-actions');
const { AgentAudioRouting, audioRouteParams } = require('../src/main/mcp-audio-routing');

function fixture(options = {}) {
  let available = true;
  let authorized = true;
  const client = { id: '1234567800000000' };
  const second = { id: '9012345600000000' };
  const output = { id: 'physical-speaker', name: 'Living room speakers', level: 52, muted: true };
  const mic = { id: 'physical-mic', name: 'Headset mic', level: 60, muted: true };
  const state = { output, microphone: mic, inputs: [mic] };
  const audio = new AgentAudioReader({});
  const alias = audio.alias.bind(audio);
  const reviews = [];
  const writes = [];
  const history = new ActionHistory();
  const actions = new AgentAudioActions({ read: () => state, alias, canReview: () => available, timeout: 150,
    confirmation: { timeoutMs: 45, intervalMs: 5 }, history,
    approve: (review) => new Promise((resolve) => {
      review.signal.addEventListener('abort', () => resolve(false), { once: true });
      reviews.push({ ...review, resolve });
    }),
    async write(device, level, id) {
      writes.push({ device, level, id });
      const endpoint = device === 'output' ? state.output : state.inputs.find((item) => item.id === id);
      assert.equal(endpoint.id, id);
      if (!options.failedReadback) endpoint.level = level;
    },
  });
  const params = { command: 'request', target: alias(client.id, 'output', output.id), before: 52, level: 36, idempotencyKey: 'fixture-output' };
  const request = (overrides = {}, owner = client) => actions.change(owner, audioActionParams({ ...params, ...overrides }), () => authorized);
  const tracked = ({ request }, command = 'status', owner = client) => actions.change(owner, audioActionParams({ command, request }), () => authorized);
  return { request, tracked, state, mic, actions, alias, client, second, reviews, writes, history, setAvailable: (value) => { available = value; },
    revoke: () => { authorized = false; } };
}

test('a scoped audio change is local, exact, redacted, and deduplicated', async () => {
  const { request, tracked, state, reviews, writes, second } = fixture();
  assert.throws(() => request({}, second), /device or level changed/i);
  const pending = request();
  assert.deepEqual(request(), pending);
  assert.equal(pending.status, 'awaiting_confirmation');
  assert.throws(() => tracked(pending, 'status', second), /unavailable/i);
  assert.throws(() => request({ level: 77 }), /different request key/i);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].target, state.output.name);
  assert.deepEqual(reviews[0].details[0].value, { current: '52%', requested: '36%' });
  assert.deepEqual(writes, []);
  reviews[0].resolve(true);
  await tick();
  assert.equal(tracked(pending).status, 'confirmed');
  assert.deepEqual(writes, [{ device: 'output', level: 36, id: 'physical-speaker' }]);
  assert.equal(state.output.muted, true);
  assert.deepEqual(Object.keys(tracked(pending)).sort(), ['request', 'status', 'updatedAt']);
});

test('moved output, external adjustments and lost deck visibility stop a pending approval', async () => {
  for (const cause of ['output', 'level', 'visibility', 'permission']) {
    const { request, tracked, state, actions, reviews, writes, setAvailable, revoke } = fixture();
    const pending = request();
    if (cause === 'output') state.output = { id: 'replacement', name: 'Replacement', level: 52 };
    if (cause === 'level') state.output.level = 51;
    if (cause === 'visibility') setAvailable(false);
    if (cause === 'permission') revoke();
    actions.checkPending(state);
    assert.equal(reviews[0].signal.aborted, true);
    reviews[0].resolve(true);
    await tick();
    assert.deepEqual(writes, []);
    if (cause === 'permission') assert.throws(() => tracked(pending), /grant changed/i);
    else assert.equal(tracked(pending).status, cause === 'visibility' ? 'cancelled' : 'stale');
  }
});

test('selected microphone writes leave other devices alone and require provider readback', async () => {
  const { request, tracked, state, mic, alias, client, reviews, writes } = fixture({ failedReadback: true });
  const pending = request({ target: alias(client.id, 'input', mic.id), before: 60, level: 33, idempotencyKey: 'fixture-input' });
  assert.equal(reviews[0].target, 'Headset mic');
  reviews[0].resolve(true);
  await tick();
  for (let i = 0; i < 30 && tracked(pending).status === 'applying'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(tracked(pending).status, 'unconfirmed');
  assert.deepEqual(writes, [{ device: 'microphone', level: 33, id: 'physical-mic' }]);
  assert.equal(mic.level, 60);
  assert.equal(mic.muted, true);
  assert.equal(state.output.level, 52);
});

test('audio requests validate expected readings and support local decline or owner cancellation', async () => {
  const { request, tracked, reviews, writes, history, alias, client, state } = fixture();
  assert.throws(() => request({ target: 'physical-speaker' }), /audio alias/i);
  assert.throws(() => request({ level: -1 }), /audio alias/i);
  assert.throws(() => request({ before: 51 }), /device or level changed/i);
  const cancelled = request();
  assert.equal(tracked(cancelled, 'cancel').status, 'cancelled');
  const declined = request({ idempotencyKey: 'fixture-decline' });
  reviews[1].resolve(false);
  await tick();
  assert.equal(tracked(declined).status, 'declined');
  assert.deepEqual(writes, []);
  const audits = history.snapshot().entries;
  assert.deepEqual(audits.map(({ outcome }) => outcome), ['cancelled', 'cancelled']);
  assert.ok(audits.every(({ context }) => context === '12345678 · ' + alias(client.id, 'output', state.output.id)));
  assert.doesNotMatch(JSON.stringify(audits), /Living room|physical-speaker|fixture-decline/);
});

test('a reviewed mute applies the explicit boolean to one endpoint without touching its level', async () => {
  const input = { id: 'headset', name: 'Headset mic', muted: true, level: 55 };
  const other = { id: 'other', muted: true, level: 30 };
  const state = { output: { id: 'speaker', muted: false, level: 42 }, inputs: [input, other] };
  const audio = new AgentAudioReader({});
  const client = { id: '1234567800000000' };
  const reviews = [];
  const writes = [];
  let lease = false;
  const actions = new AgentAudioActions({ property: 'muted', read: () => state, alias: audio.alias.bind(audio),
    canReview: ({ device }) => device !== 'microphone' || !lease,
    approve: (review) => new Promise((resolve) => reviews.push({ review, resolve })),
    history: { run: (_meta, execute) => execute() }, confirmation: { timeoutMs: 45, intervalMs: 5 },
    write(device, muted, id, before) {
      writes.push({ device, muted, id, before });
      input.muted = muted;
    },
  });
  const request = (args) => actions.change(client, audioMuteParams(args), () => true);
  const params = { command: 'request', target: audio.alias(client.id, 'input', input.id), before: true, muted: false, idempotencyKey: 'unmute-headset' };
  assert.throws(() => request({ ...params, muted: 0 }), /mute state/);
  lease = true;
  assert.throws(() => request(params), /review is unavailable/);
  lease = false;
  const stale = request(params);
  input.muted = false;
  actions.checkPending(state);
  assert.equal(request({ command: 'status', request: stale.request }).status, 'stale');
  assert.deepEqual(writes, []);
  input.muted = true;
  const pending = request({ ...params, idempotencyKey: 'unmute-headset-new' });
  assert.deepEqual(reviews[1].review.details[0].value, { current: 'Muted', requested: 'Unmuted' });
  reviews[1].resolve(true);
  await tick();
  assert.equal(request({ command: 'status', request: pending.request }).status, 'confirmed');
  assert.deepEqual(writes, [{ device: 'microphone', muted: false, id: 'headset', before: true }]);
  assert.equal(input.level, 55);
  assert.equal(other.muted, true);
  assert.equal(state.output.level, 42);
  reviews[0].resolve(false);
});

test('playback review snapshots both roles and verifies routing when the media default already matches', async () => {
  const devices = ['speakers', 'headphones', 'external'].map((id) => ({ id, name: id, state: 'active' }));
  const state = { devices, roles: ['speakers', 'headphones'] };
  const client = { id: '1234567800000000' };
  const audio = new AgentAudioReader({});
  const alias = (id) => audio.alias(client.id, 'output', id);
  const reviews = [];
  const writes = [];
  const actions = new AgentAudioRouting({ read: () => state, alias: audio.alias.bind(audio), canReview: () => true,
    approve: (review) => new Promise((resolve) => reviews.push({ review, resolve })), history: { run: (_meta, execute) => execute() },
    write(_device, _desired, id, _before, endpoint, canContinue) {
      assert.ok(canContinue());
      writes.push({ id, roles: endpoint.roles });
      state.roles = [id, id];
    },
  });
  const request = (args) => actions.change(client, audioRouteParams(args), () => true);
  const params = { command: 'request', target: alias('headphones'), before: alias('headphones'), idempotencyKey: 'route-to-headphones' };
  assert.throws(() => request({ ...params, before: 'headphones' }), /playback alias/);
  const stale = request(params);
  assert.deepEqual(reviews[0].review.details[0].value, { console: 'speakers', multimedia: 'headphones' });
  state.roles[0] = 'external';
  actions.checkPending();
  assert.equal(request({ command: 'status', request: stale.request }).status, 'stale');
  assert.deepEqual(writes, []);
  reviews[0].resolve(false);
  const pending = request({ ...params, idempotencyKey: 'route-to-headphones-new' });
  reviews[1].resolve(true);
  await tick();
  assert.equal(request({ command: 'status', request: pending.request }).status, 'confirmed');
  assert.deepEqual(writes, [{ id: 'headphones', roles: ['external', 'headphones'] }]);
});
