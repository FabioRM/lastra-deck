'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { NotesView, normalizeNotes } = require('../src/main/app-view-notes');
const { AppViews } = require('../src/main/app-views');
const { tempDir } = require('./helpers/temp-dir');

const stored = {
  version: 1,
  notes: [{ id: 'notes-1', title: ' Project room ', body: '  A multiline note\r\nSecond line  ' }],
  lists: [{ id: 'list', title: 'At a glance', items: [
    { id: 'task-1', label: 'Prepare docs', done: true },
    { id: 'task-2', label: 'Review draft', done: false },
  ] }],
};

function directory(t) {
  const folder = tempDir(t, 'lastra-notes-');
  return folder;
}

test('the built-in notes app view creates local storage only when a valid draft is saved', async (t) => {
  const folder = directory(t);
  const file = path.join(folder, 'notes.json');
  const views = new AppViews(path.join(folder, 'app-views.json'), { providers: { notes: new NotesView(file) } });
  assert.equal(views.snapshot().views.find(({ id }) => id === 'notes').provider, 'notes');
  const fresh = views.data('notes');
  assert.deepEqual(fresh.document, { version: 1, notes: [], lists: [] });
  assert.equal(fs.existsSync(file), false);
  const result = await views.change({ type: 'provider', viewId: 'notes', action: 'save', revision: fresh.revision, document: stored });
  assert.equal(result.ok, true);
  assert.equal(result.snapshot.document.notes[0].title, 'Project room');
  assert.equal(result.snapshot.document.notes[0].body, '  A multiline note\nSecond line  ');
  assert.deepEqual(result.snapshot.document.lists[0].items, stored.lists[0].items);
  assert.deepEqual(new NotesView(file).snapshot(), result.snapshot);
  assert.deepEqual(fs.readdirSync(folder), ['notes.json']);
});

test('invalid and stale drafts cannot replace the existing notes file', (t) => {
  const file = path.join(directory(t), 'notes.json');
  const view = new NotesView(file);
  const { revision: empty } = view.snapshot();
  const result = view.change({ action: 'save', revision: empty, document: stored });
  const saved = fs.readFileSync(file, 'utf8');
  assert.throws(() => view.change({ action: 'save', revision: empty, document: stored }), /changed on disk/);
  const wrong = structuredClone(stored);
  wrong.lists[0].items[0].done = 'yes';
  assert.throws(() => view.change({ action: 'save', revision: result.snapshot.revision, document: wrong }), /completion state/);
  assert.equal(fs.readFileSync(file, 'utf8'), saved);
  fs.writeFileSync(file, 'broken');
  assert.equal(view.snapshot().status, 'unavailable');
  assert.throws(() => view.change({ action: 'save', revision: result.snapshot.revision, document: stored }), /could not be read/i);
  assert.equal(fs.readFileSync(file, 'utf8'), 'broken');
});

test('notes are plain text, and every task has a short label and stable identity', () => {
  const bad = structuredClone(stored);
  bad.lists[0].items[0].id = bad.lists[0].items[1].id;
  assert.throws(() => normalizeNotes(bad), /unique IDs/);
  bad.lists[0].items.pop();
  bad.lists[0].items[0].label = '';
  assert.throws(() => normalizeNotes(bad), /Task is required/);
  const note = { ...stored, notes: [{ id: 'literal', title: '<b>Literal</b>', body: '<script>text</script>' }] };
  assert.deepEqual(normalizeNotes(note).notes, note.notes);
});
