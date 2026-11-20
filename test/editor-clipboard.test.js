'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { encodeEditorClipboard, decodeEditorClipboard } = require('../src/main/editor-clipboard');
const { captureKeyGroup, placeKeyGroup, findKeyGroupPosition } = require('../src/editor/key-groups');

const key = { id: 'macro', label: 'Macro', action: { type: 'hotkey', keys: 'ctrl+a' } };

test('Lastra clipboard preserves actions and empty slots and distinguishes keys from pages', () => {
  const envelope = encodeEditorClipboard('page', { id: 'test', name: 'Test', keys: [null, key] });
  const page = decodeEditorClipboard('page', envelope);
  assert.equal(page.keys[0], null);
  assert.deepEqual(page.keys[1].action, key.action);
  assert.throws(() => decodeEditorClipboard('key', envelope), /a key/);
  assert.deepEqual(decodeEditorClipboard('key', encodeEditorClipboard('key', key)).action, key.action);
});

test('rejects unrelated or malformed clipboard content', () => {
  assert.throws(() => decodeEditorClipboard('key', 'plain text'), /Copy a key/);
  assert.throws(() => encodeEditorClipboard('key', { id: 'bad', action: { type: 'unknown' } }), /unknown/);
  assert.throws(() => decodeEditorClipboard('page', 'x'.repeat(140000)), /too large/);
});

test('widget pages carry the source grid so reserved cells validate against the correct row width', () => {
  const grid = { cols: 4, rows: 2 };
  const widget = { id: 'cpu', type: 'system-metric', settings: { metric: 'cpu', shape: 'graph' },
    layout: { column: 0, row: 1, cols: 2, rows: 1 } };
  const page = { id: 'test', name: 'Test', grid, keys: [null, null, null, null, null, null, key], widgets: [widget] };
  const saved = decodeEditorClipboard('page', encodeEditorClipboard('page', page));
  assert.deepEqual(saved.grid, grid);
  assert.deepEqual(saved.widgets, [widget]);
  assert.equal(saved.keys[6].label, key.label);
  assert.throws(() => encodeEditorClipboard('page', { ...page, keys: [null, null, null, null, key] }), /overlaps/);
});

test('a key group retains relative position, spans and actions across different grid widths', () => {
  const tall = { ...key, id: 'tall', span: { cols: 1, rows: 2 } };
  const wide = { ...key, id: 'wide', span: { cols: 2, rows: 1 }, hold: { type: 'delay', ms: 100 } };
  const keys = [];
  keys[6] = wide;
  keys[13] = tall;
  const group = captureKeyGroup(keys, { cols: 5, rows: 4 }, new Set([13, 6]));
  assert.deepEqual(group.grid, { cols: 3, rows: 3 });
  const saved = decodeEditorClipboard('group', encodeEditorClipboard('group', group));
  const destination = { cols: 4, rows: 3 };
  const placements = placeKeyGroup(saved, destination, new Set([2, 4]), 0);
  assert.deepEqual(placements.map(({ index }) => index), [0, 6]);
  assert.deepEqual(placements[0].key.hold, wide.hold);
  assert.deepEqual(placements[1].key.span, tall.span);
  assert.equal(placeKeyGroup(saved, destination, new Set([1]), 0), null);
  assert.equal(placeKeyGroup(saved, destination, new Set([10]), 0), null);
  assert.equal(placeKeyGroup(saved, destination, new Set(), 2), null);
});

test('duplicate search preserves the layout and group clipboard checks content types and overlaps', () => {
  const group = { grid: { cols: 3, rows: 1 }, keys: [{ ...key, span: { cols: 2, rows: 1 } }, null, { ...key, id: 'second' }] };
  const placed = findKeyGroupPosition(group, { cols: 4, rows: 2 }, new Set([0, 1, 2, 4]));
  assert.deepEqual(placed.map(({ index }) => index), [5, 7]);
  assert.equal(findKeyGroupPosition(group, { cols: 2, rows: 1 }, new Set()), null);
  assert.throws(() => encodeEditorClipboard('group', { ...group, keys: [null, null] }), /Invalid Lastra clipboard/);
  assert.throws(() => encodeEditorClipboard('group', { ...group, keys: [group.keys[0], group.keys[2]] }), /overlaps/);
  assert.throws(() => decodeEditorClipboard('group', encodeEditorClipboard('key', key)), /Copy a key group/);
});
