// @ts-check
'use strict';

const { isDeepStrictEqual } = require('node:util');

const RUN_MS = 60_000;
const SETTLE_MS = 3_000;
const WASHOUT_MS = 500;
const INPUT_POLL_MS = 20;
const RESOURCE_POLL_MS = 2_000;
const MAX_CONTACTS = 256;
const MAX_EVENTS = 128;
const PROVIDERS = ['cpuRam', 'audio', 'hardwareManaged', 'hardwareHttp', 'media', 'windowsStats', 'frames'];
const SURFACES = ['keys', 'dashboard', 'stats', 'bar'];
const OUTCOMES = ['success', 'error', 'unavailable', 'cancelled', 'ignored', 'superseded'];
const RESOURCE_IDS = ['electron', 'hardware', 'media'];
const CURSOR_OBSERVATION_MS = 225;

function statistics(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const count = sorted.length;
  const round = (value) => Math.round(value * 100) / 100;
  return count ? {
    count,
    mean: round(sorted.reduce((total, value) => total + value, 0) / count),
    p50: round(sorted[Math.ceil(count * .50) - 1]),
    p95: round(sorted[Math.ceil(count * .95) - 1]),
    max: round(sorted.at(-1)),
  } : { count, mean: null, p50: null, p95: null, max: null };
}

class MeasurementRun {
  constructor({ id, phase, now, setup, durationMs = RUN_MS }) {
    this.id = id;
    this.phase = phase;
    this.startedAt = now + SETTLE_MS;
    this.endedAt = this.startedAt + durationMs;
    this.setup = setup;
    this.contacts = new Map();
    this.untaggedCommands = { requests: 0, executions: 0 };
    this.observations = [];
    this.resources = [];
    this.providerReads = Object.fromEntries(PROVIDERS.map((source) => [source, 0]));
    this.redraws = Object.fromEntries(SURFACES.map((surface) => [surface, 0]));
  }

  get state() { return { id: this.id, startedAt: this.startedAt, endedAt: this.endedAt }; }

  active(at) { return Number.isFinite(at) && this.startedAt <= at && at < this.endedAt; }

  observe(at, input) {
    if (at >= this.endedAt + CURSOR_OBSERVATION_MS || !input || this.observations.length >= 4_000) return;
    this.observations.push({ at, cursor: input.cursor, window: input.window });
  }

  sample(at, rows) {
    if (!this.active(at) || !Array.isArray(rows) || this.resources.length >= 64) return;
    this.resources.push(rows);
  }

  provider(source, at) {
    if (!this.active(at) || !Object.hasOwn(this.providerReads, source)) return;
    this.providerReads[source]++;
  }

  contact(id) {
    if (!Number.isInteger(id) || id < 1 || id > MAX_CONTACTS) return null;
    if (!this.contacts.has(id)) this.contacts.set(id, { requests: 0, executions: 0 });
    return this.contacts.get(id);
  }

  command(trace, phase, at = Date.now()) {
    const metric = phase === 'request' ? 'requests' : 'executions';
    const contact = trace?.run === this.id ? this.contact(trace.id) : null;
    if (contact) contact[metric]++;
    else if (this.active(at)) this.untaggedCommands[metric]++;
  }

  receive(batch) {
    if (batch?.run !== this.id || !Array.isArray(batch.events) || batch.events.length > MAX_EVENTS) return;
    for (const event of batch.events) {
      if (!event || !Number.isFinite(event.at) || event.at >= this.endedAt + WASHOUT_MS) continue;
      if (event.kind === 'redraw' && this.active(event.at) && Object.hasOwn(this.redraws, event.surface)) {
        this.redraws[event.surface]++;
      } else if (event.kind === 'touch' && this.active(event.at)) {
        const contact = this.contact(event.id);
        if (contact) contact.at ??= event.at;
      } else if (event.at >= this.startedAt && ['pending', 'feedback', 'outcome'].includes(event.kind)) {
        const contact = this.contact(event.id);
        if (contact && (event.kind !== 'outcome' || OUTCOMES.includes(event.status))) {
          contact[event.kind] ??= event.kind === 'outcome' ? event.status : event.at;
        }
      }
    }
  }

  inputFor(at) {
    const before = this.observations.findLast((sample) => sample.at <= at - 35);
    if (!before || before.at < at - 175) return {};
    const during = this.observations.filter((sample) => at <= sample.at && sample.at <= at + CURSOR_OBSERVATION_MS);
    const settled = during.findLast((sample) => sample.at >= at + 175);
    const distance = (sample) => sample?.cursor && before.cursor
      ? Math.hypot(sample.cursor.x - before.cursor.x, sample.cursor.y - before.cursor.y) : null;
    const excursions = during.map(distance).filter(Number.isFinite);
    const after = distance(settled);
    const windows = during.map(({ window }) => window).filter((window) => window != null);
    return {
      displacementPx: excursions.length ? Math.round(Math.max(...excursions)) : null,
      displacementAfterPx: after === null ? null : Math.round(after),
      foregroundChanged: before.window == null || !windows.length ? null : windows.some((window) => window !== before.window),
    };
  }

  summary() {
    const taps = [...this.contacts.values()].filter(({ at }) => this.active(at)).sort((a, b) => a.at - b.at).map((contact) => {
      const delay = (time) => Number.isFinite(time) && time >= contact.at ? Math.round((time - contact.at) * 100) / 100 : null;
      return {
        offsetMs: Math.round(contact.at - this.startedAt),
        requests: contact.requests, executions: contact.executions, outcome: contact.outcome ?? 'unreported',
        pendingFrameMs: delay(contact.pending), feedbackFrameMs: delay(contact.feedback), ...this.inputFor(contact.at),
      };
    });
    const measured = this.observations.filter(({ at }) => this.active(at));
    const windows = measured.map(({ window }) => window).filter((window) => window != null);
    const foregroundTransitions = windows.slice(1).filter((window, index) => window !== windows[index]).length;
    const resources = RESOURCE_IDS.map((id) => {
      const rows = this.resources.flatMap((sample) => sample.filter((row) => row.id === id));
      return {
        id,
        ready: rows.filter(({ status }) => status === 'ready').length,
        inactive: rows.filter(({ status }) => status === 'inactive').length,
        unavailable: rows.filter(({ status }) => status === 'unavailable').length,
        cpuPercent: statistics(rows.map(({ cpuPercent }) => cpuPercent)),
        workingSetMiB: statistics(rows.map(({ workingSetMiB }) => workingSetMiB)),
      };
    });
    return {
      phase: this.phase, startedAt: new Date(this.startedAt).toISOString(), durationMs: this.endedAt - this.startedAt,
      setup: this.setup, resources, resourceSampleCount: this.resources.length,
      providerReads: this.providerReads, redrawFrames: this.redraws,
      input: { pollMs: INPUT_POLL_MS, samples: measured.length, foregroundTransitions,
        foregroundSamples: windows.length, cursorSamples: measured.filter(({ cursor }) => cursor).length,
        tapsWithoutRequest: taps.filter(({ requests }) => requests === 0).length,
        tapsWithoutExecution: taps.filter(({ executions }) => executions === 0).length,
        tapsWithMultipleRequests: taps.filter(({ requests }) => requests > 1).length,
        tapsWithMultipleExecutions: taps.filter(({ executions }) => executions > 1).length,
        untaggedCommands: this.untaggedCommands, taps },
      latency: { pendingFrameMs: statistics(taps.map(({ pendingFrameMs }) => pendingFrameMs)),
        feedbackFrameMs: statistics(taps.map(({ feedbackFrameMs }) => feedbackFrameMs)) },
    };
  }
}

function compareRuns(idle, active) {
  if (!idle || !active) return { status: 'awaiting-pair' };
  if (Date.parse(active.startedAt) < Date.parse(idle.startedAt) + idle.durationMs) return { status: 'idle-is-newer' };
  const setupFields = new Set([...Object.keys(idle.setup), ...Object.keys(active.setup)]);
  const differences = [...setupFields].filter((field) => !isDeepStrictEqual(idle.setup[field], active.setup[field]));
  if (idle.durationMs !== active.durationMs) differences.push('durationMs');
  if (differences.length) return { status: 'different-setup', differences };
  const delta = (before, after) => before === null || after === null ? null : Math.round((after - before) * 100) / 100;
  const counts = (before, after) => Object.fromEntries(Object.keys(after).map((key) => [key, after[key] - before[key]]));
  return {
    status: 'comparable',
    providerReadDelta: counts(idle.providerReads, active.providerReads),
    redrawFrameDelta: counts(idle.redrawFrames, active.redrawFrames),
    resourceDelta: active.resources.map(({ id, cpuPercent, workingSetMiB }) => {
      const before = idle.resources.find((row) => row.id === id);
      return { id, meanCpuPercentagePoints: delta(before.cpuPercent.mean, cpuPercent.mean),
        meanWorkingSetMiB: delta(before.workingSetMiB.mean, workingSetMiB.mean) };
    }),
  };
}

class PanelMeasurements {
  constructor({ input, resources, setup, update, now = Date.now }) {
    this.input = input;
    this.resources = resources;
    this.setup = setup;
    this.update = update;
    this.now = now;
    this.runs = new Map();
    this.sequence = 0;
  }

  start(phase) {
    if (this.run || !['idle', 'active'].includes(phase)) return;
    const run = new MeasurementRun({ id: ++this.sequence, phase, now: this.now(), setup: this.setup() });
    this.run = run;
    this.update(run.state);
    let nextResourceAt = run.startedAt;
    this.timer = setInterval(() => {
      const at = this.now();
      if (at >= run.endedAt + WASHOUT_MS) {
        this.runs.set(phase, run.summary());
        this.close();
        this.update(null);
        return;
      }
      if (at < run.endedAt + CURSOR_OBSERVATION_MS) run.observe(at, this.input());
      if (at < run.endedAt && at >= nextResourceAt) {
        run.sample(at, this.resources().rows);
        nextResourceAt = at + RESOURCE_POLL_MS;
      }
    }, INPUT_POLL_MS);
  }

  snapshot() {
    return { version: 1, runs: [...this.runs.values()], comparison: compareRuns(this.runs.get('idle'), this.runs.get('active')) };
  }

  close() {
    clearInterval(this.timer);
    this.run = this.timer = null;
  }
}

module.exports = { MeasurementRun, PanelMeasurements, SETTLE_MS, RUN_MS };
