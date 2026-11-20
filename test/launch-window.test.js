'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { createActionRunner } = require('../src/main/actions');
const { validateProfile } = require('../src/main/profile');

test('launch still starts the program by default and can reuse a window by normalized path', async () => {
  const focuses = [];
  const spawns = [];
  const runner = createActionRunner({
    env: { Apps: 'D:\\Apps' },
    focusApp: (target) => { focuses.push(target); return 'focused'; },
    spawn(target, args, opts) {
      spawns.push({ target, args, cwd: opts.cwd });
      const child = new EventEmitter();
      child.unref = () => {};
      queueMicrotask(() => child.emit('spawn'));
      return child;
    },
  });
  const action = { type: 'launch', target: 'Example.exe', args: ['--example'], cwd: '%Apps%' };
  assert.equal((await runner.run(action)).ok, true);
  assert.deepEqual(spawns, [{ target: 'Example.exe', args: ['--example'], cwd: 'D:\\Apps' }]);
  assert.deepEqual(focuses, []);
  const reuse = await runner.run({ ...action, target: '%Apps%/Example.exe', reuseWindow: true });
  assert.deepEqual(focuses, [{ path: 'd:\\apps\\example.exe' }]);
  assert.deepEqual(reuse, { ok: true, message: 'Switched to an existing window' });
  assert.equal(spawns.length, 1);
});

test('launch never starts a duplicate when an existing app cannot be selected', async () => {
  for (const outcome of ['blocked', 'ambiguous', undefined]) {
    const runner = createActionRunner({ focusApp: () => outcome, spawn: () => assert.fail('Unexpected launch') });
    assert.equal((await runner.run({ type: 'launch', target: 'example.exe', reuseWindow: true })).ok, false);
  }
  assert.throws(() => validateProfile({ keys: [{ id: 'app', action: { type: 'launch', target: 'example.exe', reuseWindow: 'yes' } }] }), /reuseWindow/);
});

test('launch repeats share a startup window and failed launches can be retried', async () => {
  let now = 0;
  let fail = false;
  let launches = 0;
  const runner = createActionRunner({
    now: () => now,
    focusApp: () => 'missing',
    spawn() {
      launches++;
      const child = new EventEmitter();
      child.unref = () => {};
      queueMicrotask(() => fail ? child.emit('error', new Error('Could not launch')) : child.emit('spawn'));
      return child;
    },
  });
  const command = { type: 'launch', target: 'example.exe', reuseWindow: true };
  const [first, second] = await Promise.all([runner.run(command), runner.run(command)]);
  assert.equal(first.ok, true);
  assert.equal(second.message, 'The app is starting');
  assert.equal(launches, 1);
  assert.equal((await runner.run(command)).message, 'The app is starting');
  now += 8_001;
  fail = true;
  assert.equal((await runner.run(command)).ok, false);
  fail = false;
  assert.equal((await runner.run(command)).ok, true);
  assert.equal(launches, 3);
});
