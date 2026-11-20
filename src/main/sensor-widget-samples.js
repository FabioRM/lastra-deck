// @ts-check
'use strict';

const { isSensorId, SENSOR_LIMIT } = require('../shared/sensor-binding');
const { hardwareReadings } = require('./stats');
const { TelemetryHistory } = require('../renderer/telemetry-history');

const HISTORY_WINDOW = 60_000;

function checkedSensorIds(ids) {
  if (!Array.isArray(ids) || ids.length > SENSOR_LIMIT || !ids.every(isSensorId)) throw new Error('Invalid sensor widget bindings.');
  return [...new Set(ids)];
}

class SensorWidgetSamples {
  constructor(readCached) {
    this.readCached = readCached;
    this.ids = [];
    this.history = new TelemetryHistory(Object.create(null));
  }

  readings() {
    const { sample, details } = this.readCached() ?? {};
    if (!Number.isFinite(sample?.hardwareAt)) return { entries: [], now: sample?.sampledAt };
    const { entries } = hardwareReadings(sample, details);
    return { entries, now: sample.sampledAt };
  }

  choices() {
    return this.readings().entries.map(({ id, name, group, device, deviceId, source, unit, value }) =>
      ({ id, name, group, device, deviceId, source, unit, available: Number.isFinite(value) }));
  }

  select(ids) {
    this.ids = checkedSensorIds(ids);
    for (const id of Object.keys(this.history.series)) {
      if (!this.ids.includes(id)) delete this.history.series[id];
    }
    return this.snapshot(this.ids, { record: true });
  }

  snapshot(ids = this.ids, { record = false } = {}) {
    if (!ids.length) return {};
    const { entries, now } = this.readings();
    const selected = new Set(ids);
    return Object.fromEntries(entries.filter(({ id }) => selected.has(id)).map((reading) => {
      const { id, at, value } = reading;
      if (record) this.history.recordPoint(id, at, value, now);
      const points = (this.history.series[id] ?? [[at, value]]).filter(([time]) => time >= now - HISTORY_WINDOW).slice(-60);
      if (record) this.history.series[id] = points;
      return [id, { ...reading, points }];
    }));
  }
}

module.exports = { SensorWidgetSamples, checkedSensorIds };
