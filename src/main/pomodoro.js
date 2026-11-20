// @ts-check
'use strict';

const { readJsonSettings, writeJsonSettings, isMissing } = require('./json-settings-file');

const DURATIONS = Object.freeze({ focus: 25 * 60_000, break: 5 * 60_000 });
const STATES = ['idle', 'running', 'paused', 'complete'];
const COMMANDS = ['start', 'pause', 'resume', 'reset'];
const FIELDS = ['version', 'phase', 'status', 'remainingMs', 'deadlineAt', 'revision'];
const initial = { version: 1, phase: 'focus', status: 'idle', remainingMs: DURATIONS.focus, deadlineAt: null, revision: 0 };
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonnegative = (value) => Number.isSafeInteger(value) && value >= 0;
const nextRevision = (revision) => revision === Number.MAX_SAFE_INTEGER ? 0 : revision + 1;
const readFailure = 'The saved Pomodoro could not be read.';
const writeFailure = 'Lastra could not save the Pomodoro.';

function storedState(data) {
  if (!isRecord(data) || Object.keys(data).some((key) => !FIELDS.includes(key)) || data.version !== 1
      || !Object.hasOwn(DURATIONS, data.phase) || !STATES.includes(data.status) || !nonnegative(data.revision)
      || !nonnegative(data.remainingMs) || data.remainingMs > DURATIONS[data.phase]) return null;
  const { status, remainingMs, deadlineAt } = data;
  if (status === 'running' && (!nonnegative(deadlineAt) || !remainingMs)) return null;
  if (status !== 'running' && deadlineAt !== null) return null;
  if ((status === 'paused' && !remainingMs) || (status === 'complete' && remainingMs)
      || (status === 'idle' && remainingMs !== DURATIONS[data.phase])) return null;
  return data;
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
  constructor(file, { wall = Date.now, monotonic = () => performance.now() } = {}) {
    this.file = file;
    this.wall = wall;
    this.monotonic = monotonic;
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
    const { phase, status, remainingMs, revision } = this.current();
    return { phase, status, durationMs: DURATIONS[phase], remainingMs, revision, warning: this.warning };
  }

  restoreClock() {
    if (this.state.status !== 'running') return;
    const persisted = Math.max(0, Math.min(this.state.remainingMs, this.state.deadlineAt - this.wall()));
    const remaining = this.due === undefined ? persisted : Math.min(this.remaining(), persisted);
    this.due = this.monotonic() + remaining;
    this.arm();
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
    }, Math.max(1, this.remaining())).unref();
  }

  save(state) {
    writeJsonSettings(this.file, state, { failure: writeFailure });
  }

  change(command) {
    if (!isRecord(command) || Object.keys(command).some((key) => !['type', 'revision'].includes(key)) || !COMMANDS.includes(command.type)) {
      throw new Error('Choose a Pomodoro control.');
    }
    const current = this.current();
    if (command.revision !== current.revision) throw new Error('The Pomodoro changed. Try the current control.');
    const { status, phase, remainingMs } = current;
    let next;
    switch (command.type) {
      case 'start': {
        if (status !== 'idle' && status !== 'complete') throw new Error('This Pomodoro is already active.');
        const round = status === 'complete' ? (phase === 'focus' ? 'break' : 'focus') : phase;
        next = { phase: round, status: 'running', remainingMs: DURATIONS[round] };
        break;
      }
      case 'pause':
        if (status !== 'running') throw new Error('There is no active Pomodoro to pause.');
        next = { phase, status: 'paused', remainingMs };
        break;
      case 'resume':
        if (status !== 'paused') throw new Error('There is no paused Pomodoro to resume.');
        next = { phase, status: 'running', remainingMs };
        break;
      case 'reset':
        if (status === 'idle') return this.snapshot();
        next = { phase, status: 'idle', remainingMs: DURATIONS[phase] };
        break;
    }
    const running = next.status === 'running';
    const due = running ? this.monotonic() + next.remainingMs : undefined;
    const record = { version: 1, ...next, deadlineAt: running ? this.wall() + next.remainingMs : null, revision: nextRevision(current.revision) };
    this.save(record);
    this.state = record;
    this.due = due;
    this.warning = null;
    this.arm();
    return this.snapshot();
  }

  close() { clearTimeout(this.timer); }
}

module.exports = { Pomodoro };
