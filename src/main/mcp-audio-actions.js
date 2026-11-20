// @ts-check
'use strict';

const { randomBytes } = require('node:crypto');
const { recordAgentReview } = require('./action-history');
const { SnapshotRequestError } = require('./mcp-snapshot');
const { confirmState } = require('./confirm-state');

const TARGET = /^(?:output|input)-[a-f0-9]{24}$/;
const REQUEST = /^[a-f0-9]{24}$/;
const KEY = /^[a-zA-Z0-9_-]{8,64}$/;
const STATES = ['awaiting_confirmation', 'applying', 'cancel_requested', 'confirmed', 'unconfirmed',
  'stale', 'declined', 'cancelled', 'expired', 'failed'];
const OPEN = new Set(STATES.slice(0, 3));
const RETENTION_MS = 15 * 60_000;
const CONFIRMATION_MS = 60_000;
const MAX_REQUESTS = 32;
const matches = (value, pattern) => typeof value === 'string' && pattern.test(value);
const validLevel = (value) => Number.isInteger(value) && value >= 0 && value <= 100;
const validMute = (value) => typeof value === 'boolean';
const changes = {
  level: { valid: validLevel, operation: 'Set Windows audio level', field: 'Level in Windows', show: (value) => `${value}%`,
    audit: 'Apply approved Windows audio level', changed: 'The audio device or level changed. Read the current state again.' },
  muted: { valid: validMute, operation: 'Set Windows audio mute', field: 'Mute in Windows', show: (value) => value ? 'Muted' : 'Unmuted',
    audit: 'Apply approved Windows audio mute', changed: 'The audio device or mute state changed. Read the current state again.' },
  appLevel: { operation: 'Set Windows app volume', audit: 'Apply approved Windows app volume',
    changed: 'The app audio sessions or levels changed. Read the mixer again.' },
  route: { operation: 'Select Windows playback device', audit: 'Apply approved Windows playback route',
    changed: 'The playback device or current routing changed. Read the playback list again.' },
};
const id = (value) => ({ type: 'string', pattern: value.source });
const volume = { type: 'integer', minimum: 0, maximum: 100 };

const audioActionInput = { type: 'object', additionalProperties: false, required: ['command'], properties: {
  command: { enum: ['request', 'status', 'cancel'] }, target: id(TARGET), before: volume, level: volume,
  idempotencyKey: id(KEY), request: id(REQUEST),
} };
const audioMuteInput = { ...audioActionInput, properties: {
  command: audioActionInput.properties.command, target: id(TARGET), before: { type: 'boolean' }, muted: { type: 'boolean' },
  idempotencyKey: id(KEY), request: id(REQUEST),
} };
const audioActionOutput = { type: 'object', additionalProperties: false, required: ['request', 'status', 'updatedAt'], properties: {
  request: id(REQUEST), status: { enum: STATES }, updatedAt: { type: 'integer', minimum: 0 },
} };

function actionParams(args, property, unavailable) {
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    const { command, request, target, before, [property]: value, idempotencyKey } = args;
    if (['status', 'cancel'].includes(command) && Object.keys(args).length === 2 && matches(request, REQUEST)) return { command, request };
    const fields = ['command', 'target', 'before', property, 'idempotencyKey'];
    const { valid } = changes[property];
    if (command === 'request' && Object.keys(args).length === fields.length && fields.every((field) => Object.hasOwn(args, field))
        && matches(target, TARGET) && matches(idempotencyKey, KEY) && valid(before) && valid(value)) {
      return { command, target, before, [property]: value, idempotencyKey };
    }
  }
  throw new SnapshotRequestError(unavailable);
}
const audioActionParams = (args) => actionParams(args, 'level', 'Choose a Windows audio alias, current level, requested level, and request key.');
const audioMuteParams = (args) => actionParams(args, 'muted', 'Choose a Windows audio alias, current mute state, requested mute state, and request key.');

const response = ({ request, status, updatedAt }) => ({ request, status, updatedAt });

/**
 * @typedef {object} AgentAudioActionsOptions
 * @property {() => any} read
 * @property {(...args: any[]) => any} write
 * @property {(owner: string, kind: string, id: string) => string} alias
 * @property {((request: any) => Promise<boolean>) & { isOpen?: () => boolean }} approve
 * @property {{ run: (entry: any, task: () => Promise<any>) => Promise<any> }} history
 * @property {(endpoint: any) => any} canReview
 * @property {string} [property]
 * @property {() => number} [now]
 * @property {number} [timeout]
 * @property {any} [confirmation]
 */

class AgentAudioActions {
  /** @param {AgentAudioActionsOptions} options */
  constructor({ read, write, alias, approve, history, canReview, property = 'level', now = Date.now, timeout = CONFIRMATION_MS, confirmation }) {
    this.read = read;
    this.write = write;
    this.alias = alias;
    this.approve = approve;
    this.history = history;
    this.canReview = canReview;
    this.now = now;
    this.timeout = timeout;
    this.confirmation = confirmation;
    this.property = property;
    this.changeSpec = changes[property];
    this.requests = new Map();
  }

  endpoint(snapshot, owner, target) {
    const isOutput = target.startsWith('output-');
    const kind = isOutput ? 'output' : 'input';
    const inputs = Array.isArray(snapshot?.inputs) ? snapshot.inputs : [];
    const found = (isOutput ? [snapshot?.output] : inputs)
      .find((row) => typeof row?.id === 'string' && row.id.length > 0 && row.id.length <= 512 && this.alias(owner, kind, row.id) === target);
    if (!found || !this.changeSpec.valid(found[this.property])) return undefined;
    const label = typeof found.name === 'string' && found.name.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 100);
    return { device: isOutput ? 'output' : 'microphone', id: found.id, value: found[this.property],
      label: label || (isOutput ? 'Default speakers' : 'Selected microphone') };
  }

  fresh() {
    try { return this.read(); } catch { return null; }
  }

  reviewDetails(endpoint, desired) {
    const { field, show } = this.changeSpec;
    return [{ field, value: { current: show(endpoint.value), requested: show(desired) } }];
  }

  confirmed(endpoint, desired) { return endpoint.value === desired; }

  sameTarget(endpoint, reviewed) { return endpoint?.id === reviewed.id; }

  change(client, params, authorized) {
    if (!authorized()) throw new SnapshotRequestError('The Windows audio grant changed.');
    for (const [id, entry] of this.requests) {
      if (!OPEN.has(entry.status) && this.now() - entry.updatedAt >= RETENTION_MS) this.requests.delete(id);
    }
    if (params.command !== 'request') {
      const entry = this.requests.get(params.request);
      if (!entry || entry.owner !== client.id) throw new SnapshotRequestError('That audio review request is unavailable.');
      if (params.command === 'cancel') {
        if (entry.status === 'awaiting_confirmation') this.finish(entry, 'cancelled');
        else if (entry.status === 'applying') this.update(entry, 'cancel_requested');
      }
      return response(entry);
    }
    const { idempotencyKey, target, before, [this.property]: desired } = params;
    const signature = JSON.stringify([target, before, desired]);
    const previous = [...this.requests.values()].find(({ owner, key }) => owner === client.id && key === idempotencyKey);
    if (previous) {
      if (previous.signature !== signature) throw new SnapshotRequestError('Use a different request key for a new audio change.');
      return response(previous);
    }
    if (this.pending || this.approve.isOpen?.() || this.requests.size >= MAX_REQUESTS) {
      throw new SnapshotRequestError('Windows audio review is unavailable on the deck.');
    }
    const endpoint = this.endpoint(this.fresh(), client.id, target);
    if (!endpoint || endpoint.value !== before) throw new SnapshotRequestError(this.changeSpec.changed);
    const surface = this.canReview(endpoint);
    if (!surface) throw new SnapshotRequestError('Windows audio review is unavailable on the deck.');
    const entry = { request: randomBytes(12).toString('hex'), owner: client.id, key: idempotencyKey, signature,
      status: 'awaiting_confirmation', updatedAt: this.now(), endpoint, target, desired, authorized, surface, controller: new AbortController() };
    this.requests.set(entry.request, entry);
    this.pending = entry;
    entry.timer = setTimeout(() => this.finish(entry, 'expired'), this.timeout).unref();
    void this.review(entry).catch(() => this.finish(entry, 'failed'));
    return response(entry);
  }

  update(entry, status) { Object.assign(entry, { status, updatedAt: this.now() }); }

  finish(entry, status) {
    if (!OPEN.has(entry.status)) return;
    const { target } = entry;
    clearTimeout(entry.timer);
    this.update(entry, status);
    entry.controller.abort();
    Object.assign(entry, { endpoint: undefined, target: undefined, desired: undefined, authorized: undefined, surface: undefined });
    if (this.pending === entry) this.pending = null;
    recordAgentReview(this.history, entry, this.changeSpec.audit, target);
  }

  checkPending(snapshot) {
    const entry = this.pending;
    if (entry?.status !== 'awaiting_confirmation') return;
    if (this.canReview(entry.endpoint) !== entry.surface || !entry.authorized()) return this.finish(entry, 'cancelled');
    const current = this.endpoint(snapshot ?? this.fresh(), entry.owner, entry.target);
    if (!current || current.id !== entry.endpoint.id || current.value !== entry.endpoint.value || current.label !== entry.endpoint.label
        || current.context !== entry.endpoint.context) {
      this.finish(entry, 'stale');
    }
  }

  async review(entry) {
    const { endpoint, target, desired, owner, authorized } = entry;
    const { operation, changed } = this.changeSpec;
    const caller = owner.slice(0, 8);
    const accepted = await this.approve({ caller, kind: 'action', operation, target: endpoint.label,
      signal: entry.controller.signal, details: this.reviewDetails(endpoint, desired) });
    this.checkPending();
    if (entry.status !== 'awaiting_confirmation') return;
    if (!accepted) return this.finish(entry, 'declined');
    clearTimeout(entry.timer);
    this.update(entry, 'applying');
    const isCurrent = () => this.canReview(endpoint) === entry.surface && authorized() && entry.status === 'applying';
    if (!isCurrent()) return this.finish(entry, 'cancelled');
    let attempted = false;
    try {
      if (!this.confirmed(endpoint, desired)) {
        attempted = true;
        await this.write(endpoint.device, desired, endpoint.id, endpoint.value, endpoint, isCurrent);
      }
      await confirmState(() => {
        if (!isCurrent()) throw new Error('Audio review ended.');
        const observed = this.endpoint(this.fresh(), owner, target);
        if (!this.sameTarget(observed, endpoint)) throw new Error(changed);
        return this.confirmed(observed, desired);
      }, 'Windows did not confirm the requested audio state.', this.confirmation);
      this.finish(entry, isCurrent() ? 'confirmed' : attempted ? 'unconfirmed' : 'cancelled');
    } catch {
      this.finish(entry, attempted ? 'unconfirmed' : isCurrent() ? 'failed' : 'cancelled');
    }
  }
}

module.exports = { AgentAudioActions, audioActionInput, audioActionOutput, audioActionParams, audioMuteInput, audioMuteParams };
