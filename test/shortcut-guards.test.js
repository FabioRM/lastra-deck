'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createActionRunner } = require('../src/main/actions');
const { decodeEditorClipboard, encodeEditorClipboard } = require('../src/main/editor-clipboard');
const { KeyConfirmation } = require('../src/main/key-confirmation');
const { runPageAction } = require('../src/main/pages');
const { validateProfile, toView } = require('../src/main/profile');
const { packFor, previewPacks } = require('../src/main/shortcut-packs');
const { chromiumWebAppId } = require('../src/main/shortcut-packs-web');
const { needsShortcutConfirmation, shortcutUnavailable, US_LAYOUT } = require('../src/main/shortcut-guards');

const preview = (id, language) => previewPacks(language).find((pack) => pack.id === id);
const environment = { platform: 'win32', build: 22631 };

function fixture(start, settings = {}) {
  const sent = [];
  let active = start;
  let release;
  const readForeground = Object.assign(() => active?.executable, {
    context: () => active, windowId: () => active?.windowId,
  });
  const runner = createActionRunner({ readForeground, readShortcutSettings: () => ({ ...environment, ...settings }),
    input: { sendChord: (keys) => sent.push(keys.map(({ name }) => name)) },
    sleep: () => new Promise((resolve) => { release = resolve; }),
  });
  return { runner, readForeground, sent, set: (next) => { active = next; }, resume: () => release() };
}

test('a copied shortcut preserves its app and confirmation even after its page is manually unlinked', async () => {
  const close = preview('chrome').keys.find(({ id }) => id === 'close-tab');
  const key = decodeEditorClipboard('key', encodeEditorClipboard('key', close));
  const profile = validateProfile({ keys: [key] });
  const page = profile.pages[0];
  const chrome = { executable: 'Chrome.exe', path: 'C:\\Browser\\Chrome.exe', windowId: 100n, id: '10:100' };
  const { action } = page.keys[0];
  assert.deepEqual(page.apps, []);
  assert.equal(key.confirm, true);
  assert.deepEqual(action.shortcutGuard, { pack: 'chrome', application: 'Google Chrome', platform: 'windows', confirm: true });
  assert.throws(() => validateProfile({ keys: [{ ...key, confirm: false }] }), /requires confirmation/);
  const run = fixture(chrome);
  assert.equal((await run.runner.run(action)).ok, true);
  run.set({ ...chrome, executable: 'msedge.exe', path: 'C:\\Browser\\msedge.exe' });
  const blocked = await run.runner.run(action, [], { trace: true, shortcutTarget: chrome });
  assert.equal(blocked.unavailable, true);
  assert.match(blocked.message, /Google Chrome/);
  assert.deepEqual(run.sent, [['ctrl', 'w']]);
});

test('sequences keep their shortcut target through delays and block mode, layout, and window changes', async () => {
  const toggle = preview('teams').keys.find(({ id }) => id === 'mic').action;
  const context = { executable: 'ms-teams.exe', id: '3:10', windowId: 10n, keyboardLayout: US_LAYOUT, mode: 'a Teams meeting' };
  const macro = { type: 'sequence', steps: [{ type: 'delay', ms: 50 }, { ...toggle, onError: 'continue' }] };
  const page = validateProfile({ keys: [{ id: 'meeting', action: macro }] }).pages[0];
  for (const [changed, reason] of [[{ windowId: 11n, id: '3:11' }, /target window changed/],
    [{ keyboardLayout: 0x04100410 }, /keyboard layout changed/], [{ mode: undefined }, /requires a Teams meeting/i]]) {
    const run = fixture(context);
    const task = runPageAction(page, macro, run.runner, run.readForeground, {}, undefined, { trace: true, shortcutTarget: context });
    run.set({ ...context, ...changed });
    run.resume();
    const result = await task;
    assert.equal(result.unavailable, true);
    assert.match(result.message, reason);
    assert.deepEqual(run.sent, []);
  }
});

test('copied keys retain layout, locale, build and PWA requirements and display a precise reason', async () => {
  const key = preview('excel', 'en-US').keys.find(({ id }) => id === 'autosum');
  assert.equal(key.action.shortcutGuard.layout, US_LAYOUT);
  const excel = { executable: 'excel.exe', windowId: 1n, keyboardLayout: 0x04100410 };
  const page = validateProfile({ keys: [{ id: key.id, action: key.action }] });
  const view = toView(page, { unavailable: ({ action }) => shortcutUnavailable(action.shortcutGuard, {
    ...environment, context: excel, activePack: packFor(excel), shortcutLanguage: 'en-US',
  }) });
  assert.match(view.slots[0].unavailable, /US keyboard layout/);
  const formatting = preview('excel', 'en-US').keys.find(({ id }) => id === 'format-cells');
  assert.equal(formatting.action.shortcutGuard.mode, 'an Excel worksheet');
  const word = preview('word', 'it-IT').keys.find(({ id }) => id === 'bold');
  const run = fixture({ executable: 'winword.exe', windowId: 2n }, { shortcutLanguage: 'en-US' });
  assert.match((await run.runner.run(word.action)).message, /it-IT/);
  const explorer = preview('explorer').keys.find(({ id }) => id === 'new-tab');
  const win10 = { executable: 'explorer.exe', windowId: 3n };
  assert.match(shortcutUnavailable(explorer.action.shortcutGuard, {
    ...environment, context: win10, activePack: packFor(win10), build: 19045,
  }), /Windows 11/);
  const docs = preview('gdocs').keys[0].action;
  const browser = fixture({ executable: 'chrome.exe', appId: 'chrome', windowId: 4n });
  assert.match((await browser.runner.run(docs)).message, /verified Google Docs web app/);
  const appId = 'chrome._crx_' + chromiumWebAppId('https://docs.google.com/document/');
  browser.set({ executable: 'chrome.exe', appId, windowId: 5n });
  assert.match((await browser.runner.run(docs)).message, /Google Docs document editor/);
  browser.set({ executable: 'chrome.exe', appId, windowId: 5n, mode: 'the Google Docs document editor' });
  assert.equal((await browser.runner.run(docs)).ok, true);
});

test('confirmation covers ending calls, permanent deletion and sending messages or invitations', () => {
  for (const action of ['end-call', 'leave-meeting', 'send-message', 'send-invitation', 'permanently-delete']) {
    assert.equal(needsShortcutConfirmation(action, 'Ctrl+Enter'), true, action);
  }
  assert.equal(needsShortcutConfirmation('remove-file', 'Shift+Delete'), true);
  assert.equal(needsShortcutConfirmation('new-message', 'Ctrl+N'), false);
  assert.equal(preview('teams').keys.find((key) => key.binding?.id === 'end-call')?.action.shortcutGuard.confirm, true);
});

test('a confirmation for the same Teams window still requires a current call before sending input', async () => {
  const key = preview('teams').keys.find((entry) => entry.binding?.id === 'end-call');
  const context = { executable: 'ms-teams.exe', windowId: 61n, id: '24:61', mode: 'a Teams meeting', keyboardLayout: US_LAYOUT };
  const run = fixture(context);
  const confirmation = new KeyConfirmation();
  const token = confirmation.begin(key.id, 5, context.windowId);
  run.set({ ...context, mode: undefined });
  assert.equal(confirmation.consume(token, key.id, 5, context.windowId), true);
  const result = await run.runner.run(key.action, [], { trace: true, shortcutTarget: context });
  assert.equal(result.unavailable, true);
  assert.match(result.message, /requires a Teams meeting/i);
  assert.deepEqual(run.sent, []);
});
