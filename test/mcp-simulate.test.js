'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { simulateGesture } = require('../src/main/mcp-simulate');
const { createSession } = require('../extensions/lastra-mcp/stdio');

const tap = { type: 'hotkey', keys: 'Ctrl+S' };
const hold = { type: 'text', text: 'A simulated message' };
const delayed = { type: 'sequence', steps: [{ type: 'delay', ms: 100 }, tap] };
const raw = (key, { apps, bar } = {}) => ({ pages: [{ id: 'fixture', apps, keys: [key] }], ...(bar ? { bar } : {}) });

test('gesture simulation differentiates tap, hold, double and confirmation without invoking Windows', async () => {
  const profile = raw({ id: 'key', action: tap, hold, double: { type: 'open', target: 'C:/fixture/no-open.txt' } });
  const inputs = { profile, key: 'key' };
  assert.deepEqual((await simulateGesture(inputs)).effects, [{ atMs: 0, type: 'chord' }]);
  assert.deepEqual((await simulateGesture({ ...inputs, gesture: 'hold' })).effects, [{ atMs: 0, type: 'text', characters: hold.text.length }]);
  assert.deepEqual((await simulateGesture({ ...inputs, gesture: 'double' })).effects, [{ atMs: 0, type: 'open', target: 'path' }]);
  const guarded = raw({ id: 'key', action: { type: 'hotkey', keys: 'Ctrl+W' }, confirm: true });
  assert.equal((await simulateGesture({ profile: guarded, key: 'key' })).status, 'confirmation-required');
  assert.equal((await simulateGesture({ profile: guarded, key: 'key', confirmed: true })).effects[0].type, 'chord');
  assert.equal((await simulateGesture({ ...inputs, key: 'missing' })).status, 'unavailable');
});

test('delayed simulation rechecks the same window and layout and cancels before the next step', async () => {
  const profile = raw({ id: 'key', action: delayed }, { apps: ['code.exe'] });
  const inputs = { profile, key: 'key', values: { foreground: 'code.exe' }, windowId: 77, keyboardLayout: 'us' };
  const success = await simulateGesture(inputs);
  assert.equal(success.elapsedMs, 100);
  assert.deepEqual(success.effects, [{ atMs: 100, type: 'chord' }]);
  const switched = await simulateGesture({ ...inputs, timeline: [{ atMs: 30, windowId: 78 }] });
  assert.equal(switched.status, 'unavailable');
  assert.match(switched.message, /window changed/);
  assert.deepEqual(switched.effects, []);
  assert.ok(switched.steps.some(({ type, status }) => type === 'hotkey' && status === 'skipped'));
  const layout = await simulateGesture({ ...inputs, timeline: [{ atMs: 75, keyboardLayout: 'it' }] });
  assert.match(layout.message, /layout changed/);
  const cancelled = await simulateGesture({ ...inputs, timeline: [{ atMs: 25, cancel: true }] });
  assert.equal(cancelled.status, 'cancelled');
  await assert.rejects(simulateGesture({ ...inputs, timeline: [{ atMs: 80 }, { atMs: 10 }] }), /ordered/);
});

test('simulated provider disconnects and waits flow through the actual action runner', async () => {
  const profile = raw({ id: 'key', action: { type: 'sequence', steps: [
    { type: 'wait-for', condition: 'obs-connected', expected: true, timeoutMs: 500 },
    { type: 'obs-scene', scene: 'Fixture', bus: 'program' },
  ] } });
  const inputs = { profile, key: 'key', values: { 'obs-connected': false } };
  const result = await simulateGesture({ ...inputs, timeline: [{ atMs: 100, values: { 'obs-connected': true } }] });
  assert.equal(result.status, 'success');
  assert.equal(result.elapsedMs, 150);
  assert.deepEqual(result.effects, [{ atMs: 150, type: 'obs-scene', bus: 'program' }]);

  const disconnected = await simulateGesture({
    ...inputs, timeline: [{ atMs: 100, values: { 'obs-connected': true }, disconnected: ['obs'] }],
  });
  assert.notEqual(disconnected.status, 'success');
  assert.match(disconnected.message, /OBS connection is unavailable/);
  assert.deepEqual(disconnected.effects, []);
});

test('the fixture must match a contextual page before a gesture and retain its title', async () => {
  const profile = { pages: [{
    id: 'fixture', apps: ['code.exe'], windowTitle: { mode: 'starts-with', value: 'Project' },
    keys: [{ id: 'save', action: delayed }],
  }] };
  const inputs = { profile, key: 'save', values: { foreground: 'code.exe' }, windowTitle: 'Project One' };
  assert.equal((await simulateGesture({ ...inputs, windowTitle: 'Other window' })).status, 'unavailable');
  const changed = await simulateGesture({ ...inputs, timeline: [{ atMs: 30, windowTitle: 'Project Two' }] });
  assert.match(changed.message, /title changed/);
  const switched = await simulateGesture({ ...inputs, requireStableWindow: false,
    timeline: [{ atMs: 0, values: { foreground: 'notepad.exe' } }] });
  assert.equal(switched.status, 'unavailable');
  assert.deepEqual(switched.effects, []);
});

test('stdio runs gesture simulation offline for persistent bar keys', async () => {
  const replies = [];
  const session = createSession({ connect: () => assert.fail('Gesture simulation attempted a live connection'),
    send: (response) => replies.push(response) });
  await session.receive({ jsonrpc: '2.0', method: 'initialize', params: { protocolVersion: '2025-06-18' }, id: 1 });
  const profile = raw({ id: 'key', action: tap }, { bar: { keys: [{ id: 'audio', action: { type: 'audio', device: 'output' } }] } });
  await session.receive({ jsonrpc: '2.0', method: 'tools/call', id: 2, params: {
    name: 'simulate_gesture', arguments: { profile, page: 'bar:', key: 'audio' },
  } });
  assert.deepEqual(replies[1].result.structuredContent.effects, [{ atMs: 0, type: 'audio', device: 'output' }]);
});

test('gesture simulation resolves the same shared macro arguments as the deck', async () => {
  const profile = { ...raw({ id: 'key', action: { type: 'macro', macro: 'message', args: { message: 'Hello' } } }),
    macros: [{ id: 'message', label: 'Message', parameters: [{ id: 'message', type: 'string' }],
      action: { type: 'text', text: { parameter: 'message' } } }],
  };
  assert.deepEqual((await simulateGesture({ profile, key: 'key' })).effects, [{ atMs: 0, type: 'text', characters: 5 }]);
});
