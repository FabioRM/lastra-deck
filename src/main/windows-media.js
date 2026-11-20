// @ts-check
'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { confirmState } = require('./confirm-state');
const { compileDotNetHelper } = require('./dotnet-helper');

const SOURCE = path.join(__dirname, 'windows-media.cs');
const ACTIONS = new Set(['play', 'pause', 'toggle', 'previous', 'next', 'seek']);
const ROUTES = new Set(['spotify', 'netflix']);
const TOKEN = /^[a-f0-9]{32}$/;
const MAX_TIMELINE_MS = 7 * 24 * 60 * 60 * 1000;
const GUARDED_STATES = ['opened', 'stopped', 'playing', 'paused'];

function playbackRequest(value) {
  if (!value || !ACTIONS.has(value.command) || typeof value.sessionId !== 'string' || !TOKEN.test(value.sessionId)) return null;
  const { command, sessionId, selectionId, route } = value;
  if (selectionId !== undefined && (typeof selectionId !== 'string' || !TOKEN.test(selectionId) || selectionId !== sessionId)) return null;
  if (route !== undefined && (!ROUTES.has(route) || selectionId !== undefined)) return null;
  const target = { command, sessionId };
  if (selectionId !== undefined) target.selectionId = selectionId;
  if (route !== undefined) target.route = route;
  const { before, expectedTrackId } = value;
  if (before !== undefined) {
    if (!GUARDED_STATES.includes(before)) return null;
    target.before = before;
  }
  if (expectedTrackId !== undefined) {
    if (typeof expectedTrackId !== 'string' || !TOKEN.test(expectedTrackId)) return null;
    target.expectedTrackId = expectedTrackId;
  }
  if (command !== 'seek') return target;
  const { trackId, positionMs } = value;
  if (typeof trackId !== 'string' || !TOKEN.test(trackId)
      || !Number.isSafeInteger(positionMs) || positionMs < 0 || positionMs > MAX_TIMELINE_MS) return null;
  return { ...target, trackId, positionMs };
}

async function launchHelper(cache, signal) {
  const exe = await compileDotNetHelper({
    cache, source: SOURCE, exeName: 'LastraMedia.exe', signal, unavailableCode: 'MEDIA_UNSUPPORTED',
    args: ['/target:exe', '/optimize+', '/r:System.Runtime.WindowsRuntime.dll', '/r:System.Web.Extensions.dll'],
  });
  signal.throwIfAborted();
  return spawn(exe, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
}

class WindowsMedia {
  /**
   * @param {any} cache
   * @param {{ platform?: string, launch?: typeof launchHelper, log?: (...args: any[]) => void, timeout?: number,
   *   idle?: number, retry?: number, confirmation?: any, onSample?: (source: string) => void }} [options]
   */
  constructor(cache, { platform = process.platform, launch = launchHelper, log = () => {},
    timeout = 5000, idle = 3500, retry = 10000, confirmation, onSample } = {}) {
    this.cache = cache;
    this.platform = platform;
    this.launch = launch;
    this.log = log;
    this.timeout = timeout;
    this.idle = idle;
    this.retry = retry;
    this.confirmation = confirmation;
    this.onSample = onSample;
    this.pending = new Map();
    this.reviewHolds = new Set();
    this.nextId = 0;
    this.retryAt = 0;
    this.failedStatus = 'unavailable';
  }

  snapshot(artworkId, selectionId, route) {
    if (selectionId !== undefined && (typeof selectionId !== 'string' || !TOKEN.test(selectionId))) {
      return Promise.resolve({ status: 'missing' });
    }
    if (route !== undefined && (!ROUTES.has(route) || selectionId !== undefined)) return Promise.resolve({ status: 'missing' });
    const target = { command: 'snapshot', artworkId: typeof artworkId === 'string' && TOKEN.test(artworkId) ? artworkId : null };
    if (selectionId !== undefined) target.selectionId = selectionId;
    if (route !== undefined) target.route = route;
    return this.request(target);
  }

  snapshotForAgent(selectionId, { metadata = false } = {}) {
    if (selectionId !== undefined && (typeof selectionId !== 'string' || !TOKEN.test(selectionId))) {
      return Promise.resolve({ status: 'missing' });
    }
    return this.request({ command: 'snapshot', detail: metadata ? 'metadata' : 'state',
      ...(selectionId === undefined ? {} : { selectionId }) });
  }

  reviewSnapshot(selectionId) {
    if (!this.child || (selectionId !== undefined && (typeof selectionId !== 'string' || !TOKEN.test(selectionId)))) {
      return Promise.resolve({ status: 'missing' });
    }
    return this.request({ command: 'snapshot', detail: 'review', ...(selectionId === undefined ? {} : { selectionId }) });
  }

  holdForReview() {
    if (!this.child) return null;
    const hold = Symbol();
    this.reviewHolds.add(hold);
    clearTimeout(this.idleTimer);
    return () => {
      if (this.reviewHolds.delete(hold)) this.armIdle();
    };
  }

  change(value, authorized = () => true) {
    const request = playbackRequest(value);
    if (!request) return Promise.resolve({ status: 'disabled' });
    if (!this.child) return Promise.resolve({ status: 'changed' });
    return this.request(request, authorized);
  }

  async toggle(route, verifyTarget) {
    const { status, playback, canPause, canPlay, canToggle, sessionId, trackId } = await this.snapshot(undefined, undefined, route);
    if (status !== 'ready' || !sessionId) throw new Error('The selected player is unavailable.');
    let command;
    if (playback === 'playing' && canPause) command = 'pause';
    else if (playback !== 'playing' && canPlay) command = 'play';
    else if (canToggle) command = 'toggle';
    if (!command) throw new Error('The selected player cannot change playback.');
    verifyTarget?.();
    const result = await this.change({ command, route, sessionId });
    if (result.status !== 'ok') throw new Error('The selected player did not accept the command.');
    const expectedPlayback = playback === 'playing' ? 'paused' : 'playing';
    await confirmState(async () => {
      const current = await this.snapshot(trackId, sessionId);
      if (current.status === 'missing' || (current.status === 'ready' && current.sessionId !== sessionId)) {
        throw new Error('The selected player changed before confirming playback.');
      }
      return current.status === 'ready' && current.playback === expectedPlayback;
    }, 'The selected player did not confirm the playback change.', this.confirmation);
    return null;
  }

  diagnosticStatus() {
    if (this.platform !== 'win32') return 'unsupported';
    if (this.child) return 'running';
    if (this.starting) return 'starting';
    return Date.now() < this.retryAt ? this.failedStatus : 'idle';
  }

  setPollInterval(intervalMs) {
    const idle = intervalMs + 2_500;
    if (idle === this.idle) return;
    this.idle = idle;
    if (this.child && !this.pending.size) this.armIdle();
  }

  async connect() {
    if (this.child) return this.child;
    if (this.starting) return this.starting;
    const controller = new AbortController();
    this.controller = controller;
    const starting = Promise.resolve().then(() => this.launch(this.cache, controller.signal)).then((child) => {
      if (controller.signal.aborted) {
        child.kill();
        return null;
      }
      this.child = child;
      const receive = createInterface({ input: child.stdout });
      receive.on('line', (line) => {
        if (this.child !== child) return;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          this.fail(child);
          return;
        }
        const pending = this.pending.get(message?.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        pending.resolve(message.result ?? { status: 'unavailable' });
        this.armIdle();
      });
      const ended = () => this.fail(child);
      child.once('error', ended);
      child.once('exit', ended);
      child.stdin.on('error', ended);
      return child;
    }).catch((error) => {
      if (!controller.signal.aborted) {
        this.failedStatus = error.code === 'MEDIA_UNSUPPORTED' ? 'unsupported' : 'unavailable';
        this.retryAt = Date.now() + this.retry;
        this.log('Could not start Windows media controls:', error.stderr?.trim() || error.message);
      }
      return null;
    }).finally(() => {
      if (this.starting === starting) this.starting = null;
    });
    this.starting = starting;
    return starting;
  }

  async request(value, authorized = () => true) {
    if (this.platform !== 'win32') return { status: 'unsupported' };
    if (Date.now() < this.retryAt) return { status: this.failedStatus };
    clearTimeout(this.idleTimer);
    const child = await this.connect();
    if (!child || child !== this.child) return { status: this.failedStatus };
    if (!authorized()) {
      this.armIdle();
      return { status: 'cancelled' };
    }
    // Polling can overlap across widgets and selected players.
    // Reserve capacity for a user command when both reads are pending.
    const isSnapshot = value.command === 'snapshot';
    const sameKind = [...this.pending.values()].filter((request) => request.isSnapshot === isSnapshot).length;
    if (sameKind >= (isSnapshot ? 2 : 1)) return { status: 'busy' };

    const id = ++this.nextId;
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.fail(child), this.timeout);
      this.pending.set(id, { resolve, timer, isSnapshot });
      if (isSnapshot) this.onSample?.('media');
      child.stdin.write(JSON.stringify({ id, ...value }) + '\n');
    });
  }

  fail(child) {
    if (this.child !== child) return;
    this.failedStatus = 'unavailable';
    this.retryAt = Date.now() + this.retry;
    this.stop();
  }

  armIdle() {
    clearTimeout(this.idleTimer);
    if (this.pending.size || this.reviewHolds.size) return;
    this.idleTimer = setTimeout(() => this.stop(), this.idle);
  }

  stop() {
    clearTimeout(this.idleTimer);
    this.reviewHolds.clear();
    this.controller?.abort();
    this.controller = null;
    this.starting = null;
    const child = this.child;
    this.child = null;
    child?.kill();
    for (const { resolve, timer } of this.pending.values()) {
      clearTimeout(timer);
      resolve({ status: 'unavailable' });
    }
    this.pending.clear();
  }
}

module.exports = { WindowsMedia, playbackRequest, GUARDED_STATES, MAX_TIMELINE_MS };
