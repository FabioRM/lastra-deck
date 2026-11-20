'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { setImmediate, setTimeout } = require('node:timers/promises');
const { AlertInbox } = require('../src/main/alert-inbox');
const { ActionHistory } = require('../src/main/action-history');
const { AgentAlertAck, alertAckParams } = require('../src/main/mcp-alert-ack');
const { readTelemetry, telemetryParams } = require('../src/main/mcp-telemetry');
const { tempDir } = require('./helpers/temp-dir');

const check = { id: 'service:internal-check', name: 'Private intranet https://internal.example/a', viewId: 'service-health',
  targetId: 'internal-check', source: 'Service health' };
const owner = { id: 'a'.repeat(32) };
const other = { id: 'b'.repeat(32) };

function fixture(t, { broken = false, timeout } = {}) {
  const dir = tempDir(t, 'lastra-agent-alert-');
  const file = path.join(dir, 'alerts.json');
  if (broken) fs.writeFileSync(file, '{broken');
  const clock = () => 50_000;
  let service;
  const inbox = new AlertInbox(file, { now: clock, onChange: () => service?.checkPending() });
  const history = new ActionHistory({ now: clock });
  const approvals = [];
  let allowed = true;
  let canReview = true;
  let busy = false;
  const approve = Object.assign((proposal) => new Promise((finish) => {
    approvals.push({ proposal, finish });
    proposal.signal.addEventListener('abort', () => finish(false), { once: true });
  }), { isOpen: () => busy });
  service = new AgentAlertAck({ inbox, history, approve, canReview: () => canReview, now: clock, timeout });
  const call = (params, client = owner) => service.change(client, alertAckParams(params), () => allowed);
  const read = (alerts = inbox) => readTelemetry(telemetryParams({ section: 'alerts' }), { alerts: () => alerts.snapshot() }, clock);
  inbox.update(check, 'active', 'GET https://internal.example/a failed, C:\\private\\logs');
  return { file, inbox, service, history, approvals, call, read,
    allow: (enabled) => { allowed = enabled; service.checkPending(); },
    enableReview: (enabled) => { canReview = enabled; service.checkPending(); },
    showExternalReview: () => { busy = true; } };
}

const request = ({ id, revision }) => ({ command: 'request', alert: id, revision });
const status = ({ request }) => ({ command: 'status', request });
const hidden = /internal-check|internal\.example|Private intranet|C:\\private/i;

test('an approved active alert is acknowledged exactly once and reported with redacted evidence', async (t) => {
  const { file, inbox, approvals, call, read, history } = fixture(t);
  const [row] = (await read()).alerts;
  assert.match(row.id, /^alert-[a-f0-9]{20}$/);
  assert.match(row.revision, /^alert-revision-[a-f0-9]{24}$/);
  assert.deepEqual((await read()).alerts, [row]);
  assert.doesNotMatch(JSON.stringify(row), hidden);
  const pending = call(request(row));
  assert.equal(pending.status, 'awaiting_confirmation');
  assert.equal((await read()).alerts[0].acknowledgedAt, null);
  assert.throws(() => call(status(pending), other), /review request is unavailable/);
  assert.throws(() => call({ ...status(pending), command: 'cancel' }, other), /review request is unavailable/);
  assert.throws(() => call(request(row)), /Another reviewed deck request/);
  assert.equal(approvals[0].proposal.kind, 'action');
  assert.equal(approvals[0].proposal.target, 'Service health alert');
  assert.equal(approvals[0].proposal.details[0].value.reference, row.id);
  assert.doesNotMatch(JSON.stringify(approvals[0].proposal), hidden);
  approvals[0].finish(true);
  await setImmediate();
  const completed = call(status(pending));
  assert.equal(completed.status, 'acknowledged');
  assert.equal(completed.acknowledgedAt, 50_000);
  assert.equal(completed.alert, row.id);
  assert.doesNotMatch(JSON.stringify(completed), hidden);
  assert.doesNotMatch(JSON.stringify(history.snapshot()), hidden);
  assert.equal(history.snapshot().entries[0].outcome, 'succeeded');
  const persisted = new AlertInbox(file).snapshot().entries[0];
  assert.equal(persisted.status, 'active');
  assert.equal(persisted.acknowledgedAt, 50_000);
  assert.equal(inbox.snapshot().entries[0].detail, persisted.detail);
  assert.equal(Object.hasOwn((await read()).alerts[0], 'revision'), false);
  assert.throws(() => call(request(row)), /active alert changed or is unavailable/);
});

test('a changed, recovered, reopened, independently acknowledged or reloaded alert invalidates its earlier review', async (t) => {
  const { file, inbox, approvals, call, read } = fixture(t);
  const first = (await read()).alerts[0];
  const waiting = call(request(first));
  inbox.update(check, 'active', 'New failure, same clock time');
  assert.equal(approvals[0].proposal.signal.aborted, true);
  assert.equal(call(status(waiting)).status, 'stale');
  approvals[0].finish(true);
  await setImmediate();
  const second = (await read()).alerts[0];
  assert.equal(second.id, first.id);
  assert.equal(second.updatedAt, first.updatedAt);
  assert.notEqual(second.revision, first.revision);
  assert.equal(second.acknowledgedAt, null);
  assert.throws(() => call(request(first)), /active alert changed/);
  assert.notEqual((await read(new AlertInbox(file))).alerts[0].revision, second.revision);

  const reviewingRecovery = call(request(second));
  inbox.update(check, 'recovered', 'Recovered');
  assert.equal(call(status(reviewingRecovery)).status, 'stale');
  assert.equal(Object.hasOwn((await read()).alerts[0], 'revision'), false);
  inbox.update(check, 'active', 'Still the same failure');
  const reopened = (await read()).alerts[0];
  assert.notEqual(reopened.revision, second.revision);
  assert.equal(reopened.occurrences, 2);
  const reviewingLocal = call(request(reopened));
  inbox.change({ id: check.id, action: 'acknowledge' });
  assert.equal(call(status(reviewingLocal)).status, 'stale');
  assert.equal((await read()).alerts[0].acknowledgedAt, 50_000);
  assert.equal(inbox.acknowledgeActive(structuredClone(inbox.snapshot().entries[0])), null);
});

test('grant changes, view restrictions, cancel and timeout can never acknowledge an alert', async (t) => {
  const { approvals, call, read, enableReview, allow, showExternalReview } = fixture(t, { timeout: 10 });
  const [row] = (await read()).alerts;
  const declined = call(request(row));
  approvals.at(-1).finish(false);
  await setImmediate();
  assert.equal(call(status(declined)).status, 'declined');
  const permission = call(request(row));
  allow(false);
  assert.equal(approvals.at(-1).proposal.signal.aborted, true);
  assert.throws(() => call(status(permission)), /grant changed/);
  allow(true);
  assert.equal(call(status(permission)).status, 'cancelled');
  const mode = call(request(row));
  enableReview(false);
  approvals.at(-1).finish(true);
  assert.equal(call(status(mode)).status, 'cancelled');
  assert.throws(() => call(request(row)), /approval is unavailable/);
  enableReview(true);
  const cancelled = call(request(row));
  assert.equal(call({ ...status(cancelled), command: 'cancel' }).status, 'cancelled');
  const expired = call(request(row));
  await setTimeout(25);
  assert.equal(call(status(expired)).status, 'expired');
  showExternalReview();
  assert.throws(() => call(request(row)), /Another reviewed deck request/);
  assert.equal((await read()).alerts[0].acknowledgedAt, null);
});

test('an alert bypassing persistence reports an acknowledgement for this session only', async (t) => {
  const { file, call, read, approvals } = fixture(t, { broken: true });
  const pending = call(request((await read()).alerts[0]));
  approvals[0].finish(true);
  await setImmediate();
  assert.equal(call(status(pending)).status, 'acknowledged_session');
  assert.equal((await read()).alerts[0].acknowledgedAt, 50_000);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});

test('only current known alert aliases and revisions are accepted and review history stays bounded', async (t) => {
  const { inbox, call, read, approvals, service } = fixture(t);
  inbox.update({ ...check, id: 'external:private', source: 'Other' }, 'active', 'Unreadable detail');
  inbox.update({ id: 'hardware:cpu_temp', targetId: 'cpu_temp', name: 'CPU temperature', source: 'Hardware thresholds' }, 'active', 'Hot');
  const { alerts } = await read();
  assert.equal(Object.hasOwn(alerts.find(({ source }) => source === 'unknown'), 'revision'), false);
  assert.ok(alerts.find(({ source }) => source === 'threshold').revision);
  const row = alerts.find(({ source }) => source === 'service');
  assert.throws(() => call({ ...request(row), id: check.id }), /Supply only/);
  assert.throws(() => call({ ...request(row), alert: check.id }), /alert alias/);
  assert.throws(() => call({ ...request(row), revision: 50_000 }), /alias and revision/);
  let first;
  for (let index = 0; index < 28; index++) {
    const review = call(request(row));
    first ??= review;
    approvals.at(-1).finish(false);
    await setImmediate();
    assert.equal(call(status(review)).status, 'declined');
  }
  assert.equal(service.requests.size, 24);
  assert.throws(() => call(status(first)), /review request is unavailable/);
});
