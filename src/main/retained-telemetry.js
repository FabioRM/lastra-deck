// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { writeAtomic } = require('./write-atomic');

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const HISTORY_HOURS = Object.freeze({ 0: 'Off', 1: '1 hour', 24: '24 hours' });
const RANGE_OPTIONS = Object.freeze({ [HOUR]: 'Last hour', [24 * HOUR]: 'Last 24 hours' });
const METRICS = Object.freeze(['cpu', 'ram', 'gpu', 'cpuTemp', 'gpuTemp']);
const MAX_BYTES = 512 * 1024;
const MAX_CHART_POINTS = 60;
const SAVE_INTERVAL = 30_000;

const knownHistoryHours = (value) => Number.isInteger(value) && Object.hasOwn(HISTORY_HOURS, value);
const newSeries = () => Object.fromEntries(METRICS.map((metric) => [metric, []]));
const loadMetric = (metric) => ['cpu', 'ram', 'gpu'].includes(metric);
const readValue = (metric, value) => Number.isFinite(value) && (loadMetric(metric) ? value >= 0 && value <= 1 : Math.abs(value) <= 1000);

class RetainedTelemetry {
  /**
   * @param {string} file
   * @param {{ hours?: number, now?: () => number, log?: (...args: any[]) => void }} [options]
   */
  constructor(file, { hours = 0, now = Date.now, log = () => {} } = {}) {
    this.file = file;
    this.now = now;
    this.log = log;
    this.hours = 0;
    this.data = newSeries();
    this.configure(hours);
  }

  configure(hours) {
    if (!knownHistoryHours(hours)) throw new Error('Choose a supported telemetry retention period.');
    if (hours === this.hours) return;
    this.flush();
    const loaded = this.hours > 0;
    this.hours = hours;
    if (!hours) {
      this.data = newSeries();
      this.dirty = false;
      return;
    }
    if (!loaded) this.data = this.read();
    this.prune(this.now());
    this.flush();
  }

  read() {
    const output = newSeries();
    try {
      const stat = fs.statSync(this.file);
      if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('Invalid retained telemetry file');
      const disk = JSON.parse(fs.readFileSync(this.file, 'utf8').replace(/^\uFEFF/, ''));
      if (disk?.version !== 1 || !disk.series) throw new Error('Unknown retained telemetry format');
      const now = this.now();
      const after = now - this.hours * HOUR - MINUTE;
      for (const metric of METRICS) {
        for (const row of (Array.isArray(disk.series[metric]) ? disk.series[metric] : []).slice(-1442)) {
          const [bucket, sum, count, at] = Array.isArray(row) ? row : [];
          if (!Number.isSafeInteger(bucket) || bucket < after || bucket % MINUTE !== 0 || !Number.isSafeInteger(at)
              || at < bucket || at >= bucket + MINUTE || at > now || !Number.isSafeInteger(count) || count < 1 || count > MINUTE
              || !Number.isFinite(sum) || !readValue(metric, sum / count) || bucket <= (output[metric].at(-1)?.[0] ?? -Infinity)) continue;
          output[metric].push([bucket, sum, count, at]);
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') this.log('Saved telemetry history is unavailable.');
    }
    return output;
  }

  prune(now) {
    const cutoff = now - this.hours * HOUR - MINUTE;
    for (const rows of Object.values(this.data)) {
      while (rows.length && (rows[0][0] < cutoff || rows.length > 1441)) {
        rows.shift();
        this.dirty = true;
      }
    }
  }

  record(sample) {
    const { sampledAt: now, hardwareAt, hardwareStaleMs } = sample;
    if (!this.hours || !Number.isSafeInteger(now) || now < 0) return;
    this.prune(now);
    for (const metric of METRICS) {
      const at = metric === 'cpu' || metric === 'ram' ? now : hardwareAt;
      const value = sample[metric];
      if (!Number.isSafeInteger(at) || at < 0 || at > now || !readValue(metric, value)
          || (at !== now && (!Number.isFinite(hardwareStaleMs) || now - at >= hardwareStaleMs))) continue;
      const entries = this.data[metric];
      const last = entries.at(-1);
      if (last && at <= last[3]) continue;
      const bucket = at - at % MINUTE;
      if (last?.[0] === bucket) {
        last[1] += value;
        last[2]++;
        last[3] = at;
      } else entries.push([bucket, value, 1, at]);
      this.dirty = true;
    }
    if (now - (this.lastSavedAt ?? 0) >= SAVE_INTERVAL) this.flush(now);
  }

  options() {
    return Object.entries(RANGE_OPTIONS).flatMap(([value, label]) => this.hours * HOUR >= Number(value)
      ? [{ ms: Number(value), label }] : []);
  }

  chart(metric, range, now) {
    if (!this.options().some(({ ms }) => ms === range) || !Object.hasOwn(this.data, metric)) return undefined;
    const resolution = Math.ceil(range / (MAX_CHART_POINTS * MINUTE)) * MINUTE;
    const scale = loadMetric(metric) ? 100 : 1;
    const bins = new Map();
    for (const [bucket, sum, count, at] of this.data[metric]) {
      if (at < now - range || at > now) continue;
      const id = bucket - bucket % resolution;
      const aggregate = bins.get(id) ?? [0, 0, at];
      aggregate[0] += sum;
      aggregate[1] += count;
      aggregate[2] = at;
      bins.set(id, aggregate);
    }
    return { points: [...bins.values()].slice(-MAX_CHART_POINTS).map(([sum, count, at]) => [at, scale * sum / count]),
      gapMs: resolution + 2 * MINUTE };
  }

  flush(now = this.now()) {
    if (!this.hours || !this.dirty) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const text = JSON.stringify({ version: 1, series: this.data }) + '\n';
      if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('Saved telemetry history exceeded its size limit');
      writeAtomic(this.file, text);
      this.dirty = false;
    } catch {
      this.log('Could not save telemetry history.');
    } finally {
      this.lastSavedAt = now;
    }
  }
}

module.exports = { RetainedTelemetry, HISTORY_HOURS, knownHistoryHours };
