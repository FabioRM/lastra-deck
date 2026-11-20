'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AppViews } = require('../src/main/app-views');
const { normalizeCustomViews, matchesCustomApp } = require('../src/main/custom-app-views');
const { writeAtomic } = require('../src/main/write-atomic');
const { tempDir } = require('./helpers/temp-dir');

const docsView = {
  id: 'docs', name: 'MDN', match: { executable: 'chrome.exe', titleContains: 'MDN Web Docs' },
  url: 'https://developer.mozilla.org/', shortcuts: [{ id: 'search', label: 'Find in page', keys: 'Ctrl+F' }],
  widgets: [{ id: 'media', type: 'now-playing' }],
};
const config = (...views) => ({ version: 1, views });
const docsWindow = { executable: 'chrome.exe', title: 'MDN Web Docs - Google Chrome', id: '22:3002' };
const otherWindow = { executable: 'chrome.exe', title: 'Another page - Google Chrome', id: '23:3004' };

function watchUpdates() {
  let listener;
  return {
    onUpdate: (state) => listener?.(state),
    next: () => new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        listener = null;
        reject(new Error('Timed out waiting for an app views update'));
      }, 2500);
      listener = (state) => {
        listener = null;
        clearTimeout(timer);
        resolve(state);
      };
    }),
  };
}

test('custom app views support exact executable and app identities with optional literal title text', () => {
  const [docs, editor, photos] = normalizeCustomViews(config(
    docsView,
    { id: 'editor', name: 'My Editor', icon: 'code', match: { executable: 'D:\\Tools\\Editor.exe' } },
    { id: 'photo', name: 'Photos', match: { appId: 'Vendor.Photos_abc!App' } },
  ));
  assert.equal(matchesCustomApp(docs.match, docsWindow), true);
  assert.equal(matchesCustomApp(docs.match, otherWindow), false);
  assert.equal(matchesCustomApp(docs.match, { ...docsWindow, executable: 'msedge.exe' }), false);
  assert.equal(matchesCustomApp(editor.match, { executable: 'editor.exe', path: 'd:\\other\\editor.exe' }), false);
  assert.equal(matchesCustomApp(editor.match, { executable: 'editor.exe', path: 'd:\\tools\\editor.exe' }), true);
  assert.equal(matchesCustomApp(photos.match, { appId: 'vendor.photos_abc!app' }), true);
  assert.deepEqual(docs.widgets[0].layout, { column: 0, row: 0, cols: 2, rows: 1 });
  assert.equal(docs.commands[0].action.target, 'https://developer.mozilla.org/');
  assert.equal(editor.commands[0].action.target, 'D:\\Tools\\Editor.exe');
  assert.deepEqual(photos.commands[0].action.args, ['shell:AppsFolder\\Vendor.Photos_abc!App']);

  const [noUrl] = normalizeCustomViews(config({ ...docsView, url: undefined }));
  assert.deepEqual(noUrl.commands.map(({ id }) => id), ['search']);
});

test('custom definitions reject unsafe or ambiguous matches, misplaced widgets and invalid shortcuts', () => {
  assert.throws(() => normalizeCustomViews(config(docsView), ['docs']), /unique lowercase ID/);
  assert.throws(() => normalizeCustomViews(config({ ...docsView, url: 'file:///C:/Windows/notepad.exe' })), /HTTP or HTTPS/);
  assert.throws(() => normalizeCustomViews(config({ ...docsView, match: { titleContains: 'MDN' } })), /executable or Windows app ID/);
  assert.throws(() => normalizeCustomViews(config({ ...docsView, match: { executable: '..\\editor.exe' } })), /absolute Windows path/);
  assert.throws(() => normalizeCustomViews(config({ ...docsView, match: { executable: 'editor.exe', hostname: 'example.com' } })), /unsupported field/);
  assert.throws(() => normalizeCustomViews(config({ ...docsView, shortcuts: [{ id: 'x', label: 'Bad', keys: 'Ctrl+DefinitelyNotAKey' }] })), /invalid key combination/);
  assert.throws(() => normalizeCustomViews(config({ ...docsView, shortcuts: [{ id: 'x', label: 'Bad', keys: 'constructor' }] })), /invalid key combination/);
  assert.throws(() => normalizeCustomViews(config({ ...docsView, widgets: [
    { id: 'too-wide', type: 'now-playing', layout: { column: 0, row: 0, cols: 5, rows: 1 } },
  ] })), /falls outside the grid/);
});

test('custom actions recheck the current title and show or select only matching windows', async (t) => {
  let view;
  t.after(() => view?.close());
  const directory = tempDir(t, 'lastra-custom-views-');
  const file = path.join(directory, 'app-views.custom.json');
  fs.writeFileSync(file, JSON.stringify(config(docsView)));
  const calls = [];
  let active = docsWindow;
  let foregroundReads = 0;
  view = new AppViews(path.join(directory, 'app-views.json'), {
    customFile: file,
    run: async (action) => { calls.push(action); return { ok: true }; },
    createWindows: () => ({
      foreground() { foregroundReads++; return active; },
      list: (matches) => [docsWindow, otherWindow].filter(matches),
      focus: (matches, id) => [docsWindow, otherWindow].some((window) => window.id === id && matches(window)),
    }),
  });

  view.observe('chrome.exe');
  assert.equal(foregroundReads, 0);
  await view.change({ type: 'follow', enabled: true });
  assert.equal(view.snapshot().automatic, 'docs');
  assert.equal(view.observe('chrome.exe', false), null);
  active = otherWindow;
  view.observe('chrome.exe', true);
  assert.equal(view.snapshot().automatic, null);
  assert.deepEqual(view.data('docs').windows.map(({ id }) => id), [docsWindow.id]);
  await assert.rejects(view.change({ type: 'window', viewId: 'docs', windowId: otherWindow.id }), /could not switch/);
  assert.equal((await view.change({ type: 'window', viewId: 'docs', windowId: docsWindow.id })).ok, true);
  await assert.rejects(view.change({ type: 'action', viewId: 'docs', actionId: 'search' }), /matching app window/);
  assert.deepEqual(calls, []);
  active = docsWindow;
  assert.equal((await view.change({ type: 'action', viewId: 'docs', actionId: 'search' })).ok, true);
  assert.deepEqual(calls, [{ type: 'hotkey', keys: 'Ctrl+F' }]);
});

test('custom definitions can be created, reloaded and fixed without replacing pins or selection', async (t) => {
  let view;
  t.after(() => view?.close());
  const directory = tempDir(t, 'lastra-custom-settings-');
  const file = path.join(directory, 'app-views.custom.json');
  let opened;
  const events = watchUpdates();
  view = new AppViews(path.join(directory, 'app-views.json'), {
    customFile: file, openConfig: async (value) => { opened = value; return { ok: true }; },
    onUpdate: events.onUpdate,
  });

  const created = events.next();
  assert.deepEqual(await view.change({ type: 'edit-custom' }), { ok: true });
  assert.equal(opened, file);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), config());
  await created;

  const updated = events.next();
  fs.writeFileSync(file, JSON.stringify(config(docsView)));
  assert.ok((await updated).views.some(({ id }) => id === 'docs'));
  await view.change({ type: 'select', viewId: 'docs' });
  await view.change({ type: 'pin', viewId: 'docs', pinned: true });

  const invalid = events.next();
  fs.writeFileSync(file, '{');
  assert.ok((await invalid).customError);
  assert.equal(view.snapshot().selected, 'docs');

  const hidden = events.next();
  fs.writeFileSync(file, JSON.stringify(config()));
  assert.deepEqual((await hidden).pinned, []);
  const restored = events.next();
  fs.writeFileSync(file, JSON.stringify(config(docsView)));
  assert.deepEqual((await restored).pinned, ['docs']);
  assert.equal(view.snapshot().selected, 'docs');
});

test('custom views pick up their first atomic save immediately after startup', async (t) => {
  let view;
  t.after(() => view?.close());
  const directory = tempDir(t, 'lastra-custom-first-save-');
  const file = path.join(directory, 'app-views.custom.json');
  const events = watchUpdates();
  view = new AppViews(path.join(directory, 'app-views.json'), { customFile: file, onUpdate: events.onUpdate });
  assert.equal(view.snapshot().views.some(({ id }) => id === 'docs'), false);
  const received = events.next();
  writeAtomic(file, JSON.stringify(config(docsView)));
  assert.equal((await received).views.some(({ id }) => id === 'docs'), true);
});
