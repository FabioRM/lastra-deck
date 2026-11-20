'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { createPowerEvents, POWER_SUBSCRIBERS } = require('../src/main/power-events');

test('subscribers run in the fixed order whatever order they subscribe in', () => {
  const monitor = new EventEmitter();
  const power = createPowerEvents(monitor, { log() {} });
  const calls = [];
  power.subscriber('deck-display').on('resume', () => calls.push('deck-display'));
  power.on('agent-session', 'resume', () => calls.push('agent-session'));
  power.on('deck-session', 'resume', () => calls.push('deck-session'));
  power.on('pomodoro', 'resume', () => calls.push('pomodoro'));
  monitor.emit('resume');
  assert.deepEqual(calls, ['pomodoro', 'deck-session', 'agent-session', 'deck-display']);
  assert.equal(monitor.listenerCount('resume'), 1, 'one Electron listener per event');
});

test('the agent reads the deck session after the deck unlocks', () => {
  const monitor = new EventEmitter();
  const power = createPowerEvents(monitor, { log() {} });
  let blocked = true;
  let agentLocked;
  power.on('agent-session', 'unlock-screen', () => { agentLocked = blocked; });
  power.on('deck-session', 'unlock-screen', () => { blocked = false; });
  monitor.emit('unlock-screen');
  assert.equal(agentLocked, false);
});

test('equal subscribers keep their registration order and a failure does not stop the rest', () => {
  const monitor = new EventEmitter();
  const lines = [];
  const power = createPowerEvents(monitor, { log: (...args) => lines.push(args.join(' ')) });
  const calls = [];
  power.on('power-source', 'on-ac', () => calls.push('a'));
  power.on('pomodoro', 'on-ac', () => { throw new Error('clock'); });
  power.on('power-source', 'on-ac', () => calls.push('b'));
  monitor.emit('on-ac');
  assert.deepEqual(calls, ['a', 'b']);
  assert.match(lines[0], /^Power event on-ac \(pomodoro\) failed: Error: clock/);
});

test('the powerMonitor view supports removeListener, and dispose detaches from Electron', () => {
  const monitor = new EventEmitter();
  const power = createPowerEvents(monitor, { log() {} });
  const view = power.subscriber('deck-display');
  let suspended = 0;
  const onSuspend = () => suspended++;
  view.on('suspend', onSuspend);
  monitor.emit('suspend');
  view.removeListener('suspend', onSuspend);
  monitor.emit('suspend');
  assert.equal(suspended, 1);
  power.dispose();
  assert.equal(monitor.listenerCount('suspend'), 0);
});

test('an unknown subscriber is rejected', () => {
  const power = createPowerEvents(new EventEmitter(), { log() {} });
  assert.throws(() => power.on('somebody', 'resume', () => {}), /Unknown power event subscriber/);
  assert.ok(Object.isFrozen(POWER_SUBSCRIBERS));
});
