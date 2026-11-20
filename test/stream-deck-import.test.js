'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { deflateRawSync } = require('node:zlib');
const { crc32 } = require('../src/main/stream-deck-archive');
const { previewStreamDeckProfile, readStreamDeckProfile } = require('../src/main/stream-deck-import');
const { reviewPlan } = require('../src/editor/stream-deck-import');
const { prepareTemplatePages } = require('../src/shared/profile-template-import');
const { validateProfile } = require('../src/main/profile');
const { tempDir } = require('./helpers/temp-dir');

function archive(entries) {
  const locals = [];
  const directory = [];
  let cursor = 0;
  for (const [name, contents, options = {}] of entries) {
    const filename = Buffer.from(name);
    const raw = Buffer.from(typeof contents === 'string' ? contents : JSON.stringify(contents));
    const data = options.compress ? deflateRawSync(raw) : raw;
    const method = options.compress ? 8 : 0;
    const size = options.size ?? raw.length;
    const checksum = options.checksum ?? crc32(raw);
    const flags = options.flags ?? 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(options.attributes ?? 0, 38);
    central.writeUInt32LE(cursor, 42);
    locals.push(local, filename, data);
    directory.push(central, Buffer.from(options.centralName ?? name));
    cursor += local.length + filename.length + data.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.reduce((size, entry) => size + entry.length, 0), 12);
  end.writeUInt32LE(cursor, 16);
  return Buffer.concat([...locals, ...directory, end]);
}

const root = 'sample.sdProfile/manifest.json';
const action = (name, settings, uuid = 'com.elgato.streamdeck.system.hotkey') => ({
  Name: 'System key', UUID: uuid, States: [{ Title: name, Image: 'proprietary.png' }], Settings: settings,
});
const key = (name, code, properties = {}) => action(name, { Hotkeys: [{ VKeyCode: code, ...properties }, { VKeyCode: -1 }] });
const keypad = (Actions) => ({ Type: 'Keypad', Actions });
const legacy = { Version: '1.0', Name: 'Practice', AppIdentifier: 'C:\\Private\\Program.exe', Actions: {
  '2,0': key('  Toggle\nloop  ', 0x4c, { KeyCtrl: true, NativeCode: 0x4c, QTKeyCode: 0x4c, KeyModifiers: 2 }),
  '3,0': key('F4', 0x73, { KeyOption: true, QTKeyCode: 0x01000033, KeyModifiers: 4 }),
  '0,1': key('Mac numeric code', 0x13, { QTKeyCode: 0x32, NativeCode: 0x13 }),
  '1,1': key('Punctuation', 0xbb, { KeyCtrl: true, QTKeyCode: 0x3d }),
  '2,1': action('Launch', { path: 'C:\\Private\\Program.exe' }, 'com.elgato.streamdeck.system.open'),
  '3,1': action('Plugin', { secret: 'Fixture setting' }, 'com.example.integration.message'),
  '5,1': action('Folder', { ProfileUUID: 'nested' }, 'com.elgato.streamdeck.profile.openchild'),
  '6,3': key('Outside a compact grid', 0x33),
  'unknown': key('Bad coordinate', 0x32),
} };

test('legacy Windows import maps editable chords and labels, and keeps folders as separate pages', async () => {
  const data = await previewStreamDeckProfile(archive([[root, legacy, { compress: true }],
    ['sample.sdProfile/Profiles/nested.sdProfile/manifest.json', { Actions: { '0,0': key('Child key', 0x34) } }],
    ['sample.sdProfile/Images/proprietary.png', 'ignored'], ['sample.sdProfile/Plugins/manifest.json', 'invalid JSON ignored']]));
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.deepEqual(data.pages.map(({ name }) => name), ['Practice', 'Folder']);
  assert.deepEqual(data.pages[0].keys.map(({ keys }) => keys), ['Ctrl+L', 'Alt+f4', 'Ctrl+vk:bb', '3']);
  assert.equal(data.pages[0].keys[0].label, 'Toggle loop');
  assert.equal(data.pages[0].keys[2].layoutDependent, true);
  assert.deepEqual(data.pages[0].issues.map(({ reason }) => reason), ['ambiguous-keyboard', 'external-action', 'plugin', 'navigation', 'unmapped-position']);
  assert.deepEqual(data.dependencies, ['com.example.integration.message']);
  assert.equal(data.ignoredEntries, 2);
  assert.equal(data.hasForegroundHint, true);
  assert.doesNotMatch(JSON.stringify(data), /Program\.exe|proprietary\.png|Fixture setting|ProfileUUID|nested\.sdProfile/i);
});

test('modern export follows GUID page order, omits other controller kinds and marks duplicate slots', async () => {
  const id = '00112233-4455-6677-8899-aabbccddeeff';
  const base32 = '008I4CQ4ALJ7F24PLATSPNFEVSZ';
  const modern = await previewStreamDeckProfile(archive([
    [root, { Version: '2.0', Name: 'Modern', Pages: { Pages: [id, 'other'] } }],
    ['sample.sdProfile/Profiles/other/manifest.json', { Name: 'Other', Controllers: [keypad({ '0,0': key('Open', 0x4f) })] }],
    [`sample.sdProfile/Profiles/${base32}/manifest.json`, { Name: 'Ordered first', Controllers: [
      keypad({ '0,0': key('Repeated', 0x41), '0,1': key('Ordinary', 0x5a), '1,1': action('Multiple', {
        Hotkeys: [{ VKeyCode: 0x41 }, { VKeyCode: 0x42 }],
      }) }), keypad({ '0,0': key('Duplicate too', 0x43) }),
      { Type: 'Encoder', Actions: { '7,7': key('Not a keypad key', 0x43) } },
    ] }],
  ]));
  assert.deepEqual(modern.pages.map(({ name }) => name), ['Ordered first', 'Other']);
  assert.equal(modern.pages[0].ignoredControllers, 1);
  assert.deepEqual(modern.pages[0].keys.map(({ label }) => label), ['Ordinary']);
  assert.equal(modern.pages[0].issues.filter(({ reason }) => reason === 'duplicate-position').length, 2);
  assert.ok(modern.pages[0].issues.some(({ reason }) => reason === 'multiple-chords'));
});

test('review reports grid overflow and adds validated copies with a user-supplied foreground executable', async () => {
  const profile = await previewStreamDeckProfile(archive([[root, legacy]]));
  const draft = validateProfile({ pages: [{ id: 'existing', name: 'Practice', apps: ['Code.exe'], keys: [] }] });
  const selection = new Map([[profile.pages[0].id, { selected: true, match: 'Code.exe' }]]);
  const choices = { selection, cols: 4, rows: 3, windowsSource: false };
  assert.match(reviewPlan(profile, draft, choices).error, /exported on Windows/);
  const review = reviewPlan(profile, draft, { ...choices, windowsSource: true });
  assert.equal(review.error, '');
  assert.equal(review.pages[0].collision, true);
  assert.equal(review.pages[0].imported, 3);
  assert.deepEqual(review.pages[0].overflow.map(({ column, row }) => [column, row]), [[6, 3]]);
  const append = prepareTemplatePages(draft, review.bundle.item, () => 'fresh-copy');
  assert.deepEqual(append.collisions, [{ page: 'Practice · copy', value: 'Code.exe' }]);
  const [page] = append.pages;
  assert.equal(page.id, 'fresh-copy');
  assert.equal(page.keys[2].action.keys, 'Ctrl+L');
  assert.deepEqual(page.keys[2].action.targetApps, ['Code.exe']);
  assert.deepEqual(page.apps, []);
  assert.equal(validateProfile({ ...draft, pages: [...draft.pages, page] }).pages.length, 2);
  selection.get(profile.pages[0].id).match = 'C:\\private\\Code.exe';
  assert.match(reviewPlan(profile, draft, { ...choices, windowsSource: true }).error, /Windows executable name/);
});

test('archive validation rejects invalid paths, duplicate aliases, forged metadata, oversized manifests and corruption', async () => {
  for (const entry of [
    ['../evil', 'a'], ['C:device', 'a'], ['a\\b', 'a'], ['a//b', 'a'], ['a/NUL.bin', 'a'],
    ['SAMPLE.SDPROFILE/Manifest.JSON', legacy], ['link', 'destination', { attributes: 0xa000 << 16 >>> 0 }],
    ['asset', 'a', { flags: 1 }], ['foo.png', 'x', { centralName: 'bar.png' }],
  ]) await assert.rejects(previewStreamDeckProfile(archive([[root, legacy], entry])), /invalid|unsupported|duplicate/i);
  await assert.rejects(previewStreamDeckProfile(archive([[root, legacy, { checksum: 0 }]])), /integrity/);
  await assert.rejects(previewStreamDeckProfile(archive([[root, 'x'.repeat(512 * 1024 + 1), { compress: true }]])), /oversized/);
  await assert.rejects(previewStreamDeckProfile(archive([[root, legacy, { compress: true, size: 4 }]])), /invalid|unsupported|unpacked/);
  await assert.rejects(previewStreamDeckProfile(archive([[root, '{broken']])), /valid JSON/);
});

test('only a user-selected Stream Deck archive is read, with no files extracted', async (t) => {
  const directory = tempDir(t, 'lastra-stream-deck-');
  const file = path.join(directory, 'fixture.streamDeckProfile');
  fs.writeFileSync(file, archive([[root, legacy], ['sample.sdProfile/Resources/sample.exe', 'ignored']]));
  const preview = await readStreamDeckProfile(file);
  assert.equal(preview.ignoredEntries, 1);
  assert.deepEqual(fs.readdirSync(directory), [path.basename(file)]);
  await assert.rejects(readStreamDeckProfile(path.join(directory, 'profile.json')), /Choose a .streamDeckProfile/);
  await assert.rejects(readStreamDeckProfile(path.join(directory, 'private.streamDeckProfile')),
    { message: 'The selected Stream Deck file could not be opened.' });
});
