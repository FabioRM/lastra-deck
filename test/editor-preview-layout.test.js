'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { draftLayoutItems, proposeDraftLayout } = require('../src/editor/preview-layout');
const { previewAudio, previewSensors, PreviewMedia } = require('../src/main/editor-preview-state');
const { toView, validateProfile } = require('../src/main/profile');

const grid = { cols: 4, rows: 3 };
const cut = { id: 'copy', label: 'Copy', action: { type: 'hotkey', keys: 'Ctrl+C' } };
const fader = { id: 'audio', type: 'audio-fader', settings: { device: 'output', orientation: 'vertical', defaultLevel: 64 },
  layout: { column: 2, row: 1, cols: 1, rows: 2 } };
const page = { id: 'preview', name: 'Preview layout', keys: [cut], widgets: [fader] };

test('move and resize proposals preserve actions and widget settings while checking grid bounds and overlaps', () => {
  const original = structuredClone(page);
  const [button, widget] = draftLayoutItems(page, grid);
  const move = proposeDraftLayout(page, grid, button, false, 1, 0);
  assert.deepEqual(move.keys, [null, cut]);
  assert.equal(move.valid, true);
  const resize = proposeDraftLayout(page, grid, widget, true, 1, 0);
  assert.equal(resize.valid, true);
  assert.deepEqual(resize.widgets[0], { ...fader, layout: { ...fader.layout, cols: 2 } });
  assert.equal(proposeDraftLayout(page, grid, widget, false, 0, 1).valid, false);
  assert.equal(proposeDraftLayout(page, grid, button, true, 2, 1).valid, false);
  assert.equal(proposeDraftLayout(page, grid, button, true, 1, 0).keys[0].span.cols, 2);
  assert.deepEqual(page, original);
});

test('the authoring layout preserves equivalent fixed actions as disabled visual keys', () => {
  const profile = validateProfile({ grid, pages: [page] });
  assert.equal(toView(profile).slots[0], null);
  const authoring = toView(profile, { deduplicateEditing: false });
  assert.equal(authoring.slots[0].id, cut.id);
  assert.equal(authoring.slots[0].action, undefined);
});

test('live preview samples are bounded to visual readings and use synthetic endpoint identifiers', () => {
  const endpoint = { id: 'private-endpoint', level: 42, muted: true, path: 'private path' };
  const audio = previewAudio({ output: endpoint, inputs: [endpoint], sampledAt: 41, version: 3 });
  assert.deepEqual(audio.output, { id: 'preview-output', level: 42, muted: true });
  assert.equal(audio.inputs[0].id, 'preview-input-0');
  assert.doesNotMatch(JSON.stringify(audio), /private/);
  const sensors = previewSensors({ cpu: 0.4, hardwareSource: 'managed', token: 'private' },
    { cpu: [[10, 0.4], [11, null]], secret: [[12, 1]] });
  assert.deepEqual(sensors.history, { cpu: [[10, 0.4], [11, null]] });
  assert.equal(sensors.cpu, 0.4);
  assert.doesNotMatch(JSON.stringify(sensors), /private|secret/);
});

test('media preview uses passive samples, expires stale readings and excludes playback capabilities', () => {
  const media = new PreviewMedia();
  media.record('spotify', { status: 'ready', title: 'Test title', canPlay: true, canSeek: true,
    sessionId: 'private-session', trackId: 'track', artwork: 'large image' }, 12);
  const view = media.snapshot(15);
  assert.equal(view.spotify.sessionId, 'preview-spotify');
  assert.equal(view.spotify.title, 'Test title');
  assert.doesNotMatch(JSON.stringify(view), /private-session|large image|canPlay|canSeek/);
  assert.equal(media.snapshot(5_000).spotify.status, 'stale');
  media.record('spotify', { status: 'empty' });
  assert.deepEqual(media.snapshot().spotify, { status: 'empty' });
});
