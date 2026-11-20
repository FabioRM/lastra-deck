// @ts-check
'use strict';

const { randomBytes } = require('node:crypto');

const SCOPE = 'run-activity';
const MAX_RUNS = 12;
const MAX_PER_AGENT = 4;
const ACTIVE_MS = 2 * 60_000;
const FINISHED_MS = 10 * 60_000;
const STATES = ['running', 'waiting', 'completed', 'failed'];
const terminal = (state) => state === 'completed' || state === 'failed' || state === 'withdrawn';
const badRequest = 'Use a run ID, revision, state, and bounded status text.';
const changed = 'The run is unavailable or its revision changed.';

class RunActivityError extends Error {}

const string = (maxLength) => ({ type: 'string', minLength: 1, maxLength });
const runId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const runSchema = { ...string(64), pattern: runId.source };
const revisionSchema = { type: 'integer', minimum: 1, maximum: 1_000_000_000 };
const statesSchema = { enum: STATES };
const progressSchema = { type: 'integer', minimum: 0, maximum: 100 };
const textFields = { summary: 120, project: 70, step: 100, waitReason: 120 };
const publishFields = { state: statesSchema, progress: progressSchema,
  ...Object.fromEntries(Object.entries(textFields).map(([field, max]) => [field, string(max)])) };
const runInput = {
  type: 'object', additionalProperties: false, required: ['command', 'run', 'revision'],
  properties: { command: { enum: ['publish', 'withdraw'] }, run: runSchema, revision: revisionSchema, ...publishFields },
  if: { properties: { command: { const: 'publish' } } },
  then: { required: ['summary', 'state'], if: { properties: { state: { const: 'waiting' } } },
    then: { required: ['waitReason'] }, else: { not: { required: ['waitReason'] } } },
  else: { maxProperties: 3 },
};
const runOutput = {
  type: 'object', additionalProperties: false, required: ['run', 'revision', 'state', 'expiresAt'],
  properties: { run: runSchema, revision: revisionSchema, state: { enum: [...STATES, 'withdrawn'] }, expiresAt: { type: 'integer' } },
};

function runParams(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !['publish', 'withdraw'].includes(value.command)
      || typeof value.run !== 'string' || !runId.test(value.run)
      || !Number.isInteger(value.revision) || value.revision < 1 || value.revision > revisionSchema.maximum) {
    throw new RunActivityError(badRequest);
  }
  const { command, run, revision } = value;
  const fields = ['command', 'run', 'revision'];
  if (command === 'withdraw') {
    if (Object.keys(value).some((key) => !fields.includes(key))) throw new RunActivityError(badRequest);
    return { command, run, revision };
  }
  if (Object.keys(value).some((key) => !fields.includes(key) && !Object.hasOwn(publishFields, key))
      || !STATES.includes(value.state)
      || (value.progress !== undefined && (!Number.isInteger(value.progress) || value.progress < 0 || value.progress > 100))
      || (value.state === 'waiting') !== (value.waitReason !== undefined)) throw new RunActivityError(badRequest);
  const data = { state: value.state };
  for (const [field, maxLength] of Object.entries(textFields)) {
    const text = value[field];
    if (field !== 'summary' && text === undefined) continue;
    if (typeof text !== 'string' || !text.trim() || text.length > maxLength
        || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(text)) throw new RunActivityError(badRequest);
    data[field] = text.trim();
  }
  if (value.state === 'completed') data.progress = 100;
  else if (value.progress !== undefined) data.progress = value.progress;
  return { command, run, revision, data };
}

class RunActivity {
  constructor({ activity, client, available, now = Date.now }) {
    this.activity = activity;
    this.client = client;
    this.available = available;
    this.now = now;
    this.runs = new Map();
  }

  clear() { this.runs.clear(); }

  prune(now = this.now()) {
    if (!this.available()) return this.clear();
    for (const [key, run] of this.runs) {
      const owner = this.client(run.owner);
      if (run.expiresAt <= now || !owner || owner.profile !== run.activity || !owner.scopes.includes(SCOPE)) this.runs.delete(key);
    }
  }

  change({ command, run, revision, data }, owner, authorized) {
    const now = this.now();
    this.prune(now);
    if (!authorized() || !this.available() || owner.profile !== this.activity()) throw new RunActivityError('Agent activity is unavailable.');
    const key = owner.id + '/' + run;
    const past = this.runs.get(key);
    const result = (record) => ({ run, revision: record.revision, state: record.data.state, expiresAt: record.expiresAt });
    if (command === 'withdraw') {
      if (!past || past.revision !== revision) throw new RunActivityError(changed);
      if (past.data.state !== 'withdrawn') {
        past.data = { state: 'withdrawn' };
        past.expiresAt = now + FINISHED_MS;
      }
      return result(past);
    }
    if (past?.revision === revision && JSON.stringify(past.data) === JSON.stringify(data)) return result(past);
    if (past && (past.revision >= revision || terminal(past.data.state))) throw new RunActivityError(changed);
    if (!past && (this.runs.size >= MAX_RUNS || [...this.runs.values()].filter((entry) => entry.owner === owner.id).length >= MAX_PER_AGENT)) {
      throw new RunActivityError('The agent activity list is full. Update an existing run or wait for a card to expire.');
    }
    const record = { id: past?.id ?? randomBytes(12).toString('hex'), owner: owner.id, activity: owner.profile, revision, data,
      pinned: past?.pinned ?? false, updatedAt: now, expiresAt: now + (terminal(data.state) ? FINISHED_MS : ACTIVE_MS) };
    this.runs.set(key, record);
    return result(record);
  }

  snapshot() {
    this.prune(this.now());
    if (!this.available()) return { status: 'unavailable', runs: [] };
    const activity = this.activity();
    const runs = [...this.runs.values()].filter((run) => run.activity === activity && run.data.state !== 'withdrawn')
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
      .map(({ id, owner, revision, pinned, updatedAt, data }) => ({ id, agent: owner.slice(0, 8), revision, pinned, updatedAt, ...data }));
    return { status: 'ready', runs };
  }

  pin({ id, revision, pinned }) {
    this.prune(this.now());
    const run = [...this.runs.values()].find((item) => item.id === id && item.activity === this.activity());
    if (!run || run.data.state === 'withdrawn' || run.revision !== revision || typeof pinned !== 'boolean') {
      return { ok: false, message: changed };
    }
    run.pinned = pinned;
    return { ok: true };
  }

  changeFromDeck(command) {
    if (command.action !== 'pin') return { ok: false, message: 'Choose a run from Agent activity.' };
    return this.pin(command);
  }
}

module.exports = { RunActivity, RunActivityError, SCOPE, runParams, runInput, runOutput };
