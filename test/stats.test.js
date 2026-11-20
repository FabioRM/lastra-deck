'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { setImmediate } = require('node:timers/promises');
const { StatsMonitor, hardwareReadings } = require('../src/main/stats');
const { parseLhmReadings } = require('../src/main/sensors');
const { parseFrames } = require('../src/main/stats-windows');

test('PresentMon measures the main swap chain and ignores other processes and invalid frame times', () => {
  const csv = [
    'Application,ProcessID,SwapChainAddress,MsBetweenPresents',
    '"Game, Inc.exe",42,0x001,10',
    '"Game, Inc.exe",42,0x001,16',
    '"Game, Inc.exe",42,0x001,20',
    'helper.exe,42,0x002,200',
    'other.exe,888,0x003,150',
    '"Game, Inc.exe",42,0x001,0',
  ].join('\r\n');
  assert.deepEqual(parseFrames(csv, 42), { fps: 3000 / 46, ms: 46 / 3, p95: 20, minFps: 50 });
  assert.equal(parseFrames(csv, 888), null);
});

test('hardware throughput keeps the same unit across managed and HTTP sources', () => {
  const id = '/gpu-nvidia/0/throughput/0';
  const basic = { hardwareAt: 1000 };
  const managed = hardwareReadings(basic, [{
    id, kind: 'GpuNvidia', device: 'GPU', type: 'Throughput', name: 'GPU PCIe Rx', value: 1572864,
  }]).entries[0];
  const http = hardwareReadings({ ...basic, hardwareSource: 'http' }, parseLhmReadings({ Children: [
    { SensorId: id, Text: 'GPU PCIe Rx', Value: '1,5 MB/s' },
  ] })).entries[0];
  assert.equal(managed.value, 1.5);
  assert.equal(http.value, managed.value);
  assert.equal(http.unit, 'MiB/s');
});

test('CPU voltage and current retain their units and values as independent readings', () => {
  const sample = { hardwareAt: 1_000 };
  const expected = [['V', 1.235], ['A', 32.9]];
  const rows = (entries) => entries.map(({ unit, value }) => [unit, value]);
  const sensors = [
    { id: '/intelcpu/0/voltage/0', kind: 'Cpu', type: 'Voltage', name: 'CPU Core', value: 1.235 },
    { id: '/intelcpu/0/current/0', kind: 'Cpu', type: 'Current', name: 'CPU Core', value: 32.9 },
  ];
  const managed = hardwareReadings(sample, sensors).entries;
  assert.deepEqual(rows(managed), expected);
  assert.ok(managed.every(({ deviceId, group }) => deviceId === '/intelcpu/0' && group === 'cpu'));
  const http = parseLhmReadings({ Children: [
    { SensorId: sensors[0].id, Text: 'CPU Core', Value: '1,235 V' },
    { SensorId: sensors[1].id, Text: 'CPU Core', Value: '32,9 A' },
  ] });
  assert.deepEqual(rows(hardwareReadings({ ...sample, hardwareSource: 'http' }, http).entries), expected);
});

test('Stats shows actual watts separately from load and avoids pairing sensors from different GPUs', () => {
  let now = 5_000;
  const sample = { cpu: .21, gpu: .63, sampledAt: 5_000, hardwareAt: 5_000 };
  const hardware = [
    { id: '/intelcpu/0/power/0', kind: 'Cpu', type: 'power', name: 'CPU Package', value: 32 },
    { id: '/gpu-nvidia/0/load/0', kind: 'GpuNvidia', type: 'load', name: 'GPU Core', value: 63 },
    { id: '/gpu-nvidia/1/power/1', kind: 'GpuNvidia', type: 'power', name: 'GPU Power', value: 180 },
  ];
  const stats = new StatsMonitor({ now: () => now, display: () => ({}), foreground: () => null,
    sample: () => ({ sample, hardware,
      history: { cpu: [[5_000, .21]] } }) });
  let view = stats.snapshot({ refresh: false });
  assert.deepEqual(view.overview.find(({ id }) => id === 'cpu').watts, { value: 32, status: 'live', sampledAt: 5_000 });
  assert.equal(view.readings.find(({ id }) => id === 'gpuPower').status, 'unavailable');
  hardware.push({ id: '/gpu-nvidia/0/power/0', kind: 'GpuNvidia', type: 'power', name: 'GPU Board Power', value: 74.5 });
  now = 12_000;
  view = stats.snapshot({ refresh: false });
  const rows = view.readings.filter(({ group }) => group === 'power');
  assert.deepEqual(rows.map(({ id, value, unit }) => [id, value, unit]), [
    ['power:cpu', 21, '%'], ['cpuPower', 32, 'W'], ['power:gpu', 63, '%'], ['gpuPower', 74.5, 'W'],
  ]);
  assert.equal(rows[3].status, 'stale');
  assert.equal(view.overview.find(({ id }) => id === 'gpu').watts, undefined);
  hardware[3].name = 'GPU Package';
  sample.gpuDevice = '/gpu-nvidia/0';
  view = stats.snapshot({ refresh: false });
  assert.equal(view.overview.find(({ id }) => id === 'gpu').watts.value, 74.5);
  assert.match(view.readings.find(({ id }) => id === 'fps').reason, /PresentMon/);
});

test('Stats preserves stale device readings and drops frame data when the foreground changes', async () => {
  let now = 80_000;
  let target = { id: 'app1', pid: 10, name: 'Example app' };
  let finishFrame;
  const calls = [];
  const stats = new StatsMonitor({
    now: () => now,
    sample: () => ({ sample: { cpu: 0.5, sampledAt: 75_000 }, history: { cpu: [[75_000, 0.5]] } }),
    display: () => ({ displays: [
      { id: 3, displayFrequency: 240 }, { id: 5, label: 'XENEON EDGE', displayFrequency: 60 },
    ], selected: 5 }),
    foreground: () => target,
    readWindows: () => ({ volumes: [{ id: 'C:', capacity: 2 ** 40, free: 2 ** 39, read: 2 ** 20 }] }),
    framesExecutable: 'test',
    readFrames: (_, pid) => {
      calls.push(pid);
      return new Promise((resolve) => { finishFrame = resolve; });
    },
  });
  const initial = stats.snapshot();
  assert.deepEqual(initial.overview.find(({ id }) => id === 'cpu').points, [[75_000, 50]]);
  assert.equal(initial.overview.find(({ id }) => id === 'cpu').status, 'stale');
  assert.equal(initial.overview.find(({ id }) => id === 'ram').status, 'unavailable');
  assert.equal(initial.overview.find(({ group }) => group === 'display').id, 'display:5');
  await setImmediate();
  finishFrame({ fps: 120 });
  await setImmediate();
  const row = (id) => stats.snapshot().readings.find((item) => item.id === id);
  assert.equal(row('fps').value, 120);
  assert.equal(row('volume:C::read').value, 1);
  target = { id: 'app2', pid: 20, name: 'Another app' };
  assert.deepEqual(row('fps').points, []);
  await setImmediate();
  assert.deepEqual(calls, [10, 20]);
  stats.stop();
  finishFrame({ fps: 144 });
  await setImmediate();
  assert.equal(row('fps').value, null);
  stats.stop();
});
