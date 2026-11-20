// @ts-check
'use strict';

const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { recordAgentReview } = require('./action-history');
const { SnapshotRequestError } = require('./mcp-snapshot');
const { confirmState } = require('./confirm-state');
const { GUARDED_STATES, MAX_TIMELINE_MS } = require('./windows-media');

const SESSION = /^media-session-[a-f0-9]{24}$/;
const REQUEST = /^[a-f0-9]{24}$/;
const KEY = /^[a-zA-Z0-9_-]{8,64}$/;
const TRACK = /^[a-f0-9]{32}$/;
const ACTIONS = ['play', 'pause', 'seek', 'next', 'previous'];
const AUDIT_OPERATIONS = {
  play: 'Play approved Windows media', pause: 'Pause approved Windows media', seek: 'Seek approved Windows media',
  next: 'Skip to next approved Windows media item', previous: 'Skip to previous approved Windows media item',
};
const STATES = ['awaiting_confirmation', 'applying', 'cancel_requested', 'confirmed', 'unconfirmed', 'stale', 'declined', 'cancelled', 'expired', 'failed'];
const OPEN = new Set(STATES.slice(0, 3));
const SEEK_TOLERANCE = 2_000;
const RETENTION_MS = 15 * 60_000;
const CONFIRMATION_MS = 60_000;
const LIMIT = 32;
const moved = 'The Windows media session, item, or playback state changed. Read it again.';
const is = (value, re) => typeof value === 'string' && re.test(value);
const validTime = (value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIMELINE_MS;
const id = (re) => ({ type: 'string', pattern: re.source });
const text = (value) => typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim().slice(0, 120) : '';

const windowsActionInput = { type: 'object', additionalProperties: false, required: ['command'], properties: {
  command: { enum: ['request', 'status', 'cancel'] }, action: { enum: ACTIONS }, session: id(SESSION),
  before: { enum: GUARDED_STATES }, positionMs: { type: 'integer', minimum: 0, maximum: MAX_TIMELINE_MS },
  idempotencyKey: id(KEY), request: id(REQUEST),
} };
const windowsActionOutput = { type: 'object', additionalProperties: false, required: ['request', 'status', 'updatedAt'], properties: {
  request: id(REQUEST), status: { enum: STATES }, updatedAt: { type: 'integer', minimum: 0 },
} };

function windowsActionParams(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const { command, request, action, session, before, positionMs, idempotencyKey } = value;
    if (['status', 'cancel'].includes(command) && Object.keys(value).length === 2 && is(request, REQUEST)) return { command, request };
    const fields = ['command', 'action', 'session', 'before', 'idempotencyKey', ...(action === 'seek' ? ['positionMs'] : [])];
    if (command === 'request' && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field))
        && ACTIONS.includes(action) && is(session, SESSION) && is(idempotencyKey, KEY) && GUARDED_STATES.includes(before)
        && (action !== 'seek' || validTime(positionMs))) {
      return { command, action, session, before, idempotencyKey, ...(action === 'seek' ? { positionMs } : {}) };
    }
  }
  throw new SnapshotRequestError('Choose a Windows media session alias, playback command, and the observed playback state.');
}

const response = ({ request, status, updatedAt }) => ({ request, status, updatedAt });

function seconds(value) {
  const whole = Math.floor(value / 1000);
  return String(Math.floor(whole / 60)) + ':' + String(whole % 60).padStart(2, '0');
}

const playbackLabel = (value) => value[0].toUpperCase() + value.slice(1);

function actionPlan(params, raw, target) {
  if (!raw || raw.status !== 'ready' || raw.sessionId !== target.id || raw.playback !== params.before || !is(raw.trackId, TRACK)) return undefined;
  const { action, positionMs, before } = params;
  const command = { command: action, sessionId: target.id, before,
    ...(target.selectionId ? { selectionId: target.selectionId } : {}) };
  const label = path.win32.basename(text(raw.source)) || 'Windows media session';
  const item = text(raw.title);
  if (action === 'seek') {
    if (!validTime(raw.seekMinMs) || !validTime(raw.seekMaxMs) || raw.seekMinMs >= raw.seekMaxMs
        || positionMs < raw.seekMinMs || positionMs > raw.seekMaxMs) return undefined;
    const requested = seconds(positionMs);
    return { command: { ...command, trackId: raw.trackId, positionMs }, label, item, trackId: raw.trackId,
      operation: `Seek to ${requested}`, requested, positionMs };
  }
  if (action === 'next' || action === 'previous') {
    if ((action === 'next' ? raw.canNext : raw.canPrevious) !== true) return undefined;
    return { command: { ...command, expectedTrackId: raw.trackId }, label, item, trackId: raw.trackId, skip: true,
      operation: `Skip to ${action} Windows media item`, requested: `${playbackLabel(action)} item` };
  }
  const desired = action === 'play' ? 'playing' : 'paused';
  if (before !== desired && (action === 'play' ? raw.canPlay : raw.canPause) !== true) return undefined;
  return { command: { ...command, expectedTrackId: raw.trackId }, label, item, trackId: raw.trackId,
    operation: action === 'play' ? 'Play Windows media' : 'Pause Windows media', desired, requested: playbackLabel(desired) };
}

class AgentWindowsMediaActions {
  constructor({ player, media, approve, history, canReview, now = Date.now, timeout = CONFIRMATION_MS, confirmation = undefined }) {
    this.player = player;
    this.media = media;
    this.approve = approve;
    this.history = history;
    this.canReview = canReview;
    this.now = now;
    this.timeout = timeout;
    this.confirmation = confirmation;
    this.requests = new Map();
  }

  async change(client, params, authorized) {
    if (!authorized()) throw new SnapshotRequestError('The Windows media grant changed.');
    for (const [id, entry] of this.requests) {
      if (!OPEN.has(entry.status) && this.now() - entry.updatedAt >= RETENTION_MS) this.requests.delete(id);
    }
    if (params.command !== 'request') {
      const entry = this.requests.get(params.request);
      if (!entry || entry.owner !== client.id) throw new SnapshotRequestError('That Windows media review is unavailable.');
      if (params.command === 'cancel') {
        if (entry.status === 'awaiting_confirmation') this.finish(entry, 'cancelled');
        else if (entry.status === 'applying') this.update(entry, 'cancel_requested');
      }
      return response(entry);
    }
    const { idempotencyKey, ...shape } = params;
    const signature = JSON.stringify(shape);
    const duplicate = [...this.requests.values()].find(({ owner, key }) => owner === client.id && key === idempotencyKey);
    if (duplicate) {
      if (duplicate.signature !== signature) throw new SnapshotRequestError('Use a different request key for a new media command.');
      return response(duplicate);
    }
    if (this.preparing || this.pending || !this.canReview() || this.approve.isOpen?.() || this.requests.size >= LIMIT) {
      throw new SnapshotRequestError('Windows media review is unavailable on the deck.');
    }
    const target = this.media.resolveWindows(client.id, params.session);
    const release = target && this.player.holdForReview();
    if (!target || !release) throw new SnapshotRequestError(moved);
    this.preparing = true;
    try {
      const plan = actionPlan(params, await this.player.reviewSnapshot(target.selectionId), target);
      if (!plan) throw new SnapshotRequestError(moved);
      if (!authorized() || !this.canReview() || this.approve.isOpen?.()) throw new SnapshotRequestError('Windows media review is unavailable on the deck.');
      const entry = { request: randomBytes(12).toString('hex'), owner: client.id, key: idempotencyKey, signature,
        params, target, plan, release, authorized, controller: new AbortController(), status: 'awaiting_confirmation', updatedAt: this.now() };
      this.pending = entry;
      this.requests.set(entry.request, entry);
      entry.timer = setTimeout(() => this.finish(entry, 'expired'), this.timeout).unref();
      void this.review(entry).catch(() => this.finish(entry, 'failed'));
      return response(entry);
    } catch (error) {
      release();
      throw error;
    } finally { this.preparing = false; }
  }

  update(entry, status) { Object.assign(entry, { status, updatedAt: this.now() }); }

  finish(entry, status) {
    if (!OPEN.has(entry.status)) return;
    const { action, session } = entry.params;
    clearTimeout(entry.timer);
    this.update(entry, status);
    entry.controller.abort();
    entry.release();
    Object.assign(entry, { release: undefined, authorized: undefined, plan: undefined, target: undefined, params: undefined });
    if (this.pending === entry) this.pending = null;
    recordAgentReview(this.history, entry, AUDIT_OPERATIONS[action], session);
  }

  checkPending(entry = this.pending) {
    if (entry?.status === 'awaiting_confirmation' && (!this.canReview() || !entry.authorized())) this.finish(entry, 'cancelled');
  }

  async review(entry) {
    const { params, target, plan, authorized } = entry;
    const caller = entry.owner.slice(0, 8);
    const current = playbackLabel(params.before);
    const accepted = await this.approve({ caller, kind: 'action', operation: plan.operation, target: plan.label,
      signal: entry.controller.signal,
      details: [{ field: 'Playback', value: { ...(plan.item ? { item: plan.item } : {}), current, requested: plan.requested } }] });
    this.checkPending(entry);
    if (entry.status !== 'awaiting_confirmation') return;
    if (!accepted) return this.finish(entry, 'declined');
    const observed = await this.player.reviewSnapshot(target.selectionId);
    this.checkPending(entry);
    if (entry.status !== 'awaiting_confirmation') return;
    if (JSON.stringify(actionPlan(params, observed, target)) !== JSON.stringify(plan)) return this.finish(entry, 'stale');
    clearTimeout(entry.timer);
    this.update(entry, 'applying');
    const currentRequest = () => entry.status === 'applying' && authorized() && this.canReview();
    const atDesired = (reading) => {
      if (plan.skip) return is(reading.trackId, TRACK) && reading.trackId !== plan.trackId;
      if (plan.desired) return reading.playback === plan.desired;
      return validTime(reading.positionMs) && Math.abs(reading.positionMs - plan.positionMs) <= SEEK_TOLERANCE;
    };
    if (!currentRequest()) return this.finish(entry, 'cancelled');
    try {
      if (!atDesired(observed)) {
        const sent = await this.player.change(plan.command, currentRequest);
        if (sent.status === 'cancelled') return this.finish(entry, 'cancelled');
        if (sent.status === 'changed') return this.finish(entry, 'stale');
        if (sent.status !== 'ok') return this.finish(entry, sent.status === 'unavailable' ? 'unconfirmed' : 'failed');
      }
      await confirmState(async () => {
        if (!currentRequest()) throw new Error('Media review ended.');
        const actual = await this.player.reviewSnapshot(target.selectionId);
        if (!currentRequest() || actual.status === 'missing' || (actual.status === 'ready'
            && (actual.sessionId !== target.id || (!plan.skip && actual.trackId !== plan.trackId)))) throw new Error(moved);
        return actual.status === 'ready' && atDesired(actual);
      }, 'Windows did not confirm the media command.', this.confirmation);
      this.finish(entry, currentRequest() ? 'confirmed' : 'unconfirmed');
    } catch {
      this.finish(entry, 'unconfirmed');
    }
  }
}

module.exports = { AgentWindowsMediaActions, windowsActionInput, windowsActionOutput, windowsActionParams };
