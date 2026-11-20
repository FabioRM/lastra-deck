'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { IncidentTimeline, grafanaBase, grafanaLink } = require('../src/main/incident-timeline');
const { deckRequestAllowed } = require('../src/main/deck-view-only');
const { chartRange, inRange, markerColumns } = require('../src/renderer/stats-timeline');
const { tempDir } = require('./helpers/temp-dir');

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;
const CHECK = { id: 'build', name: 'Build runner', kind: 'http', target: 'https://internal.example/private', expectedStatus: 204 };

function localFile(t) {
  const dir = tempDir(t, 'lastra-incidents-');
  return path.join(dir, 'incident-timeline.json');
}

test('confirmed service transitions survive restart without storing destinations or probe data', (t) => {
  const file = localFile(t);
  let now = NOW;
  const observed = [];
  let timeline = new IncidentTimeline(file, { now: () => now, onChange: (state) => observed.push(state) });
  timeline.observe(CHECK, 'up');
  timeline.observe(CHECK, 'retrying');
  assert.equal(fs.existsSync(file), false);
  timeline.observe(CHECK, 'down');
  timeline.observe(CHECK, 'down');
  assert.equal(observed.length, 1);
  assert.equal(observed[0].events[0].label, 'Build runner');
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /internal\.example|private/);
  timeline = new IncidentTimeline(file, { now: () => now });
  timeline.observe(CHECK, 'down');
  now += 5000;
  timeline.observe(CHECK, 'up');
  timeline.observe(CHECK, 'up');
  assert.deepEqual(timeline.snapshot().events.map(({ kind, at }) => [kind, at]), [
    ['service-down', NOW], ['service-recovered', NOW + 5000],
  ]);
});

test('reconfigured and removed service checks do not create unrelated recovery markers', (t) => {
  const timeline = new IncidentTimeline(localFile(t), { now: () => NOW });
  timeline.observe(CHECK, 'down');
  timeline.observe({ ...CHECK, target: 'https://different.example' }, 'up');
  timeline.observe(CHECK, 'down');
  timeline.retainChecks([]);
  timeline.observe(CHECK, 'up');
  assert.deepEqual(timeline.snapshot().events.map(({ kind }) => kind), ['service-down', 'service-down']);
});

test('timeline bounds event retention and preserves a broken file', async (t) => {
  const file = localFile(t);
  const event = (id, at) => ({
    id: `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`, kind: 'launch', label: String(id), at,
  });
  fs.writeFileSync(file, JSON.stringify({ version: 1, events: [
    event(500, NOW - 7 * DAY - 1), ...Array.from({ length: 255 }, (_, id) => event(id, NOW - 255 + id)),
  ], open: {}, dashboard: null }));
  let timeline = new IncidentTimeline(file, { now: () => NOW });
  assert.equal(timeline.snapshot().events.length, 255);
  for (const label of ['First deployment', 'Second deployment']) assert.equal((await timeline.request({ type: 'mark', kind: 'deployment', label })).ok, true);
  assert.equal(timeline.snapshot().events.length, 256);
  assert.equal(timeline.snapshot().events[0].label, '1');
  fs.writeFileSync(file, 'invalid');
  timeline = new IncidentTimeline(file, { now: () => NOW });
  assert.match((await timeline.request({ type: 'read' })).timeline.warning, /during this session/);
  timeline.observe(CHECK, 'down');
  assert.equal(timeline.snapshot().events.length, 1);
  assert.equal((await timeline.request({ type: 'mark', kind: 'launch', label: 'Authoring' })).ok, false);
  assert.equal(fs.readFileSync(file, 'utf8'), 'invalid');
});

test('only an explicit Grafana open request launches the precise range and retains dashboard filters', async (t) => {
  const file = localFile(t);
  let timeline = new IncidentTimeline(file, { now: () => NOW });
  const launched = [];
  const open = async (url) => { launched.push(new URL(url)); };
  const from = NOW - 3_600_000;
  const to = NOW;
  const base = 'https://grafana.example/d/fixture?orgId=4&from=now-6h&time=3600&time.window=2000&to=now&var-team=one&var-team=two#focus';
  assert.equal((await timeline.request({ type: 'mark', kind: 'launch', label: ' Authoring ' }, open)).timeline.events[0].label, 'Authoring');
  assert.equal((await timeline.request({ type: 'mark', kind: 'service-down', label: 'Cannot forge a probe' }, open)).ok, false);
  assert.equal((await timeline.request({ type: 'mark', kind: 'deployment', label: 'first\nsecond' }, open)).ok, false);
  assert.equal((await timeline.request({ type: 'open', range: { from, to } }, open)).ok, false);
  assert.equal((await timeline.request({ type: 'configure', url: base }, open)).ok, true);
  assert.deepEqual(launched, []);
  timeline = new IncidentTimeline(file, { now: () => NOW });
  assert.equal((await timeline.request({ type: 'open', range: { from, to } }, open)).ok, true);
  assert.equal(launched.length, 1);
  const [url] = launched;
  assert.equal(url.searchParams.get('from'), String(from));
  assert.equal(url.searchParams.get('to'), String(to));
  assert.equal(url.searchParams.has('time'), false);
  assert.equal(url.searchParams.has('time.window'), false);
  assert.equal(url.searchParams.get('orgId'), '4');
  assert.deepEqual(url.searchParams.getAll('var-team'), ['one', 'two']);
  assert.equal(url.hash, '#focus');
  assert.equal((await timeline.request({ type: 'open', range: { from, to }, url: 'https://other.example/path' }, open)).ok, true);
  assert.equal(launched[1].hostname, 'grafana.example');
  assert.equal((await timeline.request({ type: 'configure', url: '' }, open)).timeline.dashboard, null);
});

test('external links have bounded absolute ranges and use an HTTPS or loopback HTTP dashboard', () => {
  for (const url of ['file:///example', 'javascript:alert(0)', 'http://localhost.example/d/', 'http://localhost@remote.example/d/', 'http://127.1.example/d/',
    'https://admin:secret@grafana.example/d/', 'https://grafana.example/d/?access_token=secret', 'https://grafana.example/d/?%74oken=secret']) {
    assert.throws(() => grafanaBase(url), /without credentials/, url);
  }
  for (const url of ['http://localhost:3000/d/fixture', 'http://127.12.0.1:3000/d/fixture', 'http://[::1]:3000/d/fixture']) {
    assert.equal(grafanaBase(url), url);
  }
  const url = 'https://grafana.example/d/fixture';
  for (const range of [{ from: '-1', to: NOW }, { from: NOW, to: NOW }, { from: NOW - DAY - 1, to: NOW },
    { from: NOW - 60_000, to: Infinity }, { from: NOW - 20, to: NOW, variable: 'free' }]) {
    assert.throws(() => grafanaLink(url, range), /time range/);
  }
  assert.equal(new URL(grafanaLink(url, { from: NOW - DAY, to: NOW })).searchParams.get('from'), String(NOW - DAY));
  assert.equal(deckRequestAllowed('stats:incidents', { type: 'read' }), true);
  for (const type of ['mark', 'configure', 'open']) assert.equal(deckRequestAllowed('stats:incidents', { type }), false);
});

test('chart markers align to the same x scale and ignore entries outside the active range', () => {
  const minute = chartRange(NOW);
  const hour = chartRange(NOW, 3_600_000);
  const items = [
    { kind: 'deployment', at: hour.from },
    { kind: 'launch', at: minute.from - 1 },
    { kind: 'launch', at: minute.from },
    { kind: 'deployment', at: NOW - 30_000 },
    { kind: 'service-down', at: NOW - 30_000 },
    { kind: 'service-recovered', at: NOW },
    { kind: 'deployment', at: NOW + 1 },
  ];
  const events = inRange(items, minute);
  assert.equal(events.length, 4);
  assert.deepEqual(markerColumns(events, minute), [
    { x: 2, kind: 'launch' }, { x: 75, kind: 'service-down' }, { x: 148, kind: 'service-recovered' },
  ]);
  assert.equal(inRange(items, hour).length, 6);
  assert.equal(markerColumns(inRange(items, hour), hour)[0].x, 2);
});
