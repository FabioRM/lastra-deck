'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ProcessTelemetry, processRows, gpuCounters, gpuRates } = require('../src/main/process-telemetry');

const base = 134_100_000_000_000_000n;
const row = (pid, name, cpu, memory, age = 30) => ({ pid, name, cpu, memory, age });
const engine = (pid, slot, active, at = base) => ({
  instance: `pid_${pid}_luid_0x00000000_0x00002F11_phys_0_eng_${slot}_engtype_3D`, active: String(active), at: String(at),
});

test('private memory and normalized processor usage rank separately with a bounded local result', async () => {
  let calls = 0;
  const processes = Array.from({ length: 18 }, (_, i) => row(i + 1, `fixture ${i}`, i * 20, (18 - i) * 1024));
  processes.push(row(0, 'Idle', 1000, 0), row(400, 'bad', null, -1), row(600, 'C:\\private\\Render.exe\n', 999, null));
  const telemetry = new ProcessTelemetry({ logicalProcessors: 8, collect: async ({ gpu }) => {
    assert.equal(gpu, false);
    calls++;
    return { processes };
  } });
  const [cpu, memory] = await Promise.all([telemetry.read('cpu'), telemetry.read('memory')]);
  assert.equal(calls, 1);
  assert.equal(cpu.status, 'ready');
  assert.equal(cpu.rows.length, 12);
  assert.deepEqual(cpu.rows[0], { pid: 600, name: 'Render.exe', value: 100 });
  assert.equal(cpu.rows[1].value, 42.5);
  assert.equal(memory.rows.length, 12);
  assert.deepEqual(memory.rows[0], { pid: 1, name: 'fixture 0', value: 18 * 1024 });
  assert.equal(cpu.rows.some(({ pid }) => [0, 400].includes(pid)), false);
});

test('GPU computes exact raw timer deltas and ranks the busiest engine for each matching process', async () => {
  let now = 0;
  const processes = [row(42, 'Renderer', 110, 5000), row(20, 'Capture', 10, 1900), row(22, 'New process', 8, 3400, 1)];
  const at = base + 50_000_000n;
  const samples = [
    [engine(42, 0, 20_000_000n), engine(42, 1, 10_000_000n), engine(20, 0, 1000n), engine(22, 1, 25n)],
    [engine(42, 0, 30_000_000n, at), engine(42, 1, 40_000_000n, at), engine(20, 0, 20_001_000n, at),
      engine(22, 1, 25_000_025n, at), engine(999, 0, 55n, at)],
  ];
  const telemetry = new ProcessTelemetry({ now: () => now, collect: async ({ gpu }) => {
    assert.equal(gpu, true);
    return { processes, gpu: samples.shift() };
  } });
  assert.deepEqual(await telemetry.read('gpu'), { status: 'warming', rows: [] });
  now += 5_000;
  assert.deepEqual((await telemetry.read('gpu')).rows, [
    { pid: 42, name: 'Renderer', value: 60 },
    { pid: 20, name: 'Capture', value: 40 },
  ]);
  assert.equal(samples.length, 0);
});

test('resets, long gaps, abandoned measurements and absent GPU sources do not produce pseudo-readings', async () => {
  const row42 = row(42, 'Renderer', 99, 5000);
  const processes = processRows([row42], 8);
  const prior = gpuCounters([engine(42, 0, 20n), engine(42, 1, 3n), engine(42, 2, 1n)]);
  const late = base + 150_000_000n;
  const current = gpuCounters([engine(42, 0, 3n, base + 10n), engine(42, 1, 4n, late), engine(42, 2, 7n, base)]);
  assert.equal(gpuRates(prior, current, processes).size, 0);
  const telemetry = new ProcessTelemetry({ collect: async () => ({ gpu: null, processes: [row42] }) });
  assert.equal((await telemetry.read('gpu')).status, 'gpu-unavailable');
  assert.equal((await telemetry.read('cpu')).status, 'ready');
  let resolve;
  let signal;
  const pending = new ProcessTelemetry({ collect: (request) => {
    signal = request.signal;
    return new Promise((done) => { resolve = done; });
  } });
  const operation = pending.read('cpu');
  await Promise.resolve();
  pending.stop();
  assert.equal(signal.aborted, true);
  resolve({ processes: [row42] });
  assert.deepEqual(await operation, { status: 'unavailable', rows: [] });
  assert.equal(pending.state, undefined);
});

test('a timed-out sampler shows cached CPU briefly and drops stale GPU immediately', async () => {
  let now = 0;
  let calls = 0;
  const telemetry = new ProcessTelemetry({ now: () => now, collect: async () => {
    if (calls++) throw new Error('fixture collector unavailable');
    return { processes: [row(42, 'Renderer', 90, 5000)] };
  } });
  await telemetry.read('cpu');
  now = 5_000;
  assert.equal((await telemetry.read('cpu')).status, 'cached');
  assert.equal((await telemetry.read('cpu')).status, 'cached');
  now = 12_001;
  assert.equal((await telemetry.read('cpu')).status, 'unavailable');

  calls = 0;
  now = 0;
  const withGpu = new ProcessTelemetry({ now: () => now, collect: async () => {
    if (calls >= 2) throw new Error('GPU reader timed out');
    return { processes: [row(42, 'Renderer', 90, 5000)],
      gpu: [engine(42, 0, BigInt(calls) * 1000n, base + BigInt(calls++) * 50_000_000n)] };
  } });
  await withGpu.read('gpu');
  now = 5_000;
  assert.equal((await withGpu.read('gpu')).status, 'ready');
  now = 10_000;
  assert.deepEqual(await withGpu.read('gpu'), { status: 'gpu-unavailable', rows: [] });
});
