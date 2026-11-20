'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validateProfile } = require('../src/main/profile');
const { profileSnapshot, snapshotParams } = require('../src/main/mcp-snapshot');
const { createSession } = require('../extensions/lastra-mcp/stdio');

function fixture() {
  const action = { type: 'open', target: 'C:/sensitive-fixture/private.txt' };
  const profile = validateProfile({
    grid: { cols: 8, rows: 3 },
    pages: [
      { id: 'home', keys: [{ id: 'docs', action, label: 'Sensitive fixture' }, { id: 'timer', action }] },
      { id: 'terminal', apps: ['WindowsTerminal.exe'], windowTitle: { mode: 'contains', value: 'Sensitive fixture' },
        keys: [], widgets: [{ id: 'load', type: 'system-metric' }] },
    ],
    bar: { keys: [{ id: 'global', action }] },
  });
  return {
    profile, active: profile.pages[0], revision: 8, now: 1234,
    navigation: { activity: 'work', view: 'stats', statsTab: 'cooling', sheet: 0, pageLocked: true },
    surface: { physical: { width: 2560, height: 720, units: 'px' }, logical: { width: 2048, height: 576, units: 'dip' } },
  };
}

test('profile snapshots expose scoped metadata with stable pagination and redact commands and window titles', () => {
  const state = fixture();
  const first = profileSnapshot(state, { section: 'keys', limit: 1 });
  assert.equal(first.entries[0].id, 'docs');
  assert.equal(first.sampledAt, 1234);
  assert.equal(first.revision, 8);
  assert.ok(first.nextCursor);
  const second = profileSnapshot(state, { section: 'keys', limit: 1, cursor: first.nextCursor });
  assert.deepEqual(second.entries.map(({ id }) => id), ['timer']);
  assert.throws(() => profileSnapshot({ ...state, revision: 9 }, { section: 'keys', limit: 1, cursor: first.nextCursor }), /cursor/);
  assert.throws(() => profileSnapshot(state, { section: 'keys', limit: 1, cursor: first.nextCursor, query: 'timer' }), /cursor/);
  assert.throws(() => snapshotParams({ section: 'keys', limit: 100 }), /snapshot/);
  const widgets = profileSnapshot(state, { section: 'widgets', page: 'terminal' });
  assert.equal(widgets.entries[0].type, 'system-metric');
  const rules = profileSnapshot(state, { section: 'rules', query: 'terminal' });
  assert.equal(rules.entries[0].windowTitleMode, 'contains');
  assert.equal(rules.entries[0].executables[0], 'windowsterminal.exe');
  assert.equal(profileSnapshot(state, { section: 'bar' }).entries[0].id, 'global');
  assert.equal(profileSnapshot(state, { section: 'navigation' }).entries[0].statsTab, 'cooling');
  assert.equal(profileSnapshot(state).entries[0].surface.physical.units, 'px');
  assert.doesNotMatch(JSON.stringify({ first, second, rules, widgets }), /sensitive|private\.txt/i);
});

test('versioned profile resources map fixed URIs to the same scoped operation as the tool', async () => {
  const replies = [];
  const calls = [];
  const link = { async call(name, args) {
    calls.push({ name, args });
    return { ok: true, data: profileSnapshot(fixture(), args) };
  } };
  const session = createSession({ credential: 'fixture', connect: async () => link, send: (reply) => replies.push(reply) });
  async function request(method, params) {
    await session.receive({ jsonrpc: '2.0', method, params, id: replies.length + 1 });
    return replies.at(-1);
  }
  await request('initialize', { protocolVersion: '2025-06-18' });
  const resources = (await request('resources/templates/list')).result.resourceTemplates;
  assert.ok(resources[0].uriTemplate.startsWith('lastra://v1/deck/profile'));
  const args = { section: 'widgets', page: 'terminal', limit: 1 };
  const uri = 'lastra://v1/deck/profile?section=widgets&page=terminal&limit=1';
  const result = (await request('resources/read', { uri })).result.contents[0];
  assert.equal(JSON.parse(result.text).entries.length, 1);
  const tool = (await request('tools/call', { name: 'profile_snapshot', arguments: args })).result;
  assert.deepEqual(JSON.parse(result.text), tool.structuredContent);
  assert.deepEqual(calls.map(({ name, args }) => ({ name, args: { ...args } })),
    [1, 2].map(() => ({ name: 'profile_snapshot', args })));
  assert.equal((await request('resources/read', { uri: 'lastra://v1/deck/profile?section=keys&section=bar' })).error.code, -32602);
  assert.equal((await request('resources/read', { uri: 'file:///C:/sensitive-fixture' })).error.code, -32002);
  assert.equal(calls.length, 2);
});
