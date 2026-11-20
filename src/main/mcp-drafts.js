// @ts-check
'use strict';

const { randomBytes } = require('node:crypto');
const { validateProfile } = require('./profile');
const { offlineLayout } = require('./mcp-layout');
const { remapKeys, BAR_GRID } = require('../shared/widget-layout');

const DATA_ID = /^[a-z0-9_-]{1,40}$/i;
const DRAFT_ID = /^[a-f0-9]{24}$/;
const MAX_DRAFTS = 24;
const MAX_CLIENT_DRAFTS = 6;
const MAX_EDITS = 32;
const PROFILE_SETTINGS = new Set(['name', 'locale', 'shortcutLanguage', 'shortcutLayouts', 'gestures', 'webApps', 'macros', 'variables']);
const PAGE_SETTINGS = new Set(['name', 'apps', 'appIds', 'windowTitle', 'priority', 'variables', 'folder']);
const EMPTY = { version: 2, pages: [{ id: 'home', name: 'Home', keys: [] }] };
const COMMANDS = ['create', 'inspect', 'edit', 'preview', 'discard'];
const EDITS = ['profile-settings', 'page-settings', 'resize-grid', 'add-page', 'reorder-pages', 'remove-page',
  'set-key', 'move-key', 'duplicate-key', 'resize-key', 'remove-key', 'set-widget', 'move-widget', 'duplicate-widget', 'resize-widget', 'remove-widget'];
const TEXT = { type: 'string' };
const FOLDER = { type: 'array', maxItems: 4, items: { type: 'string', minLength: 1, maxLength: 32 } };
const SLOT = { type: 'integer', minimum: 0, maximum: 71 };
const GRID = { type: 'object', required: ['cols', 'rows'], properties: { cols: { type: 'integer' }, rows: { type: 'integer' } } };
const draftInput = {
  type: 'object', required: ['command'], additionalProperties: false,
  properties: {
    command: { enum: COMMANDS }, source: { enum: ['empty', 'active', 'supplied'] }, profile: { type: 'object' },
    draft: { type: 'string', pattern: '^[a-f0-9]{24}$' }, revision: { type: 'integer', minimum: 1 },
    edits: { type: 'array', minItems: 1, maxItems: MAX_EDITS, items: {
      type: 'object', required: ['op'], additionalProperties: false, properties: {
        op: { enum: EDITS }, id: TEXT, newId: TEXT, name: TEXT, source: TEXT, page: TEXT, surface: TEXT, toSurface: TEXT, folder: FOLDER,
        slot: SLOT, toSlot: SLOT, grid: GRID, span: GRID, key: { type: 'object' }, widget: { type: 'object' },
        settings: { type: 'object', properties: { folder: FOLDER, shortcutLayouts: { type: 'object' } } }, layout: { ...GRID, required: ['column', 'row', 'cols', 'rows'],
          properties: { ...GRID.properties, column: { type: 'integer' }, row: { type: 'integer' } } },
        ids: { type: 'array', items: TEXT },
      },
    } },
    page: { type: 'string' }, portrait: { type: 'boolean' },
  },
};
const draftOutput = {
  type: 'object', required: ['id'], properties: {
    id: { type: 'string' }, revision: { type: 'integer' }, activity: { type: 'string' }, discarded: { type: 'boolean' },
    pages: { type: 'array', items: { type: 'object' } }, bar: { type: 'object' }, layout: { type: 'object' },
  },
};

class DraftRequestError extends Error {}

function requireId(value, what, pattern = DATA_ID) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new DraftRequestError('Choose a valid ' + what + ' ID.');
  return value;
}

function index(value, count) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= count) throw new DraftRequestError('The slot is outside the grid.');
  return value;
}

function pageOf(profile, id) {
  const page = profile.pages.find((item) => item.id === id);
  if (!page) throw new DraftRequestError('The draft page is unavailable.');
  return page;
}

function changes(target, input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !allowed.has(key))) {
    throw new DraftRequestError('Choose supported settings for this draft edit.');
  }
  Object.assign(target, input);
}

function resizeGrid(profile, edit) {
  const { cols, rows } = edit.grid ?? {};
  if (!Number.isSafeInteger(cols) || cols < 1 || cols > 12 || !Number.isSafeInteger(rows) || rows < 1 || rows > 6) {
    throw new DraftRequestError('Choose grid columns from 1 to 12 and rows from 1 to 6.');
  }
  const grid = { cols, rows };
  const affected = edit.page === undefined
    ? profile.pages.filter((page) => !page.grid) : [pageOf(profile, edit.page)];
  for (const page of affected) {
    const keys = remapKeys(page.keys, page.grid ?? profile.grid, grid);
    if (!keys) throw new DraftRequestError('A key extends outside the proposed grid.');
    page.keys = keys;
  }
  if (edit.page === undefined) profile.grid = grid;
  else affected[0].grid = grid;
}

function newPage(profile, edit) {
  const id = requireId(edit.id, 'page');
  if (profile.pages.some((page) => page.id === id)) throw new DraftRequestError('A draft page already uses that ID.');
  const source = edit.source === undefined ? { keys: [], widgets: [] } : structuredClone(pageOf(profile, edit.source));
  profile.pages.push({ ...source, id, name: edit.name ?? id, ...(edit.folder !== undefined ? { folder: edit.folder } : {}) });
}

function destination(profile, name) {
  if (name === 'bar:') return { layout: profile.bar, grid: BAR_GRID };
  const layout = pageOf(profile, name);
  return { layout, grid: layout.grid ?? profile.grid };
}

function editKey(profile, edit) {
  const from = destination(profile, edit.surface);
  const at = index(edit.slot, from.grid.cols * from.grid.rows);
  if (edit.op === 'set-key') {
    if (!edit.key || typeof edit.key !== 'object' || Array.isArray(edit.key)) throw new DraftRequestError('Supply a key definition.');
    from.layout.keys[at] = edit.key;
    return;
  }
  const key = from.layout.keys[at];
  if (!key) throw new DraftRequestError('The draft slot has no key.');
  if (edit.op === 'remove-key') {
    from.layout.keys[at] = null;
    return;
  }
  if (edit.op === 'resize-key') {
    key.span = edit.span;
    return;
  }
  const to = destination(profile, edit.toSurface ?? edit.surface);
  const target = index(edit.toSlot, to.grid.cols * to.grid.rows);
  if (to.layout.keys[target]) throw new DraftRequestError('The destination already has a key.');
  if (edit.op === 'move-key') from.layout.keys[at] = null;
  to.layout.keys[target] = { ...structuredClone(key), ...(edit.id ? { id: requireId(edit.id, 'key') } : {}) };
}

function editWidget(profile, edit) {
  const from = destination(profile, edit.surface).layout.widgets;
  const at = from.findIndex(({ id }) => id === edit.id);
  if (edit.op === 'set-widget') {
    if (!edit.widget || typeof edit.widget !== 'object' || Array.isArray(edit.widget)) throw new DraftRequestError('Supply a widget definition.');
    if (at < 0) from.push(edit.widget);
    else from[at] = edit.widget;
    return;
  }
  if (at < 0) throw new DraftRequestError('The draft widget is unavailable.');
  if (edit.op === 'remove-widget') {
    from.splice(at, 1);
    return;
  }
  if (!edit.layout || typeof edit.layout !== 'object' || Array.isArray(edit.layout)) {
    throw new DraftRequestError('Supply the widget destination layout.');
  }
  if (edit.op === 'resize-widget') {
    from[at].layout = edit.layout;
    return;
  }
  const to = destination(profile, edit.toSurface ?? edit.surface).layout.widgets;
  const widget = { ...structuredClone(from[at]), layout: edit.layout,
    ...(edit.newId ? { id: requireId(edit.newId, 'widget', /^[a-z0-9_-]{1,48}$/i) } : {}) };
  if (edit.op === 'move-widget') from.splice(at, 1);
  to.push(widget);
}

function reorderPages(profile, edit) {
  const { ids } = edit;
  if (!Array.isArray(ids) || ids.length !== profile.pages.length || new Set(ids).size !== ids.length) {
    throw new DraftRequestError('Give each draft page once in the desired order.');
  }
  profile.pages = ids.map((id) => pageOf(profile, id));
}

function applyEdit(profile, edit) {
  switch (edit?.op) {
    case 'profile-settings': return changes(profile, edit.settings, PROFILE_SETTINGS);
    case 'page-settings': return changes(pageOf(profile, edit.page), edit.settings, PAGE_SETTINGS);
    case 'resize-grid': return resizeGrid(profile, edit);
    case 'add-page': return newPage(profile, edit);
    case 'reorder-pages': return reorderPages(profile, edit);
    case 'remove-page': {
      const page = pageOf(profile, edit.page);
      profile.pages = profile.pages.filter((item) => item !== page);
      return;
    }
    case 'set-key':
    case 'move-key':
    case 'duplicate-key':
    case 'resize-key':
    case 'remove-key': return editKey(profile, edit);
    case 'set-widget':
    case 'move-widget':
    case 'duplicate-widget':
    case 'resize-widget':
    case 'remove-widget': return editWidget(profile, edit);
    default: throw new DraftRequestError('The draft edit operation is unavailable.');
  }
}

function validate(value) {
  try {
    const { keys, ...profile } = validateProfile(value);
    if (Buffer.byteLength(JSON.stringify(profile)) > 2 * 1024 * 1024) throw new Error('The draft exceeds 2 MB.');
    return { ...profile, version: 2 };
  } catch (error) {
    throw new DraftRequestError(error.message);
  }
}

function summarize(draft) {
  const { id, revision, activity, profile } = draft;
  return { id, revision, activity, pages: profile.pages.map((page) => ({
    id: page.id, grid: page.grid ?? profile.grid, keys: page.keys.filter(Boolean).length, widgets: page.widgets.length,
    ...(page.folder?.length ? { folder: [...page.folder] } : {}),
  })), bar: { keys: profile.bar.keys.filter(Boolean).length, widgets: profile.bar.widgets.length } };
}

function draftParams(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some((key) => !Object.hasOwn(draftInput.properties, key)) || !COMMANDS.includes(value.command)) {
    throw new DraftRequestError('Choose a command from the draft tool schema.');
  }
  const { command, source = 'empty', profile, draft, revision, edits, page, portrait } = value;
  if (command === 'create') {
    if (!['empty', 'active', 'supplied'].includes(source)
        || (source === 'supplied' && (!profile || typeof profile !== 'object' || Array.isArray(profile)))
        || (source !== 'supplied' && profile !== undefined)) throw new DraftRequestError('Choose an empty, active, or supplied profile.');
  } else {
    if (typeof draft !== 'string' || !DRAFT_ID.test(draft)) throw new DraftRequestError('Choose a draft ID.');
    if (['edit', 'discard'].includes(command) && (!Number.isSafeInteger(revision) || revision < 1)) {
      throw new DraftRequestError('Choose the current draft revision.');
    }
    if (command === 'preview' && ((page !== undefined && (typeof page !== 'string' || !DATA_ID.test(page)))
        || (portrait !== undefined && typeof portrait !== 'boolean'))) throw new DraftRequestError('Choose a draft page and orientation.');
    if (command === 'edit' && (!Array.isArray(edits) || !edits.length || edits.length > MAX_EDITS
        || edits.some((edit) => !edit || typeof edit !== 'object' || Array.isArray(edit) || !EDITS.includes(edit.op)
          || Object.keys(edit).some((key) => !Object.hasOwn(draftInput.properties.edits.items.properties, key))))) {
      throw new DraftRequestError('Supply a batch of 1 to 32 supported edits.');
    }
  }
  return { command, source, profile, draft, revision, edits, page, portrait };
}

class AgentDrafts {
  constructor() {
    this.items = new Map();
  }

  create(owner, activity, raw = EMPTY, baseToken) {
    return summarize(this.register(owner, activity, 'profile', () => ({ baseToken, profile: validate(raw) })));
  }

  register(owner, activity, kind, content) {
    const count = [...this.items.values()].filter((draft) => draft.owner === owner).length;
    if (count >= MAX_CLIENT_DRAFTS || this.items.size >= MAX_DRAFTS) throw new DraftRequestError('Discard a previous draft before starting another.');
    const draft = { ...content(), id: randomBytes(12).toString('hex'), revision: 1, owner, activity, kind };
    this.items.set(draft.id, draft);
    return draft;
  }

  change(owner, activity, params, readActive) {
    const { command, source, profile, draft, revision, edits, page, portrait } = params;
    switch (command) {
      case 'create': {
        const base = source === 'active' ? readActive() : { profile };
        return this.create(owner, activity, base.profile, base.token);
      }
      case 'inspect': return this.snapshot(owner, activity, draft);
      case 'edit': return this.edit(owner, activity, draft, revision, edits);
      case 'preview': return this.preview(owner, activity, draft, page, portrait);
      case 'discard': return this.discard(owner, activity, draft, revision);
    }
  }

  resolve(owner, activity, id, revision, kind = 'profile') {
    const draft = typeof id === 'string' && DRAFT_ID.test(id) ? this.items.get(id) : null;
    if (!draft || draft.kind !== kind || draft.owner !== owner || draft.activity !== activity) throw new DraftRequestError('The draft is unavailable.');
    if (revision !== undefined && revision !== draft.revision) throw new DraftRequestError('The draft changed. Read its latest revision.');
    return draft;
  }

  edit(owner, activity, id, revision, edits) {
    if (!Number.isSafeInteger(revision) || !Array.isArray(edits) || !edits.length || edits.length > MAX_EDITS) {
      throw new DraftRequestError('Choose a draft revision and a batch of 1 to 32 edits.');
    }
    const draft = this.resolve(owner, activity, id, revision);
    const copy = structuredClone(draft.profile);
    for (const edit of edits) applyEdit(copy, edit);
    draft.profile = validate(copy);
    draft.revision++;
    return summarize(draft);
  }

  snapshot(owner, activity, id) {
    return summarize(this.resolve(owner, activity, id));
  }

  preview(owner, activity, id, page, portrait) {
    const draft = this.resolve(owner, activity, id);
    try {
      return { id, revision: draft.revision, layout: offlineLayout(draft.profile, { page, portrait }) };
    } catch (error) {
      throw new DraftRequestError(error.message);
    }
  }

  discard(owner, activity, id, revision, kind) {
    const draft = this.resolve(owner, activity, id, revision, kind);
    this.items.delete(draft.id);
    return { id, discarded: true };
  }

  prune(owners) {
    for (const [id, { owner }] of this.items) if (!owners.has(owner)) this.items.delete(id);
  }
}

module.exports = { AgentDrafts, DraftRequestError, DRAFT_ID, draftInput, draftOutput, draftParams };
