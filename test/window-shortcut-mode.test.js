'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createActionRunner } = require('../src/main/actions');
const { PowerShellWorker } = require('../src/main/powershell-worker');
const { US_LAYOUT } = require('../src/main/shortcut-guards');
const { packFor, packKeys } = require('../src/main/shortcut-packs');
const { chromiumWebAppId } = require('../src/main/shortcut-packs-web');
const { createWindowShortcutMode } = require('../src/main/window-shortcut-mode');

const docs = { id: '10:123', windowId: 123n, executable: 'msedge.exe', keyboardLayout: US_LAYOUT,
  appId: 'msedge._crx_' + chromiumWebAppId('https://docs.google.com/document/') };
const zoom = { id: '20:456', windowId: 456n, executable: 'zoom.exe', keyboardLayout: US_LAYOUT };
const mode = 'the Google Docs document editor';
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('window mode evidence expires, follows the exact pack/window and is renewed before input', async (t) => {
  let now = 0;
  const probes = [];
  const detector = createWindowShortcutMode({ findPack: packFor, now: () => now,
    worker: { run(_, request) { return new Promise((resolve) => probes.push({ resolve, ...request.env })); }, dispose() {} } });
  t.after(() => detector.dispose());

  assert.equal(detector.read({ ...docs, appId: '' }), undefined);
  assert.equal(probes.length, 0);
  assert.equal(detector.read(docs), undefined);
  assert.equal(probes[0].LASTRA_SURFACE_HWND, '123');
  assert.equal(probes[0].LASTRA_SURFACE_PACK, 'gdocs');
  probes[0].resolve('True\r\n');
  await settle();
  assert.equal(detector.read(docs), mode);

  const recheck = detector.refresh(docs, mode);
  await settle();
  probes[1].resolve('False');
  assert.equal(await recheck, false);
  assert.equal(detector.read(docs), undefined);

  now += 800;
  detector.read(docs);
  detector.read(zoom);
  probes[2].resolve('True');
  await settle();
  assert.equal(detector.read(zoom), undefined);
  assert.equal(probes[3].LASTRA_SURFACE_PACK, 'zoom');
  probes[3].resolve('True');
  await settle();
  assert.equal(detector.read(zoom), 'a Zoom meeting');
  now += 3000;
  assert.equal(detector.read(zoom), undefined);
  probes[4].resolve('False');
});

test('hotkey dispatch rechecks in-window mode and focus after asynchronous detection', async () => {
  const initial = { ...docs, mode };
  let current = initial;
  let changes = 'home';
  const sent = [];
  const key = packKeys(packFor(docs), initial).find(({ id }) => id === 'word-count');
  const { mode: currentMode, ...legacyGuard } = key.action.shortcutGuard;
  assert.equal(currentMode, mode);
  const saved = { ...key.action, shortcutGuard: legacyGuard };
  const foreground = Object.assign(() => current.executable, { context: () => current, windowId: () => current.windowId,
    async refreshMode(target, required) {
      assert.equal(target, initial);
      assert.equal(required, mode);
      if (changes === 'home') return false;
      if (changes === 'switch') current = zoom;
      return true;
    } });
  const runner = createActionRunner({ readForeground: foreground, readShortcutSettings: () => ({ platform: 'win32' }),
    input: { sendChord: (keys) => sent.push(keys.map(({ name }) => name)) } });
  assert.match((await runner.run(key.action)).message, /Requires the Google Docs document editor/);
  assert.match((await runner.run(saved)).message, /Requires the Google Docs document editor/);
  changes = 'switch';
  assert.equal((await runner.run(key.action)).ok, false);
  assert.deepEqual(sent, []);
  changes = 'stay';
  current = initial;
  assert.equal((await runner.run(key.action)).ok, true);
  assert.deepEqual(sent, [['ctrl', 'shift', 'c']]);
});

test('the Windows helper compiles and checks trusted editor URLs without sending input', { skip: process.platform !== 'win32' }, async (t) => {
  const worker = new PowerShellWorker({ mta: true });
  t.after(() => worker.dispose());
  let native;
  const detector = createWindowShortcutMode({ findPack: packFor, worker: {
    run(script, { env }) {
      native = worker.run(script + String.raw`
[LastraWindowShortcutMode]::EditorUrl('gdocs', 'https://docs.google.com/document/d/abc_123/edit')
[LastraWindowShortcutMode]::EditorUrl('gsheets', 'https://docs.google.com/spreadsheets/u/1/d/abc-123/edit#gid=0')
[LastraWindowShortcutMode]::EditorUrl('google-slides', 'https://docs.google.com/presentation/d/abc-123/edit')
[LastraWindowShortcutMode]::EditorUrl('gdocs', 'https://docs.google.com/document/u/0/')
[LastraWindowShortcutMode]::EditorUrl('gdocs', 'https://docs.google.com/document/d/abc_123/preview')
[LastraWindowShortcutMode]::EditorUrl('gdocs', 'https://docs.google.com.example.org/document/d/abc_123/edit')
[LastraWindowShortcutMode]::EditorUrl('gdocs', 'https://docs.google.com/spreadsheets/d/abc_123/edit')
`, { env: { ...env, LASTRA_SURFACE_HWND: '0' }, timeout: 10000 });
      return native;
    }, dispose() {},
  } });
  t.after(() => detector.dispose());
  detector.read(docs);
  assert.deepEqual((await native).trim().split(/\s+/), ['False', 'True', 'True', 'True', 'False', 'False', 'False', 'False']);
});
