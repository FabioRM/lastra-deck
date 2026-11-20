// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { writeAtomic } = require('./write-atomic');

const LIMIT = 150;
const STATUS = ['active', 'recovered', 'retired'];
const valid = (item) => item && typeof item.id === 'string' && typeof item.name === 'string'
  && STATUS.includes(item.status) && Number.isFinite(item.updatedAt) && Math.abs(item.updatedAt) <= 8.64e15
  && Number.isInteger(item.occurrences);

class AlertInbox {
  /**
   * @param {string} file
   * @param {{ now?: () => number, onChange?: (entries: any[]) => void }} [options]
   */
  constructor(file, { now = Date.now, onChange = () => {} } = {}) {
    this.file = file;
    this.now = now;
    this.onChange = onChange;
    this.entries = new Map();
    this.load();
  }

  load() {
    try {
      const file = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (file?.version !== 1 || !Array.isArray(file.entries) || !file.entries.every(valid)) throw new Error();
      this.entries = new Map(file.entries.slice(0, LIMIT).map((item) => [item.id, item]));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.loadFailed = true;
        this.warning = 'Could not read saved alerts. New alerts are available during this session.';
      }
    }
  }

  snapshot() {
    const entries = [...this.entries.values()].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active')
      || b.updatedAt - a.updatedAt);
    return { entries, warning: this.warning };
  }

  unacknowledgedCount() {
    if (this.loadFailed) return null;
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.status === 'active' && entry.acknowledgedAt == null) count++;
    }
    return count;
  }

  store() {
    this.entries = new Map(this.snapshot().entries.slice(0, LIMIT).map((item) => [item.id, item]));
    this.onChange([...this.entries.values()]);
    if (this.loadFailed) return false;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      writeAtomic(this.file, JSON.stringify({ version: 1, entries: [...this.entries.values()] }) + '\n');
      this.warning = null;
      return true;
    } catch {
      this.warning = 'Could not save alerts. Changes are available during this session.';
      return false;
    }
  }

  update({ id, name, viewId, targetId, source }, status, detail) {
    const previous = this.entries.get(id);
    if (status !== 'active' && previous?.status !== 'active') return;
    if (previous?.status === status && previous.detail === detail && previous.name === name) return;
    const opened = status === 'active' && previous?.status !== 'active';
    const now = this.now();
    this.entries.set(id, {
      id, name, viewId, targetId, source, status, detail, updatedAt: now,
      openedAt: opened ? now : previous.openedAt,
      acknowledgedAt: opened ? null : previous.acknowledgedAt,
      occurrences: opened ? (previous?.occurrences ?? 0) + 1 : previous.occurrences,
    });
    this.store();
  }

  retireMissing(source, ids) {
    const live = new Set(ids);
    let changed = false;
    for (const [id, entry] of this.entries) {
      if (entry.source === source && entry.status !== 'retired' && !live.has(entry.id)) {
        this.entries.set(id, { ...entry, status: 'retired', updatedAt: this.now() });
        changed = true;
      }
    }
    if (changed) this.store();
  }

  change(command) {
    const item = this.entries.get(command?.id);
    if (command?.action !== 'acknowledge' || !item) throw new Error('That alert is unavailable');
    if (item.acknowledgedAt == null) this.acknowledge(item);
    return { ok: true };
  }

  acknowledgeActive(expected) {
    if (!expected || this.entries.get(expected.id) !== expected || expected.status !== 'active' || expected.acknowledgedAt != null) return null;
    return this.acknowledge(expected);
  }

  acknowledge(item) {
    const acknowledgedAt = this.now();
    this.entries.set(item.id, { ...item, acknowledgedAt });
    return { acknowledgedAt, persisted: this.store() };
  }
}

module.exports = { AlertInbox };
