// @ts-check
'use strict';

const { availableParallelism } = require('node:os');
const { DEFAULTS } = require('./monitoring-settings');

const MIN_SAMPLE_GAP = 1000;
const HELPERS = ['hardware', 'media'];

function metric(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function summarize(id, records, previous, elapsed, cores, count = records.length, empty = 'unavailable') {
  const memory = records.map(({ workingSetKiB }) => metric(workingSetKiB)).filter((value) => value !== null);
  const deltas = records.flatMap((record) => {
    const before = previous.get(record.pid);
    if (!before || before.started !== record.started || record.started == null) return [];
    const cpu = metric(record.cpuSeconds);
    const oldCpu = metric(before.cpuSeconds);
    return elapsed > 0 && cpu !== null && oldCpu !== null && cpu >= oldCpu ? [cpu - oldCpu] : [];
  });
  const sum = (values) => values.reduce((total, value) => total + value, 0);
  const canMeasureCpu = records.some(({ cpuSeconds, started }) => started != null && metric(cpuSeconds) !== null);
  const available = memory.length > 0 || canMeasureCpu;
  return {
    id, count, status: available ? 'ready' : empty,
    cpuStatus: deltas.length ? 'ready' : canMeasureCpu ? 'measuring' : 'unavailable',
    cpuPercent: deltas.length ? Math.min(100, sum(deltas) * 100 / (elapsed * cores)) : null,
    workingSetMiB: memory.length ? sum(memory) / 1024 : null,
  };
}

class ResourceMonitor {
  /**
   * @param {{ readApp?: any, readHelper?: any, helperPids?: any, now?: () => number, wallNow?: () => number, cores?: number,
   *   settings?: any, onSettingsChanged?: (intervals: any) => void, embedUsage?: () => any }} options
   */
  constructor({ readApp, readHelper, helperPids, now = () => performance.now(), wallNow = Date.now, cores = availableParallelism(),
    settings, onSettingsChanged = () => {}, embedUsage }) {
    this.readApp = readApp;
    this.readHelper = readHelper;
    this.helperPids = helperPids;
    this.now = now;
    this.wallNow = wallNow;
    this.cores = Math.max(1, cores);
    this.settings = settings;
    this.onSettingsChanged = onSettingsChanged;
    this.embedUsage = embedUsage;
    this.previous = new Map();
  }

  snapshot() {
    const settings = this.settings?.snapshot();
    const intervalMs = settings?.intervals.resources ?? DEFAULTS.resources;
    const now = this.now();
    const gap = now - this.sampledAt;
    if (this.latest && gap < MIN_SAMPLE_GAP) return this.latest;
    const previous = gap <= intervalMs * 3 + 1_000 ? this.previous : new Map();
    const elapsed = gap / 1000;
    const helpers = this.helperPids();
    const managedPids = new Set(HELPERS.map((id) => helpers[id]));
    let electron = [];
    try {
      const seen = new Set();
      electron = this.readApp().flatMap(({ pid, creationTime, cpu, memory }) => {
        if (seen.has(pid) || managedPids.has(pid)) return [];
        seen.add(pid);
        return [{ pid, started: creationTime, cpuSeconds: cpu?.cumulativeCPUUsage, workingSetKiB: memory?.workingSetSize }];
      });
    } catch {
      // A failed Electron sample still allows the managed helpers to be reported.
    }

    const rows = [summarize('electron', electron, previous, elapsed, this.cores)];
    const records = [...electron];
    for (const id of HELPERS) {
      const pid = helpers[id];
      let sample = null;
      try {
        if (pid) sample = this.readHelper(pid);
      } catch {
        // A helper can exit or become unavailable between enumeration and the read.
      }
      const helperRecords = sample ? [{ ...sample, pid }] : [];
      rows.push(summarize(id, helperRecords, previous, elapsed, this.cores, pid ? 1 : 0, pid ? 'unavailable' : 'inactive'));
      records.push(...helperRecords);
    }
    this.sampledAt = now;
    this.previous = new Map(records.map((record) => [record.pid, record]));
    this.latest = { status: 'ready', rows, intervalMs, settings, sampledAt: this.wallNow(),
      ...(this.embedUsage ? { embed: this.embedUsage() } : {}) };
    return this.latest;
  }

  change(command) {
    if (command?.action !== 'refresh' || !this.settings) throw new Error('Unknown monitoring command');
    const settings = this.settings.set(command.source, command.intervalMs);
    if (this.latest) this.latest = { ...this.latest, intervalMs: settings.intervals.resources, settings };
    this.onSettingsChanged(settings.intervals);
    return { ok: true, settings };
  }
}

module.exports = { ResourceMonitor };
