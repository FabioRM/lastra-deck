'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');
const { PrometheusView, normalizePrometheus, queryResult } = require('../src/main/app-view-prometheus');
const { deckRequestAllowed } = require('../src/main/deck-view-only');
const { tempDir } = require('./helpers/temp-dir');

const sample = (value = '2.5') => ({ status: 'success',
  data: { resultType: 'vector', result: [{ metric: { instance: 'provider-secret-host', job: 'provider-secret-job' }, value: [1_800_000_000, value] }] } });
const success = (value) => Response.json(sample(value));

function config(url = 'https://prometheus.example/prom') {
  return { version: 1, intervalSeconds: 10, sources: [{
    id: 'fixture', name: 'Example monitoring', url, dashboard: 'https://dashboard.example/d/fixture?orgId=1',
    metrics: [{ id: 'availability', name: 'Available components', host: 'Example host', service: 'Example service',
      query: 'sum(up{job="fixture"})', unit: '%' }],
  }] };
}

function fileFixture(t) {
  const dir = tempDir(t, 'lastra-prometheus-fixture-');
  const file = path.join(dir, 'prometheus.json');
  return { file, write: (value) => fs.writeFileSync(file, JSON.stringify(value)) };
}

test('reads only the configured instant-query endpoint and keeps provider labels out of the deck projection', async (t) => {
  const observed = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    observed.push({ method: request.method, path: request.url, type: request.headers['content-type'], body: Buffer.concat(chunks).toString() });
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(sample('2.5')));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const { file, write } = fileFixture(t);
  const view = new PrometheusView(file);
  assert.deepEqual(await view.snapshot(), { status: 'disabled' });
  assert.deepEqual(observed, []);
  write(config(`http://127.0.0.1:${server.address().port}/prom`));
  const [first, shared] = await Promise.all([view.snapshot(), view.snapshot()]);
  assert.equal(first, shared);
  assert.deepEqual(first.sources[0].metrics.map(({ name, host, service, value, unit, status }) =>
    ({ name, host, service, value, unit, status })), [
    { name: 'Available components', host: 'Example host', service: 'Example service', value: 2.5, unit: '%', status: 'ready' },
  ]);
  assert.doesNotMatch(JSON.stringify(first), /provider-secret|127\.0\.0\.1|dashboard\.example|sum\(up/);
  assert.equal((await view.snapshot()), first);
  assert.equal(observed.length, 1);
  assert.equal(observed[0].method, 'POST');
  assert.equal(observed[0].path, '/prom/api/v1/query');
  assert.match(observed[0].type, /^application\/x-www-form-urlencoded/);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(observed[0].body)), { query: 'sum(up{job="fixture"})', timeout: '3s', limit: '2' });
});

test('credential changes invalidate cache and authentication errors never expose previous readings or provider text', async (t) => {
  const { file, write } = fileFixture(t);
  const settings = config();
  settings.sources[0].bearerEnv = 'LASTRA_PROMETHEUS_FIXTURE_TOKEN';
  write(settings);
  const calls = [];
  const env = {};
  let now = 100;
  let ok = true;
  const view = new PrometheusView(file, { env, now: () => now,
    fetcher: async (url, init) => {
      calls.push({ url, ...init });
      return ok ? success('4') : Response.json({ error: 'secret error detail' }, { status: 401 });
    },
  });
  const read = async () => (await view.snapshot()).sources[0].metrics[0];
  assert.equal((await read()).status, 'authentication');
  assert.equal(calls.length, 0);
  env.LASTRA_PROMETHEUS_FIXTURE_TOKEN = 'bearer-first.fixture';
  assert.equal((await read()).value, 4);
  assert.equal(calls[0].redirect, 'error');
  assert.equal(calls[0].headers.Authorization, 'Bearer bearer-first.fixture');
  env.LASTRA_PROMETHEUS_FIXTURE_TOKEN = 'bearer-replaced.fixture';
  ok = false;
  const result = await read();
  assert.equal(result.status, 'authentication');
  assert.equal(result.value, undefined);
  assert.equal(calls[1].headers.Authorization, 'Bearer bearer-replaced.fixture');
  assert.doesNotMatch(JSON.stringify(result), /secret error|bearer|LASTRA_PROMETHEUS/);
  now += 10_001;
  assert.equal((await read()).status, 'authentication');
});

test('keeps a recent reading during a temporary provider failure, then expires and clears it safely', async (t) => {
  const { file, write } = fileFixture(t);
  write(config());
  let now = 20;
  let response = () => success('7');
  const view = new PrometheusView(file, { now: () => now, fetcher: async () => response() });
  const metric = async () => (await view.snapshot()).sources[0].metrics[0];
  assert.equal((await metric()).value, 7);
  response = () => Response.json({ error: 'private error' }, { status: 503 });
  now += 10_001;
  assert.equal((await metric()).status, 'cached');
  assert.equal((await metric()).value, 7);
  assert.equal((await metric()).updatedAt, 20);
  now += 25_000;
  assert.equal((await metric()).status, 'unavailable');
  assert.equal((await metric()).value, undefined);
  response = () => new Response('a'.repeat(140 * 1024), { status: 200 });
  now += 10_001;
  assert.equal((await metric()).status, 'unavailable');
  response = () => Response.json({ status: 'success', data: { resultType: 'vector', result: [] } });
  now += 10_001;
  assert.equal((await metric()).status, 'empty');
});

test('stops queued queries when hidden and does not publish a replaced configuration', async (t) => {
  const { file, write } = fileFixture(t);
  const original = config();
  const first = original.sources[0].metrics[0];
  original.sources[0].metrics = [first, { ...first, id: 'second' }, { ...first, id: 'third' }];
  write(original);
  const pending = [];
  let canRead = true;
  const view = new PrometheusView(file, { canRead: () => canRead, fetcher: (_url, { signal }) => new Promise((resolve, reject) => {
    pending.push({ resolve, signal });
    signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
  }) });
  const open = view.snapshot();
  assert.equal(pending.length, 2);
  assert.deepEqual(await view.change({ action: 'stop' }), { ok: true });
  assert.equal(pending[0].signal.aborted, true);
  assert.equal((await open).status, 'loading');
  assert.equal(pending.length, 2);
  canRead = false;
  assert.equal((await view.snapshot()).status, 'unavailable');
  assert.equal(pending.length, 2);
  canRead = true;
  write(config());
  const superseded = view.snapshot();
  const replacement = config();
  replacement.sources[0].metrics[0].query = 'replacement_query';
  write(replacement);
  pending[2].resolve(success('8'));
  assert.equal((await superseded).status, 'loading');
  const fresh = view.snapshot();
  pending[3].resolve(success('9'));
  assert.equal((await fresh).sources[0].metrics[0].value, 9);
});

test('a configured dashboard is opened only on a matching revision, without exposing its URL', async (t) => {
  const { file, write } = fileFixture(t);
  const opened = [];
  const view = new PrometheusView(file, { fetcher: async () => success(), openExternal: async (url) => opened.push(url) });
  const settings = config();
  write(settings);
  const [source] = (await view.snapshot()).sources;
  assert.equal(source.dashboard, undefined);
  assert.equal(source.dashboardRevision.length, 24);
  assert.deepEqual(opened, []);
  const action = { action: 'open-dashboard', id: source.id, revision: source.dashboardRevision };
  settings.sources[0].dashboard = 'https://dashboard.example/d/replaced';
  write(settings);
  await assert.rejects(view.change(action), /link changed/);
  assert.deepEqual(opened, []);
  action.revision = (await view.snapshot()).sources[0].dashboardRevision;
  assert.deepEqual(await view.change(action), { ok: true });
  assert.deepEqual(opened, [settings.sources[0].dashboard]);
  assert.equal(deckRequestAllowed('app-views:data'), true);
  const base = { type: 'provider', viewId: 'prometheus' };
  assert.equal(deckRequestAllowed('app-views:change', { ...base, action: 'stop' }), true);
  assert.equal(deckRequestAllowed('app-views:change', { ...base, action: 'open-dashboard' }), false);
});

test('validates sources and accepts only a finite numeric scalar or a single-series vector', () => {
  for (const url of ['file:///private', 'http://prometheus.example/', 'https://secret@prometheus.example/', 'https://prometheus.example/?token=sensitive']) {
    assert.throws(() => normalizePrometheus(config(url)));
  }
  for (const dashboard of ['javascript:void(0)', 'https://other.example/?api_key=secret', 'https://other.example/#access_token=secret']) {
    const settings = config();
    settings.sources[0].dashboard = dashboard;
    assert.throws(() => normalizePrometheus(settings));
  }
  assert.deepEqual(queryResult({ status: 'success', data: { resultType: 'scalar', result: [1_800_000_000, '-2e-5'] } }), { status: 'ready', value: -0.00002 });
  for (const invalid of ['NaN', '+Inf', '0x10']) assert.equal(queryResult(sample(invalid)).status, 'invalid-result');
  const multi = sample();
  multi.data.result.push(multi.data.result[0]);
  assert.equal(queryResult(multi).status, 'multiple-series');
});
