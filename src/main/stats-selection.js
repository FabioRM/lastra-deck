// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { writeAtomic } = require('./write-atomic');
const { hasChartStyle, hasStatsLayout } = require('../shared/stats-chart');

const MAX_SELECTION = 7;
const MAX_SERIES = 3;
const VALID_ID = /^[a-z0-9][a-z0-9:/ ._-]{0,191}$/i;
const text = (value) => typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, '').slice(0, 96) : '';

function selectorRow({ id, name, device, deviceId, source, group, unit }) {
  const label = text(name);
  if (typeof id !== 'string' || !VALID_ID.test(id) || !label || typeof group !== 'string' || !/^[a-z]+$/.test(group)) throw new Error('Invalid telemetry reading.');
  return { id, name: label, device: text(device), deviceId: text(deviceId), source: text(source), group, unit: text(unit) };
}

function wideCards(value, selected) {
  if (value == null) return null;
  const ids = new Set((selected ?? []).map(({ id }) => id));
  if (!selected || !Array.isArray(value) || value.length > ids.size
      || new Set(value).size !== value.length || value.some((id) => !ids.has(id))) {
    throw new Error('Choose wide cards from the selected readings.');
  }
  return value.slice();
}

function chartSeries(groups, selected, resolve) {
  if (groups == null) return [];
  if (!Array.isArray(groups) || groups.length > (selected?.length ?? 0)) throw new Error('Choose chart series for selected Overview cards.');
  const primaryIds = new Set((selected ?? []).map(({ id }) => id));
  return groups.map(({ id, readings }) => {
    if (!primaryIds.delete(id) || !Array.isArray(readings) || !readings.length || readings.length > MAX_SERIES) {
      throw new Error('Choose up to three additional readings per chart.');
    }
    const rows = readings.map(resolve);
    if (new Set([id, ...rows.map((row) => row.id)]).size !== rows.length + 1) {
      throw new Error('Choose different readings for each chart series.');
    }
    return { id, readings: rows };
  });
}

class StatsSelection {
  constructor(file) {
    this.file = file;
    this.selected = null;
    this.style = 'line';
    this.layout = 'cards';
    this.wide = null;
    this.series = [];
    this.revision = 0;
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > 64 * 1024) throw new Error('Invalid sensor selection.');
      const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      if (data?.version !== 1) throw new Error('Invalid sensor selection.');
      if (data.selected !== null) {
        if (!Array.isArray(data.selected) || !data.selected.length || data.selected.length > MAX_SELECTION) throw new Error('Invalid sensor selection.');
        const records = data.selected.map(selectorRow);
        if (new Set(records.map(({ id }) => id)).size !== records.length) throw new Error('Duplicate sensor selection.');
        this.selected = records;
      }
      if (hasChartStyle(data.style)) this.style = data.style;
      if (hasStatsLayout(data.layout)) this.layout = data.layout;
      this.wide = wideCards(data.wide, this.selected);
      this.series = chartSeries(data.series, this.selected, selectorRow);
    } catch (error) {
      if (error.code !== 'ENOENT') this.warning = 'Saved sensor selections are unavailable.';
    }
  }

  read() { return { selected: this.selected, style: this.style, layout: this.layout, wide: this.wide, series: this.series,
    revision: this.revision, warning: this.warning ?? null, limit: MAX_SELECTION, seriesLimit: MAX_SERIES }; }

  save(ids, snapshot, style = this.style, layout = this.layout, wide, series) {
    if (!hasChartStyle(style)) throw new Error('Choose a supported chart style.');
    if (!hasStatsLayout(layout)) throw new Error('Choose a supported Stats layout.');
    let selected = null;
    const resolve = (id) => {
      if (typeof id !== 'string' || !VALID_ID.test(id) || !known.has(id)) {
        throw new Error('One of the selected readings is unavailable. Refresh the list and try again.');
      }
      return selectorRow(known.get(id));
    };
    const known = new Map([...(this.selected ?? []), ...this.series.flatMap(({ readings }) => readings),
      ...(snapshot?.overview ?? []), ...(snapshot?.readings ?? [])].map((item) => [item.id, item]));
    if (ids !== null) {
      if (!Array.isArray(ids) || !ids.length || ids.length > MAX_SELECTION || new Set(ids).size !== ids.length
          || ids.some((id) => typeof id !== 'string' || !VALID_ID.test(id))) throw new Error(`Choose from one to ${MAX_SELECTION} readings.`);
      selected = ids.map(resolve);
    }
    const widths = wideCards(wide === undefined ? selected && this.wide?.filter((id) => ids.includes(id)) : wide, selected);
    const previous = this.series.filter(({ id }) => ids?.includes(id))
      .map(({ id, readings }) => ({ id, readings: readings.map((row) => row.id) }));
    const overlays = chartSeries(series === undefined ? previous : series, selected, resolve);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    writeAtomic(this.file, JSON.stringify({ version: 1, selected, style, layout, wide: widths, series: overlays }) + '\n');
    this.selected = selected;
    this.style = style;
    this.layout = layout;
    this.wide = widths;
    this.series = overlays;
    this.revision++;
    this.warning = null;
    return this.read();
  }
}

function readingChoices(snapshot, selected) {
  const rows = new Map((selected ?? []).map((item) => [item.id, { ...item, status: 'unavailable' }]));
  for (const item of [...snapshot.overview, ...snapshot.readings]) {
    try { rows.set(item.id, { ...selectorRow(item), status: item.status, reason: item.reason }); } catch { /* Skip malformed sources. */ }
  }
  return [...rows.values()];
}

module.exports = { StatsSelection, readingChoices };
