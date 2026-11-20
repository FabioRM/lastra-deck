// @ts-check
'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');

const LINK_VERSION = 1;
const ID = /^[a-f0-9]{32}$/;
const AUTH_TAG = /^[a-zA-Z0-9_-]{43}$/;
const WRAPPED = /^[a-zA-Z0-9_-]{24,4096}$/;
const FRAME_LIMIT = 256 * 1024;

function parseCredential(value) {
  const [version, pipe, client, wrapped, extra] = typeof value === 'string' && value.length < 4300 ? value.split('.') : [];
  if (version !== String(LINK_VERSION) || !ID.test(pipe) || !ID.test(client) || !WRAPPED.test(wrapped) || extra !== undefined) {
    throw new Error('Enter the Lastra agent credential from the setup dialog.');
  }
  return { pipe, client, wrapped };
}

function pipeAddress(id) {
  if (!ID.test(id)) throw new Error('Invalid Lastra agent endpoint.');
  return '\\\\.\\pipe\\Lastra.Agent.' + id;
}

function proof(secret, direction, pipe, client, initial, challenge) {
  return createHmac('sha256', secret).update(JSON.stringify([LINK_VERSION, direction, pipe, client, initial, challenge])).digest('base64url');
}

function checkProof(expected, supplied) {
  return typeof supplied === 'string' && AUTH_TAG.test(supplied) && timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

function readFrames(stream, onMessage, invalid) {
  let buffer = Buffer.alloc(0);
  let failed = false;
  function fail() {
    failed = true;
    invalid();
  }
  stream.on('data', (chunk) => {
    if (failed) return;
    let start = 0;
    while (start < chunk.length) {
      const end = chunk.indexOf(10, start);
      const segment = chunk.subarray(start, end < 0 ? chunk.length : end);
      if (buffer.length + segment.length > FRAME_LIMIT) return fail();
      buffer = Buffer.concat([buffer, segment]);
      if (end < 0) return;
      const line = buffer.toString('utf8').trim();
      buffer = Buffer.alloc(0);
      start = end + 1;
      if (!line) continue;
      let packet;
      try { packet = JSON.parse(line); } catch {}
      if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return fail();
      onMessage(packet);
    }
  });
}

function writeFrame(stream, packet) {
  const line = JSON.stringify(packet) + '\n';
  if (Buffer.byteLength(line) > FRAME_LIMIT) throw new Error('The Lastra response exceeded the size limit.');
  stream.write(line);
}

module.exports = { LINK_VERSION, ID, AUTH_TAG, WRAPPED, parseCredential, pipeAddress, proof, checkProof, readFrames, writeFrame };
