'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { toggleMicrophones, microphonePeak } = require('../src/main/audio-win32');
const { peakReading } = require('../src/renderer/audio-peaks');

test('automatic microphone metering shows the loudest unmuted input and respects an explicit selection', () => {
  const inputs = [
    { id: 'webcam', muted: false, signal: 0 },
    { id: 'usb', muted: false, signal: 0.24 },
    { id: 'headset', muted: true, signal: 0.85 },
  ];
  const sampled = [];
  const read = ({ id, signal }) => { sampled.push(id); return signal; };
  assert.deepEqual(microphonePeak(inputs, null, read), { microphone: 0.24, microphoneId: 'usb' });
  assert.deepEqual(sampled, ['webcam', 'usb']);
  assert.deepEqual(microphonePeak(inputs, 'webcam', read), { microphone: 0, microphoneId: 'webcam' });
  assert.deepEqual(microphonePeak(inputs, 'headset', read), { microphone: null, microphoneId: 'headset' });
  assert.deepEqual(microphonePeak(inputs, 'disconnected', read), { microphone: null, microphoneId: 'disconnected' });
});

test('signal meters distinguish audio from silence, mute, and unavailable devices', () => {
  const peak = peakReading(0.25, false);
  assert.deepEqual({ state: peak.state, db: peak.db, label: peak.label }, { state: 'active', db: -12, label: '−12 dBFS' });
  assert.equal(peak.fill, 80);
  assert.equal(peakReading(0, false).label, 'No signal');
  assert.equal(peakReading(null, true).label, 'Muted');
  assert.equal(peakReading(null, false).label, 'Unavailable');
});

test('mutes non-default microphones and preserves existing mute states', async () => {
  const inputs = [
    { id: 'webcam', name: 'Webcam', muted: false },
    { id: 'usb', name: 'USB', muted: false },
    { id: 'headset', name: 'Headset', muted: true },
  ];
  const owned = new Set();
  const change = (id, muted) => {
    inputs.find((input) => input.id === id).muted = muted;
    return true;
  };

  assert.equal(await toggleMicrophones(inputs, 'webcam', owned, change), '3 microphones muted');
  assert.deepEqual([...owned], ['webcam', 'usb']);
  assert.deepEqual(inputs.map((input) => input.muted), [true, true, true]);

  await toggleMicrophones(inputs, 'webcam', owned, change);
  assert.deepEqual(inputs.map((input) => input.muted), [false, false, true]);
  assert.equal(owned.size, 0);
});

test('unmutes only the default when Lastra did not mute the inputs', async () => {
  const inputs = [
    { id: 'webcam', name: 'Webcam', muted: true },
    { id: 'usb', name: 'USB', muted: true },
  ];
  const writes = [];
  await toggleMicrophones(inputs, 'usb', new Set(), (id, muted) => writes.push([id, muted]));
  assert.deepEqual(writes, [['usb', false]]);
});

test('reports unconfirmed inputs and still attempts the remaining ones', async () => {
  const inputs = [
    { id: 'webcam', name: 'Webcam', muted: null },
    { id: 'usb', name: 'USB', muted: false },
  ];
  const owned = new Set();
  await assert.rejects(() => toggleMicrophones(inputs, 'usb', owned, (id) => {
    if (id === 'webcam') throw new Error('Disconnected');
    return true;
  }), /Webcam/);
  assert.deepEqual([...owned], ['usb']);
});

test('remembers a requested change even if the endpoint has not confirmed it', async () => {
  const inputs = [{ id: 'webcam', name: 'Webcam', muted: false }];
  const owned = new Set();
  await assert.rejects(() => toggleMicrophones(inputs, 'webcam', owned, async (_id, _muted, onRequested) => {
    onRequested();
    throw new Error('Device response timed out');
  }), /Webcam/);
  assert.deepEqual([...owned], ['webcam']);
});
