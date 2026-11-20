'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { setImmediate: settle } = require('node:timers/promises');
const { ActivityProfiles } = require('../src/main/activity-profiles');
const { AgentActivitySwitch, activitySwitchParams } = require('../src/main/mcp-activity-switch');
const { ActionHistory } = require('../src/main/action-history');
const { tempDir } = require('./helpers/temp-dir');

const owner = { id: 'fixture-agent' };
const allow = () => true;
const profile = (label) => ({ keys: [{ id: 'delay', label, action: { type: 'delay', ms: 25 } }] });

function fixture(t, options = {}) {
  let activities;
  let agent;
  t.after(() => {
    agent?.interrupt();
    activities?.current.store.close();
  });
  const directory = tempDir(t, 'lastra-activity-switch-');
  const stock = path.join(directory, 'stock');
  fs.mkdirSync(stock);
  for (const id of ['default', 'work', 'meeting', 'gaming', 'streaming']) fs.writeFileSync(path.join(stock, id + '.json'), JSON.stringify(profile(id)));
  activities = new ActivityProfiles({ directory, stockDirectory: stock });
  activities.activate('main');
  const history = new ActionHistory();
  let resolveReview;
  let review;
  agent = new AgentActivitySwitch({ activities, history, canReview: allow,
    switchTo: (id) => ({ active: activities.activate(id).id, saved: true }),
    approve: (request) => { review = request; return new Promise((resolve) => { resolveReview = resolve; }); },
    ...options,
  });
  const command = (command, args = {}, client = owner, authorized = allow) => agent.change(client, activitySwitchParams({ command, ...args }), authorized);
  return { directory, activities, history, command, review: () => review, finishReview: (answer) => resolveReview(answer), agent };
}

function switchParams(command, activity = 'work') {
  const { revision } = command('inspect').choices.find(({ id }) => id === activity);
  return { activity, revision };
}

test('activity switching reveals only typed choices, creates stock only on approval and retains a private result', async (t) => {
  const { directory, command, review, finishReview, history } = fixture(t);
  const file = path.join(directory, 'profile-work.json');
  assert.equal(command('inspect').active, 'main');
  assert.deepEqual(Object.keys(command('inspect').choices[0]), ['id', 'label', 'revision', 'stock']);
  assert.equal(command('inspect').choices.find(({ id }) => id === 'work').stock, true);
  const pending = command('switch', switchParams(command));
  assert.equal(pending.status, 'awaiting_confirmation');
  assert.equal(review().signal.aborted, false);
  assert.match(review().details[2].value, /default/);
  assert.equal(fs.existsSync(file), false);
  assert.throws(() => command('status', { request: pending.request }, { id: 'another-agent' }), /unavailable/);
  assert.throws(() => command('status', { request: pending.request }, owner, () => false), /grant changed/);
  finishReview(true);
  await settle();
  const result = command('status', { request: pending.request });
  assert.equal(result.status, 'switched');
  assert.equal(result.active, 'work');
  assert.equal(result.saved, true);
  assert.equal(JSON.parse(fs.readFileSync(file)).keys[0].label, 'work');
  assert.equal(command('inspect').active, 'work');
  assert.equal(history.snapshot().entries[0].outcome, 'succeeded');
});

test('activity switching rejects stale inspections and changes of destination or source during approval', async (t) => {
  const { activities, directory, command, review, finishReview } = fixture(t);
  const stale = switchParams(command);
  const workFile = path.join(directory, 'profile-work.json');
  fs.writeFileSync(workFile, JSON.stringify(profile('changed before review')));
  assert.throws(() => command('switch', stale), /changed/);
  const pending = command('switch', switchParams(command));
  fs.writeFileSync(workFile, JSON.stringify(profile('changed after review')));
  finishReview(true);
  await settle();
  assert.equal(command('status', { request: pending.request }).status, 'conflict');
  assert.equal(activities.current.id, 'main');
  const current = command('switch', switchParams(command));
  activities.activate('meeting');
  activities.activate('main');
  finishReview(true);
  await settle();
  assert.equal(command('status', { request: current.request }).status, 'conflict');
  assert.equal(review().signal.aborted, true);
});

test('activity switching cancels on surface or grant loss and does not misreport unpersisted results', async (t) => {
  let surface = {};
  let allowed = true;
  const { activities, command, agent, finishReview, history } = fixture(t, { canReview: () => surface,
    switchTo: (id) => ({ active: activities.activate(id).id, saved: false }),
  });
  let pending = command('switch', switchParams(command));
  surface = {};
  agent.checkPending();
  finishReview(true);
  await settle();
  assert.equal(command('status', { request: pending.request }).status, 'cancelled');
  pending = command('switch', switchParams(command), owner, () => allowed);
  allowed = false;
  finishReview(true);
  await settle();
  assert.equal(command('status', { request: pending.request }).status, 'cancelled');
  pending = command('switch', switchParams(command));
  finishReview(true);
  await settle();
  const result = command('status', { request: pending.request });
  assert.equal(result.status, 'unconfirmed');
  assert.equal(result.active, 'work');
  assert.equal(result.saved, false);
  assert.equal(history.snapshot().entries[0].outcome, 'failed');
});
