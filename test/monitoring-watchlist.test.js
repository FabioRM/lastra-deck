'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { MonitoringWatchlist } = require('../src/main/monitoring-watchlist');
const { tempDir } = require('./helpers/temp-dir');

function fixture(t) {
  const directory = tempDir(t, 'lastra-watchlist-');
  const file = path.join(directory, 'watchlist.json');
  let now = 0;
  let checks = [{ id: 'test', name: 'Example service', status: 'up', latest: { at: 123, latencyMs: 20, detail: 'private' } }];
  const calls = { resources: 0, docker: 0 };
  const providers = {
    serviceHealth: () => ({ checks }),
    resources() {
      calls.resources++;
      return { rows: [{ id: 'electron', cpuPercent: .5, cpuStatus: 'ready', workingSetMiB: 200 }] };
    },
    async docker() {
      calls.docker++;
      return { status: 'ready', containers: [{ state: 'running' }, { state: 'exited' }], total: 2 };
    },
    resourceInterval: () => 5_000,
    now: () => now,
  };
  return { watchlist: new MonitoringWatchlist(file, providers), file, providers, calls,
    time: (next) => { now = next; }, replaceChecks: (next) => { checks = next; } };
}

test('watchlists only read expensive pinned providers, route existing service checks and respect the resource interval', async (t) => {
  const { watchlist, calls, time } = fixture(t);
  const initial = await watchlist.snapshot();
  assert.deepEqual(initial.tiles.map(({ id }) => id), ['hardware:cpu', 'hardware:ram', 'hardware:gpu']);
  assert.deepEqual(calls, { resources: 0, docker: 0 });
  const pin = (id) => watchlist.change({ action: 'pin', id, pinned: true });
  pin('service:test');
  pin('app:lastra-cpu');
  pin('app:docker');
  assert.throws(() => pin('hardware:cpuTemp'), /up to 6/);
  let view = await watchlist.snapshot();
  assert.deepEqual(view.tiles.at(-3), {
    id: 'service:test', kind: 'service', label: 'Example service', view: 'service-health', target: 'test',
    state: 'up', latencyMs: 20, sampledAt: 123,
  });
  assert.equal(view.tiles.at(-2).value, .5);
  assert.equal(view.tiles.at(-1).value, 1);
  time(3000);
  await watchlist.snapshot();
  assert.deepEqual(calls, { resources: 1, docker: 2 });
  time(6000);
  view = await watchlist.snapshot();
  assert.deepEqual(calls, { resources: 2, docker: 3 });
});

test('watchlist pins persist and removed source tiles can still be removed', async (t) => {
  const { watchlist, file, providers, replaceChecks } = fixture(t);
  assert.throws(() => watchlist.change({ action: 'pin', id: 'service:missing', pinned: true }), /unavailable/);
  assert.throws(() => watchlist.change({ action: 'pin', id: 'app:unknown', pinned: true }), /Invalid/);
  watchlist.change({ action: 'pin', id: 'service:test', pinned: true });
  replaceChecks([]);
  const reopened = new MonitoringWatchlist(file, providers);
  assert.equal((await reopened.snapshot()).tiles.at(-1).label, 'Removed service check');
  reopened.change({ action: 'pin', id: 'service:test', pinned: false });
  assert.equal((await reopened.snapshot()).tiles.length, 3);
});
