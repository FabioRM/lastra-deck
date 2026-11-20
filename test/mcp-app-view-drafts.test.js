'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { test } = require('node:test');
const { AgentDrafts } = require('../src/main/mcp-drafts');
const { AgentAppViewDrafts, appViewDraftParams } = require('../src/main/mcp-app-view-drafts');
const { AgentAccess } = require('../src/main/mcp-access');
const { AgentService } = require('../src/main/mcp-service');
const { ActionHistory } = require('../src/main/action-history');
const { connectAgent } = require('../src/main/mcp-client');
const { tempDir } = require('./helpers/temp-dir');

const layout = (column, row, cols = 1, rows = 1) => ({ column, row, cols, rows });
const widget = (id, column, row) => ({ id, type: 'system-metric', layout: layout(column, row) });
const view = { id: 'research', name: 'Research', match: { executable: 'notepad.exe', titleContains: 'Caller notes' },
  url: 'https://fixture.invalid/caller-notes', icon: 'notebook-pen', shortcuts: [{ id: 'find', label: 'Find', keys: 'Ctrl+F' }],
  widgets: [widget('load', 0, 0), widget('memory', 1, 0)] };

function setup() {
  const drafts = new AgentDrafts();
  const views = new AgentAppViewDrafts(drafts);
  const call = (options, owner = 'author', activity = 'work') => views.change(owner, activity, appViewDraftParams(options));
  const create = call({ command: 'create', view });
  return { drafts, call, create };
}

test('custom app views preview runtime widget placements and only include inert command metadata', () => {
  const { call, create } = setup();
  assert.equal(create.revision, 1);
  assert.equal(create.kind, 'app-view');
  assert.equal(create.activity, 'work');
  assert.equal(create.view.url, view.url);
  assert.deepEqual(create.view.match, view.match);
  const preview = call({ command: 'preview', draft: create.id, revision: 1 }).preview;
  assert.equal(preview.offline, true);
  assert.deepEqual(preview.grid, { cols: 4, rows: 4 });
  assert.deepEqual(preview.widgets, view.widgets);
  assert.deepEqual(preview.commands, [
    { id: 'open', label: 'Open app', kind: 'open-app' }, { id: 'find', label: 'Find', kind: 'shortcut' },
  ]);
  assert.doesNotMatch(JSON.stringify(preview), /fixture\.invalid|caller notes|Ctrl\+F|notepad\.exe|settings/i);
  assert.deepEqual(call({ command: 'compare', draft: create.id, revision: 1 }).comparison,
    { baseline: 'created', changed: [], changeCount: 0 });
  assert.throws(() => call({ command: 'preview', draft: create.id }), /current.*revision/);
  const url = `https://fixture.invalid/${'ñ'.repeat(480)}`;
  const longUrl = call({ command: 'create', view: { ...view, url } });
  assert.equal(call({ command: 'fork', draft: longUrl.id, revision: 1, newId: 'long-url-copy' }).view.url, url);
});

test('batch edits validate final 4×4 geometry and fork from an exact independent revision', () => {
  const { call, create } = setup();
  const edit = (revision, edits) => call({ command: 'edit', draft: create.id, revision, edits });
  const changed = edit(1, [
    { op: 'view-settings', settings: { name: 'Review', url: null, category: 'Work' } },
    { op: 'move-widget', id: 'load', layout: layout(1, 0) },
    { op: 'move-widget', id: 'memory', layout: layout(0, 0) },
    { op: 'duplicate-widget', id: 'memory', newId: 'cpu-copy', layout: layout(0, 1, 2) },
    { op: 'set-shortcut', shortcut: { id: 'select', label: 'Select all', keys: 'Ctrl+A' } },
    { op: 'reorder-shortcuts', ids: ['select', 'find'] },
  ]);
  assert.equal(changed.revision, 2);
  assert.equal(changed.view.url, undefined);
  assert.deepEqual(changed.view.widgets.map(({ layout }) => layout), [layout(1, 0), layout(0, 0), layout(0, 1, 2)]);
  assert.deepEqual(call({ command: 'preview', draft: create.id, revision: 2 }).preview.commands.map(({ id }) => id), ['select', 'find']);
  assert.throws(() => edit(2, [
    { op: 'view-settings', settings: { name: 'Should not stick' } },
    { op: 'resize-widget', id: 'load', layout: layout(0, 0) },
  ]), /placement overlaps/);
  assert.throws(() => edit(2, [{ op: 'set-widget', widget: widget('outside', 4, 0) }]), /outside the grid/);
  assert.deepEqual(call({ command: 'inspect', draft: create.id }), changed);
  const comparison = call({ command: 'compare', draft: create.id, revision: 2 }).comparison;
  assert.ok(comparison.changed.includes('name') && comparison.changed.includes('url') && comparison.changeCount > 4);
  assert.throws(() => call({ command: 'fork', draft: create.id, revision: 1, newId: 'stale' }), /draft changed/);
  const copy = call({ command: 'fork', draft: create.id, revision: 2, newId: 'review-copy', name: 'Copy' });
  assert.equal(copy.revision, 1);
  assert.notEqual(copy.id, create.id);
  assert.deepEqual(call({ command: 'compare', draft: copy.id, revision: 1 }).comparison,
    { baseline: 'forked', changed: ['id', 'name'], changeCount: 2 });
  edit(2, [{ op: 'remove-widget', id: 'cpu-copy' }]);
  assert.equal(call({ command: 'inspect', draft: copy.id }).view.widgets.length, 3);
});

test('draft families share ownership and capacity while app-view data stays within the supplied safe schema', () => {
  const { drafts, call, create } = setup();
  const profile = drafts.create('author', 'work');
  assert.throws(() => drafts.resolve('author', 'work', create.id, 1), /unavailable/);
  assert.throws(() => call({ command: 'inspect', draft: profile.id }), /unavailable/);
  assert.throws(() => call({ command: 'inspect', draft: create.id }, 'another'), /unavailable/);
  assert.throws(() => call({ command: 'inspect', draft: create.id }, 'author', 'main'), /unavailable/);
  for (const match of [{ executable: 'C:\\Fixture\\app.exe' }, { executable: '%WINDIR%\\notepad.exe' }]) {
    assert.throws(() => call({ command: 'create', view: { ...view, match } }), /without a machine path/);
  }
  assert.throws(() => call({ command: 'create', view: { ...view, id: 'chatgpt' } }), /unique lowercase ID/);
  assert.throws(() => call({ command: 'create', view: { ...view, url: 'file:///C:/private' } }), /HTTP or HTTPS/);
  assert.throws(() => call({ command: 'create', view: { ...view, commands: [{}] } }), /definition/);
  assert.throws(() => call({ command: 'create', view: { ...view, widgets: [{ ...view.widgets[0], file: 'C:/fixture' }] } }), /supported settings/);
  assert.throws(() => call({ command: 'create', view, source: 'active' }), /schema/);
  assert.throws(() => call({ command: 'apply', draft: create.id, revision: 1 }), /schema/);
  for (let index = 0; index < 4; index++) call({ command: 'fork', draft: create.id, revision: 1, newId: `fork-${index}` });
  assert.throws(() => drafts.create('author', 'work'), /Discard a previous draft/);
  assert.deepEqual(call({ command: 'discard', draft: create.id, revision: 1 }), { id: create.id, discarded: true, kind: 'app-view' });
  drafts.prune(new Set());
  assert.throws(() => drafts.snapshot('author', 'work', profile.id), /unavailable/);
});

test('the app-view draft route requires an activity-bound draft grant and has no saved-view effects', async (t) => {
  let service;
  t.after(() => service?.stop());
  const dir = tempDir(t, 'lastra-app-view-drafts-');
  const access = new AgentAccess(path.join(dir, 'grants.json'), { protect: process.platform === 'win32' ? undefined : () => ({
    protect: (bytes) => Buffer.from(bytes), unprotect: (bytes) => Buffer.from(bytes),
  }) });
  access.setEnabled(true);
  const draft = access.grant(['drafts'], 'work');
  const sameScope = access.grant(['drafts'], 'work');
  const layoutOnly = access.grant(['layout'], 'work');
  const registry = new AgentDrafts();
  const views = new AgentAppViewDrafts(registry);
  const history = new ActionHistory();
  const address = process.platform === 'win32' ? undefined : () => path.join(dir, 'fixture.sock');
  let activity = 'work';
  service = new AgentService(access, { profile: () => activity, history, address,
    readers: { app_view_draft: (params, client) => views.change(client.id, activity, params) } });
  service.setLocked(false);
  await once(service.server, 'listening');
  const protect = process.platform === 'win32' ? undefined : () => ({ protect: (bytes) => Buffer.from(bytes), unprotect: (bytes) => Buffer.from(bytes) });
  const links = await Promise.all([draft, sameScope, layoutOnly].map((credential) => connectAgent(credential, { address, protect })));
  t.after(() => links.forEach((link) => link.close()));
  const [owner, other, reader] = links;
  assert.equal((await reader.call('app_view_draft', { command: 'create', view })).ok, false);
  assert.equal((await owner.call('connection')).data.available.includes('app_view_draft'), true);
  const created = (await owner.call('app_view_draft', { command: 'create', view })).data;
  assert.equal(created.view.id, view.id);
  assert.equal((await other.call('app_view_draft', { command: 'inspect', draft: created.id })).ok, false);
  activity = 'main';
  assert.equal((await owner.call('app_view_draft', { command: 'inspect', draft: created.id })).ok, false);
  assert.equal(fs.existsSync(path.join(dir, 'app-views.custom.json')), false);
  assert.doesNotMatch(JSON.stringify(history.snapshot()), /caller notes|fixture\.invalid/i);
});
