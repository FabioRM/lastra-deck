'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { RetainedTelemetry } = require('../src/main/retained-telemetry');
const { MonitoringSettings } = require('../src/main/monitoring-settings');
const { StatsMonitor } = require('../src/main/stats');
const { tempDir } = require('./helpers/temp-dir');

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = Date.UTC(2026, 9, 28, 17);

function directory(t) {
  const fixture = tempDir(t, 'lastra-retained-telemetry-');
  return fixture;
}

test('telemetry retention is opt-in and preserves older monitoring interval settings', (t) => {
  const folder = directory(t);
  const config = path.join(folder, 'monitoring.json');
  const history = path.join(folder, 'telemetry-history.json');
  fs.writeFileSync(config, JSON.stringify({ version: 1, intervals: { media: 2000, hardware: 5000 } }));
  const settings = new MonitoringSettings(config);
  const store = new RetainedTelemetry(history, { hours: settings.historyHours, now: () => NOW });
  assert.equal(settings.historyHours, 0);
  store.record({ sampledAt: NOW, cpu: .6 });
  assert.equal(fs.existsSync(history), false);
  assert.deepEqual(store.options(), []);
  settings.setHistoryHours(24);
  assert.throws(() => settings.setHistoryHours(3), /telemetry retention/);
  assert.equal(new MonitoringSettings(config).intervals.media, 2000);
  assert.equal(new MonitoringSettings(config).historyHours, 24);
  settings.set('hardware', 10_000);
  assert.equal(new MonitoringSettings(config).historyHours, 24);
  assert.equal(new MonitoringSettings(config).intervals.hardware, 10_000);
  store.configure(24);
  assert.deepEqual(store.options().map(({ ms }) => ms), [HOUR, 24 * HOUR]);
});

test('retained curves use bounded averages across restart and skip repeated and stale hardware samples', (t) => {
  const file = path.join(directory(t), 'telemetry-history.json');
  let now = NOW - HOUR;
  const store = new RetainedTelemetry(file, { hours: 1, now: () => now });
  const first = now;
  store.record({ sampledAt: first, cpu: .2, ram: .5, hardwareAt: first, hardwareStaleMs: 1_500, gpu: .4 });
  store.record({ sampledAt: first + 1000, cpu: .6, hardwareAt: first, hardwareStaleMs: 1_500, gpu: .9 });
  store.record({ sampledAt: first + 3000, hardwareAt: first + 1000, hardwareStaleMs: 1_500, gpu: .8 });
  now += 10 * MINUTE;
  store.record({ sampledAt: now, cpu: .7, hardwareAt: now, hardwareStaleMs: 1_500, gpu: .6 });
  store.flush();
  const closed = new RetainedTelemetry(file, { hours: 1, now: () => now });
  assert.deepEqual(closed.chart('cpu', HOUR, now).points, [[first + 1000, 40], [now, 70]]);
  assert.deepEqual(closed.chart('gpu', HOUR, now).points, [[first, 40], [now, 60]]);
  assert.ok(closed.chart('cpu', HOUR, now).gapMs < 10 * MINUTE);
  assert.equal(closed.chart('gpu', 24 * HOUR, now), undefined);
  closed.configure(0);
  assert.deepEqual(closed.options(), []);
  closed.configure(1);
  assert.equal(closed.chart('cpu', HOUR, now).points.length, 2);
});

test('storage pruning and result resolution bound a full day even with minutes of gaps', (t) => {
  const file = path.join(directory(t), 'telemetry-history.json');
  let now = NOW - 25 * HOUR;
  const store = new RetainedTelemetry(file, { hours: 24, now: () => now });
  store.lastSavedAt = NOW;
  for (let i = 0; i <= 25 * 60; i++) {
    store.record({ sampledAt: now, cpu: .25, ram: .3, gpu: .7, cpuTemp: 55, gpuTemp: 73, hardwareAt: now, hardwareStaleMs: 5000 });
    now += MINUTE;
  }
  store.flush(now);
  assert.ok(fs.statSync(file).size < 512 * 1024);
  const reopened = new RetainedTelemetry(file, { hours: 24, now: () => now });
  const report = reopened.chart('cpu', 24 * HOUR, now);
  assert.equal(report.points.length, 60);
  assert.ok(report.points.every(([time, value]) => time >= now - 24 * HOUR && value === 25));
  reopened.configure(1);
  const shortened = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(shortened.series.cpu.length < 63);
});

test('long-range charts are separate from current Stats reading values and unsupported sensors', () => {
  const retained = { options: () => [{ ms: HOUR, label: 'Last hour' }], chart: (metric) => metric === 'cpu'
    ? { points: [[NOW - 500_000, 43]], gapMs: 3 * MINUTE } : undefined };
  const stats = new StatsMonitor({ sample: () => ({ sample: { cpu: .57, ram: .33, sampledAt: NOW } }),
    display: () => ({ displays: [] }), foreground: () => null, framesExecutable: null, now: () => NOW, retained });
  const view = stats.snapshot({ refresh: false, range: HOUR });
  const cpu = view.overview.find(({ id }) => id === 'cpu');
  assert.deepEqual(cpu.points, [[NOW - 500_000, 43]]);
  assert.equal(cpu.chartWindow, HOUR);
  assert.ok(Math.abs(cpu.value - 57) < .01);
  assert.equal(view.readings.find(({ id }) => id === 'cpu').chartWindow, undefined);
  assert.equal(view.overview.find(({ id }) => id === 'fps').chartWindow, undefined);
});
