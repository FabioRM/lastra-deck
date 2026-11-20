'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { setImmediate } = require('node:timers/promises');
const { readTelemetry, telemetryParams } = require('../src/main/mcp-telemetry');
const { StatsMonitor } = require('../src/main/stats');
const { ResourceMonitor } = require('../src/main/resource-monitor');
const { PowerStatus } = require('../src/main/power-status');
const { ServiceHealth } = require('../src/main/service-health');
const { AlertInbox } = require('../src/main/alert-inbox');
const { TelemetryThresholds } = require('../src/main/telemetry-thresholds');
const { MonitoringWatchlist } = require('../src/main/monitoring-watchlist');
const { tempDir } = require('./helpers/temp-dir');

const clock = () => 180_000;
const query = (sources, params) => readTelemetry(telemetryParams(params), sources, clock);

test('passive Stats reports cached samples and never starts provider work or reads foreground', async (t) => {
  let windows = 0;
  let frames = 0;
  let foreground = 0;
  const stats = new StatsMonitor({ now: clock,
    sample: () => ({ sample: { cpu: 0.4, ram: 0.1, sampledAt: 179_000, hardwareAt: 172_000, hardwareSource: 'http' },
      hardware: [{ id: '/gpu-nvidia/0/fan/0', name: 'PRIVATE FAN', kind: 'GpuNvidia', type: 'fan', device: 'PRIVATE BOARD', value: 400 }],
      history: { cpu: [[115_000, .4], [130_000, .3], [140_000, .4], [166_000, null], [179_000, .4], [182_000, .9]] } }),
    display: () => ({ displays: [{ id: 20, label: 'PRIVATE DISPLAY', displayFrequency: 60 }], selected: 20 }),
    foreground: () => { foreground++; return { pid: 40, id: 'PRIVATE WINDOW ID', name: 'PRIVATE WINDOW TITLE' }; },
    framesExecutable: 'fixture',
    readWindows: () => { windows++; return { volumes: [{ id: 'P:', capacity: 2 ** 40, free: 2 ** 39, read: 2 ** 20 }] }; },
    readFrames: () => { frames++; return { fps: 120, ms: 8.3 }; },
  });
  t.after(() => stats.stop());
  const sources = { stats: () => stats.snapshot({ refresh: false }) };
  const initial = await query(sources, { section: 'metrics', group: 'frames' });
  assert.equal(initial.metrics.find(({ id }) => id === 'fps').status, 'unavailable');
  assert.deepEqual([windows, frames, foreground], [0, 0, 0]);
  assert.equal(stats.controller, null);
  stats.snapshot();
  await setImmediate();
  const acceptedReads = [windows, frames, foreground];
  assert.deepEqual(acceptedReads.slice(0, 2), [1, 1]);
  const captured = await query(sources, { section: 'metrics', limit: 40 });
  assert.deepEqual([windows, frames, foreground], acceptedReads);
  assert.equal(captured.metrics.find(({ id }) => id === 'fps').value, 120);
  assert.equal(captured.metrics.find(({ name }) => name === 'Disk read rate').value, 1);
  const fan = captured.metrics.find(({ group, value }) => group === 'cooling' && value === 400);
  assert.match(fan.id, /^metric-[a-f0-9]{20}$/);
  assert.equal(fan.status, 'stale');
  assert.equal(fan.ageMs, 8_000);
  assert.equal(fan.unit, 'RPM');
  for (const privateValue of ['PRIVATE', 'P:', 'gpu-nvidia', 'display:20']) assert.ok(!JSON.stringify(captured).includes(privateValue));

  const history = await query(sources, { section: 'history', metric: 'cpu', limit: 2 });
  assert.equal(history.totalPoints, 4);
  assert.deepEqual(history.points, [{ at: 166_000, value: null }, { at: 179_000, value: 40 }]);
  const cmp = await query(sources, { section: 'compare', metric: 'cpu', windows: [{ from: 121_000, to: 150_000 }, { from: 150_001, to: 180_000 }] });
  assert.deepEqual(cmp.windows.map(({ count, average }) => [count, average]), [[2, 35], [1, 40]]);
  assert.equal(cmp.averageDelta, 5);
  assert.equal((await query(sources, { section: 'history', metric: 'unavailable' })).status, 'unavailable');
});

test('metrics cursors are bounded and bound to their group and ordered IDs', async () => {
  const rows = ['cpu', 'cpuClock', 'cpuTemp'].map((id) => ({ id, group: 'cpu', unit: '%', source: 'Windows', value: 50,
    status: 'live', at: clock() }));
  const sources = { stats: () => ({ readings: rows }) };
  const first = await query(sources, { section: 'metrics', group: 'cpu', limit: 1 });
  assert.deepEqual(first.metrics.map(({ id }) => id), ['cpu']);
  const second = await query(sources, { section: 'metrics', group: 'cpu', limit: 1, cursor: first.nextCursor });
  assert.deepEqual(second.metrics.map(({ id }) => id), ['cpuClock']);
  await assert.rejects(query(sources, { section: 'metrics', group: 'gpu', limit: 1, cursor: first.nextCursor }), /cursor is unavailable/);
  rows.shift();
  await assert.rejects(query(sources, { section: 'metrics', group: 'cpu', limit: 1, cursor: first.nextCursor }), /cursor is unavailable/);
  assert.throws(() => telemetryParams({ section: 'metrics', limit: 41 }), /result limit/);
  assert.throws(() => telemetryParams({ section: 'compare', metric: 'cpu', windows: [{ from: 0, to: 60_001 }, { from: 1, to: 2 }] }), /60 seconds/);
  assert.throws(() => telemetryParams({ section: 'power', action: 'export', path: 'C:/private' }), /supported parameters/);
  assert.throws(() => telemetryParams({ section: 'alerts', command: 'acknowledge' }), /supported parameters/);
});

test('an alerts query evaluates only its selected reader and redacts source failures', async () => {
  const calls = [];
  const sources = Object.fromEntries(['stats', 'power', 'usage', 'services', 'alerts', 'thresholds', 'watchlist'].map((name) => [name, () => {
    calls.push(name);
    throw new Error('PRIVATE URL https://example.test/private-callback');
  }]));
  assert.deepEqual(await query(sources, { section: 'alerts' }), {
    version: 1, section: 'alerts', sampledAt: clock(), status: 'unavailable', alerts: [], warning: false,
  });
  assert.deepEqual(calls, ['alerts']);
});

test('approved monitoring records, power and usage use actual snapshots and remove raw labels and endpoints', async (t) => {
  const dir = tempDir(t, 'lastra-mcp-telemetry-');
  const write = (name, data) => {
    const file = path.join(dir, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify(data));
    return file;
  };
  const alertInbox = new AlertInbox(path.join(dir, 'alerts.json'), { now: clock });
  alertInbox.update({ id: 'service:private-host', name: 'PRIVATE PROJECT', source: 'Service health', targetId: 'private-host' }, 'active', 'PRIVATE ENDPOINT');
  let probes = 0;
  const serviceHealth = new ServiceHealth(write('services', { version: 1, checks: [{ id: 'private-host', name: 'PRIVATE HOST', kind: 'http',
    target: 'https://example.test/private-app', intervalSeconds: 10 }] }), { now: clock, check: async () => {
    probes++;
    return { ok: false, latencyMs: 18, detail: 'https://example.test/private-app' };
  } });
  serviceHealth.start();
  await setImmediate();
  t.after(() => serviceHealth.stop());
  assert.equal(probes, 1);

  const thresholds = new TelemetryThresholds(write('thresholds', { version: 1, rules: [{ id: 'private-rule', name: 'PRIVATE RULE',
    metric: 'cpu', limit: 65, holdSeconds: 2 }] }), { now: clock });
  thresholds.reload();
  thresholds.observe({ cpu: .8, sampledAt: 177_100 });
  thresholds.observe({ cpu: .8, sampledAt: 179_500 });
  const power = new PowerStatus({ now: clock, readSystem: () => ({ status: 'ready', source: 'ac', battery: true, percent: 90, charging: true,
    remainingSeconds: 120, saver: false, manufacturer: 'PRIVATE CELL' }), upsFile: write('ups', { version: 1,
    source: 'battery', sampledAt: new Date(57_000).toISOString(), percent: 42, remainingSeconds: 90, serial: 'PRIVATE UPS' }) });
  power.observe('battery', 178_000);

  let usageReads = 0;
  const resources = new ResourceMonitor({ wallNow: clock, now: clock, helperPids: () => ({ hardware: null, media: null }), readApp: () => {
    usageReads++;
    return [{ pid: 6001, creationTime: 1, cpu: { cumulativeCPUUsage: 92 }, memory: { workingSetSize: 128 * 1024 }, name: 'PRIVATE PROCESS' }];
  }, embedUsage: () => ({ active: true, requests: 2, blocked: 0, total: 2, limit: 50, url: 'PRIVATE EMBED URL' }) });
  let dockerReads = 0;
  const watchlist = new MonitoringWatchlist(write('watchlist', { version: 1, pins: ['hardware:cpu', 'app:docker', 'app:lastra-memory', 'service:private-host'] }), {
    serviceHealth: () => serviceHealth.snapshot(), resources: () => resources.snapshot(), now: clock, docker: async () => {
      dockerReads++;
      return { status: 'ready', total: 2, containers: [{ state: 'running', name: 'PRIVATE CONTAINER', logs: 'PRIVATE LOG' }] };
    },
  });
  const sources = { services: () => serviceHealth.snapshot(), alerts: () => alertInbox.snapshot(), thresholds: () => thresholds.snapshot(),
    stats: () => ({ readings: [{ id: 'cpu', group: 'cpu', unit: '%', value: 80, status: 'live', at: 179_500 }] }),
    power: () => power.snapshot(), usage: () => resources.snapshot(), watchlist: () => watchlist.snapshot({ refresh: false }) };
  const read = (section, options) => query(sources, { section, ...options });
  const pins = await read('watchlist');
  assert.deepEqual([dockerReads, usageReads, probes], [0, 0, 1]);
  assert.deepEqual(pins.watchlist[0], { id: 'hardware:cpu', kind: 'hardware', status: 'live', value: 80, unit: '%', sampledAt: 179_500, partial: false });
  await watchlist.snapshot();
  const refreshed = await read('watchlist');
  assert.equal(refreshed.watchlist[1].value, 1);
  assert.equal(refreshed.watchlist[1].partial, true);
  assert.deepEqual([dockerReads, usageReads, probes], [1, 1, 1]);

  const checks = await read('services');
  const service = checks.services[0];
  assert.match(service.id, /^service-[a-f0-9]{20}$/);
  assert.equal((await read('services', { id: service.id })).serviceHistory[0].ok, false);
  const incidents = await read('alerts', { status: 'active' });
  assert.equal(incidents.alerts[0].target, service.id);
  assert.equal(incidents.alerts[0].acknowledgedAt, null);
  assert.equal((await read('thresholds')).thresholds[0].status, 'active');
  const diagnosis = await read('diagnostic');
  assert.equal(diagnosis.diagnostic.power.system.battery, true);
  assert.equal(diagnosis.diagnostic.power.ups.status, 'stale');
  assert.equal(diagnosis.diagnostic.power.ups.ageMs, 123_000);
  assert.equal(diagnosis.diagnostic.usage.rows[0].workingSetMiB, 128);
  assert.equal(diagnosis.diagnostic.usage.rows[0].cpuStatus, 'measuring');
  assert.equal(diagnosis.diagnostic.usage.sampledAt, clock());
  assert.equal(diagnosis.diagnostic.alerts.unacknowledged, 1);
  assert.equal(diagnosis.diagnostic.services.retrying, 1);
  assert.equal(diagnosis.diagnostic.thresholds.active, 1);
  const all = JSON.stringify([pins, refreshed, checks, incidents, await read('thresholds'), diagnosis]);
  for (const privateValue of ['PRIVATE', 'example.test', 'private-host', 'private-rule', '6001']) assert.ok(!all.includes(privateValue));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'alerts.json'), 'utf8')).entries[0].acknowledgedAt, null);
});
