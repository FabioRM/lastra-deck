// @ts-check
'use strict';

const { readJsonSettings, writeJsonSettings } = require('./json-settings-file');
const { knownHistoryHours } = require('./retained-telemetry');

const OPTIONS = {
  resources: [2_000, 5_000, 10_000],
  hardware: [2_000, 5_000, 10_000],
  http: [2_000, 5_000, 10_000],
  media: [1_000, 2_000, 3_000],
};
const DEFAULTS = Object.fromEntries(Object.entries(OPTIONS).map(([key, values]) => [key, values[0]]));

function readSettings(file, log) {
  return readJsonSettings(file, {
    maxBytes: 4_096,
    parse(data) {
      if (data?.version !== 1) throw new Error('Unsupported settings version');
      const intervals = Object.fromEntries(Object.entries(OPTIONS).map(([source, values]) => {
        const selected = data.intervals?.[source];
        return [source, values.includes(selected) ? selected : DEFAULTS[source]];
      }));
      return { intervals, historyHours: knownHistoryHours(data.historyHours) ? data.historyHours : 0 };
    },
    fallback: () => ({ intervals: { ...DEFAULTS }, historyHours: 0 }),
    onError: () => log('Monitoring settings unavailable. Using defaults.'),
  });
}

class MonitoringSettings {
  constructor(file, log = () => {}) {
    this.file = file;
    Object.assign(this, readSettings(file, log));
  }

  snapshot() {
    return { intervals: this.intervals, options: OPTIONS };
  }

  set(source, intervalMs) {
    if (typeof source !== 'string' || !Object.hasOwn(OPTIONS, source) || !OPTIONS[source].includes(intervalMs)) {
      throw new Error('Choose a supported monitoring refresh interval');
    }
    if (this.intervals[source] !== intervalMs) {
      const intervals = { ...this.intervals, [source]: intervalMs };
      this.save(intervals, this.historyHours);
    }
    return this.snapshot();
  }

  setHistoryHours(hours) {
    if (!knownHistoryHours(hours)) throw new Error('Choose a supported telemetry retention period.');
    if (this.historyHours !== hours) this.save(this.intervals, hours);
  }

  save(intervals, historyHours) {
    writeJsonSettings(this.file, { version: 1, intervals, historyHours }, { space: 2, failure: 'Could not save monitoring settings.' });
    this.intervals = intervals;
    this.historyHours = historyHours;
  }
}

module.exports = { MonitoringSettings, DEFAULTS };
