// @ts-check
'use strict';

const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
const { localProjectDirectory } = require('../../extensions/lastra-vscode/project-location');
const { COMMAND_ID, COMMAND_REVISION } = require('./mcp-projects');
const { SnapshotRequestError } = require('./mcp-snapshot');

const REQUEST = /^[a-f0-9]{24}$/;
const KEY = /^[A-Za-z0-9_-]{8,64}$/;
const FIELDS = { run: ['id', 'revision', 'idempotencyKey'], status: ['request'], cancel: ['request'] };
const REVIEW_TIMEOUT = 90_000;
const REVIEW_CHECK = 500;
const HISTORY_TTL = 30 * 60_000;
const CAPACITY = 48;
const PENDING = 'awaiting_confirmation';
const FINISHED = ['declined', 'cancelled', 'unavailable', 'expired', 'exited', 'failed', 'stopped', 'timed-out', 'interrupted'];
const CANCELLED = new Set(['declined', 'cancelled', 'unavailable', 'expired', 'stopped', 'interrupted']);
const ACTIVE = ['starting', 'running', 'stopping', 'finishing', 'stop-failed'];

const text = { type: 'string' };
const number = { type: 'integer' };
const nullable = (value) => ({ anyOf: [value, { type: 'null' }] });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const id = { ...text, pattern: COMMAND_ID.source };
const request = { ...text, pattern: REQUEST.source };
const projectActionInput = object({ command: { enum: Object.keys(FIELDS) }, id, revision: { ...text, pattern: COMMAND_REVISION.source },
  idempotencyKey: { ...text, pattern: KEY.source }, request }, ['command']);
const projectActionOutput = object({ request, status: { enum: [PENDING, ...ACTIVE, ...FINISHED] }, updatedAt: { ...number, minimum: 0 },
  elapsedMs: nullable({ ...number, minimum: 0 }), exitCode: nullable(number), hasLog: { type: 'boolean' } });

const valid = (value, pattern) => typeof value === 'string' && pattern.test(value);

function projectActionParams(value) {
  const command = value?.command;
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof command !== 'string' || !Object.hasOwn(FIELDS, command)
      || Object.keys(value).some((key) => key !== 'command' && !FIELDS[command].includes(key))) {
    throw new SnapshotRequestError('Choose a supported project command request.');
  }
  if (command === 'run') {
    if (!valid(value.id, COMMAND_ID) || !valid(value.revision, COMMAND_REVISION) || !valid(value.idempotencyKey, KEY)) {
      throw new SnapshotRequestError('Choose a command alias, its current revision, and a request key.');
    }
    const { id, revision, idempotencyKey } = value;
    return { command, id, revision, idempotencyKey };
  }
  if (!valid(value.request, REQUEST)) throw new SnapshotRequestError('Choose a project command request ID.');
  return { command, request: value.request };
}

function terminalTarget(entry, { realpath = fs.realpathSync.native, stat = fs.statSync } = {}) {
  if (!localProjectDirectory(entry?.program) || !localProjectDirectory(entry?.directory)) return null;
  try {
    const program = localProjectDirectory(realpath(entry.program));
    const directory = localProjectDirectory(realpath(entry.directory));
    if (!program || !directory || !/\.exe$/i.test(program)) return null;
    const executable = stat(program, { bigint: true });
    const folder = stat(directory, { bigint: true });
    if (!executable.isFile() || !folder.isDirectory()) return null;
    const stamp = [program, executable.dev, executable.ino, executable.size, executable.mtimeNs, executable.ctimeNs,
      directory, folder.dev, folder.ino].join('|');
    return { program, directory, stamp };
  } catch { return null; }
}

function report(entry) {
  const active = entry.child?.snapshot();
  const status = active && entry.status === 'running'
    ? (active.state === 'running' && !entry.child.launched ? 'starting' : active.state) : entry.status;
  return { request: entry.request, status, updatedAt: entry.updatedAt,
    elapsedMs: active?.durationMs ?? entry.result?.durationMs ?? null, exitCode: entry.result?.exitCode ?? null,
    hasLog: active?.log === true || entry.result?.hasLog === true };
}

class AgentProjectActions {
  constructor({ inventory, terminal, approve, history, actionGuard = () => () => true, inspectTarget = terminalTarget,
    now = Date.now, timeout = REVIEW_TIMEOUT }) {
    this.inventory = inventory;
    this.terminal = terminal;
    this.approve = approve;
    this.history = history;
    this.actionGuard = actionGuard;
    this.inspectTarget = inspectTarget;
    this.now = now;
    this.timeout = timeout;
    this.requests = new Map();
  }

  change(client, activity, params, authorized) {
    if (!authorized()) throw new SnapshotRequestError('The project command grant or activity changed.');
    for (const [request, entry] of this.requests) {
      if (FINISHED.includes(entry.status) && this.now() - entry.updatedAt >= HISTORY_TTL) this.requests.delete(request);
    }
    if (params.command !== 'run') {
      const entry = this.requests.get(params.request);
      if (!entry || entry.owner !== client.id || entry.activity !== activity) throw new SnapshotRequestError('The project command request is unavailable.');
      if (params.command === 'cancel') this.cancel(entry, authorized);
      return report(entry);
    }

    const { id, revision, idempotencyKey } = params;
    const known = [...this.requests.values()].find((entry) => entry.owner === client.id && entry.activity === activity && entry.key === idempotencyKey);
    if (known) {
      if (known.id !== id || known.revision !== revision) throw new SnapshotRequestError('Use a different request key for another command or revision.');
      return report(known);
    }
    const guard = this.actionGuard();
    if (!guard()) throw new SnapshotRequestError('Project actions are unavailable on the deck.');
    if (this.pending || this.approve.isOpen?.()) throw new SnapshotRequestError('Another action is awaiting approval on the deck.');
    if (this.requests.size >= CAPACITY) {
      const finished = [...this.requests.values()].find((entry) => FINISHED.includes(entry.status));
      if (!finished) throw new SnapshotRequestError('The project command queue is full.');
      this.requests.delete(finished.request);
    }
    const selection = this.inventory.resolveCommand(client.id, activity, id, revision, client.project);
    const configured = selection && !selection.active && this.terminal.registeredCommand(selection.id, selection.reviewRevision);
    const target = configured && this.inspectTarget(configured);
    if (!target) throw new SnapshotRequestError('The configured command or its local executable and folder are unavailable. Read the inventory again.');
    const entry = { request: randomBytes(12).toString('hex'), owner: client.id, activity, id, revision, project: client.project, key: idempotencyKey,
      status: PENDING, updatedAt: this.now(), authorized, guard, controller: new AbortController() };
    this.requests.set(entry.request, entry);
    this.pending = entry;
    entry.expiration = setTimeout(() => this.finish(entry, 'expired'), this.timeout).unref();
    entry.check = setInterval(() => this.checkPending(), REVIEW_CHECK).unref();
    void this.review(entry, configured, target).catch(() => this.finish(entry, 'failed'));
    return report(entry);
  }

  leaveReview(entry) {
    clearTimeout(entry.expiration);
    clearInterval(entry.check);
    entry.controller.abort();
    entry.authorized = null;
    entry.guard = null;
    if (this.pending === entry) this.pending = null;
  }

  finish(entry, status, result) {
    if (FINISHED.includes(entry.status)) return;
    if (entry.status === PENDING) this.leaveReview(entry);
    Object.assign(entry, { status, result, child: null, updatedAt: this.now() });
    const context = entry.owner.slice(0, 8) + ' · ' + entry.id;
    void this.history.run({
      origin: 'agent', label: 'Run configured project command', context, at: entry.updatedAt, activity: entry.activity,
    }, () => ({ ok: status === 'exited' && result?.exitCode === 0, cancelled: CANCELLED.has(status) })).catch(() => {});
  }

  cancel(entry, authorized) {
    if (entry.status === PENDING) this.finish(entry, 'cancelled');
    else if (entry.child) {
      const guard = this.actionGuard();
      if (!guard() || !authorized()) throw new SnapshotRequestError('Project actions are unavailable on the deck.');
      if (!entry.child.stop() && entry.child.snapshot().state !== 'finishing') {
        throw new SnapshotRequestError('Windows did not stop this command process.');
      }
      entry.updatedAt = this.now();
    }
  }

  current(entry) {
    if (!entry.authorized?.() || !entry.guard?.()) return false;
    const command = this.inventory.resolveCommand(entry.owner, entry.activity, entry.id, entry.revision, entry.project);
    return Boolean(command && !command.active);
  }

  checkPending() {
    const entry = this.pending;
    if (entry && !this.current(entry)) this.finish(entry, 'unavailable');
  }

  async review(entry, configured, target) {
    const caller = entry.owner.slice(0, 8);
    const { name, args, timeout, captureOutput, kind } = configured;
    const accepted = await this.approve({ caller, kind: 'action', operation: 'Run configured project command', target: name,
      details: [{ field: 'Process', value: { executable: target.program, arguments: args, directory: target.directory,
        kind, timeoutMs: timeout, captureOutput, cancel: 'The requesting client can stop the direct process it starts.' } }],
      signal: entry.controller.signal });
    if (entry.status !== PENDING) return;
    if (!accepted) return this.finish(entry, 'declined');
    if (!this.current(entry)) return this.finish(entry, 'unavailable');
    const verify = (candidate) => {
      const currentTarget = this.inspectTarget(candidate);
      return currentTarget?.stamp === target.stamp && Boolean(entry.authorized?.() && entry.guard?.());
    };
    const child = this.terminal.launchRegistered(configured.id, configured.fingerprint, { target, verify,
      onFinish: (result) => this.finish(entry, result.status, result) });
    if (!child) return this.finish(entry, 'unavailable');
    if (entry.status === PENDING) {
      this.leaveReview(entry);
      Object.assign(entry, { status: 'running', child, updatedAt: this.now() });
    }
  }
}

module.exports = { AgentProjectActions, projectActionInput, projectActionOutput, projectActionParams, terminalTarget };
