'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { captureKeyGroup, keyGroupMoves, applyKeyAppearance } = require('../src/editor/key-groups');
const { BAR_GRID } = require('../src/shared/widget-layout');

test('move options retain gaps and spans, release selected cells, and avoid other keys and widgets', () => {
  const grid = { cols: 5, rows: 4 };
  const wide = { id: 'wide', span: { cols: 2, rows: 1 } };
  const fixed = { id: 'fixed' };
  const second = { id: 'second', controlId: 'linked' };
  const keys = [wide, null, null, null, fixed, null, second];
  const widgets = [{ layout: { column: 2, row: 1, cols: 1, rows: 1 } }];
  const selected = new Set([0, 6]);
  const group = captureKeyGroup(keys, grid, selected);
  const moves = keyGroupMoves(keys, grid, widgets, selected, group);
  assert.equal(moves.has(0), false);
  assert.equal(moves.has(1), false);
  assert.equal(moves.has(3), false);
  assert.equal(moves.has(4), false);
  assert.deepEqual(moves.get(5), [{ index: 5, key: wide }, { index: 11, key: second }]);
  assert.deepEqual(moves.get(6), undefined);
  assert.deepEqual(moves.get(2), [{ index: 2, key: wide }, { index: 8, key: second }]);
  assert.equal(keys[6], second);
  assert.equal(moves.get(5)[1].key, second);
});

test('the bar can move selected keys into a slot vacated by the same group', () => {
  const keys = [{ id: 'first' }, null, { id: 'second' }, null, null, { id: 'fixed' }];
  const selected = new Set([0, 2]);
  const moves = keyGroupMoves(keys, BAR_GRID, [], selected, captureKeyGroup(keys, BAR_GRID, selected));
  assert.deepEqual([...moves.keys()], [1, 2]);
  assert.deepEqual(moves.get(2), [{ index: 2, key: keys[0] }, { index: 4, key: keys[2] }]);
  assert.deepEqual(keys.map((key) => key?.id), ['first', undefined, 'second', undefined, undefined, 'fixed']);
});

test('style changes leave key identity and control bindings intact, and image updates preserve their fallback icon', () => {
  const action = { type: 'delay', ms: 10 };
  const key = { id: 'same', icon: 'folder', image: 'former-image', iconExpression: { expression: 'future' },
    category: 'media', action };
  applyKeyAppearance(key, { category: 'meeting', asset: { kind: 'image', value: 'embedded-image' } });
  assert.equal(key.category, 'meeting');
  assert.equal(key.icon, 'folder');
  assert.deepEqual(key.iconExpression, { expression: 'future' });
  assert.equal(key.image, 'embedded-image');
  applyKeyAppearance(key, { asset: { kind: 'icon', value: 'sparkles' } });
  assert.equal(key.icon, 'sparkles');
  assert.equal(key.iconExpression, undefined);
  assert.equal(key.image, undefined);
  assert.equal(key.action, action);
  assert.equal(key.id, 'same');

  const linked = { id: 'linked-position', controlId: 'shared', icon: 'folder' };
  applyKeyAppearance(linked, { category: 'system', asset: { kind: 'clear' } });
  assert.deepEqual(linked, { id: 'linked-position', controlId: 'shared', category: 'system' });
});
