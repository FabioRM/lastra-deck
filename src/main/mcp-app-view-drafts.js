// @ts-check
'use strict';

const { BUILT_IN_APP_VIEWS } = require('./app-view-catalog');
const { normalizeCustomViews } = require('./custom-app-views');
const { iconExists, lucideIcon } = require('./icons');
const { diffValues } = require('./mcp-apply');
const { DRAFT_ID, DraftRequestError } = require('./mcp-drafts');
const { VIEW_GRID, MAX_WIDGETS } = require('../shared/widget-layout');

const KIND = 'app-view';
const ID = /^[a-z0-9_-]{1,48}$/;
const EXECUTABLE = /^[^%\\/:"<>|?*;\p{Cc}]{1,124}\.exe$/iu;
const MAX_EDITS = 32;
const RESERVED = BUILT_IN_APP_VIEWS.map(({ id }) => id);

const COMMAND_FIELDS = {
  create: ['view'], fork: ['draft', 'revision', 'newId', 'name'], inspect: ['draft', 'revision'],
  edit: ['draft', 'revision', 'edits'], preview: ['draft', 'revision'], compare: ['draft', 'revision'],
  discard: ['draft', 'revision'],
};
const EDIT_FIELDS = {
  'view-settings': ['settings'], 'set-shortcut': ['shortcut'], 'remove-shortcut': ['id'], 'reorder-shortcuts': ['ids'],
  'set-widget': ['widget'], 'move-widget': ['id', 'layout'], 'resize-widget': ['id', 'layout'],
  'duplicate-widget': ['id', 'newId', 'layout'], 'remove-widget': ['id'], 'reorder-widgets': ['ids'],
};
const SETTINGS_FIELDS = ['name', 'category', 'summary', 'icon', 'match', 'url'];
const WIDGET_FIELDS = ['id', 'type', 'settings', 'layout', 'stackId', 'tabLabel'];
const LAYOUT_FIELDS = ['column', 'row', 'cols', 'rows'];
const MATCH_FIELDS = ['executable', 'appId', 'titleContains'];

const objectSchema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const string = (maxLength) => ({ type: 'string', minLength: 1, maxLength });
const dataId = { ...string(48), pattern: ID.source };
const draftId = { type: 'string', pattern: DRAFT_ID.source };
const revision = { type: 'integer', minimum: 1 };
const bounded = (items, maxItems) => ({ type: 'array', items, maxItems });
const cell = { type: 'integer', minimum: 0, maximum: 3 };
const span = { type: 'integer', minimum: 1, maximum: 4 };
const layoutSchema = objectSchema({ column: cell, row: cell, cols: span, rows: span }, LAYOUT_FIELDS);
const matchSchema = objectSchema({ executable: string(128), appId: string(128), titleContains: string(256) });
const shortcutSchema = objectSchema({ id: dataId, label: string(40), keys: string(120) }, ['id', 'label', 'keys']);
const widgetSchema = objectSchema({ id: dataId, type: string(48), settings: { type: 'object' }, layout: layoutSchema,
  stackId: dataId, tabLabel: string(24) }, ['id', 'type']);
const viewFields = { name: string(60), category: string(32), summary: string(160), icon: string(60), match: matchSchema, url: string(2048) };
const settingsSchema = objectSchema({ ...viewFields,
  ...Object.fromEntries(['category', 'summary', 'icon', 'url'].map((key) => [key, { anyOf: [viewFields[key], { type: 'null' }] }])),
});
const viewSchema = objectSchema({ id: dataId, ...viewFields, shortcuts: bounded(shortcutSchema, 12), widgets: bounded(widgetSchema, MAX_WIDGETS) },
  ['id', 'name', 'match']);
const appViewDraftInput = objectSchema({ command: { enum: Object.keys(COMMAND_FIELDS) }, view: viewSchema, draft: draftId, revision,
  newId: dataId, name: string(60), edits: { ...bounded(objectSchema({ op: { enum: Object.keys(EDIT_FIELDS) }, settings: settingsSchema,
    id: dataId, newId: dataId, ids: bounded(dataId, MAX_WIDGETS), shortcut: shortcutSchema, widget: widgetSchema, layout: layoutSchema }, ['op']), MAX_EDITS), minItems: 1 },
}, ['command']);
const appViewDraftOutput = objectSchema({ id: draftId, kind: { const: KIND }, revision, activity: string(32), view: viewSchema,
  discarded: { type: 'boolean' }, preview: objectSchema({ grid: objectSchema({ cols: span, rows: span }, ['cols', 'rows']),
    widgets: bounded(objectSchema({ id: dataId, type: string(48), layout: layoutSchema, stackId: dataId, tabLabel: string(24) }, ['id', 'type', 'layout']), MAX_WIDGETS),
    commands: bounded(objectSchema({ id: dataId, label: string(40), kind: { enum: ['open-app', 'shortcut'] } }, ['id', 'label', 'kind']), 13),
    iconAvailable: { type: 'boolean' }, offline: { const: true },
  }, ['grid', 'widgets', 'commands', 'iconAvailable', 'offline']),
  comparison: objectSchema({ baseline: { enum: ['created', 'forked'] }, changed: bounded(string(120), 100),
    changeCount: { type: 'integer', minimum: 0 } }, ['baseline', 'changed', 'changeCount']),
}, ['id', 'kind']);

function supportedObject(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => allowed.includes(key));
}

function validId(value) { return typeof value === 'string' && ID.test(value); }

function appViewDraftParams(value) {
  const command = value?.command;
  if (typeof command !== 'string' || !Object.hasOwn(COMMAND_FIELDS, command) || !supportedObject(value, ['command', ...COMMAND_FIELDS[command]])) {
    throw new DraftRequestError('Choose a command from the app-view draft schema.');
  }
  if (command === 'create') {
    if (!supportedObject(value.view, Object.keys(viewSchema.properties))) throw new DraftRequestError('Supply a custom app-view definition.');
    return value;
  }
  if (typeof value.draft !== 'string' || !DRAFT_ID.test(value.draft)) throw new DraftRequestError('Choose an app-view draft ID.');
  if ((command !== 'inspect' || value.revision !== undefined) && (!Number.isSafeInteger(value.revision) || value.revision < 1)) {
    throw new DraftRequestError('Choose the current app-view draft revision.');
  }
  if (command === 'fork' && (!validId(value.newId) || (value.name !== undefined && typeof value.name !== 'string'))) {
    throw new DraftRequestError('Choose a new app-view ID and optional name.');
  }
  if (command === 'edit' && (!Array.isArray(value.edits) || !value.edits.length || value.edits.length > MAX_EDITS
      || value.edits.some((edit) => typeof edit?.op !== 'string' || !Object.hasOwn(EDIT_FIELDS, edit.op)
        || !supportedObject(edit, ['op', ...EDIT_FIELDS[edit.op]])))) {
    throw new DraftRequestError('Supply a batch of 1 to 32 supported app-view edits.');
  }
  return value;
}

function normalize(raw) {
  try {
    if (!supportedObject(raw.match, MATCH_FIELDS) || (raw.match.executable !== undefined
        && (typeof raw.match.executable !== 'string' || !EXECUTABLE.test(raw.match.executable.trim())))) {
      throw new Error('Choose an executable name or Windows app ID without a machine path or environment variable.');
    }
    if (Array.isArray(raw.widgets) && raw.widgets.some((item) => !supportedObject(item, WIDGET_FIELDS)
      || (item.layout !== undefined && !supportedObject(item.layout, LAYOUT_FIELDS)))) {
      throw new Error('Choose a widget with supported settings and placement fields.');
    }
    const [view] = normalizeCustomViews({ version: 1, views: [raw] }, RESERVED);
    const { id, name, icon, category, summary, widgets } = view;
    const match = Object.fromEntries(Object.entries(raw.match).map(([field, text]) => [field, text.trim()]));
    const shortcuts = view.commands.filter(({ action }) => action.type === 'hotkey')
      .map(({ id, label, action }) => ({ id, label, keys: action.keys }));
    return { id, name, icon, category, ...(summary ? { summary } : {}), match,
      ...(raw.url !== undefined ? { url: raw.url.trim() } : {}), shortcuts, widgets };
  } catch (error) { throw new DraftRequestError(error.message); }
}

function itemIndex(list, wanted) {
  const index = list.findIndex(({ id }) => id === wanted);
  if (index < 0) throw new DraftRequestError('The app-view draft item is unavailable.');
  return index;
}

function replace(list, item) {
  if (!validId(item?.id)) throw new DraftRequestError('Supply an item definition with its ID.');
  const index = list.findIndex(({ id }) => id === item.id);
  if (index < 0) list.push(item);
  else list[index] = item;
}

function reorder(list, ids) {
  if (!Array.isArray(ids) || ids.length !== list.length || new Set(ids).size !== ids.length) {
    throw new DraftRequestError('Give each app-view draft item once in the desired order.');
  }
  return ids.map((id) => list[itemIndex(list, id)]);
}

function place(value) {
  if (!supportedObject(value, LAYOUT_FIELDS) || Object.keys(value).length !== LAYOUT_FIELDS.length) {
    throw new DraftRequestError('Supply column, row, cols and rows for the app-view widget.');
  }
  return value;
}

function applyEdit(view, edit) {
  switch (edit.op) {
    case 'view-settings':
      if (!supportedObject(edit.settings, SETTINGS_FIELDS)) throw new DraftRequestError('Choose supported app-view settings.');
      for (const [field, value] of Object.entries(edit.settings)) {
        if (value === null && ['category', 'summary', 'icon', 'url'].includes(field)) delete view[field];
        else view[field] = value;
      }
      return;
    case 'set-shortcut': return replace(view.shortcuts, edit.shortcut);
    case 'remove-shortcut': return view.shortcuts.splice(itemIndex(view.shortcuts, edit.id), 1);
    case 'reorder-shortcuts': view.shortcuts = reorder(view.shortcuts, edit.ids); return;
    case 'set-widget': return replace(view.widgets, edit.widget);
    case 'remove-widget': return view.widgets.splice(itemIndex(view.widgets, edit.id), 1);
    case 'reorder-widgets': view.widgets = reorder(view.widgets, edit.ids); return;
    case 'move-widget':
    case 'resize-widget': view.widgets[itemIndex(view.widgets, edit.id)].layout = place(edit.layout); return;
    case 'duplicate-widget': {
      if (!validId(edit.newId) || view.widgets.some(({ id }) => id === edit.newId)) throw new DraftRequestError('Choose a new widget ID.');
      const source = view.widgets[itemIndex(view.widgets, edit.id)];
      view.widgets.push({ ...source, id: edit.newId, layout: place(edit.layout) });
      return;
    }
    default: throw new DraftRequestError('The app-view draft edit is unavailable.');
  }
}

function report({ id, kind, revision, activity }) { return { id, kind, revision, activity }; }

function preview(view) {
  const commands = view.shortcuts.map(({ id, label }) => ({ id, label, kind: 'shortcut' }));
  if (view.url || !view.match.titleContains) commands.unshift({ id: 'open', label: 'Open app', kind: 'open-app' });
  const widgets = view.widgets.map(({ settings, ...placement }) => placement);
  return { grid: VIEW_GRID, widgets, commands, iconAvailable: iconExists(view.icon), offline: true };
}

function appViewPreview(view) {
  const { id, name, summary, category, icon, widgets } = view;
  const { commands } = preview(view);
  return { id, name, summary: summary ?? '', category, icon: lucideIcon(icon) || lucideIcon('app-window'),
    widgets, commands, capabilities: [], custom: true };
}

class AgentAppViewDrafts {
  constructor(drafts) { this.drafts = drafts; }

  create(owner, activity, raw, forkedFrom) {
    const draft = this.drafts.register(owner, activity, KIND, () => {
      const view = normalize(raw);
      return { view, baseline: forkedFrom ?? view, origin: forkedFrom ? 'forked' : 'created' };
    });
    return { ...report(draft), view: structuredClone(draft.view) };
  }

  change(owner, activity, params) {
    if (params.command === 'create') return this.create(owner, activity, params.view);
    const draft = this.drafts.resolve(owner, activity, params.draft, params.revision, KIND);
    switch (params.command) {
      case 'fork': {
        if (params.newId.toLowerCase() === draft.view.id.toLowerCase()) throw new DraftRequestError('Give the fork a new app-view ID.');
        return this.create(owner, activity, { ...draft.view, id: params.newId, name: params.name ?? draft.view.name }, draft.view);
      }
      case 'inspect': return { ...report(draft), view: structuredClone(draft.view) };
      case 'edit': {
        const view = structuredClone(draft.view);
        for (const edit of params.edits) applyEdit(view, edit);
        draft.view = normalize(view);
        draft.revision++;
        return { ...report(draft), view: structuredClone(draft.view) };
      }
      case 'preview': return { ...report(draft), preview: preview(draft.view) };
      case 'compare': {
        const changes = diffValues(draft.baseline, draft.view);
        return { ...report(draft), comparison: { baseline: draft.origin, changed: changes.slice(0, 100).map(({ field }) => field),
          changeCount: changes.length } };
      }
      case 'discard': return { ...this.drafts.discard(owner, activity, draft.id, draft.revision, KIND), kind: KIND };
      default: throw new DraftRequestError('The app-view draft command is unavailable.');
    }
  }
}

module.exports = { AgentAppViewDrafts, appViewDraftInput, appViewDraftOutput, appViewDraftParams, appViewPreview };
