'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EditorHistory } = require('../src/editor/history');

const state = (text, selected = 0, pageId = 'home') => ({ text, pageId, selected });

test('undo and redo restore the document and its page and slot selection', () => {
  const history = new EditorHistory();
  const saved = state('before', 3);
  const next = state('after', 0, 'new-page');
  history.reset(saved.text);
  history.record(saved, next);
  assert.equal(history.isDirty(next.text), true);
  assert.deepEqual(history.undo(), saved);
  assert.equal(history.isDirty(saved.text), false);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, true);
  assert.deepEqual(history.redo(), next);
  assert.equal(history.canRedo, false);
});

test('consecutive typing groups by field and pauses create new undo steps', () => {
  const history = new EditorHistory();
  const field = {};
  history.reset('A');
  history.record(state('A'), state('AB'), field, 100);
  history.record(state('AB'), state('ABC'), field, 300);
  history.record(state('ABC'), state('ABCD'), field, 1500);
  history.endGroup();
  history.record(state('ABCD'), state('ABCDE'), field, 1600);
  assert.equal(history.undo().text, 'ABCD');
  assert.equal(history.undo().text, 'ABC');
  assert.equal(history.undo().text, 'A');
  assert.equal(history.canUndo, false);
});

test('a no-op preserves redo and a new edit clears it', () => {
  const history = new EditorHistory();
  history.reset('A');
  history.record(state('A'), state('AB'));
  history.undo();
  assert.equal(history.record(state('A'), state('A', 2)), false);
  assert.equal(history.canRedo, true);
  history.record(state('A'), state('AC'));
  assert.equal(history.canRedo, false);
});

test('typing and deleting within a group leaves no edit', () => {
  const history = new EditorHistory();
  const field = {};
  history.reset('A');
  history.record(state('A'), state('AB'), field, 100);
  history.record(state('AB'), state('A'), field, 200);
  assert.equal(history.canUndo, false);
  assert.equal(history.isDirty('A'), false);
});

test('saving keeps undo and redo around the normalized saved version', () => {
  const history = new EditorHistory();
  history.reset('A');
  history.record(state('A'), state('B'));
  history.record(state('B'), state('C'));
  const unsaved = history.undo();
  history.markSaved(unsaved, state('b'));
  assert.equal(history.isDirty('b'), false);
  assert.equal(history.redo().text, 'C');
  assert.equal(history.undo().text, 'b');
  assert.equal(history.undo().text, 'A');
  assert.equal(history.isDirty('A'), true);
  assert.equal(history.redo().text, 'b');
  history.reset('Reloaded');
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
  assert.equal(history.isDirty('Reloaded'), false);
});

test('history retains only the most recent edits up to its limit', () => {
  const history = new EditorHistory(2);
  history.record(state('A'), state('B'));
  history.record(state('B'), state('C'));
  history.record(state('C'), state('D'));
  assert.equal(history.undo().text, 'C');
  assert.equal(history.undo().text, 'B');
  assert.equal(history.undo(), null);
});
