// @ts-check
'use strict';

const { createHash } = require('node:crypto');
const { resolveLinkedKey } = require('../shared/linked-controls');

const SECTIONS = ['summary', 'pages', 'keys', 'widgets', 'bar', 'rules', 'navigation'];
const ID = /^[a-z0-9_-]{1,48}$/i;
const LIMIT = 40;
const SECTION = { enum: SECTIONS };

class SnapshotRequestError extends Error {}

const snapshotInput = {
  type: 'object', additionalProperties: false,
  properties: {
    section: SECTION, page: { type: 'string' }, query: { type: 'string', maxLength: 80 },
    cursor: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: LIMIT },
  },
};

const snapshotOutput = {
  type: 'object', required: ['version', 'source', 'sampledAt', 'revision', 'section', 'entries'],
  properties: {
    version: { const: 1 }, source: { const: 'Active Lastra profile' }, sampledAt: { type: 'integer' },
    revision: { type: 'integer' }, section: SECTION, page: { type: 'string' }, entries: { type: 'array', items: { type: 'object' } },
    nextCursor: { type: 'string' },
  },
};

/** @param {any} [value] Untrusted tool arguments. */
function snapshotParams(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some((name) => !Object.hasOwn(snapshotInput.properties, name))) {
    throw new Error('Use the parameters described by the profile snapshot schema.');
  }
  const { section = 'summary', page, query = '', cursor, limit = 20 } = value;
  if (!SECTIONS.includes(section) || (page !== undefined && (typeof page !== 'string' || !ID.test(page)))
      || typeof query !== 'string' || query.length > 80 || !Number.isSafeInteger(limit) || limit < 1 || limit > LIMIT
      || (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 192))) {
    throw new Error('Choose a snapshot section and valid page, filter, or cursor.');
  }
  return { section, page, query: query.trim().toLowerCase(), cursor, limit };
}

function layoutKey(key, index) {
  return key && {
    id: key.id, index, category: key.category ?? 'app', span: key.span, hasHold: Boolean(key.hold), hasDouble: Boolean(key.double),
    ...(key.controlId ? { controlId: key.controlId } : {}),
  };
}

function layoutWidget(widget) {
  return { id: widget.id, type: widget.type, layout: widget.layout };
}

function rulesFor(page) {
  return { id: page.id, priority: page.priority ?? 0, hasAppConditions: Boolean(page.apps?.length),
    executables: page.apps ?? [], windowTitleMode: page.windowTitle?.mode ?? null,
    appIdentityCount: page.appIds?.length ?? 0 };
}

function entriesFor(section, profile, active, page, navigation, surface) {
  switch (section) {
    case 'summary': return [{
      activePage: active.id, pages: profile.pages.length, grid: active.grid ?? profile.grid,
      gestures: profile.gestures, surface,
    }];
    case 'pages': return profile.pages.map((item) => ({
      id: item.id, active: item.id === active.id, grid: item.grid ?? profile.grid,
      keys: item.keys.filter(Boolean).length, widgets: item.widgets.length,
    }));
    case 'keys': return page.keys.map((key, index) => layoutKey(resolveLinkedKey(profile, key), index)).filter(Boolean);
    case 'widgets': return page.widgets.map(layoutWidget);
    case 'bar': return [
      ...profile.bar.keys.map((key, index) => layoutKey(resolveLinkedKey(profile, key), index)).filter(Boolean)
        .map((key) => ({ kind: 'key', ...key })),
      ...profile.bar.widgets.map((widget) => ({ kind: 'widget', ...layoutWidget(widget) })),
    ];
    case 'rules': return profile.pages.map(rulesFor);
    case 'navigation': return [{ activity: navigation.activity, view: navigation.view,
      statsTab: navigation.statsTab, page: active.id, sheet: navigation.sheet, pageLocked: Boolean(navigation.pageLocked) }];
  }
}

function profileSnapshot({ profile, active, navigation, surface, revision, now }, args) {
  const { section, page: pageId, query, cursor, limit } = snapshotParams(args);
  const page = pageId === undefined || pageId === active.id ? active : profile.pages.find((item) => item.id === pageId);
  if (!page) throw new SnapshotRequestError('The requested page is unavailable.');
  const marker = createHash('sha256').update(JSON.stringify([revision, section, page.id, query, limit])).digest('hex').slice(0, 24) + '.';
  const suffix = typeof cursor === 'string' && cursor.startsWith(marker) ? cursor.slice(marker.length) : '';
  const offset = cursor === undefined ? 0 : /^\d{1,5}$/.test(suffix) ? Number(suffix) : -1;
  const entries = entriesFor(section, profile, active, page, navigation, surface).filter((entry) =>
    !query || [entry.id, entry.type, entry.category, entry.kind].some((value) => value?.toLowerCase().includes(query)));
  if (offset < 0 || offset > entries.length || offset % limit !== 0) {
    throw new SnapshotRequestError('The snapshot cursor is unavailable for this revision and filter.');
  }
  return {
    version: 1, source: 'Active Lastra profile', sampledAt: now, revision, section,
    ...(['keys', 'widgets'].includes(section) ? { page: page.id } : {}),
    entries: entries.slice(offset, offset + limit),
    ...(offset + limit < entries.length ? { nextCursor: marker + (offset + limit) } : {}),
  };
}

module.exports = { SnapshotRequestError, snapshotInput, snapshotOutput, snapshotParams, profileSnapshot };
