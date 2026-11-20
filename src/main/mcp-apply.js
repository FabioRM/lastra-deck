// @ts-check
'use strict';

const { randomBytes } = require('node:crypto');
const { recordAgentReview } = require('./action-history');
const { DraftRequestError } = require('./mcp-drafts');

const ID = /^[a-f0-9]{24}$/;
const VERSION = /^[a-f0-9]{64}$/;
const TIMEOUT = 90_000;
const COMMANDS = ['compare', 'backups', 'apply', 'restore', 'status', 'cancel'];
const applyInput = {
  type: 'object', required: ['command'], additionalProperties: false, properties: {
    command: { enum: COMMANDS }, draft: { type: 'string' }, revision: { type: 'integer', minimum: 1 },
    backup: { type: 'string' }, baseVersion: { type: 'string' }, request: { type: 'string' },
  },
};
const applyOutput = {
  type: 'object', properties: {
    activity: { type: 'string' }, request: { type: 'string' }, status: { type: 'string' },
    changed: { type: 'array', items: { type: 'string' } }, changeCount: { type: 'integer' }, baseVersion: { type: 'string' },
    resultVersion: { type: 'string' }, message: { type: 'string' }, backups: { type: 'array', items: { type: 'object' } },
  },
};

function applyParams(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !COMMANDS.includes(value.command)
      || Object.keys(value).some((key) => !Object.hasOwn(applyInput.properties, key))) {
    throw new DraftRequestError('Choose a profile revision command.');
  }
  const { command, draft, revision, backup, baseVersion, request } = value;
  if (['compare', 'apply'].includes(command) &&
      (typeof draft !== 'string' || !ID.test(draft) || !Number.isSafeInteger(revision) || revision < 1)) {
    throw new DraftRequestError('Choose the draft ID and its current revision.');
  }
  if (command === 'restore' && (typeof backup !== 'string' || !VERSION.test(backup)
      || typeof baseVersion !== 'string' || !VERSION.test(baseVersion))) throw new DraftRequestError('Choose the backup and inspected version.');
  if (['status', 'cancel'].includes(command) && (typeof request !== 'string' || !ID.test(request))) {
    throw new DraftRequestError('Choose an approval request ID.');
  }
  return { command, draft, revision, backup, baseVersion, request };
}

function diffValues(before, after, route = '', rows = []) {
  if (Object.is(before, after)) return rows;
  const collections = before && after && typeof before === 'object' && typeof after === 'object' && Array.isArray(before) === Array.isArray(after);
  if (collections) {
    const names = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const name of names) diffValues(before[name], after[name], route ? route + '.' + name : name, rows);
  } else rows.push({ field: route, before, after });
  return rows;
}

// Fields that decide what a key runs, which app it targets, or which file it loads.
const EFFECT_SEGMENTS = new Set(['action', 'hold', 'double', 'macros', 'controlBindings', 'apps', 'targetApps', 'windowsApps',
  'image', 'workspaces', 'rules']);

/**
 * List changes that alter what the deck runs before cosmetic ones, so a launch or open change
 * cannot hide among hundreds of label or layout edits in the approval window. Order is otherwise kept.
 */
function prioritizeChanges(changes) {
  const effect = ({ field }) => String(field).split('.').some((segment) => EFFECT_SEGMENTS.has(segment));
  return [...changes.filter(effect), ...changes.filter((change) => !effect(change))];
}

function report(entry) {
  const { request, activity, status, changed, changeCount, baseVersion, resultVersion, message } = entry;
  return { request, activity, status, changed, changeCount, baseVersion, resultVersion, message };
}

class AgentProfileApply {
  constructor({ drafts, approve, readContext, history, timeout = TIMEOUT }) {
    this.drafts = drafts;
    this.approve = approve;
    this.readContext = readContext;
    this.history = history;
    this.timeout = timeout;
    this.requests = new Map();
  }

  plan(client, params) {
    const { activity, store, label } = this.readContext();
    const base = store.editorSnapshot();
    if (!base.profile || base.warning) throw new DraftRequestError('The saved profile needs attention in the editor.');
    if (params.command === 'backups') {
      return { activity, baseVersion: base.token, backups: store.editorBackups().versions.map(({ id, savedAt, source }) => ({ id, savedAt, source })) };
    }
    let next;
    if (params.command === 'restore') {
      if (base.token !== params.baseVersion) throw new DraftRequestError('The saved profile changed. Read the current backups again.');
      const version = store.backupVersions().find(({ id }) => id === params.backup && id !== base.token);
      if (!version) throw new DraftRequestError('The requested backup is unavailable.');
      next = version.profile;
    } else {
      const draft = this.drafts.resolve(client.id, activity, params.draft, params.revision);
      if (draft.baseToken !== base.token) throw new DraftRequestError('The saved profile changed. Fork a draft from its current revision.');
      next = draft.profile;
    }
    const normalize = ({ keys, version, ...rest }) => rest;
    const changes = diffValues(normalize(base.profile), normalize(next));
    return { activity, label, store, changes, next, baseVersion: base.token, params };
  }

  change(client, params, authorized) {
    if (params.command === 'status' || params.command === 'cancel') {
      const entry = this.requests.get(params.request);
      if (!entry || entry.owner !== client.id) throw new DraftRequestError('The approval request is unavailable.');
      if (params.command === 'cancel' && entry.status === 'awaiting_confirmation') this.finish(entry, 'cancelled', 'The client cancelled the request.');
      return report(entry);
    }
    const plan = this.plan(client, params);
    if (params.command === 'backups') return plan;
    const changed = plan.changes.slice(0, 100).map(({ field }) => field);
    const changeCount = plan.changes.length;
    if (params.command === 'compare' || !changed.length) {
      return { activity: plan.activity, status: changed.length ? 'different' : 'unchanged', changed, changeCount, baseVersion: plan.baseVersion };
    }
    if (this.pending || this.approve.isOpen?.()) throw new DraftRequestError('Another approval is already open on the deck.');
    const entry = {
      request: randomBytes(12).toString('hex'), owner: client.id, activity: plan.activity, status: 'awaiting_confirmation',
      changed, changeCount, baseVersion: plan.baseVersion, controller: new AbortController(), authorized,
      check: () => this.revalidate(client, plan), restoring: params.command === 'restore',
    };
    this.requests.set(entry.request, entry);
    while (this.requests.size > 24) this.requests.delete(this.requests.keys().next().value);
    this.pending = entry;
    entry.timer = setTimeout(() => this.finish(entry, 'expired', 'The approval timed out.'), this.timeout);
    entry.timer.unref();
    void this.review(entry, client, plan).catch(() => this.finish(entry, 'failed', 'Lastra could not finish the approval.'));
    return report(entry);
  }

  finish(entry, status, message, resultVersion) {
    if (entry.status !== 'awaiting_confirmation') return;
    clearTimeout(entry.timer);
    entry.status = status;
    entry.message = message;
    entry.resultVersion = resultVersion;
    entry.controller.abort();
    entry.authorized = undefined;
    entry.check = undefined;
    if (this.pending === entry) this.pending = null;
    recordAgentReview(this.history, { owner: entry.owner, status, updatedAt: Date.now() },
      entry.restoring ? 'Restore approved profile' : 'Apply approved profile', entry.activity, status === 'applied');
  }

  checkPending() {
    const entry = this.pending;
    if (!entry || entry.committing) return;
    if (!entry.authorized()) this.finish(entry, 'cancelled', 'The agent grant or target changed.');
    else if (!entry.check()) this.finish(entry, 'conflict', 'The saved profile or draft changed. Review a new comparison.');
  }

  revalidate(client, plan) {
    try {
      const checked = this.plan(client, plan.params);
      return checked.store === plan.store && checked.baseVersion === plan.baseVersion ? checked : null;
    } catch {
      return null;
    }
  }

  async review(entry, client, plan) {
    const restoring = plan.params.command === 'restore';
    const accepted = await this.approve({
      caller: client.id.slice(0, 8), target: plan.label, operation: restoring ? 'Restore saved profile version' : 'Apply agent draft',
      changes: prioritizeChanges(plan.changes), signal: entry.controller.signal,
    });
    if (entry.status !== 'awaiting_confirmation') return;
    if (!accepted) return this.finish(entry, 'declined', 'The profile change was declined.');
    if (!entry.authorized()) return this.finish(entry, 'cancelled', 'The agent grant or target changed.');

    const checked = entry.check();
    if (!checked) return this.finish(entry, 'conflict', 'The saved profile or draft changed. Review a new comparison.');
    if (!entry.authorized()) return this.finish(entry, 'cancelled', 'The agent grant or target changed.');

    entry.committing = true;
    try {
      const saved = restoring ? checked.store.restoreBackup(plan.params.backup, checked.baseVersion) : checked.store.save(checked.next, checked.baseVersion);
      this.finish(entry, 'applied', restoring ? 'The validated backup was restored.' : 'The profile was saved.', saved.token);
    } catch {
      const current = checked.store.editorSnapshot();
      this.finish(entry, 'failed', 'Lastra could not confirm the profile update. Inspect the current revision and backups.', current.token);
    }
  }
}

module.exports = { AgentProfileApply, applyInput, applyOutput, applyParams, diffValues, prioritizeChanges };
