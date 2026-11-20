'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: wait } = require('node:timers/promises');
const { test } = require('node:test');
const { Pomodoro } = require('../src/main/pomodoro');
const { deckRequestAllowed } = require('../src/main/deck-view-only');
const { tempDir } = require('./helpers/temp-dir');

const FOCUS = 25 * 60_000;
const BREAK = 5 * 60_000;

function fixture(t) {
  const instances = [];
  t.after(() => instances.forEach((instance) => instance.close()));
  const root = tempDir(t, 'lastra-pomodoro-');
  const file = path.join(root, 'pomodoro.json');
  let wall = 1_750_000_000_000;
  let monotonic = 100;
  const create = () => {
    const timer = new Pomodoro(file, { wall: () => wall, monotonic: () => monotonic });
    instances.push(timer);
    return timer;
  };
  return { file, create, elapsed: (ms) => { wall += ms; monotonic += ms; }, wallJump: (ms) => { wall += ms; } };
}

const apply = (timer, type) => timer.change({ type, revision: timer.snapshot().revision });

test('Pomodoro starts only on request and preserves pause and elapsed focus across restarts', (t) => {
  const { file, create, elapsed } = fixture(t);
  const timer = create();
  assert.deepEqual(timer.snapshot(), { phase: 'focus', status: 'idle', durationMs: FOCUS,
    remainingMs: FOCUS, revision: 0, warning: null });
  assert.equal(fs.existsSync(file), false);
  assert.equal(apply(timer, 'start').status, 'running');
  assert.throws(() => timer.change({ type: 'pause', revision: 0 }), /changed/);
  elapsed(12_000);
  const paused = apply(timer, 'pause');
  assert.equal(paused.remainingMs, FOCUS - 12_000);
  timer.close();
  elapsed(4_000);
  const restored = create();
  assert.deepEqual(restored.snapshot(), paused);
  apply(restored, 'resume');
  restored.close();
  elapsed(9_000);
  const running = create();
  assert.equal(running.snapshot().remainingMs, FOCUS - 21_000);
  const reset = apply(running, 'reset');
  assert.equal(reset.status, 'idle');
  assert.equal(reset.remainingMs, FOCUS);
});

test('resuming from Windows sleep reconciles the persisted deadline without increasing remaining time', (t) => {
  const { file, create, wallJump, elapsed } = fixture(t);
  const timer = create();
  apply(timer, 'start');
  const before = fs.readFileSync(file, 'utf8');
  wallJump(9000);
  assert.equal(timer.snapshot().remainingMs, FOCUS, 'normal clock edits leave active monotonic time intact');
  timer.restoreClock();
  assert.equal(timer.snapshot().remainingMs, FOCUS - 9000);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  elapsed(5_000);
  wallJump(-25_000);
  timer.restoreClock();
  assert.equal(timer.snapshot().remainingMs, FOCUS - 14_000);
});

test('focus and break stop at zero and the next round requires an explicit tap', async (t) => {
  const { file, create, elapsed, wallJump } = fixture(t);
  const active = create();
  const start = apply(active, 'start');
  active.close();
  elapsed(FOCUS + 1000);
  const expired = create();
  assert.equal(expired.snapshot().phase, 'focus');
  assert.equal(expired.snapshot().remainingMs, 0);
  assert.equal(expired.snapshot().status, 'complete');
  assert.throws(() => expired.change({ type: 'pause', revision: start.revision }), /changed/);
  await wait(30);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).status, 'complete');
  wallJump(-FOCUS - 1000);
  const restored = create();
  assert.equal(restored.snapshot().status, 'complete');
  const rest = apply(restored, 'start');
  assert.equal(rest.phase, 'break');
  assert.equal(rest.remainingMs, BREAK);
  elapsed(BREAK);
  assert.equal(restored.snapshot().status, 'complete');
  assert.equal(restored.snapshot().phase, 'break');
  assert.equal(apply(restored, 'start').phase, 'focus');
});

test('bad persistence does not start or mutate a round, and view-only still reads time', (t) => {
  const { file, create } = fixture(t);
  fs.mkdirSync(file);
  const timer = create();
  const idle = timer.snapshot();
  assert.match(idle.warning, /could not be read/);
  assert.throws(() => apply(timer, 'start'), /could not save/);
  assert.deepEqual(timer.snapshot(), idle);
  assert.equal(deckRequestAllowed('dashboard:pomodoro:read'), true);
  assert.equal(deckRequestAllowed('dashboard:pomodoro:change', { type: 'start' }), false);
});
