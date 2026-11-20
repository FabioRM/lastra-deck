'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { PowerStatus, decodePowerStatus, batteryWatts, readUpsSnapshot } = require('../src/main/power-status');
const { tempDir } = require('./helpers/temp-dir');

test('Windows power API data distinguishes charging, missing batteries and unavailable runtime', () => {
  const buffer = Buffer.alloc(12, 0xff);
  assert.deepEqual(decodePowerStatus(buffer), {
    source: 'unknown', battery: null, percent: null, charging: null, remainingSeconds: null, saver: null,
  });
  buffer.set([1, 8, 76, 1]);
  buffer.writeUInt32LE(2400, 4);
  assert.deepEqual(decodePowerStatus(buffer), {
    source: 'ac', battery: true, percent: 76, charging: true, remainingSeconds: 2400, saver: true,
  });
  buffer[1] = 128;
  assert.equal(decodePowerStatus(buffer).battery, false);
  assert.equal(decodePowerStatus(buffer).percent, null);
});

test('power events and visible reads share a short transition history without scheduling reads', () => {
  let reads = 0;
  const power = new PowerStatus({ readSystem() { reads++; return { status: 'ready', source: 'ac' }; }, now: () => 70 });
  power.observe('ac', 40);
  power.observe('battery', 45);
  power.observe('unknown', 47);
  power.observe('battery', 50);
  assert.equal(reads, 0);
  assert.deepEqual(power.snapshot().transitions, [{ at: 70, source: 'ac' }, { at: 45, source: 'battery' }]);
  assert.equal(reads, 1);
});

test('Windows battery watts preserve direction and omit unknown or contradictory readings', () => {
  const data = Buffer.alloc(32);
  data[1] = 1;
  data[2] = 1;
  data.writeInt32LE(13_750, 16);
  assert.equal(batteryWatts(data), 13.75);
  assert.equal(batteryWatts(Buffer.alloc(32)), null);
  data[2] = 0;
  data[3] = 1;
  assert.equal(batteryWatts(data), null);
  data.writeInt32LE(-19_200, 16);
  assert.equal(batteryWatts(data), -19.2);
  data.writeInt32LE(-0x80000000, 16);
  assert.equal(batteryWatts(data), null);
});

test('optional UPS data stays bounded and exposes stale or invalid states', (t) => {
  const folder = tempDir(t, 'lastra-power-test-');
  const file = path.join(folder, 'ups-status.json');
  const at = Date.UTC(2026, 10, 19);
  assert.deepEqual(readUpsSnapshot(file, at), { status: 'disabled' });
  fs.writeFileSync(file, JSON.stringify({ version: 1, source: 'battery', percent: 42, remainingSeconds: 800,
    sampledAt: new Date(at).toISOString(), credential: 'omitted' }));
  assert.deepEqual(readUpsSnapshot(file, at + 3_000), {
    status: 'ready', source: 'battery', percent: 42, remainingSeconds: 800, sampledAt: at,
  });
  assert.equal(readUpsSnapshot(file, at + 150_000).status, 'stale');
  fs.writeFileSync(file, JSON.stringify({ version: 1, source: 'ac', watts: 265.4, sampledAt: new Date(at).toISOString() }));
  assert.equal(readUpsSnapshot(file, at).watts, 265.4);
  fs.writeFileSync(file, 'x'.repeat(4097));
  assert.equal(readUpsSnapshot(file, at).status, 'invalid');
});
