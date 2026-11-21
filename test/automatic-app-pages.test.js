'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Pages, runPageAction } = require('../src/main/pages');
const { validateProfile, toView } = require('../src/main/profile');
const { createActionRunner } = require('../src/main/actions');
const { packKeys, packs, previewPacks } = require('../src/main/shortcut-packs');
const { iconExists } = require('../src/main/icons');
const { parseCombo } = require('../src/main/actions/keys');
const { photoshopSurface } = require('../src/main/foreground-win32');
const { cursorSurface, observeShortcutMode } = require('../src/main/shortcut-surface');
const { chromiumWebAppId } = require('../src/main/shortcut-packs-web');
const { describeLayoutView } = require('../src/main/mcp-layout');

const profile = validateProfile({
  grid: { cols: 2, rows: 1 },
  pages: [
    { id: 'home', name: 'Home', keys: [] },
    { id: 'editor', name: 'Editor', apps: ['code.exe'], keys: [] },
    { id: 'manual', name: 'Manual', keys: [] },
  ],
});

const note = { executable: 'notepad.exe', path: 'c:\\windows\\notepad.exe', windowId: 123n };
const impersonator = { ...note, path: 'c:\\other\\notepad.exe', windowId: 456n };
const frame = { executable: 'applicationframehost.exe', path: 'c:\\windows\\applicationframehost.exe', windowId: 789n };

test('web app packs stay separate from browser tabs and allow exact custom page overrides', () => {
  const pages = new Pages();
  const browser = { executable: 'chrome.exe', appId: 'chrome', windowId: 5n, title: 'YouTube' };
  const manifestId = 'https://docs.google.com/document/u/2/';
  const appId = 'chrome._crx_' + chromiumWebAppId(manifestId);
  const configured = validateProfile({ ...profile, webApps: [{ pack: 'gdocs', manifestId }] });
  pages.observe(browser);
  assert.equal(pages.current(configured).pack, 'chrome');
  pages.observe({ ...browser, appId, windowId: 6n });
  assert.equal(pages.current(profile).pack, undefined);
  assert.equal(pages.current(configured).pack, 'gdocs');
  assert.equal(pages.current(configured).keys[0].action.keys, 'Ctrl+F');
  const overridden = validateProfile({ ...configured, pages: [
    { id: 'web', name: 'My Docs', keys: [], appIds: [appId] }, ...profile.pages,
  ] });
  assert.equal(pages.current(overridden).id, 'web');
  assert.throws(() => validateProfile({ ...configured, webApps: [
    ...configured.webApps, { pack: 'gdocs', manifestId: manifestId + '#saved' },
  ] }), /more than once/);
  pages.observe({ ...browser, appId: 'chrome._crx_agimnkijcaahngcdmfeangaknmldooml', windowId: 7n });
  assert.equal(pages.current(configured).pack, 'youtube');
  assert.match(pages.current(configured).keys[0].unavailable, /YouTube player/);
});

test('configured matches win and generated app pages are bounded, transient, and safe to send to the renderer', () => {
  const pages = new Pages();
  pages.observe({ executable: 'code.exe', path: 'c:\\editor\\code.exe' });
  assert.equal(pages.current(profile).id, 'editor');
  pages.observe(note);
  const generated = pages.current(profile);
  assert.equal(generated.generated, true);
  assert.equal(generated.name, 'Notepad');
  assert.deepEqual(generated.keys.map(({ label }) => label), ['Find', 'Copy']);
  assert.equal(pages.current(profile), generated);
  assert.equal(profile.pages.length, 3);
  const view = toView(profile, { page: generated });
  assert.deepEqual(view.slots.map((key) => key?.label ?? null), ['Find', null]);
  assert.deepEqual(view.editingKeys.map(({ label }) => label), ['Cut', 'Copy', 'Paste', 'Undo', 'Redo']);
  assert.doesNotMatch(JSON.stringify(view), /Ctrl\+F|c:\\|notepad\.exe/i);
});

test('manual selection holds for the same app identity, and locking an Auto page preserves its configured fallback', () => {
  const pages = new Pages();
  pages.observe(note);
  pages.select(profile, 'manual');
  pages.observe({ ...note, windowId: 987n });
  assert.equal(pages.current(profile).id, 'manual');
  pages.observe(null);
  assert.equal(pages.current(profile).id, 'manual');
  pages.observe(impersonator);
  const generated = pages.current(profile);
  assert.equal(generated.generated, true);
  pages.toggleLock(profile);
  pages.observe({ executable: 'code.exe', path: 'c:\\editor\\code.exe' });
  assert.equal(pages.current(profile), generated);
  assert.equal(pages.savedPage, 'manual');
  pages.toggleLock(profile);
  assert.equal(pages.current(profile).id, 'editor');
  pages.observe({ executable: '' });
  assert.equal(pages.current(profile).id, 'manual');
});

test('packaged apps in a shared host get distinct automatic identities and terminals avoid Ctrl+C', () => {
  const pages = new Pages();
  pages.observe(frame);
  assert.equal(pages.current(profile).id, 'home');
  pages.observe({ ...frame, appId: 'Microsoft.WindowsCalculator_ab12!App' });
  const calculator = pages.current(profile);
  assert.equal(calculator.name, 'Calculator');
  pages.observe({ ...frame, appId: 'Microsoft.WindowsNotepad_ab12!App' });
  assert.equal(pages.current(profile).name, 'Notepad');
  assert.notEqual(pages.current(profile).id, calculator.id);
  pages.observe({ executable: 'powershell.exe', path: 'c:\\windows\\system32\\windowspowershell\\v1.0\\powershell.exe' });
  assert.deepEqual(pages.current(profile).keys.map(({ action }) => action.keys), ['Ctrl+Shift+F', 'Ctrl+Shift+C']);
});

test('shortcut packs prefer verified app identity and yield to explicit page rules', () => {
  const pages = new Pages();
  const appId = 'Microsoft.OutlookForWindows_8wekyb3d8bbwe!Microsoft.OutlookforWindows';
  pages.observe({ ...frame, appId });
  assert.equal(pages.current(profile).pack, 'outlook-new');
  pages.observe({ executable: 'OUTLOOK.EXE' });
  assert.equal(pages.current(profile).pack, 'outlook-classic');
  pages.observe({ ...frame, appId: 'Microsoft.WindowsTerminal_8wekyb3d8bbwe!App' });
  assert.deepEqual(pages.current(profile).keys.slice(0, 2).map(({ action }) => action.keys), ['Ctrl+Shift+T', 'Ctrl+Shift+F']);
  const active = { executable: 'MSEDGE.exe', appId: 'MSEdge' };
  pages.observe(active);
  const browser = pages.current(profile);
  assert.equal(browser.pack, 'edge');
  for (let poll = 0; poll < 10; poll++) {
    pages.observe({ ...active });
    assert.equal(pages.current(profile), browser);
  }
  const webApp = { ...active, appId: 'MSEdge._crx_' + 'a'.repeat(32) };
  const linked = validateProfile({ pages: [
    { id: 'home', keys: [] }, { id: 'browser', apps: ['msedge.exe'], keys: [] },
    { id: 'web', appIds: [webApp.appId], keys: [] },
  ] });
  pages.observe(webApp);
  assert.equal(pages.current(profile).pack, undefined);
  assert.equal(pages.current(linked).id, 'web');
  pages.observe(active);
  assert.equal(pages.current(linked).id, 'browser');
});

test('Explorer windows have an Auto page and the Windows shell surface returns to a configured page', () => {
  const pages = new Pages();
  const explorer = { executable: 'explorer.exe', path: 'c:\\windows\\explorer.exe' };
  pages.observe(explorer);
  assert.equal(pages.current(profile).name, 'File Explorer');
  pages.observe({ ...explorer, shell: true });
  assert.equal(pages.current(profile).id, 'home');
});

test('a Home return keeps the previous manual page and leaves explicit same-app overrides in control', () => {
  const pages = new Pages();
  pages.restore(profile, { page: 'manual', locked: false }, { contextReturn: 'home' });
  assert.equal(pages.current(profile).id, 'manual');
  pages.observe(note);
  assert.equal(pages.current(profile).generated, true);
  pages.observe(null);
  assert.equal(pages.current(profile).generated, true);
  pages.observe({ shell: true });
  assert.equal(pages.current(profile).id, 'home');
  assert.equal(pages.savedPage, 'manual');
  pages.setContextReturn('manual');
  assert.equal(pages.current(profile).id, 'manual');
  pages.setContextReturn('home');
  pages.observe(note);
  assert.equal(pages.current(profile).generated, true);
  pages.select(profile, 'manual');
  pages.observe({ ...note, windowId: 789n });
  assert.equal(pages.current(profile).id, 'manual');
  pages.observe({ shell: true });
  assert.equal(pages.current(profile).id, 'manual');
});

test('an activity falls back after a linked page and a restored Home lock retains its manual page', () => {
  const options = { contextOnly: true, contextReturn: 'home' };
  const pages = new Pages();
  pages.restore(profile, { page: 'manual', locked: false }, options);
  pages.observe(note);
  assert.equal(pages.current(profile).id, 'manual');
  pages.observe({ executable: 'code.exe', windowId: 1n });
  assert.equal(pages.current(profile).id, 'editor');
  pages.toggleLock(profile);
  pages.observe(note);
  assert.equal(pages.current(profile).id, 'editor');
  pages.toggleLock(profile);
  assert.equal(pages.current(profile).id, 'home');
  pages.toggleLock(profile);
  pages.restore(profile, { page: pages.savedPage, locked: true, manualPage: pages.manual }, options);
  assert.equal(pages.current(profile).id, 'home');
  assert.equal(pages.manualPage(profile).id, 'manual');
  pages.toggleLock(profile);
  assert.equal(pages.current(profile).id, 'manual');
});

test('a generated action verifies both the displayed window and a fresh foreground identity before sending input', async () => {
  const pages = new Pages();
  pages.observe(note);
  const page = pages.current(profile);
  const binding = pages.binding(page);
  const calls = [];
  let active = impersonator;
  let windowId = active.windowId;
  const reader = {
    context(options) { assert.deepEqual(options, { fresh: true }); return active; },
    windowId: () => windowId,
  };
  const runner = createActionRunner({
    input: { sendChord: (keys) => calls.push(keys) },
    readForeground: () => active?.executable,
  });
  const action = page.keys[0].action;
  const run = () => runPageAction(page, action, runner, reader, binding);
  assert.equal((await run()).ok, false);
  active = { ...note, windowId: 432n };
  windowId = active.windowId;
  assert.equal((await run()).ok, false);
  active = note;
  assert.equal((await run()).ok, false);
  active = null;
  assert.equal((await run()).ok, false);
  assert.deepEqual(calls, []);
  active = note;
  windowId = note.windowId;
  assert.deepEqual(await run(), { ok: true, message: null });
  assert.equal(calls.length, 1);
});

test('a locked page keeps its exact target when another window in the app or the editor takes focus', () => {
  const pages = new Pages();
  pages.observe({ executable: 'code.exe', windowId: 1n });
  const page = pages.current(profile);
  assert.equal(pages.binding(page).active, true);
  pages.toggleLock(profile);
  pages.observe({ executable: 'code.exe', windowId: 2n });
  assert.equal(pages.current(profile), page);
  assert.equal(pages.binding(page).target.windowId, 1n);
  assert.equal(pages.binding(page).active, false);
  pages.observe(null);
  assert.equal(pages.current(profile), page);
  assert.equal(pages.binding(page).active, false);
  pages.observe({ executable: 'code.exe', windowId: 1n });
  assert.equal(pages.binding(page).active, true);
  pages.toggleLock(profile);
  pages.observe({ executable: 'code.exe', windowId: 2n });
  assert.equal(pages.binding(page).target.windowId, 2n);
});

test('target changes during a delay stop all subsequent steps, even with continue on failure', async () => {
  const pages = new Pages();
  pages.observe(note);
  const page = pages.current(profile);
  const binding = pages.binding(page);
  let active = note;
  const reader = { context: () => active, windowId: () => active.windowId };
  const runner = createActionRunner({
    input: { sendChord: () => assert.fail('Never send to a different foreground window') },
    readForeground: () => active.executable,
    sleep: async () => { active = { ...note, windowId: 433n }; },
  });
  const action = { type: 'sequence', steps: [{ type: 'delay', ms: 10, onError: 'continue' }, page.keys[0].action] };
  assert.match((await runPageAction(page, action, runner, reader, binding)).message, /target window.*unavailable/i);
});

test('the stock profile uses the actual browser and VS Code packs, and customised pages take priority', () => {
  const stock = validateProfile(require('../profiles/default.json'));
  const pages = new Pages();
  assert.deepEqual(stock.pages.map(({ id }) => id), ['home']);
  pages.observe({ executable: 'msedge.exe', windowId: 1n });
  assert.equal(pages.current(stock).pack, 'edge');
  assert.equal(pages.current(stock).keys[2].action.keys, 'Ctrl+Shift+Tab');
  pages.observe({ executable: 'firefox.exe', windowId: 2n });
  assert.equal(pages.current(stock).pack, 'firefox');
  const { apps, keys } = require('./fixtures/retired-default-pages.json').find(({ id }) => id === 'browser');
  const edited = validateProfile({ ...stock, pages: [...stock.pages, { id: 'browser', name: 'My browser', apps, keys, priority: 20 }] });
  assert.equal(pages.current(edited).id, 'browser');
  assert.equal(pages.current(edited).priority, 20);
  pages.observe({ executable: 'code.exe', windowId: 3n });
  assert.equal(pages.current(stock).pack, 'vscode');
  pages.observe({ shell: true });
  assert.equal(pages.current(stock).id, 'home');
});

test('automatic shortcut packs fill available cells and keep guarded keys and the five fixed positions', () => {
  const stock = validateProfile(require('../profiles/default.json'));
  const pages = new Pages();
  pages.observe({ executable: 'chrome.exe', windowId: 1n });
  const page = pages.current(stock);
  const view = toView(stock, { page });
  assert.equal(view.shortcutPack, true);
  for (const portrait of [false, true]) {
    const { sheets, editing, grid } = describeLayoutView(view, page.id, portrait);
    const visible = view.slots.filter(Boolean);
    assert.equal(sheets.length, 1);
    assert.equal(sheets[0].keys[0].id, 'new-tab');
    assert.deepEqual(sheets[0].keys.map(({ id }) => id), visible.map(({ id }) => id));
    assert.ok(sheets[0].keys.some(({ id }) => id.startsWith('catalog-')));
    assert.ok(page.keys.every(({ action }) => action.shortcutGuard.pack === 'chrome'));
    assert.deepEqual(editing.map(({ layout }) => [layout.column, layout.row]),
      [0, 1, 2, 3, 4].map((offset) => [grid.cols - 5 + offset, grid.rows - 1]));
  }

  pages.observe({ executable: 'code.exe', windowId: 2n });
  const search = pages.current(stock).keys.find(({ group }) => group === 'search');
  assert.match(search.unavailable, /VS Code editor/);
  assert.equal(search.action.shortcutGuard.mode, 'the VS Code editor');
});

test('pack entries keep their places and gate locale, keyboard layouts and contexts', () => {
  const keys = (id, settings) => packKeys(packs.find((pack) => pack.id === id), settings);
  const word = keys('word');
  assert.match(word[2].unavailable, /Office shortcut language/);
  assert.equal(keys('word', { shortcutLanguage: 'it-IT' })[2].action.keys, 'Ctrl+G');
  const excel = keys('excel', { keyboardLayout: 0xf0020409 });
  assert.match(excel[4].unavailable, /US keyboard layout/);
  assert.equal(keys('excel', { keyboardLayout: 0x04090409 })[4].unavailable, undefined);
  assert.ok(keys('teams').slice(0, 4).every((key) => key.unavailable));
  assert.equal(keys('explorer', { build: 19045 })[0].id, 'new-tab');
  assert.match(keys('explorer', { build: 19045 })[0].unavailable, /Windows 11/);
  assert.equal(keys('chrome').at(-1).confirm, true);
  assert.equal(keys('spotify')[3].action.type, 'spotify-playback');
  assert.ok(previewPacks().find(({ id }) => id === 'edge').revision);
});

test('each pack key has a valid action icon, a short label and an accessible shortcut where applicable', () => {
  for (const pack of packs) {
    const keys = packKeys(pack, { shortcutLanguage: 'en-US' });
    assert.equal(new Set(keys.map(({ id }) => id)).size, keys.length, pack.id);
    for (const key of keys) {
      assert.ok(key.label.length <= 24 && iconExists(key.icon), pack.id + '/' + key.id);
      if (key.action.type === 'hotkey') assert.ok(parseCombo(key.action.keys).length);
    }
  }
  const pages = new Pages();
  pages.observe({ executable: 'msedge.exe' });
  const view = toView(profile, { page: pages.current(profile) });
  assert.equal(view.slots[0].shortcut, 'Ctrl+T');
  assert.equal(view.slots[0].action, undefined);
});

test('Windows desktop app identities select executable starters while terminal and editor hosts keep their own packs', () => {
  const pages = new Pages();
  const examples = [
    [{ executable: 'ChatGPT.exe', appId: 'OpenAI.Codex_2p2nqsd0c76g0!App' }, 'chatgpt-codex', 'show-codex', 'Alt+3'],
    [{ executable: 'ChatGPT.exe', appId: 'OpenAI.ChatGPT-Desktop_2p2nqsd0c76g0!App' }, 'chatgpt-companion', 'companion', 'Alt+Space'],
    [{ executable: 'Claude.exe', appId: 'Claude_pzs8sxrjxfjjc!Claude' }, 'claude', 'new-code-session', 'Ctrl+N'],
    [{ executable: 'Antigravity.exe', appId: 'com.google.antigravity' }, 'antigravity', 'conversations', 'Ctrl+K'],
    [{ executable: 'Antigravity IDE.exe', appId: 'Google.AntigravityIDE' }, 'antigravity-workbench', 'focus-agent', 'Ctrl+L'],
    [{ executable: 'GitHubDesktop.exe' }, 'github-desktop', 'repositories', 'Ctrl+T'],
    [{ executable: 'ONENOTE.EXE' }, 'onenote', 'search-notebooks', 'Ctrl+E'],
    [{ executable: 'devenv.exe' }, 'visual-studio', 'solution-explorer', 'Ctrl+Alt+L'],
    [{ executable: 'vlc.exe' }, 'vlc', 'play-pause', 'Space'],
  ];
  for (const [window, pack, id, chord] of examples) {
    pages.observe({ ...window, windowId: 25n });
    const { page, reason } = pages.selection(profile);
    assert.equal(reason, 'pack');
    assert.equal(page.pack, pack);
    const { action, unavailable } = page.keys.find((key) => key.id === id);
    assert.equal(action.keys, chord);
    assert.equal(action.shortcutGuard.pack, pack);
    assert.equal(unavailable, undefined);
  }

  for (const [executable, pack] of [['windowsterminal.exe', 'terminal'], ['chrome.exe', 'chrome'],
    ['claude.exe', undefined], ['codex.exe', undefined]]) {
    pages.observe({ executable, title: 'ChatGPT and Claude', windowId: 25n });
    assert.equal(pages.current(profile).pack, pack);
  }
});

test('Cursor Agents uses its own commands and rejects editor shortcuts after a surface change', async () => {
  const pages = new Pages();
  const editor = { executable: 'cursor.exe', windowId: 52n, id: 'cursor-window' };
  assert.equal(cursorSurface('chrome.exe', 'Cursor Agents'), undefined);
  assert.equal(cursorSurface('cursor.exe', 'Example - Cursor'), undefined);
  const agents = { ...editor, mode: cursorSurface(editor.executable, 'Cursor Agents') };
  pages.observe(editor);
  const page = pages.current(profile);
  assert.equal(page.pack, 'cursor');
  const binding = pages.binding(page);
  pages.observe(agents);
  const agentsPage = pages.current(profile);
  assert.equal(agentsPage.pack, 'cursor-agents');
  assert.deepEqual(agentsPage.keys.map(({ action }) => action.keys), ['Ctrl+Shift+P', 'Ctrl+P', 'Ctrl+Shift+F']);
  assert.ok(agentsPage.keys.every(({ action, unavailable }) => action.shortcutGuard.mode === agents.mode && !unavailable));
  const read = { context: () => agents, windowId: () => agents.windowId };
  const runner = createActionRunner({ input: { sendChord: () => assert.fail('Cursor changed surfaces') } });
  assert.match((await runPageAction(page, page.keys[0].action, runner, read, binding)).message, /surface changed/);
});

test('Photoshop emits workspace shortcuts for its executable and blocks a changed surface', async () => {
  const pages = new Pages();
  const workspace = { windowClass: 'Photoshop', focusClass: 'PhotoshopCanvas', focusInWindow: true, hasOwner: false, caretId: null, flags: 0 };
  const mode = photoshopSurface(workspace);
  assert.equal(mode, 'the Photoshop workspace');
  assert.equal(photoshopSurface({ ...workspace, hasOwner: true }), 'a Photoshop dialog');
  assert.equal(photoshopSurface({ ...workspace, focusClass: 'Edit' }), 'a Photoshop text field');
  assert.equal(photoshopSurface({ ...workspace, windowClass: 'Splash' }), undefined);
  const target = { executable: 'Photoshop.exe', windowId: 112n, mode };
  pages.observe({ executable: 'chrome.exe', windowId: 25n });
  assert.equal(pages.current(profile).pack, 'chrome');
  pages.observe(target);
  const page = pages.current(profile);
  assert.equal(page.pack, 'photoshop');
  assert.deepEqual(page.keys.slice(0, 2).map(({ action }) => action.keys), ['Ctrl+J', 'Ctrl+T']);
  const binding = pages.binding(page);
  const active = { ...target, mode: photoshopSurface({ ...workspace, caretId: 9n }) };
  const reader = { context: () => active, windowId: () => active.windowId };
  const runner = createActionRunner({ input: { sendChord: () => assert.fail('A text field took focus') } });
  assert.match((await runPageAction(page, page.keys[0].action, runner, reader, binding)).message, /surface changed/);
  pages.observe(active);
  assert.ok(pages.current(profile).keys.every((key) => key.unavailable));
  const installed = { executable: 'adobe photoshop.exe', id: 'photoshop-window', windowId: 42n };
  const observed = observeShortcutMode(installed.executable, installed, () => installed, () => workspace);
  pages.observe({ ...installed, mode: observed.mode });
  assert.equal(pages.current(profile).pack, 'photoshop');
  assert.equal(pages.current(profile).keys.find(({ id }) => id === 'curves').action.keys, 'Ctrl+M');
  assert.ok(pages.current(profile).keys.every(({ unavailable }) => !unavailable));
  pages.observe({ executable: 'photoshop-launcher.exe', windowId: 42n });
  assert.equal(pages.current(profile).pack, undefined);
  pages.observe({ executable: 'chrome.exe', windowId: 25n });
  assert.equal(pages.current(profile).pack, 'chrome');
  const copy = previewPacks().find(({ id }) => id === 'photoshop');
  assert.ok(copy.keys.every((key) => !key.unavailable && key.action.requiresPhotoshopWorkspace));
  let sent = 0;
  let editingMode = active.mode;
  const readForeground = Object.assign(() => 'photoshop.exe', {
    context: () => ({ ...target, mode: editingMode }), windowId: () => target.windowId,
  });
  const copiedAction = createActionRunner({ readForeground, input: { sendChord: () => sent++ } });
  assert.equal((await copiedAction.run(copy.keys[0].action)).ok, false);
  editingMode = target.mode;
  assert.equal((await copiedAction.run(copy.keys[0].action)).ok, true);
  assert.equal(sent, 1);
});

test('window title rules route different documents in one app without exposing the title', async () => {
  const specific = { mode: 'starts-with', value: 'Quarterly report' };
  const linked = validateProfile({ pages: [
    { id: 'home', keys: [] },
    { id: 'word', apps: ['winword.exe'], keys: [] },
    { id: 'report', apps: ['WINWORD.exe'], windowTitle: specific, keys: [] },
  ] });
  const pages = new Pages();
  let active = { executable: 'winword.exe', title: 'QUARTERLY REPORT draft', windowId: 20n };
  pages.observe(active);
  const page = pages.current(linked);
  assert.equal(page.id, 'report');
  assert.doesNotMatch(JSON.stringify(toView(linked, { page })), /quarterly/i);
  const binding = pages.binding(page);
  active = { ...active, title: 'Quarterly report appendix' };
  const runner = createActionRunner({ input: { sendChord: () => assert.fail('The document changed') } });
  const reader = { context: () => active, windowId: () => active.windowId };
  const result = await runPageAction(page, { type: 'hotkey', keys: 'Ctrl+F' }, runner, reader, binding);
  assert.match(result.message, /title changed/i);
  pages.observe({ ...active, title: 'Other document' });
  assert.equal(pages.current(linked).id, 'word');
  assert.throws(() => validateProfile({ pages: [{ id: 'bad', windowTitle: specific, keys: [] }] }), /requires an executable/);
  assert.throws(() => validateProfile({ pages: [
    { id: 'first', apps: ['winword.exe'], windowTitle: specific, keys: [] },
    { id: 'again', apps: ['WINWORD.EXE'], windowTitle: { ...specific, value: specific.value.toUpperCase() }, keys: [] },
  ] }), /already assigned/);
});

test('context priorities and match explanations respect specificity and profile order', () => {
  const raw = { pages: [
    { id: 'general', apps: ['code.exe'], keys: [] },
    { id: 'contains', apps: ['code.exe'], windowTitle: { mode: 'contains', value: 'Project' }, keys: [] },
    { id: 'prefix', apps: ['code.exe'], windowTitle: { mode: 'starts-with', value: 'Project' }, keys: [] },
    { id: 'exact', apps: ['code.exe'], windowTitle: { mode: 'exact', value: 'Project - Code' }, keys: [] },
  ] };
  const pages = new Pages();
  pages.observe({ executable: 'code.exe', title: 'Project - Code' });
  assert.equal(pages.selection(validateProfile(raw)).page.id, 'exact');
  assert.equal(pages.selection(validateProfile(raw)).reason, 'title');
  raw.pages[0].priority = 1;
  const preferred = pages.selection(validateProfile(raw));
  assert.equal(preferred.page.id, 'general');
  assert.equal(preferred.reason, 'executable');
  raw.pages[0].priority = 101;
  assert.throws(() => validateProfile(raw), /priority/);
});
