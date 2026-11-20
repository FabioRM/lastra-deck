// @ts-check
'use strict';

const { createHash, randomBytes } = require('node:crypto');
const { recordAgentReview } = require('./action-history');
const { ACTIVITIES, knownActivity } = require('./activity-profiles');
const { DraftRequestError } = require('./mcp-drafts');

const REQUEST = /^[a-f0-9]{24}$/;
const REVISION = /^[a-f0-9]{64}$/;
const FIELDS = Object.freeze({ inspect: [], switch: ['activity', 'revision'], status: ['request'], cancel: ['request'] });
const STATES = ['awaiting_confirmation', 'switched', 'unconfirmed', 'conflict', 'cancelled', 'declined', 'expired', 'failed'];
const TIMEOUT = 60_000;
const text = { type: 'string' };
const activityId = { enum: Object.keys(ACTIVITIES) };
const revisionId = { ...text, pattern: REVISION.source };
const requestId = { ...text, pattern: REQUEST.source };

const activitySwitchInput = { type: 'object', additionalProperties: false, required: ['command'], properties: {
  command: { enum: Object.keys(FIELDS) }, activity: activityId, revision: revisionId, request: requestId,
} };
const activitySwitchOutput = { type: 'object', additionalProperties: false, properties: {
  request: requestId, status: { enum: STATES }, source: activityId, target: activityId, active: activityId, saved: { type: 'boolean' },
  updatedAt: { type: 'integer' }, choices: { type: 'array', items: { type: 'object', required: ['id', 'label', 'revision', 'stock'],
    properties: { id: activityId, label: text, revision: revisionId, stock: { type: 'boolean' } } } },
} };

function activitySwitchParams(value) {
  const command = value?.command;
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof command !== 'string' || !Object.hasOwn(FIELDS, command)) {
    throw new DraftRequestError('Choose an activity profile command.');
  }
  const required = FIELDS[command];
  if (Object.keys(value).some((key) => key !== 'command' && !required.includes(key)) || required.some((key) => !Object.hasOwn(value, key))) {
    throw new DraftRequestError('Supply the fields for the selected activity profile command.');
  }
  if (command === 'switch' && (!knownActivity(value.activity) || typeof value.revision !== 'string' || !REVISION.test(value.revision))) {
    throw new DraftRequestError('Choose an available activity and its inspected revision.');
  }
  if (required.includes('request') && (typeof value.request !== 'string' || !REQUEST.test(value.request))) {
    throw new DraftRequestError('Choose the activity switch request ID.');
  }
  return value;
}

/** @param {{ request: string, status: string, source?: string, target?: string, updatedAt: number, active?: any, saved?: any }} entry */
function report({ request, status, source, target, updatedAt, active, saved }) {
  return { request, status, source, target, updatedAt, ...(active ? { active, saved } : {}) };
}

class AgentActivitySwitch {
  constructor({ activities, canReview, approve, switchTo, history, now = Date.now, timeout = TIMEOUT }) {
    this.activities = activities;
    this.canReview = canReview;
    this.approve = approve;
    this.switchTo = switchTo;
    this.history = history;
    this.now = now;
    this.timeout = timeout;
    this.requests = new Map();
  }

  source() {
    const { id, store } = this.activities.current ?? {};
    const value = this.activities.activationTarget(id);
    return value && !value.stock && value.version === store.loadedVersion()
      ? { id, version: value.version, generation: this.activities.revision } : null;
  }

  plan(source, id) {
    if (!source || source.id === id) return null;
    const destination = this.activities.activationTarget(id);
    if (!destination) return null;
    const revision = createHash('sha256').update(JSON.stringify([source, id, destination])).digest('hex');
    return { id, label: ACTIVITIES[id], revision, ...destination };
  }

  change(client, params, authorized) {
    if (!authorized()) throw new DraftRequestError('The activity switch grant changed.');
    if (params.command === 'status' || params.command === 'cancel') {
      const entry = this.requests.get(params.request);
      if (!entry || entry.owner !== client.id) throw new DraftRequestError('The activity switch request is unavailable.');
      if (params.command === 'cancel') this.finish(entry, 'cancelled');
      return report(entry);
    }
    const source = this.source();
    if (params.command === 'inspect') {
      const choices = Object.keys(ACTIVITIES).flatMap((id) => {
        try {
          const plan = this.plan(source, id);
          return plan ? [{ id, label: plan.label, revision: plan.revision, stock: plan.stock }] : [];
        } catch { return []; }
      });
      return { active: this.activities.current.id, choices };
    }
    const ownerWindow = this.canReview();
    if (!ownerWindow) throw new DraftRequestError('Show the deck and turn off view-only mode to request an activity switch.');
    if (this.pending || this.approve.isOpen?.()) throw new DraftRequestError('Another approval is already open on the deck.');
    const plan = this.plan(source, params.activity);
    if (!plan || plan.revision !== params.revision) throw new DraftRequestError('The activity or profile changed. Inspect the current activity again.');
    const entry = {
      request: randomBytes(12).toString('hex'), owner: client.id, status: 'awaiting_confirmation', source: source.id, target: plan.id,
      updatedAt: this.now(), controller: new AbortController(), ownerWindow, authorized, plan,
    };
    this.requests.set(entry.request, entry);
    while (this.requests.size > 24) this.requests.delete(this.requests.keys().next().value);
    this.pending = entry;
    entry.timer = setTimeout(() => this.finish(entry, 'expired'), this.timeout).unref();
    void this.review(entry).catch(() => this.finish(entry, 'failed'));
    return report(entry);
  }

  finish(entry, status, result = {}) {
    if (this.pending !== entry) return;
    clearTimeout(entry.timer);
    this.pending = null;
    entry.controller.abort();
    Object.assign(entry, result, { status, updatedAt: this.now(), authorized: undefined, ownerWindow: undefined, plan: undefined });
    recordAgentReview(this.history, { ...entry, activity: entry.source }, 'Switch approved activity', ACTIVITIES[entry.target], status === 'switched');
  }

  interrupt() {
    if (this.pending && !this.pending.switching) this.finish(this.pending, 'cancelled');
  }

  checkPending() {
    const entry = this.pending;
    if (!entry || entry.switching) return false;
    if (!entry.authorized() || this.canReview() !== entry.ownerWindow) {
      this.finish(entry, 'cancelled');
      return false;
    }
    try {
      if (this.plan(this.source(), entry.target)?.revision === entry.plan.revision) return true;
    } catch {
      // Treat an unreadable profile as a changed target.
    }
    this.finish(entry, 'conflict');
    return false;
  }

  async review(entry) {
    const caller = entry.owner.slice(0, 8);
    const { plan } = entry;
    const accepted = await this.approve({ caller, kind: 'action', operation: 'Switch activity profile', target: plan.label,
      details: [
        { field: 'Current activity', value: ACTIVITIES[entry.source] },
        { field: 'New activity', value: plan.label },
        { field: 'Profile', value: plan.stock ? 'Create the default activity profile' : 'Load the saved activity profile' },
        { field: 'Effect', value: 'Restore its Deck Keys, persistent bar, and page selection' },
      ], signal: entry.controller.signal });
    if (this.pending !== entry) return;
    if (!accepted) return this.finish(entry, 'declined');
    if (!this.checkPending()) return;
    entry.switching = true;
    const { active, saved } = this.switchTo(plan.id);
    const readback = this.activities.activationTarget(plan.id);
    const ok = active === plan.id && saved && readback?.version === plan.version && !readback.stock
      && this.activities.current.store.loadedVersion() === plan.version;
    this.finish(entry, ok ? 'switched' : 'unconfirmed', { active, saved });
  }
}

module.exports = { AgentActivitySwitch, activitySwitchInput, activitySwitchOutput, activitySwitchParams };
