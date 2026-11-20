'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { startDial, moveDial, tapDial } = require('../src/renderer/virtual-dial');
const { createLevelBinding } = require('../src/renderer/audio-fader');
const { normalizeWidgetInstances } = require('../src/main/widgets');
const { searchCatalog } = require('../src/main/mcp-catalog-search');

const square = { left: 125, top: 200, width: 100, height: 100 };
const at = (degrees, radius) => ({ x: 175 + Math.cos(degrees * Math.PI / 180) * radius,
  y: 250 + Math.sin(degrees * Math.PI / 180) * radius });

test('dial ring selection locks fine and fast steps for the entire gesture', () => {
  const fine = startDial(at(0, 30), square, 8);
  assert.equal(moveDial(fine, at(30, 45)), 2);
  assert.equal(moveDial(fine, at(60, 46)), 2);
  const fast = startDial(at(0, 45), square, 8);
  assert.equal(moveDial(fast, at(-30, 30)), -16);
  assert.equal(moveDial(fast, at(-60, 30)), -16);
  assert.equal(tapDial(fast, at(-60, 30)), false);
  assert.equal(startDial(at(35, 52), square, 8), null);
});

test('dial resets only for a tap and handles a center crossing or wrapped angle', () => {
  const center = startDial(at(0, 0), square, 5);
  assert.equal(moveDial(center, at(0, 3)), 0);
  assert.equal(tapDial(center, at(0, 3)), true);
  assert.equal(tapDial(center, at(0, 30)), false);
  const wrapped = startDial(at(170, 46), square, 5);
  assert.equal(moveDial(wrapped, at(190, 46)), 5);
  assert.equal(moveDial(wrapped, at(0, 1)), 0);
  assert.equal(moveDial(wrapped, at(100, 46)), 0);
  assert.equal(moveDial(wrapped, at(115, 46)), 5);
  assert.equal(tapDial(wrapped, at(115, 46)), false);
});

test('deferred dial detents accumulate in one seek and a new target cancels the turn', async () => {
  const writes = [];
  let latest;
  const binding = createLevelBinding({ min: 0, max: 100, interval: 1,
    write: (change) => { writes.push(change); }, render: (view) => { latest = view; } });
  binding.receive({ id: 'track:first', level: 30 }, 1);
  binding.begin();
  binding.step(6, { defer: true });
  binding.step(6, { defer: true });
  assert.equal(latest.level, 42);
  assert.deepEqual(writes, []);
  binding.release();
  assert.deepEqual(writes, [{ id: 'track:first', level: 42 }]);
  await new Promise((resolve) => setTimeout(resolve, 7));
  binding.begin();
  binding.step(20, { defer: true });
  binding.receive({ id: 'track:second', level: 14 }, 2);
  binding.release();
  assert.equal(writes.length, 1);
  assert.equal(latest.level, 14);
});

test('the dial is available in the widget catalog with bounded settings', () => {
  const dial = { id: 'dial', type: 'virtual-dial', settings: { device: 'output', defaultLevel: 37, step: 8, modePicker: 'on' } };
  assert.deepEqual(normalizeWidgetInstances([dial]), [dial]);
  assert.throws(() => normalizeWidgetInstances([{ ...dial, settings: { ...dial.settings, step: 21 } }]), /step/);
  const { items: [entry] } = searchCatalog({ kind: 'widget', query: 'rotary control' });
  assert.equal(entry.id, 'virtual-dial');
  assert.equal(entry.settings.properties.step.default, 5);
});
