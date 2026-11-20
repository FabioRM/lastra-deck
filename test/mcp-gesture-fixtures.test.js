'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { AgentDrafts } = require('../src/main/mcp-drafts');
const { AgentGestureFixtures, fixtureParams } = require('../src/main/mcp-gesture-fixtures');
const { tempDir } = require('./helpers/temp-dir');

const owner = 'a'.repeat(32);
const other = 'b'.repeat(32);
const activity = 'work';
const profile = (action) => ({ pages: [{ id: 'main', apps: ['code.exe'], keys: [{ id: 'key', action }] }] });
const delayed = (ms) => ({ type: 'sequence', steps: [{ type: 'delay', ms }, { type: 'hotkey', keys: 'Ctrl+S' }] });
const sample = { page: 'main', key: 'key', windowId: 5, keyboardLayout: 'us', values: { foreground: 'Code.exe' },
  timeline: [{ atMs: 90, windowId: 6 }] };
const allowed = () => true;

function storage(t) {
  const temp = tempDir(t, 'lastra-gesture-fixtures-');
  return path.join(temp, 'fixtures.json');
}

function request(store, params, { client = owner, profileId = activity, recheck = allowed } = {}) {
  return store.change(client, profileId, fixtureParams(params), recheck);
}

test('authorized fixtures persist, replay against a new draft revision, and report a changed virtual outcome', async (t) => {
  const file = storage(t);
  const drafts = new AgentDrafts();
  const initial = drafts.create(owner, activity, profile(delayed(120)));
  let store = new AgentGestureFixtures({ file, drafts, now: () => 1700000000000 });
  const result = await request(store, { command: 'record', label: 'Window switches during delay', scenario: sample, draft: initial.id, revision: 1 });
  const fixture = result.fixture.id;
  assert.equal(result.expected.status, 'unavailable');
  assert.equal(result.expected.elapsedMs, 120);
  assert.deepEqual(result.effects, []);
  assert.ok(result.steps.some(({ type, status }) => type === 'hotkey' && status === 'skipped'));
  assert.deepEqual((await request(store, { command: 'list' })).fixtures, [result.fixture]);

  // A new desktop process opens the same fixture file with a new in-memory draft store.
  const freshDrafts = new AgentDrafts();
  const fresh = freshDrafts.create(owner, activity, profile(delayed(120)));
  store = new AgentGestureFixtures({ file, drafts: freshDrafts });
  const inspect = await request(store, { command: 'inspect', fixture });
  assert.deepEqual(inspect.scenario, { ...sample, gesture: 'tap', values: { foreground: 'code.exe' } });
  const same = await request(store, { command: 'run', fixture, draft: fresh.id, revision: 1 });
  assert.equal(same.matches, true);
  freshDrafts.edit(owner, activity, fresh.id, 1, [{ op: 'set-key', surface: 'main', slot: 0, key: { id: 'key', action: delayed(50) } }]);
  const changed = await request(store, { command: 'run', fixture, draft: fresh.id, revision: 2 });
  assert.equal(changed.matches, false);
  assert.equal(changed.observed.status, 'success');
  assert.deepEqual(changed.effects, [{ atMs: 50, type: 'chord' }]);
  assert.deepEqual(changed.expected, inspect.expected);
});

test('a fixture stays private to its client and activity and never stores or reports draft actions or references', async (t) => {
  const file = storage(t);
  const drafts = new AgentDrafts();
  const privateValue = 'private-test-workspace-20df';
  const source = drafts.create(owner, activity, profile({ type: 'workspace', workspace: privateValue }));
  const store = new AgentGestureFixtures({ file, drafts });
  const result = await request(store, { command: 'record', label: 'Workspace mock', scenario: { ...sample, timeline: [] }, draft: source.id, revision: 1 });
  assert.deepEqual(result.effects, [{ atMs: 0, type: 'workspace' }]);
  assert.ok(!JSON.stringify(result).includes(privateValue));
  assert.ok(!fs.readFileSync(file, 'utf8').includes(privateValue));
  assert.ok(!fs.readFileSync(file, 'utf8').includes(source.id));
  const fixture = result.fixture.id;
  for (const context of [{ client: other }, { profileId: 'personal' }]) {
    assert.deepEqual((await request(store, { command: 'list' }, context)).fixtures, []);
    for (const command of ['inspect', 'remove']) await assert.rejects(request(store, { command, fixture }, context), /fixture is unavailable/);
  }
  await assert.rejects(request(store, { command: 'run', fixture, draft: source.id, revision: 2 }), /draft changed/);
  assert.equal((await request(store, { command: 'remove', fixture })).removed, true);
  assert.deepEqual((await request(new AgentGestureFixtures({ file, drafts }), { command: 'list' })).fixtures, []);
});

test('rechecks authorization and draft revision after simulation and leaves storage unchanged on either conflict', async (t) => {
  const file = storage(t);
  const drafts = new AgentDrafts();
  const draft = drafts.create(owner, activity, profile(delayed(120)));
  const result = { status: 'success', elapsedMs: 120, effects: [], steps: [] };
  let complete;
  let checked = true;
  const store = new AgentGestureFixtures({ file, drafts, simulate: () => new Promise((resolve) => { complete = () => resolve(result); }) });
  const params = { command: 'record', label: 'Pending fixture', scenario: sample, draft: draft.id, revision: 1 };
  const pending = request(store, params, { recheck: () => checked });
  checked = false;
  complete();
  await assert.rejects(pending, /grant or activity changed/);
  assert.equal(fs.existsSync(file), false);
  const newPending = request(store, params);
  drafts.edit(owner, activity, draft.id, 1, [{ op: 'page-settings', page: 'main', settings: { name: 'New revision' } }]);
  complete();
  await assert.rejects(newPending, /draft changed/);
  assert.equal(fs.existsSync(file), false);
});

test('validates every supplied sample before simulation and preserves invalid on-disk collections for recovery', async (t) => {
  const file = storage(t);
  const drafts = new AgentDrafts();
  const draft = drafts.create(owner, activity, profile(delayed(120)));
  const params = { command: 'record', label: 'Sample', draft: draft.id, revision: 1 };
  for (const scenario of [{ ...sample, profile: {} }, { ...sample, values: { clipboard: 'other data' } },
    { ...sample, timeline: [{ atMs: 10 }, { atMs: 5 }] }, { ...sample, timeline: [{ atMs: 10, file: 'log.json' }] },
    { ...sample, timeline: [{ atMs: 10, values: { 'obs-connected': 'true' } }] },
    { ...sample, windowTitle: ['array'] }, { ...sample, appId: { toString: false } }]) {
    assert.throws(() => fixtureParams({ ...params, scenario }), /fixture|provider states|wait condition/i);
  }
  assert.throws(() => fixtureParams({ command: 'list', scenario: sample }), /fields required/);
  fs.writeFileSync(file, '{bad file');
  const messages = [];
  const corrupt = new AgentGestureFixtures({ file, drafts, log: (message) => messages.push(message) });
  await assert.rejects(request(corrupt, { ...params, scenario: sample }), /collection is unavailable/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{bad file');
  assert.equal(messages.length, 1);
});

test('scoped capacity is bounded and removing a revoked client does not remove another client’s fixtures', async (t) => {
  const file = storage(t);
  const drafts = new AgentDrafts();
  const draft = drafts.create(owner, activity, profile(delayed(120)));
  const second = drafts.create(other, activity, profile(delayed(120)));
  const store = new AgentGestureFixtures({ file, drafts });
  const params = { command: 'record', label: 'Sample', draft: draft.id, revision: 1, scenario: sample };
  for (let count = 0; count < 16; count++) await request(store, params);
  await assert.rejects(request(store, params), /Remove an unused gesture fixture/);
  const saved = await request(store, { ...params, draft: second.id }, { client: other });
  store.prune(new Set([other]));
  const reopened = new AgentGestureFixtures({ file, drafts });
  assert.deepEqual((await request(reopened, { command: 'list' })).fixtures, []);
  assert.deepEqual((await request(reopened, { command: 'list' }, { client: other })).fixtures, [saved.fixture]);
});
