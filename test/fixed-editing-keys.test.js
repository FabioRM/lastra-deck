'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { fixedEditingKeys } = require('../src/main/fixed-editing-keys');
const { iconExists } = require('../src/main/icons');
const { shortcutUnavailable, US_LAYOUT } = require('../src/main/shortcut-guards');
const { validateProfile, toView } = require('../src/main/profile');
const { chromiumWebAppId } = require('../src/main/shortcut-packs-web');

const windows = { platform: 'win32' };
const foreground = (executable, extras) => ({ executable, id: 'editor:1', windowId: 11n, keyboardLayout: US_LAYOUT, ...extras });
const view = (context, settings = {}, options = windows) => fixedEditingKeys(settings, context, options);
const chords = (keys) => keys.map(({ action }) => action?.keys);

test('all fixed keys are visible in the preview, and standard bindings require a foreground window', () => {
  const profile = validateProfile({ keys: [] });
  const editing = toView(profile).editingKeys;
  assert.deepEqual(editing.map(({ id }) => id), ['edit:cut', 'edit:copy', 'edit:paste', 'edit:undo', 'edit:redo']);
  assert.ok(editing.every(({ unavailable }) => unavailable));
  assert.ok(view(null).every(({ action, unavailable, icon }) => !action && unavailable && iconExists(icon)));
  assert.deepEqual(chords(view(foreground('notepad.exe'))), ['Ctrl+X', 'Ctrl+C', 'Ctrl+V', 'Ctrl+Z', 'Ctrl+Y']);
  assert.ok(view(foreground('notepad.exe'), {}, { ...windows, pageActive: false }).every(({ action }) => !action));
  assert.ok(view(foreground('explorer.exe', { shell: true })).every(({ action }) => !action));
  assert.ok(view(foreground('chrome.exe', { appId: 'Chrome._crx_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })).every(({ action }) => !action));
});

test('Adobe variants reuse app guards and Photoshop editing requires a verified workspace', () => {
  const guarded = view(foreground('photoshop.exe', { mode: 'the Photoshop workspace' }));
  assert.deepEqual(chords(guarded), ['Ctrl+X', 'Ctrl+C', 'Ctrl+V', 'Ctrl+Z', 'Ctrl+Shift+Z']);
  const redo = guarded.at(-1).action.shortcutGuard;
  assert.equal(redo.mode, 'the Photoshop workspace');
  assert.match(shortcutUnavailable(redo, { ...windows, activePack: { id: 'photoshop' },
    context: foreground('photoshop.exe') }), /Photoshop workspace/);
  assert.ok(view(foreground('photoshop.exe')).every(({ action, unavailable }) => !action && /workspace/.test(unavailable)));
  assert.equal(chords(view(foreground('illustrator.exe'))).at(-1), 'Ctrl+Shift+Z');
  assert.equal(chords(view(foreground('adobe premiere pro.exe'))).at(-1), 'Ctrl+Shift+Z');
});

test('a live terminal and an unknown editor mode keep shell-sensitive actions unavailable', () => {
  const keys = view(foreground('windowsterminal.exe'));
  assert.match(keys[1].unavailable, /selection/);
  assert.equal(keys[1].shortcut, 'Ctrl+Shift+C');
  assert.deepEqual(chords(keys), [undefined, undefined, 'Ctrl+Shift+V', undefined, undefined]);
  assert.ok(view(foreground('conhost.exe')).every(({ action }) => !action));
  assert.ok(view(foreground('Code.exe')).every(({ action, unavailable }) => !action && /VS Code editor/.test(unavailable)));
});

test('reviewed language, layout and mode checks win over a generic editing chord', () => {
  const italianCopy = view(foreground('excel.exe'), { shortcutLanguage: 'it-IT' })[1];
  assert.match(italianCopy.unavailable, /assigns Ctrl\+C to Copy and Italic/);
  assert.equal(italianCopy.action, undefined);
  assert.equal(chords(view(foreground('excel.exe'), { shortcutLanguage: 'en-US' }))[1], 'Ctrl+C');
  const englishWord = view(foreground('winword.exe', { mode: 'the Microsoft Word document editor' }), { shortcutLanguage: 'en-US' });
  assert.equal(englishWord.at(-1).action.shortcutGuard.layout, US_LAYOUT);
  assert.equal(englishWord.at(-1).action.shortcutGuard.language, 'en-US');
  assert.equal(englishWord.at(-1).action.shortcutGuard.mode, 'the Microsoft Word document editor');
  assert.ok(view(foreground('winword.exe', { mode: 'the Microsoft Word document editor', keyboardLayout: 0x04100410 }),
    { shortcutLanguage: 'en-US' }).at(-1).unavailable);
});

test('a verified web app uses its reviewed editing chords only inside its editor mode', () => {
  const appId = 'Chrome._crx_' + chromiumWebAppId('https://docs.google.com/document/');
  const context = foreground('chrome.exe', { appId });
  assert.ok(view(context).every(({ action, unavailable }) => !action && /Google Docs document editor/.test(unavailable)));
  const editing = view({ ...context, mode: 'the Google Docs document editor' });
  assert.deepEqual(chords(editing), ['Ctrl+X', 'Ctrl+C', 'Ctrl+V', 'Ctrl+Z', 'Ctrl+Shift+Z']);
  assert.equal(editing.at(-1).action.shortcutGuard.platform, 'web');
});

test('the view omits equivalent editing shortcuts while retaining authored actions and special gestures', () => {
  const copy = { id: 'my-copy', label: 'Copia', action: { type: 'hotkey', keys: 'Control+C' } };
  const macro = { ...copy, id: 'extended-copy', double: { type: 'hotkey', keys: 'Ctrl+P' } };
  const pasteSpecial = { id: 'paste-special', label: 'Paste special', action: { type: 'hotkey', keys: 'Ctrl+Alt+V' } };
  const profile = validateProfile({ keys: [copy, macro, pasteSpecial] });
  const surface = toView(profile, { editingKeys: view(foreground('notepad.exe')), foregroundExecutable: 'notepad.exe' });
  assert.deepEqual(surface.slots.slice(0, 3).map((slot) => slot?.id ?? null), [null, 'extended-copy', 'paste-special']);
  assert.deepEqual(profile.pages[0].keys.map(({ id }) => id), ['my-copy', 'extended-copy', 'paste-special']);
});
