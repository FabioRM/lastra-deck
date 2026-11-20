'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { keyLiveState, keyLiveAppearance, keyReading } = require('../src/renderer/key-live-state');
const { toView, validateProfile } = require('../src/main/profile');
const { lucideIcon } = require('../src/main/icons');

test('audio keys report the actual endpoint and mixed microphone group without inferring a missing state', () => {
  const audio = { output: { muted: false }, microphone: { muted: true }, inputs: [{ muted: true }, { muted: false }] };
  assert.deepEqual(keyLiveState('output', audio), { text: 'Unmuted', pressed: false });
  assert.deepEqual(keyLiveState('microphone', audio), { text: 'Partly muted', pressed: 'mixed' });
  audio.inputs[1].muted = true;
  assert.equal(keyLiveState('microphone', audio).pressed, true);
  audio.inputs[1].muted = null;
  assert.deepEqual(keyLiveState('microphone', audio), { text: 'Unavailable', pressed: null });
});

test('Spotify keys show the provider binding and identify cached playback without an active pressed state', () => {
  const profile = validateProfile({ keys: [{ id: 'spotify', action: { type: 'spotify-playback' } }] });
  assert.equal(toView(profile).slots[0].liveSource, 'spotify');
  assert.deepEqual(keyLiveState('spotify', null, { status: 'ready', playback: 'playing' }), { text: 'Playing', pressed: true });
  assert.deepEqual(keyLiveState('spotify', null, { status: 'ready', playback: 'paused' }), { text: 'Paused', pressed: false });
  assert.deepEqual(keyLiveState('spotify', null, { status: 'stale', playback: 'playing' }), { text: 'Cached', pressed: null });
});

test('live artwork follows mute and playback, keeping custom images, icons and labels', () => {
  const profile = validateProfile({ keys: [
    { id: 'mic', icon: 'mic', action: { type: 'audio', device: 'microphone' } },
    { id: 'custom', icon: 'star', action: { type: 'spotify-playback' } },
    { id: 'photo', image: 'photo.png', action: { type: 'spotify-playback' } },
  ] });
  const [mic, custom, photo] = toView(profile, { icon: lucideIcon }).slots;
  assert.equal(mic.stateIcons.on, lucideIcon('mic-off'));
  assert.equal(mic.stateIcons.off, lucideIcon('mic'));
  assert.equal(custom.stateIcons, undefined);
  assert.equal(photo.stateIcons, undefined);
  assert.deepEqual(keyLiveAppearance('spotify', 'Play or pause', { pressed: true }), { state: 'on', tone: 'playing', label: 'Pause Spotify' });
  assert.equal(keyLiveAppearance('spotify', 'My music', { pressed: true }).label, 'My music');
  assert.deepEqual(keyLiveAppearance('output', 'Mute speakers', { pressed: true }), { state: 'on', tone: 'muted', label: 'Unmute speakers' });
});

test('readouts use explicit units and preserve the value and timestamp when it becomes stale', () => {
  const audio = { output: { level: 67 }, inputs: [{ level: 20 }, { level: 70 }] };
  assert.equal(keyReading('speakers', 'output', { audio }).text, '67%');
  assert.equal(keyReading('microphones', 'microphone', { audio }).text, '≈45%');
  const sensors = { cpu: 0.8, gpuTemp: 63.2, sampledAt: 100, hardwareAt: 500 };
  assert.equal(keyReading('cpu', null, { sensors }, 900).text, 'CPU 80%');
  assert.deepEqual(keyReading('gpuTemp', null, { sensors }, 900), { text: 'GPU 63 °C', sampledAt: 500, stale: false });
  assert.deepEqual(keyReading('gpuTemp', null, { sensors }, 7000), { text: 'GPU 63 °C', sampledAt: 500, stale: true });
  assert.equal(keyReading('gpu', null, { sensors }, 900), null);
  const spotify = { status: 'ready', playback: 'playing', durationMs: 100_000, positionMs: 35_000, positionUpdatedAt: 500, rate: 1 };
  assert.equal(keyReading('spotify-remaining', 'spotify', { spotify }, 5500).text, '1:00 left');
  const cached = { ...spotify, status: 'stale', sampledAt: 5500 };
  assert.deepEqual(keyReading('spotify-remaining', 'spotify', { spotify: cached }, 55_000),
    { text: '1:00 left', sampledAt: 5500, stale: true });
  assert.deepEqual(keyLiveState('output', { output: { muted: true }, sampledAt: 100 }, null, 4100),
    { text: 'Cached', pressed: null });
});

test('a profile can choose a numeric readout or turn the default audio readout off', () => {
  const action = { type: 'audio', device: 'output' };
  const profile = validateProfile({ keys: [
    { id: 'auto', action }, { id: 'off', action, readout: 'none' }, { id: 'temp', action, readout: 'cpuTemp' },
  ] });
  assert.deepEqual(toView(profile).slots.slice(0, 3).map((key) => key.readout), ['speakers', undefined, 'cpuTemp']);
  assert.throws(() => validateProfile({ keys: [{ id: 'unsupported', action, readout: 'invalid' }] }), /invalid key readout/);
});
