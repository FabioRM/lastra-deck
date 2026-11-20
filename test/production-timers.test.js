'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { Obs } = require('../src/main/obs');
const { ProductionTimers, productionConfig } = require('../src/main/production-timers');
const { ObsOutputTiming, readOutputTiming, OUTPUT_TIMING_REFRESH_MS } = require('../src/main/obs-output-timing');
const { providerTime, timerProjection } = require('../src/renderer/obs-production');
const { tempDir } = require('./helpers/temp-dir');

function fixture(t) {
  const directory = tempDir(t, 'lastra-production-');
  return path.join(directory, 'timers.json');
}

const config = { version: 1, countdownSeconds: 20, segments: [{ name: 'Arrival', seconds: 10 }, { name: 'Interview', seconds: 40 }] };

test('production presets persist while countdown and rundown start idle after restart', (t) => {
  const file = fixture(t);
  let tick = 50_000;
  const timers = new ProductionTimers(file, { now: () => tick });
  const issue = (type, fields = {}) => timers.change({ type, revision: timers.snapshot().revision, ...fields });
  assert.equal(timers.snapshot().countdown, null);
  assert.equal(timers.snapshot().rundown, null);
  assert.equal(fs.existsSync(file), false);
  assert.throws(() => issue('start-rundown'), /Add at least one segment/);
  issue('configure', { config });
  issue('start-countdown');
  issue('start-rundown');
  tick += 14_500;
  const shown = timerProjection(timers.snapshot(), 100);
  assert.deepEqual(shown.countdownTime, { state: 'running', label: '00:06' });
  assert.deepEqual(shown.rundownTime, { state: 'overrun', label: '+00:04' });
  assert.equal(shown.current.name, 'Arrival');
  assert.equal(shown.next.name, 'Interview');
  const restored = new ProductionTimers(file).snapshot();
  assert.deepEqual(restored.config, config);
  assert.equal(restored.rundown, null);
  assert.equal(restored.countdown, null);
});

test('editing presets during a production keeps the active timings and revisions prevent repeated advances', (t) => {
  let tick = 0;
  const timers = new ProductionTimers(fixture(t), { now: () => tick });
  const issue = (type, fields = {}) => timers.change({ type, revision: timers.revision, ...fields });
  issue('configure', { config });
  const start = issue('start-rundown');
  issue('start-countdown');
  issue('configure', { config: { ...config, countdownSeconds: 50, segments: [{ name: 'New', seconds: 2 }] } });
  assert.throws(() => timers.change({ type: 'advance-rundown', revision: start.revision }), /timer changed/);
  tick = 23_000;
  assert.deepEqual(timerProjection(timers.snapshot(), 0).countdownTime, { state: 'overrun', label: '+00:03' });
  const next = issue('advance-rundown');
  assert.equal(next.rundown.segments[next.rundown.index].name, 'Interview');
  assert.deepEqual(next.rundown.completed, [23_000]);
  tick = 50_000;
  const complete = issue('advance-rundown');
  assert.equal(complete.rundown.elapsedMs, null);
  assert.deepEqual(timerProjection(complete, 1000).rundownTime, { state: 'complete', label: 'Complete' });
  assert.equal(issue('advance-rundown').revision, complete.revision);
  assert.equal(issue('start-rundown').rundown.segments[0].name, 'New');
  issue('reset-countdown');
  assert.equal(issue('start-countdown').countdown.durationMs, 50_000);
  assert.equal(issue('reset-rundown').rundown, null);
});

test('invalid timer settings preserve existing bytes and save failures keep the active state', (t) => {
  const file = fixture(t);
  fs.writeFileSync(file, '{invalid');
  const timers = new ProductionTimers(file);
  assert.match(timers.snapshot().warning, /Could not read/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{invalid');
  assert.throws(() => productionConfig({ ...config, countdownSeconds: Infinity }), /countdown/);
  assert.throws(() => productionConfig({ ...config, segments: [{ name: 'bad\ntext', seconds: 5 }] }), /Segment 1/);
  const alias = new ProductionTimers(path.join(file, 'blocked.json'));
  alias.change({ type: 'start-countdown', revision: 1 });
  assert.throws(() => alias.change({ type: 'configure', revision: 2, config }), /Could not save/);
  assert.equal(alias.snapshot().countdown.durationMs, 300_000);
  assert.equal(alias.snapshot().revision, 2);
});

test('OBS duration cache reuses status samples, polls active outputs only, and coalesces reads', async () => {
  let now = 0;
  const timing = new ObsOutputTiming({ now: () => now });
  const methods = [];
  let finish;
  const request = (method) => {
    methods.push(method);
    return new Promise((resolve) => { finish = resolve; });
  };
  const read = () => timing.read(request, () => true, { recording: false, streaming: true });
  timing.seed({ streaming: timing.sample('streaming', { outputActive: true, outputDuration: 50_000 }) });
  assert.deepEqual((await read()).streaming, { state: 'active', durationMs: 50_000, ageMs: 0 });
  assert.deepEqual(methods, []);
  now = OUTPUT_TIMING_REFRESH_MS;
  const first = read();
  const duplicate = read();
  assert.deepEqual(methods, ['GetStreamStatus']);
  finish({ outputActive: true, outputDuration: 54_000 });
  assert.deepEqual(await first, await duplicate);
  assert.equal((await read()).streaming.durationMs, 54_000);
  assert.deepEqual(methods, ['GetStreamStatus']);
});

test('output changes invalidate in-flight samples and disconnection rejects the result', async () => {
  let current = true;
  const timing = new ObsOutputTiming({ now: () => 1_000 });
  let finish;
  const request = () => new Promise((resolve) => { finish = resolve; });
  const read = () => timing.read(request, () => current, { recording: true });
  const beforePause = read();
  timing.invalidate('recording');
  finish({ outputActive: true, outputPaused: false, outputDuration: 1_000 });
  assert.equal((await beforePause).recording, null);
  const beforeDisconnect = read();
  current = false;
  finish({ outputActive: true, outputPaused: true, outputDuration: 2_000 });
  assert.equal(await beforeDisconnect, null);
});

test('the production panel only interpolates fresh active OBS durations', () => {
  assert.deepEqual(providerTime({ state: 'active', durationMs: 2500, ageMs: 400 }, 200), { state: 'active', label: '00:03' });
  assert.deepEqual(providerTime({ state: 'paused', durationMs: 2500, ageMs: 400 }, 3000), { state: 'paused', label: '00:02' });
  assert.equal(providerTime({ state: 'active', durationMs: 2500, ageMs: 400 }, 10_000).state, 'stale');
  assert.equal(providerTime({ state: 'active', durationMs: null, ageMs: 0 }, 0).state, 'unavailable');
  assert.equal(providerTime({ state: 'reconnecting', durationMs: 2500, ageMs: 0 }, 0).state, 'reconnecting');
  assert.equal(providerTime(readOutputTiming('streaming', { outputActive: false, outputDuration: 20_000 }, 0), 0).state, 'idle');
});

test('the existing OBS session supplies confirmed read-only timing and invalidates it at output events', async () => {
  const peer = new EventEmitter();
  const methods = [];
  let paused = false;
  peer.stop = () => {};
  peer.disconnect = () => {};
  peer.request = async (method) => {
    methods.push(method);
    if (method === 'GetRecordStatus') return { outputActive: true, outputPaused: paused, outputDuration: 10_000 };
    if (method === 'GetStreamStatus') return { outputActive: true, outputDuration: 52_000, outputReconnecting: false };
    return {};
  };
  const obs = new Obs({ status: 'connecting' }, peer);
  peer.emit('status', 'syncing');
  await obs.session.sync;
  const generation = obs.view.generation;
  assert.equal(obs.view.status, 'connected');
  const original = methods.length;
  assert.equal((await obs.outputTiming(generation)).streaming.durationMs, 52_000);
  assert.equal(methods.length, original);
  assert.equal(obs.outputTiming(generation + 1), null);
  assert.equal(obs.outputTiming(generation, () => false), null);
  paused = true;
  peer.emit('event', 'RecordStateChanged', { outputState: 'OBS_WEBSOCKET_OUTPUT_PAUSED', outputActive: true });
  assert.equal((await obs.outputTiming(generation)).recording.state, 'paused');
  assert.deepEqual(methods.slice(original), ['GetRecordStatus']);
  peer.emit('status', 'disconnected');
  assert.equal(obs.outputTiming(generation), null);
  assert.ok(methods.every((method) => method.startsWith('Get')));
});
