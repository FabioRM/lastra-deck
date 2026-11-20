'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { guardMicrophone } = require('../src/main/ptt-guard');

function fixture() {
  let muted = true;
  const writes = [];
  const audio = {
    readCaptureInput: () => ({ muted }),
    readCaptureMute: () => muted,
    requestCaptureMute: (_id, state) => { muted = state; writes.push(state); },
  };
  return { audio, writes, open: () => { muted = false; } };
}

test('guard forces mute after pipe loss, including a delayed unmute', async () => {
  const input = new PassThrough();
  const { audio, writes, open } = fixture();
  let checks = 0;
  await guardMicrophone(audio, 'mic', input, () => input.end(), {
    settleMs: 120,
    sleep: async () => { if (++checks === 2) open(); },
  });
  assert.equal(audio.readCaptureMute(), true);
  assert.deepEqual(writes, [true, true]);
});

test('guard exits without changing mute on an explicit disarm', async () => {
  const input = new PassThrough();
  const { audio, writes } = fixture();
  await guardMicrophone(audio, 'mic', input, () => input.end('disarm\n'));
  assert.deepEqual(writes, []);
});
