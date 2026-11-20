// @ts-check
'use strict';

const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');

// Config, scenes, inputs, filters, outputs, scene items and UI. The separate
// high-volume input meter and transform subscriptions are intentionally absent.
const SUBSCRIPTIONS = 2 + 4 + 8 + 32 + 64 + 128 + 1024;
const TERMINAL_CLOSE = new Map([[4009, 'authentication'], [4010, 'unsupported'], [4011, 'revoked']]);

function authenticationToken(password, { salt, challenge }) {
  const hash = (text) => createHash('sha256').update(text).digest('base64');
  return hash(hash(password + salt) + challenge);
}

class ObsSocket extends EventEmitter {
  constructor({ port, password = '' }, { Socket = globalThis.WebSocket, timeout = 6000, retry = 1000, heartbeatMs = 20_000 } = {}) {
    super();
    this.Socket = Socket;
    this.url = 'ws://127.0.0.1:' + port;
    this.password = password;
    this.timeout = timeout;
    this.heartbeatMs = heartbeatMs;
    this.initialRetry = retry;
    this.nextRetry = retry;
    this.running = false;
    this.ready = false;
    this.sequence = 0;
    this.pending = new Map();
    this.socket = null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.nextRetry = this.initialRetry;
    this.connect();
  }

  stop() {
    this.running = false;
    this.disconnect('disconnected');
  }

  connect() {
    if (!this.running) return;
    this.emit('status', 'connecting');
    let socket;
    try {
      socket = new this.Socket(this.url, 'obswebsocket.json');
    } catch {
      this.disconnect('disconnected');
      return;
    }
    this.socket = socket;
    this.phase = 'hello';
    this.handshakeTimer = setTimeout(() => this.disconnect('disconnected'), this.timeout);
    socket.addEventListener('message', ({ data }) => {
      if (socket === this.socket) this.receive(data);
    });
    socket.addEventListener('close', ({ code }) => {
      if (socket === this.socket) this.disconnect(TERMINAL_CLOSE.get(code) ?? 'disconnected');
    });
    // Some implementations dispatch error immediately before the close code.
    // The handshake deadline also covers a transport that fails to close.
    socket.addEventListener('error', () => {});
  }

  disconnect(status = 'disconnected') {
    const socket = this.socket;
    this.socket = null;
    this.ready = false;
    clearTimeout(this.handshakeTimer);
    clearTimeout(this.retryTimer);
    clearInterval(this.heartbeat);
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error('OBS connection interrupted'));
    }
    this.pending.clear();
    socket?.close();
    this.emit('status', status);
    if (!this.running || status !== 'disconnected') return;
    this.retryTimer = setTimeout(() => this.connect(), this.nextRetry);
    this.nextRetry = Math.min(this.nextRetry * 2, 30_000);
  }

  receive(raw) {
    let frame;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    if (!frame || typeof frame.d !== 'object' || frame.d === null) return;
    const { op, d } = frame;

    if (op === 0 && this.phase === 'hello') {
      const identify = { rpcVersion: 1, eventSubscriptions: SUBSCRIPTIONS };
      if (d.authentication) {
        const { salt, challenge } = d.authentication;
        if (!this.password || typeof salt !== 'string' || typeof challenge !== 'string') {
          this.disconnect('authentication');
          return;
        }
        identify.authentication = authenticationToken(this.password, { salt, challenge });
      }
      this.phase = 'identify';
      this.send({ op: 1, d: identify });
      return;
    }
    if (op === 2 && this.phase === 'identify') {
      clearTimeout(this.handshakeTimer);
      this.phase = 'ready';
      this.ready = true;
      this.nextRetry = this.initialRetry;
      const socket = this.socket;
      this.heartbeat = setInterval(() => {
        if (this.pending.size) return;
        void this.request('GetVersion').catch(() => {
          if (this.socket === socket) this.disconnect();
        });
      }, this.heartbeatMs).unref();
      this.emit('status', 'syncing');
      return;
    }
    if (!this.ready) return;
    if (op === 5 && typeof d.eventType === 'string') this.emit('event', d.eventType, d.eventData ?? {});
    if (op === 7) this.resolveRequest(d);
  }

  send(frame) {
    try {
      this.socket.send(JSON.stringify(frame));
    } catch {
      this.disconnect();
    }
  }

  resolveRequest(response) {
    const { requestId, requestType, requestStatus, responseData } = response;
    const pending = this.pending.get(requestId);
    if (!pending || requestType !== pending.type) return;
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    if (requestStatus?.result === true) {
      pending.resolve(responseData ?? {});
    } else {
      const code = Number.isInteger(requestStatus?.code) ? ' (code ' + requestStatus.code + ')' : '';
      pending.reject(new Error('OBS rejected the command' + code));
    }
  }

  request(type, data = {}) {
    if (!this.ready) return Promise.reject(new Error('OBS is disconnected'));
    const requestId = String(++this.sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('OBS did not respond in time'));
      }, this.timeout);
      this.pending.set(requestId, { resolve, reject, timer, type });
      this.send({ op: 6, d: { requestType: type, requestId, requestData: data } });
    });
  }
}

module.exports = { ObsSocket, authenticationToken };
