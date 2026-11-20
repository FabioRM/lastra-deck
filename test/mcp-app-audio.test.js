'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { setImmediate: settle } = require('node:timers/promises');
const { AgentAppAudio, audioAppLevelParams } = require('../src/main/mcp-app-audio');
const { AgentAudioReader, audioParams } = require('../src/main/mcp-audio');
const { applySessionLevels, groupSessions, sessionBinding } = require('../src/main/audio-sessions-win32');
const { ActionHistory } = require('../src/main/action-history');

const appId = 'a'.repeat(64);
const client = { id: 'fixture-owner' };
const allow = () => true;
const session = (instance, scalar) => ({ id: appId, name: 'Fixture app', active: true, canPin: true,
  instance, scalar, level: Math.round(scalar * 100), muted: false });

function controls(items) {
  const values = new Map(items.map(({ instance, scalar }) => [instance, scalar]));
  const writes = [];
  const rows = items.map(({ instance }) => ({ instance, read: () => values.get(instance), write(value) {
    writes.push([instance, value]);
    values.set(instance, value);
  } }));
  return { rows, values, writes };
}

test('app session binding verifies the whole group without depending on Windows enumeration order', () => {
  const sessions = [session('first', 0.24), session('second', 0.61)];
  const expected = sessionBinding(sessions);
  assert.deepEqual(sessionBinding([...sessions].reverse()), expected);
  assert.equal(sessionBinding([sessions[0], sessions[0]]), null);
  assert.equal(sessionBinding([session(null, 0.2)]), null);
  const { rows, writes } = controls(sessions);
  const other = { instance: 'unrelated', read: () => 0.85, write: () => assert.fail('Unreviewed session changed') };
  assert.throws(() => applySessionLevels([...rows, other], expected.revision, 40, allow), /changed/);
  assert.deepEqual(writes, []);
  applySessionLevels([...rows].reverse(), expected.revision, 40, allow);
  assert.deepEqual(writes, [['second', 0.4], ['first', 0.4]]);
});

test('a partial Windows mixer write restores verified prior scalars without overwriting an external change', () => {
  const sessions = [session('first', 0.241), session('second', 0.613)];
  const { rows, values, writes } = controls(sessions);
  rows[1].write = () => { throw new Error('session expired'); };
  const { revision } = sessionBinding(sessions);
  assert.throws(() => applySessionLevels(rows, revision, 40, allow), /expired/);
  assert.equal(values.get('first'), 0.241);
  assert.deepEqual(writes, [['first', 0.4], ['first', 0.241]]);
  rows[1].write = () => { values.set('first', 0.75); throw new Error('session expired'); };
  assert.throws(() => applySessionLevels(rows, revision, 40, allow), /expired/);
  assert.equal(values.get('first'), 0.75);
});

test('scoped mixer exposes opaque caller-specific revisions only for live verifiable sessions', () => {
  const now = 12_000;
  let elapsed = 0;
  const read = new AgentAudioReader({ readState: () => null, listApps() {
    if (elapsed) throw new Error('unavailable');
    return groupSessions([session('private-session', 0.25)], true);
  }, pinStatus: (apps) => apps.map((app) => ({ ...app, online: true })), now: () => now, monotonic: () => elapsed });
  const params = audioParams({ section: 'mixer' });
  const first = read.snapshot(params, client.id);
  const second = read.snapshot(params, 'another-agent');
  assert.match(first.apps[0].revision, /^app-rev-[a-f0-9]{24}$/);
  assert.notEqual(first.apps[0].revision, second.apps[0].revision);
  assert.doesNotMatch(JSON.stringify(first), /Fixture app|private-session|binding/);
  elapsed = 2000;
  assert.equal(read.snapshot(params, client.id).apps[0].revision, undefined);
});

test('agent audio requires an exact mixer revision and verifies the same app session after approval', async () => {
  let sessions = [session('private-session', 0.24), session('second', 0.61)];
  const read = new AgentAudioReader({});
  const state = () => groupSessions(sessions, true);
  const history = new ActionHistory();
  let answer;
  let approval;
  let replace = false;
  let writes = 0;
  const agent = new AgentAppAudio({
    read: state, alias: (owner, kind, id) => read.alias(owner, kind, id), revision: (owner, id, stamp) => read.appRevision(owner, id, stamp),
    history, canReview: allow, approve: (details) => { approval = details; return new Promise((resolve) => { answer = resolve; }); },
    write(_device, level, id, _before, endpoint) {
      assert.equal(id, appId);
      assert.equal(endpoint.stamp, sessionBinding(sessions).revision);
      writes++;
      sessions = sessions.map((item, index) => session(replace && index === 0 ? 'replacement' : item.instance, level / 100));
    },
  });
  const request = (key) => audioAppLevelParams({ command: 'request', target: read.alias(client.id, 'app', appId),
    before: read.appRevision(client.id, appId, state()[0].binding.revision), level: 43, idempotencyKey: key });
  const status = ({ request }) => agent.change(client, { command: 'status', request }, allow).status;
  let changes = request('fixture-first');
  const first = agent.change(client, changes, allow);
  assert.equal(first.status, 'awaiting_confirmation');
  assert.equal(approval.target, 'Fixture app');
  assert.equal(approval.details[0].value, 2);
  assert.equal(writes, 0);
  assert.equal(agent.change(client, changes, allow).request, first.request);
  sessions[1] = session('external', 0.61);
  answer(true);
  await settle();
  assert.equal(status(first), 'stale');
  assert.equal(writes, 0);
  assert.throws(() => agent.change(client, { ...changes, idempotencyKey: 'stale-revision' }, allow), /changed/);
  const second = agent.change(client, request('fixture-second'), allow);
  answer(true);
  await settle();
  assert.equal(status(second), 'confirmed');
  assert.equal(writes, 1);
  sessions[0] = session('private-session', 0.28);
  replace = true;
  const last = agent.change(client, request('fixture-third'), allow);
  answer(true);
  await settle();
  assert.equal(status(last), 'unconfirmed');
  assert.equal(writes, 2);
  assert.doesNotMatch(JSON.stringify(history.snapshot()), /Fixture app|private-session|replacement/);
});
