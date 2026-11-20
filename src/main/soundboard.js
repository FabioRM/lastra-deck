// @ts-check
'use strict';

// Plays soundboard clips through a hidden host page and tracks which clips are playing.
// The host decodes and plays the audio; this class owns the rules: which file may load, how many
// clips play at once, and what a second press on the same clip does.

const fs = require('node:fs/promises');
const { MAX_VOICES, MAX_CLIP_BYTES, soundType, soundName } = require('../shared/sounds');

const LOCAL_PATH = /^[a-z]:[\\/]/i;
const REPLY_TIMEOUT_MS = 8_000;

class Soundboard {
  /**
   * @param {object} options
   * @param {(onEvent: (event: any) => void, onClosed: () => void) => { post(message: any): void, close(): void }} options.createHost
   * @param {(file: string) => string} [options.expandPath] Expands Windows folder variables in a clip path.
   * @param {{ stat(file: string): Promise<{ isFile(): boolean, size: number }>, readFile(file: string): Promise<Uint8Array> }} [options.files]
   * @param {() => number} [options.now]
   * @param {(state: ReturnType<Soundboard['snapshot']>) => void} [options.onChange]
   * @param {number} [options.replyTimeoutMs]
   */
  constructor({ createHost, expandPath = (file) => file, files = fs, now = Date.now, onChange = () => {}, replyTimeoutMs = REPLY_TIMEOUT_MS }) {
    this.createHost = createHost;
    this.expandPath = expandPath;
    this.files = files;
    this.now = now;
    this.onChange = onChange;
    this.replyTimeoutMs = replyTimeoutMs;
    this.revision = 0;
    this.sequence = 0;
    /** @type {Map<number, { id: string, startedAt: number, durationMs: number | null }>} */
    this.voices = new Map();
    /** @type {Map<number, { resolve: (value: any) => void, reject: (error: Error) => void, timer: NodeJS.Timeout }>} */
    this.pending = new Map();
    this.starting = new Set();
    this.host = null;
    this.ready = false;
    /** @type {any[]} */
    this.queue = [];
  }

  snapshot() {
    return { revision: this.revision, playing: [...this.voices.values()].map((voice) => ({ ...voice })) };
  }

  publish() {
    this.revision = this.revision === Number.MAX_SAFE_INTEGER ? 0 : this.revision + 1;
    this.onChange(this.snapshot());
  }

  post(message) {
    if (!this.host) {
      this.ready = false;
      this.host = this.createHost((event) => this.handle(event), () => this.hostClosed());
    }
    if (this.ready) this.host.post(message);
    else this.queue.push(message);
  }

  /** Send a command to the host and wait for its answer. */
  request(message) {
    const ticket = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(ticket);
        reject(new Error('The sound player did not answer.'));
      }, this.replyTimeoutMs);
      timer.unref?.();
      this.pending.set(ticket, { resolve, reject, timer });
      this.post({ ...message, ticket });
    });
  }

  settle(ticket, error, value) {
    const waiting = this.pending.get(ticket);
    if (!waiting) return;
    this.pending.delete(ticket);
    clearTimeout(waiting.timer);
    if (error) waiting.reject(error);
    else waiting.resolve(value);
  }

  handle(event) {
    if (!event || typeof event !== 'object') return;
    if (event.type === 'ready') {
      this.ready = true;
      for (const message of this.queue.splice(0)) this.host?.post(message);
    } else if (event.type === 'started') {
      this.settle(event.ticket, null, { durationMs: Number.isFinite(event.durationMs) && event.durationMs >= 0 ? event.durationMs : null });
    } else if (event.type === 'outputs') {
      const labels = Array.isArray(event.labels) ? event.labels.filter((label) => typeof label === 'string' && label).slice(0, 64) : [];
      this.settle(event.ticket, null, [...new Set(labels)]);
    } else if (event.type === 'failed') {
      const message = typeof event.message === 'string' && event.message ? event.message.slice(0, 200) : 'The clip could not be played.';
      this.settle(event.ticket, new Error(message));
      if (this.voices.delete(event.ticket)) this.publish();
    } else if (event.type === 'ended') {
      if (this.voices.delete(event.ticket)) this.publish();
    }
  }

  hostClosed() {
    this.host = null;
    this.ready = false;
    this.queue = [];
    for (const ticket of [...this.pending.keys()]) this.settle(ticket, new Error('The sound player closed.'));
    if (this.voices.size) {
      this.voices.clear();
      this.publish();
    }
  }

  /** Read a clip from a local file, after checking its location, type and size. */
  async load(file) {
    const target = this.expandPath(file);
    const mime = soundType(target);
    if (!LOCAL_PATH.test(target) || !mime) throw new Error('Use the full path of an audio file on this PC.');
    let info;
    try { info = await this.files.stat(target); }
    catch { throw new Error(`Audio file not found: ${soundName(target)}`); }
    if (!info.isFile()) throw new Error(`Audio file not found: ${soundName(target)}`);
    if (info.size > MAX_CLIP_BYTES) throw new Error(`A clip can be up to ${MAX_CLIP_BYTES / 1024 / 1024} MB.`);
    try { return { bytes: await this.files.readFile(target), mime }; }
    catch { throw new Error(`Lastra could not read ${soundName(target)}.`); }
  }

  stopVoices(tickets) {
    for (const ticket of tickets) this.voices.delete(ticket);
    this.host?.post({ type: 'stop', tickets });
    this.publish();
  }

  /**
   * Play a clip, or apply the `again` rule when it is already playing.
   * @param {{ id: string, file: string, volume: number, again: string, output?: string }} clip
   * @returns {Promise<string>} What happened, for the key's result.
   */
  async play({ id, file, volume, again, output }) {
    const name = soundName(file);
    const active = [...this.voices].filter(([, voice]) => voice.id === id).map(([ticket]) => ticket);
    if (this.starting.has(id)) throw new Error(`${name} is still starting.`);
    if (active.length && again === 'stop') {
      this.stopVoices(active);
      return `Stopped ${name}`;
    }
    if (this.voices.size - (again === 'restart' ? active.length : 0) >= MAX_VOICES) {
      throw new Error(`Lastra plays up to ${MAX_VOICES} clips at once.`);
    }
    this.starting.add(id);
    try {
      const { bytes, mime } = await this.load(file);
      if (active.length && again === 'restart') this.stopVoices(active.filter((ticket) => this.voices.has(ticket)));
      const request = this.request({ type: 'play', bytes, mime, volume: volume / 100, output });
      const ticket = this.sequence;
      const { durationMs } = await request;
      this.voices.set(ticket, { id, startedAt: this.now(), durationMs });
      this.publish();
      return `Playing ${name}`;
    } finally {
      this.starting.delete(id);
    }
  }

  /** Stop every clip and return what happened. */
  stopAll() {
    const count = this.voices.size;
    this.host?.post({ type: 'stop-all' });
    if (!count) return 'No clip is playing';
    this.voices.clear();
    this.publish();
    return count === 1 ? 'Stopped 1 clip' : `Stopped ${count} clips`;
  }

  /** Names of the Windows outputs a clip can play on. */
  outputs() {
    return this.request({ type: 'outputs' });
  }

  close() {
    this.host?.close();
    this.hostClosed();
  }
}

module.exports = { Soundboard };
