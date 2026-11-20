'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { test } = require('node:test');
const { AgentDrafts } = require('../src/main/mcp-drafts');
const { readTelemetry, telemetryAlias, telemetryParams } = require('../src/main/mcp-telemetry');
const { AgentMonitoringDrafts, monitoringDraftParams } = require('../src/main/mcp-monitoring-drafts');
const { TelemetryThresholds } = require('../src/main/telemetry-thresholds');
const { MonitoringWatchlist } = require('../src/main/monitoring-watchlist');
const { AgentAccess } = require('../src/main/mcp-access');
const { AgentService } = require('../src/main/mcp-service');
const { ActionHistory } = require('../src/main/action-history');
const { connectAgent } = require('../src/main/mcp-client');
const { parseCredential } = require('../src/main/mcp-link');
const { tempDir } = require('./helpers/temp-dir');

const threshold = { id: 'private_rule', name: 'Private C:\\Fixture\\Hardware', metric: 'cpu', direction: 'above', limit: 85, holdSeconds: 3 };
const removed = 'service:removed_check';
const configured = { id: 'private_check', name: 'Private https://fixture.invalid/secret', kind: 'http', status: 'up',
  latest: { at: 123000, latencyMs: 1, detail: 'private raw check result' }, intervalMs: 60000 };
const thresholdAlias = telemetryAlias('threshold', threshold.id);
const serviceAlias = telemetryAlias('service', configured.id);
const orphanAlias = telemetryAlias('service', 'removed_check');
const secret = /private_rule|private_check|removed_check|Fixture|fixture\.invalid|raw check result/i;

function fixture(t) {
  const directory = tempDir(t, 'lastra-monitoring-draft-');
  const thresholdFile = path.join(directory, 'hardware-thresholds.json');
  const watchlistFile = path.join(directory, 'watchlist.json');
  const saveRules = (rules) => fs.writeFileSync(thresholdFile, JSON.stringify({ version: 1, rules }));
  saveRules([threshold]);
  fs.writeFileSync(watchlistFile, JSON.stringify({ version: 1, pins: ['hardware:cpu', removed] }));
  const snapshotBytes = () => [fs.readFileSync(thresholdFile, 'utf8'), fs.readFileSync(watchlistFile, 'utf8')];
  const forbidden = () => assert.fail('A temporary draft performed a live monitoring action.');
  let services = { checks: [configured] };
  const thresholds = new TelemetryThresholds(thresholdFile, { onResult: forbidden, openConfig: forbidden });
  const watchlist = new MonitoringWatchlist(watchlistFile, {
    serviceHealth: () => services, resources: forbidden, docker: forbidden, now: () => 123000,
  });
  const drafts = new AgentDrafts();
  const monitoring = new AgentMonitoringDrafts(drafts, { thresholds: () => thresholds.configuration(), watchlist: () => watchlist.configuration() });
  const call = (parameters, owner = 'first-client', activity = 'work') => monitoring.change(owner, activity, monitoringDraftParams(parameters));
  return { directory, thresholdFile, watchlistFile, saveRules, snapshotBytes, drafts, thresholds, watchlist, monitoring, call,
    setServices: (data) => { services = data; } };
}

test('threshold drafts use existing aliases, validate a full batch and compare only redacted normalized fields', async (t) => {
  const f = fixture(t);
  f.thresholds.reload();
  const ordinary = await readTelemetry(telemetryParams({ section: 'thresholds' }), { thresholds: () => f.thresholds.snapshot() });
  assert.equal(ordinary.thresholds[0].id, thresholdAlias, 'underscored configured IDs resolve to their usual telemetry alias');
  const actual = f.snapshotBytes();
  const created = f.call({ command: 'create', target: 'thresholds', source: 'active' });
  assert.deepEqual(created.rules, [{ id: thresholdAlias, metric: 'cpu', direction: 'above', limit: 85, holdSeconds: 3, unit: '%' }]);
  const edit = (revision, edits) => f.call({ command: 'edit', draft: created.id, revision, edits });
  assert.throws(() => edit(1, [{ op: 'remove-rule', id: thresholdAlias }, { op: 'add-rule', rule: { metric: 'gpu', limit: 101 } }]), /limit between 0 and 100/);
  assert.equal(f.call({ command: 'inspect', draft: created.id }).revision, 1);
  assert.equal(f.call({ command: 'inspect', draft: created.id }).rules.length, 1);
  assert.throws(() => edit(1, [{ op: 'update-rule', id: thresholdAlias, rule: { metric: ['cpu'] } }]), /Choose cpu/);
  assert.throws(() => edit(1, [{ op: 'update-rule', id: thresholdAlias, rule: { name: 'C:/private' } }]), /supported threshold fields/);
  const updated = edit(1, [
    { op: 'update-rule', id: thresholdAlias, rule: { limit: 72, holdSeconds: 15 } },
    { op: 'add-rule', rule: { metric: 'cpuTemp', limit: 99 } },
  ]);
  assert.equal(updated.revision, 2);
  assert.equal(updated.rules[1].unit, '°C');
  assert.equal(updated.rules[1].direction, 'above');
  assert.throws(() => edit(1, [{ op: 'remove-rule', id: thresholdAlias }]), /draft changed/);
  const compare = () => f.call({ command: 'compare', draft: created.id, revision: 2 }).comparison;
  const diff = compare();
  assert.equal(diff.baseCurrent, true);
  assert.equal(diff.changeCount, 2);
  assert.deepEqual(diff.rules.map(({ change, fields }) => [change, fields]), [['updated', ['limit', 'holdSeconds']], ['added', []]]);
  assert.doesNotMatch(JSON.stringify([created, updated, diff]), secret);
  assert.deepEqual(f.snapshotBytes(), actual);
  assert.equal(f.thresholds.snapshot().rules[0].limit, threshold.limit);
  f.saveRules([{ ...threshold, limit: 80 }]);
  assert.equal(compare().baseCurrent, false);
  fs.writeFileSync(f.thresholdFile, '{broken');
  assert.equal(compare().baseCurrent, null);
  assert.throws(() => f.call({ command: 'create', target: 'thresholds', source: 'active' }), /configuration is unavailable/);
  const blank = f.call({ command: 'create', target: 'thresholds', source: 'empty' });
  assert.deepEqual(blank.rules, []);
});

test('watchlist drafts preserve ordered pins, use only configured service aliases and never poll providers', async (t) => {
  const f = fixture(t);
  const actual = f.snapshotBytes();
  const ordinary = await readTelemetry(telemetryParams({ section: 'services' }), { services: () => ({ checks: [configured] }) });
  assert.equal(ordinary.services[0].id, serviceAlias);
  const draft = f.call({ command: 'create', target: 'watchlist', source: 'active' });
  assert.deepEqual(draft.pins, [{ id: 'hardware:cpu', kind: 'hardware', configured: true },
    { id: orphanAlias, kind: 'service', configured: false }]);
  const edit = (revision, pins) => f.call({ command: 'edit', draft: draft.id, revision, edits: [{ op: 'set-pins', pins }] });
  assert.throws(() => edit(1, ['service:private_check']), /unavailable/);
  assert.throws(() => edit(1, ['hardware:cpu', 'hardware:cpu']), /different watchlist pins/);
  assert.throws(() => edit(1, ['app:docker', 'hardware:cpu', 'hardware:ram', 'hardware:gpu', 'hardware:cpuTemp', 'hardware:gpuTemp', serviceAlias]), /up to 6/);
  const proposed = edit(1, [serviceAlias, 'app:docker', 'hardware:cpu', orphanAlias]);
  assert.deepEqual(proposed.pins.map(({ id, configured }) => [id, configured]), [[serviceAlias, true], ['app:docker', true], ['hardware:cpu', true], [orphanAlias, false]]);
  const preview = () => f.call({ command: 'preview', draft: draft.id, revision: 2 });
  const compare = () => f.call({ command: 'compare', draft: draft.id, revision: 2 }).comparison;
  assert.deepEqual(compare(), { baseCurrent: true, changeCount: 4,
    pins: { before: ['hardware:cpu', orphanAlias], after: [serviceAlias, 'app:docker', 'hardware:cpu', orphanAlias] } });
  assert.deepEqual(f.snapshotBytes(), actual);
  assert.doesNotMatch(JSON.stringify([ordinary, proposed, preview(), compare()]), secret);
  f.setServices({ error: 'private host details', checks: [configured] });
  assert.equal(preview().pins[0].configured, null);
  f.setServices({ checks: [] });
  assert.equal(preview().pins[0].configured, false);
  const empty = f.call({ command: 'create', target: 'watchlist', source: 'empty' });
  assert.throws(() => f.call({ command: 'edit', draft: empty.id, revision: 1, edits: [{ op: 'set-pins', pins: [serviceAlias] }] }), /unavailable/);
  f.watchlist.change({ action: 'pin', id: 'hardware:gpu', pinned: true });
  assert.equal(compare().baseCurrent, false);
  assert.equal(f.call({ command: 'discard', draft: draft.id, revision: 2 }).discarded, true);
  assert.throws(preview, /draft is unavailable/);
});

test('monitoring drafts require both scopes and cannot cross an owner, activity or draft family', async (t) => {
  const f = fixture(t);
  const actual = f.snapshotBytes();
  const protect = process.platform === 'win32' ? undefined : () => ({ protect: (bytes) => Buffer.from(bytes), unprotect: (bytes) => Buffer.from(bytes) });
  const access = new AgentAccess(path.join(f.directory, 'grants.json'), { protect });
  const grants = [['drafts', 'telemetry'], ['drafts', 'telemetry'], ['drafts'], ['telemetry']];
  access.setEnabled(true);
  const credentials = grants.map((scopes) => access.grant(scopes, 'work'));
  const address = process.platform === 'win32' ? undefined : () => path.join(f.directory, 'fixture.sock');
  let activity = 'work';
  const history = new ActionHistory();
  const service = new AgentService(access, { history, address, profile: () => activity,
    readers: { monitoring_draft: (params, client) => f.monitoring.change(client.id, activity, params) } });
  t.after(() => service.stop());
  service.setLocked(false);
  await once(service.server, 'listening');
  const links = await Promise.all(credentials.map((credential) => connectAgent(credential, { address, protect })));
  t.after(() => links.forEach((link) => link.close()));
  const [owner, peer, draftOnly, telemetryOnly] = links;
  const options = { command: 'create', target: 'thresholds', source: 'active' };
  for (const conn of [draftOnly, telemetryOnly]) assert.equal((await conn.call('monitoring_draft', options)).ok, false);
  const created = await owner.call('monitoring_draft', options);
  assert.equal(created.ok, true);
  const read = { command: 'inspect', draft: created.data.id };
  assert.equal((await peer.call('monitoring_draft', read)).ok, false);
  assert.equal((await owner.call('monitoring_draft', { ...read, command: 'apply' })).ok, false);
  assert.throws(() => f.drafts.resolve(parseCredential(credentials[0]).client, activity, created.data.id), /draft is unavailable/);
  activity = 'other';
  assert.equal((await owner.call('monitoring_draft', read)).ok, false);
  assert.doesNotMatch(JSON.stringify(history.snapshot()), secret);
  assert.deepEqual(f.snapshotBytes(), actual);
});
