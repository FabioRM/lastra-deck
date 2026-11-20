// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { writeAtomic } = require('./write-atomic');

const MAX_PINS = 6;
const SERVICE = /^service:([a-z0-9][a-z0-9_-]{0,39})$/;
const HARDWARE = [
  ['cpu', 'CPU load'], ['ram', 'RAM usage'], ['gpu', 'GPU load'],
  ['cpuTemp', 'CPU temperature'], ['gpuTemp', 'GPU temperature'],
].map(([metric, label]) => ({ id: `hardware:${metric}`, kind: 'hardware', metric, label }));
const APPS = [
  { id: 'app:lastra-cpu', kind: 'app', metric: 'cpu', label: 'Lastra CPU usage', view: 'resources' },
  { id: 'app:lastra-memory', kind: 'app', metric: 'memory', label: 'Lastra working set', view: 'resources' },
  { id: 'app:docker', kind: 'app', metric: 'containers', label: 'Docker containers', view: 'docker' },
];
const BASE = [...HARDWARE, ...APPS];
const WATCHLIST_PIN_IDS = Object.freeze(BASE.map(({ id }) => id));
const DEFAULT_PINS = HARDWARE.slice(0, 3).map(({ id }) => id);

function knownId(id) {
  return typeof id === 'string' && (WATCHLIST_PIN_IDS.includes(id) || SERVICE.test(id));
}

function readPins(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 4096) return [...DEFAULT_PINS];
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (raw?.version === 1 && Array.isArray(raw.pins)) return [...new Set(raw.pins.filter(knownId))].slice(0, MAX_PINS);
  } catch {}
  return [...DEFAULT_PINS];
}

class MonitoringWatchlist {
  constructor(file, { serviceHealth, resources, docker, resourceInterval = () => 2_000, now = Date.now }) {
    this.file = file;
    this.pins = readPins(file);
    this.serviceHealth = serviceHealth;
    this.resources = resources;
    this.docker = docker;
    this.resourceInterval = resourceInterval;
    this.now = now;
  }

  options(checks) {
    return [...BASE, ...checks.map(({ id, name }) => ({
      id: `service:${id}`, kind: 'service', label: name, view: 'service-health', target: id,
    }))];
  }

  configuration() {
    const { checks, error } = this.serviceHealth();
    return { pins: [...this.pins], services: error ? null : (checks ?? []).map(({ id }) => id) };
  }

  async snapshot({ refresh = true } = {}) {
    const pinIds = this.pins;
    const checks = this.serviceHealth().checks ?? [];
    const options = this.options(checks);
    const available = new Map(options.map((entry) => [entry.id, entry]));
    const services = new Map(checks.map((check) => [check.id, check]));
    const now = this.now();
    if (refresh && pinIds.some((id) => id === 'app:lastra-cpu' || id === 'app:lastra-memory')) {
      if (!this.lastResource || now - this.lastResource.at >= this.resourceInterval()) {
        this.lastResource = { at: now, row: this.resources().rows.find(({ id }) => id === 'electron') };
      }
    }
    let dockerSummary = this.lastDocker;
    if (refresh && pinIds.includes('app:docker')) {
      dockerSummary = { state: 'unavailable', sampledAt: now };
      try {
        const docker = await this.docker();
        if (docker?.status === 'ready') dockerSummary = { state: 'ready', sampledAt: now,
          value: docker.containers.filter(({ state }) => state === 'running').length, partial: docker.total > docker.containers.length };
      } catch { /* A provider without a sample is represented as unavailable. */ }
      if (!this.lastDocker || this.lastDocker.sampledAt <= now) this.lastDocker = dockerSummary;
    }
    const resources = this.lastResource?.row;
    const tiles = pinIds.map((id) => {
      const entry = available.get(id);
      if (!entry) return { id, kind: 'service', label: 'Removed service check', state: 'unavailable' };
      if (entry.kind === 'service') {
        const check = services.get(entry.target);
        return { ...entry, state: check.status, latencyMs: check.latest?.latencyMs, sampledAt: check.latest?.at };
      }
      if (entry.view === 'resources') {
        const value = entry.metric === 'cpu' ? resources?.cpuPercent : resources?.workingSetMiB;
        const state = entry.metric === 'cpu' && resources?.cpuStatus === 'measuring' ? 'measuring'
          : Number.isFinite(value) ? 'ready' : 'unavailable';
        return { ...entry, value, state, sampledAt: this.lastResource?.at };
      }
      if (entry.view === 'docker') {
        return { ...entry, ...(dockerSummary ?? { state: 'unavailable' }) };
      }
      return entry;
    });
    return { status: 'ready', tiles, options, limit: MAX_PINS };
  }

  change(command) {
    const { action, id, pinned } = command ?? {};
    if (action !== 'pin' || !knownId(id) || typeof pinned !== 'boolean') throw new Error('Invalid watchlist selection');
    if (pinned === this.pins.includes(id)) return { ok: true };
    if (pinned && SERVICE.test(id) && !this.serviceHealth().checks?.some((check) => `service:${check.id}` === id)) {
      throw new Error('This service check is unavailable');
    }
    if (pinned && this.pins.length >= MAX_PINS) throw new Error(`Pin up to ${MAX_PINS} readings`);
    const pins = pinned ? [...this.pins, id] : this.pins.filter((item) => item !== id);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    writeAtomic(this.file, JSON.stringify({ version: 1, pins }, null, 2) + '\n');
    this.pins = pins;
    return { ok: true };
  }
}

module.exports = { MonitoringWatchlist, MAX_PINS, WATCHLIST_PIN_IDS, WATCHLIST_SERVICE_ID: SERVICE };
