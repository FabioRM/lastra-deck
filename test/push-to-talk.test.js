'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { setTimeout: wait } = require('node:timers/promises');
const { PushToTalk } = require('../src/main/push-to-talk');
const { toggleMicrophones } = require('../src/main/audio-win32');

const owner = {};
const anotherWindow = {};
const policy = { checkMs: 2, attempts: 12, leaseMs: 1000, maxHoldMs: 2000, retryMs: 5 };

function fixture(inputState = { headset: true, usb: true }) {
  const inputs = new Map(Object.entries(inputState));
  const writes = [];
  const calls = [];
  const audio = {
    readCaptureInput: (id) => inputs.has(id) ? { muted: inputs.get(id) } : null,
    readCaptureMute: (id) => {
      if (!inputs.has(id)) throw new Error('Disconnected');
      return inputs.get(id);
    },
    requestCaptureMute: (id, muted) => {
      if (!inputs.has(id)) throw new Error('Disconnected');
      writes.push([id, muted]);
      inputs.set(id, muted);
    },
    change: async () => calls.push('toggle'),
    muteAllCapture: async () => {
      calls.push('force mute');
      for (const id of inputs.keys()) inputs.set(id, true);
    },
  };
  return { audio, inputs, writes, calls };
}

async function until(condition) {
  const deadline = Date.now() + 1500;
  while (!condition() && Date.now() < deadline) await wait(5);
  assert(condition(), 'Timed out waiting for push-to-talk');
}

test('only opens the selected muted capture endpoint and restores it on release', async () => {
  const { audio, inputs, writes } = fixture({ headset: true, usb: false });
  const talk = new PushToTalk(audio, { policy });

  assert.throws(() => talk.start(owner, 'unmuted', 'usb'), /Mute the selected/);
  assert.throws(() => talk.start(owner, 'missing', 'other'), /unavailable/);
  assert.deepEqual(writes, []);
  talk.start(owner, 'current', 'headset');
  assert.equal(talk.view.phase, 'talking');
  assert.deepEqual([...inputs.values()], [false, false]);
  assert.equal(await talk.stop(owner, 'current'), true);
  assert.deepEqual(writes, [['headset', false], ['headset', true]]);
  assert.deepEqual([...inputs.values()], [true, false]);
  assert.equal(talk.view.phase, 'idle');
});

test('opens after the separate guard is ready and disarms after mute is confirmed', async () => {
  const { audio, inputs, writes } = fixture();
  let ready;
  let disarmed = false;
  const guard = {
    available: true,
    ready: new Promise((resolve) => { ready = resolve; }),
    disarm: () => { disarmed = inputs.get('headset') === true; },
  };
  const talk = new PushToTalk(audio, { policy, startGuard: () => guard });
  talk.start(owner, 'guarded', 'headset');
  assert.equal(talk.view.phase, 'opening');
  assert.deepEqual(writes, []);
  ready();
  await until(() => talk.view.phase === 'talking');
  assert.equal(disarmed, false);
  await talk.stop(owner, 'guarded');
  assert.equal(disarmed, true);
});

test('does not unmute if the separate guard fails to start', async () => {
  const { audio, writes } = fixture();
  const talk = new PushToTalk(audio, { policy, startGuard: () => ({
    ready: Promise.reject(new Error('out of resources')), disarm() {},
  }) });
  talk.start(owner, 'unavailable', 'headset');
  await until(() => talk.view.phase === 'idle');
  assert.ok(writes.every(([, muted]) => muted));
  assert.match(talk.view.message, /guard could not start/);
});

test('release settles through a late unmute even after two apparently muted reads', async () => {
  const { audio, inputs, writes } = fixture();
  let reads = 0;
  let lateOpen = false;
  audio.requestCaptureMute = (id, muted) => {
    writes.push([id, muted]);
    // Until the driver applies the queued unmute, asking it to mute is a no-op.
    if (muted) inputs.set(id, true);
  };
  audio.readCaptureMute = (id) => {
    if (++reads === 5) {
      lateOpen = true;
      inputs.set(id, false);
    }
    return inputs.get(id);
  };
  const phases = [];
  const talk = new PushToTalk(audio, { policy, publish: ({ phase }) => phases.push(phase) });
  talk.start(owner, 'early', 'headset');
  assert.equal(talk.view.phase, 'opening');
  const restore = talk.stop(owner, 'early');
  assert.deepEqual(writes, [['headset', false], ['headset', true]]);
  assert.equal(await restore, true);
  assert.equal(lateOpen, true);
  assert.deepEqual(phases, ['opening', 'closing', 'idle']);
  assert.equal(inputs.get('headset'), true);
  assert.deepEqual(writes, [['headset', false], ['headset', true], ['headset', true]]);
});

test('the global mic action force-mutes during a hold and blocks new holds while it runs', async () => {
  const { audio, inputs, calls } = fixture();
  const talk = new PushToTalk(audio, { policy });
  talk.start(owner, 'talking', 'headset');
  const emergency = talk.toggleMicrophones();
  assert.throws(() => talk.start(owner, 'another', 'usb'), /busy/);
  await emergency;
  assert.deepEqual(calls, ['force mute']);
  assert.deepEqual([...inputs.values()], [true, true]);
  await talk.toggleMicrophones();
  assert.deepEqual(calls, ['force mute', 'toggle']);
});

test('force-muting all inputs leaves already-muted devices untouched', async () => {
  const inputs = [{ id: 'headset', muted: true }, { id: 'usb', muted: true }];
  const writes = [];
  assert.equal(await toggleMicrophones(inputs, 'headset', new Set(), (...args) => writes.push(args), true),
    '2 microphones muted');
  assert.deepEqual(writes, []);
});

test('ends an expired hold and ignores renew or stop from a stale owner or token', async () => {
  const { audio, inputs } = fixture();
  const clock = { time: 0 };
  const talk = new PushToTalk(audio, { policy, now: () => clock.time });
  talk.start(owner, 'old', 'headset');
  await talk.stop(owner, 'old');
  talk.start(owner, 'new', 'headset');
  clock.time = policy.leaseMs - 1;
  await talk.cancel(anotherWindow);
  talk.renew(anotherWindow, 'new');
  talk.renew(owner, 'old');
  await talk.stop(owner, 'old');
  assert.equal(inputs.get('headset'), false);
  clock.time = policy.leaseMs;
  talk.renew(owner, 'new');
  await until(() => talk.view.phase === 'idle');
  assert.equal(inputs.get('headset'), true);
  assert.match(talk.view.message, /interrupted/);
});

test('applies an independent watchdog without any renderer heartbeat', async () => {
  const { audio, inputs } = fixture();
  const talk = new PushToTalk(audio, { policy: { ...policy, leaseMs: 30 } });
  talk.start(owner, 'lost', 'headset');
  await until(() => talk.view.phase === 'idle');
  assert.equal(inputs.get('headset'), true);
});

test('enforces the hard hold limit even while the owner continues to renew', async () => {
  const { audio, inputs } = fixture();
  const clock = { time: 0 };
  const talk = new PushToTalk(audio, { policy, now: () => clock.time });
  talk.start(owner, 'long', 'headset');
  for (clock.time = 200; clock.time <= policy.maxHoldMs; clock.time += 200) {
    talk.renew(owner, 'long');
  }
  await until(() => talk.view.phase === 'idle');
  assert.equal(inputs.get('headset'), true);
  assert.match(talk.view.message, /limit/);
});

test('reports an unverified mute during disconnect and retries when the input returns', async () => {
  const { audio, inputs } = fixture();
  const talk = new PushToTalk(audio, { policy });
  talk.start(owner, 'unplugged', 'headset');
  inputs.delete('headset');
  talk.observeInputs([{ id: 'usb', muted: true }]);
  await until(() => talk.view.phase === 'fault');
  assert.throws(() => talk.start(owner, 'another', 'usb'), /busy/);
  inputs.set('headset', false);
  await until(() => talk.view.phase === 'idle');
  assert.equal(inputs.get('headset'), true);
});

test('shutdown waits for the restore and rejects any new lease', async () => {
  const { audio, inputs } = fixture();
  const talk = new PushToTalk(audio, { policy });
  talk.start(owner, 'quit', 'headset');
  assert.equal(await talk.dispose(), true);
  assert.equal(inputs.get('headset'), true);
  assert.throws(() => talk.start(owner, 'another', 'headset'), /busy/);
});
