'use strict';

{
  const { canPlace, cells, catalog } = typeof module === 'object' ? require('./widget-layout') : window.LastraWidgetLayout;
  const LIMIT = 6;
  const VALID_ID = /^[a-z0-9_-]{1,48}$/i;
  const PARTS = { text: 'Text', icon: 'Icon', gauge: 'Gauge', graph: 'Graph' };
  const ICONS = { activity: 'Activity', cpu: 'Processor', database: 'Storage', gauge: 'Gauge',
    'hard-drive': 'Drive', 'memory-stick': 'Memory', 'network': 'Network', thermometer: 'Temperature' };
  const METRICS = catalog['system-metric'].fields.metric.choices;
  const DEFAULT_COMPOSITION = {
    name: 'System overview',
    grid: { cols: 2, rows: 1 },
    parts: [
      { id: 'title', type: 'text', text: 'System', layout: { column: 0, row: 0, cols: 1, rows: 1 } },
      { id: 'cpu', type: 'gauge', metric: 'cpu', layout: { column: 1, row: 0, cols: 1, rows: 1 } },
    ],
  };

  function normalizeComposition(value, label = 'Composition') {
    if (!value || typeof value !== 'object' || typeof value.name !== 'string' || !value.name.trim()
        || value.name.trim().length > 40) throw new Error(`${label} needs a name of 1–40 characters.`);
    const { cols, rows } = value.grid ?? {};
    if (![cols, rows].every((size) => Number.isInteger(size) && size >= 1 && size <= LIMIT)) {
      throw new Error(`${label} needs 1–${LIMIT} columns and rows.`);
    }
    const grid = { cols, rows };
    if (!Array.isArray(value.parts) || value.parts.length > cols * rows) throw new Error(`${label} has too many parts for its grid.`);
    const occupied = new Set();
    const ids = new Set();
    const parts = value.parts.map((part, index) => {
      const where = `${label}, part ${index + 1}`;
      if (!part || typeof part.id !== 'string' || !VALID_ID.test(part.id) || ids.has(part.id) || !Object.hasOwn(PARTS, part.type)) {
        throw new Error(`${where} needs a unique ID and supported type.`);
      }
      if (!canPlace(part.layout, grid, occupied)) throw new Error(`${where} overlaps another part or extends past the grid.`);
      ids.add(part.id);
      const { column, row, cols, rows } = part.layout;
      const layout = { column, row, cols, rows };
      for (const cell of cells(layout, grid.cols)) occupied.add(cell);
      const normalized = { id: part.id, type: part.type, layout };
      if (part.type === 'text') {
        if (typeof part.text !== 'string' || !part.text.trim() || part.text.length > 100) throw new Error(`${where} needs 1–100 characters of text.`);
        return { ...normalized, text: part.text };
      }
      if (part.type === 'icon') {
        if (!Object.hasOwn(ICONS, part.icon)) throw new Error(`${where} needs a supported icon.`);
        return { ...normalized, icon: part.icon };
      }
      if (!Object.hasOwn(METRICS, part.metric)) throw new Error(`${where} needs a supported sensor.`);
      return { ...normalized, metric: part.metric };
    });
    return { name: value.name.trim(), grid, parts };
  }

  function normalizeCompositionPresets(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error('Widget presets must be an array.');
    const ids = new Set();
    return value.map((preset) => {
      if (!preset || typeof preset.id !== 'string' || !VALID_ID.test(preset.id) || ids.has(preset.id)) {
        throw new Error('Widget presets need unique IDs.');
      }
      const { cols, rows } = preset.size ?? {};
      if (!Number.isInteger(cols) || cols < 1 || cols > 12 || !Number.isInteger(rows) || rows < 1 || rows > 6) {
        throw new Error('Widget presets need a valid tile size.');
      }
      ids.add(preset.id);
      return { id: preset.id, size: { cols, rows }, composition: normalizeComposition(preset.composition, 'Widget preset') };
    });
  }

  function compositionMetrics(composition) {
    return [...new Set(composition.parts.map(({ metric }) => metric).filter(Boolean))];
  }

  function compositionIcons(composition) {
    return [...new Set(composition.parts.map(({ icon }) => icon).filter(Boolean))];
  }

  const api = { LIMIT, PARTS, ICONS, METRICS, DEFAULT_COMPOSITION, normalizeComposition, normalizeCompositionPresets,
    compositionMetrics, compositionIcons };
  if (typeof module === 'object') module.exports = api;
  else window.LastraWidgetComposition = api;
}
