// @ts-check
'use strict';

const { readMonitorConfig, watchMonitorConfig, openMonitorConfig } = require('./monitoring-config');

const METRICS = {
  cpu: { name: 'CPU load', unit: '%', max: 100, factor: 100, time: 'sampledAt', gap: 3_000 },
  ram: { name: 'RAM usage', unit: '%', max: 100, factor: 100, time: 'sampledAt', gap: 3_000 },
  gpu: { name: 'GPU load', unit: '%', max: 100, factor: 100, time: 'hardwareAt', gap: 6_000 },
  cpuTemp: { name: 'CPU temperature', unit: '°C', max: 150, factor: 1, time: 'hardwareAt', gap: 6_000 },
  gpuTemp: { name: 'GPU temperature', unit: '°C', max: 150, factor: 1, time: 'hardwareAt', gap: 6_000 },
};

function normalizeRules(config) {
  if (config?.version !== 1 || !Array.isArray(config.rules) || config.rules.length > 32) {
    throw new Error('Hardware thresholds require version 1 and a list of up to 32 rules');
  }
  const ids = new Set();
  return config.rules.map((rule, index) => {
    const fail = (message) => { throw new Error(`Rule ${index + 1}. ${message}`); };
    if (typeof rule?.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(rule.id) || ids.has(rule.id)) {
      fail('Choose a unique lowercase rule ID');
    }
    if (typeof rule.metric !== 'string' || !Object.hasOwn(METRICS, rule.metric)) fail('Choose cpu, ram, gpu, cpuTemp, or gpuTemp');
    if (typeof rule.name !== 'string' || !rule.name.trim() || rule.name.length > 80 || /[\u0000-\u001f\u007f]/.test(rule.name)) {
      fail('Enter a name of 1 to 80 characters');
    }
    if (Object.keys(rule).some((field) => !['id', 'name', 'metric', 'direction', 'limit', 'holdSeconds'].includes(field))) {
      fail('Remove unrecognised rule fields');
    }
    const direction = rule.direction ?? 'above';
    if (!['above', 'below'].includes(direction)) fail('Choose above or below');
    const metric = METRICS[rule.metric];
    if (!Number.isFinite(rule.limit) || rule.limit < 0 || rule.limit > metric.max) {
      fail(`Enter a limit between 0 and ${metric.max} ${metric.unit}`);
    }
    const holdSeconds = rule.holdSeconds ?? 15;
    if (!Number.isInteger(holdSeconds) || holdSeconds < 2 || holdSeconds > 3_600) {
      fail('Hold time must be between 2 and 3,600 seconds');
    }
    ids.add(rule.id);
    return { id: rule.id, name: rule.name.trim(), metric: rule.metric, direction, limit: rule.limit, holdSeconds };
  });
}

class TelemetryThresholds {
  /**
   * @param {string} file
   * @param {{ openConfig?: (file: string) => any, onRules?: (ids: string[]) => void,
   *   onResult?: (rule: any, active: boolean, message: string) => void, now?: () => number }} [options]
   */
  constructor(file, { openConfig, onRules = () => {}, onResult = () => {}, now = Date.now } = {}) {
    this.file = file;
    this.openConfig = openConfig;
    this.onRules = onRules;
    this.onResult = onResult;
    this.now = now;
    this.entries = new Map();
  }

  start() {
    if (this.closeWatch) return;
    this.closeWatch = watchMonitorConfig(this.file, () => this.reload(), () => { this.watchFailed = true; });
    this.reload();
  }

  stop() {
    this.closeWatch?.();
    this.closeWatch = null;
  }

  configuration() { return readMonitorConfig(this.file, 'hardware thresholds', normalizeRules); }

  reload() {
    try {
      const rules = this.configuration();
      this.entries = new Map(rules.map((rule) => {
        const previous = this.entries.get(rule.id);
        const signature = JSON.stringify(rule);
        const entry = previous?.signature === signature ? previous : { rule, signature, state: 'unavailable' };
        return [rule.id, entry];
      }));
      this.error = null;
      this.onRules(rules.map(({ id }) => id));
    } catch (err) {
      this.error = err.message;
    }
  }

  observe(sample) {
    const now = this.now();
    for (const entry of this.entries.values()) {
      const rule = entry.rule;
      const metric = METRICS[rule.metric];
      const at = sample[metric.time];
      const reading = sample[rule.metric];
      const gap = metric.time === 'hardwareAt' ? sample.hardwareStaleMs ?? metric.gap : metric.gap;
      if (!Number.isFinite(reading) || !Number.isFinite(at) || at > now || now - at >= gap) {
        entry.state = 'unavailable';
        entry.since = null;
        entry.value = null;
        continue;
      }
      if (entry.lastAt >= at) continue;
      if (at - entry.lastAt >= gap) entry.since = null;
      const value = reading * metric.factor;
      entry.lastAt = at;
      entry.value = value;
      const outside = rule.direction === 'above' ? value >= rule.limit : value <= rule.limit;
      if (!outside) {
        entry.state = 'normal';
        entry.since = null;
        entry.active = false;
        this.onResult(rule, false, 'Reading returned to range');
        continue;
      }
      entry.since ??= at;
      if (entry.active || at - entry.since >= rule.holdSeconds * 1_000) {
        entry.state = 'active';
        entry.active = true;
        this.onResult(rule, true, `${metric.name} ${rule.direction === 'above' ? 'at or above' : 'at or below'} ${rule.limit} ${metric.unit}`);
      } else entry.state = 'pending';
    }
  }

  snapshot() {
    const error = this.error ?? (this.watchFailed ? 'Automatic threshold reload is unavailable.' : null);
    return { error, rules: [...this.entries.values()].map(({ rule, state, value, lastAt }) => ({
      ...rule, state, value, lastAt, metricName: METRICS[rule.metric].name, unit: METRICS[rule.metric].unit,
    })) };
  }

  async change(command) {
    if (command?.action !== 'configure' || !this.openConfig) throw new Error('Unknown hardware threshold command');
    return openMonitorConfig(this.file, 'hardware thresholds', 'rules', this.openConfig);
  }
}

module.exports = { TelemetryThresholds, normalizeRules, METRICS };
