// @ts-check
'use strict';

const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');
const http = require('node:http');
const { promisify } = require('node:util');

const runFile = promisify(execFile);
const CLI_LIMITS = { timeout: 2500, maxBuffer: 128 * 1024, windowsHide: true };

function socketFor(endpoint, platform) {
  if (typeof endpoint !== 'string' || endpoint.length > 255) return null;
  if (platform === 'win32') {
    const pipe = /^npipe:\/\/\/\/\.\/pipe\/([a-z0-9_.-]+)$/i.exec(endpoint);
    return pipe ? '\\\\.\\pipe\\' + pipe[1] : null;
  }
  return /^unix:\/\/\/[^/\u0000-\u001f][^\u0000-\u001f]*$/.test(endpoint) ? endpoint.slice(7) : null;
}

async function readDockerContext({ platform = process.platform, exec = runFile } = {}) {
  try {
    const { stdout } = await exec(platform === 'win32' ? 'docker.exe' : 'docker',
      ['context', 'ls', '--format', '{{json .}}'], CLI_LIMITS);
    const entry = String(stdout).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
      .find(({ Current }) => Current === true || Current === 'true' || Current === '*');
    if (!entry || typeof entry.Name !== 'string' || entry.Error) return { status: 'unavailable' };

    const name = entry.Name.slice(0, 128);
    const socket = socketFor(entry.DockerEndpoint, platform);
    if (!socket) return { status: 'remote', name };
    const key = createHash('sha256').update(JSON.stringify([entry.Name, socket])).digest('hex').slice(0, 24);
    return { status: 'local', name, socket, key };
  } catch (err) {
    return { status: err.code === 'ENOENT' ? 'missing' : 'unavailable' };
  }
}

function engineRequest(socketPath, path, { method = 'GET', timeout = 4000, maxBytes = 512 * 1024, truncate = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath, path, method, agent: false, headers: { Host: 'localhost' } }, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        if (size + chunk.length > maxBytes) {
          if (truncate && res.statusCode === 200) {
            chunks.push(chunk.subarray(0, maxBytes - size));
            resolve({ body: Buffer.concat(chunks, maxBytes), clipped: true });
          } else {
            reject(new Error('Docker response exceeded its size limit'));
          }
          res.destroy();
          return;
        }
        chunks.push(chunk);
        size += chunk.length;
      });
      res.on('error', reject);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err = /** @type {Error & { status?: number }} */ (new Error('Docker returned status ' + res.statusCode));
          err.status = res.statusCode;
          reject(err);
          return;
        }
        resolve({ body: Buffer.concat(chunks, size), clipped: false });
      });
    });
    const timer = setTimeout(() => req.destroy(new Error('Docker request timed out')), timeout);
    req.on('error', reject);
    req.on('close', () => clearTimeout(timer));
    req.end();
  });
}

module.exports = { engineRequest, readDockerContext, socketFor };
