'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { changeDefaultPlayback } = require('../src/main/audio-win32');

const devices = [
  { id: 'old', state: 'active' },
  { id: 'next', state: 'active' },
  { id: 'unplugged', state: 'disconnected' },
  { id: 'disabled', state: 'disabled' },
];

test('changes the console and multimedia roles after Windows confirms them', async () => {
  const defaults = ['old', 'old', 'communications'];
  const requests = [];
  let settled = 0;

  await changeDefaultPlayback('next', devices, {
    getDefault: (role) => defaults[role],
    setDefault: (role, id) => requests.push([role, id]),
    settle: async () => {
      settled++;
      for (const [role, id] of requests) defaults[role] = id;
    },
  });

  assert.equal(settled, 1);
  assert.deepEqual(requests, [[0, 'next'], [1, 'next']]);
  assert.deepEqual(defaults, ['next', 'next', 'communications']);
});

test('rejects disconnected or capture devices before attempting a role change', async () => {
  const unexpected = () => assert.fail('Windows defaults must remain untouched');
  for (const id of ['unplugged', 'disabled', 'capture']) {
    await assert.rejects(changeDefaultPlayback(id, devices, {
      getDefault: unexpected,
      setDefault: unexpected,
    }), /unavailable/);
  }
});

test('restores the console default if the multimedia change fails', async () => {
  const defaults = ['old', 'old', 'communications'];
  const failure = new Error('Device disconnected');
  await assert.rejects(changeDefaultPlayback('next', devices, {
    getDefault: (role) => defaults[role],
    setDefault: (role, id) => {
      if (role === 1) throw failure;
      defaults[role] = id;
    },
  }), failure);
  assert.deepEqual(defaults, ['old', 'old', 'communications']);
});

test('reviewed playback routing checks both prior defaults and preserves other roles on cancellation', async () => {
  const defaults = ['old', 'old', 'communications'];
  const writes = [];
  let current = true;
  const native = {
    getDefault: (role) => defaults[role],
    setDefault: (role, id) => { writes.push([role, id]); defaults[role] = id; current = false; },
    canContinue: () => current,
  };
  await assert.rejects(changeDefaultPlayback('next', devices, { ...native, expected: ['next', 'old'] }), /reviewed playback routing changed/);
  assert.deepEqual(writes, []);
  await assert.rejects(changeDefaultPlayback('next', devices, { ...native, expected: ['old', 'old'] }), /review ended/);
  assert.deepEqual(writes, [[0, 'next'], [0, 'old']]);
  assert.deepEqual(defaults, ['old', 'old', 'communications']);
});
