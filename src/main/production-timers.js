// @ts-check
'use strict';

const { readJsonSettings, writeJsonSettings, isMissing } = require('./json-settings-file');

const MAX_FILE_BYTES = 32 * 1024;
const MAX_SECONDS = 86_400;
const MAX_SEGMENTS = 24;
const COMMANDS = ['configure', 'start-countdown', 'reset-countdown', 'start-rundown', 'advance-rundown', 'reset-rundown'];
const empty = () => ({ version: 1, countdownSeconds: 300, segments: [] });
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validSeconds = (value) => Number.isSafeInteger(value) && value >= 1 && value <= MAX_SECONDS;

function productionConfig(value) {
  if (!isRecord(value) || value.version !== 1 || Object.keys(value).some((key) => !['version', 'countdownSeconds', 'segments'].includes(key))
      || !validSeconds(value.countdownSeconds) || !Array.isArray(value.segments) || value.segments.length > MAX_SEGMENTS) {
    throw new Error('Choose a countdown of 1 second to 24 hours and up to 24 rundown segments.');
  }
  const segments = value.segments.map((segment, index) => {
    const name = typeof segment?.name === 'string' ? segment.name.trim() : '';
    if (!isRecord(segment) || Object.keys(segment).some((key) => !['name', 'seconds'].includes(key))
        || !name || !/^\P{C}{1,60}$/u.test(name) || !validSeconds(segment.seconds)) {
      throw new Error(`Segment ${index + 1} needs a name of up to 60 characters and a duration of 1 second to 24 hours.`);
    }
    return { name, seconds: segment.seconds };
  });
  return { version: 1, countdownSeconds: value.countdownSeconds, segments };
}

function loadConfig(file) {
  return readJsonSettings(file, {
    maxBytes: MAX_FILE_BYTES,
    parse: (data) => ({ config: productionConfig(data), warning: null }),
    fallback: (error) => ({ config: empty(), warning: isMissing(error) ? null : 'Could not read production timer settings.' }),
  });
}

const elapsed = (start, now) => Math.max(0, Math.floor(now - start));

class ProductionTimers {
  constructor(file, { now = () => performance.now() } = {}) {
    this.file = file;
    this.now = now;
    Object.assign(this, loadConfig(file));
    this.revision = 1;
    this.countdown = null;
    this.rundown = null;
  }

  snapshot() {
    const now = this.now();
    const { countdown, rundown } = this;
    return { config: structuredClone(this.config), warning: this.warning, revision: this.revision,
      countdown: countdown ? { durationMs: countdown.durationMs, elapsedMs: elapsed(countdown.startedAt, now) } : null,
      rundown: rundown ? { segments: structuredClone(rundown.segments), index: rundown.index, completed: [...rundown.completed],
        elapsedMs: rundown.startedAt === null ? null : elapsed(rundown.startedAt, now) } : null };
  }

  activeCount() {
    return Number(this.countdown !== null) + Number(this.rundown?.startedAt != null);
  }

  change(command) {
    if (!isRecord(command) || !COMMANDS.includes(command.type) ||
        Object.keys(command).some((key) => !['type', 'revision', ...(command.type === 'configure' ? ['config'] : [])].includes(key))) {
      throw new Error('Choose a production timer command.');
    }
    if (command.revision !== this.revision) throw new Error('The production timer changed. Read its latest state.');
    const now = this.now();
    switch (command.type) {
      case 'configure': {
        const config = productionConfig(command.config);
        writeJsonSettings(this.file, config, { space: 2, failure: 'Could not save production timer settings.' });
        this.config = config;
        this.warning = null;
        break;
      }
      case 'start-countdown':
        if (this.countdown) return this.snapshot();
        this.countdown = { startedAt: now, durationMs: this.config.countdownSeconds * 1000 };
        break;
      case 'reset-countdown':
        if (!this.countdown) return this.snapshot();
        this.countdown = null;
        break;
      case 'start-rundown':
        if (this.rundown?.startedAt != null) return this.snapshot();
        if (!this.config.segments.length) throw new Error('Add at least one segment before starting the rundown.');
        this.rundown = { segments: structuredClone(this.config.segments), index: 0, startedAt: now, completed: [] };
        break;
      case 'advance-rundown': {
        const current = this.rundown;
        if (!current || current.startedAt === null) return this.snapshot();
        current.completed.push(elapsed(current.startedAt, now));
        current.index++;
        current.startedAt = current.index === current.segments.length ? null : now;
        break;
      }
      case 'reset-rundown':
        if (!this.rundown) return this.snapshot();
        this.rundown = null;
        break;
    }
    this.revision++;
    return this.snapshot();
  }
}

module.exports = { ProductionTimers, productionConfig, MAX_SEGMENTS, MAX_SECONDS };
