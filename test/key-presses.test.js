'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { KeyPresses, IGNORED } = require('../src/main/key-presses');
const { validateProfile, toView } = require('../src/main/profile');

test('profiles default to ignoring repeat presses and expose the selected policy', () => {
  const key = { id: 'example', action: { type: 'delay', ms: 500 } };
  const profile = (onBusy) => validateProfile({ keys: [{ ...key, onBusy }] });
  assert.equal(toView(profile(undefined)).slots[0].onBusy, 'ignore');
  assert.equal(toView(profile('queue-one')).slots[0].onBusy, 'queue-one');
  assert.throws(() => profile('unknown'), /"onBusy" must be "ignore" or "queue-one"/);
});

test('a key can ignore extra presses or run just the first queued gesture', async () => {
  const presses = new KeyPresses();
  const calls = [];
  let finishFirst;
  const first = presses.run('home/example', 'ignore', () => new Promise((resolve) => { finishFirst = resolve; }));
  const execute = (name) => () => { calls.push(name); return name; };
  assert.equal(await presses.run('home/example', 'ignore', execute('ignored')), IGNORED);
  const pending = presses.run('home/example', 'queue-one', execute('long press'));
  assert.equal(await presses.run('home/example', 'queue-one', execute('discarded')), IGNORED);
  assert.equal(await presses.run('other/example', 'ignore', execute('another key')), 'another key');
  assert.deepEqual(calls, ['another key']);
  finishFirst('tap');
  assert.equal(await first, 'tap');
  assert.equal(await pending, 'long press');
  assert.deepEqual(calls, ['another key', 'long press']);
});

test('cancelling a queue leaves the active action running and releases the pending request', async () => {
  const presses = new KeyPresses();
  let finishFirst;
  const first = presses.run('home/example', 'queue-one', () => new Promise((resolve) => { finishFirst = resolve; }));
  const pending = presses.run('home/example', 'queue-one', () => assert.fail('Cancelled press ran'));
  presses.cancelPending();
  assert.equal(await pending, IGNORED);
  finishFirst('original action');
  assert.equal(await first, 'original action');
  assert.equal(await presses.run('home/example', 'queue-one', () => 'new action'), 'new action');
});
