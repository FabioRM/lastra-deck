'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { liveRows, keyPreview, widgetPreview } = require('../src/editor/live-variables');
const { previewObs } = require('../src/main/editor-preview-state');

const now = 15_000;
const audio = { output: { level: 37, muted: true }, microphone: { level: 21, muted: false },
  inputs: [{ level: 21, muted: false }, { level: 73, muted: true }], sampledAt: now - 250 };

test('live variables keep distinct audio readings, provider names and stale measurements', () => {
  const rows = Object.fromEntries(liveRows({ audio, sensors: { cpu: 0, gpu: 0.65, sampledAt: now, hardwareAt: now - 8_000 },
    media: { spotify: { status: 'stale', title: 'Cached song', playback: 'playing', sampledAt: 6_000 } },
    obs: previewObs({ status: 'connected', program: 'Desk', recording: { active: false }, streaming: { active: true } }),
  }, now).map((item) => [item.id, item]));
  assert.deepEqual(rows.speakers, { id: 'speakers', label: 'Speaker level', provider: 'Windows audio', value: '37%', sampledAt: now - 250, stale: false });
  assert.equal(rows.microphones.value, '≈47%');
  assert.equal(rows['microphones-muted'].value, 'Partly muted');
  assert.equal(rows.cpu.value, 'CPU 0%');
  assert.equal(rows.gpu.stale, true);
  assert.equal(rows.ram.value, 'Unavailable');
  assert.equal(rows['spotify.title'].value, 'Cached song');
  assert.equal(rows['spotify.title'].stale, true);
  assert.equal(rows['obs-recording'].value, 'false');
  assert.equal(rows['obs-streaming'].value, 'true');
  assert.equal(previewObs({ status: 'disconnected', recording: { active: false } }).recording, undefined);
});

test('key and widget previews use the same readout paths and default microphone selection as the deck', () => {
  assert.deepEqual(keyPreview({ label: 'Mute speakers', audio: 'output', readout: 'speakers' }, { audio }, now), {
    name: 'Unmute speakers', details: ['Muted', '37%'],
  });
  assert.deepEqual(widgetPreview({ type: 'audio-fader', settings: { device: 'microphone' } }, { audio }, now), {
    name: 'Audio fader', details: ['Microphone', 'Unmuted', '21%'],
  });
  assert.deepEqual(widgetPreview({ type: 'system-metric', settings: { metric: 'cpuTemp' } }, {
    sensors: { cpuTemp: 54.3, hardwareAt: now - 9000 },
  }, now), { name: 'System metric', details: ['CPU 54 °C (cached)'] });
  assert.equal(keyPreview({ label: 'Camera', sceneTarget: { scene: 'Desk', bus: 'program' } }, { obs: {
    status: 'connected', program: 'Desk', studio: false, scenes: ['Desk'],
  } }, now).details[0], 'On program');
});
