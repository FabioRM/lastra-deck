// @ts-check
'use strict';

const { randomBytes } = require('node:crypto');
const { stepResults, STEP_LIMIT, recordAgentReview } = require('./action-history');

const COMMANDS = { run: ['id', 'page', 'gesture', 'revision', 'idempotencyKey'], status: ['request'], cancel: ['request'] };
const PAGE = /^(?:[a-zA-Z0-9_-]{1,40}|auto:[a-f0-9]{20})$/;
const KEY = /^(?:bar:)?[a-zA-Z0-9_-]{1,40}$/;
const DEDUPLICATION_KEY = /^[a-zA-Z0-9_-]{8,64}$/;
const REQUEST = /^[a-f0-9]{24}$/;
const GESTURES = ['tap', 'hold', 'double', 'confirm'];
const STATES = ['awaiting_confirmation', 'running', 'cancel_requested', 'confirmed', 'unconfirmed',
  'declined', 'unavailable', 'failed', 'cancelled', 'expired'];
const UNCERTAIN_EFFECTS = new Set(['hotkey', 'text', 'launch', 'open', 'media']);
const HISTORY_TTL = 30 * 60_000;
const MAX_REQUESTS = 96;
const MAX_ACTIVE = 4;
const REVIEW_TIMEOUT = 60_000;
const REVIEW_FIELDS = {
  launch: ['target', 'args', 'cwd', 'reuseWindow'], open: ['target'], workspace: ['workspace'],
  hotkey: ['keys', 'targetApps'], text: ['text', 'targetApps'], media: ['key'], audio: ['device'],
  'obs-scene': ['scene', 'bus'], 'spotify-playback': [], delay: ['ms'], 'wait-for': ['condition', 'expected', 'timeoutMs'],
  if: ['condition', 'expected'], sequence: [], repeat: ['count', 'condition', 'expected', 'timeoutMs'], choose: ['prompt', 'timeoutMs'],
  random: ['avoidRepeat'], timer: ['id', 'label', 'kind', 'durationMs', 'command'],
  sound: ['id', 'file', 'volume', 'output', 'again', 'command'],
};

const actionInput = {
  type: 'object', additionalProperties: false, required: ['command'],
  properties: {
    command: { enum: Object.keys(COMMANDS) }, id: { type: 'string', pattern: KEY.source },
    page: { type: 'string', pattern: PAGE.source }, gesture: { enum: GESTURES }, revision: { type: 'integer', minimum: 0 },
    idempotencyKey: { type: 'string', pattern: DEDUPLICATION_KEY.source }, request: { type: 'string', pattern: REQUEST.source },
  },
};
const actionOutput = {
  type: 'object', required: ['request', 'status'],
  properties: {
    request: { type: 'string' }, status: { enum: STATES }, message: { type: 'string' }, updatedAt: { type: 'integer' },
    steps: { type: 'array', items: { type: 'object', required: ['path', 'type', 'status', 'attempts'], properties: {
      path: { type: 'array', items: { type: ['integer', 'string'] } }, type: { type: 'string' },
      status: { type: 'string' }, attempts: { type: 'integer' },
    } } }, stepCount: { type: 'integer' },
    progress: { type: 'object', required: ['path', 'type'], properties: {
      path: { type: 'array', items: { type: ['integer', 'string'] } }, type: { type: 'string' },
      step: { type: 'integer' }, total: { type: 'integer' }, iteration: { type: 'integer' }, iterations: { type: 'integer' },
      attempt: { type: 'integer' }, attempts: { type: 'integer' },
    } },
  },
};

class AgentActionError extends Error {}

function actionParams(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.command !== 'string'
      || !Object.hasOwn(COMMANDS, value.command)) throw new AgentActionError('Choose an action request command.');
  const { command, id, page, gesture, revision, request, idempotencyKey } = value;
  const fields = COMMANDS[command];
  if (Object.keys(value).some((key) => key !== 'command' && !fields.includes(key))
      || fields.some((key) => !Object.hasOwn(value, key))) throw new AgentActionError('Supply the fields for the selected action command.');
  if (command !== 'run') {
    if (typeof request !== 'string' || !REQUEST.test(request)) throw new AgentActionError('Choose a registered action request ID.');
    return { command, request };
  }
  if (typeof id !== 'string' || !KEY.test(id) || typeof page !== 'string' || !PAGE.test(page) || !GESTURES.includes(gesture)
      || !Number.isSafeInteger(revision) || revision < 0 || typeof idempotencyKey !== 'string' || !DEDUPLICATION_KEY.test(idempotencyKey)) {
    throw new AgentActionError('Choose a saved key, displayed page, gesture, inspected revision, and request key.');
  }
  return { command, id, page, gesture, revision, idempotencyKey };
}

function report(entry) {
  const { request, status, message, updatedAt, progress } = entry;
  const { steps = entry.steps, stepCount = entry.stepCount } = observedSteps(entry);
  return { request, status, message, updatedAt, steps, stepCount, ...(progress ? { progress } : {}) };
}

function active(entry) {
  return ['awaiting_confirmation', 'running', 'cancel_requested'].includes(entry.status);
}

function progressSnapshot(value) {
  if (!value) return undefined;
  const { path, type } = value;
  return { path: [...path], type, ...Object.fromEntries(['step', 'total', 'iteration', 'iterations', 'attempt', 'attempts']
    .filter((key) => Number.isSafeInteger(value[key])).map((key) => [key, value[key]])) };
}

function observedSteps({ stepUpdates }) {
  return stepUpdates?.size ? { steps: [...stepUpdates.values()].slice(0, STEP_LIMIT), stepCount: stepUpdates.size } : {};
}

function actionReviewDetails(action) {
  const details = [];
  function visit(item, route = '') {
    const settings = Object.fromEntries([...(REVIEW_FIELDS[item.type] ?? []), 'onError', 'attempts']
      .filter((field) => item[field] !== undefined).map((field) => [field, item[field]]));
    details.push({ field: route ? route + ' · ' + item.type : item.type,
      value: Object.keys(settings).length ? settings : 'Run ' + item.type });
    if (item.type === 'sequence' || item.type === 'repeat') {
      item.steps.forEach((step, index) => visit(step, route ? `${route}.${index + 1}` : `Step ${index + 1}`));
    }
    if (item.type === 'if') {
      visit(item.then, route ? route + ' · Then' : 'Then');
      if (item.else) visit(item.else, route ? route + ' · Else' : 'Else');
    }
    if (item.type === 'choose') {
      item.choices.forEach(({ label, action }, index) => {
        const option = `Choice ${index + 1}`;
        const name = route ? `${route} · ${option}` : option;
        details.push({ field: name, value: label });
        visit(action, name);
      });
    }
    if (item.type === 'random') {
      item.pool.forEach((option, index) => visit(option, route ? `${route} · Option ${index + 1}` : `Option ${index + 1}`));
    }
  }
  visit(action);
  return details;
}

class AgentActions {
  constructor({ prepare, approve, history, now = Date.now, timeout = REVIEW_TIMEOUT }) {
    this.prepare = prepare;
    this.approve = approve;
    this.history = history;
    this.now = now;
    this.timeout = timeout;
    this.requests = new Map();
  }

  change(client, parameters, authorized) {
    if (!authorized()) throw new AgentActionError('The action grant or activity changed.');
    for (const [request, entry] of this.requests) {
      if (!active(entry) && this.now() - entry.updatedAt >= HISTORY_TTL) this.requests.delete(request);
    }
    if (parameters.command !== 'run') {
      const entry = this.requests.get(parameters.request);
      if (!entry || entry.owner !== client.id) throw new AgentActionError('The action request is unavailable.');
      if (parameters.command === 'cancel') this.cancel(entry, 'The client cancelled the action.');
      return report(entry);
    }

    const { id, page, gesture, revision, idempotencyKey } = parameters;
    const requestTarget = JSON.stringify([id, page, gesture, revision]);
    const known = [...this.requests.values()].find((entry) => entry.owner === client.id && entry.key === idempotencyKey);
    if (known) {
      if (known.requestTarget !== requestTarget) throw new AgentActionError('Use a new request key for a different target or revision.');
      return report(known);
    }
    if (this.approve.isOpen?.()) throw new AgentActionError('Another approval is open on the deck.');
    if (this.requests.size >= MAX_REQUESTS || [...this.requests.values()].filter(active).length >= MAX_ACTIVE) {
      throw new AgentActionError('The registered action queue is full. Wait before requesting another action.');
    }
    const plan = this.prepare(parameters);
    const entry = { request: randomBytes(12).toString('hex'), owner: client.id, key: idempotencyKey, requestTarget,
      status: 'awaiting_confirmation', updatedAt: this.now(), controller: new AbortController(), authorized, plan };
    this.requests.set(entry.request, entry);
    entry.timer = setTimeout(() => this.finish(entry, 'expired', 'The action approval expired.'), this.timeout).unref();
    void this.review(entry, client).catch(() => {
      if (entry.status === 'cancel_requested') this.finish(entry, 'cancelled', 'The action stopped. Review any steps that already completed.');
      else this.finish(entry, 'failed', 'Lastra could not complete the action request.');
    });
    return report(entry);
  }

  finish(entry, status, message, results = {}) {
    if (!active(entry)) return;
    const { activity, auditTarget } = entry.plan;
    clearTimeout(entry.timer);
    const observed = observedSteps(entry);
    const { steps = observed.steps, stepCount = observed.stepCount } = stepResults(results);
    Object.assign(entry, { status, message, steps, stepCount, progress: undefined, stepUpdates: undefined, updatedAt: this.now() });
    entry.controller.abort();
    entry.authorized = undefined;
    entry.plan = undefined;
    recordAgentReview(this.history, { ...entry, activity }, 'Run approved saved key', auditTarget,
      status === 'confirmed' || status === 'unconfirmed');
  }

  cancel(entry, message) {
    if (entry.status === 'awaiting_confirmation') this.finish(entry, 'cancelled', message);
    else if (entry.status === 'running') {
      entry.status = 'cancel_requested';
      entry.message = message;
      entry.updatedAt = this.now();
      entry.controller.abort();
    }
  }

  checkPending() {
    for (const entry of this.requests.values()) {
      if (entry.status !== 'awaiting_confirmation' && entry.status !== 'running') continue;
      if (!entry.authorized() || !entry.plan.isCurrent()) this.cancel(entry, 'The action grant or target changed.');
    }
  }

  async review(entry, client) {
    const { plan, controller } = entry;
    const caller = client.id.slice(0, 8);
    const accepted = await this.approve({ caller, target: plan.target, operation: 'Run saved key', kind: 'action',
      details: plan.details, signal: controller.signal });
    if (entry.status !== 'awaiting_confirmation') return;
    if (!accepted) return this.finish(entry, 'declined', 'The action was declined.');
    if (!entry.authorized() || !plan.isCurrent()) return this.finish(entry, 'unavailable', 'The action grant or target changed.');
    clearTimeout(entry.timer);
    entry.status = 'running';
    entry.updatedAt = this.now();
    const allowed = () => !controller.signal.aborted && entry.authorized() && plan.isCurrent();
    entry.stepUpdates = new Map();
    const progress = {
      signal: controller.signal,
      onStepProgress: (value) => {
        if (!active(entry)) return;
        entry.progress = progressSnapshot(value);
        entry.updatedAt = this.now();
      },
      onStepResult: ({ path, type, status, attempts }) => {
        if (!active(entry)) return;
        entry.stepUpdates.set(JSON.stringify(path), { path: [...path], type, status, attempts });
        entry.updatedAt = this.now();
      },
    };
    const result = await plan.execute(allowed, progress);
    if (controller.signal.aborted) this.finish(entry, 'cancelled', 'The action stopped. Review any steps that already completed.', result);
    else if (result.ignored || result.unavailable) this.finish(entry, 'unavailable', 'The key was busy or its target changed.', result);
    else if (!result.ok) this.finish(entry, 'failed', 'A saved action step failed. Check its result on the deck.', result);
    else {
      const unconfirmed = (result.steps ?? []).some(({ type, status }) => status === 'warning' || status === 'failed'
        || (status !== 'skipped' && UNCERTAIN_EFFECTS.has(type)));
      this.finish(entry, unconfirmed ? 'unconfirmed' : 'confirmed', unconfirmed
        ? 'Lastra delivered the action. Check the result in the target.' : 'The saved action completed.', result);
    }
  }
}

module.exports = { AgentActions, AgentActionError, actionInput, actionOutput, actionParams, actionReviewDetails };
