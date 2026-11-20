// @ts-check
'use strict';

const { MAX_WIDGETS, BAR_GRID, VIEW_GRID, catalog, fits, cells, findPosition, canPlace, sameWidgetLayout } = require('../shared/widget-layout');
const { DEFAULT_COMPOSITION, normalizeComposition } = require('../shared/widget-composition');
const { isSensorId } = require('../shared/sensor-binding');
const { normalizeChoices } = require('../shared/decisions');
const VALID_ID = /^[a-z0-9_-]{1,48}$/i;

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSettings(raw, type, where) {
  if (raw !== undefined && !object(raw)) throw new Error(`${where}: settings must be an object`);
  const fields = catalog[type].fields;
  const saved = raw ?? {};
  if (type === 'composition') {
    if (Object.keys(saved).some((key) => key !== 'composition')) throw new Error(`${where}: unsupported composition setting`);
    return { composition: normalizeComposition(saved.composition ?? DEFAULT_COMPOSITION, where) };
  }
  const custom = type === 'system-metric' && Object.hasOwn(saved, 'sensorId');
  if (custom && !isSensorId(saved.sensorId)) throw new Error(`${where}: invalid "sensorId"`);
  for (const key of Object.keys(saved)) {
    if (!(Object.hasOwn(fields, key) || custom && key === 'sensorId')) throw new Error(`${where}: unsupported setting "${key}"`);
  }
  const present = Object.entries(fields).filter(([key, field]) => !field.optional || Object.hasOwn(saved, key));
  const settings = Object.fromEntries(present.map(([key, field]) => {
    const value = Object.hasOwn(saved, key) ? saved[key] : field.value;
    if (type === 'decision') {
      const choices = normalizeChoices(value);
      if (!choices) throw new Error(`${where}: provide 2–8 distinct pick options of 1–32 characters each`);
      return [key, choices];
    }
    const valid = field.choices ? typeof value === 'string' && Object.hasOwn(field.choices, value)
      : Number.isInteger(value) && value >= field.min && value <= field.max;
    if (!valid) throw new Error(`${where}: invalid "${key}"`);
    return [key, value];
  }));
  if (custom) settings.sensorId = saved.sensorId;
  return settings;
}

/**
 * @param {any} raw
 * @param {{ grid?: { cols: number, rows: number }, occupied?: Iterable<any>, label?: string }} [options]
 */
function normalizeWidgetInstances(raw, { grid, occupied = [], label = 'Widgets' } = {}) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_WIDGETS) {
    throw new Error(`${label}: expected an array with up to ${MAX_WIDGETS} widgets`);
  }
  const bounds = grid ?? VIEW_GRID;
  const ids = new Set();
  const taken = new Set(occupied);
  const stacks = new Map();
  const widgets = Array.from(raw, (entry, index) => {
    const where = `${label}, widget ${index + 1}`;
    if (!object(entry) || typeof entry.id !== 'string' || !VALID_ID.test(entry.id) || ids.has(entry.id)) {
      throw new Error(`${where}: missing, invalid or duplicate ID`);
    }
    if (typeof entry.type !== 'string' || !Object.hasOwn(catalog, entry.type)) {
      throw new Error(`${where}: unsupported widget type`);
    }
    ids.add(entry.id);
    const widget = { id: entry.id, type: entry.type, settings: normalizeSettings(entry.settings, entry.type, where) };
    if (entry.stackId !== undefined) {
      if (typeof entry.stackId !== 'string' || !VALID_ID.test(entry.stackId) || !entry.layout) {
        throw new Error(`${where}: a stack needs a valid ID and a placement`);
      }
      widget.stackId = entry.stackId;
    }
    if (entry.tabLabel !== undefined) {
      if (typeof entry.tabLabel !== 'string' || !/^\P{Cc}{1,24}$/u.test(entry.tabLabel.trim())) {
        throw new Error(`${where}: a tab label must contain 1–24 characters`);
      }
      widget.tabLabel = entry.tabLabel.trim();
    }
    if (entry.layout !== undefined) {
      if (!fits(entry.layout, bounds)) throw new Error(`${where}: placement falls outside the grid`);
      const stack = stacks.get(widget.stackId);
      if (stack && !sameWidgetLayout(stack, entry.layout)) throw new Error(`${where}: all tabs of a stack must share one placement`);
      if (!stack && !canPlace(entry.layout, bounds, taken)) throw new Error(`${where}: placement overlaps a key or widget`);
      const { column, row, cols, rows } = entry.layout;
      widget.layout = { column, row, cols, rows };
      if (!stack) {
        cells(widget.layout, bounds.cols).forEach((cell) => taken.add(cell));
        if (widget.stackId) stacks.set(widget.stackId, widget.layout);
      }
    }
    return widget;
  });
  if (grid) {
    for (const widget of widgets) {
      if (widget.layout) continue;
      widget.layout = findPosition(grid, taken, catalog[widget.type].size);
      if (!widget.layout) throw new Error(`${label}: no room to place widget "${widget.id}"`);
      cells(widget.layout, grid.cols).forEach((cell) => taken.add(cell));
    }
  }
  return widgets;
}

module.exports = { normalizeWidgetInstances, BAR_GRID, catalog };
