'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { observeShortcutMode } = require('../src/main/shortcut-surface');
const { createActionRunner } = require('../src/main/actions');
const { decodeEditorClipboard, encodeEditorClipboard } = require('../src/main/editor-clipboard');
const { fixedEditingKeys } = require('../src/main/fixed-editing-keys');
const { packFor, packKeys, previewPacks } = require('../src/main/shortcut-packs');
const { chromiumWebAppId, webPacks } = require('../src/main/shortcut-packs-web');
const { US_LAYOUT } = require('../src/main/shortcut-guards');

const window = { id: '5:90', keyboardHandle: 0x4100410n };
const workspace = { windowClass: 'Photoshop', focusClass: 'PhotoshopCanvas', focusId: 100n,
  focusInWindow: true, hasOwner: false, caretId: null, flags: 0 };

function observe({ first = workspace, second = first, middle = window, active = window } = {}) {
  const surfaces = [first, second];
  const windows = [middle, active];
  return observeShortcutMode('photoshop.exe', window, () => windows.shift(), () => surfaces.shift());
}

test('a Photoshop workspace requires matching native focus under the foreground window', () => {
  assert.equal(observe().mode, 'the Photoshop workspace');
  for (const surface of [null, { ...workspace, focusInWindow: false }, { ...workspace, focusClass: '' }]) {
    assert.equal(observe({ first: surface }).mode, undefined);
  }
  for (const veto of [{ hasOwner: true }, { windowClass: '#32770' }, { flags: 0x10 }]) {
    assert.equal(observe({ first: { ...workspace, ...veto } }).mode, 'a Photoshop dialog');
  }
  for (const veto of [{ caretId: 42n }, { focusClass: 'RichEdit50W' }]) {
    assert.equal(observe({ first: { ...workspace, ...veto } }).mode, 'a Photoshop text field');
  }
});

test('observed mode expires when focus, menu, layout, or window changes during the read', () => {
  for (const veto of [{ focusId: 101n }, { focusInWindow: false }, { flags: 0x4 }, { caretId: 42n }]) {
    assert.equal(observe({ second: { ...workspace, ...veto } }).mode, undefined);
  }
  assert.equal(observe({ middle: { ...window, keyboardHandle: 0x4090409n } }).mode, undefined);
  assert.equal(observe({ active: { ...window, keyboardHandle: 0x4090409n } }).mode, undefined);
  assert.equal(observe({ middle: { id: '5:91' } }), null);
  assert.equal(observe({ active: { id: '8:70' } }), null);
  assert.equal(observe({ active: null }), null);
});

test('Teams, Outlook, and browser identities do not prove an application mode', () => {
  const cases = [
    [{ executable: 'ms-teams.exe', appId: 'msteams_8wekyb3d8bbwe!msteams', title: 'Meeting' }, 'mic', /Teams meeting/],
    [{ executable: 'olk.exe', appId: 'microsoft.outlookforwindows_8wekyb3d8bbwe!microsoft.outlookforwindows', title: 'Mail' }, 'new-message', /Mail/],
    [{ executable: 'chrome.exe', appId: 'chrome._crx_' + chromiumWebAppId('https://www.youtube.com/'), title: 'Video title' }, 'play', /YouTube player/],
  ];
  for (const [context, key, message] of cases) {
    const mode = observeShortcutMode(context.executable, window, () => assert.fail('Unexpected foreground read'),
      () => assert.fail('Unexpected mode probe')).mode;
    assert.equal(mode, undefined);
    const pack = packFor(context);
    assert.match(packKeys(pack, { ...context, mode }).find(({ id }) => id === key).unavailable, message);
  }
});

test('document and canvas shortcuts stay unavailable in the installed web app home, including fixed editing keys', () => {
  const editors = new Map([
    ['gdocs', ['find', 'undo', 'redo']], ['gsheets', ['find', 'insert-sheet', 'undo']],
    ['google-slides', ['new-slide', 'undo']], ['canva', ['undo', 'redo', 'duplicate']],
    ['miro', ['search', 'undo']], ['photoshop-web', ['transform', 'layer-copy', 'zoom-fit', 'undo']],
  ]);
  const previews = previewPacks('en-US');
  for (const [id, guarded] of editors) {
    const pack = webPacks.find((item) => item.id === id);
    const context = { executable: 'chrome.exe', appId: 'chrome._crx_' + chromiumWebAppId(pack.manifests[0]),
      windowId: 50n, keyboardLayout: US_LAYOUT };
    assert.equal(packFor(context), pack);
    for (const mode of [undefined, 'the app home']) {
      const foreground = { ...context, mode };
      const keys = packKeys(pack, foreground);
      const unavailable = keys.filter((key) => key.unavailable);
      assert.deepEqual(unavailable.filter((key) => !key.group).map((key) => key.id), guarded, id);
      assert.ok(keys.filter((key) => key.group).every((key) => unavailable.includes(key)), id);
      const fixed = fixedEditingKeys({ shortcutLanguage: 'en-US' }, foreground, { platform: 'win32' });
      assert.equal(fixed.length, 5);
      assert.equal(fixed.every((key) => !key.action), true);
      assert.match(fixed.find((key) => key.id === 'edit:undo').unavailable, /Requires/);
    }
    const active = { ...context, mode: pack.editingMode };
    assert.ok(packKeys(pack, active).every((key) => !key.unavailable), id);
    const undo = fixedEditingKeys({ shortcutLanguage: 'en-US' }, active, { platform: 'win32' }).find((key) => key.id === 'edit:undo');
    assert.equal(undo.action.shortcutGuard.mode, pack.editingMode, id);
    const preview = previews.find((item) => item.id === id);
    for (const key of preview.keys.filter((item) => guarded.includes(item.id) || pack.keys.some((row) => row[0] === item.id && row[4]?.group))) {
      const copy = decodeEditorClipboard('key', encodeEditorClipboard('key', key));
      assert.equal(copy.action.shortcutGuard.mode, pack.editingMode, `${id} ${key.id}`);
    }
  }
});

test('execution checks older saved starters and retains the guard when a local override changes the chord', async () => {
  const pack = webPacks.find(({ id }) => id === 'gdocs');
  const preview = previewPacks('en-US').find(({ id }) => id === 'gdocs');
  const saved = preview.keys.find(({ id }) => id === 'find');
  const base = { id: '5:19', windowId: 19n, executable: 'msedge.exe', keyboardLayout: US_LAYOUT,
    appId: 'msedge._crx_' + chromiumWebAppId(pack.manifests[0]) };
  const override = { [saved.overrideId]: 'Ctrl+Alt+F' };
  assert.ok(saved.overrideId);
  const overridden = packKeys(pack, { ...base, shortcutLanguage: 'en-US', shortcutOverrides: override }).find(({ id }) => id === 'find');
  assert.equal(overridden.action.keys, 'Ctrl+Alt+F');
  assert.equal(overridden.action.shortcutGuard.mode, pack.editingMode);
  const { mode, ...legacyGuard } = saved.action.shortcutGuard;
  const legacy = { ...saved.action, shortcutGuard: legacyGuard };
  assert.equal(legacy.keys, 'Ctrl+F');
  let context = base;
  const sent = [];
  const readForeground = Object.assign(() => context.executable, { context: () => context, windowId: () => context.windowId });
  const runner = createActionRunner({ readForeground, readShortcutSettings: () => ({ platform: 'win32' }),
    input: { sendChord: (keys) => sent.push(keys.map((key) => key.name)) } });
  for (const wrong of [undefined, 'the app home']) {
    context = { ...base, mode: wrong };
    for (const action of [legacy, overridden.action]) {
      assert.match((await runner.run(action)).message, /Requires the Google Docs document editor/);
    }
  }
  assert.deepEqual(sent, []);
  context = { ...base, mode: pack.editingMode };
  for (const action of [legacy, overridden.action]) assert.equal((await runner.run(action)).ok, true);
  assert.deepEqual(sent, [['ctrl', 'f'], ['ctrl', 'alt', 'f']]);
});
