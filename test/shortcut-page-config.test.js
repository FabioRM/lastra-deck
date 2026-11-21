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
  assert.ok(previewPacks('en-US').find(({ id }) => id === 'chrome').defaultShortcutIds.includes('new-tab'));
});

test('Chrome uses one tab pair by default and shares history navigation with the persistent bar', () => {
  const pack = previewPacks('en-US').find(({ id }) => id === 'chrome');
  const alternate = pack.keys.find(({ action }) => action?.keys === 'Ctrl+Tab');
  const profile = validateProfile({ pages: raw.pages, bar: { keys: [
    { id: 'browser-back', label: 'Back', action: { type: 'hotkey', keys: 'Alt+Left' } },
    { id: 'other-forward', label: 'Forward', action: { type: 'hotkey', keys: 'Alt+Right', targetApps: ['msedge.exe'] } },
  ] } });
  const page = select(profile);
  const count = (keys, chord) => keys.filter(({ action }) => action?.keys === chord).length;
  for (const chord of ['Ctrl+PageUp', 'Ctrl+PageDown', 'Alt+Left', 'Alt+Right']) assert.equal(count(page.keys, chord), 1);
  for (const chord of ['Ctrl+Tab', 'Ctrl+Shift+Tab']) assert.equal(count(page.keys, chord), 0);
  assert.equal(alternate.alternateFor, 'next-tab');
  assert.ok(!pack.defaultShortcutIds.includes(alternate.id));
  const view = toView(profile, { page });
  assert.ok(view.bar.keys.find((key) => key?.id === 'bar:browser-back'));
  assert.ok(!view.slots.some((key) => key?.shortcut === 'Alt+Left'));
  assert.ok(view.slots.some((key) => key?.shortcut === 'Alt+Right'));
  assert.ok(toView(profile, { page, unavailable: ({ id }) => id === 'browser-back' ? 'Unavailable' : undefined })
    .slots.some((key) => key?.shortcut === 'Alt+Left'));

  const customized = (hidden) => validateProfile({ pages: raw.pages, shortcutLayouts: { chrome: { enabled: true, pages: [
    { id: 'chrome-tabs', name: 'Chrome tabs', shortcuts: [{ id: alternate.id }, { id: 'next-tab', hidden }] },
  ] } } });
  assert.deepEqual(select(customized(false)).keys.map(({ action }) => action.keys), ['Ctrl+PageDown']);
  assert.deepEqual(select(customized(true)).keys.map(({ action }) => action.keys), ['Ctrl+Tab']);
});

test('customizing a compact pack preserves its default keys and fills each screen before adding another', () => {
  const library = previewPacks('en-US');
  const samples = [
    { id: 'illustrator', executable: 'illustrator.exe', sizes: [19, 19, 19, 19, 19, 19, 10] },
    { id: 'claude', executable: 'claude.exe', appId: 'claude_pzs8sxrjxfjjc!claude', sizes: [19, 16] },
    { id: 'chrome', executable: 'chrome.exe' },
    { id: 'obs-studio', executable: 'obs64.exe' },
  ];
  for (const { id, executable, appId, sizes } of samples) {
    const context = { executable, appId, windowId: 15n, keyboardLayout: 0x04090409 };
    const baseline = validateProfile({ pages: raw.pages, shortcutLanguage: 'en-US' });
    const pack = library.find((entry) => entry.id === id);
    const pages = [{ id: 'customized', name: 'App shortcuts', shortcuts: pack.defaultShortcutIds.map((id) => ({ id })) }];
    const automaticPage = select(baseline, context);
    const automaticView = toView(baseline, { page: automaticPage });
    assert.deepEqual(pack.defaultShortcutIds, automaticView.slots.filter(Boolean).map(({ id }) => id));
    const customized = validateProfile({ ...baseline, shortcutLayouts: { [id]: { enabled: true, pages } } });
    const customizedPage = select(customized, context);
    for (const portrait of [false, true]) {
      const automatic = describeLayoutView(automaticView, automaticPage.id, portrait);
      const custom = describeLayoutView(toView(customized, { page: customizedPage }), customizedPage.id, portrait);
      assert.deepEqual(custom.sheets.map(({ keys }) => keys.map(({ id }) => id.split(':').at(-1))),
        automatic.sheets.map(({ keys }) => keys.map(({ id }) => id)));
      if (sizes) assert.deepEqual(automatic.sheets.map(({ keys }) => keys.length), sizes);
    }
    if (id === 'claude') {
      const alternateId = 'previous-session-bracket';
      assert.ok(pack.keys.find(({ id: keyId }) => keyId === alternateId)?.action);
      assert.ok(!automaticPage.keys.some(({ id: keyId }) => keyId === alternateId));
      const saved = validateProfile({ ...baseline, shortcutLayouts: { claude: { enabled: true, pages: [
        { id: 'sessions', name: 'Sessions', shortcuts: [{ id: alternateId }] },
      ] } } });
      assert.equal(select(saved, context).keys[0].action.keys, 'Ctrl+Shift+char:[');
    }
  }
});

test('expanded bundles add guarded native and web pages alongside their original quick actions', () => {
  const catalog = new Map(previewPacks('en-US').map((pack) => [pack.id, pack]));
  const fixtures = [
    ['slack', 'Views and conversations', 'slack-threads', 'Ctrl+Shift+T'],
    ['notion', 'Page editor and blocks', 'move-block-up', 'Ctrl+Shift+Up'],
    ['excel', 'Data and charts', 'chart-sheet', 'F11'],
    ['gdocs', 'Review and document tools', 'word-count', 'Ctrl+Shift+C'],
  ];
  for (const [id, group, shortcut, chord] of fixtures) {
    const pack = catalog.get(id);
    const key = pack.keys.find((item) => item.id === shortcut);
    assert.ok(pack.defaultShortcutIds.includes(shortcut));
    assert.equal(key.group, group);
    assert.equal(key.action.shortcutGuard.pack, id);
    assert.equal(key.action.keys, chord);
  }
  const wordCount = catalog.get('gdocs').keys.find(({ id }) => id === 'word-count');
  assert.equal(wordCount.action.shortcutGuard.mode, 'the Google Docs document editor');
  assert.match(wordCount.unavailable, /Google Docs document editor/);
  const participants = catalog.get('zoom').keys.find(({ id }) => id === 'participants');
  assert.equal(participants.action.shortcutGuard.mode, 'a Zoom meeting');
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
