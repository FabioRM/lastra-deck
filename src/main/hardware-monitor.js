// @ts-check
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { DEFAULTS } = require('./monitoring-settings');
const { compileDotNetHelper, isFile } = require('./dotnet-helper');

const LIBRARY = 'LibreHardwareMonitorLib.dll';
const PACKAGE_PREFIX = 'librehardwaremonitor.librehardwaremonitor_';
const SOURCE = path.join(__dirname, 'hardware-monitor.cs');

async function findLibrary(env) {
  if (env.LASTRA_LHM_DIR) {
    const file = path.join(path.resolve(env.LASTRA_LHM_DIR), LIBRARY);
    if (await isFile(file)) return file;
    throw new Error(`${LIBRARY} was not found in LASTRA_LHM_DIR`);
  }

  const roots = [
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'WinGet', 'Packages'),
  ].filter(Boolean);
  for (const root of roots) {
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.name.toLowerCase().startsWith(PACKAGE_PREFIX)) continue;
      const file = path.join(root, entry.name, LIBRARY);
      if (await isFile(file)) return file;
    }
  }
  return null;
}

async function buildHelper(cache, library, signal) {
  const { mtimeMs, size } = await fs.stat(library);
  return compileDotNetHelper({
    cache, source: SOURCE, exeName: 'LastraHardwareMonitor.exe', signal,
    fingerprint: JSON.stringify([library, mtimeMs, size]),
    args: ['/optimize+', '/reference:System.Web.Extensions.dll', `/reference:${library}`],
  });
}

class HardwareMonitor {
  /**
   * @param {string} cache
   * @param {(...args: any[]) => void} log
   * @param {{ intervalMs?: number, onSample?: (source: string, at: number) => void }} [options]
   */
  constructor(cache, log, { intervalMs = DEFAULTS.hardware, onSample } = {}) {
    this.cache = cache;
    this.log = log;
    this.latest = null;
    this.latestAt = null;
    this.child = null;
    this.controller = null;
    this.intervalMs = intervalMs;
    this.onSample = onSample;
    this.failures = 0;
    this.restartTimer = null;
  }

  /** Release the failed run and try again later, backing off from 5 s to 5 min. */
  scheduleRestart(controller) {
    if (controller.signal.aborted || this.controller !== controller) return;
    this.controller = null;
    const delay = Math.min(5_000 * 2 ** this.failures, 300_000);
    this.failures++;
    clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => { this.restartTimer = null; void this.start(); }, delay);
    this.restartTimer.unref?.();
  }

  setIntervalMs(intervalMs) {
    if (this.intervalMs === intervalMs) return;
    this.intervalMs = intervalMs;
    if (this.child?.stdin?.writable) this.child.stdin.write(`${intervalMs}\n`);
  }

  async start() {
    if (process.platform !== 'win32' || this.controller) return;
    const controller = new AbortController();
    this.controller = controller;
    try {
      const library = await findLibrary(process.env);
      if (controller.signal.aborted) return;
      if (!library) {
        // Search again on the next start() so a later WinGet install is picked up.
        this.controller = null;
        return;
      }
      const exe = await buildHelper(this.cache, library, controller.signal);
      if (controller.signal.aborted) return;

      const child = spawn(exe, [path.dirname(library), String(this.intervalMs)], { windowsHide: true });
      this.child = child;
      child.stdin.on('error', (err) => {
        if (!controller.signal.aborted) this.log('LibreHardwareMonitor refresh:', err.message);
      });
      const output = createInterface({ input: child.stdout });
      output.on('line', (line) => {
        if (this.child !== child) return;
        try {
          const { readings, ...summary } = JSON.parse(line);
          this.latest = summary;
          this.readings = readings;
          this.latestAt = Date.now();
          this.failures = 0;
          this.onSample?.('hardwareManaged', this.latestAt);
        } catch {
          this.log('LibreHardwareMonitor returned an invalid reading');
        }
      });
      child.stderr.on('data', (chunk) => this.log('LibreHardwareMonitor:', String(chunk).trim()));
      child.once('error', (err) => this.log('LibreHardwareMonitor:', err.message));
      child.once('close', (code, signal) => {
        if (this.child !== child) return;
        this.child = null;
        if (controller.signal.aborted) return;
        this.log('LibreHardwareMonitor helper exited:', signal ?? `code ${code}`);
        this.scheduleRestart(controller);
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      this.log('LibreHardwareMonitor:', err.stderr?.trim() || err.stdout?.trim() || err.message);
      this.scheduleRestart(controller);
    }
  }

  stop() {
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.failures = 0;
    this.controller?.abort();
    this.controller = null;
    this.child?.kill();
    this.child = null;
    this.latest = null;
    this.latestAt = null;
    this.readings = null;
  }
}

module.exports = { HardwareMonitor };
