// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { writeAtomic } = require('./write-atomic');

const LIMITS = Object.freeze({ entries: 24, items: 20, title: 64, note: 2_000, task: 120 });
const ID = /^[a-z0-9_-]{1,48}$/i;
const textControls = /[\u0000-\u0008\u000b-\u001f\u007f]/;

function text(value, max, label, { multiline = false, optional = false } = {}) {
  const content = typeof value === 'string' && multiline ? value.replace(/\r\n?/g, '\n') : value;
  if (typeof content !== 'string' || content.length > max || textControls.test(content) || (!multiline && /[\t\n]/.test(content))) {
    throw new Error(`${label} needs text up to ${max} characters.`);
  }
  const clean = content.trim();
  if (!clean && !optional) throw new Error(`${label} is required.`);
  return multiline ? content : clean;
}

function entries(value, limit, label, read) {
  if (!Array.isArray(value) || value.length > limit) throw new Error(`Use up to ${limit} ${label.toLowerCase()}.`);
  const ids = new Set();
  return value.map((entry) => {
    if (!entry || typeof entry.id !== 'string' || !ID.test(entry.id) || ids.has(entry.id)) {
      throw new Error(`${label} need unique IDs.`);
    }
    ids.add(entry.id);
    return { id: entry.id, ...read(entry) };
  });
}

function normalizeNotes(value) {
  if (value?.version !== 1) throw new Error('Unsupported notes format.');
  return {
    version: 1,
    notes: entries(value.notes, LIMITS.entries, 'Notes', ({ title, body }) => ({
      title: text(title, LIMITS.title, 'Note title'),
      body: text(body, LIMITS.note, 'Note', { multiline: true, optional: true }),
    })),
    lists: entries(value.lists, LIMITS.entries, 'Checklists', ({ title, items }) => ({
      title: text(title, LIMITS.title, 'Checklist title'),
      items: entries(items, LIMITS.items, 'Tasks', ({ label, done }) => {
        if (typeof done !== 'boolean') throw new Error('Each task needs a completion state.');
        return { label: text(label, LIMITS.task, 'Task'), done };
      }),
    })),
  };
}

function currentFile(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { revision: 'new', document: { version: 1, notes: [], lists: [] } };
  }
  const document = normalizeNotes(JSON.parse(raw.replace(/^\uFEFF/, '')));
  return { revision: createHash('sha256').update(raw).digest('hex'), document };
}

class NotesView {
  constructor(file) { this.file = file; }

  snapshot() {
    try {
      return { status: 'ready', limits: LIMITS, ...currentFile(this.file) };
    } catch {
      return { status: 'unavailable', error: 'The local notes file could not be read.' };
    }
  }

  change(command) {
    if (command?.action !== 'save') throw new Error('Unknown notes command.');
    const document = normalizeNotes(command.document);
    const current = /** @type {{ status: string, revision?: string, error?: string }} */ (this.snapshot());
    if (current.status !== 'ready') throw new Error(current.error);
    if (command.revision !== current.revision) throw new Error('Notes changed on disk. Cancel this edit to reload them.');
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const raw = JSON.stringify(document, null, 2) + '\n';
    writeAtomic(this.file, raw);
    return { ok: true, snapshot: { status: 'ready', limits: LIMITS, document, revision: createHash('sha256').update(raw).digest('hex') } };
  }
}

module.exports = { NotesView, normalizeNotes };
