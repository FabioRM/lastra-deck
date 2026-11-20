'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { StatsSelection } = require('../src/main/stats-selection');
const { chartPaths } = require('../src/shared/stats-chart');
const { SensorWidgetSamples, checkedSensorIds } = require('../src/main/sensor-widget-samples');
const { normalizeWidgetInstances } = require('../src/main/widgets');
const { deckRequestAllowed } = require('../src/main/deck-view-only');
const { sensorIds, searchSensors, preferredOverview } = require('../src/shared/sensor-binding');
const { tempDir } = require('./helpers/temp-dir');

const GPU_ONE = 'lhm:/gpu-nvidia/0/smalldata/0';
const GPU_TWO = 'lhm:/gpu-nvidia/1/smalldata/0';
const FAN = 'lhm:/lpc/nct677x/0/fan/0';
const SSD = 'lhm:/nvme/0/temperature/0';

function localFile(t) {
  const dir = tempDir(t, 'lastra-stats-selection-');
  return path.join(dir, 'stats-selection.json');
}

function fixtureSensor(id, { value = 42, name = 'Used memory', device = 'NVIDIA RTX', kind = 'gpu-nvidia', type = 'smalldata' } = {}) {
  return { id: id.slice(4), value, name, device, kind, type };
}

function readingsFixture() {
  const details = [
    fixtureSensor(GPU_ONE, { value: 1024 }), fixtureSensor(GPU_TWO, { value: 4096 }),
    fixtureSensor(FAN, { value: 1400, name: 'Case fan', device: 'Controller', kind: 'superio', type: 'fan' }),
    fixtureSensor(SSD, { value: 38, name: 'Controller temperature', device: 'NVMe drive', kind: 'nvme', type: 'temperature' }),
  ];
  const sample = { sampledAt: 1000, hardwareAt: 1000, hardwareSource: 'managed', hardwareStaleMs: 6000 };
  return { details, sample };
}

test('Stats preferences select distinct devices, preserve disconnected slots, and restore defaults', (t) => {
  const file = localFile(t);
  const values = readingsFixture();
  const readings = new SensorWidgetSamples(() => values).choices();
  const overview = [{ id: 'cpu', name: 'CPU load', group: 'cpu', unit: '%', status: 'live' }];
  const snapshot = { overview, readings };
  let preferences = new StatsSelection(file);
  assert.equal(preferences.read().selected, null);
  assert.equal(preferredOverview(snapshot, null), overview);
  const { selected } = preferences.save([GPU_TWO, GPU_ONE, SSD, FAN], snapshot, 'area');
  assert.deepEqual(selected.map(({ id }) => id), [GPU_TWO, GPU_ONE, SSD, FAN]);
  assert.equal(selected[0].deviceId, '/gpu-nvidia/1');
  assert.equal(selected[1].deviceId, '/gpu-nvidia/0');
  assert.equal('value' in selected[0], false);
  preferences = new StatsSelection(file);
  assert.deepEqual(preferences.read().selected, selected);
  assert.equal(preferences.read().style, 'area');
  assert.throws(() => preferences.save(null, null, 'unknown'), /supported chart style/);
  const inactive = { overview, readings: [readings[0]] };
  const after = preferredOverview(inactive, preferences.read().selected);
  assert.equal(after[0].id, GPU_TWO);
  assert.equal(after[0].status, 'unavailable');
  assert.deepEqual(after[0].points, []);
  assert.equal(after[1], readings[0]);
  assert.equal(preferences.save([GPU_TWO], inactive).selected[0].name, 'Used memory');
  assert.throws(() => preferences.save([GPU_ONE, GPU_ONE], snapshot), /one to 7/);
  assert.throws(() => preferences.save(['missing'], snapshot), /unavailable/);
  assert.throws(() => preferences.save([], snapshot), /one to 7/);
  assert.equal(preferences.save(null).selected, null);
  assert.equal(new StatsSelection(file).read().selected, null);
  assert.equal(new StatsSelection(file).read().style, 'area');
  assert.equal(new StatsSelection(file).read().layout, 'cards');
  preferences.save(null, null, 'points', 'charts');
  assert.equal(new StatsSelection(file).read().layout, 'charts');
  assert.throws(() => preferences.save(null, null, 'line', 'unknown'), /supported Stats layout/);
  preferences.save([GPU_TWO, 'cpu'], snapshot, 'line', 'cards', [GPU_TWO]);
  const customized = new StatsSelection(file).read();
  assert.deepEqual(customized.selected.map(({ id }) => id), [GPU_TWO, 'cpu']);
  assert.deepEqual(customized.wide, [GPU_TWO]);
  assert.throws(() => preferences.save(['cpu'], snapshot, 'line', 'cards', [GPU_TWO]), /selected readings/);
  assert.deepEqual(preferences.save(['cpu'], snapshot).wide, []);
  assert.equal(preferences.save(null).wide, null);
});

test('Stats chart styles preserve missing intervals and the original line geometry', () => {
  const points = [[0, 0], [20, 100], [40, null], [80, 50], [100, 25]];
  const range = { low: 0, from: 0, to: 100 };
  const line = chartPaths(points, 100, 50, range, 'line');
  assert.deepEqual(line, { line: 'M2.0,40.0 L31.2,2.0 M118.8,21.0 L148.0,30.5', area: '' });
  assert.equal(chartPaths(points, 100, 50, range, 'step').line, 'M2.0,40.0 H31.2 V2.0 M118.8,21.0 H148.0 V30.5');
  assert.equal(chartPaths(points, 100, 50, range, 'area').area,
    'M2.0,40.0 L31.2,2.0 L31.2,40 L2.0,40 Z M118.8,21.0 L148.0,30.5 L148.0,40 L118.8,40 Z');
  assert.equal(chartPaths(points, 100, 50, range, 'bars').line, 'M2.0,40 V40.0 M31.2,40 V2.0 M118.8,40 V21.0 M148.0,40 V30.5');
  assert.equal(chartPaths(points, 100, 50, { from: 20, to: 80 }, 'points').line, 'M2.0,2.0 h0.01 M148.0,21.0 h0.01');
});

test('search shows sensor names, device names and units without mixing identical GPU bindings', () => {
  const readings = new SensorWidgetSamples(readingsFixture).choices();
  assert.deepEqual(searchSensors(readings, 'nvidia memory MiB').map(({ id }) => id), [GPU_ONE, GPU_TWO]);
  assert.deepEqual(searchSensors(readings, 'VRAM').map(({ id }) => id), [GPU_ONE, GPU_TWO]);
  assert.deepEqual(searchSensors(readings, 'fan RPM').map(({ id }) => id), [FAN]);
  assert.deepEqual(searchSensors(readings, 'nvme temperature').map(({ id }) => id), [SSD]);
  assert.deepEqual(searchSensors(readings, 'ssd').map(({ id }) => id), [SSD]);
});

test('sensor widget bindings remain separate through profile validation and departure', () => {
  const grid = { cols: 8, rows: 3 };
  const raw = [GPU_ONE, GPU_TWO, FAN].map((sensorId, index) => ({
    id: `sensor-${index}`, type: 'system-metric', settings: { sensorId, shape: 'graph' },
  }));
  const first = normalizeWidgetInstances(raw, { grid });
  const second = normalizeWidgetInstances(JSON.parse(JSON.stringify(first)), { grid });
  assert.deepEqual(sensorIds([...second, second[0]]), [GPU_ONE, GPU_TWO, FAN]);
  assert.deepEqual(second, first);
  assert.throws(() => normalizeWidgetInstances([{ ...raw[0], settings: { sensorId: 'https://source.example/' } }], { grid }), /invalid "sensorId"/);
  assert.throws(() => checkedSensorIds(['__proto__']), /Invalid sensor widget/);
  assert.throws(() => checkedSensorIds(Array(25).fill(GPU_ONE)), /Invalid sensor widget/);
  assert.equal(deckRequestAllowed('sensors:widgets', [GPU_ONE]), true);
  assert.equal(deckRequestAllowed('stats:read'), true);
  assert.equal(deckRequestAllowed('stats:selection', { type: 'read' }), false);
  assert.equal(deckRequestAllowed('stats:selection', { type: 'save' }), false);
});

test('sensor widgets read only the cached feed and avoid projection when no binding is watched', () => {
  const cached = readingsFixture();
  let reads = 0;
  const bindings = new SensorWidgetSamples(() => { reads++; return cached; });
  assert.deepEqual(bindings.snapshot(), {});
  assert.deepEqual(bindings.select([]), {});
  assert.equal(reads, 0);
  assert.equal(bindings.select([GPU_TWO, GPU_TWO])[GPU_TWO].value, 4096);
  assert.deepEqual(bindings.snapshot()[GPU_TWO].points, [[1000, 4096]]);
  const sample = () => bindings.snapshot(undefined, { record: true });
  sample();
  assert.deepEqual(sample()[GPU_TWO].points, [[1000, 4096]]);
  Object.assign(cached.sample, { sampledAt: 3000, hardwareAt: 3000 });
  cached.details[1].value = 4200;
  assert.deepEqual(sample()[GPU_TWO].points, [[1000, 4096], [3000, 4200]]);
  assert.deepEqual(bindings.snapshot([FAN])[FAN].points, [[3000, 1400]]);
  const report = bindings.snapshot();
  assert.deepEqual(Object.keys(report), [GPU_TWO]);
  assert.equal(report[GPU_TWO].source, 'LibreHardwareMonitor');
  cached.details = [cached.details[0]];
  assert.deepEqual(sample(), {});
  bindings.select([]);
  const stored = reads;
  assert.deepEqual(bindings.snapshot(), {});
  assert.equal(reads, stored);
  assert.deepEqual(Object.keys(bindings.history.series), []);
});
