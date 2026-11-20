// @ts-check
'use strict';

const { randomBytes } = require('node:crypto');
const { SnapshotRequestError } = require('./mcp-snapshot');

const REQUEST = /^[a-f0-9]{24}$/;
const TARGET = /^obs-(?:scene|source)-[a-f0-9]{24}$/;
const KEY = /^[a-z0-9_-]{8,64}$/i;
const ACTIONS = ['scene', 'visibility', 'mute'];
const OUTPUTS = { record: { state: 'recording', label: 'OBS recording output' }, stream: { state: 'streaming', label: 'OBS streaming output' } };
const STATES = ['awaiting_confirmation', 'applying', 'cancel_requested', 'confirmed', 'unconfirmed', 'stale', 'declined', 'cancelled', 'expired', 'failed'];
const OUTSTANDING = new Set(['awaiting_confirmation', 'applying', 'cancel_requested']);
const CANCELLED = new Set(['stale', 'declined', 'cancelled', 'expired']);
const CAPACITY = 32;
const RETENTION_MS = 15 * 60_000;
const CONFIRMATION_MS = 60_000;

const number = { type: 'integer', minimum: 0 };
const value = { type: 'boolean' };
const id = (pattern) => ({ type: 'string', pattern: pattern.source });
const obsActionInput = { type: 'object', additionalProperties: false, required: ['command'], properties: {
  command: { enum: ['request', 'status', 'cancel'] }, generation: number, target: id(TARGET), action: { enum: ACTIONS },
  value, idempotencyKey: id(KEY), request: id(REQUEST),
} };
const obsActionOutput = { type: 'object', additionalProperties: false, required: ['request', 'status', 'updatedAt'], properties: {
  request: id(REQUEST), status: { enum: STATES }, updatedAt: number,
} };
const obsOutputInput = { type: 'object', additionalProperties: false, required: ['command'], properties: {
  command: obsActionInput.properties.command, generation: number, action: { enum: Object.keys(OUTPUTS) },
  before: value, value, idempotencyKey: id(KEY), request: id(REQUEST),
} };
const is = (value, pattern) => typeof value === 'string' && pattern.test(value);

function obsActionParams(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose an OBS review command.');
  const { command, generation, target, action, value, idempotencyKey, request } = input;
  if ((command === 'status' || command === 'cancel') && Object.keys(input).length === 2 && is(request, REQUEST)) return { command, request };
  const fields = ['command', 'generation', 'target', 'action', 'idempotencyKey', ...(action === 'scene' ? [] : ['value'])];
  if (command !== 'request' || Object.keys(input).length !== fields.length || !fields.every((field) => Object.hasOwn(input, field))
      || !Number.isSafeInteger(generation) || generation < 0 || !is(target, TARGET) || !is(idempotencyKey, KEY)
      || !ACTIONS.includes(action) || (action === 'scene' ? !target.startsWith('obs-scene-') : typeof value !== 'boolean' || !target.startsWith('obs-source-'))) {
    throw new Error('Choose a current OBS generation, a discovered target, and the requested scene or source action.');
  }
  return { command, generation, target, action, idempotencyKey, ...(action !== 'scene' ? { value } : {}) };
}

function obsOutputParams(input) {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const { command, request, generation, action, before, value, idempotencyKey } = input;
    if (['status', 'cancel'].includes(command) && Object.keys(input).length === 2 && is(request, REQUEST)) return { command, request };
    const fields = ['command', 'generation', 'action', 'before', 'value', 'idempotencyKey'];
    if (command === 'request' && Object.keys(input).length === fields.length && fields.every((field) => Object.hasOwn(input, field))
        && Number.isSafeInteger(generation) && generation >= 0 && typeof action === 'string' && Object.hasOwn(OUTPUTS, action)
        && typeof before === 'boolean' && typeof value === 'boolean' && is(idempotencyKey, KEY)) {
      return { command, generation, action, before, value, idempotencyKey };
    }
  }
  throw new SnapshotRequestError('Choose a current OBS generation, recording or streaming output, and the current and desired state.');
}

const output = ({ request, status, updatedAt }) => ({ request, status, updatedAt });

class AgentObsActions {
  constructor({ obs, media = undefined, approve, history, canReview, productionOutputs = false, now = Date.now, timeout = CONFIRMATION_MS }) {
    this.obs = obs;
    this.media = media;
    this.approve = approve;
    this.history = history;
    this.canReview = canReview;
    this.productionOutputs = productionOutputs;
    this.now = now;
    this.timeout = timeout;
    this.requests = new Map();
  }

  target(owner, params) {
    const { action, target, value, generation } = params;
    const view = this.obs.view;
    if (view?.status !== 'connected' || view.generation !== generation) return null;
    if (this.productionOutputs) {
      if (!Object.hasOwn(OUTPUTS, action)) return null;
      const { state, label } = OUTPUTS[action];
      const current = view[state];
      if (!current || current.phase || typeof current.active !== 'boolean' || current.active !== params.before) return null;
      const describe = (running, paused) => running ? paused ? 'Paused' : 'Active' : 'Stopped';
      const operation = value === current.active ? `Keep OBS ${state} ${value ? 'active' : 'stopped'}`
        : `${value ? 'Start' : 'Stop'} OBS ${state}`;
      return { command: { type: action, generation, value }, label, current: current.active, desired: value,
        operation,
        details: { current: describe(current.active, current.paused), requested: describe(value, current.active && current.paused) } };
    }
    const ref = (kind, ...values) => this.media.alias(owner, kind, [generation, ...values]);
    if (action === 'scene') {
      const label = view.scenes.slice(0, 256).find((name) => typeof name === 'string' && name.length <= 512 && ref('obs-scene', name) === target);
      if (!label) return null;
      const bus = view.studio ? 'Preview' : 'Program';
      const before = view.studio ? view.preview : view.program;
      return { command: { type: 'scene', generation, value: label, studio: view.studio }, label,
        current: before, desired: label, operation: `Change the OBS ${bus.toLowerCase()} scene` };
    }
    const scene = view.sourceScene;
    if (!scene) return null;
    const item = view.items.slice(0, 256).find(({ id, name }) => Number.isSafeInteger(id) && id >= 0 && typeof name === 'string'
      && name.length <= 512 && ref('obs-source', scene, id, name) === target);
    if (!item) return null;
    const command = { type: action, generation, scene, item: item.id, value };
    if (action === 'visibility' && typeof item.visible === 'boolean') return { command, label: item.name, scene,
      current: item.visible, desired: value, operation: value ? 'Show OBS source' : 'Hide OBS source' };
    if (action === 'mute' && view.detail?.id === item.id && view.detail.name === item.name && typeof view.detail.muted === 'boolean') {
      return { command: { ...command, source: item.name }, label: item.name, scene, current: view.detail.muted, desired: value,
        operation: value ? 'Mute OBS source' : 'Unmute OBS source' };
    }
    return null;
  }

  change(client, params, authorized) {
    if (!authorized()) throw new SnapshotRequestError('The OBS action grant changed.');
    for (const [id, entry] of this.requests) {
      if (!OUTSTANDING.has(entry.status) && this.now() - entry.updatedAt >= RETENTION_MS) this.requests.delete(id);
    }
    if (params.command !== 'request') {
      const entry = this.requests.get(params.request);
      if (!entry || entry.owner !== client.id) throw new SnapshotRequestError('That OBS review request is unavailable.');
      if (params.command === 'cancel') {
        if (entry.status === 'awaiting_confirmation') this.finish(entry, 'cancelled');
        else if (entry.status === 'applying') this.update(entry, 'cancel_requested');
      }
      return output(entry);
    }
    const { idempotencyKey, ...shape } = params;
    const signature = JSON.stringify(shape);
    const existing = [...this.requests.values()].find(({ owner, key }) => owner === client.id && key === idempotencyKey);
    if (existing) {
      if (existing.signature !== signature) throw new SnapshotRequestError('Use a different request key for new OBS parameters.');
      return output(existing);
    }
    if (!this.canReview() || this.pending || this.approve.isOpen?.()) throw new SnapshotRequestError('OBS review is unavailable on the deck.');
    if (this.requests.size >= CAPACITY) throw new SnapshotRequestError('The OBS review history is full.');
    const plan = this.target(client.id, params);
    if (!plan) throw new SnapshotRequestError('The OBS target changed or is unavailable. Read its current state again.');
    const entry = { request: randomBytes(12).toString('hex'), owner: client.id, key: idempotencyKey, signature, params, plan, authorized,
      controller: new AbortController(), status: 'awaiting_confirmation', updatedAt: this.now() };
    this.requests.set(entry.request, entry);
    this.pending = entry;
    entry.timer = setTimeout(() => this.finish(entry, 'expired'), this.timeout).unref();
    void this.review(entry).catch(() => this.finish(entry, 'failed'));
    return output(entry);
  }

  update(entry, status) { Object.assign(entry, { status, updatedAt: this.now() }); }

  finish(entry, status) {
    if (!OUTSTANDING.has(entry.status)) return;
    const target = this.productionOutputs ? 'obs-output-' + entry.params.action : entry.params.target;
    const context = entry.owner.slice(0, 8) + ' · ' + target;
    const label = entry.plan.operation;
    clearTimeout(entry.timer);
    this.update(entry, status);
    entry.controller.abort();
    Object.assign(entry, { authorized: undefined, plan: undefined, params: undefined });
    if (this.pending === entry) this.pending = null;
    void this.history.run({ origin: 'agent', label, context, at: entry.updatedAt },
      () => ({ ok: status === 'confirmed', cancelled: CANCELLED.has(status) })).catch(() => {});
  }

  checkPending(entry = this.pending) {
    if (entry?.status !== 'awaiting_confirmation') return;
    if (!this.canReview() || !entry.authorized()) this.finish(entry, 'cancelled');
    else if (JSON.stringify(this.target(entry.owner, entry.params)) !== JSON.stringify(entry.plan)) this.finish(entry, 'stale');
  }

  async review(entry) {
    const { plan } = entry;
    const caller = entry.owner.slice(0, 8);
    const accepted = await this.approve({ caller, kind: 'action', operation: plan.operation, target: plan.label,
      signal: entry.controller.signal, details: [{ field: 'OBS state', value: plan.details ?? { scene: plan.scene, current: plan.current, requested: plan.desired } }] });
    this.checkPending(entry);
    if (entry.status !== 'awaiting_confirmation') return;
    if (!accepted) return this.finish(entry, 'declined');
    if (this.productionOutputs) {
      await this.obs.refresh();
      this.checkPending(entry);
      if (entry.status !== 'awaiting_confirmation') return;
    }
    clearTimeout(entry.timer);
    this.update(entry, 'applying');
    const allowed = () => entry.status === 'applying' && entry.authorized?.() && this.canReview()
      && this.obs.view?.status === 'connected' && this.obs.view.generation === plan.command.generation;
    if (!allowed()) return this.finish(entry, 'cancelled');
    try {
      if (plan.current !== plan.desired) {
        const result = await this.obs.change(plan.command, undefined, allowed);
        if (result?.ok !== true) return this.finish(entry, 'unconfirmed');
      }
      this.finish(entry, allowed() ? 'confirmed' : 'unconfirmed');
    } catch (error) {
      this.finish(entry, !allowed() || /did not confirm|connection interrupted/i.test(error.message) ? 'unconfirmed' : 'failed');
    }
  }
}

module.exports = { AgentObsActions, obsActionInput, obsActionOutput, obsActionParams, obsOutputInput, obsOutputParams };
