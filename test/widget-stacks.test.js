'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizeWidgetInstances } = require('../src/main/widgets');
const { projectEditingPage } = require('../src/shared/editing-keys');
const { projectPage, groupWidgetPlacements, placeWidget } = require('../src/shared/widget-layout');
const { draftLayoutItems, proposeDraftLayout } = require('../src/editor/preview-layout');
const { planGridResize } = require('../src/editor/grid-resize');

const grid = { cols: 8, rows: 3 };
const layout = { column: 5, row: 1, cols: 2, rows: 1 };
const cpu = { id: 'cpu', type: 'system-metric', stackId: 'readings', settings: { metric: 'cpu', shape: 'graph' }, layout };
const media = { id: 'media', type: 'now-playing', stackId: 'readings', tabLabel: 'Player', settings: { appearance: 'expanded' }, layout };

test('only explicit stack members may share the same rectangle', () => {
  const saved = normalizeWidgetInstances([cpu, media], { grid });
  assert.deepEqual(saved, [cpu, media]);
  assert.throws(() => normalizeWidgetInstances([cpu, { ...media, stackId: 'other' }], { grid }), /overlaps/);
  assert.throws(() => normalizeWidgetInstances([cpu, { ...media, layout: { ...layout, column: 6 } }], { grid }), /share one placement/);
  assert.throws(() => normalizeWidgetInstances([{ ...cpu, layout: undefined }], { grid }), /needs a valid ID and a placement/);
  assert.throws(() => normalizeWidgetInstances([cpu, media], { grid, occupied: [13] }), /overlaps/);
});

test('landscape and portrait page projection pack the stack as one item and retain both tab settings', () => {
  const keys = Array(24).fill(null);
  for (const portrait of [false, true]) {
    const view = projectEditingPage(grid, keys, [cpu, media], portrait);
    const [{ widgets }] = view.sheets;
    const groups = groupWidgetPlacements(widgets);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].members.map(({ id, settings }) => ({ id, settings })), [cpu, media].map(({ id, settings }) => ({ id, settings })));
    assert.deepEqual(widgets[0].layout, widgets[1].layout);
    assert.equal(view.sheets.length, 1);
  }
  const preview = projectPage(grid, keys, [cpu, media], 5);
  assert.equal(preview.widgets.length, 2);
  assert.deepEqual(preview.widgets[0].layout, preview.widgets[1].layout);
});

test('draft layout moves and grid resizing assess the whole stack once', () => {
  const page = { keys: [], widgets: [cpu, media] };
  const [target] = draftLayoutItems(page, grid);
  assert.equal(draftLayoutItems(page, grid).length, 1);
  const move = proposeDraftLayout(page, grid, target, false, -2, 0);
  assert.deepEqual(move.widgets.map(({ layout }) => layout.column), [3, 3]);
  assert.equal(page.widgets[0].layout.column, 5);
  assert.deepEqual(planGridResize(page, grid, grid).widgets, [cpu, media]);
  const blocked = planGridResize(page, grid, { cols: 6, rows: 3 }).blocked;
  assert.equal(blocked.length, 1);
  assert.match(blocked[0].label, /CPU load, Player/);
});

test('create, retitle and detach a tab without changing member settings', () => {
  const standalone = { ...cpu };
  delete standalone.stackId;
  const stacked = placeWidget([standalone], media, standalone, () => 'joined');
  assert.deepEqual(stacked.map(({ stackId }) => stackId), ['joined', 'joined']);
  const renamed = placeWidget(stacked, { ...stacked[0], tabLabel: 'CPU graph' }, stacked[1]);
  assert.deepEqual(renamed.map(({ id }) => id), ['cpu', 'media']);
  const detached = placeWidget(renamed, { ...renamed[1], layout: { ...layout, column: 3 } }, undefined);
  assert.ok(detached.every(({ stackId }) => stackId === undefined));
  assert.deepEqual(detached.map(({ settings }) => settings), [cpu.settings, media.settings]);
  assert.equal(detached[0].tabLabel, 'CPU graph');
});
