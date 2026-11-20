'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { validateProfile, ProfileStore, toView } = require('../src/main/profile');
const { KeyPresses, IGNORED } = require('../src/main/key-presses');
const { LinkedControlRuntime, changeObsScene } = require('../src/main/linked-control-runtime');
const { Obs } = require('../src/main/obs');
const { createActionRunner } = require('../src/main/actions');
const { resolveLinkedKey, controlFromKey, linkKey, detachKey, clipboardControls, countPlacements, obsSceneState, sceneTarget } = require('../src/shared/linked-controls');
const { keyLiveState } = require('../src/renderer/key-live-state');

const command = { type: 'obs-scene', scene: 'Fixture wide shot', bus: 'program' };
const standing = 'Fixture overview';
const profileInput = {
  controlBindings: [{ id: 'shared-scene', label: 'Scene binding', action: command, onBusy: 'queue-one' },
    { id: 'shared-audio', label: 'Speaker binding', action: { type: 'audio', device: 'output' } }],
  grid: { rows: 1, cols: 2 },
  pages: [{ id: 'home', keys: [{ id: 'scene-tile', controlId: 'shared-scene', label: 'Wide', icon: 'video' },
    { id: 'audio-tile', controlId: 'shared-audio', label: 'Speakers', readout: 'speakers' }] }],
  bar: { keys: [{ id: 'mini-scene', controlId: 'shared-scene', label: 'Cam 1', icon: 'camera' },
    { id: 'mini-audio', controlId: 'shared-audio', label: 'Mute out' }] },
};

test('linked profile placements resolve one definition and preserve their independent presentation', () => {
  const profile = validateProfile(profileInput);
  const store = new ProfileStore({});
  store.current = profile;
  const main = store.findKey('scene-tile');
  const bar = store.findKey('mini-scene', profile.bar);
  assert.equal(main.action, bar.action);
  assert.equal(main.onBusy, 'queue-one');
  assert.deepEqual([main.label, bar.label], ['Wide', 'Cam 1']);
  assert.deepEqual([main.icon, bar.icon], ['video', 'camera']);
  assert.equal(profile.pages[0].keys[0].action, undefined);
  assert.equal(countPlacements(profile, 'shared-scene'), 2);
  assert.throws(() => validateProfile({ ...profileInput, controlBindings: [] }), /known linked control/);
  assert.throws(() => validateProfile({ ...profileInput, controlBindings: [...profileInput.controlBindings, profileInput.controlBindings[0]] }), /duplicate ID/);
  assert.throws(() => validateProfile({ controlBindings: profileInput.controlBindings,
    keys: [{ ...profileInput.bar.keys[0], action: command }] }), /without inline action/);
  assert.throws(() => validateProfile({ keys: [{ id: 'invalid', action: { ...command, scene: ' ' } }] }), /OBS scene name/);
  assert.throws(() => validateProfile({ keys: [{ id: 'invalid', action: { ...command, bus: 'stream' } }] }), /scene bus/);
  const old = validateProfile({ keys: [{ id: 'direct', action: { type: 'audio', device: 'output' } }] });
  assert.equal(old.controlBindings, undefined);
  assert.equal(resolveLinkedKey(old, old.keys[0]), old.keys[0]);
});

test('editor linking, unlinking and portable clipboard copies preserve behavior without sharing mutable action objects', () => {
  const profile = validateProfile(profileInput);
  const key = profile.pages[0].keys[0];
  const detached = detachKey(profile, key);
  assert.deepEqual(detached.action, command);
  assert.equal(detached.controlId, undefined);
  assert.equal(detached.label, key.label);
  assert.notEqual(detached.action, profile.controlBindings[0].action);
  const newControl = controlFromKey('copied-scene', detached);
  assert.deepEqual(newControl.action, detached.action);
  assert.notEqual(newControl.action, detached.action);
  const linked = linkKey(detached, newControl.id);
  assert.equal(linked.action, undefined);
  assert.deepEqual([linked.label, linked.icon, linked.controlId], ['Wide', 'video', 'copied-scene']);
  const copied = clipboardControls(profile, 'page', profile.pages[0]);
  const standalone = validateProfile({ ...profileInput, controlBindings: undefined, bar: { keys: [] }, pages: [copied] });
  assert.deepEqual(standalone.pages[0].keys[1].action, profile.controlBindings[1].action);
});

test('one busy state covers linked placements and a queued press can be cancelled across them', async () => {
  const updates = [];
  const presses = new KeyPresses();
  const runtime = new LinkedControlRuntime((scope, snapshot) => updates.push([scope, snapshot]), presses);
  let release;
  const first = runtime.run('shared-scene', 'queue-one', () => new Promise((resolve) => { release = resolve; }), 'profile-a');
  const queued = runtime.run('shared-scene', 'queue-one', () => assert.fail('The linked queue survived cancellation'), 'profile-a');
  assert.equal(await runtime.run('shared-scene', 'queue-one', () => assert.fail('The same binding ran twice'), 'profile-a'), IGNORED);
  assert.deepEqual(runtime.snapshot('profile-a'), { 'shared-scene': 2 });
  assert.deepEqual(runtime.snapshot('profile-b'), {});
  assert.equal(await runtime.run('shared-scene', 'ignore', () => 'other profile', 'profile-b'), 'other profile');
  presses.cancelPending();
  assert.equal(await queued, IGNORED);
  assert.deepEqual(runtime.snapshot('profile-a'), { 'shared-scene': 1 });
  release('confirmed');
  assert.equal(await first, 'confirmed');
  assert.deepEqual(runtime.snapshot('profile-a'), {});
  assert.deepEqual(updates.filter(([scope]) => scope === 'profile-a').map(([, state]) => state),
    [{ 'shared-scene': 1 }, { 'shared-scene': 2 }, { 'shared-scene': 1 }, {}]);
});

class FixtureObsClient extends EventEmitter {
  program = standing;
  preview = standing;
  studio = false;
  writes = [];
  pending = null;

  stop() {}
  disconnect() { this.emit('status', 'disconnected'); }

  async request(type, data) {
    if (type === 'GetSceneList') return { currentProgramSceneName: this.program, currentPreviewSceneName: this.preview,
      scenes: [standing, command.scene].map((sceneName) => ({ sceneName })) };
    if (type === 'GetStudioModeEnabled') return { studioModeEnabled: this.studio };
    if (type === 'GetRecordStatus') return { outputActive: false, outputPaused: false };
    if (type === 'GetStreamStatus') return { outputActive: false };
    if (type === 'SetCurrentProgramScene' || type === 'SetCurrentPreviewScene') {
      this.writes.push({ type, data });
      await this.pending;
      if (type === 'SetCurrentProgramScene') this.program = data.sceneName;
      else this.preview = data.sceneName;
    }
    return {};
  }
}

test('a linked OBS scene uses provider readback, tracks external changes, and loses availability across disconnect and bus changes', async () => {
  const client = new FixtureObsClient();
  const obs = new Obs({ status: 'connecting' }, client);
  const target = sceneTarget(command);
  client.emit('status', 'syncing');
  await obs.refresh();
  assert.deepEqual(obsSceneState(obs.view, target), { text: 'Ready', pressed: false });
  let release;
  client.pending = new Promise((resolve) => { release = resolve; });
  const run = changeObsScene(obs, command);
  assert.deepEqual(obsSceneState(obs.view, target), { text: 'Ready', pressed: false });
  assert.deepEqual(client.writes, [{ type: 'SetCurrentProgramScene', data: { sceneName: command.scene } }]);
  release();
  assert.deepEqual(await run, { ok: true });
  assert.deepEqual(obsSceneState(obs.view, target), { text: 'On program', pressed: true });
  client.program = standing;
  client.emit('event', 'CurrentProgramSceneChanged', { sceneName: standing });
  await obs.refresh();
  assert.equal(obsSceneState(obs.view, target).pressed, false);
  client.emit('status', 'disconnected');
  assert.equal(obsSceneState(obs.view, target).pressed, null);
  assert.match((await changeObsScene(obs, command)).message, /disconnected/);
  client.studio = true;
  client.emit('status', 'syncing');
  await obs.refresh();
  assert.match((await changeObsScene(obs, command)).message, /Disable OBS Studio/);
  const preview = { ...command, bus: 'preview' };
  assert.deepEqual(await changeObsScene(obs, preview), { ok: true });
  assert.equal(obsSceneState(obs.view, sceneTarget(preview)).text, 'In preview');
  assert.equal(client.writes[1].type, 'SetCurrentPreviewScene');
});

test('the deck surfaces use the same provider updates for OBS and audio without exposing executable actions', async () => {
  const profile = validateProfile(profileInput);
  const deck = toView(profile);
  assert.deepEqual(deck.slots.map(({ controlId }) => controlId), deck.bar.keys.map(({ controlId }) => controlId));
  assert.deepEqual(deck.slots[0].sceneTarget, deck.bar.keys[0].sceneTarget);
  assert.doesNotMatch(JSON.stringify(deck), /"action"/);
  const audio = { output: { muted: false }, sampledAt: 1000 };
  for (const slot of [deck.slots[1], deck.bar.keys[1]]) assert.equal(keyLiveState(slot.audio, audio, null, 2000).pressed, false);
  const action = resolveLinkedKey(profile, profile.bar.keys[1]).action;
  let writes = 0;
  const runner = createActionRunner({ audio: { change(device) {
    assert.equal(device, 'output');
    audio.output.muted = !audio.output.muted;
    writes++;
  } } });
  assert.equal((await runner.run(action)).ok, true);
  assert.equal(writes, 1);
  for (const slot of [deck.slots[1], deck.bar.keys[1]]) {
    assert.equal(keyLiveState(slot.audio, audio, null, 2000).pressed, true);
    assert.equal(keyLiveState(slot.audio, audio, null, 5000).text, 'Cached');
    assert.equal(keyLiveState(slot.audio, {}, null, 5000).text, 'Unavailable');
  }
});
