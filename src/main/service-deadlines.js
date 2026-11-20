// @ts-check
'use strict';

const net = require('node:net');
const path = require('node:path');
const { lstat, realpath } = require('node:fs/promises');
const tls = require('node:tls');

const DAY_MS = 86_400_000;

function heartbeatTarget(value) {
  if (typeof value !== 'string' || value.length > 1_024 || /\p{Cc}/u.test(value)) throw new Error('Enter an absolute local file path.');
  const local = process.platform === 'win32' ? /^[a-z]:[\\/][^:]+$/i.test(value)
    : path.isAbsolute(value) && !value.startsWith('//');
  if (!local) throw new Error('Enter an absolute local file path.');
  return path.normalize(value);
}

function readExpiry(target, signal, connect) {
  const url = new URL(target);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port: Number(url.port || 443), servername: net.isIP(host) ? undefined : host,
      rejectUnauthorized: true, signal });
    socket.once('error', reject);
    socket.once('close', () => reject(new Error('TLS connection closed.')));
    socket.once('secureConnect', () => {
      try {
        const expiry = socket.authorized ? Date.parse(socket.getPeerX509Certificate()?.validTo) : NaN;
        if (Number.isFinite(expiry)) resolve(expiry);
        else reject(Object.assign(new Error('Certificate expiry unavailable.'), { code: 'TLS_EXPIRY_UNAVAILABLE' }));
      } catch (error) { reject(error); }
      finally { socket.destroy(); }
    });
  });
}

async function certificateProbe(check, signal, { connect = tls.connect, now = Date.now } = {}) {
  signal.throwIfAborted();
  let expiresAt;
  try { expiresAt = await readExpiry(check.target, signal, connect); }
  catch (error) {
    signal.throwIfAborted();
    const detail = {
      CERT_HAS_EXPIRED: 'HTTPS certificate expired', ERR_TLS_CERT_ALTNAME_INVALID: 'HTTPS hostname does not match the certificate',
      TLS_EXPIRY_UNAVAILABLE: 'HTTPS certificate expiry unavailable',
    }[error.code] ?? 'HTTPS certificate could not be verified';
    return { ok: false, detail };
  }
  signal.throwIfAborted();
  const remaining = expiresAt - now();
  const timing = { kind: 'certificate', expiresAt };
  if (remaining <= 0) return { ok: false, detail: 'HTTPS certificate expired', timing };
  if (remaining <= check.warningDays * DAY_MS) return { ok: false, detail: 'HTTPS certificate expires soon', timing };
  return { ok: true, detail: 'HTTPS certificate is valid', timing };
}

async function heartbeatProbe(check, signal, { now = Date.now } = {}) {
  signal.throwIfAborted();
  let modifiedAt;
  try {
    const resolved = heartbeatTarget(await realpath(check.target));
    signal.throwIfAborted();
    const stats = await lstat(resolved);
    if (!stats.isFile()) return { ok: false, detail: 'Heartbeat requires a regular file' };
    modifiedAt = Math.floor(stats.mtimeMs);
  } catch (error) {
    signal.throwIfAborted();
    return { ok: false, detail: error.code === 'ENOENT' ? 'Heartbeat file is missing' : 'Heartbeat timestamp unavailable' };
  }
  signal.throwIfAborted();
  const at = now();
  if (!Number.isFinite(modifiedAt) || modifiedAt > at) return { ok: false, detail: 'Heartbeat timestamp is unavailable or in the future' };
  const deadlineAt = modifiedAt + check.maxAgeSeconds * 1_000;
  const timing = { kind: 'heartbeat', heartbeatAt: modifiedAt, deadlineAt };
  return at < deadlineAt ? { ok: true, detail: 'Heartbeat is current', timing }
    : { ok: false, detail: 'Heartbeat deadline missed', timing };
}

module.exports = { heartbeatTarget, certificateProbe, heartbeatProbe };
