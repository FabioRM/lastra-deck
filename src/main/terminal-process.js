// @ts-check
'use strict';

const { randomBytes } = require('node:crypto');
const { TerminalOutput } = require('./terminal-run-logs');

const OUTPUT_DRAIN_MS = 300;

class TerminalProcess {
  constructor(entry, { spawn, env, monotonic, onFinish }) {
    this.id = randomBytes(16).toString('hex');
    this.entry = entry;
    this.spawn = spawn;
    this.env = env;
    this.monotonic = monotonic;
    this.onFinish = onFinish;
    this.output = entry.captureOutput ? new TerminalOutput() : null;
    this.startedAt = monotonic();
    this.streams = [];
    this.stopResult = null;
    this.stopFailed = false;
  }

  elapsed() { return this.ended?.durationMs ?? Math.max(0, Math.round(this.monotonic() - this.startedAt)); }

  get launched() { return Number.isSafeInteger(this.child?.pid) && this.child.pid > 0; }

  snapshot() {
    const state = this.ended ? 'finishing' : this.stopResult ? 'stopping' : this.stopFailed ? 'stop-failed' : 'running';
    return { id: this.id, state, durationMs: this.elapsed(), log: Boolean(this.output) };
  }

  launch() {
    const { program, args, directory, timeout } = this.entry;
    try {
      this.child = this.spawn(program, args, { cwd: directory, env: this.env,
        stdio: this.output ? ['ignore', 'pipe', 'pipe'] : 'ignore', windowsHide: true });
    } catch {
      this.complete({ status: 'failed', exitCode: null, durationMs: this.elapsed() });
      return;
    }
    const { child } = this;
    if (this.output) {
      this.streams = [child.stdout, child.stderr].filter(Boolean);
      for (const stream of this.streams) {
        stream.on('data', (chunk) => this.output.append(chunk));
        stream.on('error', () => { this.output.incomplete = true; });
      }
    }
    child.on('error', () => {
      if (this.result || this.ended) return;
      if (!child.pid) this.exit('failed');
      else if (this.stopResult) {
        this.stopResult = null;
        this.stopFailed = true;
      }
    });
    child.once('exit', (code) => this.exit(code === null ? this.stopResult ?? 'interrupted' : 'exited', code));
    child.once('close', () => { if (this.ended) this.complete(this.ended); });
    this.timeout = setTimeout(() => this.stop('timed-out'), timeout).unref();
  }

  exit(status, exitCode = null) {
    if (this.ended || this.result) return;
    this.ended = { status, exitCode, durationMs: this.elapsed() };
    clearTimeout(this.timeout);
    if (!this.streams.length) this.complete(this.ended);
    else this.drain = setTimeout(() => {
      if (this.streams.some((stream) => !stream.readableEnded)) this.output.incomplete = true;
      this.complete(this.ended);
    }, OUTPUT_DRAIN_MS).unref();
  }

  complete(result) {
    if (this.result) return;
    this.result = result;
    clearTimeout(this.timeout);
    clearTimeout(this.drain);
    for (const stream of this.streams) stream.destroy();
    this.onFinish(result, this.output);
  }

  stop(reason = 'stopped') {
    if (this.ended || this.result || !this.child) return false;
    if (this.stopResult) return true;
    this.stopResult = reason;
    this.stopFailed = false;
    try {
      if (this.child.kill() || this.ended || this.result) return true;
    } catch { /* The child may have exited before the signal was sent. */ }
    this.stopResult = null;
    this.stopFailed = true;
    return false;
  }

  close() {
    this.stop('interrupted');
    this.complete(this.ended ?? { status: 'interrupted', exitCode: null, durationMs: this.elapsed() });
  }
}

module.exports = { TerminalProcess };
