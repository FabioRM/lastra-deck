'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { SCOPES, activityScope } = require('../src/main/mcp-access');
const { RunActivity, SCOPE, runParams } = require('../src/main/mcp-run-activity');

function fixture() {
  let now = 10_000;
  let available = true;
  let activity = 'work';
  const owner = { id: '0123456789abcdef', scopes: [SCOPE], profile: activity };
  const second = { id: 'abcdef0123456789', scopes: [SCOPE], profile: activity };
  const clients = new Map([owner, second].map((client) => [client.id, client]));
  const runs = new RunActivity({ activity: () => activity, client: (id) => clients.get(id), available: () => available, now: () => now });
  const publish = (overrides = {}, client = owner, authorized = () => true) => runs.change(runParams({
    command: 'publish', run: 'test-build', revision: 1, summary: 'Validate build', project: 'Project', state: 'running', progress: 0,
    ...overrides,
  }), client, authorized);
  return { runs, clients, owner, second, publish, advance: (ms) => { now += ms; }, setActivity: (id) => { activity = id; },
    setAvailable: (value) => { available = value; } };
}

test('run activity validates bounded fields, state-dependent waits and an activity-scoped grant', () => {
  assert.ok(SCOPES[SCOPE]);
  assert.equal(activityScope(SCOPE), true);
  const payload = { command: 'publish', run: 'my-run', revision: 1, summary: ' Test ', state: 'running' };
  assert.deepEqual(runParams(payload).data, { state: 'running', summary: 'Test' });
  for (const change of [{ run: 'https://example.com' }, { revision: 0 }, { progress: 101 }, { summary: 'a'.repeat(121) },
    { summary: 'Unsafe\nline' }, { summary: 'direction\u202e' }, { state: 'waiting' }, { waitReason: 'Unexpected' },
    { url: 'file:///private/config' }, { command: 'withdraw' }]) {
    assert.throws(() => runParams({ ...payload, ...change }), /bounded status/i);
  }
  assert.equal(runParams({ ...payload, state: 'waiting', waitReason: 'Review' }).data.waitReason, 'Review');
});

test('agents can publish independent runs while local pins require the displayed revision', () => {
  const { runs, owner, second, publish, advance, setActivity } = fixture();
  const accepted = publish();
  advance(100);
  assert.deepEqual(publish(), accepted);
  assert.throws(() => publish({ progress: 5 }), /revision changed/i);
  assert.throws(() => publish({ revision: 2 }, owner, () => false), /unavailable/i);
  publish({ summary: 'Second agent' }, second);
  const { id } = runs.snapshot().runs.find((run) => run.agent === '01234567');
  assert.equal(runs.changeFromDeck({ action: 'pin', id, revision: 1, pinned: true }).ok, true);
  assert.equal(runs.snapshot().runs[0].id, id);
  publish({ revision: 2, state: 'waiting', waitReason: 'Review needed', step: 'Inspect diagnostics', progress: 40 });
  assert.equal(runs.pin({ id, revision: 1, pinned: false }).ok, false);
  const [pinned] = runs.snapshot().runs;
  assert.equal(pinned.id, id);
  assert.equal(pinned.pinned, true);
  assert.equal(pinned.waitReason, 'Review needed');
  assert.equal(pinned.owner, undefined);
  assert.equal(pinned.run, undefined);
  setActivity('meeting');
  assert.deepEqual(runs.snapshot().runs, []);
  assert.equal(runs.pin({ id, revision: 2, pinned: false }).ok, false);
  assert.throws(() => publish({ revision: 3 }), /unavailable/i);
  setActivity('work');
  assert.equal(runs.pin({ id, revision: 2, pinned: false }).ok, true);
});

test('terminal and disconnected cards expire or withdraw without leaking across lock or revocation', () => {
  const { runs, clients, owner, second, publish, advance, setAvailable } = fixture();
  publish();
  publish({ revision: 2, state: 'completed' });
  publish({ run: 'fresh' }, second);
  assert.throws(() => publish({ revision: 3 }), /revision changed/i);
  advance(2 * 60_000);
  assert.deepEqual(runs.snapshot().runs.map(({ state, progress }) => [state, progress]), [['completed', 100]]);
  const withdraw = runParams({ command: 'withdraw', run: 'test-build', revision: 2 });
  assert.throws(() => runs.change(withdraw, second, () => true), /revision changed/i);
  const result = runs.change(withdraw, owner, () => true);
  assert.deepEqual(runs.change(withdraw, owner, () => true), result);
  assert.equal(result.state, 'withdrawn');
  assert.deepEqual(runs.snapshot().runs, []);
  assert.throws(() => publish({ revision: 5 }), /revision changed/i);
  publish({ run: 'fresh' }, second);
  clients.delete(second.id);
  assert.deepEqual(runs.snapshot().runs, []);
  publish({ run: 'another' });
  setAvailable(false);
  assert.deepEqual(runs.snapshot(), { status: 'unavailable', runs: [] });
  setAvailable(true);
  assert.deepEqual(runs.snapshot(), { status: 'ready', runs: [] });
});

test('status capacity is limited without evicting existing agent cards', () => {
  const { runs, publish } = fixture();
  for (let i = 1; i <= 4; i++) publish({ run: `test-${i}` });
  assert.throws(() => publish({ run: 'test-5' }), /list is full/i);
  publish({ run: 'test-1', revision: 2, state: 'failed' });
  assert.equal(runs.snapshot().runs.length, 4);
});
