'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { setTimeout: wait } = require('node:timers/promises');
const { test } = require('node:test');
const { ActionHistory } = require('../src/main/action-history');
const { TerminalView } = require('../src/main/app-view-terminal');
const { AgentProjects, projectParams } = require('../src/main/mcp-projects');
const { AgentProjectActions, projectActionParams, terminalTarget } = require('../src/main/mcp-project-actions');
const { tempDir } = require('./helpers/temp-dir');

const command = { id: 'build', name: 'Build private demo', program: 'C:\\Build Tools\\node.exe', directory: 'D:\\Fixture root',
  args: ['build-private.js', '--private-token=fixture'], captureOutput: true, timeoutMs: 1000 };
const second = { ...command, id: 'test', name: 'Run tests', captureOutput: false };
const bare = { ...second, id: 'bare', program: 'node.exe' };
const OWNER = { id: 'owner-a' };
const PEER = { id: 'owner-b' };

function setup(t, { reviewTimeout = 5000 } = {}) {
  const children = [];
  const proposals = [];
  let monotonic = 20;
  let stamp = 'target-1';
  let generation = 0;
  let enabled = true;
  let authorized = true;
  let terminal;
  let service;
  t.after(() => {
    generation++;
    service?.checkPending();
    terminal?.close();
  });
  const directory = tempDir(t, 'lastra-mcp-project-run-');
  const file = path.join(directory, 'terminal.json');
  const write = (commands = [command, second, bare]) => fs.writeFileSync(file, JSON.stringify({ version: 1, profiles: [], commands }));
  write();
  terminal = new TerminalView(file, { platform: 'win32', monotonic: () => monotonic,
    spawnChild: (program, args, options) => {
      const child = new EventEmitter();
      child.pid = children.length + 1;
      child.kill = () => { child.stops = (child.stops ?? 0) + 1; return true; };
      if (Array.isArray(options.stdio)) {
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
      }
      children.push({ program, args, options, child });
      return child;
    },
  });
  const inventory = new AgentProjects({ readProjects: () => [], readCommands: () => terminal.configuredCommands() });
  const history = new ActionHistory();
  service = new AgentProjectActions({ inventory, terminal, history, timeout: reviewTimeout,
    inspectTarget: (target) => ({ program: target.program.replace('Build Tools', 'Canonical Tools'), directory: target.directory, stamp }),
    actionGuard() {
      const revision = generation;
      return () => revision === generation && enabled;
    },
    approve: (review) => new Promise((resolve) => {
      review.signal.addEventListener('abort', () => resolve(false), { once: true });
      proposals.push({ review, answer: resolve });
    }),
  });
  const list = (client = OWNER, scope = 'work', actions = true) => inventory.read(client.id, scope, projectParams({ section: 'commands' }), actions).items;
  const call = (params, client = OWNER, scope = 'work') => service.change(client, scope, projectActionParams(params), () => authorized);
  const request = (index = 0, idempotencyKey = 'retry-key-1') => {
    const { id, revision } = list()[index];
    return { command: 'run', id, revision, idempotencyKey };
  };
  const status = (request, client = OWNER, scope = 'work') => call({ command: 'status', request }, client, scope);
  const cancel = (request, client = OWNER, scope = 'work') => call({ command: 'cancel', request }, client, scope);
  const exit = (index, code) => {
    const { child } = children[index];
    child.stdout?.end();
    child.stderr?.end();
    child.emit('exit', code);
    child.emit('close', code);
  };
  return { terminal, service, history, children, proposals, write, list, call, request, status, cancel, exit,
    setClock: (next) => { monotonic = next; }, setStamp: (next) => { stamp = next; },
    setAllowed: (next) => { generation++; enabled = next; }, setAuthorized: (next) => { authorized = next; } };
}

test('project execution uses scoped revisions, shows the precise local command, and returns only the observed outcome', async (t) => {
  const f = setup(t);
  assert.equal(f.list(OWNER, 'work', false)[0].revision, undefined);
  assert.equal(f.list()[2].revision, undefined, 'an executable basename stays available to the local Terminal view');
  const request = f.request();
  assert.match(request.revision, /^command-revision-[a-f0-9]{24}$/);
  assert.notEqual(f.list(PEER)[0].revision, request.revision);
  assert.throws(() => f.call(request, PEER), /command .*unavailable/);
  assert.throws(() => f.call({ ...request, program: 'some-other.exe' }), /supported project command/);
  const started = f.call(request);
  assert.equal(started.status, 'awaiting_confirmation');
  assert.deepEqual(f.call(request), started);
  assert.equal(f.proposals.length, 1);
  assert.throws(() => f.call(f.request(1)), /different request key/);
  assert.deepEqual(f.children, []);
  const intended = f.proposals[0].review.details[0].value;
  assert.equal(intended.executable, 'C:\\Canonical Tools\\node.exe');
  assert.equal(intended.directory, command.directory);
  assert.deepEqual(intended.arguments, command.args);
  assert.equal(intended.timeoutMs, 1000);
  f.proposals[0].answer(true);
  await wait(0);
  const [child] = f.children;
  assert.equal(child.program, intended.executable);
  assert.deepEqual(child.args, command.args);
  assert.equal(f.status(started.request).status, 'running');
  assert.equal(f.status(started.request).hasLog, true);
  assert.deepEqual(f.history.snapshot().entries, []);
  child.child.stdout.write('sensitive fixture output');
  f.setClock(321);
  f.exit(0, 5);
  const ended = f.status(started.request);
  assert.equal(ended.status, 'exited');
  assert.equal(ended.exitCode, 5);
  assert.equal(ended.elapsedMs, 301);
  assert.equal(ended.hasLog, true);
  await Promise.resolve();
  assert.deepEqual(f.history.snapshot().entries, [{
    label: 'Run configured project command', origin: 'agent', context: `owner-a · ${request.id}`,
    gesture: undefined, at: ended.updatedAt, outcome: 'failed',
  }]);
  assert.doesNotMatch(JSON.stringify([started, ended, f.history.snapshot()]), /Build private demo|Canonical Tools|Fixture root|build-private|private-token|sensitive fixture/);
  assert.throws(() => f.status(started.request, PEER), /request is unavailable/);
  assert.throws(() => f.status(started.request, OWNER, 'other'), /request is unavailable/);
});

test('approval rejects changed targets, configuration, or grant, and cancellation leaves a UI-owned process alone', async (t) => {
  const f = setup(t);
  const changedTarget = f.call(f.request(0, 'target-key'));
  f.setStamp('target-2');
  f.proposals[0].answer(true);
  await wait(0);
  assert.equal(f.status(changedTarget.request).status, 'unavailable');

  const changedConfig = f.call(f.request(0, 'config-key'));
  f.write([{ ...command, args: ['different.js'] }, second]);
  f.proposals[1].answer(true);
  await wait(0);
  assert.equal(f.status(changedConfig.request).status, 'unavailable');

  const locked = f.call(f.request(0, 'locked-key'));
  f.setAllowed(false);
  f.setAllowed(true);
  f.service.checkPending();
  assert.equal(f.status(locked.request).status, 'unavailable');
  assert.equal(f.proposals[2].review.signal.aborted, true);

  const revoked = f.call(f.request(0, 'revoked-key'));
  f.setAuthorized(false);
  f.service.checkPending();
  assert.throws(() => f.status(revoked.request), /grant or activity changed/);
  f.setAuthorized(true);
  assert.equal(f.status(revoked.request).status, 'unavailable');
  assert.deepEqual(f.children, []);
  await Promise.resolve();
  assert.equal(f.history.snapshot().entries.length, 4);
  assert.ok(f.history.snapshot().entries.every(({ outcome }) => outcome === 'cancelled'));

  const active = f.call(f.request(0, 'active-key'));
  f.proposals[4].answer(true);
  await wait(0);
  assert.equal(f.status(active.request).status, 'running');
  assert.throws(() => f.cancel(active.request, PEER), /request is unavailable/);
  f.setAllowed(false);
  assert.throws(() => f.cancel(active.request), /unavailable on the deck/);
  assert.equal(f.children[0].child.stops, undefined);
  f.setAllowed(true);
  assert.equal(f.cancel(active.request).status, 'stopping');
  assert.equal(f.children[0].child.stops, 1);
  f.exit(0, null);
  assert.equal(f.status(active.request).status, 'stopped');
  await Promise.resolve();
  assert.equal(f.history.snapshot().entries.length, 5);
  assert.equal(f.history.snapshot().entries[0].outcome, 'cancelled');
  await f.terminal.change({ action: 'run-command', id: command.id });
  assert.equal(f.cancel(active.request).status, 'stopped');
  assert.equal(f.children[1].child.stops, undefined);
  assert.throws(() => f.call(f.request(0, 'busy-task')), /command .*unavailable/);
  f.exit(1, 0);
});

test('a review expiry or cancellation never starts a process and a late child exit remains tied to the timed-out run', async (t) => {
  const f = setup(t, { reviewTimeout: 50 });
  const pending = f.call(f.request(1, 'expires-first'));
  await wait(100);
  f.proposals[0].answer(true);
  assert.equal(f.status(pending.request).status, 'expired');

  const withdrawn = f.call(f.request(1, 'withdraw-next'));
  assert.equal(f.cancel(withdrawn.request).status, 'cancelled');
  f.proposals[1].answer(true);
  assert.deepEqual(f.children, []);

  const timeout = f.call(f.request(1, 'child-timeout'));
  f.proposals[2].answer(true);
  await wait(1200);
  assert.equal(f.status(timeout.request).status, 'stopping');
  assert.equal(f.children[0].child.stops, 1);
  assert.equal(f.children.length, 1);
  f.exit(0, null);
  assert.equal(f.status(timeout.request).status, 'timed-out');
  assert.equal(f.cancel(timeout.request).status, 'timed-out');
  await Promise.resolve();
  const outcomes = f.history.snapshot().entries.map(({ outcome }) => outcome);
  assert.deepEqual(outcomes, ['failed', 'cancelled', 'cancelled']);
});

test('a declined review and a clean process exit each record one terminal outcome', async (t) => {
  const f = setup(t);
  const lost = f.request(0, 'declined-audit');
  const declined = f.call(lost);
  f.proposals[0].answer(false);
  await wait(0);
  assert.equal(f.status(declined.request).status, 'declined');
  assert.equal(f.history.snapshot().entries[0].outcome, 'cancelled');
  assert.equal(f.history.snapshot().entries[0].context, `owner-a · ${lost.id}`);

  const allowed = f.request(1, 'success-audit');
  const requested = f.call(allowed);
  f.proposals[1].answer(true);
  await wait(0);
  assert.equal(f.status(requested.request).status, 'running');
  assert.equal(f.history.snapshot().entries.length, 1);
  f.exit(0, 0);
  f.exit(0, 0);
  const ended = f.call(allowed);
  assert.equal(ended.request, requested.request);
  assert.equal(ended.status, 'exited');
  await Promise.resolve();
  assert.deepEqual(f.history.snapshot().entries.map(({ context, outcome }) => [context, outcome]), [
    [`owner-a · ${allowed.id}`, 'succeeded'], [`owner-a · ${lost.id}`, 'cancelled'],
  ]);
});

test('verified terminal targets require canonical local executable and directory identity', () => {
  const exe = { dev: 1n, ino: 2n, size: 3n, mtimeNs: 4n, ctimeNs: 5n, isFile: () => true };
  const folder = { dev: 1n, ino: 3n, isDirectory: () => true };
  const files = { realpath: (value) => value, stat: (value) => value === command.program ? exe : folder };
  const stamp = terminalTarget(command, files).stamp;
  exe.mtimeNs++;
  assert.notEqual(terminalTarget(command, files).stamp, stamp);
  assert.equal(terminalTarget({ ...command, program: 'node.exe' }, files), null);
  assert.equal(terminalTarget({ ...command, directory: '\\\\host\\Fixture' }, files), null);
  assert.equal(terminalTarget(command, { ...files, realpath: () => 'D:\\link.txt' }), null);
  assert.equal(terminalTarget(command, { ...files, stat: () => { throw new Error('not available'); } }), null);
});
