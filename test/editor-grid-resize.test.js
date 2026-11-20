'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { planGridResize } = require('../src/editor/grid-resize');

const oldGrid = { cols: 8, rows: 3 };
const wide = { id: 'subtitle', label: 'Subtitle', span: { cols: 2, rows: 1 } };
const corner = { id: 'record', label: 'Record' };
const widget = { id: 'cpu', type: 'system-metric', settings: { metric: 'cpu', shape: 'graph' },
  layout: { column: 2, row: 1, cols: 2, rows: 1 } };
const page = { id: 'capture', keys: Array(24).fill(null), widgets: [widget] };
page.keys[12] = wide;
page.keys[23] = corner;

test('resize identifies each blocked key and widget and previews only retained items', () => {
  const backup = structuredClone(page);
  const proposal = planGridResize(page, oldGrid, { cols: 5, rows: 2 });
  assert.deepEqual(proposal.keys, []);
  assert.deepEqual(proposal.widgets, [widget]);
  assert.deepEqual(proposal.blocked.map(({ label, kind, layout }) => [label, kind, layout.column, layout.row]), [
    ['Subtitle', 'key', 4, 1], ['Record', 'key', 7, 2],
  ]);
  const narrower = planGridResize(page, oldGrid, { cols: 3, rows: 3 });
  assert.deepEqual(narrower.widgets, []);
  assert.deepEqual(narrower.blocked.map(({ label, kind }) => [label, kind]), [
    ['Subtitle', 'key'], ['Record', 'key'], ['System metric', 'widget'],
  ]);
  assert.deepEqual(page, backup);
});

test('resize preserves dimensions, coordinates, actions and widget settings when they fit', () => {
  const proposal = planGridResize(page, oldGrid, { cols: 10, rows: 4 });
  assert.deepEqual(proposal.blocked, []);
  assert.deepEqual(proposal.widgets, [widget]);
  assert.equal(proposal.keys[14], wide);
  assert.equal(proposal.keys[27], corner);
  assert.equal(proposal.keys[12], null);
  assert.equal(proposal.keys[23], null);
});

test('a conflicting unsaved layout identifies both items and keeps its remaining controls', () => {
  const copy = structuredClone(page);
  copy.widgets.push({ ...widget, id: 'collision', layout: { column: 5, row: 1, cols: 2, rows: 1 } });
  const proposal = planGridResize(copy, oldGrid, oldGrid);
  assert.deepEqual(proposal.blocked.map(({ label, reason }) => [label, reason]), [
    ['Subtitle', 'overlaps another item'], ['System metric', 'overlaps another item'],
  ]);
  assert.deepEqual(proposal.widgets, [copy.widgets[0]]);
  assert.equal(proposal.keys[23].id, corner.id);
});
