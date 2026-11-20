'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { Timers } = require('../src/main/timers');
const { createActionRunner } = require('../src/main/actions');
const { validateProfile } = require('../src/main/profile');
const { simulateGesture } = require('../src/main/mcp-simulate');
const { deckRequestAllowed } = require('../src/main/deck-view-only');
const { normalizeWidgetInstances } = require('../src/main/widgets');
const { toView } = require('../src/shared/deck-view');
const { timerKeyState, keyLiveAppearance } = require('../src/renderer/key-live-state');
const { MAX_TIMERS, timerFields, timerReading, formatTimer, timerSummary, timerLines } = require('../src/shared/timers');

const tea = { id: 'tea', label: 'Tea', durationMs: 180_000 };

function store(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lastra-timers-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'timers.json');
  const clock = { now: 1_000_000 };
  const events = [];
  const open = () => {
    const timers = new Timers(file, { now: () => clock.now, onChange: (state, event) => events.push({ state, ...event }) });
    t.after(() => timers.close());
    return timers;
  };
  return { file, clock, events, open };
}

test('a timer action needs an ID, a name and a duration that fits its kind', () => {
  assert.deepEqual(timerFields({ type: 'timer', ...tea }), { ...tea, kind: 'countdown', command: 'toggle' });
  assert.deepEqual(timerFields({ id: 'lap', label: ' Lap ', kind: 'stopwatch', command: 'restart' }),
    { id: 'lap', label: 'Lap', kind: 'stopwatch', command: 'restart' });
  assert.throws(() => timerFields({ ...tea, id: 'no spaces' }), /valid ID/);
  assert.throws(() => timerFields({ ...tea, label: '   ' }), /timer name/);
  assert.throws(() => timerFields({ ...tea, durationMs: 999 }), /1 second to 24 hours/);
  assert.throws(() => timerFields({ ...tea, durationMs: 24 * 3_600_000 + 1 }), /1 second to 24 hours/);
  assert.throws(() => timerFields({ id: 'lap', label: 'Lap', kind: 'stopwatch', durationMs: 1000 }), /no duration/);
  assert.throws(() => timerFields({ ...tea, kind: 'alarm' }), /countdown or a stopwatch/);
  assert.throws(() => timerFields({ ...tea, command: 'explode' }), /supported timer command/);

  const key = (action) => ({ grid: { cols: 1, rows: 1 }, keys: [{ id: 'timer', action }] });
  assert.doesNotThrow(() => validateProfile(key({ type: 'timer', ...tea })));
  assert.throws(() => validateProfile(key({ type: 'timer', ...tea, durationMs: 0 })), /key 1: A countdown lasts/);
});

test('readings count down, count up and format as a clock', () => {
  const running = { ...tea, kind: 'countdown', status: 'running', valueMs: 180_000, anchorAt: 1_000 };
  assert.deepEqual(timerReading(running, 61_000), { status: 'running', ms: 120_000 });
  assert.deepEqual(timerReading(running, 500), { status: 'running', ms: 180_000 }, 'a clock set back never adds time');
  assert.deepEqual(timerReading(running, 999_000), { status: 'complete', ms: 0 });
  const lap = { id: 'lap', label: 'Lap', kind: 'stopwatch', status: 'running', valueMs: 5_000, anchorAt: 1_000 };
  assert.deepEqual(timerReading(lap, 3_500), { status: 'running', ms: 7_500 });
  assert.equal(formatTimer(119_001), '2:00');
  assert.equal(formatTimer(3_723_000), '1:02:03');
  assert.equal(formatTimer(7_999, 'stopwatch'), '0:07');
  assert.deepEqual(timerSummary(running, 61_000), { status: 'running', state: 'Running', time: '2:00 left' });
  assert.deepEqual(timerLines({ timers: [running, { ...lap, status: 'paused', anchorAt: null },
    { ...running, id: 'egg', label: 'Egg', status: 'complete', valueMs: 0, anchorAt: null, endedAt: 5 }] }, 61_000),
  ['Tea · 2:00 left', 'Lap · 0:05 paused', 'Egg · Finished']);
  assert.deepEqual(timerLines(undefined, 0), []);
});

test('timers start, pause, resume, restart and finish on the wall clock', (t) => {
  const { clock, events, open } = store(t);
  const timers = open();
  timers.start();
  assert.equal(timers.change({ type: 'start', ...tea }).message, 'Started Tea · 3:00');
  clock.now += 60_000;
  assert.equal(timers.change({ type: 'pause', id: 'tea' }).message, 'Paused Tea');
  clock.now += 600_000;
  assert.deepEqual(timerReading(timers.snapshot().timers[0], clock.now), { status: 'paused', ms: 120_000 });
  assert.throws(() => timers.change({ type: 'pause', id: 'tea' }), /no running timer/);
  assert.equal(timers.change({ type: 'resume', id: 'tea' }).message, 'Resumed Tea');
  clock.now += 119_999;
  timers.settle();
  assert.equal(timers.snapshot().timers[0].status, 'running');
  clock.now += 1;
  timers.settle();
  const [finished] = timers.snapshot().timers;
  assert.equal(finished.status, 'complete');
  assert.equal(finished.endedAt, clock.now);
  assert.deepEqual(events.at(-1).completed.map(({ id, label }) => [id, label]), [['tea', 'Tea']]);
  assert.equal(timers.activeCount(), 0);
  assert.equal(timers.change({ type: 'restart', id: 'tea' }).message, 'Started Tea · 3:00');
  assert.deepEqual(events.at(-1).cleared, ['tea'], 'restarting a finished timer clears its alert');
  assert.equal(timers.activeCount(), 1);
  assert.throws(() => timers.change({ type: 'resume', id: 'missing' }), /no paused timer/);
  assert.throws(() => timers.change({ type: 'nap' }), /timer control/);
});

test('a key toggles its own timer and can restart it with a new duration', (t) => {
  const { clock, events, open } = store(t);
  const timers = open();
  const press = (extra = {}) => timers.change({ type: 'toggle', ...tea, ...extra }).message;
  assert.equal(press(), 'Started Tea · 3:00');
  assert.equal(press(), 'Paused Tea');
  assert.equal(press(), 'Resumed Tea');
  clock.now += 180_000;
  assert.equal(press(), 'Dismissed Tea', 'a press on a finished timer dismisses it');
  assert.deepEqual(events.at(-1).cleared, ['tea']);
  assert.deepEqual(timers.snapshot().timers, []);
  assert.equal(timers.change({ type: 'remove', id: 'tea' }).message, 'That timer is not running.');
  press();
  assert.equal(timers.change({ type: 'restart', ...tea, durationMs: 60_000 }).message, 'Started Tea · 1:00');
  assert.equal(timers.snapshot().timers[0].durationMs, 60_000);
  assert.throws(() => timers.change({ type: 'toggle', id: 'unknown' }), /no longer available/);
});

test('a stopwatch counts up and a widget start picks a free ID', (t) => {
  const { clock, open } = store(t);
  const timers = open();
  assert.equal(timers.change({ type: 'start', label: 'Stopwatch', kind: 'stopwatch' }).message, 'Started Stopwatch');
  timers.change({ type: 'start', label: '5 min', durationMs: 300_000 });
  assert.deepEqual(timers.snapshot().timers.map(({ id }) => id), ['timer-1', 'timer-2']);
  clock.now += 90_000;
  timers.settle();
  const [lap] = timers.snapshot().timers;
  assert.deepEqual(timerSummary(lap, clock.now), { status: 'running', state: 'Running', time: '1:30' });
  timers.change({ type: 'pause', id: 'timer-1' });
  clock.now += 90_000;
  assert.equal(timerReading(timers.snapshot().timers[0], clock.now).ms, 90_000);
});

test('timers survive a restart and finish while Lastra is closed', (t) => {
  const { file, clock, events, open } = store(t);
  const first = open();
  first.change({ type: 'start', ...tea });
  first.change({ type: 'start', id: 'lap', label: 'Lap', kind: 'stopwatch' });
  first.change({ type: 'start', id: 'egg', label: 'Egg', durationMs: 600_000 });
  first.change({ type: 'pause', id: 'egg' });
  first.close();
  clock.now += 240_000;
  events.length = 0;
  const second = open();
  assert.deepEqual(events, [], 'opening the file announces nothing until Lastra is ready');
  second.start();
  assert.deepEqual(events[0].completed.map(({ id, endedAt }) => [id, endedAt]), [['tea', clock.now - 60_000]]);
  const byId = Object.fromEntries(second.snapshot().timers.map((timer) => [timer.id, timerReading(timer, clock.now)]));
  assert.deepEqual(byId, { tea: { status: 'complete', ms: 0 }, lap: { status: 'running', ms: 240_000 }, egg: { status: 'paused', ms: 600_000 } });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).timers.find(({ id }) => id === 'tea').status, 'complete');
});

test('a damaged file starts empty with a warning and a full list drops a finished timer first', (t) => {
  const { file, clock, open } = store(t);
  fs.writeFileSync(file, '{"version":1,"timers":[{"id":"x"}]}');
  const timers = open();
  assert.deepEqual(timers.snapshot().timers, []);
  assert.match(timers.snapshot().warning, /could not be read/);
  for (let index = 0; index < MAX_TIMERS; index++) timers.change({ type: 'start', label: `Timer ${index}`, durationMs: 1_000 + index * 60_000 });
  assert.equal(timers.snapshot().warning, null, 'a successful save clears the warning');
  assert.throws(() => timers.change({ type: 'start', label: 'One more', durationMs: 60_000 }), /keeps up to 12/);
  clock.now += 1_000;
  timers.change({ type: 'start', label: 'One more', durationMs: 60_000 });
  const { timers: list } = timers.snapshot();
  assert.equal(list.length, MAX_TIMERS);
  assert.equal(list.some(({ status }) => status === 'complete'), false);
  assert.equal(list.at(-1).label, 'One more');
});

test('the runner hands a validated timer action to the timer store', async () => {
  const calls = [];
  const runner = createActionRunner({ shell: {}, spawn() {}, input: {}, audio: {}, changeTimer: (fields) => { calls.push(fields); return 'Started Tea · 3:00'; } });
  assert.deepEqual(await runner.run({ type: 'timer', ...tea }, undefined), { ok: true, message: 'Started Tea · 3:00' });
  assert.deepEqual(calls, [{ ...tea, kind: 'countdown', command: 'toggle' }]);
  assert.equal((await runner.run({ type: 'timer', ...tea, durationMs: 1 }, undefined)).ok, false);
  const blocked = await runner.run({ type: 'timer', ...tea }, undefined, { guard: () => 'The page changed.' });
  assert.deepEqual([blocked.ok, calls.length], [false, 1]);
  const missing = createActionRunner({ shell: {}, spawn() {}, input: {}, audio: {} });
  assert.match((await missing.run({ type: 'timer', ...tea }, undefined)).message, /Timers are unavailable/);
});

test('an offline simulation reports a timer effect without starting one', async () => {
  const result = await simulateGesture({ profile: { grid: { cols: 1, rows: 1 }, keys: [{ id: 'tea', action: { type: 'timer', ...tea } }] },
    key: 'tea', windowId: 1 });
  assert.equal(result.status, 'success');
  assert.deepEqual(result.effects, [{ atMs: 0, type: 'timer' }]);
});

test('a timer key reports its timer and shows the time unless the readout is off', () => {
  const profile = validateProfile({ grid: { cols: 2, rows: 1 }, keys: [
    { id: 'tea', label: 'Tea', action: { type: 'timer', ...tea } },
    { id: 'lap', label: 'Lap', readout: 'none', action: { type: 'timer', id: 'lap', label: 'Lap', kind: 'stopwatch' } },
  ] });
  const [first, second] = toView(profile).slots;
  assert.deepEqual([first.liveSource, first.readout, first.timer], ['timer', 'timer', { id: 'tea', kind: 'countdown', durationMs: 180_000 }]);
  assert.deepEqual([second.liveSource, second.readout, second.timer], ['timer', undefined, { id: 'lap', kind: 'stopwatch', durationMs: undefined }]);
});

test('timer keys read Ready, Running, Paused and Finished', () => {
  const key = { id: 'tea', kind: 'countdown', durationMs: 180_000 };
  const ready = (timers) => ({ status: 'ready', timers });
  const running = { ...tea, kind: 'countdown', status: 'running', valueMs: 180_000, anchorAt: 0 };
  assert.deepEqual(timerKeyState(undefined, key), { text: 'Checking…', pressed: null });
  assert.equal(timerKeyState({ status: 'unavailable', timers: [] }, key).text, 'Unavailable');
  assert.deepEqual(timerKeyState(ready([]), key, 0), { text: 'Ready', pressed: false, reading: '3:00' });
  assert.deepEqual(timerKeyState(ready([]), { id: 'lap', kind: 'stopwatch' }, 0), { text: 'Ready', pressed: false, reading: '' });
  assert.deepEqual(timerKeyState(ready([running]), key, 30_000), { text: 'Running', pressed: true, reading: '2:30 left', finished: false });
  const paused = timerKeyState(ready([{ ...running, status: 'paused', valueMs: 90_000, anchorAt: null }]), key, 30_000);
  assert.deepEqual(paused, { text: 'Paused', pressed: 'mixed', reading: '1:30', finished: false });
  const finished = timerKeyState(ready([{ ...running, status: 'complete', valueMs: 0, anchorAt: null, endedAt: 1 }]), key, 30_000);
  assert.deepEqual(finished, { text: 'Finished', pressed: false, reading: '', finished: true });
  assert.equal(keyLiveAppearance('timer', 'Tea', finished).tone, 'muted');
  assert.equal(keyLiveAppearance('timer', 'Tea', timerKeyState(ready([running]), key, 1)).tone, 'playing');
  assert.equal(keyLiveAppearance('timer', 'Tea', paused).tone, 'neutral');
});

test('view-only mode can read timers and cannot change them', () => {
  assert.equal(deckRequestAllowed('timers:read'), true);
  assert.equal(deckRequestAllowed('timers:change', { type: 'remove', id: 'tea' }), false);
});

test('the timers widget takes a quick countdown from 1 to 180 minutes', () => {
  const widget = (settings) => normalizeWidgetInstances([{ id: 'timers', type: 'timers', settings }])[0].settings;
  assert.deepEqual(widget(undefined), { quickMinutes: 5 });
  assert.deepEqual(widget({ quickMinutes: 25 }), { quickMinutes: 25 });
  assert.throws(() => widget({ quickMinutes: 0 }), /invalid "quickMinutes"/);
  assert.throws(() => widget({ quickMinutes: 181 }), /invalid "quickMinutes"/);
});

test('timers have a place in the power event order', () => {
  const { createPowerEvents } = require('../src/main/power-events');
  const listeners = new Map();
  const power = createPowerEvents({ on: (event, listener) => listeners.set(event, listener), removeListener() {} }, { log() {} });
  const calls = [];
  power.on('deck-session', 'resume', () => calls.push('deck-session'));
  power.on('timers', 'resume', () => calls.push('timers'));
  power.on('pomodoro', 'resume', () => calls.push('pomodoro'));
  listeners.get('resume')();
  assert.deepEqual(calls, ['pomodoro', 'timers', 'deck-session']);
});
