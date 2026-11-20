'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ActionHistory } = require('../src/main/action-history');
const { AppViews } = require('../src/main/app-views');

test('action history records only display metadata, with generic labels for sensitive-looking text', async () => {
  const history = new ActionHistory({ now: () => 42 });
  const response = { ok: false, message: 'Could not open https://private.test/?token=fake-example' };
  const action = { type: 'text', text: 'Private pasted text' };
  assert.equal(await history.run({ label: 'Insert template', origin: 'deck', context: 'Home', gesture: 'hold', action }, () => response), response);
  const entries = [{ label: 'Insert template', origin: 'deck', context: 'Home', gesture: 'hold', at: 42, outcome: 'failed' }];
  assert.deepEqual(history.snapshot(), { entries });
  history.snapshot().entries[0].label = 'Changed outside the recorder';
  assert.deepEqual(history.snapshot(), { entries });

  await assert.rejects(history.run({ label: 'https://private.test/', origin: 'app', context: 'token=private' }, () => {
    throw new Error('Sensitive command error');
  }), /Sensitive command error/);
  assert.deepEqual(history.snapshot().entries[0], {
    label: 'App command', origin: 'app', context: '', gesture: undefined, at: 42, outcome: 'failed',
  });
});

test('only the most recent 100 completed commands are kept in request order', async () => {
  const history = new ActionHistory();
  let finish;
  const slow = history.run({ label: 'First command', origin: 'deck', at: 0 }, () => new Promise((resolve) => { finish = resolve; }));
  assert.deepEqual(history.snapshot(), { entries: [] });
  for (let i = 1; i <= 101; i++) {
    await history.run({ label: 'Key ' + i, origin: 'deck', at: i }, () => ({ ok: true }));
  }
  finish({ ok: true });
  await slow;
  const { entries } = history.snapshot();
  assert.equal(entries.length, 100);
  assert.equal(entries[0].label, 'Key 101');
  assert.equal(entries.at(-1).label, 'Key 2');
});

test('live step results retain outcomes and retry counts without command details', async () => {
  const history = new ActionHistory();
  const path = [1, 'then'];
  await history.run({ origin: 'deck' }, () => ({ ok: true, steps: [
    { type: 'launch', path, status: 'succeeded', attempts: [{ message: 'Private argument' }, { status: 'succeeded' }] },
  ] }));
  assert.deepEqual(history.snapshot().entries[0].steps, [{ path, type: 'launch', status: 'succeeded', attempts: 2 }]);
  history.snapshot().entries[0].steps[0].path.push(9);
  assert.deepEqual(history.snapshot().entries[0].steps[0].path, [1, 'then']);
  assert.doesNotMatch(JSON.stringify(history.snapshot()), /Private argument/);
});

test('app view commands share the same history and window titles stay out of it', async () => {
  const history = new ActionHistory({ now: () => 10 });
  const windows = { foreground: () => ({ executable: 'elsewhere.exe' }), focus: () => true };
  const file = path.join(os.tmpdir(), `lastra-action-history-${randomUUID()}.json`);
  const views = new AppViews(file, {
    actionHistory: history, providers: { 'action-history': history }, createWindows: () => windows,
    views: [{
      id: 'custom', name: 'Writing', custom: true, match: { executable: 'notepad.exe' },
      commands: [{ id: 'find', label: 'Find', action: { type: 'hotkey', keys: 'Ctrl+F' } }],
    }, { id: 'action-history', name: 'Action history', provider: 'action-history', commands: [] }],
  });
  await assert.rejects(views.change({ type: 'action', viewId: 'custom', actionId: 'find' }), /matching app window/);
  assert.deepEqual(await views.change({ type: 'window', viewId: 'custom', windowId: '101:202', title: 'Private title' }), { ok: true });
  assert.deepEqual(views.data('action-history').entries, [
    { label: 'Switch window', origin: 'app', context: 'Writing', gesture: undefined, at: 10, outcome: 'succeeded' },
    { label: 'Find', origin: 'app', context: 'Writing', gesture: undefined, at: 10, outcome: 'failed' },
  ]);
});
