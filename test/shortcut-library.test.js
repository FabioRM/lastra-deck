'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { captureShortcut, shortcutRows, filterShortcutRows, withShortcutOverride } = require('../src/shared/shortcut-library');
const { catalog } = require('../src/main/shortcut-catalog');
const { packs, packKeys, previewPacks } = require('../src/main/shortcut-packs');
const { US_LAYOUT } = require('../src/main/shortcut-guards');
const { normalizeOverrideChord } = require('../src/main/shortcut-overrides');
const { validateProfile, ProfileStore } = require('../src/main/profile');
const { Pages } = require('../src/main/pages');
const { fixedEditingKeys } = require('../src/main/fixed-editing-keys');
const { chromiumWebAppId } = require('../src/main/shortcut-packs-web');
const { tempDir } = require('./helpers/temp-dir');

const available = (id, language = 'en-US') => previewPacks(language).find((pack) => pack.id === id);

test('search finds aliases and chord spellings within app, context and platform filters', () => {
  const rows = shortcutRows(previewPacks('en-US'));
  const aliases = filterShortcutRows(rows, { query: 'omnibox', app: 'chrome', platform: 'windows', context: 'address bar' });
  assert.deepEqual(aliases.map(({ key }) => key.id), ['address']);
  assert.match(aliases[0].key.binding.source, /support\.google\.com/);
  const chords = filterShortcutRows(rows, { app: 'chrome', query: 'Control + Page Up' });
  assert.ok(chords.some(({ key }) => key.id === 'previous-tab'));
  const localRow = available('chrome').keys.find(({ id }) => id === 'new-tab');
  const overrides = { [localRow.overrideId]: 'Ctrl+Alt+N' };
  assert.equal(filterShortcutRows(rows, { app: 'chrome', query: 'Ctrl+Alt+N', overrides })[0].key.reviewedNotation, 'Ctrl+T');
  assert.ok(filterShortcutRows(rows, { app: 'chrome', query: 'Ctrl+T', overrides }).some(({ key }) => key.shortcutOverride));
  const webCopy = filterShortcutRows(rows, { app: 'gdocs', context: 'editing', platform: 'web', query: 'clipboard' });
  assert.ok(webCopy.some(({ key }) => key.binding?.id === 'copy'));
  assert.deepEqual(filterShortcutRows(rows, { app: 'gdocs', platform: 'windows' }), []);
});

test('captures Windows chord notation and refuses invalid or unsupported override input', () => {
  assert.equal(captureShortcut({ key: 'f', code: 'KeyF', ctrlKey: true, altKey: true }), 'Ctrl+Alt+F');
  assert.equal(captureShortcut({ key: '+', code: 'Equal', ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+char:plus');
  assert.equal(captureShortcut({ key: '/', code: 'NumpadDivide', ctrlKey: true }), 'Ctrl+Divide');
  assert.equal(captureShortcut({ key: '@', altKey: true, getModifierState: () => true }), null);
  assert.equal(captureShortcut({ key: 'Control', ctrlKey: true }), null);
  assert.equal(normalizeOverrideChord(' Ctrl+Shift+char:plus '), 'Ctrl+Shift+char:plus');
  assert.throws(() => normalizeOverrideChord('Ctrl+Control+F'), /repeat/);
  assert.throws(() => normalizeOverrideChord('Ctrl+Alt'), /Add a key/);
  assert.throws(() => normalizeOverrideChord('Ctrl+K then Ctrl+S'), /Unknown key|Invalid key/);
  assert.throws(() => validateProfile({ keys: [], shortcutOverrides: { 'other-window': 'Ctrl+F' } }), /override ID/);
});

test('retains scoped guards and confirmation when applying a local override', () => {
  const excel = available('excel').keys.find(({ id }) => id === 'next-sheet');
  const profile = { shortcutLanguage: 'en-US', shortcutOverrides: { [excel.overrideId]: 'Shift+Delete' } };
  const overridden = withShortcutOverride(excel, profile.shortcutOverrides);
  assert.equal(overridden.confirm, true);
  assert.deepEqual(overridden.action.shortcutGuard, { ...excel.action.shortcutGuard, confirm: true });
  const excelPack = packs.find(({ id }) => id === 'excel');
  const ready = packKeys(excelPack, { ...profile, mode: 'an Excel worksheet', keyboardLayout: US_LAYOUT });
  assert.equal(ready.find(({ id }) => id === excel.id).action.keys, 'Shift+Delete');
  const blocked = packKeys(excelPack, { ...profile, mode: 'an Excel worksheet', keyboardLayout: 0x04100410 });
  assert.match(blocked.find(({ id }) => id === excel.id).unavailable, /US keyboard layout/);
  const ambiguous = available('excel', 'it-IT').keys.find(({ binding }) => binding?.id === 'copy' && binding.language === 'it-IT');
  assert.match(ambiguous.unavailable, /ambiguous|Copy and Italic/i);
  assert.equal(ambiguous.overrideId, undefined);
});

test('profile override survives a catalog chord revision, with existing page actions unchanged', (t) => {
  const chrome = catalog.apps.find(({ id }) => id === 'chrome');
  const binding = chrome.bindings.find(({ id }) => id === 'new-tab');
  const previous = { ...binding };
  t.after(() => Object.assign(binding, previous));
  const directory = tempDir(t, 'lastra-shortcut-profile-');
  const file = path.join(directory, 'profile.json');
  const defaultFile = path.join(directory, 'default.json');
  const savedKey = { id: 'personal-key', category: 'app', label: 'My saved hotkey', action: { type: 'hotkey', keys: 'Ctrl+T' } };
  fs.writeFileSync(defaultFile, JSON.stringify({ pages: [{ id: 'home', keys: [savedKey] }] }));
  const store = new ProfileStore({ file, defaultFile });
  const initial = store.load();
  assert.equal(initial.shortcutOverrides, undefined);
  const newTab = available('chrome').keys.find(({ id }) => id === 'new-tab');
  const shortcutOverrides = { [newTab.overrideId]: 'Ctrl+Alt+N' };
  store.save({ ...initial, shortcutOverrides }, store.editorSnapshot().token);
  const restored = new ProfileStore({ file, defaultFile }).load();
  assert.deepEqual(restored.shortcutOverrides, shortcutOverrides);

  binding.chord = binding.notation = 'Ctrl+Shift+F8';
  binding.bindingId = 'acfacedfeedabba20026';
  const revised = available('chrome').keys.find((key) => key.binding?.bindingId === binding.bindingId);
  assert.equal(revised.overrideId, newTab.overrideId);
  assert.equal(withShortcutOverride(revised, restored.shortcutOverrides).action.keys, 'Ctrl+Alt+N');
  const pages = new Pages();
  pages.observe({ executable: 'chrome.exe', keyboardLayout: US_LAYOUT, windowId: 1n });
  assert.equal(pages.current(restored).keys.find(({ id }) => id === 'new-tab').action.keys, 'Ctrl+Alt+N');
  assert.deepEqual(restored.pages[0].keys, [savedKey]);
  assert.equal(pages.current(initial).keys.find(({ id }) => id === 'new-tab').action.keys, 'Ctrl+T');
  store.save({ ...restored, shortcutOverrides: {} }, store.editorSnapshot().token);
  assert.equal(store.editorSnapshot().profile.shortcutOverrides, undefined);
});

test('a local editing chord stays scoped to the verified web editor window', () => {
  const copy = available('gdocs').keys.find(({ binding }) => binding?.id === 'copy');
  const shortcutOverrides = { [copy.overrideId]: 'Ctrl+Alt+C' };
  const settings = { shortcutOverrides };
  const appId = 'Chrome._crx_' + chromiumWebAppId('https://docs.google.com/document/');
  const context = { executable: 'chrome.exe', appId, windowId: 1n, mode: 'the Google Docs document editor' };
  const resolveCopy = (target) => fixedEditingKeys(settings, target, { platform: 'win32' }).find(({ id }) => id === 'edit:copy');
  assert.equal(resolveCopy(context).action.keys, 'Ctrl+Alt+C');
  assert.equal(resolveCopy({ ...context, mode: undefined }).action, undefined);
  assert.equal(resolveCopy({ ...context, appId: undefined }).action.keys, 'Ctrl+C');
});
