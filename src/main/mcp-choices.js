// @ts-check
'use strict';

const { randomBytes } = require('node:crypto');
const { recordAgentReview } = require('./action-history');
const { SnapshotRequestError } = require('./mcp-snapshot');

const SCOPE = 'agent-choices';
const TIMEOUT = 60_000;
const CAPACITY = 24;
const ID = /^[a-f0-9]{24}$/;
const CHOICE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/;
const STATUSES = ['awaiting_confirmation', 'answered', 'declined', 'cancelled', 'expired', 'failed'];
const string = (maxLength) => ({ type: 'string', minLength: 1, maxLength });
const choiceId = { ...string(32), pattern: CHOICE.source };
const requestId = { type: 'string', pattern: ID.source };
const inputs = {
  question: string(220), target: string(100), choices: { type: 'array', minItems: 2, maxItems: 5, items: {
    type: 'object', additionalProperties: false, required: ['id', 'label', 'effect'],
    properties: { id: choiceId, label: string(60), effect: string(180) },
  } },
};
const choiceInput = {
  type: 'object', additionalProperties: false, required: ['command'],
  properties: { command: { enum: ['request', 'status', 'cancel'] }, ...inputs, request: requestId },
  if: { properties: { command: { const: 'request' } } },
  then: { required: Object.keys(inputs), not: { required: ['request'] } },
  else: { required: ['request'], maxProperties: 2 },
};
const choiceOutput = {
  type: 'object', additionalProperties: false, required: ['request', 'status', 'expiresAt'],
  properties: { request: requestId, status: { enum: STATUSES }, choice: choiceId, expiresAt: { type: 'integer' } },
};

function choiceParams(value) {
  const invalid = () => new SnapshotRequestError('Choose a question, target and two to five distinct options with their effects.');
  const record = (item) => item && typeof item === 'object' && !Array.isArray(item);
  const bounded = (item, max) => {
    if (typeof item !== 'string' || !item.trim() || item.length > max || /[\p{Cc}\p{Cf}]/u.test(item)) throw invalid();
    return item.trim();
  };
  if (!record(value)) throw invalid();
  const { command, request, question, choices, target } = value;
  if (['status', 'cancel'].includes(command) && Object.keys(value).length === 2 && typeof request === 'string' && ID.test(request)) {
    return { command, request };
  }
  if (command !== 'request' || Object.keys(value).length !== 4 || !Array.isArray(choices) || choices.length < 2 || choices.length > 5) {
    throw invalid();
  }
  const options = choices.map((item) => {
    if (!record(item) || Object.keys(item).length !== 3 || typeof item.id !== 'string' || !CHOICE.test(item.id)) throw invalid();
    return { id: item.id, label: bounded(item.label, 60), effect: bounded(item.effect, 180) };
  });
  if (new Set(options.map(({ id }) => id)).size !== options.length
      || new Set(options.map(({ label }) => label.toLowerCase())).size !== options.length) throw invalid();
  return { command, question: bounded(question, 220), target: bounded(target, 100), choices: options };
}

const report = ({ request, status, choice = undefined, expiresAt }) => ({ request, status, expiresAt, ...(choice ? { choice } : {}) });

class AgentChoices {
  constructor({ approve, canReview, history, now = Date.now, timeout = TIMEOUT }) {
    this.approve = approve;
    this.canReview = canReview;
    this.history = history;
    this.now = now;
    this.timeout = timeout;
    this.requests = new Map();
  }

  change(params, client, authorized) {
    if (!authorized()) throw new SnapshotRequestError('The choice grant changed.');
    this.checkPending();
    if (params.command !== 'request') {
      const entry = this.requests.get(params.request);
      if (!entry || entry.owner !== client.id) throw new SnapshotRequestError('The choice request is unavailable.');
      if (params.command === 'cancel') this.finish(entry, 'cancelled');
      return report(entry);
    }
    if (this.pending || this.approve.isOpen?.() || !this.canReview()) {
      throw new SnapshotRequestError('The Lastra deck cannot display a choice right now.');
    }
    const request = randomBytes(12).toString('hex');
    const entry = { request, owner: client.id, authorized, status: 'awaiting_confirmation', expiresAt: this.now() + this.timeout,
      controller: new AbortController() };
    this.requests.set(request, entry);
    while (this.requests.size > CAPACITY) this.requests.delete(this.requests.keys().next().value);
    this.pending = entry;
    entry.timer = setTimeout(() => this.finish(entry, 'expired'), this.timeout).unref();
    void this.review(entry, params).catch(() => this.finish(entry, 'failed'));
    return report(entry);
  }

  finish(entry, status, choice) {
    if (entry.status !== 'awaiting_confirmation') return;
    clearTimeout(entry.timer);
    Object.assign(entry, { status, choice, authorized: undefined });
    entry.controller.abort();
    this.pending = null;
    recordAgentReview(this.history, { owner: entry.owner, status, updatedAt: this.now() }, 'Review agent choice', 'Lastra deck', status === 'answered');
  }

  checkPending() {
    const entry = this.pending;
    if (entry && (!entry.authorized() || !this.canReview())) this.finish(entry, 'cancelled');
  }

  async review(entry, { target, question, choices }) {
    const selected = await this.approve({ kind: 'choice', caller: entry.owner.slice(0, 8), target, question, choices,
      operation: 'Agent decision request', signal: entry.controller.signal });
    this.checkPending();
    if (entry.status !== 'awaiting_confirmation') return;
    const match = choices.find(({ id }) => id === selected?.choice);
    this.finish(entry, match ? 'answered' : 'declined', match?.id);
  }
}

module.exports = { AgentChoices, SCOPE, choiceInput, choiceOutput, choiceParams };
