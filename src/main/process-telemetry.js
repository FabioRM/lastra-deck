// @ts-check
'use strict';

const os = require('node:os');
const { readProcessTelemetry } = require('./process-telemetry-win32');

const LIMIT = 12;
const INTERVAL = 5_000;
const STALE_HORIZON = 12_000;
const ENGINE_ID = /^pid_(\d+)_luid_0x[0-9a-f]+_0x[0-9a-f]+_phys_\d+_eng_\d+_engtype_[a-z0-9_ -]*(?:#\d+)?$/i;
const COUNTER = /^\d{1,20}$/;
const validNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const percent = (value) => Math.min(100, value);

function processRows(input, logicalProcessors) {
  const rows = new Map();
  for (const item of (Array.isArray(input) ? input : []).slice(0, 4096)) {
    const { name, pid, cpu, memory, age } = item ?? {};
    if (!Number.isSafeInteger(pid) || pid <= 0 || typeof name !== 'string') continue;
    const label = name.replaceAll('\\', '/').split('/').at(-1).replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 96);
    if (!label || label === '_Total') continue;
    rows.set(pid, { pid, name: label,
      cpu: validNumber(cpu) ? percent(cpu / logicalProcessors) : null,
      memory: validNumber(memory) ? memory : null,
      age: validNumber(age) ? age : null,
    });
  }
  return rows;
}

function gpuCounters(input) {
  if (!Array.isArray(input)) return null;
  const engines = new Map();
  for (const { instance, active, at } of input.filter(Boolean).slice(0, 4096)) {
    const match = typeof instance === 'string' && instance.length <= 200 && ENGINE_ID.exec(instance);
    if (!match || typeof active !== 'string' || typeof at !== 'string' || !COUNTER.test(active) || !COUNTER.test(at)) continue;
    engines.set(instance, { pid: Number(match[1]), active: BigInt(active), at: BigInt(at) });
  }
  return engines.size ? engines : null;
}

function gpuRates(previous, current, processes) {
  const rates = new Map();
  if (!previous || !current) return rates;
  for (const [id, engine] of current) {
    const prior = previous.get(id);
    const process = processes.get(engine.pid);
    if (!prior || !process) continue;
    const time = engine.at - prior.at;
    if (time <= 0n || time > BigInt(STALE_HORIZON) * 10_000n || engine.active < prior.active
        || (process.age !== null && process.age < Math.floor(Number(time) / 10_000_000))) continue;
    const value = percent(100 * Number(engine.active - prior.active) / Number(time));
    // Different engines can be active simultaneously. The busiest engine represents the process.
    rates.set(engine.pid, Math.max(value, rates.get(engine.pid) ?? 0));
  }
  return rates;
}

class ProcessTelemetry {
  constructor({ collect = readProcessTelemetry, now = Date.now, logicalProcessors = Math.max(1, os.cpus().length) } = {}) {
    this.collect = collect;
    this.now = now;
    this.logicalProcessors = logicalProcessors;
  }

  stop() {
    this.flight?.controller.abort();
    this.flight = this.state = this.startedAt = undefined;
    this.gpu = false;
    this.fresh = false;
  }

  async read(metric) {
    if (!['cpu', 'memory', 'gpu'].includes(metric)) return { status: 'unavailable', rows: [] };
    const gpu = metric === 'gpu';
    if (gpu !== Boolean(this.gpu)) {
      this.stop();
      this.gpu = gpu;
    }
    const now = this.now();
    if (!this.flight && (this.startedAt === undefined || now - this.startedAt >= INTERVAL)) {
      const controller = new AbortController();
      this.startedAt = now;
      const job = { controller, success: false };
      this.flight = job;
      job.done = Promise.resolve().then(() => this.collect({ gpu, signal: controller.signal })).then((sample) => {
        if (this.flight !== job || !sample || !Array.isArray(sample.processes)) return;
        const processes = processRows(sample.processes, this.logicalProcessors);
        const engines = gpu ? gpuCounters(sample.gpu) : null;
        const rates = gpuRates(this.state?.engines, engines, processes);
        this.state = { processes, engines, rates, sampledAt: this.now() };
        job.success = true;
      }).catch(() => {}).finally(() => {
        if (this.flight === job) {
          this.fresh = job.success;
          this.flight = undefined;
        }
      });
    }
    const job = this.flight;
    await job?.done;
    if (job?.controller.signal.aborted || gpu !== Boolean(this.gpu)) return { status: 'unavailable', rows: [] };
    return this.snapshot(metric, this.fresh);
  }

  snapshot(metric, fresh) {
    const { processes, engines, rates, sampledAt } = this.state ?? {};
    if (!processes?.size || this.now() - sampledAt >= STALE_HORIZON) return { status: 'unavailable', rows: [] };
    if (metric === 'gpu' && (!fresh || !engines)) return { status: 'gpu-unavailable', rows: [] };
    if (metric === 'gpu' && !rates.size) return { status: 'warming', rows: [] };
    const rows = [...processes.values()].map(({ name, pid, ...values }) => ({
      name, pid, value: metric === 'gpu' ? rates.get(pid) : values[metric],
    })).filter(({ value }) => validNumber(value) && value > 0);
    rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name) || a.pid - b.pid);
    return { status: fresh ? 'ready' : 'cached', sampledAt, rows: rows.slice(0, LIMIT) };
  }
}

module.exports = { ProcessTelemetry, processRows, gpuCounters, gpuRates };
