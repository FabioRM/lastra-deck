'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Pages, runPageAction } = require('../src/main/pages');
const { toView, validateProfile } = require('../src/main/profile');
const { describeLayoutView } = require('../src/main/mcp-layout');
const { AgentDrafts, draftParams } = require('../src/main/mcp-drafts');
const { previewPacks } = require('../src/main/shortcut-packs');

const tabs = { id: 'tabs', name: 'Open and close tabs', shortcuts: [
  { id: 'new-tab' }, { id: 'close-tab' }, { id: 'find', hidden: true }, { id: 'removed-upstream' },
] };
const reading = { id: 'reading', name: 'Reading', shortcuts: [{ id: 'find' }, { id: 'new-tab' }] };
const blank = { id: 'empty', name: 'Empty page', shortcuts: [] };
const raw = { pages: [{ id: 'home', keys: [] }, { id: 'manual', keys: [] }],
  shortcutLayouts: { chrome: { enabled: true, pages: [tabs, reading, blank] } } };
const chrome = { id: 'chrome-1', executable: 'chrome.exe', path: 'C:\\Chrome\\chrome.exe', windowId: 10n };
const select = (profile, context = chrome) => {
  const pages = new Pages();
  pages.observe(context);
  return pages.current(profile);
};

test('configured shortcut pages retain order, metadata, guards and independent shortcut IDs', async () => {
  const profile = validateProfile(JSON.parse(JSON.stringify(raw)));
  const page = select(profile);
  assert.deepEqual(page.keys.map(({ shortcutPage, label, action }) => [shortcutPage, label, action.shortcutGuard.pack]), [
    ['tabs', 'New tab', 'chrome'], ['tabs', 'Close tab', 'chrome'], ['reading', 'Find', 'chrome'], ['reading', 'New tab', 'chrome'],
  ]);
  assert.equal(new Set(page.keys.map(({ id }) => id)).size, 4);
  assert.equal(page.keys[1].confirm, true);
  const view = toView(profile, { page });
  assert.doesNotMatch(JSON.stringify(view), /removed-upstream|shortcutGuard/);
  for (const portrait of [false, true]) {
    const layout = describeLayoutView(view, page.id, portrait);
    assert.deepEqual(layout.sheets.map(({ group, keys }) => [group, keys.length]), [
      ['Open and close tabs', 2], ['Reading', 2], ['Empty page', 0],
    ]);
    assert.equal(layout.editing.length, 5);
  }
  const pages = new Pages();
  pages.observe(chrome);
  const replacementWindow = { ...chrome, id: 'chrome-2', windowId: 20n };
  const read = () => replacementWindow.executable;
  read.context = () => replacementWindow;
  read.windowId = () => replacementWindow.windowId;
  const runner = { run(_action, _apps, options) { return options.guard(); } };
  assert.match(await runPageAction(page, page.keys[0].action, runner, read, pages.binding(page)), /target window.*unavailable/i);
});

test('hidden packs fall back safely and custom pages work in explicitly configured activities', () => {
  const pages = new Pages();
  const enabled = validateProfile(raw);
  const disabled = validateProfile({ ...raw, shortcutLayouts: { chrome: { enabled: false } } });
  pages.restore(enabled, { page: 'manual', locked: false }, { contextOnly: true });
  pages.observe(chrome);
  assert.equal(pages.current(enabled).pack, 'chrome');
  pages.toggleLock(enabled);
  assert.equal(pages.current(disabled).id, 'manual');
  pages.toggleLock(disabled);
  assert.equal(pages.current(disabled).id, 'manual');
  const contextual = validateProfile({ ...disabled, pages: [...raw.pages, { id: 'custom', apps: ['chrome.exe'], keys: [] }] });
  assert.equal(pages.current(contextual).id, 'custom');
  assert.equal(pages.current(validateProfile({ pages: raw.pages })).id, 'manual');
  assert.throws(() => validateProfile({ ...raw, shortcutLayouts: { chrome: { enabled: true, pages: [tabs, tabs] } } }), /unique IDs/);
  assert.throws(() => validateProfile({ ...raw, shortcutLayouts: { chrome: { enabled: true, pages: [{ ...tabs, shortcuts: [
    { id: 'new-tab', action: { type: 'launch', target: 'other.exe' } },
  ] }] } } }), /shortcut/);
  assert.ok(previewPacks('en-US').find(({ id }) => id === 'chrome').starterIds.includes('new-tab'));
});

test('MCP draft edits atomically validate app shortcut page settings and preserve revision guards', () => {
  const service = new AgentDrafts();
  const draft = service.create('owner', 'main', { pages: raw.pages });
  const edit = (owner, revision, shortcutLayouts) => service.change(owner, 'main', draftParams({
    command: 'edit', draft: draft.id, revision, edits: [{ op: 'profile-settings', settings: { shortcutLayouts } }],
  }));
  const updated = edit('owner', draft.revision, raw.shortcutLayouts);
  const actual = service.resolve('owner', 'main', updated.id, updated.revision).profile;
  assert.equal(select(actual).shortcutPages[1].name, reading.name);
  assert.throws(() => edit('peer', updated.revision, raw.shortcutLayouts), /unavailable/);
  assert.throws(() => edit('owner', draft.revision, raw.shortcutLayouts), /changed/);
  assert.throws(() => edit('owner', updated.revision, { chrome: { enabled: true, pages: [] } }), /sixteen pages/);
  assert.equal(service.resolve('owner', 'main', draft.id).revision, updated.revision);
});
