// @ts-check
'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

// Each request is one JSON line: { id, script (base64 UTF-8), env }. The loop runs the script in a child
// scope, so a script's $ErrorActionPreference stays local, and answers with { id, ok, out | error }.
// Scripts must not call `exit`: that would end the worker. Throw instead.
const LOOP = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $request = $line | ConvertFrom-Json
  $names = @()
  if ($request.env) { foreach ($item in $request.env.PSObject.Properties) { Set-Item -Path ('env:' + $item.Name) -Value $item.Value; $names += $item.Name } }
  try {
    $source = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($request.script))
    $out = (& ([ScriptBlock]::Create($source)) | Out-String -Width 8192)
    $reply = @{ id = $request.id; ok = $true; out = $out }
  } catch {
    $reply = @{ id = $request.id; ok = $false; error = [string]$_.Exception.Message }
  } finally {
    foreach ($name in $names) { Remove-Item -Path ('env:' + $name) -ErrorAction SilentlyContinue }
  }
  [Console]::Out.WriteLine(($reply | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}
`;

function defaultExecutable() {
  return path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

/**
 * One long-lived powershell.exe that runs polling scripts in turn. Starting PowerShell costs far more
 * than the queries themselves, and the deck polls every few seconds while Stats is visible.
 * The process starts on the first request, stops after `idleMs` without requests, and exits on its own
 * when Lastra closes its input.
 */
class PowerShellWorker {
  /**
   * @param {{ executable?: string, spawnImpl?: typeof spawn, idleMs?: number, log?: (...args: any[]) => void }} [options]
   */
  constructor({ executable = defaultExecutable(), spawnImpl = spawn, idleMs = 60_000, log = () => {} } = {}) {
    this.executable = executable;
    this.spawnImpl = spawnImpl;
    this.idleMs = idleMs;
    this.log = log;
    this.child = null;
    this.queue = [];
    this.active = null;
    this.sequence = 0;
    this.idleTimer = null;
    this.disposed = false;
  }

  /**
   * Run a script and resolve with its text output. Rejects on script errors, timeouts and aborts.
   * @param {string} script
   * @param {{ env?: Record<string, string>, timeout?: number, signal?: AbortSignal, maxBuffer?: number }} [options]
   * @returns {Promise<string>}
   */
  run(script, { env = {}, timeout = 6_000, signal, maxBuffer = 2 * 1024 * 1024 } = {}) {
    if (this.disposed) return Promise.reject(new Error('PowerShell is unavailable while Lastra closes.'));
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('Aborted'));
    return new Promise((resolve, reject) => {
      const job = { id: ++this.sequence, script, env, timeout, signal, maxBuffer, resolve, reject };
      job.onAbort = () => this.abort(job, signal.reason ?? new Error('Aborted'));
      signal?.addEventListener('abort', job.onAbort, { once: true });
      this.queue.push(job);
      this.pump();
    });
  }

  pump() {
    if (this.active || !this.queue.length || this.disposed) return;
    clearTimeout(this.idleTimer);
    const job = this.queue.shift();
    this.active = job;
    try {
      this.ensureChild();
      job.timer = setTimeout(() => this.restart(job, new Error('PowerShell did not answer in time.')), job.timeout);
      const env = Object.fromEntries(Object.entries(job.env).map(([key, value]) => [key, String(value)]));
      this.child.stdin.write(JSON.stringify({ id: job.id, script: Buffer.from(job.script, 'utf8').toString('base64'), env }) + '\n');
    } catch (err) {
      this.restart(job, err);
    }
  }

  ensureChild() {
    if (this.child) return;
    const child = this.spawnImpl(this.executable, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', LOOP], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
    });
    this.child = child;
    child.stdin.on('error', () => {});
    child.once('error', (err) => { if (this.child === child) this.restart(this.active, err); });
    child.once('exit', () => {
      if (this.child !== child) return;
      this.child = null;
      if (this.active) this.restart(this.active, new Error('PowerShell stopped unexpectedly.'));
    });
    createInterface({ input: child.stdout }).on('line', (line) => this.receive(child, line));
  }

  receive(child, line) {
    const job = this.active;
    if (child !== this.child || !job) return;
    let reply;
    try { reply = JSON.parse(line); } catch { return; }
    if (reply?.id !== job.id) return;
    this.finish(job);
    if (!reply.ok) job.reject(new Error(reply.error || 'The PowerShell script failed.'));
    else if (Buffer.byteLength(reply.out ?? '') > job.maxBuffer) job.reject(new Error('The PowerShell output exceeded the size limit.'));
    else job.resolve(reply.out ?? '');
    this.pump();
    this.scheduleIdle();
  }

  finish(job) {
    clearTimeout(job.timer);
    job.signal?.removeEventListener('abort', job.onAbort);
    if (this.active === job) this.active = null;
  }

  abort(job, reason) {
    const queued = this.queue.indexOf(job);
    if (queued >= 0) {
      this.queue.splice(queued, 1);
      job.signal?.removeEventListener('abort', job.onAbort);
      job.reject(reason);
      return;
    }
    if (this.active === job) this.restart(job, reason);
  }

  /** Fail the running job and replace the process, since its script may still be running. */
  restart(job, error) {
    if (job) {
      this.finish(job);
      job.reject(error);
    }
    const child = this.child;
    this.child = null;
    try { child?.kill(); } catch { /* already gone */ }
    if (job && error?.name !== 'AbortError') this.log('PowerShell worker restarted:', error?.message ?? error);
    this.pump();
    this.scheduleIdle();
  }

  scheduleIdle() {
    clearTimeout(this.idleTimer);
    if (this.active || this.queue.length || !this.child) return;
    this.idleTimer = setTimeout(() => {
      if (this.active || this.queue.length) return;
      const child = this.child;
      this.child = null;
      try { child?.stdin.end(); child?.kill(); } catch { /* already gone */ }
    }, this.idleMs);
    this.idleTimer.unref?.();
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.idleTimer);
    const error = new Error('PowerShell is unavailable while Lastra closes.');
    for (const job of this.queue.splice(0)) {
      job.signal?.removeEventListener('abort', job.onAbort);
      job.reject(error);
    }
    if (this.active) {
      const job = this.active;
      this.finish(job);
      job.reject(error);
    }
    const child = this.child;
    this.child = null;
    try { child?.kill(); } catch { /* already gone */ }
  }
}

let shared = null;

/** The worker shared by the polling providers. */
function sharedPowerShell() {
  shared ??= new PowerShellWorker();
  return shared;
}

function disposeSharedPowerShell() {
  shared?.dispose();
  shared = null;
}

module.exports = { PowerShellWorker, sharedPowerShell, disposeSharedPowerShell };
