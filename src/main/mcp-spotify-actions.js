// @ts-check
'use strict';

const { randomBytes } = require('node:crypto');
const { setTimeout: wait } = require('node:timers/promises');
const { recordAgentReview } = require('./action-history');
const { SnapshotRequestError } = require('./mcp-snapshot');
const { SPOTIFY_REVISION } = require('./mcp-media');
const { sameSpotifyPlayback } = require('./spotify-account');

const ID = /^[a-f0-9]{24}$/;
const KEY = /^[a-zA-Z0-9_-]{8,64}$/;
const ACTIONS = ['play', 'pause'];
const STATES = ['awaiting_confirmation', 'applying', 'cancel_requested', 'confirmed', 'unconfirmed', 'stale', 'declined',
  'cancelled', 'expired', 'failed'];
const OPEN = new Set(STATES.slice(0, 3));
const LIMIT = 32;
const RETENTION_MS = 15 * 60_000;
const REVIEW_MS = 60_000;
const MOVED = 'Spotify playback or its control changed. Read it again.';
const UNAVAILABLE = 'Spotify playback review is unavailable on the deck.';
const is = (value, re) => typeof value === 'string' && re.test(value);
const id = (re) => ({ type: 'string', pattern: re.source });
const text = (value) => typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, ' ')
  .replace(/(?:https?|wss?|file|spotify):\S+/gi, '[link]').trim().slice(0, 120) : '';

const spotifyActionInput = { type: 'object', additionalProperties: false, required: ['command'], properties: {
  command: { enum: ['request', 'status', 'cancel'] }, action: { enum: ACTIONS }, revision: id(SPOTIFY_REVISION),
  idempotencyKey: id(KEY), request: id(ID),
} };
const spotifyActionOutput = { type: 'object', additionalProperties: false, required: ['request', 'status', 'updatedAt'], properties: {
  request: id(ID), status: { enum: STATES }, updatedAt: { type: 'integer', minimum: 0 },
} };

function spotifyActionParams(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const { command, action, revision, idempotencyKey, request } = value;
    if (['status', 'cancel'].includes(command) && Object.keys(value).length === 2 && is(request, ID)) return { command, request };
    if (command === 'request' && Object.keys(value).length === 4 && ['command', 'action', 'revision', 'idempotencyKey']
      .every((field) => Object.hasOwn(value, field)) && ACTIONS.includes(action) && is(revision, SPOTIFY_REVISION) && is(idempotencyKey, KEY)) {
      return { command, action, revision, idempotencyKey };
    }
  }
  throw new SnapshotRequestError('Choose play or pause and use the current Spotify playback revision.');
}

const response = ({ request, status, updatedAt }) => ({ request, status, updatedAt });

class AgentSpotifyActions {
  constructor({ player, media, approve, history, canReview, now = Date.now, timeout = REVIEW_MS, readbackInterval = 400 }) {
    this.player = player;
    this.media = media;
    this.approve = approve;
    this.history = history;
    this.canReview = canReview;
    this.now = now;
    this.timeout = timeout;
    this.readbackInterval = readbackInterval;
    this.requests = new Map();
  }

  matches(owner, params, target) {
    const control = this.media.spotifyControl(owner, target);
    return control?.revision === params.revision && control.capabilities[params.action];
  }

  async change(client, params, authorized) {
    if (!authorized()) throw new SnapshotRequestError('The Spotify control grant changed.');
    this.checkPending();
    for (const [key, entry] of this.requests) {
      if (!OPEN.has(entry.status) && this.now() - entry.updatedAt >= RETENTION_MS) this.requests.delete(key);
    }
    if (params.command !== 'request') {
      const entry = this.requests.get(params.request);
      if (!entry || entry.owner !== client.id) throw new SnapshotRequestError('That Spotify review is unavailable.');
      if (params.command === 'cancel') this.cancel(entry);
      return response(entry);
    }
    const signature = JSON.stringify([params.action, params.revision]);
    const duplicate = [...this.requests.values()].find(({ owner, key }) => owner === client.id && key === params.idempotencyKey);
    if (duplicate) {
      if (duplicate.signature !== signature) throw new SnapshotRequestError('Use a different request key for a new Spotify command.');
      return response(duplicate);
    }
    if (this.preparing || this.pending || !this.canReview() || this.approve.isOpen?.() || this.requests.size >= LIMIT) {
      throw new SnapshotRequestError(UNAVAILABLE);
    }
    const target = this.player.cachedControlTarget();
    const lease = this.matches(client.id, params, target) && this.player.holdPlaybackControl(target);
    if (!lease) throw new SnapshotRequestError(MOVED);
    const controller = new AbortController();
    this.preparing = { authorized, controller };
    try {
      const current = await lease.read(controller.signal);
      if (!authorized() || !this.canReview() || this.approve.isOpen?.() || controller.signal.aborted) throw new SnapshotRequestError(UNAVAILABLE);
      const control = current.state === 'ready' && this.media.spotifyControl(client.id, current.target);
      if (!control || control.revision !== params.revision || !control.capabilities[params.action]) throw new SnapshotRequestError(MOVED);
      const entry = { request: randomBytes(12).toString('hex'), owner: client.id, key: params.idempotencyKey, signature,
        action: params.action, params, target: current.target, deviceAlias: control.device, authorized, lease, controller,
        status: 'awaiting_confirmation', updatedAt: this.now() };
      this.pending = entry;
      this.requests.set(entry.request, entry);
      entry.timer = setTimeout(() => this.finish(entry, 'expired'), this.timeout).unref();
      void this.review(entry).catch(() => this.finish(entry, 'failed'));
      return response(entry);
    } catch (error) {
      controller.abort();
      lease.release();
      throw error;
    } finally { this.preparing = null; }
  }

  update(entry, status) { Object.assign(entry, { status, updatedAt: this.now() }); }

  finish(entry, status) {
    if (!OPEN.has(entry.status)) return;
    const { action, deviceAlias } = entry;
    clearTimeout(entry.timer);
    this.update(entry, status);
    entry.controller.abort();
    entry.lease.release();
    Object.assign(entry, { action: undefined, controller: undefined, lease: undefined, target: undefined, deviceAlias: undefined,
      authorized: undefined, params: undefined });
    if (this.pending === entry) this.pending = null;
    recordAgentReview(this.history, entry, action === 'play' ? 'Resume approved Spotify playback' : 'Pause approved Spotify playback', deviceAlias);
  }

  cancel(entry) {
    if (entry.status === 'awaiting_confirmation') this.finish(entry, 'cancelled');
    else if (entry.status === 'applying') {
      this.update(entry, 'cancel_requested');
      entry.controller.abort();
    }
  }

  checkPending() {
    if (this.preparing && (!this.preparing.authorized() || !this.canReview())) this.preparing.controller.abort();
    if (this.pending && (!this.pending.authorized() || !this.canReview())) this.cancel(this.pending);
  }

  interrupt() {
    this.preparing?.controller.abort();
    if (this.pending) this.cancel(this.pending);
  }

  async readback(lease, signal, valid, target, desired) {
    for (let attempt = 0; attempt < 3 && valid(); attempt++) {
      if (attempt !== 0) await wait(this.readbackInterval, undefined, { signal });
      if (!valid()) return false;
      const result = await lease.read(signal);
      if (!valid() || result.state === 'restricted') return false;
      if (result.state !== 'ready') continue;
      if (!sameSpotifyPlayback(target, result.target) || result.target.stamp < target.stamp) return false;
      if (result.target.playing === desired) return true;
    }
    return false;
  }

  async review(entry) {
    const { owner, action, params, target, authorized, lease, controller } = entry;
    const caller = owner.slice(0, 8);
    const desired = action === 'play';
    const accepted = await this.approve({ caller, kind: 'action', operation: desired ? 'Resume Spotify playback' : 'Pause Spotify playback',
      target: text(target.deviceName) || 'Spotify Connect device', signal: controller.signal,
      details: [{ field: 'Playback', value: { item: text(target.itemName), current: target.playing ? 'Playing' : 'Paused',
        requested: desired ? 'Playing' : 'Paused' } }] });
    this.checkPending();
    if (entry.status !== 'awaiting_confirmation') return;
    if (!accepted) return this.finish(entry, 'declined');
    const observed = await lease.read(controller.signal);
    this.checkPending();
    if (entry.status !== 'awaiting_confirmation') return;
    if (observed.state !== 'ready' || !this.matches(owner, params, observed.target)
        || target.deviceName !== observed.target.deviceName || target.itemName !== observed.target.itemName) return this.finish(entry, 'stale');
    clearTimeout(entry.timer);
    this.update(entry, 'applying');
    const valid = () => entry.status === 'applying' && authorized() && this.canReview();
    if (!valid()) return this.finish(entry, 'cancelled');
    try {
      const sent = await lease.apply(action, observed.target, valid, controller.signal);
      if (sent === 'stale' || sent === 'restricted') {
        return this.finish(entry, sent === 'restricted' ? 'failed' : valid() ? 'stale' : 'cancelled');
      }
      const confirmed = sent === 'ready' && await this.readback(lease, controller.signal, valid, target, desired) && valid();
      this.finish(entry, confirmed ? 'confirmed' : 'unconfirmed');
    } catch {
      this.finish(entry, 'unconfirmed');
    }
  }
}

module.exports = { AgentSpotifyActions, spotifyActionInput, spotifyActionOutput, spotifyActionParams };
