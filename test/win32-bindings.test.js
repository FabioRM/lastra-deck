'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

test('requiring the shared Win32 bindings loads nothing until a binding is used', () => {
  const loaded = Object.keys(require.cache).some((file) => /[\\/]koffi[\\/]/.test(file));
  const win32 = require('../src/main/win32');
  assert.equal(typeof win32.fn, 'function');
  if (!loaded) assert.equal(Object.keys(require.cache).some((file) => /[\\/]koffi[\\/]/.test(file)), false);
});

test('Win32 bindings are declared once and shared between modules', { skip: process.platform !== 'win32' }, () => {
  const { loadWin32, fn, readProcessPath, withQueryableProcess } = require('../src/main/win32');
  assert.equal(loadWin32(), loadWin32());
  assert.equal(fn('OpenProcess'), fn('OpenProcess'));
  assert.throws(() => fn('NotAWin32Function'), /Unknown Win32 function/);
  const { koffi, types } = loadWin32();
  assert.equal(koffi.sizeof(types.RECT), 16);
  assert.equal(koffi.sizeof(types.MONITORINFOEXW), 104);

  assert.match(readProcessPath(process.pid), /\.exe$/i);
  assert.equal(withQueryableProcess(0xFFFFFFF0, () => 'opened'), null);

  // Each reader reuses the shared named types instead of redeclaring them.
  const { createForegroundReader } = require('../src/main/foreground-win32');
  const { createAppWindowReader } = require('../src/main/app-windows-win32');
  const { createProcessReader } = require('../src/main/process-metrics-win32');
  const { createBacklightDriver } = require('../src/main/display-backlight-win32');
  const { createPanelPointerReader } = require('../src/main/panel-pointer-win32');
  for (const create of [createForegroundReader, createAppWindowReader, createProcessReader, createBacklightDriver,
    createPanelPointerReader, createForegroundReader, createAppWindowReader]) {
    assert.ok(create());
  }
  const metrics = createProcessReader()(process.pid);
  assert.ok(metrics.workingSetKiB > 0);
  assert.ok(metrics.cpuSeconds >= 0);
});

test('Win32 bindings refuse to load off Windows', { skip: process.platform === 'win32' }, () => {
  const { loadWin32, fn } = require('../src/main/win32');
  assert.throws(() => loadWin32(), /only available on Windows/);
  assert.throws(() => fn('OpenProcess'), /only available on Windows/);
});
