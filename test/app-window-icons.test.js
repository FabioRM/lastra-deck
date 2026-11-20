'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const test = require('node:test');
const { AppViews } = require('../src/main/app-views');
const { createAppWindowIcons } = require('../src/main/app-window-icons');

function image(value) {
  return {
    isEmpty: () => false,
    resize(size) { assert.deepEqual(size, { width: 32, height: 32 }); return this; },
    toDataURL: () => 'data:image/png;base64,' + value,
  };
}

test('window icons follow exact handles and avoid reading thumbnails or repeatedly extracting icons', async () => {
  let now = 0;
  let reads = 0;
  const files = [];
  const native = image('AAAA');
  const executable = image('BBBB');
  const read = createAppWindowIcons({
    now: () => now,
    getSources(options) {
      reads++;
      assert.deepEqual(options, { types: ['window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: true });
      return [{ id: 'window:10:0', appIcon: native }, { id: 'window:20:1', appIcon: native }];
    },
    getFileIcon(file, options) {
      files.push([file, options]);
      return executable;
    },
  });
  const app = 'C:\\Apps\\Example.exe';
  const entries = [{ id: '1:10', path: app }, { id: '1:20', path: app }, { id: '1:30', path: app }, { id: '1:40' }];
  const icons = await read(entries);
  assert.equal(icons.get('1:10'), native.toDataURL());
  assert.equal(icons.get('1:20'), executable.toDataURL());
  assert.equal(icons.get('1:30'), executable.toDataURL());
  assert.equal(icons.get('1:40'), null);
  assert.deepEqual(files, [[app, { size: 'small' }]]);
  await read(entries);
  assert.equal(reads, 1);
  now = 60_001;
  await read(entries);
  assert.equal(reads, 2);
});

test('the picker shows window icons and titles without exposing process paths', async () => {
  const settings = path.join(os.tmpdir(), `lastra-app-icons-${randomUUID()}.json`);
  const views = new AppViews(settings, {
    views: [{ id: 'custom', name: 'Example', icon: 'app-window', match: { executable: 'example.exe' }, commands: [], custom: true }],
    createWindows: () => ({ list: () => [
      { id: '1:10', title: 'First', path: 'Private path' }, { id: '1:20', title: 'Second', path: 'Private path' },
    ] }),
    windowIcons: async () => new Map([['1:10', 'data:image/png;base64,AAAA']]),
    icon: () => '<svg/>',
  });
  const state = await views.data('custom');
  assert.deepEqual(state.windows, [
    { id: '1:10', title: 'First', icon: 'data:image/png;base64,AAAA' },
    { id: '1:20', title: 'Second', icon: 'data:image/svg+xml;base64,PHN2Zy8+' },
  ]);
});
