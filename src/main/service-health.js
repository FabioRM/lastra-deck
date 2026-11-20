// @ts-check
'use strict';

const { normalizeChecks, probe } = require('./service-probes');
const { readMonitorConfig, watchMonitorConfig, openMonitorConfig } = require('./monitoring-config');

const MAX_RUNNING = 3;
const HISTORY_LIMIT = 120;

class ServiceHealth {
  /**
   * @param {string} file
   * @param {{ check?: typeof probe, openConfig?: (file: string) => any, now?: () => number,
   *   onChecks?: (ids: string[]) => void, onResult?: (config: any, status: any, result: any) => void,
   *   onUpdate?: () => void }} [options]
   */
  constructor(file, { check = probe, openConfig, now = Date.now, onChecks = () => {}, onResult = () => {}, onUpdate = () => {} } = {}) {
    this.file = file;
    this.check = check;
    this.openConfig = openConfig;
    this.now = now;
    this.onChecks = onChecks;
    this.onResult = onResult;
    this.onUpdate = onUpdate;
    this.entries = new Map();
    this.running = new Set();
    this.active = false;
    this.error = null;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.closeWatch = watchMonitorConfig(this.file, () => this.reload(), () => {
      this.watchFailed = true;
      this.onUpdate();
    });
    this.reload();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.closeWatch();
    clearTimeout(this.timer);
    for (const job of this.running) job.controller.abort();
    this.entries.clear();
  }

  reload() {
    try {
      const checks = readMonitorConfig(this.file, 'service checks', normalizeChecks);
      const next = new Map();
      for (const config of checks) {
        const previous = this.entries.get(config.id);
        const signature = JSON.stringify(config);
        next.set(config.id, previous?.signature === signature ? previous : {
          config, signature, due: this.now(), failures: 0, status: 'waiting', history: [],
        });
      }
      for (const job of this.running) {
        if (next.get(job.entry.config.id) !== job.entry) job.controller.abort();
      }
      this.entries = next;
      this.error = null;
      this.onChecks(checks.map(({ id }) => id));
    } catch (err) {
      this.error = err.message;
    }
    this.onUpdate();
    this.schedule();
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.active || this.running.size >= MAX_RUNNING) return;
    const queued = [...this.entries.values()].filter((entry) => !entry.job).sort((a, b) => a.due - b.due);
    for (const entry of queued) {
      if (this.running.size >= MAX_RUNNING) return;
      const wait = entry.due - this.now();
      if (wait > 0) {
        this.timer = setTimeout(() => this.schedule(), wait);
        this.timer.unref();
        return;
      }
      this.run(entry);
    }
  }

  async run(entry) {
    const controller = new AbortController();
    const job = { controller, entry };
    entry.job = job;
    this.running.add(job);
    let result;
    try {
      result = await this.check(entry.config, controller.signal);
    } catch {
      result = { ok: false, detail: 'Check failed' };
    } finally {
      delete entry.job;
      this.running.delete(job);
    }
    if (!controller.signal.aborted) {
      const at = this.now();
      entry.due = at + entry.config.intervalMs;
      entry.failures = result.ok ? 0 : entry.failures + 1;
      entry.status = result.ok ? 'up' : entry.failures >= entry.config.failureThreshold ? 'down' : 'retrying';
      const { timing, ...observation } = result;
      entry.latest = { ...observation, at };
      if (result.ok) entry.lastSuccessfulAt = at;
      if (timing) entry.timing = { ...timing, observedAt: at, stale: false };
      else if (entry.timing) entry.timing = { ...entry.timing, stale: true };
      entry.history.push({ ok: result.ok, at });
      if (entry.history.length > HISTORY_LIMIT) entry.history.shift();
      this.onResult(entry.config, entry.status, result);
      this.onUpdate();
    }
    this.schedule();
  }

  snapshot() {
    const now = this.now();
    return {
      status: this.entries.size ? 'ready' : 'empty', error: this.error ?? (this.watchFailed ? 'Automatic check reload is unavailable.' : null),
      checks: [...this.entries.values()].map(({ config, status, latest, lastSuccessfulAt, timing, history }) => ({
        id: config.id, name: config.name, kind: config.kind, intervalMs: config.intervalMs, status, latest,
        lastSuccessfulAt,
        timing: timing ? { ...timing, stale: timing.stale || now >= timing.observedAt + 2 * config.intervalMs + config.timeoutMs } : undefined,
        history: [...history],
      })),
    };
  }

  badgeChecks() {
    return { active: this.active, error: Boolean(this.error || this.watchFailed),
      checks: [...this.entries.values()].map(({ config, status, latest }) => ({
        status, at: latest?.at, intervalMs: config.intervalMs, timeoutMs: config.timeoutMs,
      })),
    };
  }

  async change(command) {
    if (command?.action !== 'configure' || !this.openConfig) throw new Error('Unknown service monitoring command');
    return openMonitorConfig(this.file, 'service checks', 'checks', this.openConfig);
  }
}

module.exports = { ServiceHealth };
