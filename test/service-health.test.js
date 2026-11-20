'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');
const { setImmediate: settle } = require('node:timers/promises');
const { test } = require('node:test');
const { normalizeChecks, probe } = require('../src/main/service-probes');
const { ServiceHealth } = require('../src/main/service-health');
const { disposeSharedPowerShell } = require('../src/main/powershell-worker');
const { tempDir } = require('./helpers/temp-dir');

const check = { id: 'test', name: 'Example service', kind: 'http', target: 'http://127.0.0.1:8080/', intervalSeconds: 10 };
const configuration = (checks) => ({ version: 1, checks });
const write = (file, checks) => fs.writeFileSync(file, JSON.stringify(configuration(checks)));

test('service targets and thresholds are bounded and invalid settings identify the check', () => {
  const [tcp, dns] = normalizeChecks(configuration([
    { ...check, kind: 'tcp', target: '::1', port: 443 },
    { id: 'dns', name: 'DNS', kind: 'dns', target: 'bücher.example', record: 'AAAA' },
  ]));
  assert.equal(tcp.target, '::1');
  assert.equal(dns.target, 'xn--bcher-kva.example');
  assert.equal(tcp.failureThreshold, 2);
  assert.throws(() => normalizeChecks(configuration([{ ...check, failureThreshold: 1 }])), /Check 1.*Consecutive failures/);
  assert.throws(() => normalizeChecks(configuration([{ ...check, target: 'https://name:secret@example.test' }])), /without credentials/);
  assert.throws(() => normalizeChecks(configuration([{ ...check, kind: 'ping', target: '-n' }])), /host name/);
  assert.throws(() => normalizeChecks(configuration([check, check])), /Check 2.*unique/);
});

test('HTTP status and TCP checks work against a loopback fixture without following redirects', async (t) => {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push([req.method, req.url]);
    res.writeHead(302, { Location: '/final' });
    res.end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const port = server.address().port;
  const [httpCheck, tcpCheck] = normalizeChecks(configuration([
    { ...check, target: `http://127.0.0.1:${port}/status`, expectedStatus: 204 },
    { ...check, id: 'tcp', kind: 'tcp', target: '127.0.0.1', port },
  ]));
  const { signal } = new AbortController();
  const result = await probe(httpCheck, signal);
  assert.equal(result.ok, false);
  assert.equal(result.detail, 'HTTP 302');
  assert.deepEqual(requests, [['HEAD', '/status']]);
  assert.equal((await probe(tcpCheck, signal)).ok, true);
});

test('the Windows ping probe recognizes a loopback echo', { skip: process.platform !== 'win32' }, async (t) => {
  t.after(disposeSharedPowerShell);
  const [entry] = normalizeChecks(configuration([{ ...check, kind: 'ping', target: '127.0.0.1', timeoutMs: 8_000 }]));
  const result = await probe(entry, new AbortController().signal);
  assert.equal(result.ok, true, result.detail);
});

test('service health waits for consecutive failures, recovers, and retains active checks after a malformed save', async (t) => {
  let monitor;
  t.after(() => monitor?.stop());
  const dir = tempDir(t, 'lastra-service-test-');
  const file = path.join(dir, 'checks.json');
  write(file, [check]);
  const outcomes = [true, false, false, true];
  let now = 0;
  monitor = new ServiceHealth(file, { now: () => now, check: async () => ({ ok: outcomes.shift(), detail: 'Fixture' }) });
  monitor.start();
  await settle();
  const statuses = [monitor.snapshot().checks[0].status];
  for (let tick = 1; tick <= 3; tick++) {
    now = tick * 10_000;
    monitor.schedule();
    await settle();
    statuses.push(monitor.snapshot().checks[0].status);
  }
  assert.deepEqual(statuses, ['up', 'retrying', 'down', 'up']);
  const before = monitor.snapshot().checks;
  assert.deepEqual(before[0].history.map(({ ok }) => ok), [true, false, false, true]);
  assert.equal(Object.hasOwn(before[0], 'target'), false);
  fs.writeFileSync(file, '{invalid');
  monitor.reload();
  assert.match(monitor.snapshot().error, /invalid JSON/);
  assert.deepEqual(monitor.snapshot().checks, before);
});

test('config replacement and shutdown cancel probes while keeping concurrency bounded', async (t) => {
  let monitor;
  t.after(() => monitor?.stop());
  const dir = tempDir(t, 'lastra-service-test-');
  const file = path.join(dir, 'checks.json');
  write(file, [check, ...['second', 'third', 'fourth'].map((id) => ({ ...check, id }))]);
  const started = [];
  monitor = new ServiceHealth(file, {
    check: (entry, signal) => new Promise((resolve) => {
      started.push([entry.id, signal]);
      signal.addEventListener('abort', () => resolve({ ok: false }), { once: true });
    }),
  });
  monitor.start();
  assert.deepEqual(started.map(([id]) => id), ['test', 'second', 'third']);
  write(file, [{ ...check, id: 'fourth' }]);
  monitor.reload();
  assert.ok(started.every(([, signal]) => signal.aborted));
  await settle();
  assert.equal(started.length, 4);
  assert.equal(started[3][0], 'fourth');
  monitor.stop();
  assert.ok(started[3][1].aborted);
});
