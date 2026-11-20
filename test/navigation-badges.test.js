'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setImmediate: settle } = require('node:timers/promises');
const { test } = require('node:test');
const { NavigationBadges, serviceBadge } = require('../src/main/navigation-badges');
const { AlertInbox } = require('../src/main/alert-inbox');
const { ProductionTimers } = require('../src/main/production-timers');
const { ServiceHealth } = require('../src/main/service-health');
const { badgeText } = require('../src/renderer/navigation-badges');
const { tempDir } = require('./helpers/temp-dir');

const check = { id: 'service', name: 'Fixture service', kind: 'http', target: 'https://fixture.invalid/private', intervalSeconds: 10 };
const alert = { id: 'service:service', name: 'Fixture alert', viewId: 'service-health', targetId: 'service', source: 'Service health' };
const ready = (count) => ({ status: 'ready', count });

test('navigation badges track read-only counts after real provider transitions', async (t) => {
  let health;
  let badges;
  t.after(() => { health?.stop(); badges?.stop(); });
  const dir = tempDir(t, 'lastra-navigation-counts-');
  const config = path.join(dir, 'checks.json');
  fs.writeFileSync(config, JSON.stringify({ version: 1, checks: [check] }));
  const updates = [];
  let now = 500;
  const inbox = new AlertInbox(path.join(dir, 'alerts.json'), { now: () => now, onChange: () => badges.refresh() });
  const timers = new ProductionTimers(path.join(dir, 'timers.json'), { now: () => now });
  health = new ServiceHealth(config, { now: () => now, check: async () => ({ ok: false, detail: 'Private failure' }),
    onResult: (_check, status) => { if (status === 'down') inbox.update(alert, 'active', 'Private failure'); },
    onUpdate: () => badges.refresh(),
  });
  badges = new NavigationBadges({ alertCount: () => inbox.unacknowledgedCount(), serviceChecks: () => health.badgeChecks(),
    timerCount: () => timers.activeCount(), now: () => now, onChange: (value) => updates.push(value) });
  health.start();
  assert.equal(badges.snapshot().services.status, 'warming');
  await settle();
  assert.deepEqual(badges.snapshot().services, ready(0));
  now += 10_000;
  health.schedule();
  await settle();
  assert.deepEqual(badges.snapshot(), { alerts: ready(1), services: ready(1), timers: ready(0) });
  const previous = updates.length;
  badges.refresh();
  assert.equal(updates.length, previous);
  inbox.change({ action: 'acknowledge', id: alert.id });
  assert.deepEqual(updates.at(-1), { alerts: ready(0), services: ready(1), timers: ready(0) });
  const issue = (type, extra) => timers.change({ type, revision: timers.revision, ...extra });
  issue('configure', { config: { version: 1, countdownSeconds: 1, segments: [{ name: 'Private segment', seconds: 1 }] } });
  issue('start-countdown');
  issue('start-rundown');
  badges.refresh();
  assert.deepEqual(updates.at(-1).timers, ready(2));
  now += 30_000;
  badges.refresh();
  assert.deepEqual(updates.at(-1), { alerts: ready(0), services: { status: 'stale', count: null }, timers: ready(2) });
  issue('advance-rundown');
  issue('reset-countdown');
  badges.refresh();
  assert.deepEqual(updates.at(-1).timers, ready(0));
  assert.doesNotMatch(JSON.stringify(updates), /fixture|private/iu);
});

test('missing, pending and stale check data have distinct projections and do not read as zero', () => {
  const checks = [{ status: 'down', at: 0, intervalMs: 10_000, timeoutMs: 1_000 }];
  const checkState = (checks, error = false) => ({ active: true, error, checks });
  assert.deepEqual(serviceBadge(checkState([]), 0).badge, { status: 'unconfigured', count: null });
  assert.deepEqual(serviceBadge(checkState([], true), 0).badge, { status: 'unavailable', count: null });
  assert.deepEqual(serviceBadge(checkState([...checks, { status: 'waiting' }]), 0), { badge: { status: 'warming', count: null }, expiresAt: 21_000 });
  assert.deepEqual(serviceBadge(checkState(checks), 20_999), { badge: ready(1), expiresAt: 21_000 });
  assert.deepEqual(serviceBadge(checkState(checks), 21_000).badge, { status: 'stale', count: null });
  assert.deepEqual(serviceBadge(checkState(checks, true), 0).badge, { status: 'stale', count: null });
  assert.deepEqual(serviceBadge(checkState(checks), -1).badge, { status: 'stale', count: null });
});

test('numeric and nonnumeric badge labels retain exact accessible descriptions', () => {
  assert.deepEqual(badgeText('alerts', ready(123)), { text: '99+', description: '123 unacknowledged alerts' });
  assert.deepEqual(badgeText('timers', ready(0)), { text: '', description: '0 active production timers' });
  assert.deepEqual(badgeText('services', ready(1)), { text: '1', description: '1 confirmed failed check' });
  assert.deepEqual(badgeText('services', { status: 'unconfigured' }), { text: '', description: 'No service checks configured' });
  assert.deepEqual(badgeText('services', { status: 'unavailable' }), { text: '?', description: 'Service check count unavailable' });
  assert.deepEqual(badgeText('services', { status: 'warming' }), { text: '…', description: 'Waiting for service checks' });
  assert.deepEqual(badgeText('services', { status: 'stale' }), { text: 'Stale', description: 'Service check readings are stale' });
});
