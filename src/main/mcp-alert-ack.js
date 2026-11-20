// @ts-check
'use strict';

const { randomBytes } = require('node:crypto');
const { recordAgentReview } = require('./action-history');
const { SnapshotRequestError } = require('./mcp-snapshot');
const { ALERT_ALIAS, ALERT_REVISION, alertAlias, alertRevision } = require('./mcp-alert-identity');

const REQUEST = /^[a-f0-9]{24}$/;
const COMMANDS = { request: ['alert', 'revision'], status: ['request'], cancel: ['request'] };
const STATES = ['awaiting_confirmation', 'acknowledged', 'acknowledged_session', 'declined', 'cancelled', 'expired', 'stale', 'failed'];
const CAPACITY = 24;
const TIMEOUT = 60_000;
const RETENTION = 15 * 60_000;
const ID = { type: 'string', pattern: REQUEST.source };
const ALIAS = { type: 'string', pattern: ALERT_ALIAS.source };
const alertAckInput = { type: 'object', additionalProperties: false, required: ['command'], properties: {
  command: { enum: Object.keys(COMMANDS) }, alert: ALIAS, revision: { type: 'string', pattern: ALERT_REVISION.source }, request: ID,
} };
const timestamp = { type: 'integer', minimum: 0 };
const alertAckOutput = { type: 'object', additionalProperties: false, required: ['request', 'alert', 'status', 'updatedAt', 'acknowledgedAt'], properties: {
  request: ID, alert: ALIAS, status: { enum: STATES }, updatedAt: timestamp, acknowledgedAt: { anyOf: [timestamp, { type: 'null' }] },
} };

function alertAckParams(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.command !== 'string' || !Object.hasOwn(COMMANDS, input.command)) {
    throw new Error('Choose an alert acknowledgement command.');
  }
  const { command, alert, revision, request } = input;
  const fields = COMMANDS[command];
  if (Object.keys(input).length !== fields.length + 1 || !fields.every((field) => Object.hasOwn(input, field))) {
    throw new Error('Supply only the parameters required by this alert acknowledgement command.');
  }
  const matches = (value, pattern) => typeof value === 'string' && pattern.test(value);
  if (command === 'request') {
    if (!matches(alert, ALERT_ALIAS) || !matches(revision, ALERT_REVISION)) throw new Error('Choose an alert alias and revision from telemetry.');
    return { command, alert, revision };
  }
  if (!matches(request, REQUEST)) throw new Error('Choose an alert review request ID.');
  return { command, request };
}

function reviewLabel(value, fallback) {
  const label = typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim() : '';
  return label && !/[\\/:@]|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/i.test(label) ? label.slice(0, 80) : fallback;
}

const report = ({ request, alert, status, updatedAt, acknowledgedAt }) => ({ request, alert, status, updatedAt, acknowledgedAt });
const waiting = (entry) => entry?.status === 'awaiting_confirmation';

class AgentAlertAck {
  constructor({ inbox, approve, history, canReview = () => true, now = Date.now, timeout = TIMEOUT }) {
    this.inbox = inbox;
    this.approve = approve;
    this.history = history;
    this.canReview = canReview;
    this.now = now;
    this.timeout = timeout;
    this.requests = new Map();
  }

  change(client, params, authorized) {
    if (!authorized()) throw new SnapshotRequestError('The alert acknowledgement grant changed.');
    for (const [request, entry] of this.requests) if (!waiting(entry) && this.now() - entry.updatedAt >= RETENTION) this.requests.delete(request);
    if (params.command !== 'request') {
      const entry = this.requests.get(params.request);
      if (!entry || entry.owner !== client.id) throw new SnapshotRequestError('The alert review request is unavailable.');
      if (params.command === 'cancel') this.finish(entry, 'cancelled');
      return report(entry);
    }
    if (!this.canReview()) throw new SnapshotRequestError('Alert approval is unavailable on the deck.');
    if (this.pending || this.approve.isOpen?.()) throw new SnapshotRequestError('Another reviewed deck request is open.');
    const target = this.find(params.alert, params.revision);
    if (!target) throw new SnapshotRequestError('The active alert changed or is unavailable. Read its current status again.');
    if (this.requests.size >= CAPACITY) this.requests.delete(this.requests.keys().next().value);
    const request = randomBytes(12).toString('hex');
    const entry = { request, alert: params.alert, revision: params.revision, target, owner: client.id, status: 'awaiting_confirmation',
      updatedAt: this.now(), acknowledgedAt: null, authorized, controller: new AbortController() };
    this.requests.set(request, entry);
    this.pending = entry;
    entry.timer = setTimeout(() => this.finish(entry, 'expired'), this.timeout).unref();
    void this.review(entry).catch(() => this.finish(entry, 'failed'));
    return report(entry);
  }

  find(alias, revision) {
    return this.inbox.snapshot().entries.find((entry) => entry.id.length <= 80 && alertAlias(entry.id) === alias && alertRevision(entry) === revision);
  }

  changed(entry) {
    return this.find(entry.alert, entry.revision) !== entry.target;
  }

  allowed(entry) {
    return entry.authorized?.() && this.canReview();
  }

  finish(entry, status, acknowledgedAt = null) {
    if (!waiting(entry)) return;
    clearTimeout(entry.timer);
    Object.assign(entry, { status, acknowledgedAt, updatedAt: this.now(), authorized: undefined, target: undefined, revision: undefined });
    if (this.pending === entry) this.pending = undefined;
    entry.controller.abort();
    recordAgentReview(this.history, entry, 'Acknowledge approved alert', entry.alert,
      status === 'acknowledged' || status === 'acknowledged_session');
  }

  checkPending(entry = this.pending) {
    if (!waiting(entry) || entry.committing) return;
    if (!this.allowed(entry)) this.finish(entry, 'cancelled');
    else if (this.changed(entry)) this.finish(entry, 'stale');
  }

  async review(entry) {
    const { target } = entry;
    const caller = entry.owner.slice(0, 8);
    const accepted = await this.approve({ caller, kind: 'action', operation: 'Acknowledge active alert',
      target: reviewLabel(target.name, target.source + ' alert'), signal: entry.controller.signal,
      details: [{ field: 'Alert', value: { reference: entry.alert, source: target.source, status: 'Active',
        openedAt: target.openedAt, occurrences: target.occurrences } }, { field: 'Effect', value: 'Mark this alert as acknowledged.' }],
    });
    this.checkPending(entry);
    if (!waiting(entry)) return;
    if (!accepted) return this.finish(entry, 'declined');
    entry.committing = true;
    const receipt = this.inbox.acknowledgeActive(target);
    if (!receipt) return this.finish(entry, 'stale');
    this.finish(entry, receipt.persisted ? 'acknowledged' : 'acknowledged_session', receipt.acknowledgedAt);
  }
}

module.exports = { AgentAlertAck, alertAckInput, alertAckOutput, alertAckParams };
