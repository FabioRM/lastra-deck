'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { AgentAudioReader, audioParams } = require('../src/main/mcp-audio');
const { verifiedPeak } = require('../src/main/audio-win32');
const { AppMixerPins } = require('../src/main/app-mixer-pins');
const { tempDir } = require('./helpers/temp-dir');

const ids = { output: '{speaker-private-guid}', secondary: '{other-private-guid}', defaultInput: '{default-private-guid}',
  otherInput: '{other-input-private-guid}', unknownInput: '{unknown-private-guid}' };
const owner = 'a'.repeat(32);
const peer = 'b'.repeat(32);
const query = (reader, params, client = owner) => reader.snapshot(audioParams(params), client);

function fixture(sources = {}) {
  let now = 10_000;
  let failPlayback = false;
  const calls = { playback: 0, mixer: 0, meter: [] };
  const cached = { sampledAt: now - 25, version: 1,
    output: { id: ids.output, name: 'PRIVATE SPEAKER', level: 78, muted: false },
    microphone: { id: ids.defaultInput, level: 50, muted: false },
    inputs: [{ id: ids.defaultInput, level: 50, muted: true, name: 'PRIVATE HEADSET' },
      { id: ids.otherInput, level: 55, muted: false, name: 'PRIVATE WEBCAM' },
      { id: ids.unknownInput, level: null, muted: null, name: 'PRIVATE CAPTURE' }] };
  const defaults = {
    readState: () => cached,
    listPlayback: () => {
      calls.playback++;
      if (failPlayback) throw new Error('PRIVATE DEVICE DESCRIPTION');
      return { defaultId: ids.output, devices: [
        { id: ids.secondary, name: 'PRIVATE UNPLUGGED', state: 'disconnected' },
        { id: ids.output, name: 'PRIVATE DEFAULT DEVICE', state: 'active' },
      ] };
    },
    listApps: () => { calls.mixer++; return []; },
    pinStatus: (apps) => apps,
    readPeaks: (command) => {
      calls.meter.push(command);
      return {
        output: { id: ids.output, status: 'live', value: .1 },
        input: command.inputId === ids.defaultInput ? { id: ids.defaultInput, status: 'muted', value: .8 }
          : { id: ids.otherInput, status: 'live', value: .27, waveform: 'PRIVATE WAVEFORM' },
      };
    },
  };
  const reader = new AgentAudioReader({ ...defaults, ...sources, now: () => now, monotonic: () => now, aliasKey: Buffer.alloc(32, 5) });
  return { reader, cached, calls, advance: (ms) => { now += ms; }, failPlayback: () => { failPlayback = true; } };
}

test('endpoint state uses per-device mute, capture group state, and aliases scoped to this client', () => {
  const { reader, cached, advance, calls } = fixture();
  const state = query(reader, { section: 'state' });
  assert.equal(state.output.level, 78);
  assert.equal(state.output.muted, false);
  assert.equal(state.output.status, 'live');
  assert.equal(state.ageMs, 25);
  assert.equal(state.capture.muteState, 'mixed');
  assert.equal(state.capture.activeCount, 3);
  assert.equal(state.capture.unknownCount, 1);
  assert.equal(state.inputs[0].id, state.capture.defaultId);
  assert.equal(state.inputs[0].muted, true);
  assert.notEqual(state.capture.defaultId, query(reader, { section: 'state' }, peer).capture.defaultId);
  assert.ok(!JSON.stringify(state).includes('PRIVATE') && !JSON.stringify(state).includes(ids.defaultInput));
  assert.deepEqual(calls, { playback: 0, mixer: 0, meter: [] });
  advance(5_001);
  assert.equal(query(reader, { section: 'state' }).output.status, 'stale');
  cached.sampledAt = null;
  assert.equal(query(reader, { section: 'state' }).status, 'unavailable');
  cached.inputs[1].muted = null;
  assert.equal(query(reader, { section: 'state' }).capture.muteState, 'unknown');
});

test('playback devices reuse the default alias, retain stale samples, and bind paged results to the grant', () => {
  const { reader, advance, failPlayback, calls } = fixture();
  const state = query(reader, { section: 'state' });
  const list = query(reader, { section: 'playback', limit: 1 });
  assert.deepEqual(list.devices, [{ id: state.output.id, state: 'active', default: true }]);
  assert.equal(list.defaultOutput, state.output.id);
  const second = query(reader, { section: 'playback', limit: 1, cursor: list.nextCursor });
  assert.equal(second.devices[0].state, 'disconnected');
  assert.throws(() => query(reader, { section: 'playback', limit: 1, cursor: list.nextCursor }, peer), /cursor is unavailable/);
  failPlayback();
  assert.equal(query(reader, { section: 'playback' }).status, 'ready');
  assert.equal(calls.playback, 1);
  advance(1000);
  const stale = query(reader, { section: 'playback' });
  assert.equal(stale.status, 'stale');
  assert.equal(stale.ageMs, 1000);
  assert.doesNotMatch(JSON.stringify(stale), /PRIVATE|private-guid/);
});

test('the mixer reuses saved pins, distinguishes offline rows from failed enumerations and preserves settings', (t) => {
  const directory = tempDir(t, 'lastra-mcp-audio-');
  const file = path.join(directory, 'audio-pins.json');
  const raw = JSON.stringify({ version: 1, pins: [{ id: 'a'.repeat(64), name: 'PRIVATE PIN' }] });
  fs.writeFileSync(file, raw);
  const pins = new AppMixerPins(file);
  let failure = false;
  const winApps = [{ id: 'b'.repeat(64), name: 'PRIVATE PROCESS', pid: 402811, path: 'C:/PRIVATE/EXE.exe', active: true,
    canPin: true, count: 2, level: 45, muted: false, mixedMute: true, mixedLevel: false }];
  const provider = { listApps: () => {
    if (failure) throw new Error('PRIVATE SESSION ERROR');
    return winApps;
  }, pinStatus: (apps) => pins.withStatus(apps) };
  const { reader, advance } = fixture(provider);
  const list = query(reader, { section: 'mixer' });
  assert.deepEqual(list.apps.map(({ pinned, online, status, level }) => [pinned, online, status, level]),
    [[true, false, 'offline', null], [false, true, 'live', 45]]);
  assert.equal(list.apps[1].mixedMute, true);
  const selected = query(reader, { section: 'mixer', pinnedOnly: true });
  assert.equal(selected.apps[0].id, list.apps[0].id);
  failure = true;
  advance(1000);
  const stale = query(reader, { section: 'mixer' });
  assert.equal(stale.status, 'stale');
  assert.equal(stale.apps[1].online, null);
  const unavailable = query(fixture(provider).reader, { section: 'mixer' });
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.apps[0].status, 'unavailable');
  assert.equal(unavailable.apps[0].pinned, true);
  for (const secret of ['PRIVATE', '402811', winApps[0].id]) assert.ok(!JSON.stringify([list, stale]).includes(secret));
  assert.equal(fs.readFileSync(file, 'utf8'), raw);
});

test('peak reads use the exact input or default, suppress muted or stale readings, and are globally throttled', () => {
  const { reader, advance, calls } = fixture();
  const state = query(reader, { section: 'state' });
  const selected = state.inputs.find(({ muted }) => muted === false).id;
  const defaults = query(reader, { section: 'peaks' });
  assert.deepEqual(defaults.peaks, { output: { id: state.output.id, status: 'live', value: .1 },
    input: { id: state.capture.defaultId, status: 'muted', value: null } });
  assert.deepEqual(calls.meter[0], { inputId: ids.defaultInput, outputId: ids.output, requireDefaultInput: true });
  const peerAlias = query(reader, { section: 'state' }, peer).capture.defaultId;
  assert.equal(query(reader, { section: 'peaks', target: 'input', input: peerAlias }, peer).status, 'throttled');
  advance(500);
  assert.equal(query(reader, { section: 'peaks', target: 'input', input: peerAlias }).status, 'unavailable');
  assert.equal(calls.meter.length, 1);
  const explicit = query(reader, { section: 'peaks', target: 'input', input: selected });
  assert.deepEqual(explicit.peaks, { input: { id: selected, status: 'live', value: .27 } });
  assert.deepEqual(calls.meter[1], { inputId: ids.otherInput, outputId: undefined, requireDefaultInput: false });
  advance(500);
  const outputOnly = query(reader, { section: 'peaks', target: 'output' });
  assert.equal(Object.hasOwn(outputOnly.peaks, 'input'), false);
  assert.equal(calls.meter[2].inputId, undefined);
  advance(5_001);
  assert.equal(query(reader, { section: 'peaks' }).status, 'stale');
  assert.equal(calls.meter.length, 3);
  assert.doesNotMatch(JSON.stringify([defaults, explicit, outputOnly]), /PRIVATE|private-guid/);
  assert.throws(() => audioParams({ section: 'peaks', input: ids.defaultInput }), /microphone alias/);
  assert.throws(() => audioParams({ section: 'state', command: 'unmute' }), /supported options/);
});

test('Core Audio verifies identity and mute before and after reading a scalar peak', () => {
  const id = 'exact-device';
  const never = () => assert.fail('The meter must not run for this endpoint');
  const row = (muted, exact = id) => ({ id: exact, muted });
  let called = false;
  assert.deepEqual(verifiedPeak(id, () => row(true), () => { called = true; return .8; }), { id, status: 'muted', value: null });
  assert.equal(called, false);
  assert.equal(verifiedPeak(id, () => row(false, 'new-default'), never).status, 'unavailable');
  const raced = [row(false), row(true)];
  assert.deepEqual(verifiedPeak(id, () => raced.shift(), () => .8), { id, status: 'muted', value: null });
  const moved = [row(false), row(false, 'changed')];
  assert.deepEqual(verifiedPeak(id, () => moved.shift(), () => .3), { id, status: 'unavailable', value: null });
  assert.deepEqual(verifiedPeak(id, () => row(false), () => 0), { id, status: 'live', value: 0 });
  assert.equal(verifiedPeak(id, () => row(false), () => NaN).status, 'unavailable');
});
