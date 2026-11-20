'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { seekVerified } = require('../src/main/verified-media-seek');
const { normalizeWidgetInstances } = require('../src/main/widgets');
const { createRoutes, mediaEndpoint, obsEndpoint, seekPosition } = require('../src/renderer/control-modes');
const { createLevelBinding } = require('../src/renderer/audio-fader');
const { mediaPosition } = require('../src/renderer/now-playing');

const sessionId = '1'.repeat(32);
const trackId = '2'.repeat(32);
const sample = { status: 'ready', sessionId, trackId, positionMs: 30_000, durationMs: 100_000,
  seekMinMs: 10_000, seekMaxMs: 90_000, positionUpdatedAt: 100, rate: 1, playback: 'paused', title: 'Track' };

test('the quick selector is optional on faders and encoders without changing saved audio defaults', () => {
  const legacy = { id: 'fader', type: 'audio-fader', settings: { device: 'output', orientation: 'horizontal', defaultLevel: 45 } };
  assert.deepEqual(normalizeWidgetInstances([legacy]), [legacy]);
  const alternate = { id: 'encoder', type: 'audio-encoder', settings: { device: 'microphone', defaultLevel: 30, step: 3, modePicker: 'on' } };
  assert.deepEqual(normalizeWidgetInstances([alternate]), [alternate]);
  assert.throws(() => normalizeWidgetInstances([{ ...alternate, settings: { ...alternate.settings, modePicker: true } }]), /modePicker/);
  const provider = { subscribe() {} };
  const args = { api: { seekMediaVerified() {}, changeObs() {} }, providers: { audio: provider, media: provider, obs: provider },
    media: { position: mediaPosition }, audioLabel: 'Speakers', settings: legacy.settings };
  assert.deepEqual(Object.keys(createRoutes(args)), ['audio']);
  assert.deepEqual(Object.keys(createRoutes({ ...args, settings: alternate.settings, api: {} })), ['audio']);
  assert.deepEqual(Object.keys(createRoutes({ ...args, settings: alternate.settings })), ['audio', 'media', 'obs']);
});

test('media and OBS expose only readable current control targets', () => {
  const track = mediaEndpoint(sample, mediaPosition);
  assert.equal(track.level, 25);
  assert.equal(seekPosition(track.target, 50), 50_000);
  assert.equal(mediaEndpoint({ ...sample, status: 'stale' }, mediaPosition), null);
  assert.equal(mediaEndpoint({ ...sample, seekMinMs: null }, mediaPosition), null);
  const view = { status: 'connected', generation: 3, sourceScene: 'Program', detail: { id: 4, name: 'Voice', volume: 0.42 } };
  const source = obsEndpoint(view);
  assert.deepEqual(source.target, { generation: 3, scene: 'Program', source: 'Voice', item: 4 });
  assert.equal(source.level, 42);
  assert.equal(source.title, 'Program · Voice');
  assert.equal(obsEndpoint({ ...view, detail: { ...view.detail, volume: 1.5 } }), null);
  assert.notEqual(obsEndpoint({ ...view, generation: 4 }).id, source.id);
  assert.notEqual(obsEndpoint({ ...view, detail: { ...view.detail, id: 5 } }).id, source.id);
});

test('deferred fader changes commit once on release and cancel on a dropped or replaced target', async () => {
  const writes = [];
  const views = [];
  const binding = createLevelBinding({ min: 0, max: 100, interval: 1,
    write: (item) => { writes.push(item); }, render: (view) => views.push(view) });
  binding.receive({ id: 'track-first', level: 20 }, 100);
  binding.begin();
  binding.change(40, { defer: true });
  binding.change(65, { defer: true });
  assert.equal(views.at(-1).level, 65);
  assert.deepEqual(writes, []);
  binding.release();
  assert.deepEqual(writes, [{ id: 'track-first', level: 65 }]);
  await new Promise((resolve) => setTimeout(resolve, 6));
  binding.begin();
  binding.change(50, { defer: true });
  binding.cancel();
  binding.release();
  assert.equal(writes.length, 1);
  binding.begin();
  binding.change(90, { defer: true });
  binding.receive({ id: 'track-second', level: 31 }, 1, { resetVersion: true });
  binding.release();
  assert.equal(writes.length, 1);
  assert.equal(views.at(-1).level, 31);
});

test('verified media seek reads the current item before requesting and verifies the response without artwork', async () => {
  const reads = [];
  const writes = [];
  const target = { sessionId, trackId, positionMs: 50_000 };
  const player = {
    async reviewSnapshot(chosen) {
      reads.push(chosen);
      return chosen ? { ...sample, positionMs: 49_500, positionUpdatedAt: 101 } : sample;
    },
    async change(command) { writes.push(command); return { status: 'ok' }; },
  };
  const accepted = await seekVerified(player, target);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.reading.positionMs, 49_500);
  assert.deepEqual(reads, [undefined, sessionId]);
  assert.deepEqual(writes, [{ command: 'seek', sessionId, trackId, positionMs: 50_000 }]);
  assert.match((await seekVerified(player, { ...target, trackId: '3'.repeat(32) })).message, /changed/);
  assert.match((await seekVerified(player, { ...target, positionMs: 99_000 })).message, /seek position/);
  assert.equal(writes.length, 1);
  const unverified = await seekVerified({ ...player, reviewSnapshot: async () => sample }, target,
    () => undefined, { intervalMs: 1, timeoutMs: 8 });
  assert.match(unverified.message, /did not confirm/);
  assert.equal(writes.length, 2);
  let revoked = false;
  const guarded = await seekVerified({ ...player, reviewSnapshot: async () => { revoked = true; return sample; } }, target,
    () => revoked ? 'The Windows session changed.' : undefined);
  assert.match(guarded.message, /Windows session changed/);
  assert.equal(writes.length, 2);
});
