'use strict';

const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { createActionRunner } = require('../src/main/actions');
const { DeckNavigation } = require('../src/main/deck-navigation');
const { findEdgeDisplay } = require('../src/main/display');
const { restoreDeckWindow, watchDeckDisplay } = require('../src/main/display-lifecycle');
const { IGNORED, KeyPresses } = require('../src/main/key-presses');
const { Pages, runPageAction } = require('../src/main/pages');
const { ProfileStore, toView, validateProfile } = require('../src/main/profile');
const { tempDir } = require('./helpers/temp-dir');

const simulator = { executable: 'sample-editor.exe', path: 'c:\\sample\\sample-editor.exe' };

function sampleProfile() {
  return {
    name: 'Recovery sample',
    grid: { cols: 2, rows: 1 },
    pages: [
      { id: 'writing', name: 'Writing', apps: [simulator.executable], windowTitle: { mode: 'exact', value: 'Draft' },
        keys: [{ id: 'command', label: 'Find draft', onBusy: 'queue-one', action: { type: 'sequence', steps: [
          { type: 'delay', ms: 100 }, { type: 'hotkey', keys: 'Ctrl+F' },
        ] } }] },
      { id: 'review', name: 'Review', apps: [simulator.executable], windowTitle: { mode: 'exact', value: 'Review notes' },
        keys: [{ id: 'command', label: 'Save notes', action: { type: 'hotkey', keys: 'Ctrl+S' } }] },
    ],
  };
}

test('display reconnection restores the named panel and a sustained outage leaves the desktop untouched', { timeout: 3000 }, async (t) => {
  const desktop = { id: 1, label: 'Desktop', scaleFactor: 1, rotation: 0,
    size: { width: 1920, height: 1080 }, bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
  const landscape = { id: 2, label: 'CORSAIR XENEON EDGE', scaleFactor: 1, rotation: 0,
    size: { width: 2560, height: 720 }, bounds: { x: -2560, y: 0, width: 2560, height: 720 } };
  const portrait = { ...landscape, id: 3, scaleFactor: 1.25, rotation: 90,
    size: { width: 576, height: 2048 }, bounds: { x: 1920, y: 0, width: 576, height: 2048 } };
  const screen = new EventEmitter();
  const outcomes = new EventEmitter();
  const placements = [];
  let displays = [desktop, landscape];
  let bounds = landscape.bounds;
  let previous = landscape;
  const window = {
    getBounds: () => bounds,
    setBounds(next) { bounds = next; placements.push(next); },
    setAlwaysOnTop(top, level) { assert.deepEqual([top, level], [true, 'screen-saver']); },
    isVisible: () => true,
    isMinimized: () => false,
    showInactive() { placements.push('visible without activation'); },
  };
  const watcher = watchDeckDisplay({
    screen, powerMonitor: new EventEmitter(), settleMs: 0,
    select: () => findEdgeDisplay(displays),
    restore(display) {
      restoreDeckWindow(window, display, { previous, ready: true });
      previous = display;
      outcomes.emit('restored', display.id);
    },
    missing: () => outcomes.emit('missing'),
  });
  t.after(() => watcher.stop());

  const restored = once(outcomes, 'restored');
  displays = [desktop];
  screen.emit('display-removed');
  displays.push(portrait);
  screen.emit('display-added');
  assert.deepEqual(await restored, [portrait.id]);
  assert.deepEqual(placements, [portrait.bounds, 'visible without activation']);

  const missing = once(outcomes, 'missing');
  displays = [desktop];
  screen.emit('display-removed');
  await missing;
  assert.equal(bounds, portrait.bounds);
  assert.equal(placements.length, 2);
});

test('changing a targeted page cancels queued and delayed gestures before a matching key can run on the next page', async () => {
  const profile = validateProfile(sampleProfile());
  const pages = new Pages();
  const presses = new KeyPresses();
  let foreground = { ...simulator, id: '17:100', windowId: 100n, title: 'Draft' };
  const readForeground = () => foreground.executable;
  readForeground.context = () => foreground;
  readForeground.windowId = () => foreground.windowId;
  pages.observe(foreground);
  const sent = [];
  let releaseDelay;
  const runner = createActionRunner({ readForeground,
    input: { sendChord: (keys) => sent.push({ target: foreground.windowId, keys: keys.map(({ name }) => name) }) },
    sleep: () => new Promise((resolve) => { releaseDelay = resolve; }),
  });
  function press() {
    const page = pages.current(profile);
    const binding = pages.binding(page);
    assert.equal(binding.active, true);
    const { id, action, onBusy } = page.keys[0];
    const revision = pages.revision;
    return presses.run(`${page.id}/${id}`, onBusy,
      () => runPageAction(page, action, runner, readForeground, binding, () => pages.revision === revision));
  }

  assert.equal(pages.current(profile).id, 'writing');
  const first = press();
  const queued = press();
  assert.equal(typeof releaseDelay, 'function');
  foreground = { ...simulator, id: '17:101', windowId: 101n, title: 'Review notes' };
  pages.observe(foreground);
  pages.revision++;
  presses.cancelPending();
  assert.equal(pages.current(profile).id, 'review');
  assert.equal(toView(profile, { page: pages.current(profile) }).slots[0].label, 'Save notes');
  assert.equal(await queued, IGNORED);
  releaseDelay();
  assert.match((await first).message, /page or target window changed/i);
  assert.deepEqual(sent, []);
  assert.equal((await press()).ok, true);
  assert.deepEqual(sent, [{ target: 101n, keys: ['ctrl', 's'] }]);
});

test('a restart restores a saved profile and fallback page while dropping the transient automatic target', (t) => {
  const directory = tempDir(t, 'lastra-recovery-');
  const file = join(directory, 'profile.json');
  const defaultFile = join(directory, 'default.json');
  const navigationFile = join(directory, 'deck-navigation.json');
  writeFileSync(defaultFile, JSON.stringify(sampleProfile()));
  const firstStore = new ProfileStore({ file, defaultFile });
  firstStore.load();
  const draft = firstStore.editorSnapshot();
  draft.profile.pages[1].keys[0].label = 'Save reviewed notes';
  const { profile } = firstStore.save(draft.profile, draft.token);
  const firstPages = new Pages();
  firstPages.select(profile, 'review');
  firstPages.observe({ executable: 'sample-viewer.exe', id: '21:120', windowId: 120n });
  firstPages.toggleLock(profile);
  const before = firstPages.current(profile);
  assert.equal(before.generated, true);
  assert.equal(firstPages.binding(before).target.windowId, 120n);

  const navigation = new DeckNavigation(navigationFile);
  navigation.setView('keys');
  navigation.setPage(firstPages.savedPage, firstPages.locked);

  const recovered = new ProfileStore({ file, defaultFile }).load();
  const { current } = new DeckNavigation(navigationFile);
  assert.deepEqual(current, { view: 'keys', page: 'review', locked: true, calendar: 'none', activity: 'main',
    activityPages: {}, desktopRevealGesture: false, contextReturn: 'manual' });
  const restartedPages = new Pages();
  restartedPages.select(recovered, current.page);
  restartedPages.toggleLock(recovered);
  const active = restartedPages.current(recovered);
  assert.equal(active.id, 'review');
  assert.equal(toView(recovered, { page: active }).slots[0].label, 'Save reviewed notes');
  assert.equal(Boolean(restartedPages.binding(active).active), false);

  restartedPages.observe({ ...simulator, id: '32:160', windowId: 160n, title: 'Review notes' });
  const binding = restartedPages.binding(active);
  assert.equal(binding.active, true);
  assert.equal(binding.target.windowId, 160n);
});
