// @ts-check
'use strict';

const net = require('node:net');
const { randomBytes } = require('node:crypto');
const { AUTH_TAG, parseCredential, pipeAddress, proof, checkProof, readFrames, writeFrame } = require('./mcp-link');
const { protection } = require('./mcp-protection');

const unavailable = () => new Error('The local Lastra connection is unavailable. Check agent access and the Windows session.');

/**
 * @param {string} credential
 * @param {{ address?: typeof pipeAddress, protect?: typeof protection, onNotice?: (subscription: string) => void }} [options]
 */
function connectAgent(credential, { address = pipeAddress, protect = protection, onNotice = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const { pipe, client, wrapped } = parseCredential(credential);
    const key = protect().unprotect(Buffer.from(wrapped, 'base64url'));
    if (key.length !== 32) {
      key.fill(0);
      throw new Error('Invalid Lastra agent credential.');
    }
    const initial = randomBytes(32).toString('base64url');
    const socket = net.createConnection(address(pipe));
    let stage = 'challenge';
    let request;
    let nextId = 0;

    const fail = () => {
      key.fill(0);
      reject(unavailable());
      if (request) {
        clearTimeout(request.timer);
        request.reject(unavailable());
        request = undefined;
      }
      socket.destroy();
    };
    socket.setTimeout(3_000, fail);
    socket.on('error', fail);
    socket.on('close', fail);
    socket.once('connect', () => writeFrame(socket, { type: 'hello', client, nonce: initial }));

    function call(operation, args) {
      if (socket.destroyed) return Promise.reject(unavailable());
      if (request) return Promise.reject(new Error('The Lastra client has a request in progress.'));
      return new Promise((resolve, reject) => {
        request = { id: nextId++, resolve, reject, timer: setTimeout(fail, 4_000) };
        writeFrame(socket, { type: 'call', id: request.id, operation, args });
      });
    }

    readFrames(socket, (packet) => {
      if (socket.destroyed) return;
      if (stage === 'challenge') {
        if (packet.type !== 'challenge' || !AUTH_TAG.test(packet.nonce)
            || !checkProof(proof(key, 'server', pipe, client, initial, packet.nonce), packet.proof)) return fail();
        const response = proof(key, 'client', pipe, client, initial, packet.nonce);
        key.fill(0);
        stage = 'readying';
        writeFrame(socket, { type: 'proof', proof: response });
        return;
      }
      if (stage === 'readying' && packet.type === 'ready') {
        stage = 'ready';
        socket.setTimeout(0);
        resolve({ call, close: () => socket.destroy(), get disconnected() { return socket.destroyed; } });
        return;
      }
      if (stage === 'ready' && packet.type === 'notice' && typeof packet.subscription === 'string') {
        onNotice(packet.subscription);
        return;
      }
      if (stage !== 'ready' || packet.type !== 'result' || !request || packet.id !== request.id || typeof packet.ok !== 'boolean') return fail();
      const current = request;
      request = undefined;
      clearTimeout(current.timer);
      current.resolve(packet);
    }, fail);
  });
}

module.exports = { connectAgent };
