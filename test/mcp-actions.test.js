'use strict';

const assert = require('node:assert/strict');
const { setImmediate: tick } = require('node:timers/promises');
const { test } = require('node:test');
const { ActionHistory } = require('../src/main/action-history');
const { AgentActions, actionParams, actionReviewDetails } = require('../src/main/mcp-actions');
const { createActionRunner } = require('../src/main/actions');

const client = { id: '11112222333344445555666677778888' };
const run = { command: 'run', id: 'save', page: 'home', gesture: 'tap', revision: 21, idempotencyKey: 'fixture-save' };

function fixture({ execute, timeout } = {}) {
  let current = true;
  let authorized = true;
  let approval;
  let executions = 0;
  let proposal;
  const history = new ActionHistory();
  const actions = new AgentActions({ history, timeout, approve(offered) {
    proposal = offered;
    return new Promise((resolve) => {
      approval = resolve;
      offered.signal.addEventListener('abort', () => resolve(false), { once: true });
    });
  }, prepare() {
    return { target: 'Fixture key · Home', auditTarget: 'home/save', details: [{ field: 'Hotkey', value: 'Ctrl+S' }],
      isCurrent: () => current, execute(allowed, progress) {
        executions++;
        return execute ? execute(allowed, progress) : { ok: true, steps: [{ path: [], type: 'hotkey', status: 'succeeded', attempts: [{ message: 'private' }] }] };
      } };
  } });
  const change = (command, owner = client) => actions.change(owner, actionParams(command), () => authorized);
  const status = (request) => change({ command: 'status', request });
  return { change, status, approve: (value) => approval(value), get executions() { return executions; },
    get proposal() { return proposal; }, history, actions, stale() { current = false; actions.checkPending(); },
    revoke() { authorized = false; actions.checkPending(); }, restore() { authorized = true; } };
}

test('registered action requests approve once, deduplicate retries and redact delivered hotkey results', async () => {
  const f = fixture();
  const { request } = f.change(run);
  assert.equal(f.status(request).status, 'awaiting_confirmation');
  assert.equal(f.executions, 0);
  assert.equal(f.proposal.kind, 'action');
  assert.deepEqual(f.proposal.details, [{ field: 'Hotkey', value: 'Ctrl+S' }]);
  assert.equal(f.change(run).request, request);
  assert.throws(() => f.change({ ...run, gesture: 'hold' }), /new request key/);
  assert.throws(() => f.change({ command: 'status', request }, { id: 'a'.repeat(32) }), /unavailable/);
  f.approve(true);
  await tick();
  const result = f.change(run);
  assert.equal(result.status, 'unconfirmed');
  assert.deepEqual(result.steps, [{ path: [], type: 'hotkey', status: 'succeeded', attempts: 1 }]);
  assert.equal(f.executions, 1);
  assert.match(JSON.stringify(f.history.snapshot()), /home\/save/);
  assert.doesNotMatch(JSON.stringify(result), /home|Ctrl\+S|private/);
});

test('changing the target or revoking access closes a pending review and prevents execution', async () => {
  const stale = fixture();
  const first = stale.change(run);
  stale.stale();
  stale.approve(true);
  await tick();
  assert.equal(stale.executions, 0);
  assert.equal(stale.status(first.request).status, 'cancelled');

  const revoked = fixture();
  const second = revoked.change(run);
  revoked.revoke();
  assert.throws(() => revoked.status(second.request), /grant/);
  revoked.restore();
  assert.equal(revoked.status(second.request).status, 'cancelled');
  assert.equal(revoked.proposal.signal.aborted, true);
  assert.equal(revoked.executions, 0);
});

test('cancelling a running action invalidates the guarded next step', async () => {
  let continueRun;
  const f = fixture({ execute: (allowed) => new Promise((resolve) => {
    assert.equal(allowed(), true);
    continueRun = () => { assert.equal(allowed(), false); resolve({ ok: false, unavailable: true }); };
  }) });
  const { request } = f.change(run);
  f.approve(true);
  await tick();
  assert.equal(f.status(request).status, 'running');
  assert.equal(f.change({ command: 'cancel', request }).status, 'cancel_requested');
  continueRun();
  await tick();
  assert.equal(f.status(request).status, 'cancelled');
});

test('review lists both configured branches and the input accepts only saved key IDs', () => {
  assert.throws(() => actionParams({ ...run, id: 'edit:copy' }), /saved key/);
  assert.equal(actionParams({ ...run, id: 'bar:mute', page: 'auto:' + 'a'.repeat(20) }).id, 'bar:mute');
  assert.throws(() => actionParams({ ...run, commandLine: 'example' }), /fields/);
  const rows = actionReviewDetails({ type: 'if', condition: 'obs-connected', expected: true,
    then: { type: 'obs-scene', scene: 'Safe sample', bus: 'program' }, else: { type: 'delay', ms: 50 } });
  assert.deepEqual(rows.map(({ field }) => field), ['if', 'Then · obs-scene', 'Else · delay']);
  assert.deepEqual(rows[1].value, { scene: 'Safe sample', bus: 'program' });
});

test('a running macro reports redacted completed steps and its exact nested progress, then cancels', async () => {
  let stamp = 0;
  let release;
  let waiting;
  const pause = new Promise((resolve) => { waiting = resolve; });
  const runner = createActionRunner({ now: () => stamp, async sleep(ms) {
    stamp += ms;
    if (ms === 150) await new Promise((resolve) => { release = resolve; waiting(); });
  } });
  const action = { type: 'sequence', steps: [{ type: 'delay', ms: 25 }, { type: 'delay', ms: 400 }] };
  const f = fixture({ execute: (allowed, progress) => runner.run(action, [], { trace: true, ...progress,
    guard: () => allowed() ? undefined : 'The review ended.' }) });
  const { request } = f.change(run);
  f.approve(true);
  await pause;
  const current = f.status(request);
  assert.equal(current.status, 'running');
  assert.deepEqual(current.progress, { path: [2], type: 'delay', step: 2, total: 2, attempt: 1, attempts: 1 });
  assert.deepEqual(current.steps, [{ path: [1], type: 'delay', status: 'succeeded', attempts: 1 }]);
  assert.equal(current.stepCount, 1);
  const cancelling = f.change({ command: 'cancel', request });
  assert.equal(cancelling.status, 'cancel_requested');
  assert.deepEqual(cancelling.steps, current.steps);
  release();
  await tick();
  const final = f.status(request);
  assert.equal(final.status, 'cancelled');
  assert.equal(final.progress, undefined);
  assert.deepEqual(final.steps.map(({ status }) => status), ['cancelled', 'succeeded', 'cancelled']);
  assert.doesNotMatch(JSON.stringify(current), /"(?:ms|input|clipboard|message|payload)":/);
});
