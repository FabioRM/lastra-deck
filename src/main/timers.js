// @ts-check
'use strict';

// Named countdowns and stopwatches that keep running across restarts.
// Readings follow the wall clock, so a countdown ends on time after sleep or a restart.

const { readJsonSettings, writeJsonSettings, isMissing } = require('./json-settings-file');
const { MAX_TIMERS, STOPWATCH_LIMIT, TIMER_ID, timerDefinition, timerReading, formatTimer } = require('../shared/timers');

const STATUS = ['running', 'paused', 'complete'];
const FIELDS = ['id', 'label', 'kind', 'durationMs', 'status', 'valueMs', 'anchorAt', 'endedAt'];
const COMMANDS = ['start', 'toggle', 'pause', 'resume', 'restart', 'remove'];
const readFailure = 'The saved timers could not be read.';
const writeFailure = 'Lastra could not save the timers.';
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const stamp = (value) => Number.isSafeInteger(value) && value >= 0;

function storedTimer(data) {
  if (!isRecord(data) || Object.keys(data).some((key) => !FIELDS.includes(key)) || !STATUS.includes(data.status)) return null;
  let definition;
  try { definition = timerDefinition(data); }
  catch { return null; }
  const { status, valueMs, anchorAt, endedAt } = data;
  const limit = definition.kind === 'countdown' ? definition.durationMs : STOPWATCH_LIMIT;
  if (!stamp(valueMs) || valueMs > limit || (status === 'running' ? !stamp(anchorAt) : anchorAt !== null)) return null;
  if (status === 'complete' ? (definition.kind !== 'countdown' || valueMs !== 0 || !stamp(endedAt)) : endedAt !== null) return null;
  return { ...definition, status, valueMs, anchorAt, endedAt };
}

function readTimers(file) {
  return readJsonSettings(file, {
    maxBytes: 16_384,
    parse(data) {
      if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.timers) || data.timers.length > MAX_TIMERS) throw new Error(readFailure);
      const timers = data.timers.map(storedTimer);
      if (timers.includes(null) || new Set(timers.map(({ id }) => id)).size !== timers.length) throw new Error(readFailure);
      return { timers, warning: null };
    },
    fallback: (error) => ({ timers: [], warning: isMissing(error) ? null : readFailure }),
  });
}

class Timers {
  /**
   * @param {string} file
   * @param {{ now?: () => number, onChange?: (state: any, events: { completed: any[], cleared: string[] }) => void }} [options]
   */
  constructor(file, { now = Date.now, onChange = () => {} } = {}) {
    this.file = file;
    this.now = now;
    this.onChange = onChange;
    this.revision = 0;
    /** @type {any[]} */
    this.timers = [];
    /** @type {string | null} */
    this.warning = null;
    Object.assign(this, readTimers(file));
  }

  /** Finish the countdowns that ended while Lastra was closed, then keep time. */
  start() { this.settle(true); }

  snapshot() {
    return { revision: this.revision, timers: this.timers.map((timer) => ({ ...timer })), warning: this.warning };
  }

  activeCount() { return this.timers.filter(({ status }) => status !== 'complete').length; }

  save() {
    try {
      writeJsonSettings(this.file, { version: 1, timers: this.timers }, { failure: writeFailure });
      this.warning = null;
    } catch { this.warning = writeFailure; }
  }

  publish(completed = [], cleared = []) {
    this.revision = this.revision === Number.MAX_SAFE_INTEGER ? 0 : this.revision + 1;
    this.arm();
    this.onChange(this.snapshot(), { completed, cleared });
  }

  /** Mark every countdown that has reached zero as finished. */
  settle(announce = false) {
    const now = this.now();
    const completed = [];
    this.timers = this.timers.map((timer) => {
      if (timer.status !== 'running' || timer.kind !== 'countdown' || timerReading(timer, now).ms > 0) return timer;
      const finished = { ...timer, status: 'complete', valueMs: 0, anchorAt: null, endedAt: Math.min(now, timer.anchorAt + timer.valueMs) };
      completed.push(finished);
      return finished;
    });
    if (completed.length) this.save();
    if (completed.length || announce) this.publish(completed);
    else this.arm();
  }

  /** Re-read the wall clock after the PC wakes. */
  restoreClock() { this.settle(); }

  arm() {
    clearTimeout(this.timer);
    const now = this.now();
    const due = this.timers.filter(({ status, kind }) => status === 'running' && kind === 'countdown')
      .map((timer) => timerReading(timer, now).ms);
    if (!due.length) return;
    // Long timeouts drift across sleep, so check again at least once a minute.
    this.timer = setTimeout(() => this.settle(), Math.max(1, Math.min(...due, 60_000)));
    this.timer.unref();
  }

  running(definition) {
    const countdown = definition.kind === 'countdown';
    return { ...definition, status: 'running', valueMs: countdown ? definition.durationMs : 0, anchorAt: this.now(), endedAt: null };
  }

  nextId() {
    for (let index = 1; ; index++) {
      const id = `timer-${index}`;
      if (!this.timers.some((timer) => timer.id === id)) return id;
    }
  }

  /**
   * Run a timer command and return what happened.
   * @param {any} command
   * @returns {{ message: string, state: ReturnType<Timers['snapshot']> }}
   */
  change(command) {
    if (!isRecord(command) || !COMMANDS.includes(command.type)) throw new Error('Choose a timer control.');
    this.settle();
    const { type, ...rest } = command;
    const defined = rest.label !== undefined || rest.kind !== undefined || rest.durationMs !== undefined;
    if (type === 'start' && rest.id === undefined) rest.id = this.nextId();
    if (typeof rest.id !== 'string' || !TIMER_ID.test(rest.id)) throw new Error('Choose a timer.');
    const index = this.timers.findIndex(({ id }) => id === rest.id);
    const current = this.timers[index];
    // A key carries its own definition, so it can start a timer that does not exist yet or restart it with a new duration.
    const creates = type === 'start' || type === 'restart' || (type === 'toggle' && !current);
    const definition = defined && creates ? timerDefinition(rest) : current ? timerDefinition(current) : null;
    if (creates && !definition) throw new Error('That timer is no longer available.');
    const now = this.now();
    const cleared = [];
    let next;
    let message;
    const begin = () => {
      next = this.running(definition);
      message = `Started ${definition.label}${definition.kind === 'countdown' ? ` · ${formatTimer(definition.durationMs)}` : ''}`;
      if (current?.status === 'complete') cleared.push(current.id);
    };
    const action = type !== 'toggle' ? type : !current ? 'start' : current.status === 'running' ? 'pause'
      : current.status === 'paused' ? 'resume' : 'remove';
    switch (action) {
      case 'start':
      case 'restart':
        begin();
        break;
      case 'pause':
        if (current?.status !== 'running') throw new Error('There is no running timer to pause.');
        next = { ...current, status: 'paused', valueMs: timerReading(current, now).ms, anchorAt: null };
        message = `Paused ${current.label}`;
        break;
      case 'resume':
        if (current?.status !== 'paused') throw new Error('There is no paused timer to resume.');
        next = { ...current, status: 'running', anchorAt: now };
        message = `Resumed ${current.label}`;
        break;
      case 'remove':
        if (!current) return { message: 'That timer is not running.', state: this.snapshot() };
        if (current.status === 'complete') cleared.push(current.id);
        message = `${current.status === 'complete' ? 'Dismissed' : 'Removed'} ${current.label}`;
        break;
    }
    const timers = this.timers.slice();
    if (!next) timers.splice(index, 1);
    else if (current) timers[index] = next;
    else {
      if (timers.length >= MAX_TIMERS) {
        const finished = timers.findIndex(({ status }) => status === 'complete');
        if (finished < 0) throw new Error(`Remove a timer before starting another. Lastra keeps up to ${MAX_TIMERS}.`);
        cleared.push(timers[finished].id);
        timers.splice(finished, 1);
      }
      timers.push(next);
    }
    this.timers = timers;
    this.save();
    this.publish([], cleared);
    return { message, state: this.snapshot() };
  }

  close() { clearTimeout(this.timer); }
}

module.exports = { Timers };
