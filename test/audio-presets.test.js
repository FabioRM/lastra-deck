'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { AudioPresets } = require('../src/main/audio-presets');
const { tempDir } = require('./helpers/temp-dir');

function fixture(t) {
  const directory = tempDir(t, 'lastra-audio-presets-');
  const file = path.join(directory, 'presets.json');
  const audio = { output: { id: 'speakers-a', level: 42, muted: true }, microphone: { id: 'microphone-a', level: 76, muted: false } };
  const writes = [];
  let revision = 0;
  let afterWrite;
  const options = { read: () => audio, confirmation: { timeoutMs: 500, intervalMs: 4 },
    write: async (device, level, id) => {
      writes.push({ device, level, id });
      audio[device].level = level;
      afterWrite?.(device);
    }, currentGuard() {
      const active = revision;
      return () => revision !== active ? 'The deck mode changed.' : undefined;
    } };
  const presets = new AudioPresets(file, options);
  const read = (name = 'work', instance = presets) => instance.snapshot().presets.find(({ id }) => id === name);
  const capture = (preset = 'work') => presets.change({ preset, action: 'capture' });
  const apply = (token, preset = 'work') => presets.change({ preset, action: 'apply', token });
  return { presets, file, audio, read, capture, apply, writes, reload: () => new AudioPresets(file, options), setAfterWrite: (next) => { afterWrite = next; },
    invalidate() { revision++; } };
}

test('audio presets keep activity volumes, show current and saved levels, and confirm exact endpoint writes', async (t) => {
  const f = fixture(t);
  assert.equal(f.read().token, null);
  await f.capture();
  f.audio.output.level = 85;
  f.audio.microphone.level = 61;
  await f.capture('gaming');
  const loaded = f.reload();
  assert.equal(f.read('gaming', loaded).channels[0].saved, 85);
  const work = f.read('work', loaded);
  assert.deepEqual(work.channels.map(({ label, current, saved }) => [label, current, saved]), [['Speakers', 85, 42], ['Microphone', 61, 76]]);
  assert.equal(JSON.stringify(work).includes(f.audio.microphone.id), false);
  assert.equal((await f.apply(work.token)).ok, true);
  assert.deepEqual(f.writes, [{ device: 'output', level: 42, id: 'speakers-a' }, { device: 'microphone', level: 76, id: 'microphone-a' }]);
  assert.equal(f.audio.output.muted, true);
  assert.equal(f.audio.microphone.muted, false);
});

test('changing an endpoint or current volume invalidates a reviewed preset before any write', async (t) => {
  const f = fixture(t);
  await f.capture();
  const reviewed = f.read();
  f.audio.microphone.level = 71;
  await assert.rejects(f.apply(reviewed.token), /changed/);
  const newToken = f.read().token;
  f.audio.output.id = 'speakers-b';
  await assert.rejects(f.apply(newToken), /changed/);
  assert.equal(f.read().token, null);
  assert.deepEqual(f.writes, []);
});

test('a second volume change or deck mode switch stops the remaining writes with accurate partial readback', async (t) => {
  const f = fixture(t);
  await f.capture();
  f.audio.output.level = 20;
  f.audio.microphone.level = 35;
  f.setAfterWrite(() => { f.audio.microphone.level = 37; });
  const partial = await f.apply(f.read().token);
  assert.equal(partial.ok, false);
  assert.match(partial.message, /1 of 2 levels confirmed/);
  assert.equal(f.writes.length, 1);
  assert.equal(f.audio.microphone.level, 37);
  f.audio.output.level = 20;
  f.setAfterWrite(() => f.invalidate());
  assert.match((await f.apply(f.read().token)).message, /deck mode changed/i);
  assert.equal(f.writes.length, 2);
});
