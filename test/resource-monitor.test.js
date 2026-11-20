'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { ResourceMonitor } = require('../src/main/resource-monitor');
const { createProcessReader } = require('../src/main/process-metrics-win32');
const { MonitoringSettings, DEFAULTS } = require('../src/main/monitoring-settings');
const { tempDir } = require('./helpers/temp-dir');

function fixture() {
  let time = 100;
  const calls = [];
  const helpers = { hardware: 30, media: null };
  const processes = [
    { pid: 11, creationTime: 101, cpu: { cumulativeCPUUsage: 1 }, memory: { workingSetSize: 71 * 1024 } },
    { pid: 12, creationTime: 101, cpu: { cumulativeCPUUsage: 3 }, memory: { workingSetSize: 38 * 1024 } },
    { pid: 30, creationTime: 103, cpu: { cumulativeCPUUsage: 1 }, memory: { workingSetSize: 12 * 1024 } },
  ];
  const helper = { started: 103n, cpuSeconds: 0.5, workingSetKiB: 12 * 1024 };
  const monitor = new ResourceMonitor({
    now: () => time, cores: 4, helperPids: () => helpers,
    readApp() { calls.push('app'); return processes; },
    readHelper(pid) { calls.push(pid); return pid === 30 ? helper : null; },
  });
  return { monitor, calls, helpers, processes, helper, advance: (ms) => { time += ms; } };
}

test('resource sampling is on demand and combines only the Electron processes without counting managed helpers twice', () => {
  const { monitor, calls, processes, helper, advance } = fixture();
  assert.deepEqual(calls, []);
  const first = monitor.snapshot();
  assert.equal(first.intervalMs, 2000);
  assert.deepEqual(first.rows, [
    { id: 'electron', count: 2, status: 'ready', cpuStatus: 'measuring', cpuPercent: null, workingSetMiB: 109 },
    { id: 'hardware', count: 1, status: 'ready', cpuStatus: 'measuring', cpuPercent: null, workingSetMiB: 12 },
    { id: 'media', count: 0, status: 'inactive', cpuStatus: 'unavailable', cpuPercent: null, workingSetMiB: null },
  ]);
  advance(900);
  assert.equal(monitor.snapshot(), first);
  assert.deepEqual(calls, ['app', 30]);

  advance(1100);
  processes[0].cpu.cumulativeCPUUsage += 0.8;
  processes[1].cpu.cumulativeCPUUsage += 0.2;
  helper.cpuSeconds += 0.25;
  const second = monitor.snapshot();
  assert.ok(Math.abs(second.rows[0].cpuPercent - 12.5) < 1e-9);
  assert.equal(second.rows[1].cpuPercent, 3.125);
  assert.deepEqual(calls, ['app', 30, 'app', 30]);
});

test('new and unavailable helpers cannot reuse prior CPU baselines', () => {
  const { monitor, helpers, processes, helper, advance } = fixture();
  monitor.snapshot();
  advance(2000);
  helper.started = 107n;
  helper.cpuSeconds += 1;
  helpers.media = 40;
  processes[0].creationTime = 109;
  processes[0].cpu.cumulativeCPUUsage += 3;
  let rows = monitor.snapshot().rows;
  assert.equal(rows[0].cpuPercent, 0);
  assert.equal(rows[1].cpuStatus, 'measuring');
  assert.equal(rows[2].status, 'unavailable');

  advance(14000);
  rows = monitor.snapshot().rows;
  assert.equal(rows[0].cpuStatus, 'measuring');
  assert.equal(rows[1].cpuStatus, 'measuring');
});

test('memory can be reported when CPU counters are unsupported and helper absence spawns nothing', () => {
  const monitor = new ResourceMonitor({
    helperPids: () => ({}),
    readHelper() { assert.fail('No owned helper PID'); },
    readApp: () => [{ pid: 11, memory: { workingSetSize: 2048 } }],
  });
  assert.deepEqual(monitor.snapshot().rows[0], {
    id: 'electron', count: 1, status: 'ready', cpuStatus: 'unavailable', cpuPercent: null, workingSetMiB: 2,
  });
  assert.equal(createProcessReader('linux')(process.pid), null);
});

test('refresh settings validate, preserve independent defaults, and round-trip through a local file', (t) => {
  const directory = tempDir(t, 'lastra-refresh-test-');
  const file = path.join(directory, 'monitoring.json');
  const settings = new MonitoringSettings(file);
  assert.deepEqual(settings.snapshot().intervals, DEFAULTS);
  assert.equal(fs.existsSync(file), false);
  assert.throws(() => settings.set('__proto__', 2_000), /supported/);
  assert.throws(() => settings.set('media', 10_000), /supported/);
  assert.throws(() => settings.set('hardware', '10000'), /supported/);
  settings.set('hardware', 10_000);
  settings.set('media', 3_000);
  assert.deepEqual(new MonitoringSettings(file).intervals, { ...DEFAULTS, hardware: 10_000, media: 3_000 });
  fs.writeFileSync(file, JSON.stringify({ version: 1, intervals: { http: 5_000, media: '3s', resources: 5_000 } }));
  assert.deepEqual(new MonitoringSettings(file).intervals, { ...DEFAULTS, http: 5_000, resources: 5_000 });
});

test('the resources view updates refresh settings without forcing more process samples', () => {
  const { advance, monitor } = fixture();
  const changes = [];
  const intervals = { ...DEFAULTS };
  monitor.settings = {
    snapshot: () => ({ intervals }),
    set(source, ms) {
      intervals[source] = ms;
      return this.snapshot();
    },
  };
  monitor.onSettingsChanged = ({ resources }) => changes.push(resources);
  const first = monitor.snapshot();
  const changed = monitor.change({ action: 'refresh', source: 'resources', intervalMs: 10_000 });
  assert.equal(changed.settings.intervals.resources, 10_000);
  const next = monitor.snapshot();
  assert.equal(next.intervalMs, 10_000);
  assert.equal(next.rows, first.rows);
  assert.deepEqual(changes, [10_000]);
  advance(10_000);
  assert.equal(monitor.snapshot().rows[0].cpuStatus, 'ready');
});
