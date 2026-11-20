'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { ImageLibrary } = require('../src/main/image-library');
const { embeddedImageDataUrl, imageDataUrl } = require('../src/main/icons');
const { cropRect } = require('../src/shared/asset-crop');
const { validateProfile, toView } = require('../src/main/profile');
const { encodeEditorClipboard, decodeEditorClipboard } = require('../src/main/editor-clipboard');
const { tempDir } = require('./helpers/temp-dir');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN4QAAAAASUVORK5CYII=';
const icon = { resize: () => ({ toDataURL: () => PNG }) };

function directory(t) {
  const folder = tempDir(t, 'lastra-assets-');
  return folder;
}

function link(target, flags = 2, network = false) {
  const header = Buffer.alloc(76);
  header.writeUInt32LE(76);
  Buffer.from('0114020000000000c000000000000046', 'hex').copy(header, 4);
  header.writeUInt32LE(flags, 20);
  const file = Buffer.from(target + '\0');
  const info = Buffer.alloc(28);
  info.writeUInt32LE(28 + file.length + 1, 0);
  info.writeUInt32LE(28, 4);
  info.writeUInt32LE(network ? 2 : 1, 8);
  info.writeUInt32LE(28, 16);
  info.writeUInt32LE(28 + file.length, 24);
  return Buffer.concat([header, info, file, Buffer.alloc(1)]);
}

test('searches bundled icons by name and returns only one page of local previews', () => {
  const library = new ImageLibrary({ roots: [] });
  const all = library.search('icons', '', 0);
  assert.ok(all.pages > 1);
  assert.ok(all.items.length < all.total);
  const arrow = library.search('icons', 'arrow left', 0);
  assert.ok(arrow.items.some(({ id }) => id === 'arrow-left'));
  assert.ok(arrow.items.every(({ preview }) => preview.startsWith('data:image/svg+xml;base64,')));
  assert.throws(() => library.search('other', '', 0), /Invalid library search/);
});

test('Start menu search exposes names only and reads icons from explicitly chosen local executables', async (t) => {
  const folder = directory(t);
  const app = path.join(folder, 'demo.exe');
  fs.writeFileSync(app, '');
  fs.writeFileSync(path.join(folder, 'Demo App.lnk'), link(app));
  fs.writeFileSync(path.join(folder, 'Command.lnk'), link(app, 0x22));
  fs.writeFileSync(path.join(folder, 'Remote.lnk'), link('\\\\private\\server\\remote.exe', 2, true));
  fs.writeFileSync(path.join(folder, 'Unc target.lnk'), link('\\\\private\\server\\remote.exe'));
  fs.writeFileSync(path.join(folder, 'URL target.lnk'), link('https://example.test/run.exe'));
  const reads = [];
  const library = new ImageLibrary({
    roots: [{ directory: folder, scope: 'Fixture' }],
    getFileIcon(file) { reads.push(file); return icon; },
  });
  const { items } = library.search('apps', '', 0);
  assert.equal(items.length, 5);
  assert.equal(reads.length, 0);
  assert.doesNotMatch(JSON.stringify(items), /private|\.exe|\.lnk/);
  const selected = items.find(({ label }) => label === 'Demo App');
  assert.deepEqual(await library.selectedApp(selected.id), { label: 'Demo App', source: PNG });
  for (const skipped of items.filter(({ id }) => id !== selected.id)) {
    await assert.rejects(library.selectedApp(skipped.id), /executable/);
  }
  await assert.rejects(library.selectedApp(app), /Choose an app from the installed list/);
  assert.deepEqual(reads, [app]);
});

test('native picker keeps local image compatibility and permits cancel', async (t) => {
  const folder = directory(t);
  const file = path.join(folder, 'photo.png');
  fs.writeFileSync(file, Buffer.from(PNG.split(',')[1], 'base64'));
  const library = new ImageLibrary({ roots: [], choose: () => ({ canceled: false, filePaths: [file] }) });
  assert.deepEqual(await library.browse('image'), { label: 'photo.png', source: PNG });
  assert.equal(await new ImageLibrary({ roots: [], choose: () => ({ canceled: true }) }).browse('app'), null);
  assert.equal(imageDataUrl(file), PNG);
});

test('square crop bounds and portable PNG validation preserve key and clipboard behavior', () => {
  assert.deepEqual(cropRect(200, 100), { x: 50, y: 0, size: 100 });
  assert.deepEqual(cropRect(200, 100, 200, 100, 100), { x: 150, y: 50, size: 50 });
  assert.equal(cropRect(0, 100), null);
  assert.equal(embeddedImageDataUrl(PNG), PNG);
  const invalid = Buffer.from(PNG.split(',')[1], 'base64');
  invalid.writeUInt32BE(999, 16);
  assert.equal(embeddedImageDataUrl('data:image/png;base64,' + invalid.toString('base64')), null);
  const key = { id: 'asset', label: 'Proof', action: { type: 'delay', ms: 1 }, image: PNG };
  const profile = validateProfile({ keys: [key] });
  assert.equal(toView(profile, { image: imageDataUrl }).slots[0].image, PNG);
  assert.equal(decodeEditorClipboard('key', encodeEditorClipboard('key', key)).image, PNG);
  assert.throws(() => validateProfile({ keys: [{ ...key, image: 'data:image/png;base64,YQo=' }] }), /invalid embedded PNG image/);
});
