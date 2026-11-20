// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHmac, randomBytes } = require('node:crypto');
const { Worker } = require('node:worker_threads');
const { localProjectDirectory } = require('../../extensions/lastra-vscode/project-location');
const { writeAtomic } = require('./write-atomic');
const { MAX_BYTES } = require('./calendar-agenda');

const PARSE_TIMEOUT = 2500;
const EMPTY_REFRESH = 60_000;
const TOKEN = /^[a-f0-9]{32}$/;
const changed = 'The agenda changed. Read the current event again.';

class AgendaError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function sourcePath(file) {
  if (typeof file !== 'string' || file.length > 1024 || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.ics') return null;
  return process.platform === 'win32' ? localProjectDirectory(file) : path.normalize(file);
}

function initialSelection(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 4096) throw new Error('Invalid agenda settings');
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    const source = data.source === null ? null : sourcePath(data.source);
    if (data.version !== 1 || (data.source !== null && !source)) throw new Error('Invalid agenda settings');
    return { source, sourceError: false };
  } catch (error) {
    return { source: null, sourceError: error.code !== 'ENOENT' };
  }
}

function signature(stat) { return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`; }

async function fileStamp(file) {
  const resolved = sourcePath(await fs.promises.realpath(file));
  const same = process.platform === 'win32' ? resolved?.toLowerCase() === file.toLowerCase() : resolved === file;
  const stat = await fs.promises.lstat(file, { bigint: true });
  if (!same || !stat.isFile()) throw new AgendaError('unavailable', 'The selected calendar file is unavailable.');
  if (stat.size > BigInt(MAX_BYTES)) throw new AgendaError('invalid', 'Choose a calendar file up to 512 KiB.');
  return signature(stat);
}

async function inputAt(file, stamp) {
  const input = await fs.promises.open(file, 'r');
  try {
    const stat = await input.stat({ bigint: true });
    if (!stat.isFile() || signature(stat) !== stamp) throw new AgendaError('unavailable', changed);
    const size = Number(stat.size);
    const buffer = Buffer.alloc(size + 1);
    let read = 0;
    while (read < buffer.length) {
      const { bytesRead } = await input.read(buffer, read, buffer.length - read, read);
      if (!bytesRead) break;
      read += bytesRead;
    }
    if (read !== size || signature(await input.stat({ bigint: true })) !== stamp) throw new AgendaError('unavailable', changed);
    return buffer.toString('utf8', 0, read);
  } finally { await input.close(); }
}

function parseCalendar(input, now) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'calendar-agenda-worker.js'), { workerData: { input, now },
      resourceLimits: { maxOldGenerationSizeMb: 48, stackSizeMb: 4 } });
    let settled = false;
    const finish = (value, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate().catch(() => {});
      if (error) reject(error);
      else resolve(value);
    };
    const invalid = () => new AgendaError('invalid', 'The selected calendar file could not be read as an iCalendar schedule.');
    const timer = setTimeout(() => finish(null, new AgendaError('invalid', 'The calendar schedule is too complex to read.')), PARSE_TIMEOUT);
    worker.once('message', (result) => result.invalid ? finish(null, invalid()) : finish(result.value));
    worker.once('error', () => finish(null, invalid()));
    worker.once('exit', () => finish(null, invalid()));
  });
}

/**
 * @typedef {object} DashboardAgendaOptions
 * @property {() => Promise<string | null | undefined>} [choose]
 * @property {(url: string) => Promise<unknown> | unknown} [open]
 * @property {() => number} [now]
 * @property {(input: string, now: number) => Promise<any>} [parse]
 * @property {Buffer} [key]
 */

class DashboardAgenda {
  /**
   * @param {string} file
   * @param {DashboardAgendaOptions} [options]
   */
  constructor(file, { choose, open, now = Date.now, parse = parseCalendar, key = randomBytes(32) } = {}) {
    this.file = file;
    this.choose = choose;
    this.open = open;
    this.now = now;
    this.parse = parse;
    this.key = key;
    Object.assign(this, initialSelection(file));
    this.revision = 0;
  }

  async parseSource(file, stamp, at) {
    const schedule = await this.parse(await inputAt(file, stamp), at);
    if (await fileStamp(file) !== stamp) throw new AgendaError('unavailable', changed);
    return { file, stamp, at, schedule };
  }

  async sample() {
    const file = this.source;
    const revision = this.revision;
    if (!file) return null;
    const stamp = await fileStamp(file);
    if (file !== this.source || revision !== this.revision) throw new AgendaError('unavailable', changed);
    const at = this.now();
    const cached = this.cache;
    if (cached?.file === file && cached.stamp === stamp && at >= cached.at
        && (cached.schedule.next ? at < cached.schedule.next.lastAt : at - cached.at < EMPTY_REFRESH)) return cached;
    const failed = this.failed;
    if (failed?.file === file && failed.stamp === stamp && at >= failed.at && at - failed.at < EMPTY_REFRESH) throw failed.error;
    if (!this.inFlight) {
      const promise = this.parseSource(file, stamp, at).catch((error) => {
        if (this.source === file && this.revision === revision && error.status === 'invalid') this.failed = { file, stamp, at, error };
        throw error;
      }).finally(() => { if (this.inFlight === promise) this.inFlight = null; });
      this.inFlight = promise;
    }
    const result = await this.inFlight;
    if (file !== this.source || revision !== this.revision || result.file !== file || result.stamp !== stamp) throw new AgendaError('unavailable', changed);
    this.cache = result;
    return result;
  }

  token(sample) {
    const { uid, startAt, joinUrl } = sample.schedule.next;
    return createHmac('sha256', this.key).update(JSON.stringify([this.revision, sample.file, sample.stamp, uid, startAt, joinUrl])).digest('hex').slice(0, 32);
  }

  async snapshot() {
    if (!this.source) return { status: this.sourceError ? 'invalid' : 'setup', selected: false, event: null };
    try {
      const sample = await this.sample();
      const { next, partial } = sample.schedule;
      if (!next || this.now() >= next.lastAt) return { status: 'empty', selected: true, partial, event: null };
      const { title, startAt, endAt, allDay, joinUrl } = next;
      return { status: 'ready', selected: true, partial,
        event: { title, startAt, endAt, allDay, active: startAt <= this.now(), join: joinUrl ? this.token(sample) : null } };
    } catch (error) {
      return { status: error instanceof AgendaError ? error.status : 'unavailable', selected: true, event: null,
        message: error instanceof AgendaError ? error.message : 'The selected calendar file is unavailable.' };
    }
  }

  persist(source) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      writeAtomic(this.file, JSON.stringify({ version: 1, source }) + '\n');
    } catch { throw new AgendaError('unavailable', 'Lastra could not save the selected calendar.'); }
    this.source = source;
    this.sourceError = false;
    this.revision++;
    this.cache = null;
    this.failed = null;
  }

  async pick(guard) {
    if (this.picking) throw new AgendaError('unavailable', 'A calendar picker is already open.');
    this.picking = true;
    const revision = this.revision;
    try {
      const selected = await this.choose();
      if (!guard() || revision !== this.revision) throw new AgendaError('unavailable', changed);
      if (!selected) return;
      const local = sourcePath(selected);
      let file;
      try { file = local && sourcePath(await fs.promises.realpath(local)); } catch { /* The file may have moved. */ }
      if (!file) throw new AgendaError('invalid', 'Choose a local .ics calendar file.');
      const stamp = await fileStamp(file);
      if (!guard() || revision !== this.revision) throw new AgendaError('unavailable', changed);
      const sample = await this.parseSource(file, stamp, this.now());
      if (!guard() || revision !== this.revision) throw new AgendaError('unavailable', changed);
      this.persist(file);
      this.cache = sample;
    } finally { this.picking = false; }
  }

  async join(token, guard) {
    const revision = this.revision;
    let sample;
    try { sample = await this.sample(); } catch { throw new AgendaError('unavailable', changed); }
    const next = sample?.schedule.next;
    if (!next?.joinUrl || this.token(sample) !== token || await fileStamp(sample.file).catch(() => null) !== sample.stamp
        || this.now() >= next.lastAt || revision !== this.revision || !guard()) {
      throw new AgendaError('unavailable', changed);
    }
    try { await this.open(next.joinUrl); }
    catch { throw new AgendaError('unavailable', 'Windows could not open the meeting link.'); }
  }

  async request(command, guard) {
    try {
      const type = command?.type;
      if (!['read', 'pick', 'clear', 'join'].includes(type) || Array.isArray(command)
          || Object.keys(command).some((key) => key !== 'type' && !(type === 'join' && key === 'token'))
          || (type === 'join' && (typeof command.token !== 'string' || !TOKEN.test(command.token)))) {
        throw new AgendaError('invalid', 'Choose an agenda command.');
      }
      if (type !== 'read' && !guard()) throw new AgendaError('unavailable', 'Open the Dashboard to use the agenda.');
      if (type === 'pick') await this.pick(guard);
      if (type === 'clear') this.persist(null);
      if (type === 'join') { await this.join(command.token, guard); return { ok: true }; }
      return { ok: true, state: await this.snapshot() };
    } catch (error) {
      return { ok: false, message: error instanceof AgendaError ? error.message : 'The selected calendar file is unavailable.' };
    }
  }
}

module.exports = { DashboardAgenda, parseCalendar };
