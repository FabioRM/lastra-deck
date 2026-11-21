// @ts-check
'use strict';

const { readJsonSettings, writeJsonSettings, isMissing } = require('./json-settings-file');

const MINUTE = 60_000;
const DURATIONS = Object.freeze({ focus: 25 * MINUTE, break: 5 * MINUTE });
const STATES = ['idle', 'running', 'paused', 'complete'];
const COMMANDS = ['start', 'pause', 'resume', 'reset', 'configure'];
const FIELDS = ['version', 'phase', 'status', 'durationMs', 'durations', 'remainingMs', 'deadlineAt', 'revision'];
const initial = { version: 1, phase: 'focus', status: 'idle', durations: DURATIONS, durationMs: DURATIONS.focus,
  remainingMs: DURATIONS.focus, deadlineAt: null, revision: 0 };
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonnegative = (value) => Number.isSafeInteger(value) && value >= 0;
const nextRevision = (revision) => revision === Number.MAX_SAFE_INTEGER ? 0 : revision + 1;
const readFailure = 'The saved Pomodoro could not be read.';
const writeFailure = 'Lastra could not save the Pomodoro.';

function validDuration(ms) { return Number.isSafeInteger(ms) && ms % MINUTE === 0 && ms >= MINUTE && ms <= 1440 * MINUTE; }

function configuredDurations(value) {
  if (!isRecord(value) || Object.keys(value).length !== 2 || !validDuration(value.focus) || !validDuration(value.break)) return null;
  return value.focus === DURATIONS.focus && value.break === DURATIONS.break ? DURATIONS : { focus: value.focus, break: value.break };
}

function storedState(data) {
  if (!isRecord(data) || Object.keys(data).some((key) => !FIELDS.includes(key)) || data.version !== 1
      || !Object.hasOwn(DURATIONS, data.phase) || !STATES.includes(data.status) || !nonnegative(data.revision)) return null;
  const durations = Object.hasOwn(data, 'durations') ? configuredDurations(data.durations) : DURATIONS;
  if (!durations) return null;
  const durationMs = Object.hasOwn(data, 'durationMs') ? data.durationMs : durations[data.phase];
  if (!validDuration(durationMs) || !nonnegative(data.remainingMs) || data.remainingMs > durationMs) return null;
  const { status, remainingMs, deadlineAt } = data;
  if (status === 'running' && (!nonnegative(deadlineAt) || !remainingMs)) return null;
  if (status !== 'running' && deadlineAt !== null) return null;
  if ((status === 'paused' && !remainingMs) || (status === 'complete' && remainingMs)
      || (status === 'idle' && (remainingMs !== durationMs || durationMs !== durations[data.phase]))) return null;
  return { ...data, durationMs, durations };
}

function readTimer(file) {
  return readJsonSettings(file, {
    maxBytes: 4096,
    parse(data) {
      const state = storedState(data);
      if (!state) throw new Error(readFailure);
      return { state, warning: null };
    },
    fallback: (error) => ({ state: initial, warning: isMissing(error) ? null : readFailure }),
  });
}

class Pomodoro {
  constructor(file, { wall = Date.now, monotonic = () => performance.now(), onChange = (_state) => {} } = {}) {
    this.file = file;
    this.wall = wall;
    this.monotonic = monotonic;
    this.onChange = onChange;
    Object.assign(this, readTimer(file));
    if (this.state.status === 'running') this.restoreClock();
  }

  remaining() { return Math.max(0, Math.ceil(this.due - this.monotonic())); }

  current() {
    if (this.state.status !== 'running') return this.state;
    const remainingMs = this.remaining();
    return remainingMs ? { ...this.state, remainingMs }
      : { ...this.state, status: 'complete', remainingMs: 0, deadlineAt: null, revision: nextRevision(this.state.revision) };
  }

  snapshot() {
    const { phase, status, remainingMs, revision, durationMs, durations } = this.current();
    return { phase, status, durationMs, remainingMs, revision, warning: this.warning,
      ...(durations !== DURATIONS ? { durations } : {}) };
  }

  restoreClock() {
    if (this.state.status !== 'running') return;
    const persisted = Math.max(0, Math.min(this.state.remainingMs, this.state.deadlineAt - this.wall()));
    const remaining = this.due === undefined ? persisted : Math.min(this.remaining(), persisted);
    this.due = this.monotonic() + remaining;
    this.arm();
    this.onChange(this.snapshot());
  }

  arm() {
    clearTimeout(this.timer);
    if (this.state.status !== 'running') return;
    this.timer = setTimeout(() => {
      const current = this.current();
      if (current.status === 'running') { this.arm(); return; }
      try { this.save(current); this.warning = null; }
      catch { this.warning = writeFailure; }
      this.state = current;
      this.due = undefined;
      this.onChange(this.snapshot());
    }, Math.max(1, this.remaining())).unref();
  }

  save(state) {
    writeJsonSettings(this.file, state, { failure: writeFailure });
  }

  change(command) {
    const fields = command?.type === 'configure' ? ['type', 'revision', 'durations'] : ['type', 'revision'];
    if (!isRecord(command) || Object.keys(command).some((key) => !fields.includes(key)) || !COMMANDS.includes(command.type)) {
      throw new Error('Choose a Pomodoro control.');
    }
    const current = this.current();
    if (command.revision !== current.revision) throw new Error('The Pomodoro changed. Try the current control.');
    const { status, phase, remainingMs, durationMs, durations } = current;
    let next = { phase, status, remainingMs, durationMs, durations };
    switch (command.type) {
      case 'start': {
        if (status !== 'idle' && status !== 'complete') throw new Error('This Pomodoro is already active.');
        const round = status === 'complete' ? (phase === 'focus' ? 'break' : 'focus') : phase;
        next = { ...next, phase: round, status: 'running', durationMs: durations[round], remainingMs: durations[round] };
        break;
      }
      case 'pause':
        if (status !== 'running') throw new Error('There is no active Pomodoro to pause.');
        next.status = 'paused';
        break;
      case 'resume':
        if (status !== 'paused') throw new Error('There is no paused Pomodoro to resume.');
        next.status = 'running';
        break;
      case 'reset':
        if (status === 'idle') return this.snapshot();
        next = { ...next, status: 'idle', durationMs: durations[phase], remainingMs: durations[phase] };
        break;
      case 'configure': {
        const settings = configuredDurations(command.durations);
        if (!settings) throw new Error('Enter whole Pomodoro durations from 1 to 1440 minutes.');
        next.durations = settings;
        if (status === 'idle') next.durationMs = next.remainingMs = settings[phase];
        break;
      }
    }
    const running = next.status === 'running';
    const keepDeadline = running && command.type === 'configure';
    const due = keepDeadline ? this.due : running ? this.monotonic() + next.remainingMs : undefined;
    const deadlineAt = keepDeadline ? current.deadlineAt : running ? this.wall() + next.remainingMs : null;
    const record = { version: 1, ...next, deadlineAt, revision: nextRevision(current.revision) };
    this.save(record);
    this.state = record;
    this.due = due;
    this.warning = null;
    this.arm();
    const snapshot = this.snapshot();
    this.onChange(snapshot);
    return snapshot;
  }

  close() { clearTimeout(this.timer); }
}

module.exports = { Pomodoro };
