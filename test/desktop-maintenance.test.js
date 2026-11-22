'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SCOPES } = require('../src/main/mcp-access');
const { GRANT_SETS, TEMPORARY_GRANT_SETS } = require('../src/main/tray-menu');
const { readMaintenance, runMaintenance, grantChoice } = require('../src/main/desktop-maintenance');

test('agent grants stay inside the known scopes', () => {
  assert.equal(GRANT_SETS.length, 32);
  assert.equal(TEMPORARY_GRANT_SETS.length, 10);
  for (const scopes of [...GRANT_SETS, ...TEMPORARY_GRANT_SETS]) {
    assert.ok(scopes.length);
    for (const scope of scopes) assert.equal(typeof SCOPES[scope], 'string', scope);
  }
  assert.deepEqual(grantChoice('grant:0'), { scopes: ['layout'], temporary: false });
  assert.equal(grantChoice('grant:99'), null);
  assert.equal(grantChoice('temp:0')?.temporary, true);
});

function context() {
  const calls = [];
  const ctx = {
    platform: 'win32',
    monitoring: {
      historyHours: 0,
      setHistoryHours(hours) { this.historyHours = hours; calls.push(['history', hours]); },
      snapshot: () => ({ intervals: { resources: 2000 }, options: { resources: [2000, 5000] } }),
    },
    retainedTelemetry: { configure(hours) { calls.push(['retain', hours]); } },
    serviceHealth: { snapshot: () => ({ checks: [] }) },
    watchlist: {
      pins: [],
      options: () => [{ id: 'cpu', label: 'CPU' }],
      change(command) { calls.push(['watch', command]); this.pins = command.pinned ? [command.id] : []; },
    },
    updater: { status: () => ({ state: 'disabled', reason: 'not-packaged' }) },
    panelMeasurement: null,
    agent: null,
    setMonitoringInterval(source, intervalMs) { calls.push(['interval', source, intervalMs]); },
  };
  return { ctx, calls };
}

test('settings read the history, intervals and watchlist without a menu', async () => {
  const { ctx, calls } = context();
  const snapshot = readMaintenance(ctx);
  assert.equal(snapshot.historyHours, 0);
  assert.equal(snapshot.intervals[0].source, 'resources');
  assert.deepEqual(snapshot.watchlist, [{ id: 'cpu', label: 'CPU', pinned: false }]);
  assert.equal(snapshot.update.state, 'disabled');
  assert.equal(snapshot.agent, null);
  assert.equal(snapshot.measurement, false);
  await runMaintenance(ctx, { type: 'history', hours: 24 });
  await runMaintenance(ctx, { type: 'interval', source: 'resources', intervalMs: 5000 });
  const next = await runMaintenance(ctx, { type: 'watch', id: 'cpu', pinned: true });
  assert.equal(next.historyHours, 24);
  assert.equal(next.watchlist[0].pinned, true);
  assert.deepEqual(calls, [['history', 24], ['retain', 24], ['interval', 'resources', 5000], ['watch', { action: 'pin', id: 'cpu', pinned: true }]]);
  await assert.rejects(() => runMaintenance(ctx, { type: 'grant', id: 'grant:0' }), /Agent access is unavailable/);
  await assert.rejects(() => runMaintenance(ctx, { type: 'nope' }), /Invalid settings action/);
});
