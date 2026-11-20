'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');
const tls = require('node:tls');
const { X509Certificate } = require('node:crypto');
const { once } = require('node:events');
const { setTimeout: wait } = require('node:timers/promises');
const { test } = require('node:test');
const { normalizeChecks, probe } = require('../src/main/service-probes');
const { certificateProbe, heartbeatProbe } = require('../src/main/service-deadlines');
const { ServiceHealth } = require('../src/main/service-health');
const { AlertInbox } = require('../src/main/alert-inbox');
const { NavigationBadges } = require('../src/main/navigation-badges');
const { readTelemetry, telemetryParams } = require('../src/main/mcp-telemetry');
const { tempDir } = require('./helpers/temp-dir');

// Localhost-only synthetic TLS fixture. The test trusts it through a per-connection CA.
const cert = fs.readFileSync(path.join(__dirname, 'fixtures', 'service-deadlines-cert.pem'));
const key = fs.readFileSync(path.join(__dirname, 'fixtures', 'service-deadlines-key.pem'));
const expiry = Date.parse(new X509Certificate(cert).validTo);
const config = (checks) => ({ version: 1, checks });
const certificate = { id: 'tls', name: 'Fixture certificate', kind: 'certificate', target: 'https://127.0.0.1/' };
const heartbeat = (target) => ({ id: 'job', name: 'Fixture job', kind: 'heartbeat', target, intervalSeconds: 10, maxAgeSeconds: 10 });

function directory(t) {
  const dir = tempDir(t, 'lastra-deadlines-');
  return dir;
}

test('deadline checks require explicit HTTPS or a local file and validate only their own fields', (t) => {
  const target = path.join(directory(t), 'heartbeat.ok');
  const [tlsCheck, heartbeatCheck] = normalizeChecks(config([certificate, heartbeat(target)]));
  assert.equal(tlsCheck.warningDays, 30);
  assert.equal(heartbeatCheck.target, target);
  assert.equal(heartbeatCheck.maxAgeSeconds, 10);
  assert.throws(() => normalizeChecks(config([{ ...certificate, target: 'http://127.0.0.1/' }])), /require an HTTPS/);
  assert.throws(() => normalizeChecks(config([{ ...certificate, rejectUnauthorized: false }])), /unrecognised/);
  assert.throws(() => normalizeChecks(config([{ ...certificate, warningDays: 0 }])), /warning days/);
  assert.throws(() => normalizeChecks(config([heartbeat('relative.ok')])), /absolute local file path/);
  assert.throws(() => normalizeChecks(config([heartbeat('//other.example/fixture.ok')])), /absolute local file path/);
  assert.throws(() => normalizeChecks(config([{ ...heartbeat(target), maxAgeSeconds: 1 }])), /maximum age/);
});

test('certificate checks use the verified TLS peer and never issue an HTTP request', async (t) => {
  const requests = [];
  const server = https.createServer({ key, cert }, (request, response) => { requests.push(request.method); response.end(); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const target = `https://127.0.0.1:${server.address().port}/private`;
  const [check] = normalizeChecks(config([{ ...certificate, target, warningDays: 7 }]));
  const { signal } = new AbortController();
  const connect = (options) => {
    assert.equal(options.rejectUnauthorized, true);
    return tls.connect({ ...options, ca: cert });
  };
  const valid = await certificateProbe(check, signal, { connect, now: () => expiry - 8 * 86_400_000 });
  assert.deepEqual(valid, { ok: true, detail: 'HTTPS certificate is valid', timing: { kind: 'certificate', expiresAt: expiry } });
  const near = await certificateProbe(check, signal, { connect, now: () => expiry - 7 * 86_400_000 });
  assert.deepEqual(near, { ok: false, detail: 'HTTPS certificate expires soon', timing: valid.timing });
  const untrusted = await probe(check, signal);
  assert.deepEqual([untrusted.ok, untrusted.detail, untrusted.timing], [false, 'HTTPS certificate could not be verified', undefined]);
  const wrongHost = await certificateProbe(check, signal, { connect: (options) => connect({ ...options, servername: 'mismatch.invalid' }) });
  assert.deepEqual(wrongHost, { ok: false, detail: 'HTTPS hostname does not match the certificate' });
  assert.deepEqual(requests, []);
});

test('a stalled TLS handshake stops at the existing check timeout', async (t) => {
  const sockets = new Set();
  const server = net.createServer((socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { for (const socket of sockets) socket.destroy(); server.close(); });
  const [check] = normalizeChecks(config([{ ...certificate, target: `https://127.0.0.1:${server.address().port}`, timeoutMs: 250 }]));
  assert.deepEqual(await probe(check, new AbortController().signal), { ok: false, detail: 'Timed out' });
});

test('heartbeat uses only file timestamps and marks an exact deadline as missed', async (t) => {
  const target = path.join(directory(t), 'heartbeat.ok');
  const [check] = normalizeChecks(config([heartbeat(target)]));
  const { signal } = new AbortController();
  const now = Date.UTC(2030, 0, 1);
  assert.deepEqual(await heartbeatProbe(check, signal, { now: () => now }), { ok: false, detail: 'Heartbeat file is missing' });
  fs.writeFileSync(target, 'Fixture contents never read or returned');
  fs.utimesSync(target, new Date(now), new Date(now));
  const timing = { kind: 'heartbeat', heartbeatAt: now, deadlineAt: now + 10_000 };
  assert.deepEqual(await heartbeatProbe(check, signal, { now: () => now + 9_999 }), { ok: true, detail: 'Heartbeat is current', timing });
  assert.deepEqual(await heartbeatProbe(check, signal, { now: () => now + 10_000 }), { ok: false, detail: 'Heartbeat deadline missed', timing });
  assert.deepEqual(await heartbeatProbe(check, signal, { now: () => now - 1 }), {
    ok: false, detail: 'Heartbeat timestamp is unavailable or in the future',
  });
  const directoryCheck = { ...check, target: path.dirname(target) };
  assert.deepEqual(await heartbeatProbe(directoryCheck, signal), { ok: false, detail: 'Heartbeat requires a regular file' });
});

test('last success and last-observed deadlines survive failed reads and share alert and badge state', async (t) => {
  const dir = directory(t);
  const target = path.join(dir, 'private-heartbeat.ok');
  const checks = path.join(dir, 'checks.json');
  const start = Date.UTC(2030, 0, 1);
  let now = start;
  const pulse = () => { fs.writeFileSync(target, 'fixture payload'); fs.utimesSync(target, new Date(now), new Date(now)); };
  pulse();
  fs.writeFileSync(checks, JSON.stringify(config([heartbeat(target)])));
  const inbox = new AlertInbox(path.join(dir, 'alerts.json'), { now: () => now });
  const service = new ServiceHealth(checks, { now: () => now, check: (entry, signal) => heartbeatProbe(entry, signal, { now: () => now }),
    onResult(entry, state, result) {
      if (state === 'up' || state === 'down') inbox.update({ id: 'service:job', name: entry.name, viewId: 'service-health',
        targetId: entry.id, source: 'Service health' }, state === 'down' ? 'active' : 'recovered', result.detail);
    },
  });
  t.after(() => service.stop());
  const badges = new NavigationBadges({ now: () => now, serviceChecks: () => service.badgeChecks(), timerCount: () => 0,
    alertCount: () => inbox.unacknowledgedCount() });
  service.start();
  async function sample(expected) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const entry = service.snapshot().checks[0];
      if (entry.latest?.at === now && entry.status === expected) return entry;
      await wait(10);
    }
    assert.fail(`Expected the service check to be ${expected}`);
  }
  assert.equal((await sample('up')).lastSuccessfulAt, start);
  now += 10_000;
  service.schedule();
  await sample('retrying');
  assert.deepEqual(inbox.snapshot().entries, []);
  now += 10_000;
  service.schedule();
  const missed = await sample('down');
  assert.deepEqual(missed.timing, { kind: 'heartbeat', heartbeatAt: start, deadlineAt: start + 10_000, observedAt: now, stale: false });
  assert.equal(missed.lastSuccessfulAt, start);
  assert.equal(inbox.snapshot().entries[0].status, 'active');
  assert.equal(badges.snapshot().services.count, 1);
  fs.unlinkSync(target);
  now += 10_000;
  service.schedule();
  const missing = await sample('down');
  assert.equal(missing.timing.stale, true);
  assert.equal(missing.timing.observedAt, now - 10_000);
  assert.doesNotMatch(JSON.stringify(service.snapshot()), /private-heartbeat|fixture payload/);
  now += 10_000;
  pulse();
  service.schedule();
  const recovered = await sample('up');
  assert.equal(recovered.lastSuccessfulAt, now);
  assert.equal(recovered.timing.deadlineAt, now + 10_000);
  assert.equal(recovered.timing.stale, false);
  assert.equal(inbox.snapshot().entries[0].status, 'recovered');
  assert.equal(badges.snapshot().services.count, 0);
});

test('scoped MCP service summaries expose the check kind and existing status without target or deadline data', async () => {
  const clock = () => 100_000;
  const checks = [certificate, heartbeat('private-fixture')].map((item) => ({ ...item, status: 'down',
    timing: { expiresAt: 500_000, deadlineAt: 90_000 }, lastSuccessfulAt: 80_000,
    latest: { at: 99_000, detail: 'private-fixture' }, history: [], intervalMs: 30_000 }));
  const result = await readTelemetry(telemetryParams({ section: 'services' }), { services: () => ({ checks }) }, clock);
  assert.deepEqual(result.services.map(({ kind, status }) => [kind, status]), [['certificate', 'down'], ['heartbeat', 'down']]);
  assert.doesNotMatch(JSON.stringify(result), /target|deadline|private|expires|successful|127\.0\.0\.1/i);
});
