'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { projectEditingPage, projectShortcutPages, FIXED_EDITING_KEYS } = require('../src/shared/editing-keys');
const { cells } = require('../src/shared/widget-layout');

test('the default grid has 19 ordinary cells and five fixed cells inside the original 8×3 grid', () => {
  const view = projectEditingPage({ cols: 8, rows: 3 }, [], [], false);
  assert.equal(view.cols, 8);
  assert.equal(view.rows, 3);
  assert.equal(view.sheets[0].keys.length, 19);
  assert.deepEqual(FIXED_EDITING_KEYS.map(({ label }) => label), ['Cut', 'Copy', 'Paste', 'Undo', 'Redo']);
  assert.deepEqual(view.editing.map(({ layout }) => [layout.row, layout.column]), [[2, 3], [2, 4], [2, 5], [2, 6], [2, 7]]);
});

test('a full page keeps every authored key reachable through projected pages', () => {
  const grid = { cols: 8, rows: 3 };
  const slots = Array.from({ length: 24 }, (_, index) => ({ id: 'original-' + index }));
  for (const portrait of [false, true]) {
    const view = projectEditingPage(grid, slots, [], portrait);
    assert.equal(view.normal, 19);
    assert.equal(view.sheets.length, 2);
    const stored = view.sheets.flatMap(({ keys }) => keys.map(({ index }) => index).filter((index) => index !== null));
    assert.deepEqual(stored, slots.map((_, index) => index));
    assert.ok(view.editing.every(({ layout }) => layout.row === view.rows - 1));
    for (const sheet of view.sheets) {
      const occupied = [...sheet.keys, ...view.editing].flatMap(({ layout }) => cells(layout, view.cols));
      assert.equal(occupied.length, 24);
      assert.equal(new Set(occupied).size, occupied.length);
    }
  }
});

test('compact and wide widget layouts preserve action and widget data during projection', () => {
  const compact = projectEditingPage({ cols: 1, rows: 1 }, [{ id: 'only-key' }], [], false);
  assert.equal(compact.cols, 5);
  assert.equal(compact.sheets[0].keys[0].index, 0);
  assert.deepEqual(compact.editing.flatMap(({ layout }) => cells(layout, compact.cols)), [5, 6, 7, 8, 9]);
  const widget = { id: 'wide', settings: { device: 'output' }, layout: { column: 0, row: 0, cols: 4, rows: 2 } };
  const view = projectEditingPage({ cols: 4, rows: 2 }, [], [widget], false);
  assert.deepEqual(view.sheets[0].widgets[0].settings, widget.settings);
  assert.deepEqual(widget.layout, { column: 0, row: 0, cols: 4, rows: 2 });
  assert.equal(view.sheets[0].widgets[0].layout.cols, 3);
});

test('large keys keep authored, packed, and fixed keys reachable in both orientations', () => {
  const grid = { cols: 8, rows: 3 };
  const slots = Array.from({ length: 24 }, (_, index) => index < 4 ? null
    : { id: 'key-' + index, group: index < 12 ? 'editing' : 'navigation' });
  const layouts = [
    { portrait: false, cols: 5, rows: 2, capacity: 5 },
    { portrait: true, cols: 3, rows: 5, capacity: 10 },
  ];
  const widgets = ['cpu', 'media'].map((id) => ({ id, stackId: 'stack', layout: { column: 0, row: 0, cols: 4, rows: 1 } }));
  for (const { portrait, cols, rows, capacity } of layouts) {
    const page = projectEditingPage(grid, slots, widgets, portrait, true);
    const shortcuts = projectShortcutPages(grid, slots, portrait, true);
    assert.deepEqual({ cols: page.cols, rows: page.rows, capacity: page.normal }, { cols, rows, capacity });
    assert.deepEqual(page.sheets.find(({ widgets }) => widgets.length).widgets.map(({ id }) => id), ['cpu', 'media']);
    assert.deepEqual(shortcuts.sheets.map(({ keys }) => keys.filter(({ index }) => index !== null).length),
      Array(20 / capacity).fill(capacity));
    for (const view of [page, shortcuts]) {
      assert.deepEqual(view.editing.map(({ id }) => id), FIXED_EDITING_KEYS.map(({ id }) => id));
      const indices = view.sheets.flatMap(({ keys }) => keys.map(({ index }) => index).filter((index) => index !== null));
      assert.deepEqual(indices, slots.flatMap((key, index) => key ? [index] : []));
      for (const sheet of view.sheets) {
        const occupied = [...sheet.keys, ...view.editing, ...sheet.widgets.slice(0, 1)].flatMap(({ layout }) => cells(layout, cols));
        assert.equal(occupied.length, cols * rows);
        assert.equal(new Set(occupied).size, occupied.length);
      }
    }
  }
});

test('sparse and named pages compact regular shortcuts while keeping the same final five cells', () => {
  const grid = { cols: 8, rows: 3 };
  const slots = Array.from({ length: 28 }, (_, index) => index < 3 || index === 7 ? null : {
    id: 'key-' + index, ...(index === 6 ? { unavailable: 'Requires a different mode.' } : {}),
    shortcutPage: index < 27 ? 'first' : 'second',
  });
  for (const portrait of [false, true]) {
    for (const largeKeys of [false, true]) {
      const manual = projectEditingPage(grid, slots.slice(0, 24), [], portrait, largeKeys);
      const named = projectShortcutPages(grid, slots, portrait, largeKeys,
        [{ id: 'first', name: 'First' }, { id: 'second', name: 'Second' }]);
      assert.equal(named.sheets.at(-1).group, 'Second');
      for (const view of [manual, named]) {
        const firstEditingCell = view.rows * view.cols - 5;
        assert.deepEqual(view.editing.map(({ id }) => id), ['edit:cut', 'edit:copy', 'edit:paste', 'edit:undo', 'edit:redo']);
        assert.deepEqual(view.editing.flatMap(({ layout }) => cells(layout, view.cols)),
          [0, 1, 2, 3, 4].map((offset) => firstEditingCell + offset));
        for (const sheet of view.sheets) {
          const used = sheet.keys.filter(({ index }) => index !== null);
          assert.deepEqual(used.flatMap(({ layout }) => cells(layout, view.cols)), used.map((_, index) => index));
          assert.ok(sheet.keys.every(({ layout }) => cells(layout, view.cols)[0] < firstEditingCell));
        }
        const keys = view === manual ? slots.slice(0, 24) : slots;
        assert.deepEqual(view.sheets.flatMap(({ keys }) => keys.flatMap(({ index }) => index === null ? [] : [index])),
          keys.flatMap((key, index) => key ? [index] : []));
      }
    }
  }
});
