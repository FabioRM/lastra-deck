'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { ProfileStore, toView } = require('../src/main/profile');
const { projectEditingPage } = require('../src/shared/editing-keys');
const { tempDir } = require('./helpers/temp-dir');

const defaultFile = path.join(__dirname, '..', 'profiles', 'default.json');

function temporaryProfile(t) {
  const directory = tempDir(t, 'lastra-profile-history-');
  const file = path.join(directory, 'profile.json');
  return { file, store: new ProfileStore({ file, defaultFile }) };
}

function profileText(name) {
  return JSON.stringify({ name, keys: [null, { id: 'key', action: { type: 'hotkey', keys: 'ctrl+f' } }] });
}

test('stock Home fits one screen in both orientations and old profiles get a recoverable migration', (t) => {
  const { file, store } = temporaryProfile(t);
  const before = fs.readFileSync(path.join(__dirname, 'fixtures', 'home-before-compaction.json'), 'utf8');
  fs.writeFileSync(file, before);
  const migrated = store.load({ upgradeStock: true });
  const { grid, slots, widgets } = toView(migrated);
  assert.equal(slots.filter(Boolean).length, 15);
  assert.ok(slots.slice(0, 15).every(Boolean) && slots.slice(15).every((slot) => !slot));
  for (const portrait of [false, true]) assert.equal(projectEditingPage(grid, slots, widgets, portrait).sheets.length, 1);
  for (const id of ['vscode', 'claude', 'windows-microphone', 'mute-speakers', 'mic-teams', 'mic-meet', 'volume-down', 'volume-up']) {
    assert.ok(!slots.some((key) => key?.id === id));
  }
  assert.equal(fs.readFileSync(`${file}.before-compact-home.bak`, 'utf8'), before);
  assert.deepEqual(store.load({ upgradeStock: true }), migrated);
  const backup = store.editorBackups().versions.find((version) => version.id === store.backupVersions()
    .find((entry) => entry.text === before).id);
  store.restoreBackup(backup.id, store.editorSnapshot().token);
  assert.equal(store.load().pages[0].keys.filter(Boolean).length, 23);
});

test('older customised Home preserves edited actions and removes stock volume controls', (t) => {
  const { file, store } = temporaryProfile(t);
  const profile = require('./fixtures/home-before-compaction.json');
  const custom = structuredClone(profile);
  custom.pages[0].keys[1].label = 'My editor';
  custom.pages[0].keys = custom.pages[0].keys.map((key) => {
    if (key?.id === 'mic-meet') return { ...key, action: { type: 'hotkey', keys: 'ctrl+alt+d' } };
    if (key?.id === 'mic-teams') return null;
    return key;
  });
  const text = JSON.stringify(custom);
  fs.writeFileSync(file, text);
  const { keys } = store.load({ upgradeStock: true }).pages[0];
  assert.equal(keys[1].label, 'My editor');
  assert.equal(keys.find((key) => key?.id === 'mic-meet').action.keys, 'ctrl+alt+d');
  assert.ok(!keys.some((key) => key?.id === 'volume-up' || key?.id === 'volume-down'));
  assert.equal(fs.readFileSync(`${file}.before-home-volume-removal.bak`, 'utf8'), text);
  assert.equal(fs.existsSync(`${file}.before-compact-home.bak`), false);
});

test('volume migration only retires the Home media keys and keeps the other buttons in order', (t) => {
  const { file, store } = temporaryProfile(t);
  const profile = require(defaultFile);
  const [volumeDown, volumeUp] = require('./fixtures/home-before-compaction.json').pages[0].keys
    .filter((key) => ['volume-down', 'volume-up'].includes(key?.id));
  const [terminal, explorer] = profile.pages[0].keys;
  const rebound = { ...volumeUp, action: { type: 'hotkey', keys: 'Ctrl+R' } };
  const pages = [{ id: 'home', keys: [terminal, volumeDown, null, explorer, rebound] },
    { id: 'media', keys: [volumeDown, volumeUp] }];
  const before = JSON.stringify({ ...profile, pages });
  fs.writeFileSync(file, before);
  const migrated = store.load({ upgradeHomeVolume: true });
  assert.deepEqual(migrated.pages[0].keys.map((key) => key?.id ?? null), ['terminal', 'file-explorer', 'volume-up', null, null]);
  assert.deepEqual(migrated.pages[0].keys[2].action, rebound.action);
  assert.deepEqual(migrated.pages[1].keys.map((key) => key.id), ['volume-down', 'volume-up']);
  assert.equal(fs.readFileSync(`${file}.before-home-volume-removal.bak`, 'utf8'), before);
  assert.deepEqual(store.load({ upgradeHomeVolume: true }), migrated);
});

test('Home removes the stock app microphone shortcuts and leaves the same keys on other pages', (t) => {
  const { file, store } = temporaryProfile(t);
  const home = structuredClone(require(defaultFile).pages[0]);
  const [teams, meet] = require('./fixtures/home-before-compaction.json').pages[0].keys
    .filter((key) => ['mic-teams', 'mic-meet'].includes(key?.id));
  const pages = [{ ...home, keys: [home.keys[0], teams, null, meet] }, { id: 'meeting', name: 'Meeting', keys: [teams, meet] }];
  const previous = JSON.stringify({ ...require(defaultFile), pages });
  fs.writeFileSync(file, previous);
  const migrated = store.load({ upgradeStock: true });
  assert.deepEqual(migrated.pages[0].keys.map((key) => key?.id ?? null), ['terminal', null, null, null]);
  assert.deepEqual(migrated.pages[1].keys.map((key) => key.id), ['mic-teams', 'mic-meet']);
  assert.equal(fs.readFileSync(file + '.before-home-mic-removal.bak', 'utf8'), previous);
});

test('rotates distinct accepted external versions and recovers the last valid profile on restart', (t) => {
  const { file, store } = temporaryProfile(t);
  for (let i = 1; i <= 12; i++) {
    fs.writeFileSync(file, profileText(`Edit ${i}`));
    store.load();
  }
  store.load();

  const expected = Array.from({ length: 9 }, (_, index) => `Edit ${11 - index}`);
  assert.deepEqual(store.editorBackups().versions.map(({ name }) => name), expected);
  const archive = JSON.parse(fs.readFileSync(`${file}.history`, 'utf8'));
  assert.equal(archive.entries.length, 10);

  fs.writeFileSync(file, '{broken');
  const restarted = new ProfileStore({ file, defaultFile });
  assert.throws(() => restarted.load(), /malformed JSON/);
  assert.equal(restarted.fallback().name, 'Edit 12');
  assert.equal(restarted.editorBackups().versions[0].name, 'Edit 12');
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  assert.equal(restarted.editorSnapshot().profile.name, 'Edit 12');
});

test('restore validates the disk token, reuses legacy data, and archives the replaced profile', (t) => {
  const { file, store } = temporaryProfile(t);
  const beforeUpgrade = '\uFEFF' + profileText('Before upgrade');
  const previous = profileText('Previous');
  fs.writeFileSync(`${file}.before-english.bak`, beforeUpgrade);
  fs.writeFileSync(`${file}.bak`, previous);
  fs.writeFileSync(file, profileText('Current'));
  store.load();

  const backup = store.editorBackups().versions.find(({ name }) => name === 'Before upgrade');
  assert.equal(backup.source, 'before-english');
  assert.equal(store.editorBackups().versions.find(({ name }) => name === 'Previous').name, 'Previous');
  const stale = store.editorSnapshot().token;
  fs.writeFileSync(file, profileText('External edit'));
  assert.throws(() => store.restoreBackup(backup.id, stale), /changed on disk/);
  assert.equal(fs.readFileSync(`${file}.bak`, 'utf8'), previous);
  assert.throws(() => store.restoreBackup('../../profile.json', store.editorSnapshot().token), /no longer available/);

  const changes = [];
  store.on('change', (profile) => changes.push(profile.name));
  const restored = store.restoreBackup(backup.id, store.editorSnapshot().token);
  assert.equal(restored.profile.name, 'Before upgrade');
  assert.equal(restored.profile.keys[0], null);
  assert.equal(fs.readFileSync(file, 'utf8'), beforeUpgrade);
  assert.equal(fs.readFileSync(`${file}.before-english.bak`, 'utf8'), beforeUpgrade);
  assert.equal(fs.readFileSync(`${file}.bak`, 'utf8'), profileText('External edit'));
  assert.equal(store.editorBackups().versions[0].name, 'External edit');
  assert.deepEqual(changes, ['Before upgrade']);
});

test('a missing profile is recoverable without replacing the latest valid data', (t) => {
  const { file, store } = temporaryProfile(t);
  fs.writeFileSync(`${file}.bak`, profileText('Previous'));
  assert.throws(() => store.load(), /Profile file is missing/);
  assert.equal(store.fallback().name, 'Previous');
  assert.equal(fs.existsSync(file), false);

  const [backup] = store.editorBackups().versions;
  const before = store.editorSnapshot();
  assert.match(before.warning, /Profile file is missing/);
  assert.equal(store.restoreBackup(backup.id, before.token).profile.name, 'Previous');
  assert.equal(fs.readFileSync(file, 'utf8'), profileText('Previous'));
});

test('restoring while the active file is malformed leaves the original malformed data available', (t) => {
  const { file, store } = temporaryProfile(t);
  fs.writeFileSync(file, profileText('Working'));
  store.load();
  fs.writeFileSync(file, '{broken');

  const [backup] = store.editorBackups().versions;
  assert.equal(store.restoreBackup(backup.id, store.editorSnapshot().token).profile.name, 'Working');
  assert.equal(fs.readFileSync(`${file}.invalid`, 'utf8'), '{broken');
  assert.equal(fs.existsSync(`${file}.bak`), false);
});

test('a history archive failure does not block an editor save with a valid previous-file backup', (t) => {
  const { file, store } = temporaryProfile(t);
  fs.mkdirSync(`${file}.history`);
  fs.writeFileSync(file, profileText('Previous working profile'));
  store.load();

  const { profile, token } = store.editorSnapshot();
  const saved = store.save({ ...profile, name: 'New working profile' }, token);
  assert.equal(saved.profile.name, 'New working profile');
  assert.equal(fs.readFileSync(`${file}.bak`, 'utf8'), profileText('Previous working profile'));
  assert.equal(store.editorBackups().versions[0].name, 'Previous working profile');
  assert.match(store.editorBackups().warning, /Could not record profile history/);
});
