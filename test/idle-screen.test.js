'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { IdleGate, idleStatuses, timerLines } = require('../src/renderer/idle-screen');
const { timerProjection } = require('../src/renderer/obs-production');
const { DEFAULT_APPEARANCE, normalizeAppearance, validAppearanceSetting } = require('../src/shared/appearance');
const { navigationParams } = require('../src/main/mcp-navigation');

function fixture() {
  let time = 0;
  const states = [];
  const gate = new IdleGate({ now: () => time, setIdle: (idle) => states.push(idle) });
  return { gate, states, advance: (value, blocked = false) => { time += value; gate.tick(blocked); } };
}

test('idle is opt-in, waits after actual activity and does not interrupt pressed controls or dialogs', () => {
  const { gate, states, advance } = fixture();
  advance(250_000);
  assert.equal(gate.idle, false);
  gate.configure(60);
  advance(59_000);
  gate.input({ type: 'pointerdown', pointerId: 1 });
  advance(90_000);
  assert.equal(gate.idle, false);
  gate.input({ type: 'pointercancel', pointerId: 1 });
  advance(99_000, true);
  assert.equal(gate.idle, false);
  advance(59_000);
  assert.equal(gate.idle, false);
  gate.input({ type: 'click', trusted: false });
  advance(1000);
  assert.deepEqual(states, [true]);
});

test('the complete first pointer gesture and its compatibility click are consumed, then ordinary actions resume', () => {
  const { gate, states, advance } = fixture();
  gate.configure(60);
  advance(60_000);
  assert.equal(gate.input({ type: 'pointerdown', pointerId: 1 }), true);
  assert.equal(gate.input({ type: 'touchstart' }), true);
  assert.equal(gate.input({ type: 'pointermove', pointerId: 1 }), true);
  assert.equal(gate.idle, true);
  assert.equal(gate.input({ type: 'pointerup', pointerId: 1 }), true);
  assert.equal(gate.idle, false);
  assert.equal(gate.input({ type: 'touchend' }), true);
  assert.equal(gate.input({ type: 'mouseup' }), true);
  assert.equal(gate.input({ type: 'click' }), true);
  assert.equal(gate.input({ type: 'pointerdown', pointerId: 2 }), false);
  assert.equal(gate.input({ type: 'pointerup', pointerId: 2 }), false);
  assert.equal(gate.input({ type: 'click' }), false);
  assert.deepEqual(states, [true, false]);
});

test('waking works with keyboard or accessible click and a cancelled touch cannot hit the deck', () => {
  const { gate, advance } = fixture();
  gate.configure(60);
  advance(60_000);
  gate.input({ type: 'pointerdown', pointerId: 8 });
  assert.equal(gate.input({ type: 'pointercancel', pointerId: 8 }), true);
  assert.equal(gate.idle, true);
  assert.equal(gate.input({ type: 'keydown', key: 'Tab' }), true);
  assert.equal(gate.input({ type: 'keyup', key: 'Tab' }), true);
  assert.equal(gate.idle, true);
  assert.equal(gate.input({ type: 'keydown', key: 'Enter' }), true);
  assert.equal(gate.input({ type: 'keyup', key: 'Enter' }), true);
  assert.equal(gate.idle, false);
  assert.equal(gate.input({ type: 'keydown', key: 'Enter' }), false);
  gate.input({ type: 'keyup', key: 'Enter' });
  advance(60_000);
  assert.equal(gate.input({ type: 'click' }), true);
  assert.equal(gate.idle, false);
  advance(401);
  assert.equal(gate.input({ type: 'click' }), false);
});

test('hide, restore, and changing appearance idle timeout keep input ownership predictable', () => {
  const { gate, states, advance } = fixture();
  gate.configure(60);
  advance(60_000);
  gate.suspend(true);
  advance(180_000);
  assert.equal(gate.idle, false);
  gate.suspend(false);
  advance(59_999);
  assert.equal(gate.idle, false);
  advance(1);
  gate.input({ type: 'pointerdown', pointerId: 9 });
  gate.configure(0);
  assert.equal(gate.input({ type: 'click' }), true);
  assert.equal(gate.input({ type: 'pointerdown', pointerId: 10 }), false);
  assert.deepEqual(states, [true, false, true, false]);
});

test('the idle display only projects essential provider states and current timers', () => {
  assert.deepEqual(idleStatuses({ viewOnly: true, page: 'Fixture private page' }, {
    status: 'connected', streaming: { active: true, phase: 'reconnecting' }, recording: { active: true, paused: true }, program: 'Fixture private scene',
  }), ['View-only mode', 'Stream reconnecting', 'Recording paused']);
  assert.deepEqual(timerLines({ config: { countdownSeconds: 10 }, countdown: { durationMs: 10_000, elapsedMs: 9_000 }, rundown: {
    index: 0, elapsedMs: 2_000, segments: [{ name: 'Fixture private name', seconds: 1 }],
  } }, 2_000, timerProjection), ['Countdown · +00:01 overrun', 'Segment 1 of 1 · +00:03 overrun']);
  assert.deepEqual(timerLines({ config: { countdownSeconds: 10 } }, 0, timerProjection), []);
});

test('existing appearance files default to no idle screen and MCP navigation cannot enable it', () => {
  assert.equal(DEFAULT_APPEARANCE.idleScreenSeconds, 0);
  assert.equal(normalizeAppearance({ textScale: 125 }).idleScreenSeconds, 0);
  assert.equal(normalizeAppearance({ idleScreenSeconds: 13 }).idleScreenSeconds, 0);
  assert.equal(validAppearanceSetting('idleScreenSeconds', 60), true);
  assert.throws(() => navigationParams({ command: 'appearance', setting: 'idleScreenSeconds', value: 60 }), /supported/);
});
