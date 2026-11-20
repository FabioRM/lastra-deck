// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { expandEnv } = require('./actions');
const { writeAtomic } = require('./write-atomic');
const { RUN_ID, TerminalRunLogs } = require('./terminal-run-logs');
const { TerminalProcess } = require('./terminal-process');
const { localProjectDirectory } = require('../../extensions/lastra-vscode/project-location');

const MAX_BYTES = 128 * 1024;
const ENTRY_ID = /^[a-z0-9_-]{1,48}$/;
const OUTCOMES = new Set(['exited', 'failed', 'stopped', 'timed-out', 'interrupted']);
const MAX_RESULTS = 64;
const MAX_RUNNING = 24;
const DEFAULT_CONFIG = {
  version: 1,
  profiles: [
    { id: 'powershell', name: 'Windows PowerShell', profile: 'Windows PowerShell', directory: '%USERPROFILE%' },
    { id: 'command-prompt', name: 'Command Prompt', profile: 'Command Prompt', directory: '%USERPROFILE%' },
  ],
  commands: [],
};

function text(value, limit, name) {
  if (typeof value !== 'string' || value.length > limit || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(name + ' needs text up to ' + limit + ' characters.');
  }
  return value.trim();
}

function absoluteWindowsPath(value) {
  return /^(?:[a-z]:\\|\\\\[^\\]+\\[^\\]+(?:\\|$))/i.test(value);
}

function directory(value, env, label) {
  const location = path.win32.normalize(expandEnv(text(value, 1024, label), env));
  if (!absoluteWindowsPath(location) || /["<>|?*\u0000-\u001f]/.test(location)) {
    throw new Error(label + ' must be an absolute Windows project directory.');
  }
  return location;
}

function identity(entry, used, label) {
  const id = entry?.id;
  if (typeof id !== 'string' || !ENTRY_ID.test(id) || used.has(id)) {
    throw new Error(label + ' needs a unique lowercase ID.');
  }
  used.add(id);
  return { id, name: text(entry.name, 64, label + ' name') };
}

function normalizeTerminalConfig(raw, env = process.env) {
  if (raw?.version !== 1 || !Array.isArray(raw.profiles) || raw.profiles.length > 24
      || !Array.isArray(raw.commands) || raw.commands.length > 24) {
    throw new Error('Terminal configuration needs version 1 and lists of up to 24 profiles and 24 commands.');
  }
  const profileIds = new Set();
  const profiles = raw.profiles.map((entry, index) => {
    const label = 'Terminal profile ' + (index + 1);
    const info = identity(entry, profileIds, label);
    const profile = text(entry.profile, 128, label + ' name in Windows Terminal');
    const cwd = directory(entry.directory, env, label + ' directory');
    if (/[";]/.test(profile) || profile.startsWith('-') || cwd.includes(';')) {
      throw new Error(label + ' contains unsupported Windows Terminal argument characters.');
    }
    return { ...info, profile, directory: cwd };
  });

  const commandIds = new Set();
  const commands = raw.commands.map((entry, index) => {
    const label = 'Terminal command ' + (index + 1);
    const info = identity(entry, commandIds, label);
    const executable = expandEnv(text(entry.program, 1024, label + ' executable'), env).replaceAll('/', '\\');
    if (!/\.exe$/i.test(executable) || /["<>|?*\u0000-\u001f]/.test(executable)
        || (/[\\:]/.test(executable) && !absoluteWindowsPath(executable))) {
      throw new Error(label + ' needs an .exe name or an absolute executable path.');
    }
    const program = path.win32.normalize(executable);
    const input = entry.args ?? [];
    if (!Array.isArray(input) || input.length > 24
        || input.some((arg) => typeof arg !== 'string' || arg.length > 2048 || arg.includes('\0'))) {
      throw new Error(label + ' needs a list of up to 24 text arguments.');
    }
    const args = input.map((arg) => expandEnv(arg, env));
    const cwd = directory(entry.directory, env, label + ' directory');
    const kind = entry.kind ?? 'task';
    if (kind !== 'task' && kind !== 'server') throw new Error(label + ' kind must be task or server.');
    if (entry.captureOutput !== undefined && typeof entry.captureOutput !== 'boolean') {
      throw new Error(label + ' captureOutput must be true or false.');
    }
    const server = kind === 'server';
    const captureOutput = entry.captureOutput === true;
    const ceiling = server ? 28_800_000 : 900_000;
    const timeout = entry.timeoutMs ?? (server ? 3_600_000 : 30_000);
    if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > ceiling) {
      throw new Error(`${label} timeout must be between 1000 and ${ceiling} milliseconds.`);
    }
    const fingerprintParts = [program, args, cwd, timeout];
    if (captureOutput || server) fingerprintParts.push(kind, captureOutput);
    const fingerprint = createHash('sha256').update(JSON.stringify(fingerprintParts)).digest('hex');
    return { ...info, program, args, directory: cwd, timeout, kind, captureOutput, fingerprint };
  });
  return { profiles, commands };
}

function readJson(file) {
  if (fs.statSync(file).size > MAX_BYTES) throw new Error('Terminal settings exceed 128 KiB.');
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

class TerminalView {
  /**
   * @param {string} file
   * @param {{ platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv, run?: (action: Record<string, any>, pageApps?: any, options?: Record<string, any>) => Promise<any>, openConfig?: (file: string) => any,
   *   openLog?: (file: string) => Promise<string>, spawnChild?: typeof spawn, now?: () => number, monotonic?: () => number,
   *   log?: (...args: any[]) => void }} [options]
   */
  constructor(file, { platform = process.platform, env = process.env, run, openConfig, openLog, spawnChild = spawn,
    now = Date.now, monotonic = () => performance.now(), log = () => {} } = {}) {
    this.file = file;
    this.historyFile = path.join(path.dirname(file), 'terminal-runs.json');
    this.logs = new TerminalRunLogs(path.join(path.dirname(file), 'terminal-logs'));
    this.platform = platform;
    this.env = env;
    this.run = run;
    this.openConfig = openConfig;
    this.openLog = openLog;
    this.spawnChild = spawnChild;
    this.now = now;
    this.monotonic = monotonic;
    this.log = log;
    this.running = new Map();
    this.config = { profiles: [], commands: [] };
    this.initialLogPrune = true;
  }

  settings() {
    this.message = '';
    try {
      let raw;
      try { raw = readJson(this.file); } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        raw = DEFAULT_CONFIG;
      }
      this.config = normalizeTerminalConfig(raw, this.env);
    } catch (err) {
      this.message = err instanceof SyntaxError ? 'Terminal configuration contains invalid JSON.' : err.message;
    }
    return this.config;
  }

  history() {
    if (this.results) return this.results;
    this.results = new Map();
    try {
      const data = readJson(this.historyFile);
      for (const item of data?.version === 1 && Array.isArray(data.runs) ? data.runs.slice(0, MAX_RESULTS) : []) {
        if (typeof item?.id === 'string' && ENTRY_ID.test(item.id) && OUTCOMES.has(item.status) && /^[a-f0-9]{64}$/.test(item.fingerprint)
            && Number.isSafeInteger(item.finishedAt) && Number.isSafeInteger(item.durationMs) && item.durationMs >= 0
            && (item.exitCode === null || Number.isSafeInteger(item.exitCode))) {
          this.results.set(item.id, item);
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.log('Could not read Terminal command history:', err.message);
        this.initialLogPrune = false;
      }
    }
    return this.results;
  }

  pruneLogs() {
    const retained = new Set([...this.results.values()].map(({ logRun }) => logRun));
    for (const active of this.running.values()) retained.add(active.id);
    try { this.logs.prune(retained); }
    catch { this.log('Could not prune Terminal command logs.'); }
  }

  snapshot() {
    if (this.platform !== 'win32') return { status: 'unsupported', profiles: [], commands: [] };
    const { profiles, commands } = this.settings();
    const history = this.history();
    if (this.initialLogPrune) {
      this.initialLogPrune = false;
      this.pruneLogs();
    }
    const listed = new Map(commands.map((entry) => [entry.id, entry]));
    for (const active of this.running.values()) listed.set(active.entry.id, active.entry);
    return {
      status: this.message ? 'invalid' : 'ready', message: this.message, profiles,
      commands: [...listed.values()].map((entry) => {
        const state = this.commandState(entry, history);
        return { ...state, program: path.win32.basename(entry.program), revision: entry.fingerprint, running: Boolean(state.active) };
      }),
    };
  }

  configuredCommands() {
    if (this.platform !== 'win32') return { status: 'unsupported', commands: [] };
    const { commands } = this.settings();
    if (this.message) return { status: 'invalid', commands: [] };
    const history = this.history();
    return { status: 'ready', commands: commands.map((entry) => ({ ...this.commandState(entry, history),
      reviewRevision: this.reviewable(entry) ? entry.fingerprint : null,
    })) };
  }

  reviewable(entry) {
    return Boolean(localProjectDirectory(entry.program) && localProjectDirectory(entry.directory));
  }

  registeredCommand(id, revision) {
    if (this.platform !== 'win32') return null;
    const { commands } = this.settings();
    const entry = !this.message && commands.find(({ id: candidate, fingerprint }) => candidate === id && fingerprint === revision);
    return entry && this.reviewable(entry) ? entry : null;
  }

  launchRegistered(id, revision, { target, verify, onFinish }) {
    const entry = this.registeredCommand(id, revision);
    if (!entry || this.running.has(id) || this.running.size >= MAX_RUNNING || !verify(entry)) return null;
    return this.start({ ...entry, program: target.program, directory: target.directory }, onFinish);
  }

  commandState({ id, name, directory, kind, fingerprint }, history) {
    const run = this.running.get(id);
    const active = run?.entry.fingerprint === fingerprint ? run.snapshot() : null;
    const saved = history.get(id);
    const last = saved?.fingerprint === fingerprint
      ? { status: saved.status, exitCode: saved.exitCode, durationMs: saved.durationMs } : null;
    if (last && this.logs.file(saved.logRun)) last.logRun = saved.logRun;
    return { id, name, directory, kind, active, last };
  }

  async change(command) {
    if (this.platform !== 'win32') throw new Error('Windows Terminal is unavailable on this system.');
    if (command?.action === 'configure') {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      try { fs.writeFileSync(this.file, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', { flag: 'wx' }); } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
      return this.openConfig(this.file);
    }

    if (command?.action === 'stop-command') {
      const active = this.running.get(command.id);
      if (!active || active.id !== command.run) throw new Error('This command run is no longer active.');
      if (!active.stop()) throw new Error('Windows did not stop this command process.');
      return { ok: true };
    }
    if (command?.action === 'open-log') return this.showLog(command);

    const settings = this.settings();
    if (this.message) throw new Error('Fix the Windows Terminal configuration before launching a command.');
    if (command?.action === 'open-profile') {
      const selected = settings.profiles.find(({ id }) => id === command.id);
      if (!selected) throw new Error('The selected Terminal profile is unavailable.');
      return this.run({ type: 'launch', target: 'wt.exe', args: [
        'new-tab', '--profile', selected.profile, '--startingDirectory', selected.directory,
      ] });
    }
    if (command?.action === 'run-command') {
      const selected = settings.commands.find(({ id }) => id === command.id);
      if (!selected) throw new Error('The pinned command is unavailable.');
      if (command.revision !== undefined && command.revision !== selected.fingerprint) throw new Error('The pinned command changed. Reload settings.');
      if (this.running.has(selected.id)) throw new Error('The selected command is already running.');
      if (this.running.size >= MAX_RUNNING) throw new Error('Wait for a running command to finish before starting another.');
      this.start(selected);
      return { ok: true };
    }
    throw new Error('Unknown Windows Terminal command.');
  }

  async showLog(command) {
    if (typeof command.run !== 'string' || !RUN_ID.test(command.run) || !this.openLog) throw new Error('This command log is unavailable.');
    const active = this.running.get(command.id);
    let file;
    if (active?.id === command.run && active.output) file = this.saveLog(active.id, active.output);
    else if (!active) {
      const { commands } = this.settings();
      const current = !this.message && commands.find(({ id }) => id === command.id);
      const record = current && this.history().get(current.id);
      if (record && record.fingerprint === current.fingerprint && record.logRun === command.run) file = this.logs.file(record.logRun);
    }
    if (!file) throw new Error('This command log is unavailable.');
    if (await this.openLog(file)) throw new Error('Windows could not open the command log.');
    return { ok: true };
  }

  saveLog(id, output) {
    try {
      return this.logs.save(id, output);
    } catch {
      this.log('Could not save the Terminal command log.');
      return null;
    }
  }

  record(entry, attempt, result, output) {
    const history = this.history();
    const logRun = output && this.saveLog(attempt.id, output) ? attempt.id : undefined;
    this.running.delete(entry.id);
    history.set(entry.id, { id: entry.id, fingerprint: entry.fingerprint, ...result, finishedAt: this.now(), logRun });
    const runs = [...history.values()].sort((a, b) => b.finishedAt - a.finishedAt).slice(0, MAX_RESULTS);
    this.results = new Map(runs.map((item) => [item.id, item]));
    try {
      fs.mkdirSync(path.dirname(this.historyFile), { recursive: true });
      writeAtomic(this.historyFile, JSON.stringify({ version: 1, runs }) + '\n');
      this.pruneLogs();
    } catch (err) {
      this.log('Could not save Terminal command history:', err.message);
    }
    return { ...result, hasLog: Boolean(logRun) };
  }

  start(entry, onFinish) {
    const attempt = new TerminalProcess(entry, { spawn: this.spawnChild, env: this.env, monotonic: this.monotonic,
      onFinish: (result, output) => {
        const outcome = this.record(entry, attempt, result, output);
        onFinish?.(outcome);
      } });
    this.running.set(entry.id, attempt);
    attempt.launch();
    return attempt;
  }

  close() {
    for (const attempt of this.running.values()) attempt.close();
  }
}

module.exports = { TerminalView, normalizeTerminalConfig };
