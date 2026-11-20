// @ts-check
'use strict';

const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { writeAtomic } = require('./write-atomic');

const DAY = 86_400_000;
const RETAIN_MS = 7 * DAY;
const LIMIT = 256;
const MAX_FILE_BYTES = 128 * 1024;
const MANUAL = ['deployment', 'launch'];
const SERVICE = ['service-down', 'service-recovered'];
const LOOPBACK = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/;
const PRIVATE_QUERY = /^(?:access[_-]?token|auth(?:orization)?|api[_-]?key|password|token)$/i;
const VALID_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const VALID_HASH = /^[a-f0-9]{64}$/;
const VALID_EVENT = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const text = (input) => typeof input === 'string' && /^[^\p{Cc}\p{Cf}]{1,80}$/u.test(input.trim()) ? input.trim() : null;
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const fail = (message) => ({ ok: false, message });

function grafanaBase(value) {
  if (value === null || value === '') return null;
  let url;
  if (typeof value === 'string' && value.length <= 2048 && !/[\p{Cc}\p{Cf}]/u.test(value)) {
    try { url = new URL(value.trim()); } catch {}
  }
  if (!url || !(url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.test(url.hostname)))
      || url.username || url.password || [...url.searchParams.keys()].some((key) => PRIVATE_QUERY.test(key))) {
    throw new Error('Enter an HTTPS Grafana dashboard URL or a loopback HTTP URL without credentials.');
  }
  return url.href;
}

function grafanaLink(base, range) {
  if (!base) throw new Error('Save a Grafana dashboard URL first.');
  if (!record(range) || Object.keys(range).some((key) => key !== 'from' && key !== 'to')
      || !Number.isSafeInteger(range.from) || !Number.isSafeInteger(range.to) || range.from < 0
      || range.to <= range.from || range.to - range.from > DAY) throw new Error('That chart time range is unavailable.');
  const url = new URL(grafanaBase(base));
  url.searchParams.delete('time');
  url.searchParams.delete('time.window');
  url.searchParams.set('from', String(range.from));
  url.searchParams.set('to', String(range.to));
  return url.href;
}

function eventFrom(item) {
  const label = text(item?.label);
  if (!item || typeof item.id !== 'string' || !VALID_EVENT.test(item.id) || !label || ![...MANUAL, ...SERVICE].includes(item.kind)
      || !Number.isSafeInteger(item.at) || item.at < 0 || item.at > 8.64e15) throw new Error('Invalid incident marker');
  return { id: item.id, kind: item.kind, label, at: item.at };
}

function capEvents(events, now) {
  return events.filter(({ at }) => now - at <= RETAIN_MS).sort((a, b) => a.at - b.at).slice(-LIMIT);
}

function serviceFingerprint({ kind, target, port, record: queryType, expectedStatus, warningDays, maxAgeSeconds }) {
  return createHash('sha256').update(JSON.stringify([kind, target, port, queryType, expectedStatus, warningDays, maxAgeSeconds])).digest('hex');
}

class IncidentTimeline {
  /**
   * @param {string} file
   * @param {{ now?: () => number, id?: () => string, onChange?: (snapshot: any) => void }} [options]
   */
  constructor(file, { now = Date.now, id = randomUUID, onChange = () => {} } = {}) {
    this.file = file;
    this.now = now;
    this.id = id;
    this.onChange = onChange;
    this.data = { events: [], open: {}, dashboard: null };
    try {
      const info = fs.statSync(file);
      if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new Error('Invalid timeline file');
      const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      if (data?.version !== 1 || !Array.isArray(data.events) || data.events.length > LIMIT || !record(data.open)
          || Object.entries(data.open).length > 32 || Object.entries(data.open).some(([key, hash]) => !VALID_ID.test(key) || !VALID_HASH.test(hash))) {
        throw new Error('Invalid timeline file');
      }
      this.data = { events: capEvents(data.events.map(eventFrom), this.now()), open: data.open, dashboard: grafanaBase(data.dashboard) };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.loadFailed = true;
        this.warning = 'Could not read the saved timeline. New events are available during this session.';
      }
    }
  }

  snapshot() {
    return { events: capEvents(this.data.events, this.now()), dashboard: this.data.dashboard, warning: this.warning ?? null };
  }

  update(next, { live = false } = {}) {
    const data = { ...next, events: capEvents(next.events, this.now()) };
    if (this.loadFailed) {
      if (live) this.data = data;
      this.onChange(this.snapshot());
      return false;
    }
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      writeAtomic(this.file, JSON.stringify({ version: 1, ...data }) + '\n');
      this.data = data;
      this.warning = null;
    } catch {
      this.warning = 'Could not save the incident timeline.';
      if (live) this.data = data;
      this.onChange(this.snapshot());
      return false;
    }
    this.onChange(this.snapshot());
    return true;
  }

  withMarker(kind, label, at = this.now()) {
    return [...this.data.events, eventFrom({ id: this.id(), kind, label, at })];
  }

  observe(check, status) {
    if (!['down', 'up'].includes(status) || typeof check?.id !== 'string' || !VALID_ID.test(check.id)) return;
    const label = text(check.name);
    if (!label) return;
    const key = check.id;
    const prior = Object.hasOwn(this.data.open, key) ? this.data.open[key] : undefined;
    const fingerprint = serviceFingerprint(check);
    if ((status === 'down' && prior === fingerprint) || (status === 'up' && !prior)) return;
    const open = { ...this.data.open };
    if (status === 'down') {
      open[key] = fingerprint;
      this.update({ ...this.data, open, events: this.withMarker('service-down', label) }, { live: true });
    } else {
      delete open[key];
      const events = prior === fingerprint ? this.withMarker('service-recovered', label) : this.data.events;
      this.update({ ...this.data, open, events }, { live: true });
    }
  }

  retainChecks(ids) {
    const known = new Set(ids);
    const records = Object.entries(this.data.open);
    const active = records.filter(([key]) => known.has(key));
    if (active.length !== records.length) this.update({ ...this.data, open: Object.fromEntries(active) }, { live: true });
  }

  async request(command, openExternal) {
    if (!record(command)) return fail('Choose an incident timeline command.');
    try {
      switch (command.type) {
        case 'read': return { ok: true, timeline: this.snapshot() };
        case 'mark': {
          const label = text(command.label);
          if (!MANUAL.includes(command.kind) || !label) return fail('Enter a launch or deployment name of up to 80 characters.');
          return this.update({ ...this.data, events: this.withMarker(command.kind, label) })
            ? { ok: true, timeline: this.snapshot() } : fail(this.warning);
        }
        case 'configure': {
          const dashboard = grafanaBase(command.url);
          return this.update({ ...this.data, dashboard }) ? { ok: true, timeline: this.snapshot() } : fail(this.warning);
        }
        case 'open':
          await openExternal(grafanaLink(this.data.dashboard, command.range));
          return { ok: true };
        default: return fail('Choose an incident timeline command.');
      }
    } catch (error) { return fail(error.message); }
  }
}

module.exports = { IncidentTimeline, grafanaBase, grafanaLink };
