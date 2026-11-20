// @ts-check
'use strict';

// Node supplies CPU and RAM data. Lastra reads GPU and temperature data
// from its managed monitor or a locally configured LibreHardwareMonitor server.

const os = require('node:os');
const { EventEmitter } = require('node:events');
const { TelemetryHistory } = require('../renderer/telemetry-history');
const { DEFAULTS } = require('./monitoring-settings');

/** Parse "62,0 °C" and "45.3 %". LibreHardwareMonitor follows the system locale. */
function parseLhmValue(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const m = value.replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/**
 * Read the relevant values from the LibreHardwareMonitor JSON tree.
 * Use SensorId when present and fall back to sensor names.
 */
function parseLhm(root) {
  const out = { gpu: null, cpuTemp: null, gpuTemp: null };
  let gpuDevice;
  const visit = (node, group) => {
    if (!node || typeof node !== 'object') return;
    const id = typeof node.SensorId === 'string' ? node.SensorId : '';
    const text = typeof node.Text === 'string' ? node.Text : '';
    const isLeaf = !Array.isArray(node.Children) || node.Children.length === 0;

    if (isLeaf && node.Value !== undefined) {
      const v = parseLhmValue(node.Value);
      if (v !== null) {
        if (id) {
          if (out.gpu === null && /^\/gpu-[a-z]+\/0\/load\/0$/.test(id)) {
            out.gpu = v / 100;
            gpuDevice = id.split('/').slice(0, -2).join('/');
          }
          if (out.gpuTemp === null && /^\/gpu-[a-z]+\/0\/temperature\/0$/.test(id)) out.gpuTemp = v;
          if (out.cpuTemp === null && /^\/(intel|amd)cpu\/0\/temperature\//.test(id)
              && /package|tctl|tdie/i.test(text)) out.cpuTemp = v;
        } else {
          if (out.gpu === null && group === 'Load' && text === 'GPU Core') out.gpu = v / 100;
          if (out.gpuTemp === null && group === 'Temperatures' && text === 'GPU Core') out.gpuTemp = v;
          if (out.cpuTemp === null && group === 'Temperatures' && /CPU Package|Tctl|Tdie/i.test(text)) out.cpuTemp = v;
        }
      }
    }
    if (Array.isArray(node.Children)) node.Children.forEach((c) => visit(c, text));
  };
  visit(root, '');
  return gpuDevice ? { ...out, gpuDevice } : out;
}

function parseLhmReadings(root) {
  const readings = [];
  function visit(node, device = '', depth = 0) {
    if (!node || depth > 12 || readings.length >= 256) return;
    const id = String(node.SensorId ?? '');
    const match = id.match(/^\/(.+)\/([^/]+)\/\d+$/);
    if (match && typeof node.Text === 'string') {
      const type = match[2].toLowerCase();
      let value = parseLhmValue(node.Value);
      if (type === 'throughput') {
        const unit = typeof node.Value === 'string' ? node.Value.match(/\b([kmgt]?)i?b\/s\s*$/i) : null;
        const power = unit ? ['', 'k', 'm', 'g', 't'].indexOf(unit[1].toLowerCase()) : -1;
        value = power < 0 || value === null ? null : value * 1024 ** power;
      }
      readings.push({ id, device: device || match[1], kind: match[1].split('/')[0], type: match[2],
        name: node.Text, value });
    }
    if (Array.isArray(node.Children)) {
      if (depth >= 2 && !device) device = String(node.Text ?? '');
      node.Children.forEach((child) => visit(child, device, depth + 1));
    }
  }
  visit(root);
  return readings;
}

function cpuTimes() {
  return os.cpus().map((c) => {
    const t = c.times;
    return { idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq };
  });
}

class SensorPoller extends EventEmitter {
  /**
   * @param {{ intervalMs?: number, hardware?: any, lhmUrl?: string, fetchImpl?: typeof fetch,
   *   managedIntervalMs?: number, httpIntervalMs?: number, onSample?: (source: string, sampledAt: number) => void }} [options]
   */
  constructor({ intervalMs = 1000, hardware = null, lhmUrl = 'http://127.0.0.1:8085/data.json', fetchImpl = globalThis.fetch,
    managedIntervalMs = DEFAULTS.hardware, httpIntervalMs = DEFAULTS.http, onSample } = {}) {
    super();
    this.intervalMs = intervalMs;
    this.lhmUrl = lhmUrl;
    this.fetch = fetchImpl;
    this.hardware = hardware;
    this.onSample = onSample;
    this.setHardwareIntervals({ managed: managedIntervalMs, http: httpIntervalMs });
    this.prev = cpuTimes();
    this.lhm = { gpu: null, cpuTemp: null, gpuTemp: null };
    this.lhmAt = null;
    this.lhmRetryAt = 0;
    this.pollingLhm = false;
    this.history = new TelemetryHistory();
    this.timer = null;
  }

  setHardwareIntervals({ managed, http }) {
    this.managedIntervalMs = managed;
    this.httpIntervalMs = http;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.tick();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  cpuLoad() {
    const now = cpuTimes();
    let idle = 0;
    let total = 0;
    now.forEach((c, i) => {
      const p = this.prev[i] || c;
      idle += c.idle - p.idle;
      total += c.total - p.total;
    });
    this.prev = now;
    return total > 0 ? Math.min(1, Math.max(0, 1 - idle / total)) : 0;
  }

  async pollLhm() {
    const now = Date.now();
    if (this.pollingLhm || !this.fetch || now < this.lhmRetryAt
        || (this.lhmAt !== null && now - this.lhmAt < this.httpIntervalMs)) return;
    this.pollingLhm = true;
    try {
      this.onSample?.('hardwareHttp', now);
      const res = await this.fetch(this.lhmUrl, { signal: AbortSignal.timeout(500) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const root = await res.json();
      this.lhm = parseLhm(root);
      this.lhmReadings = parseLhmReadings(root);
      this.lhmAt = Date.now();
      this.lhmRetryAt = 0;
    } catch {
      this.lhmRetryAt = Date.now() + 15000; // Retry later if LibreHardwareMonitor is unavailable.
    } finally {
      this.pollingLhm = false;
    }
  }

  async tick() {
    const sampledAt = Date.now();
    const cpu = this.cpuLoad();
    const ram = 1 - os.freemem() / os.totalmem();
    this.onSample?.('cpuRam', sampledAt);
    const previousSample = this.hardware?.latestAt;
    if (!this.hardware?.latest || (previousSample != null && sampledAt - previousSample >= this.managedIntervalMs * 3)) {
      await this.pollLhm();
    }
    const managed = this.hardware?.latest;
    const managedAt = managed ? this.hardware.latestAt ?? sampledAt : null;
    const useManaged = managed && (this.lhmAt === null || managedAt >= this.lhmAt);
    const hardwareAt = useManaged ? managedAt : this.lhmAt;
    const sample = {
      cpu, ram, ...(useManaged ? managed : this.lhm), sampledAt, hardwareAt,
      hardwareSource: useManaged ? 'managed' : this.lhmAt !== null ? 'http' : this.fetch ? 'unavailable' : 'disabled',
      hardwareStaleMs: (useManaged ? this.managedIntervalMs : this.httpIntervalMs) * 3,
      lhmReady: hardwareAt !== null,
    };
    this.history.record(sample);
    this.emit('data', sample);
  }

  detail(source) {
    return source === 'managed' ? this.hardware?.readings : source === 'http' ? this.lhmReadings : null;
  }
}

module.exports = { SensorPoller, parseLhm, parseLhmValue, parseLhmReadings };
