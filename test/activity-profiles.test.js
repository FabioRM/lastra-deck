'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { test } = require('node:test');
const { ActivityProfiles } = require('../src/main/activity-profiles');
const { Pages } = require('../src/main/pages');
const { iconExists } = require('../src/main/icons');
const { parseCombo } = require('../src/main/actions/keys');
const { validateProfile } = require('../src/main/profile');
const retired = require('./fixtures/retired-default-pages.json');
const { tempDir } = require('./helpers/temp-dir');

function setup(t) {
  let activity;
  t.after(() => activity?.current?.store.close());
  const directory = tempDir(t, 'lastra-activities-');
  activity = new ActivityProfiles({ directory, stockDirectory: path.resolve(__dirname, '../profiles') });
  return { activity, directory };
}

test('an explicitly provided profile stays isolated from the activity presets', (t) => {
  const { directory } = setup(t);
  const file = path.join(directory, 'custom.json');
  fs.writeFileSync(file, JSON.stringify({ name: 'Custom', keys: [] }));
  const explicit = new ActivityProfiles({ directory, stockDirectory: path.resolve(__dirname, '../profiles'), explicitFile: file });
  const { store } = explicit.activate('main');
  try {
    assert.equal(store.file, file);
    assert.equal(store.current.name, 'Custom');
    assert.equal(explicit.snapshot(), null);
    assert.throws(() => explicit.activate('meeting'), /Unknown activity profile/);
    assert.equal(fs.existsSync(path.join(directory, 'profile-meeting.json')), false);
  } finally {
    store.close();
  }
});

test('activity files start separately and a pinned editor saves only the file it opened', (t) => {
  const { activity, directory } = setup(t);
  const { store: main } = activity.activate('main');
  const original = fs.readFileSync(main.file, 'utf8');
  const draft = main.editorSnapshot();
  assert.equal(fs.existsSync(path.join(directory, 'profile-work.json')), false);

  const { store: work } = activity.activate('work');
  assert.equal(work.current.name, 'Work');
  const workFile = fs.readFileSync(work.file, 'utf8');
  assert.equal(fs.readFileSync(main.file, 'utf8'), original);
  assert.equal(main.watcher, null);
  let changes = 0;
  activity.on('change', () => changes++);
  draft.profile.name = 'Edited Main';
  main.save(draft.profile, draft.token);
  assert.equal(changes, 0);
  assert.equal(fs.readFileSync(work.file, 'utf8'), workFile);
  assert.equal(fs.readFileSync(`${main.file}.bak`, 'utf8'), original);
  assert.equal(activity.activate('main').store, main);
  assert.equal(main.current.name, 'Edited Main');
  assert.throws(() => activity.activate('../work'), /Unknown activity profile/);
  assert.equal(activity.snapshot().active, 'main');
});

test('a damaged activity falls back to its own last valid configuration and watches its own file', async (t) => {
  const { activity } = setup(t);
  const { store: work } = activity.activate('work');
  const { profile, token } = work.editorSnapshot();
  profile.name = 'Private Work';
  work.save(profile, token);
  activity.activate('meeting');
  fs.writeFileSync(work.file, '{broken');
  const recovered = activity.activate('work');
  assert.match(recovered.warning, /malformed/);
  assert.equal(recovered.store.current.name, 'Private Work');
  assert.equal(fs.readFileSync(work.file, 'utf8'), '{broken');

  const updated = once(activity, 'change', { signal: AbortSignal.timeout(3_000) });
  fs.writeFileSync(work.file, JSON.stringify({ ...profile, name: 'Repaired Work' }));
  await updated;
  assert.equal(work.current.name, 'Repaired Work');
});

test('Main retires untouched and editor-saved stock pages, backs up the file, and preserves customised matches', (t) => {
  const { activity, directory } = setup(t);
  const mainFile = path.join(directory, 'profile.json');
  const root = { name: 'Existing setup', grid: { cols: 8, rows: 3 }, pages: [
    { id: 'home', name: 'My Start', keys: [] }, ...retired,
    { id: 'project', name: 'My project', apps: ['code.exe'], windowTitle: { mode: 'contains', value: 'Project' }, priority: 42, keys: [] },
  ] };
  const [, , savedBrowser] = validateProfile(root).pages;
  const mixed = JSON.stringify({ ...root, pages: [root.pages[0], retired[0], savedBrowser, root.pages[3]] });
  fs.writeFileSync(mainFile, mixed);
  const { store } = activity.activate('main');
  assert.deepEqual(store.current.pages.map(({ id }) => id), ['home', 'project']);
  assert.equal(store.current.pages[0].name, 'My Start');
  assert.equal(store.current.pages[1].priority, 42);
  assert.equal(JSON.parse(fs.readFileSync(mainFile, 'utf8')).pages[1].id, 'project');
  assert.equal(fs.readFileSync(`${mainFile}.before-automatic-pages.bak`, 'utf8'), mixed);
  assert.ok(store.editorBackups().versions.some(({ name }) => name === 'Existing setup'));

  const pages = new Pages();
  pages.observe({ executable: 'code.exe', windowId: 1n, title: 'Project · Code' });
  assert.equal(pages.current(store.current).id, 'project');
  pages.observe({ executable: 'code.exe', windowId: 2n, title: 'Another window' });
  assert.equal(pages.current(store.current).pack, 'vscode');
  assert.deepEqual(activity.activate('work').store.current.pages.map(({ id }) => id), ['home', 'development', 'browser']);
});

test('stock retirement keeps a changed page with the same ID and creates a fallback if needed', (t) => {
  const { activity, directory } = setup(t);
  const mainFile = path.join(directory, 'profile.json');
  const custom = { ...retired[1], priority: 12, keys: retired[1].keys.map((key, index) => index ? key : { ...key, label: 'Custom tab' }) };
  fs.writeFileSync(mainFile, JSON.stringify({ grid: { cols: 8, rows: 3 }, pages: [retired[0], custom] }));
  const { store } = activity.activate('main');
  assert.deepEqual(store.current.pages.map(({ id }) => id), ['browser']);
  assert.equal(store.current.pages[0].keys[0].label, 'Custom tab');
  assert.equal(store.current.pages[0].priority, 12);
  store.close();
  fs.writeFileSync(mainFile, JSON.stringify({ grid: { cols: 8, rows: 3 }, pages: retired }));
  assert.deepEqual(store.load({ upgradeStock: true }).pages.map(({ id, keys }) => [id, keys]), [['home', []]]);
});

test('the four stock activity profiles contain contextual pages and only match relevant apps', (t) => {
  const { activity } = setup(t);
  const pages = new Pages();
  const examples = { work: ['code.exe', 'development'], meeting: ['ms-teams.exe', 'teams'],
    gaming: ['steam.exe', 'steam'], streaming: ['obs64.exe', 'obs'] };
  for (const [id, [executable, matched]] of Object.entries(examples)) {
    const profile = activity.activate(id).store.current;
    for (const page of profile.pages) for (const key of page.keys.filter(Boolean)) {
      assert.ok(iconExists(key.icon), `${id}: ${key.icon}`);
      if (key.action.type === 'hotkey') assert.doesNotThrow(() => parseCombo(key.action.keys));
    }
    pages.restore(profile, { page: null, locked: false }, { contextOnly: true });
    pages.observe({ executable: 'unrelated.exe', windowId: 1n });
    assert.equal(pages.current(profile).id, 'home');
    pages.observe({ executable, windowId: 2n });
    assert.equal(pages.selection(profile).reason, 'executable');
    assert.equal(pages.current(profile).id, matched);
    assert.equal(pages.binding(pages.current(profile)).target.windowId, 2n);
    pages.toggleLock(profile);
  }
});
