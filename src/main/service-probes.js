// @ts-check
'use strict';

const net = require('node:net');
const { Resolver } = require('node:dns').promises;
const { domainToASCII } = require('node:url');
const { sharedPowerShell } = require('./powershell-worker');
const { heartbeatTarget, certificateProbe, heartbeatProbe } = require('./service-deadlines');

const SERVICE_KINDS = Object.freeze(['http', 'tcp', 'dns', 'ping', 'certificate', 'heartbeat']);
const PING_SCRIPT = '$ping = [System.Net.NetworkInformation.Ping]::new(); try { ' +
  '$result = $ping.Send($env:LASTRA_PING_HOST, [int]$env:LASTRA_PING_TIMEOUT); ' +
  "if ($result.Status -ne [System.Net.NetworkInformation.IPStatus]::Success) { throw 'No echo reply' } " +
  '} finally { $ping.Dispose() }';

function integer(value, min, max, field, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${field} must be between ${min} and ${max}`);
  return value;
}

function host(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || raw.length > 253 || /[\s/\\%?#@]/.test(raw)) throw new Error('Enter a host name or IP address');
  if (net.isIP(raw)) return raw;
  const ascii = domainToASCII(raw);
  const labels = ascii.replace(/\.$/, '').split('.');
  if (labels.some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))) {
    throw new Error('Enter a host name or IP address');
  }
  return ascii;
}

function httpTarget(value) {
  let url;
  try {
    url = typeof value === 'string' && value.length <= 2_048 ? new URL(value) : null;
  } catch {
    // Use the same validation message for a malformed URL and an unsupported scheme.
  }
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('Enter an HTTP or HTTPS URL without credentials or a fragment');
  }
  return url.href;
}

function normalizeChecks(config) {
  if (config?.version !== 1 || !Array.isArray(config.checks) || config.checks.length > 32) {
    throw new Error('Service checks require version 1 and a list of up to 32 checks');
  }
  const ids = new Set();
  return config.checks.map((raw, index) => {
    try {
      if (typeof raw?.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(raw.id) || ids.has(raw.id)) {
        throw new Error('Choose a unique lowercase check ID');
      }
      if (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 80 || /[\u0000-\u001f\u007f]/.test(raw.name)) {
        throw new Error('Enter a check name of 1 to 80 characters');
      }
      if (!SERVICE_KINDS.includes(raw.kind)) throw new Error('Choose http, tcp, dns, ping, certificate, or heartbeat');
      const fields = ['id', 'name', 'kind', 'target', 'intervalSeconds', 'timeoutMs', 'failureThreshold'];
      if (raw.kind === 'tcp') fields.push('port');
      if (raw.kind === 'dns') fields.push('record');
      if (raw.kind === 'http') fields.push('expectedStatus');
      if (raw.kind === 'certificate') fields.push('warningDays');
      if (raw.kind === 'heartbeat') fields.push('maxAgeSeconds');
      if (Object.keys(raw).some((field) => !fields.includes(field))) throw new Error('Remove unrecognised check fields');
      const target = raw.kind === 'heartbeat' ? heartbeatTarget(raw.target)
        : ['http', 'certificate'].includes(raw.kind) ? httpTarget(raw.target) : host(raw.target);
      const check = {
        id: raw.id, name: raw.name.trim(), kind: raw.kind,
        target,
        intervalMs: 1_000 * integer(raw.intervalSeconds, 10, 3_600, 'Interval in seconds', 30),
        timeoutMs: integer(raw.timeoutMs, 250, 8_000, 'Timeout in milliseconds', 3_000),
        failureThreshold: integer(raw.failureThreshold, 2, 10, 'Consecutive failures', 2),
      };
      if (check.kind === 'tcp') check.port = integer(raw.port, 1, 65_535, 'TCP port');
      if (check.kind === 'dns') {
        check.record = raw.record ?? 'A';
        if (!['A', 'AAAA'].includes(check.record) || net.isIP(check.target)) throw new Error('DNS checks need a domain and an A or AAAA record');
      }
      if (check.kind === 'http' && raw.expectedStatus !== undefined) {
        check.expectedStatus = integer(raw.expectedStatus, 200, 599, 'HTTP status');
      }
      if (check.kind === 'certificate') {
        if (!target.startsWith('https:')) throw new Error('Certificate checks require an HTTPS URL');
        check.warningDays = integer(raw.warningDays, 1, 365, 'Certificate warning days', 30);
      }
      if (check.kind === 'heartbeat') check.maxAgeSeconds = integer(raw.maxAgeSeconds, 10, 604_800, 'Heartbeat maximum age in seconds');
      ids.add(raw.id);
      return check;
    } catch (err) {
      throw new Error(`Check ${index + 1}. ${err.message}`);
    }
  });
}

function tcpProbe(check, signal) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: check.target, port: check.port, signal });
    socket.once('connect', () => {
      socket.destroy();
      resolve('Connected');
    });
    socket.once('error', reject);
  });
}

async function dnsProbe(check, signal) {
  const resolver = new Resolver({ timeout: check.timeoutMs, tries: 1 });
  const cancel = () => resolver.cancel();
  try {
    signal.addEventListener('abort', cancel, { once: true });
    signal.throwIfAborted();
    const records = await resolver.resolve(check.target, check.record);
    if (!records.length) throw new Error('No DNS record');
    return `${check.record} resolved`;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}

async function pingProbe(check, signal) {
  if (process.platform !== 'win32') throw new Error('Ping unavailable');
  await sharedPowerShell().run(PING_SCRIPT, {
    env: { LASTRA_PING_HOST: check.target, LASTRA_PING_TIMEOUT: String(check.timeoutMs) },
    signal, timeout: check.timeoutMs + 2_000, maxBuffer: 8_192,
  });
  return 'Echo reply';
}

async function probe(check, cancellation, fetchImpl = globalThis.fetch) {
  const deadline = AbortSignal.timeout(check.timeoutMs);
  const signal = AbortSignal.any([cancellation, deadline]);
  const start = performance.now();
  try {
    signal.throwIfAborted();
    switch (check.kind) {
      case 'http': {
        const response = await fetchImpl(check.target, { method: 'HEAD', signal, redirect: 'manual' });
        const ok = check.expectedStatus !== undefined ? response.status === check.expectedStatus : response.status < 400;
        return { ok, detail: `HTTP ${response.status}`, latencyMs: Math.round(performance.now() - start) };
      }
      case 'tcp': return { ok: true, detail: await tcpProbe(check, signal), latencyMs: Math.round(performance.now() - start) };
      case 'dns': return { ok: true, detail: await dnsProbe(check, signal), latencyMs: Math.round(performance.now() - start) };
      case 'ping': return { ok: true, detail: await pingProbe(check, signal), latencyMs: Math.round(performance.now() - start) };
      case 'certificate': return { ...await certificateProbe(check, signal), latencyMs: Math.round(performance.now() - start) };
      case 'heartbeat': return { ...await heartbeatProbe(check, signal), latencyMs: Math.round(performance.now() - start) };
      default: return { ok: false, detail: 'Unsupported check' };
    }
  } catch {
    const failures = { http: 'HTTP request failed', tcp: 'TCP connection failed', dns: 'DNS lookup failed', ping: 'No echo reply',
      certificate: 'HTTPS certificate could not be verified', heartbeat: 'Heartbeat timestamp unavailable' };
    return { ok: false, detail: deadline.aborted ? 'Timed out' : failures[check.kind] ?? 'Check failed' };
  }
}

module.exports = { SERVICE_KINDS, normalizeChecks, probe };
