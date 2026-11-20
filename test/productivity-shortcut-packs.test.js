'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createActionRunner } = require('../src/main/actions');
const { fixedEditingKeys } = require('../src/main/fixed-editing-keys');
const { searchCatalog } = require('../src/main/mcp-catalog-search');
const { Pages, runPageAction } = require('../src/main/pages');
const { toView, validateProfile } = require('../src/main/profile');
const { packFor, previewPacks } = require('../src/main/shortcut-packs');

const windows = { platform: 'win32', osRelease: '10.0.26100' };
const profile = validateProfile({ pages: [{ id: 'home', keys: [] }] });
const apps = [
  { pack: 'notepad', executable: 'Notepad.exe', appId: 'Microsoft.WindowsNotepad_8wekyb3d8bbwe!App',
    key: 'replace', chord: 'Ctrl+H', query: 'replace' },
  { pack: 'paint', executable: 'mspaint.exe', appId: 'Microsoft.Paint_8wekyb3d8bbwe!App',
    key: 'zoom-in', chord: 'Ctrl+PageUp', query: 'zoom in' },
  { pack: 'sumatrapdf', executable: 'SumatraPDF.exe', key: 'presentation', chord: 'F5', query: 'toggle presentation' },
];

test('installed app identities resolve the same documented commands on the deck, in the editor and in MCP', () => {
  for (const { pack, key, chord, query, ...window } of apps) {
    const pages = new Pages();
    pages.observe({ ...window, windowId: 15n });
    const page = pages.current(profile);
    assert.equal(page.pack, pack);
    assert.equal(toView(profile, { page }).slots.find((slot) => slot?.id === key).shortcut, chord);
    const preview = previewPacks('en-US').find(({ id }) => id === pack);
    assert.equal(preview.keys.find(({ id }) => id === key).action.keys, chord);
    const matches = searchCatalog({ kind: 'shortcut', app: pack, query, platform: 'windows' }, windows).items;
    const result = matches.find(({ id }) => id === `${pack}/${key}`);
    assert.equal(result.binding.chord, chord);
    assert.equal(result.compatibility.status, 'conditional');
    assert.equal(result.source.url, preview.source);
  }
  assert.equal(packFor({ executable: 'notepad.exe' }), null);
  assert.equal(packFor({ executable: 'mspaint.exe' }), null);
  assert.equal(packFor({ executable: 'chrome.exe', title: 'SumatraPDF' }).id, 'chrome');
});

test('app commands use the original foreground window and closing commands keep their confirmation', async () => {
  for (const { pack, key, chord, query, ...window } of apps) {
    const original = { ...window, id: '1:44', windowId: 44n };
    let target = original;
    const sent = [];
    const foreground = Object.assign(() => target.executable, { context: () => target, windowId: () => target.windowId });
    const runner = createActionRunner({ readForeground: foreground, readShortcutSettings: () => ({ platform: 'win32' }),
      input: { sendChord: (keys) => sent.push(keys.map(({ name }) => name).join('+')) } });
    const pages = new Pages();
    pages.observe(original);
    const page = pages.current(profile);
    assert.equal(page.pack, pack);
    const run = () => runPageAction(page, page.keys.find(({ id }) => id === key).action, runner, foreground, pages.binding(page));
    target = { ...original, id: '1:45', windowId: 45n };
    assert.equal((await run()).ok, false);
    assert.deepEqual(sent, []);
    target = original;
    assert.equal((await run()).ok, true);
    assert.deepEqual(sent, [chord.toLowerCase()]);
    const close = page.keys.find(({ id }) => id.startsWith('close-'));
    if (close) {
      assert.equal(close.confirm, true);
      assert.equal(close.action.shortcutGuard.confirm, true);
    }
  }
});

test('fixed editing uses the documented Notepad redo and avoids invoking zoom in SumatraPDF', () => {
  const notepad = fixedEditingKeys(profile, { ...apps[0], windowId: 17n }, windows);
  assert.equal(notepad.find(({ id }) => id === 'edit:redo').action.keys, 'Ctrl+Alt+Z');
  const pdf = fixedEditingKeys(profile, { ...apps[2], windowId: 17n }, windows);
  assert.deepEqual(pdf.filter(({ action }) => action).map(({ id, shortcut }) => [id, shortcut]), [['edit:copy', 'Ctrl+C']]);
});
