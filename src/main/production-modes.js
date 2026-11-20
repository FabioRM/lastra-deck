// @ts-check
'use strict';

const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const { readJsonSettings, writeJsonSettings, isMissing } = require('./json-settings-file');

const MODES = Object.freeze(['setup', 'live', 'break']);
const PREVIEW_MS = 30_000;
const OUTPUTS = ['leave', 'start', 'stop'];
const MAX_CONFIG_BYTES = 8_192;
const fields = ['scene', 'bus', 'record', 'stream'];
const allowed = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every((key) => keys.includes(key));

function defaults() {
  return { version: 1, modes: Object.fromEntries(MODES.map((id) => [id, {
    scene: null, bus: id === 'setup' ? 'preview' : 'program', record: 'leave', stream: 'leave',
  }])) };
}

function normalizeModes(config) {
  if (!allowed(config, ['version', 'modes']) || config.version !== 1 || !allowed(config.modes, MODES)) {
    throw new Error('Choose settings for Setup, Live and Break.');
  }
  const result = defaults();
  for (const id of MODES) {
    const mode = config.modes[id];
    if (!allowed(mode, fields) || !['preview', 'program'].includes(mode.bus) || !OUTPUTS.includes(mode.record)
        || !OUTPUTS.includes(mode.stream) || (mode.scene !== null &&
          (typeof mode.scene !== 'string' || !/^\P{C}{1,512}$/u.test(mode.scene) || !mode.scene.trim()))) {
      throw new Error(`Choose a valid scene, bus and OBS outputs for ${id}.`);
    }
    result.modes[id] = { scene: mode.scene, bus: mode.bus, record: mode.record, stream: mode.stream };
  }
  return result;
}

function readConfig(file) {
  return readJsonSettings(file, {
    maxBytes: MAX_CONFIG_BYTES,
    parse: (data) => ({ config: normalizeModes(data), warning: null }),
    fallback: (error) => ({ config: defaults(), warning: isMissing(error) ? null : 'Could not read production mode settings.' }),
  });
}

function outputState(value) {
  return typeof value?.active === 'boolean' ? { active: value.active, phase: value.phase ?? null,
    ...(typeof value.paused === 'boolean' ? { paused: value.paused } : {}) } : null;
}

function snapshot(view) {
  if (view.status !== 'connected') return null;
  return { generation: view.generation, studio: view.studio, program: view.program, preview: view.preview,
    scenes: [...view.scenes].sort(), recording: outputState(view.recording), streaming: outputState(view.streaming) };
}

function planMode(mode, initial) {
  if (!initial) throw new Error('OBS must be connected before applying a mode.');
  if (mode.scene && !initial.scenes.includes(mode.scene)) throw new Error('The configured scene is unavailable in the current OBS collection.');
  if (mode.scene && mode.bus === 'preview' && !initial.studio) throw new Error('Turn on OBS Studio Mode to use a Preview scene.');
  if (mode.stream !== 'leave' && (!initial.streaming || initial.streaming.phase)) throw new Error('Wait for the stream status to settle.');
  if (mode.record !== 'leave' && (!initial.recording || initial.recording.phase)) throw new Error('Wait for the recording status to settle.');
  const steps = [];

  function output(step, desired) {
    const type = step === 'recording' ? 'record' : 'stream';
    const label = `${desired ? 'Start' : 'Stop'} ${type === 'record' ? 'recording' : 'streaming'}`;
    const current = initial[step];
    const already = current.active === desired;
    const message = already ? `Already ${desired ? current.paused ? 'active and paused' : 'active' : 'stopped'}.` : undefined;
    steps.push({ label, command: already ? null : { type, value: desired }, message,
      expected: { [step]: { active: desired, phase: null, ...(type === 'record' ? { paused: false } : {}) } } });
  }

  if (mode.stream === 'stop') output('streaming', false);
  if (mode.record === 'stop') output('recording', false);
  if (mode.scene) {
    const current = initial[mode.bus];
    const label = `${mode.bus === 'preview' ? 'Preview' : 'Program'} · ${mode.scene}`;
    if (current === mode.scene) steps.push({ label, command: null, message: 'Already on this scene.' });
    else if (mode.bus === 'program' && initial.studio) {
      if (initial.preview !== mode.scene) steps.push({ label: `Prepare Preview · ${mode.scene}`,
        command: { type: 'scene', value: mode.scene, studio: true }, expected: { preview: mode.scene } });
      steps.push({ label: `Transition to ${mode.scene}`, command: { type: 'transition', preview: mode.scene },
        expected: { program: mode.scene }, previewMaySwap: true });
    } else steps.push({ label, command: { type: 'scene', value: mode.scene, studio: initial.studio }, expected: { [mode.bus]: mode.scene } });
  }
  if (mode.record === 'start') output('recording', true);
  if (mode.stream === 'start') output('streaming', true);
  if (!steps.length) throw new Error('Configure a scene or output for this mode first.');
  return steps;
}

const matches = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = (message) => ({ ok: false, message });

class ProductionModes extends EventEmitter {
  constructor(file, obs, { now = () => performance.now(), token = randomUUID } = {}) {
    super();
    this.file = file;
    this.obs = obs;
    this.now = now;
    this.token = token;
    Object.assign(this, readConfig(file));
    this.revision = 1;
    this.previewRevision = 0;
    this.contextRevision = 0;
    this.pending = null;
    this.running = null;
    this.last = null;
    this.onObs = (view) => { if (view.status !== 'connected') this.interrupt(); };
    this.obs.on('update', this.onObs);
  }

  invalidate() {
    this.previewRevision++;
    this.pending = null;
  }

  interrupt() {
    this.contextRevision++;
    this.invalidate();
  }

  dispose() {
    this.interrupt();
    this.obs.off('update', this.onObs);
  }

  state() {
    return structuredClone({ config: this.config, warning: this.warning, revision: this.revision, run: this.running ?? this.last });
  }

  configure({ config, revision }) {
    if (this.running) return fail('Wait for the current production mode.');
    if (revision !== this.revision) return fail('Production mode settings changed. Reload them before saving.');
    const next = normalizeModes(config);
    try {
      writeJsonSettings(this.file, next, { space: 2 });
    } catch { return fail('Could not save production mode settings.'); }
    this.config = next;
    this.warning = null;
    this.revision++;
    this.invalidate();
    return { ok: true, state: this.state() };
  }

  async preview(mode, guard) {
    if (this.running) return fail('Wait for the current production mode.');
    if (!MODES.includes(mode)) return fail('Choose Setup, Live or Break.');
    this.invalidate();
    const revision = this.previewRevision;
    await this.obs.refresh();
    if (guard() || revision !== this.previewRevision || this.running) return fail('The OBS view changed. Open the mode preview again.');
    const before = snapshot(this.obs.view);
    const steps = planMode(this.config.modes[mode], before);
    const token = this.token();
    this.pending = { token, mode, before, steps, expires: this.now() + PREVIEW_MS, context: this.contextRevision };
    return { ok: true, preview: { token, mode, expiresInMs: PREVIEW_MS,
      steps: steps.map(({ label, command, message }) => ({ label, status: command ? 'ready' : 'already', message })) } };
  }

  async apply(token, guard) {
    if (this.running) return fail('Wait for the current production mode.');
    const planned = this.pending;
    if (!planned || token !== planned.token) return fail('Open a fresh mode preview before applying it.');
    this.invalidate();
    if (this.now() >= planned.expires || guard()) return fail('The mode preview expired or the OBS view changed.');
    const { mode, steps, context } = planned;
    /** @type {{ mode: any, status: string, message?: string, steps: { label: string, status: string, message?: string }[] }} */
    const run = { mode, status: 'running', steps: steps.map(({ label }) => ({ label, status: 'pending' })) };
    const publish = () => this.emit('update', this.state());
    this.running = run;
    publish();
    let expected = planned.before;
    let index = -1;
    try {
      await this.obs.withCommandSequence(async (change) => {
        await this.obs.refresh();
        if (this.now() >= planned.expires) throw new Error('The mode preview expired. Open it again to apply this mode.');
        const ready = () => !guard() && context === this.contextRevision && matches(snapshot(this.obs.view), expected);
        if (!ready()) throw new Error('OBS state changed after the preview. Open a fresh mode preview.');
        for (const [position, step] of steps.entries()) {
          if (!ready()) throw new Error('OBS state or the deck changed. Remaining steps were skipped.');
          if (!step.command) {
            run.steps[position].status = 'already';
            run.steps[position].message = step.message;
            publish();
            continue;
          }
          index = position;
          run.steps[index].status = 'running';
          publish();
          const result = await change({ ...step.command, generation: expected.generation });
          if (result?.ok !== true) throw new Error(result?.message ?? 'OBS did not verify the command.');
          const actual = snapshot(this.obs.view);
          const next = { ...expected, ...step.expected };
          if (step.previewMaySwap && actual?.preview === expected.program) next.preview = actual.preview;
          run.steps[index].status = 'confirmed';
          index = -1;
          publish();
          if (!matches(actual, next)) throw new Error('OBS confirmed this action, but another OBS state changed.');
          expected = next;
        }
      });
      run.status = 'confirmed';
      run.message = 'OBS verified every requested step.';
    } catch (error) {
      if (index >= 0) {
        run.steps[index].status = 'unverified';
        run.steps[index].message = error.message;
      }
      for (const step of run.steps) if (step.status === 'pending') step.status = 'skipped';
      run.status = 'incomplete';
      run.message = error.message;
    } finally {
      this.last = run;
      this.running = null;
      publish();
    }
    return { ok: run.status === 'confirmed', state: this.state(), message: run.message };
  }

  async request(command, guard) {
    if (!allowed(command, ['type', 'mode', 'token', 'revision', 'config'])) return fail('Choose a production mode command.');
    try {
      switch (command.type) {
        case 'read': return { ok: true, state: this.state() };
        case 'configure': return guard() ? fail('Open OBS in control mode to configure production modes.') : this.configure(command);
        case 'preview': return await this.preview(command.mode, guard);
        case 'cancel':
          if (this.pending?.token === command.token) this.invalidate();
          return { ok: true };
        case 'apply': return await this.apply(command.token, guard);
        default: return fail('Choose a production mode command.');
      }
    } catch (error) { return fail(error.message); }
  }
}

module.exports = { ProductionModes, MODES, normalizeModes, planMode };
