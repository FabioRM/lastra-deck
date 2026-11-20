'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { once } = require('node:events');
const { test } = require('node:test');
const { AgentDrafts, draftParams } = require('../src/main/mcp-drafts');
const { AgentAccess } = require('../src/main/mcp-access');
const { AgentService } = require('../src/main/mcp-service');
const { ActionHistory } = require('../src/main/action-history');
const { connectAgent } = require('../src/main/mcp-client');
const { tempDir } = require('./helpers/temp-dir');

const reset = { id: 'notes', action: { type: 'open', target: 'C:/private-fixture/notes.txt' } };
const profile = { grid: { cols: 8, rows: 3 }, pages: [{ id: 'home', keys: [reset] }, { id: 'bar', keys: [] }] };

test('draft edits are atomic and use shared grid and profile validators', () => {
  const drafts = new AgentDrafts();
  const create = drafts.create('agent', 'work', profile, 'disk-revision');
  const first = drafts.edit('agent', 'work', create.id, create.revision, [
    { op: 'add-page', id: 'research', source: 'home' },
    { op: 'move-key', surface: 'research', slot: 0, toSurface: 'bar:', toSlot: 2 },
    { op: 'set-widget', surface: 'research', widget: { id: 'load', type: 'system-metric' } },
    { op: 'set-key', surface: 'bar', slot: 1, key: { ...reset, id: 'page-only' } },
    { op: 'reorder-pages', ids: ['home', 'research', 'bar'] },
  ]);
  assert.equal(first.revision, 2);
  assert.equal(first.pages[1].widgets, 1);
  assert.equal(first.pages[2].keys, 1);
  assert.equal(first.bar.keys, 1);
  assert.equal(profile.pages.length, 2);
  assert.throws(() => drafts.edit('agent', 'work', create.id, first.revision, [
    { op: 'remove-page', page: 'home' },
    { op: 'move-widget', surface: 'research', id: 'load', toSurface: 'bar:', layout: { column: 2, row: 0, rows: 1, cols: 1 } },
  ]), /placement overlaps/);
  assert.deepEqual(drafts.snapshot('agent', 'work', create.id), first);
  assert.throws(() => drafts.edit('agent', 'work', create.id, 1, [{ op: 'remove-page', page: 'research' }]), /draft changed/i);
  assert.throws(() => drafts.snapshot('other', 'work', create.id), /unavailable/);
  assert.throws(() => drafts.snapshot('agent', 'main', create.id), /unavailable/);
  assert.throws(() => draftParams({ command: 'apply', draft: create.id }), /schema/);
  const view = drafts.preview('agent', 'work', create.id, 'research', true);
  assert.equal(view.layout.orientation, 'portrait');
  assert.equal(view.layout.editing.length, 5);
  assert.doesNotMatch(JSON.stringify(view), /private-fixture|disk-revision/);
  drafts.prune(new Set());
  assert.throws(() => drafts.snapshot('agent', 'work', create.id), /unavailable/);
});

test('draft folders move stable page IDs and participate in the same atomic revision', () => {
  const drafts = new AgentDrafts();
  const draft = drafts.create('agent', 'work', profile, 'known');
  const change = (revision, edits) => drafts.change('agent', 'work', draftParams({ command: 'edit', draft: draft.id, revision, edits }));
  const first = change(1, [
    { op: 'page-settings', page: 'bar', settings: { folder: ['Work', 'Editing'] } },
    { op: 'add-page', id: 'research', name: 'Research', folder: ['Work', 'Notes'] },
  ]);
  assert.equal(first.revision, 2);
  assert.deepEqual(first.pages.map(({ id, folder }) => [id, folder]), [
    ['home', undefined], ['bar', ['Work', 'Editing']], ['research', ['Work', 'Notes']],
  ]);
  assert.equal(profile.pages[1].folder, undefined);
  assert.throws(() => change(2, [
    { op: 'page-settings', page: 'bar', settings: { folder: ['Invalid/Child'] } },
    { op: 'remove-page', page: 'home' },
  ]), /folder names/);
  assert.deepEqual(drafts.snapshot('agent', 'work', draft.id), first);
  assert.throws(() => change(1, [{ op: 'page-settings', page: 'bar', settings: { folder: [] } }]), /draft changed/i);
  const root = change(2, [{ op: 'page-settings', page: 'bar', settings: { folder: [] } }]);
  assert.equal(root.revision, 3);
  assert.equal(root.pages[1].folder, undefined);
  assert.deepEqual(root.pages[2].folder, ['Work', 'Notes']);
});

test('MCP clients need a separate activity-bound draft grant and can manipulate only their own draft', async (t) => {
  let service;
  t.after(() => service?.stop());
  const dir = tempDir(t, 'lastra-mcp-drafts-');
  const address = process.platform === 'win32' ? undefined : () => path.join(dir, 'test.sock');
  const protect = process.platform === 'win32' ? undefined : () => ({
    protect: (bytes) => Buffer.from(bytes), unprotect: (bytes) => Buffer.from(bytes),
  });
  const grantFile = path.join(dir, 'grants.json');
  const access = new AgentAccess(grantFile, { protect });
  access.setEnabled(true);
  const readCredential = access.grant(['layout'], 'work');
  const draftA = access.grant(['drafts'], 'work');
  const draftB = access.grant(['drafts'], 'work');
  const drafts = new AgentDrafts();
  let activity = 'work';
  const history = new ActionHistory();
  service = new AgentService(access, { profile: () => activity, address, history, readers: {
    profile_draft: (params, client) => drafts.change(client.id, activity, params, () => ({ profile, token: 'private-revision' })),
  } });
  service.setLocked(false);
  await once(service.server, 'listening');
  const links = await Promise.all([readCredential, draftA, draftB].map((credential) => connectAgent(credential, { address, protect })));
  t.after(() => links.forEach((link) => link.close()));
  const [reader, owner, other] = links;
  const create = { command: 'create', source: 'active' };
  assert.equal((await reader.call('profile_draft', create)).ok, false);
  assert.equal((await owner.call('connection')).data.available.includes('profile_draft'), true);
  const added = (await owner.call('profile_draft', create)).data;
  assert.equal(added.pages.length, 2);
  assert.equal((await other.call('profile_draft', { command: 'inspect', draft: added.id })).ok, false);
  activity = 'main';
  assert.equal((await owner.call('profile_draft', { command: 'inspect', draft: added.id })).ok, false);
  activity = 'work';
  assert.deepEqual((await owner.call('profile_draft', { command: 'discard', draft: added.id, revision: 1 })).data,
    { id: added.id, discarded: true });
  assert.doesNotMatch(JSON.stringify(history.snapshot()), /private-revision|private-fixture/);
});
