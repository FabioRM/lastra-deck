'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { TelemetryHistory } = require('../src/renderer/telemetry-history');
const { SensorPoller } = require('../src/main/sensors');

test('history uses hardware sensor timestamps and preserves gaps', () => {
  const model = new TelemetryHistory();
  const at = 1_700_000_000_000;
  model.record({ sampledAt: at, hardwareAt: at, cpu: 0.2, ram: 0.4, gpu: 0 });
  model.record({ sampledAt: at + 1000, hardwareAt: at, cpu: 0.3, ram: 0.4, gpu: 0 });
  model.record({ sampledAt: at + 2000, hardwareAt: at + 2000, cpu: 0.4, ram: 0.4, gpu: null });

  assert.deepEqual(model.series.gpu, [[at, 0], [at + 2000, null]]);
  assert.equal(model.series.cpu.length, 3);
  const restored = new TelemetryHistory(structuredClone(model.series));
  restored.record({ sampledAt: at + 15 * 60_000 + 1500, cpu: 0.6, ram: 0.4 });
  assert.deepEqual(restored.series.gpu, [[at + 2000, null]]);
  assert.equal(restored.series.cpu.length, 2);
  assert.equal(model.series.gpu.length, 2);
});

test('history compares two equal windows without double-counting boundaries or treating missing data as zero', () => {
  const history = new TelemetryHistory({
    cpu: [[39, 1], [40, 0], [69, 0.5], [70, 0.5], [80, null], [100, 0.75], [101, 1]],
    cpuTemp: [[40, -3], [69, -9], [70, null]],
  });

  assert.deepEqual(history.compare('cpu', 100, 60), {
    latest: { average: 0.625, peak: 0.75 },
    previous: { average: 0.25, peak: 0.5 },
  });
  assert.deepEqual(history.compare('cpuTemp', 100, 60), {
    latest: null,
    previous: { average: -6, peak: -3 },
  });
  assert.deepEqual(history.compare('gpu', 100, 60), { latest: null, previous: null });
});

test('a newer HTTP reading takes precedence over a stale managed reading', async () => {
  const hardware = { latest: { gpu: 0.4 }, latestAt: Date.now() - 30_000 };
  const poller = new SensorPoller({
    hardware,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ SensorId: '/gpu-nvidia/0/load/0', Value: '25 %' }),
    }),
  });
  let sample;
  poller.on('data', (data) => { sample = data; });
  await poller.tick();
  assert.equal(sample.gpu, 0.25);
  assert.equal(sample.hardwareSource, 'http');
  assert.ok(sample.hardwareAt > hardware.latestAt);
  assert.equal(poller.history.series.gpu.length, 1);
  await poller.tick();
  assert.equal(poller.history.series.gpu.length, 1);
});

test('a failed HTTP request preserves the cached timestamp', async () => {
  const poller = new SensorPoller({ fetchImpl: async () => { throw new Error('disconnected'); } });
  poller.lhm = { gpu: 0.6, cpuTemp: null, gpuTemp: null };
  const previous = poller.lhmAt = Date.now() - 15_000;
  let sample;
  poller.on('data', (data) => { sample = data; });
  await poller.tick();
  assert.equal(sample.hardwareSource, 'http');
  assert.equal(sample.gpu, 0.6);
  assert.equal(sample.hardwareAt, previous);
});

test('managed and HTTP cadences independently control fallback and stale windows', async () => {
  const hardware = { latest: { gpu: 0.4 }, latestAt: Date.now() - 7_000 };
  let calls = 0;
  const poller = new SensorPoller({
    hardware, managedIntervalMs: 5_000, httpIntervalMs: 10_000,
    fetchImpl: async () => {
      calls++;
      return { ok: true, json: async () => ({ SensorId: '/gpu-nvidia/0/load/0', Value: '25 %' }) };
    },
  });
  let sample;
  poller.on('data', (data) => { sample = data; });
  await poller.tick();
  assert.equal(sample.hardwareSource, 'managed');
  assert.equal(sample.hardwareStaleMs, 15_000);
  assert.equal(calls, 0);
  assert.equal(poller.intervalMs, 1_000);

  hardware.latestAt -= 20_000;
  await poller.tick();
  assert.equal(sample.hardwareSource, 'http');
  assert.equal(sample.hardwareStaleMs, 30_000);
  assert.equal(calls, 1);

  poller.lhmAt -= 5_000;
  await poller.tick();
  assert.equal(calls, 1);
  poller.setHardwareIntervals({ managed: 5_000, http: 2_000 });
  await poller.tick();
  assert.equal(sample.hardwareStaleMs, 6_000);
  assert.equal(calls, 2);
});
