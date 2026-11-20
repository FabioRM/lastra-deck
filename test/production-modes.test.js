'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { test } = require('node:test');
const { ProductionModes } = require('../src/main/production-modes');
const { Obs } = require('../src/main/obs');
const { deckRequestAllowed } = require('../src/main/deck-view-only');
const { tempDir } = require('./helpers/temp-dir');

class MockObs extends EventEmitter {
  constructor() {
    super();
    this.commands = [];
    this.view = { status: 'connected', generation: 1, studio: true, program: 'Intro', preview: 'Break',
      scenes: ['Intro', 'Break', 'Live'], recording: { active: false, paused: false, phase: null }, streaming: { active: false, phase: null } };
  }

  refresh() { return Promise.resolve(); }

  withCommandSequence(run) {
    return run(async (command) => {
      this.commands.push(command.type);
      if (this.fail === command.type) return { ok: false, message: 'The provider did not verify this request.' };
      const { type, value } = command;
      if (type === 'scene') this.view[command.studio ? 'preview' : 'program'] = value;
      if (type === 'transition') [this.view.preview, this.view.program] = [this.view.program, this.view.preview];
      if (type === 'record') this.view.recording = { active: value, paused: false, phase: null };
      if (type === 'stream') this.view.streaming = { active: value, phase: null };
      await this.afterCommand?.(command);
      return { ok: true };
    });
  }
}

const allow = () => false;

function fixture(t, options) {
  let modes;
  t.after(() => modes?.dispose());
  const dir = tempDir(t, 'lastra-modes-');
  const file = path.join(dir, 'production-modes.json');
  const obs = new MockObs();
  modes = new ProductionModes(file, obs, options);
  const request = (command, guard = allow) => modes.request(command, guard);
  const configure = (id, values) => {
    const { config, revision } = modes.state();
    Object.assign(config.modes[id], values);
    return request({ type: 'configure', config, revision });
  };
  return { file, obs, modes, request, configure };
}

test('production modes persist explicit configuration with no default OBS operations', async (t) => {
  const { file, modes, obs, request, configure } = fixture(t);
  assert.equal((await request({ type: 'preview', mode: 'live' })).ok, false);
  assert.equal((await configure('setup', { scene: 'Intro', bus: 'preview' })).ok, true);
  assert.equal((await configure('break', { scene: '\nBad' })).ok, false);
  assert.deepEqual(obs.commands, []);
  const copy = new ProductionModes(file, obs);
  t.after(() => copy.dispose());
  assert.deepEqual(copy.state().config, modes.state().config);
  obs.view.studio = false;
  assert.match((await request({ type: 'preview', mode: 'setup' })).message, /Turn on OBS Studio Mode/);
  assert.equal((await request({ type: 'configure', config: modes.state().config, revision: -1 })).ok, false);
});

test('production mode previews every ordered change and reports provider confirmation', async (t) => {
  const { obs, modes, request, configure } = fixture(t);
  await configure('live', { scene: 'Live', record: 'start', stream: 'start' });
  const { preview } = await request({ type: 'preview', mode: 'live' });
  assert.deepEqual(preview.steps.map(({ label, status }) => [label, status]), [
    ['Prepare Preview · Live', 'ready'], ['Transition to Live', 'ready'], ['Start recording', 'ready'], ['Start streaming', 'ready'],
  ]);
  assert.deepEqual(obs.commands, []);
  const progress = [];
  modes.on('update', ({ run }) => progress.push(run.steps.map(({ status }) => status)));
  const reply = await request({ type: 'apply', token: preview.token });
  assert.equal(reply.ok, true);
  assert.deepEqual(obs.commands, ['scene', 'transition', 'record', 'stream']);
  assert.ok(progress.some((statuses) => statuses.join() === 'confirmed,confirmed,running,pending'));
  assert.deepEqual(reply.state.run.steps.map(({ status }) => status), ['confirmed', 'confirmed', 'confirmed', 'confirmed']);
  assert.equal((await request({ type: 'apply', token: preview.token })).ok, false);
  const next = await request({ type: 'preview', mode: 'live' });
  assert.ok(next.preview.steps.every((step) => step.status === 'already'));
  assert.equal((await request({ type: 'apply', token: next.preview.token })).ok, true);
  assert.deepEqual(obs.commands, ['scene', 'transition', 'record', 'stream']);
});

test('production modes stop before changing scenes and never retry failed output requests', async (t) => {
  const { obs, request, configure } = fixture(t);
  obs.view.recording.active = obs.view.streaming.active = true;
  await configure('break', { scene: 'Break', record: 'stop', stream: 'stop' });
  const { preview } = await request({ type: 'preview', mode: 'break' });
  assert.deepEqual(preview.steps.map(({ label }) => label), ['Stop streaming', 'Stop recording', 'Transition to Break']);
  obs.fail = 'record';
  const reply = await request({ type: 'apply', token: preview.token });
  assert.equal(reply.ok, false);
  assert.deepEqual(obs.commands, ['stream', 'record']);
  assert.deepEqual(reply.state.run.steps.map(({ status }) => status), ['confirmed', 'unverified', 'skipped']);
  assert.equal(obs.view.program, 'Intro');
});

test('expired, changed, dismissed and interrupted production previews cannot run later steps', async (t) => {
  let now = 10;
  const { obs, modes, request, configure } = fixture(t, { now: () => now });
  await configure('live', { scene: 'Live', record: 'start', stream: 'start' });
  const issue = async () => (await request({ type: 'preview', mode: 'live' })).preview.token;
  const canceled = await issue();
  await request({ type: 'cancel', token: canceled });
  assert.equal((await request({ type: 'apply', token: canceled })).ok, false);
  const expired = await issue();
  now += 30_000;
  assert.equal((await request({ type: 'apply', token: expired })).ok, false);
  const changed = await issue();
  obs.view.program = 'Break';
  assert.match((await request({ type: 'apply', token: changed })).message, /state changed after the preview/);
  assert.deepEqual(obs.commands, []);

  const external = await issue();
  obs.afterCommand = () => { obs.view.recording.active = true; };
  const conflict = await request({ type: 'apply', token: external });
  assert.deepEqual(conflict.state.run.steps.map(({ status }) => status), ['confirmed', 'skipped', 'skipped', 'skipped']);
  assert.match(conflict.message, /another OBS state changed/);
  assert.deepEqual(obs.commands, ['scene']);

  const interrupted = await issue();
  obs.afterCommand = () => modes.interrupt();
  const partial = await request({ type: 'apply', token: interrupted });
  assert.equal(partial.ok, false);
  assert.deepEqual(obs.commands, ['scene', 'transition']);
  assert.equal(partial.state.run.steps.at(-1).status, 'skipped');
});

test('OBS command ownership blocks concurrent callers and releases after completion or interruption', async () => {
  const obs = new Obs({ status: 'disabled' }, null);
  obs.session = { busy: false, switching: false };
  obs.view = { status: 'connected', recording: { active: false, phase: null } };
  obs.refresh = async () => {};
  const command = { type: 'record', generation: obs.generation, value: false };
  await obs.withCommandSequence(async (change) => {
    await assert.rejects(obs.change(command), /sequence is already running/);
    assert.deepEqual(await change(command), { ok: true });
  });
  assert.deepEqual(await obs.change(command), { ok: true });
  await assert.rejects(obs.withCommandSequence(async (change) => {
    obs.session = { busy: false, switching: false };
    await change(command);
  }), /connection interrupted/);
  assert.deepEqual(await obs.change(command), { ok: true });
  assert.equal(deckRequestAllowed('production:modes', { type: 'preview' }), true);
  assert.equal(deckRequestAllowed('production:modes', { type: 'apply' }), false);
  assert.equal(deckRequestAllowed('production:modes', { type: 'configure' }), false);
});
