// @ts-check
'use strict';

const { randomBytes } = require('node:crypto');
const { recordAgentReview } = require('./action-history');
const { SnapshotRequestError } = require('./mcp-snapshot');
const { WORKSPACE_ALIAS, TARGET_ALIAS, WINDOW_ALIAS, REVISION, relativeBounds } = require('./mcp-workspaces');

const REQUEST = /^[a-f0-9]{24}$/;
const COMMANDS = { request: ['workspace', 'revision'], status: ['request'], cancel: ['request'] };
const TARGET_COMMANDS = { launch: ['workspace', 'target', 'revision'], focus: ['window', 'revision'], status: ['request'], cancel: ['request'] };
const STATES = ['awaiting_confirmation', 'running', 'cancel_requested', 'confirmed', 'unconfirmed', 'declined', 'cancelled', 'unavailable', 'expired', 'failed'];
const TIMEOUT = 60_000;
const TTL = 30 * 60_000;
const CAPACITY = 32;
const count = { type: 'integer', minimum: 0 };
const text = { type: 'string' };
const workspaceApplyInput = { type: 'object', additionalProperties: false, required: ['command'], properties: {
  command: { enum: Object.keys(COMMANDS) }, workspace: { ...text, pattern: WORKSPACE_ALIAS.source },
  revision: { ...text, pattern: REVISION.source }, request: { ...text, pattern: REQUEST.source },
} };
const workspaceTargetInput = { ...workspaceApplyInput, properties: { ...workspaceApplyInput.properties,
  command: { enum: Object.keys(TARGET_COMMANDS) }, target: { ...text, pattern: TARGET_ALIAS.source }, window: { ...text, pattern: WINDOW_ALIAS.source },
} };
const workspaceApplyOutput = { type: 'object', additionalProperties: false, required: ['request', 'status', 'updatedAt', 'total', 'attempted', 'confirmed'], properties: {
  request: { ...text, pattern: REQUEST.source }, status: { enum: STATES }, updatedAt: count, total: count, attempted: count, confirmed: count,
} };

function requestParams(value, commands) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.command !== 'string' || !Object.hasOwn(commands, value.command)) {
    throw new Error('Choose a reviewed workspace command.');
  }
  const command = value.command;
  const expected = commands[command];
  if (Object.keys(value).some((key) => key !== 'command' && !expected.includes(key)) || expected.some((field) => !Object.hasOwn(value, field))) {
    throw new Error('Supply the fields required by the workspace command.');
  }
  const matches = (value, pattern) => typeof value === 'string' && pattern.test(value);
  if (command === 'request') {
    if (!matches(value.workspace, WORKSPACE_ALIAS) || !matches(value.revision, REVISION)) throw new Error('Choose the workspace alias and revision from the inventory.');
    return { command, workspace: value.workspace, revision: value.revision };
  }
  if (command === 'launch') {
    if (!matches(value.workspace, WORKSPACE_ALIAS) || !matches(value.target, TARGET_ALIAS) || !matches(value.revision, REVISION)) {
      throw new Error('Choose the workspace and target aliases and the launch revision from the inventory.');
    }
    return { command, workspace: value.workspace, target: value.target, revision: value.revision };
  }
  if (command === 'focus') {
    if (!matches(value.window, WINDOW_ALIAS) || !matches(value.revision, REVISION)) throw new Error('Choose a window alias and focus revision from the inventory.');
    return { command, window: value.window, revision: value.revision };
  }
  if (!matches(value.request, REQUEST)) throw new Error('Choose a workspace review request ID.');
  return { command, request: value.request };
}

const workspaceApplyParams = (value) => requestParams(value, COMMANDS);
const workspaceTargetParams = (value) => requestParams(value, TARGET_COMMANDS);

const report = ({ request, status, updatedAt, total, attempted, confirmed }) => ({ request, status, updatedAt, total, attempted, confirmed });
const active = ({ status }) => ['awaiting_confirmation', 'running', 'cancel_requested'].includes(status);
const displayName = (display) => display ? `Monitor ${display.number}${display.primary ? ' (primary)' : ''}` : 'Monitor unavailable';

function reviewDetails(plan) {
  return plan.applications.map(({ app, matches: [window], monitor, destination }) => ({
    field: app.name,
    value: { effect: destination ? 'Move an existing window without changing focus' : 'Show an existing window without changing focus',
      executable: app.target,
      currentMonitor: displayName(window.display), currentBoundsPx: relativeBounds(window.bounds, window.display), minimized: window.minimized,
      ...(destination ? { destinationMonitor: displayName(monitor), destinationBoundsPx: relativeBounds(destination, monitor) } : {}) },
  }));
}

function targetReview(plan) {
  const { app, window } = plan;
  if (plan.operation === 'launch') {
    return { operation: 'Open saved Windows app', target: app.name, details: [{ field: 'Launch', value: {
      workspace: plan.entry.name, executable: app.target, arguments: app.args, placement: 'App default',
    } }] };
  }
  return { operation: 'Focus selected Windows window', target: app.name, details: [{ field: 'Focus', value: {
    executable: app.target, monitor: displayName(window.display), boundsPx: relativeBounds(window.bounds, window.display), minimized: window.minimized,
  } }] };
}

function externalReview(plan) {
  const { entry, external } = plan;
  return { operation: 'Open saved PowerToys workspace', target: entry.name, details: [{ field: 'PowerToys layout', value: {
    shortcut: external.file, launcher: external.target, arguments: external.args, workingDirectory: external.cwd,
    effect: 'PowerToys may launch apps and move windows on connected monitors',
  } }] };
}

class AgentWorkspaceApply {
  constructor({ inventory, approve, history, canArrange = () => true, now = Date.now, timeout = TIMEOUT }) {
    this.inventory = inventory;
    this.approve = approve;
    this.history = history;
    this.canArrange = canArrange;
    this.now = now;
    this.timeout = timeout;
    this.requests = new Map();
  }

  change(client, params, authorized, mode = 'native') {
    if (!authorized()) throw new SnapshotRequestError('The workspace grant changed.');
    for (const [id, entry] of this.requests) if (!active(entry) && this.now() - entry.updatedAt >= TTL) this.requests.delete(id);
    if (params.command === 'status' || params.command === 'cancel') {
      const entry = this.requests.get(params.request);
      if (!entry || entry.owner !== client.id || entry.mode !== mode) throw new SnapshotRequestError('The workspace request is unavailable.');
      if (params.command === 'cancel') this.cancel(entry);
      return report(entry);
    }
    if (!this.canArrange()) throw new SnapshotRequestError('Workspace arrangement is unavailable on the deck.');
    if (this.running || this.approve.isOpen?.()) throw new SnapshotRequestError('Another reviewed deck request is open.');
    if (this.requests.size >= CAPACITY) this.requests.delete(this.requests.keys().next().value);
    const plan = this.resolve(client.id, params, mode);
    if (!plan) throw new SnapshotRequestError('The workspace, target window or monitor changed. Inspect the inventory again.');
    if (plan.operation === 'launch') {
      plan.stamp = this.inventory.workspaces.launchStamp(plan.app.target);
      if (!plan.stamp) throw new SnapshotRequestError('The configured executable is unavailable.');
    }
    const request = randomBytes(12).toString('hex');
    const auditLabel = plan.operation === 'launch' ? 'Open approved workspace app'
      : plan.operation === 'focus' ? 'Focus approved workspace window'
        : mode === 'external' ? 'Open approved PowerToys workspace' : 'Arrange approved workspace';
    const entry = { request, owner: client.id, status: 'awaiting_confirmation', updatedAt: this.now(),
      total: mode === 'native' ? plan.applications.length : 1, attempted: 0, confirmed: 0, mode, authorized, controller: new AbortController(),
      auditLabel, auditTarget: params.target ?? params.window ?? params.workspace };
    this.requests.set(request, entry);
    this.running = entry;
    entry.timer = setTimeout(() => this.finish(entry, 'expired'), this.timeout).unref();
    void this.review(entry, params, plan).catch(() => this.finish(entry, entry.controller.signal.aborted ? 'cancelled' : 'failed'));
    return report(entry);
  }

  resolve(owner, params, mode) {
    if (mode === 'target') return this.inventory.resolveTarget(owner, params);
    return this.inventory.resolve(owner, params.workspace, params.revision, mode === 'external');
  }

  allowed(entry) {
    return entry.authorized?.() && this.canArrange() && !entry.controller.signal.aborted;
  }

  finish(entry, status, result) {
    if (!active(entry)) return;
    clearTimeout(entry.timer);
    Object.assign(entry, { status, updatedAt: this.now(), authorized: undefined,
      ...(result ? { attempted: result.attempted, confirmed: result.confirmed } : {}) });
    entry.controller.abort();
    if (this.running === entry) this.running = null;
    recordAgentReview(this.history, entry, entry.auditLabel, entry.auditTarget);
  }

  cancel(entry) {
    if (entry.status === 'awaiting_confirmation') this.finish(entry, 'cancelled');
    if (entry.status === 'running') {
      entry.status = 'cancel_requested';
      entry.updatedAt = this.now();
      entry.controller.abort();
    }
  }

  checkPending() {
    const entry = this.running;
    if (entry && !this.allowed(entry)) this.cancel(entry);
  }

  async review(entry, params, plan) {
    const caller = entry.owner.slice(0, 8);
    const review = entry.mode === 'external' ? externalReview(plan) : entry.mode === 'target' ? targetReview(plan)
      : { operation: 'Arrange saved workspace', target: plan.entry.name, details: reviewDetails(plan) };
    const accepted = await this.approve({ caller, kind: 'action', ...review, signal: entry.controller.signal });
    if (entry.status !== 'awaiting_confirmation') return;
    if (!accepted) return this.finish(entry, 'declined');
    if (!this.allowed(entry)) return this.finish(entry, 'cancelled');
    const current = this.resolve(entry.owner, params, entry.mode);
    if (!current) return this.finish(entry, 'unavailable');
    clearTimeout(entry.timer);
    entry.status = 'running';
    entry.updatedAt = this.now();
    const { workspaces } = this.inventory;
    let outcome;
    if (entry.mode === 'external') {
      outcome = await workspaces.applyExternal(current, () => this.allowed(entry) && this.inventory.topologyMatches(current));
    } else if (entry.mode === 'target') {
      outcome = await workspaces.performTarget({ ...current, stamp: plan.stamp }, () => this.allowed(entry) && this.inventory.targetMatches(current));
    } else {
      outcome = await workspaces.applyExisting(current, () => this.allowed(entry) && this.inventory.topologyMatches(current));
    }
    this.finish(entry, outcome.status, outcome);
  }
}

module.exports = { AgentWorkspaceApply, workspaceApplyInput, workspaceApplyOutput, workspaceApplyParams, workspaceTargetInput, workspaceTargetParams };
