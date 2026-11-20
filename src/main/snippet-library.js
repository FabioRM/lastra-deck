// @ts-check
'use strict';

const { createHash } = require('node:crypto');
const { readMonitorConfig, openMonitorConfig } = require('./monitoring-config');
const { snippetFields, snippetDraft } = require('../shared/snippets');

const KINDS = new Set(['prompt', 'reply', 'text']);
const ENTRY_ID = /^[a-z0-9_-]{1,48}$/;

function normalizeSnippets(raw) {
  if (raw?.version !== 1 || !Array.isArray(raw.snippets) || raw.snippets.length > 60) {
    throw new Error('Use version 1 and a list of up to 60 snippets.');
  }
  const seen = new Set();
  return raw.snippets.map((item, index) => {
    const label = 'Snippet ' + (index + 1);
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    const { id, kind = 'text', text: template } = item ?? {};
    if (typeof id !== 'string' || !ENTRY_ID.test(id) || seen.has(id)) throw new Error(label + ' needs a unique lowercase ID.');
    if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error(label + ' needs a name up to 80 characters.');
    if (!KINDS.has(kind)) throw new Error(label + ' needs a supported kind.');
    if (typeof template !== 'string' || !template.trim() || template.length > 6_000 || template.includes('\0')) {
      throw new Error(label + ' needs text up to 6000 characters.');
    }
    const fields = snippetFields(template);
    if (fields.length > 8) throw new Error(label + ' can have up to eight fill-in fields.');
    const revision = createHash('sha256').update(kind + '\0' + template).digest('hex');
    seen.add(id);
    return { id, name, kind, template, fields, revision };
  });
}

class SnippetLibrary {
  constructor(file, { openConfig, copyText }) {
    this.file = file;
    this.openConfig = openConfig;
    this.copyText = copyText;
  }

  read(kind) {
    const entries = readMonitorConfig(this.file, 'snippet library', normalizeSnippets);
    return kind ? entries.filter((entry) => entry.kind === kind) : entries;
  }

  snapshot(kind) {
    try { return { snippets: this.read(kind), message: null }; }
    catch (err) { return { snippets: [], message: err.message }; }
  }

  async change(command, kind) {
    if (command?.action === 'edit-snippets') {
      return openMonitorConfig(this.file, 'snippet library', 'snippets', this.openConfig);
    }
    if (command?.action !== 'copy-snippet') throw new Error('Unknown snippet command.');
    const entry = this.read(kind).find(({ id }) => id === command.id);
    if (!entry || command.revision !== entry.revision) throw new Error('This snippet changed. Reload it before copying.');
    const { values } = command;
    if (values !== undefined && (!values || typeof values !== 'object' || Array.isArray(values))) {
      throw new Error('Enter the snippet fields before copying.');
    }
    const draft = snippetDraft(entry.template, values);
    if (draft.missing.length) throw new Error('Fill in every snippet field before copying.');
    this.copyText(draft.text);
    return { ok: true };
  }
}

module.exports = { SnippetLibrary, normalizeSnippets };
