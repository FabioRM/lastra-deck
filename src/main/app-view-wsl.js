// @ts-check
'use strict';

const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const runFile = promisify(execFile);
const LIMITS = { encoding: 'buffer', timeout: 4500, windowsHide: true, maxBuffer: 128 * 1024 };
const METRIC_LIMITS = { ...LIMITS, timeout: 3000, maxBuffer: 16 * 1024 };
const READERS = [['--list', '--verbose'], ['--list', '--running', '--quiet']];

function decodeOutput(value) {
  if (typeof value === 'string') return value.replace(/^\uFEFF/, '');
  if (!Buffer.isBuffer(value)) return '';
  const prefix = value.subarray(0, 80);
  const utf16 = prefix[0] === 0xff && prefix[1] === 0xfe || prefix.some((byte, index) => index % 2 === 1 && byte === 0);
  return value.toString(utf16 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
}

function lines(output) {
  return decodeOutput(output).split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim());
}

function parseDistributions(verbose, running) {
  const active = running === null ? null : new Set(lines(running).map((line) => line.trim().toLowerCase()));
  const distributions = [];
  for (const line of lines(verbose)) {
    const match = /^([* ])\s+(.+)\s{2,}(\S(?:.*?\S)?)\s{2,}([12])$/.exec(line);
    if (!match) continue;
    const [, marker, rawName, rawState, version] = match;
    const name = rawName.trim();
    const native = rawState.trim().toLowerCase();
    const state = active?.has(name.toLowerCase()) ? 'running'
      : native === 'installing' ? 'installing'
        : native === 'uninstalling' ? 'uninstalling'
          : active ? 'stopped' : native === 'running' || native === 'stopped' ? native : 'unknown';
    distributions.push({ name, state, version: Number(version), default: marker === '*' });
  }
  return distributions;
}

function actionableName(name) {
  return typeof name === 'string' && /^[\p{L}\p{N}][\p{L}\p{N} ._()-]{0,119}$/u.test(name);
}

function parseMetrics(output) {
  const text = decodeOutput(output);
  const load = /^(\d{1,8}(?:\.\d{1,6})?)\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+\/\d+\s+\d+\s*$/m.exec(text);
  const memory = (key) => {
    const match = new RegExp(`^${key}:\\s+(\\d{1,13})[ \\t]+kB[ \\t]*\\r?$`, 'm').exec(text);
    return match ? Number(match[1]) : null;
  };
  const memoryTotalKiB = memory('MemTotal');
  const memoryAvailableKiB = memory('MemAvailable');
  if (!load || !memoryTotalKiB || memoryAvailableKiB === null || memoryAvailableKiB > memoryTotalKiB) return null;
  return { loadAverage: Number(load[1]), memoryTotalKiB, memoryAvailableKiB };
}

class WslProvider {
  /**
   * @param {{ systemRoot?: string, platform?: NodeJS.Platform, exec?: typeof runFile, run?: (action: Record<string, any>, pageApps?: any, options?: Record<string, any>) => Promise<any>, cacheMs?: number }} [options]
   */
  constructor({ systemRoot = process.env.SystemRoot || 'C:\\Windows', platform = process.platform,
    exec = runFile, run, cacheMs = 2000 } = {}) {
    this.exe = path.win32.join(systemRoot, 'System32', 'wsl.exe');
    this.platform = platform;
    this.exec = exec;
    this.run = run;
    this.cacheMs = cacheMs;
    this.cache = null;
    this.pending = null;
    this.stopping = false;
    this.readingMetrics = false;
  }

  async snapshot({ fresh = false } = {}) {
    if (this.platform !== 'win32') return { status: 'unsupported', distributions: [] };
    if (!fresh && this.cache && Date.now() - this.cacheAt < this.cacheMs) return this.cache;
    if (!this.pending) {
      this.pending = this.discover().then((state) => {
        this.cache = state;
        this.cacheAt = Date.now();
        return state;
      }).finally(() => { this.pending = null; });
    }
    return this.pending;
  }

  async discover() {
    const [verbose, running] = await Promise.allSettled(READERS.map((args) => this.exec(this.exe, args, LIMITS)));
    if (verbose.status === 'rejected') {
      return { status: verbose.reason?.code === 'ENOENT' ? 'unsupported' : 'unavailable', distributions: [] };
    }
    const distributions = parseDistributions(verbose.value.stdout, running.status === 'fulfilled' ? running.value.stdout : null);
    return { status: distributions.length ? 'ready' : 'empty', distributions };
  }

  async change(command) {
    const { action, name, confirmed } = command;
    if (!['terminal', 'code', 'stop', 'metrics'].includes(action) || !actionableName(name)) throw new Error('Invalid WSL command');
    if (action === 'metrics') return this.readMetrics(name);
    if (action === 'stop' && confirmed !== true) throw new Error('Confirm before stopping a distribution');
    const { distributions } = await this.snapshot({ fresh: true });
    const target = distributions.find((distribution) => distribution.name === name);
    if (!target) throw new Error('The selected distribution is unavailable');
    if (target.state === 'installing' || target.state === 'uninstalling') throw new Error('The selected distribution is changing');

    if (action === 'terminal') {
      const result = await this.run({
        type: 'launch', target: 'wt.exe', args: ['new-tab', this.exe, '--distribution', target.name],
      });
      if (!result.ok) throw new Error('Could not open the distribution in Windows Terminal. ' + (result.message || ''));
      return result;
    }
    if (action === 'code') {
      const result = await this.run({
        type: 'open', target: 'vscode://vscode-remote/wsl+' + encodeURIComponent(target.name) + '/',
      });
      if (!result.ok) throw new Error('Could not open the distribution in VS Code. Install VS Code and its WSL extension. ' + (result.message || ''));
      return result;
    }

    if (target.state !== 'running') throw new Error('The selected distribution is no longer running');
    if (this.stopping) throw new Error('A WSL stop request is already pending');
    if (this.readingMetrics) throw new Error('Wait for the WSL metrics read to finish');
    this.stopping = true;
    try {
      await this.exec(this.exe, ['--terminate', target.name], LIMITS);
      return { ok: true };
    } catch {
      throw new Error('WSL could not stop the selected distribution');
    } finally {
      this.cache = null;
      this.stopping = false;
    }
  }

  async readMetrics(name) {
    if (this.platform !== 'win32') throw new Error('WSL is unavailable on this system');
    if (this.readingMetrics || this.stopping) throw new Error('A WSL request is already pending');
    this.readingMetrics = true;
    try {
      let running;
      try {
        running = await this.exec(this.exe, READERS[1], LIMITS);
      } catch {
        throw new Error('Could not verify which distributions are running');
      }
      if (!lines(running.stdout).some((line) => line.trim() === name)) {
        throw new Error('The selected distribution is no longer running');
      }
      // WSL has no atomic run-if-running option. Use the latest status immediately before entering the distribution.
      let sample;
      try {
        sample = await this.exec(this.exe, ['--distribution', name, '--exec', '/bin/cat', '/proc/loadavg', '/proc/meminfo'],
          METRIC_LIMITS);
      } catch {
        throw new Error('Could not read metrics from the selected distribution');
      }
      const metrics = parseMetrics(sample.stdout);
      if (!metrics) throw new Error('Linux load or memory metrics are unavailable in this distribution');
      return { ok: true, metrics: { ...metrics, name, sampledAt: Date.now() } };
    } finally {
      this.readingMetrics = false;
    }
  }
}

module.exports = { WslProvider, decodeOutput, parseDistributions };
