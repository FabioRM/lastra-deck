'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DisplayBacklight } = require('../src/main/display-backlight');
const { DisplayBacklightWidgets } = require('../src/main/display-backlight-widgets');

function fixture(onWidgetUpdate) {
  let now = 0;
  const hardware = { identity: 'first-panel', window: 12n, current: 40, minimum: 10, maximum: 90, allow: true, verify: true };
  const writes = [];
  const monitor = {
    async read() {
      await hardware.pending;
      return { minimum: hardware.minimum, current: hardware.current, maximum: hardware.maximum };
    },
    async write(value) {
      writes.push(value);
      if (hardware.verify) hardware.current = value;
      return true;
    },
  };
  const backlight = new DisplayBacklight({ getWindow: () => hardware.window, canWrite: () => hardware.allow,
    now: () => now, onWidgetUpdate, driver: () => ({
      identify: () => hardware.identity && { identity: hardware.identity },
      withMonitor: (_target, action) => action(monitor),
    }) });
  return { backlight, hardware, writes, advance(ms) { now += ms; } };
}

test('DDC brightness converts the exact monitor range, coalesces an unchanged request and verifies updates', async () => {
  const { backlight, writes } = fixture();
  const first = await backlight.read();
  assert.equal(first.percent, 38);
  const same = await backlight.change(first.token, 38);
  assert.equal(same.percent, 38);
  assert.notEqual(same.token, first.token);
  assert.deepEqual(writes, []);
  const second = await backlight.change(same.token, 60);
  assert.equal(second.percent, 60);
  assert.deepEqual(writes, [58]);
  assert.equal((await backlight.change(same.token, 50)).ok, false);
  assert.deepEqual(writes, [58]);
});

test('expired, incompatible and superseded targets stay read-only', async () => {
  const { backlight, hardware, writes, advance } = fixture();
  const old = await backlight.read();
  advance(60_001);
  assert.equal((await backlight.change(old.token, 60)).ok, false);
  const beforeReplacement = await backlight.read();
  hardware.identity = 'second-panel';
  assert.equal((await backlight.change(beforeReplacement.token, 60)).ok, false);
  const beforeExternalChange = await backlight.read();
  hardware.current = 41;
  assert.equal((await backlight.change(beforeExternalChange.token, 60)).ok, false);
  hardware.identity = null;
  assert.equal((await backlight.read()).ok, false);
  assert.deepEqual(writes, []);
});

test('the pending read cannot write after a session transition and concurrent requests are rejected', async () => {
  const { backlight, hardware, writes } = fixture();
  const before = await backlight.read();
  let resume;
  hardware.pending = new Promise((resolve) => { resume = resolve; });
  const change = backlight.change(before.token, 70);
  assert.match((await backlight.read()).message, /still running/);
  backlight.invalidate();
  resume();
  assert.equal((await change).ok, false);
  assert.deepEqual(writes, []);
  const fresh = await backlight.read();
  hardware.allow = false;
  assert.equal((await backlight.change(fresh.token, 70)).ok, false);
  assert.deepEqual(writes, []);
});

test('an accepted native write without matching readback reports an unverified result', async () => {
  const { backlight, hardware, writes } = fixture();
  const before = await backlight.read();
  hardware.verify = false;
  const result = await backlight.change(before.token, 75);
  assert.deepEqual(writes, [70]);
  assert.match(result.message, /Could not verify/);
  assert.equal(result.ok, false);
});

const owner = '8f3bfbf9-dafd-432c-9a92-5db18def8d8e';
const other = 'f242bc3b-b636-487e-ae65-8069133a670f';

test('dialog and widget reviews use separate tokens and share the same verifiable native brightness', async () => {
  const events = [];
  const { backlight, writes, advance } = fixture((reason) => events.push(reason));
  const widgets = new DisplayBacklightWidgets(backlight);
  const dialog = await backlight.read();
  const reading = await widgets.request({ type: 'read' });
  assert.notEqual(reading.token, dialog.token);
  assert.equal((await widgets.request({ type: 'apply', owner, token: dialog.token, percent: 62 })).ok, false);
  assert.equal((await backlight.change(reading.token, 38)).ok, false);
  const unchanged = await backlight.change(dialog.token, 38);
  assert.ok(unchanged.ok);
  assert.deepEqual(writes, []);
  const changed = await widgets.request({ type: 'apply', owner, token: reading.token, percent: 50 });
  assert.equal(changed.percent, 50);
  assert.deepEqual(writes, [50]);
  assert.equal((await backlight.change(unchanged.token, 55)).reason, 'stale');
  const fresh = await backlight.read();
  assert.equal((await backlight.change(fresh.token, 60)).ok, true);
  assert.deepEqual(events, ['dialog-ready', 'dialog-ready', 'dialog-change']);
  assert.equal((await widgets.request({ type: 'apply', owner, token: changed.token, percent: 55 })).ok, false);
  const stillVisible = await widgets.request({ type: 'read' });
  advance(60_001);
  assert.equal((await widgets.request({ type: 'apply', owner, token: stillVisible.token, percent: 70 })).ok, true);
});

test('only the active widget owner can cancel a pending read before its write', async () => {
  const { backlight, hardware, writes } = fixture();
  const widgets = new DisplayBacklightWidgets(backlight);
  const quickTools = await backlight.read();
  const snapshot = await widgets.request({ type: 'read' });
  let finish;
  hardware.pending = new Promise((resolve) => { finish = resolve; });
  const apply = widgets.request({ type: 'apply', owner, token: snapshot.token, percent: 60 });
  assert.equal((await widgets.request({ type: 'apply', owner: other, token: snapshot.token, percent: 62 })).reason, 'busy');
  await widgets.request({ type: 'cancel', owner: other });
  assert.equal(widgets.pending.cancelled, false);
  await widgets.request({ type: 'cancel', owner });
  finish();
  assert.equal((await apply).ok, false);
  assert.deepEqual(writes, []);
  assert.equal((await backlight.change(quickTools.token, 60)).ok, true);
  assert.deepEqual(writes, [58]);
});
