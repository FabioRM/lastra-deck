'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { DeckPageLists } = require('../src/main/deck-page-lists');
const { validateProfile } = require('../src/main/profile');
const { decodeExchange, encodeExchange, prepareExchange } = require('../src/main/profile-exchange');
const { tempDir } = require('./helpers/temp-dir');

const pages = ['home', 'research', 'planning', 'chat', 'files', 'status', 'tools', 'notes'].map((id) => ({ id }));

test('nested page folders survive profile and page exchange without changing page IDs', () => {
  const source = { pages: [{ id: 'home', keys: [] }, { id: 'edit', folder: [' Work ', 'Montage'], keys: [] }] };
  const valid = validateProfile(source);
  assert.equal(valid.pages[0].folder, undefined);
  assert.deepEqual(valid.pages[1].folder, ['Work', 'Montage']);
  for (const kind of ['profile', 'page']) {
    const { bundle } = prepareExchange(kind, source, 'edit');
    const { item } = decodeExchange(encodeExchange(bundle).text).bundle;
    const page = kind === 'profile' ? item.pages[1] : item;
    assert.equal(page.id, 'edit');
    assert.deepEqual(page.folder, ['Work', 'Montage']);
  }
  for (const folder of ['Work/Editing', [''], ['Work/Editing'], ['Work\\Editing'], ['\u0007'], ['X'.repeat(33)], ['1', '2', '3', '4', '5']]) {
    assert.throws(() => validateProfile({ pages: [{ id: 'edit', keys: [], folder }] }), /folder names/);
  }
});

function fixture(t) {
  const directory = tempDir(t, 'lastra-page-lists-');
  return path.join(directory, 'pages.json');
}

test('favorites and bounded recent manually opened pages persist separately for each activity', (t) => {
  const file = fixture(t);
  const prefs = new DeckPageLists(file);
  for (const { id } of pages) assert.equal(prefs.visit('main', id, pages), true);
  assert.equal(prefs.visit('main', 'notes', pages), false);
  assert.equal(prefs.visit('main', 'planning', pages), true);
  prefs.favorite('main', 'research', true, pages);
  prefs.favorite('main', 'notes', true, pages);
  prefs.favorite('work', 'home', true, pages);
  const loaded = new DeckPageLists(file);
  assert.deepEqual(loaded.snapshot('main', pages), { favorites: ['research', 'notes'], recent: ['planning', 'notes', 'tools', 'status', 'files', 'chat'] });
  assert.deepEqual(loaded.snapshot('work', pages), { favorites: ['home'], recent: [] });
  assert.deepEqual(loaded.favorite('main', 'notes', false, pages).favorites, ['research']);
  assert.deepEqual(loaded.snapshot('main', pages.slice(2)).favorites, []);
  assert.throws(() => loaded.favorite('main', 'gone', true, pages), /unavailable/i);
  assert.throws(() => loaded.favorite('main', 'home', 'true', pages), /unavailable/i);
});

test('corrupt settings and removed pages are skipped without selecting a different page', (t) => {
  const file = fixture(t);
  fs.writeFileSync(file, '{broken');
  const messages = [];
  assert.deepEqual(new DeckPageLists(file, (message) => messages.push(message)).snapshot('main', pages), { favorites: [], recent: [] });
  assert.equal(messages.length, 1);
  fs.writeFileSync(file, JSON.stringify({ version: 1, activities: { main: { favorites: ['home', 'home', 'removed', null], recent: ['gone', 'home'] } } }));
  const restored = new DeckPageLists(file);
  assert.deepEqual(restored.snapshot('main', pages), { favorites: ['home'], recent: ['home'] });
  assert.deepEqual(restored.snapshot('main', pages.slice(1)), { favorites: [], recent: [] });
});
