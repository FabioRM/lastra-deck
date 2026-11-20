'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { DeckShortcuts, normalizeChord, stepDestination } = require('../src/main/deck-shortcuts');
const { tempDir } = require('./helpers/temp-dir');

test('global chords normalize aliases, key names, modifier order, and clearing', () => {
  assert.equal(normalizeChord(' alt + CONTROL + right '), 'Ctrl+Alt+Right');
  assert.equal(normalizeChord('Win+Shift+f24'), 'Shift+Super+F24');
  assert.equal(normalizeChord('F12'), 'F12');
  assert.equal(normalizeChord(' '), '');
  for (const value of ['A', 'F25', 'Ctrl+Ctrl+A', 'Alt+', 'Ctrl+Unknown', null]) {
    assert.throws(() => normalizeChord(value));
  }
});

test('conflicted rows keep other global shortcuts registered and retry independently', (t) => {
  const file = path.join(tempDir(t, 'lastra-deck-shortcuts-'), 'shortcuts.json');
  const active = new Map();
  const calls = [];
  const blocked = new Set(['Ctrl+F11']);
  const shortcuts = {
    register(chord, callback) {
      if (blocked.has(chord) || active.has(chord)) return false;
      active.set(chord, callback);
      return true;
    },
    unregister(chord) { active.delete(chord); },
  };
  let paused = false;
  const options = { file, shortcuts, run: (...args) => calls.push(args),
    unavailable: (command) => paused && command === 'next' ? 'Paused' : undefined };
  const first = new DeckShortcuts(options);
  const status = (rows, command) => rows.find((row) => row.command === command).status;
  first.set('next', { chord: 'Ctrl+F10' });
  const stale = active.get('Ctrl+F10');
  assert.equal(status(first.set('previous', { chord: 'Ctrl+F11' }), 'previous'), 'Unavailable or already in use');
  assert.equal(status(first.set('view', { chord: 'F10', target: 'stats' }), 'view'), 'Active');
  assert.equal(status(first.set('back', { chord: 'control+f10' }), 'back'), 'Also assigned to Next page');
  assert.throws(() => first.set('view', { chord: 'F12', target: 'missing' }), /Choose a deck view/);
  assert.deepEqual([...active.keys()], ['Ctrl+F10', 'F10']);
  stale();
  paused = true;
  stale();
  assert.equal(calls.length, 1);
  assert.equal(status(first.sync(), 'next'), 'Paused');
  assert.deepEqual([...active.keys()], ['F10']);
  paused = false;
  blocked.clear();
  assert.equal(status(first.sync(), 'previous'), 'Active');
  active.get('F10')();
  assert.deepEqual(calls.at(-1), ['view', { chord: 'F10', target: 'stats' }]);
  first.set('next', { chord: '' });
  assert.equal(status(first.sync(), 'back'), 'Active');
  first.close();
  assert.equal(active.size, 0);
  const reopened = new DeckShortcuts(options);
  assert.equal(status(reopened.sync(), 'next'), 'Unassigned');
  assert.equal(status(reopened.sync(), 'previous'), 'Active');
  reopened.close();
});

test('next and previous step across sheets, saved pages, and automatic pages', () => {
  const pages = [{ id: 'home' }, { id: 'work' }];
  assert.deepEqual(stepDestination(pages, 'home', 'home', 0, 3, 1), { sheet: 1 });
  assert.deepEqual(stepDestination(pages, 'home', 'home', 2, 3, -1), { sheet: 1 });
  assert.deepEqual(stepDestination(pages, 'home', 'home', 2, 3, 1), { page: 'work' });
  assert.deepEqual(stepDestination(pages, 'work', 'work', 0, 3, -1), { page: 'home' });
  assert.deepEqual(stepDestination(pages, 'auto:editor', 'work', 0, 1, 1), { page: 'work' });
  assert.deepEqual(stepDestination(pages, 'home', 'home', 0, 3, -1), { page: undefined });
});
