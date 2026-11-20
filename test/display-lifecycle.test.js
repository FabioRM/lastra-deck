'use strict';

const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const { test } = require('node:test');
const { restoreDeckWindow, watchDeckDisplay } = require('../src/main/display-lifecycle');
const { createWindowsStartup } = require('../src/main/windows-startup');

const edge = { id: 12, scaleFactor: 1, rotation: 0, bounds: { x: -2560, y: 0, width: 2560, height: 720 } };

test('a rotated and displaced deck reuses its window and restores the non-activating placement', () => {
  const calls = [];
  let position = { x: 0, y: 0, width: 1920, height: 1080 };
  const window = {
    getBounds: () => position,
    setBounds(bounds) { position = bounds; calls.push('position'); },
    setAlwaysOnTop(...args) { calls.push(args); },
    isVisible: () => false,
    showInactive() { calls.push('show inactive'); },
  };
  const portrait = { ...edge, rotation: 90, scaleFactor: 1.25, bounds: { x: 1920, y: 0, width: 576, height: 2048 } };
  assert.equal(restoreDeckWindow(window, portrait, { previous: edge, ready: false }), true);
  assert.deepEqual(calls, ['position']);
  assert.deepEqual(position, portrait.bounds);
  assert.equal(restoreDeckWindow(window, portrait, { previous: portrait, ready: true }), false);
  assert.deepEqual(calls, ['position', [true, 'screen-saver'], 'show inactive']);

  position = { ...portrait.bounds, height: portrait.bounds.height + 1 };
  assert.equal(restoreDeckWindow(window, portrait, { previous: portrait, ready: false }), false);
  position = edge.bounds;
  assert.equal(restoreDeckWindow(window, portrait, { previous: portrait, ready: true }), true);
  assert.deepEqual(position, portrait.bounds);
});

function watcher(t) {
  const screen = new EventEmitter();
  const powerMonitor = new EventEmitter();
  const result = new EventEmitter();
  let available = edge;
  let reads = 0;
  const lifecycle = watchDeckDisplay({
    screen, powerMonitor, settleMs: 2, wakeMs: 20,
    select() { reads++; return available; },
    restore: (display) => result.emit('restored', display),
    missing: () => result.emit('missing'),
  });
  t.after(() => lifecycle.stop());
  return { screen, powerMonitor, result, lifecycle, setDisplay: (display) => { available = display; }, reads: () => reads };
}

test('transient display removal settles to the new display and a sustained removal requests exit', async (t) => {
  const { screen, result, setDisplay, reads } = watcher(t);
  const relocated = { ...edge, id: 21 };
  const restored = once(result, 'restored');
  setDisplay(null);
  screen.emit('display-removed');
  setDisplay(relocated);
  screen.emit('display-added');
  assert.deepEqual(await restored, [relocated]);
  assert.equal(reads(), 1);

  const missing = once(result, 'missing');
  setDisplay(null);
  screen.emit('display-removed');
  await missing;
  assert.equal(reads(), 2);
});

test('suspension cancels pending work and resume allows display enumeration to settle', async (t) => {
  const { screen, powerMonitor, result, lifecycle, setDisplay, reads } = watcher(t);
  setDisplay(null);
  screen.emit('display-removed');
  powerMonitor.emit('suspend');
  await delay(6);
  assert.equal(reads(), 0);
  const restored = once(result, 'restored');
  powerMonitor.emit('resume');
  screen.emit('display-metrics-changed');
  powerMonitor.emit('unlock-screen');
  await delay(6);
  assert.equal(reads(), 0);
  setDisplay(edge);
  assert.deepEqual(await restored, [edge]);
  assert.equal(reads(), 1);

  powerMonitor.emit('resume');
  lifecycle.stop();
  assert.equal(screen.listenerCount('display-added'), 0);
  assert.equal(powerMonitor.listenerCount('resume'), 0);
  await delay(22);
  assert.equal(reads(), 1);
});

test('the startup setting writes the named Windows login item only after an explicit action', () => {
  let openAtLogin = false;
  let launchItems = [{ name: 'some-other-app', scope: 'user', enabled: true }];
  const settings = { path: 'C:\\Program Files\\Electron\\electron.exe', args: ['"D:\\My App\\lastra"'] };
  const writes = [];
  const startup = createWindowsStartup({
    isPackaged: false,
    getLoginItemSettings(options) {
      assert.deepEqual(options, settings);
      return { openAtLogin, launchItems };
    },
    setLoginItemSettings(options) {
      writes.push(options);
      openAtLogin = options.openAtLogin;
      launchItems = [{ name: options.name, scope: 'user', enabled: options.enabled }];
    },
  }, { appId: 'lastra.deck', executable: settings.path, root: 'D:\\My App\\lastra' });

  assert.equal(startup.isEnabled(), false);
  assert.deepEqual(writes, []);
  startup.setEnabled(true);
  assert.deepEqual(writes[0], { ...settings, name: 'lastra.deck', openAtLogin: true, enabled: true });
  assert.equal(startup.isEnabled(), true);
  launchItems[0].enabled = false;
  assert.equal(startup.isEnabled(), false);
  startup.setEnabled(false);
  assert.deepEqual(writes[1], { ...settings, name: 'lastra.deck', openAtLogin: false, enabled: false });
});

test('packaged startup uses its executable and verifies Windows applied the change', () => {
  const startup = createWindowsStartup({
    isPackaged: true,
    getLoginItemSettings: () => ({ openAtLogin: false, launchItems: [] }),
    setLoginItemSettings({ args }) { assert.deepEqual(args, []); },
  }, { appId: 'lastra.deck', executable: 'C:\\Lastra.exe', root: 'unused' });
  assert.throws(() => startup.setEnabled(true), /did not apply/);
});
