'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setImmediate: turn, setTimeout: delay } = require('node:timers/promises');
const { test } = require('node:test');
const { ProfileStore } = require('../src/main/profile');
const { AgentDrafts } = require('../src/main/mcp-drafts');
const { AgentProfileApply, applyParams } = require('../src/main/mcp-apply');
const { ActionHistory } = require('../src/main/action-history');
const { tempDir } = require('./helpers/temp-dir');

const client = { id: 'agent123-fixture' };
const initial = { version: 2, name: 'Original', pages: [{ id: 'home', keys: [] }] };

function fixture(t, { timeout } = {}) {
  let store;
  t.after(() => store?.close());
  const dir = tempDir(t, 'lastra-profile-approval-');
  const file = path.join(dir, 'profile.json');
  fs.writeFileSync(file, JSON.stringify(initial));
  store = new ProfileStore({ file, defaultFile: path.resolve(__dirname, '../profiles/default.json') });
  store.load();
  const drafts = new AgentDrafts();
  const history = new ActionHistory();
  const reviews = [];
  let grant = true;
  const changes = new AgentProfileApply({
    drafts, history, timeout,
    readContext: () => ({ activity: 'main', label: 'Main profile', store }),
    approve: (proposal) => new Promise((resolve) => {
      reviews.push({ proposal, answer: resolve });
      proposal.signal.addEventListener('abort', () => resolve(false), { once: true });
    }),
  });
  store.on('change', () => changes.checkPending());
  function proposal(name) {
    const base = store.editorSnapshot();
    const draft = drafts.create(client.id, 'main', base.profile, base.token);
    return drafts.edit(client.id, 'main', draft.id, draft.revision, [{ op: 'profile-settings', settings: { name } }]);
  }
  const command = (input) => changes.change(client, applyParams(input), () => grant);
  return { store, drafts, history, reviews, changes, command, proposal, revoke() { grant = false; changes.checkPending(); } };
}

test('a reviewed draft applies exactly once and a validated backup can restore the previous profile', async (t) => {
  const { store, history, reviews, command, proposal } = fixture(t);
  const draft = proposal('Revised');
  const current = { draft: draft.id, revision: draft.revision };
  assert.deepEqual(command({ command: 'compare', ...current }).changed, ['name']);
  const pending = command({ command: 'apply', ...current });
  assert.equal(pending.status, 'awaiting_confirmation');
  assert.equal(store.current.name, 'Original');
  assert.deepEqual(reviews[0].proposal.changes, [{ field: 'name', before: 'Original', after: 'Revised' }]);
  reviews[0].answer(true);
  await turn();
  const applied = command({ command: 'status', request: pending.request });
  assert.equal(applied.status, 'applied');
  assert.equal(applied.resultVersion, store.editorSnapshot().token);
  assert.equal(store.current.name, 'Revised');
  assert.throws(() => command({ command: 'apply', ...current }), /changed/);

  const checkpoints = command({ command: 'backups' });
  assert.ok(checkpoints.backups.length);
  const restore = command({ command: 'restore', backup: checkpoints.backups[0].id, baseVersion: checkpoints.baseVersion });
  assert.equal(restore.status, 'awaiting_confirmation');
  reviews[1].answer(true);
  await turn();
  assert.equal(command({ command: 'status', request: restore.request }).status, 'applied');
  assert.equal(store.current.name, 'Original');
  assert.equal(history.snapshot().entries.length, 2);
  assert.doesNotMatch(JSON.stringify(history.snapshot()), /Revised|Original/);
});

test('a changed disk revision or a revoked grant closes review before writing', async (t) => {
  const { store, reviews, command, proposal, revoke } = fixture(t);
  const first = proposal('Agent');
  const pending = command({ command: 'apply', draft: first.id, revision: first.revision });
  const snapshot = store.editorSnapshot();
  store.save({ ...snapshot.profile, name: 'User edit' }, snapshot.token);
  assert.equal(reviews[0].proposal.signal.aborted, true);
  reviews[0].answer(true);
  await turn();
  assert.equal(command({ command: 'status', request: pending.request }).status, 'conflict');
  assert.equal(store.current.name, 'User edit');

  const draft = proposal('Second');
  const other = command({ command: 'apply', draft: draft.id, revision: draft.revision });
  revoke();
  reviews[1].answer(true);
  await turn();
  assert.equal(command({ command: 'status', request: other.request }).status, 'cancelled');
  assert.equal(store.current.name, 'User edit');
});

test('profile review expires without applying and fails safely when persistence rejects it', async (t) => {
  const { store, reviews, command, proposal } = fixture(t, { timeout: 15 });
  const draft = proposal('Proposed');
  const args = { command: 'apply', draft: draft.id, revision: draft.revision };
  const first = command(args);
  await delay(40);
  assert.equal(command({ command: 'status', request: first.request }).status, 'expired');
  assert.equal(reviews[0].proposal.signal.aborted, true);
  const second = command(args);
  store.save = () => { throw new Error('fixture failure'); };
  reviews[1].answer(true);
  await turn();
  const outcome = command({ command: 'status', request: second.request });
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.resultVersion, store.editorSnapshot().token);
  assert.equal(store.current.name, 'Original');
});
