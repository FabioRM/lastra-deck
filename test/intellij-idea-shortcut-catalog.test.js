'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const review = require('../profiles/intellij-idea-keymaps.json');
const { intellijApplications } = require('../src/main/shortcut-catalog-intellij');
const { searchCatalog } = require('../src/main/mcp-catalog-search');
const { packFor, packKeys, previewPacks } = require('../src/main/shortcut-packs');
const { shortcutRows, filterShortcutRows } = require('../src/shared/shortcut-library');

const [windows, emacs, sublime] = intellijApplications;
const forCommand = ({ bindings }, command) => bindings.filter((binding) => binding.command === command);

test('IntelliJ Windows preserves the release keymap inputs and explicit empty declarations', () => {
  assert.equal(review.coverage.release, 'idea/2026.2.3');
  assert.equal(review.coverage.installedVersion, null);
  assert.equal(review.windows.length, 426);
  assert.deepEqual(review.coverage.declarations.windows.bindings, { keyboard: 447, 'double-press': 2, mouse: 14 });
  assert.equal(windows.bindings.length, 479);
  assert.equal(windows.bindings.filter(({ kind }) => kind === 'unassigned').length, 15);
  assert.ok(windows.bindings.every(({ chord, platform }) => chord === null && platform === 'windows'));
  assert.equal(forCommand(windows, 'GotoAction')[0].notation, 'Ctrl+Shift+A');
  assert.deepEqual(forCommand(windows, 'SearchEverywhere').map(({ notation, kind, trigger }) => [notation, kind, trigger]),
    [['Shift twice', 'gesture', 'Press and release Shift twice.']]);
  assert.ok(windows.bindings.some(({ notation }) => notation === 'Ctrl+NumAdd'));
  const paste = forCommand(windows, 'EditorPasteFromX11')[0];
  assert.equal(paste.kind, 'reference');
  assert.equal(paste.mode, 'X11');
});

test('IntelliJ alternate presets replace parent bindings or retain inherited provenance', () => {
  assert.deepEqual(intellijApplications.map(({ bindings }) => bindings.length), [479, 539, 511]);
  assert.equal(new Set(intellijApplications.flatMap(({ bindings }) => bindings.map(({ bindingId }) => bindingId))).size, 1529);
  assert.deepEqual(forCommand(emacs, 'GotoAction').map(({ notation }) => notation), ['Esc then X', 'Alt+X']);
  assert.deepEqual(forCommand(emacs, 'GotoAction')[0].strokes, [['Esc'], ['X']]);
  assert.equal(forCommand(emacs, 'ReformatCode')[0].kind, 'unassigned');
  assert.equal(forCommand(emacs, 'ReformatCode')[0].provenance.sourceId, 'emacs');
  assert.equal(forCommand(sublime, 'GotoAction')[0].notation, 'Ctrl+Shift+P');
  assert.equal(forCommand(sublime, 'ReformatCode')[0].provenance.sourceId, 'windows');
  assert.match(forCommand(sublime, 'ReformatCode')[0].requirement, /Inherited/);
  assert.match(forCommand(windows, 'EditorEscape')[0].requirement, /active component/);
});

test('IntelliJ declared presets are reference-only in the editor and offline MCP', () => {
  const auto = packFor({ executable: 'idea64.exe' });
  assert.equal(auto.id, 'intellij');
  assert.ok(packKeys(auto).some(({ action }) => action?.keys === 'Ctrl+Shift+A'));
  const ids = new Set(intellijApplications.map(({ id }) => id));
  const refs = previewPacks().filter(({ id }) => ids.has(id));
  assert.equal(refs.length, 3);
  assert.ok(refs.every(({ referenceOnly, keys }) => referenceOnly && keys.every(({ action, overrideId }) => !action && !overrideId)));
  assert.ok(filterShortcutRows(shortcutRows(refs), { app: emacs.id, query: 'Esc then X' })
    .some(({ key }) => key.binding.command === 'GotoAction'));
  const { items: [match] } = searchCatalog({ kind: 'shortcut', app: windows.id, query: 'SearchEverywhere' });
  assert.equal(match.binding.notation, 'Shift twice');
  assert.equal(match.binding.appVersion, '2026.2.3');
  assert.equal(match.compatibility.status, 'reference-only');
});
