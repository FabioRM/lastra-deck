'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { setImmediate } = require('node:timers/promises');
const { Workspaces } = require('../src/main/workspaces');
const { ActionHistory } = require('../src/main/action-history');
const { AgentWorkspaceInventory, workspaceParams } = require('../src/main/mcp-workspaces');
const { AgentWorkspaceApply, workspaceApplyParams, workspaceTargetParams } = require('../src/main/mcp-workspace-apply');
const { tempDir } = require('./helpers/temp-dir');

const owner = { id: '1'.repeat(32) };
const peer = { id: '2'.repeat(32) };
const alpha = 'C:\\PRIVATE_A\\Alpha.exe';
const beta = 'C:\\PRIVATE_B\\Beta.exe';
const escape = 'C:\\PRIVATE_ESCAPE\\Other.exe';
const config = { version: 1, workspaces: [
  { id: 'internal-project', name: 'PRIVATE workspace', apps: [
    { target: alpha, args: ['C:\\PRIVATE_NOTE\\notes.txt'], placement: { display: 'primary', x: .5, y: 0, width: .5, height: 1 } },
    { target: beta, placement: { display: 42, x: 0, y: .25, width: 1, height: .75 } },
  ] },
  { id: 'internal-powertoys', name: 'PRIVATE external layout', powerToysShortcut: 'C:\\PRIVATE_SHORTCUT\\Saved.lnk' },
] };

function fixture(t) {
  const directory = tempDir(t, 'lastra-mcp-workspaces-');
  const file = path.join(directory, 'workspaces.json');
  const write = (value) => fs.writeFileSync(file, JSON.stringify(value));
  write(config);
  const displays = [
    { id: 21, primary: true, workArea: { x: 0, y: 0, width: 1920, height: 1040 }, label: 'PRIVATE display' },
    { id: 42, primary: false, workArea: { x: -900, y: -50, width: 900, height: 650 }, label: 'PRIVATE second display' },
  ];
  const present = [
    { id: '31011:12138131831', path: alpha.toLowerCase(), title: 'PRIVATE title A', minimized: false, maximized: false,
      bounds: { x: 200, y: 200, width: 1000, height: 800 } },
    { id: '31012:22138131831', path: beta.toLowerCase(), title: 'PRIVATE title B', minimized: false, maximized: false,
      bounds: { x: -1600, y: 0, width: 700, height: 900 } },
    { id: '31013:32138131831', path: escape.toLowerCase(), title: 'PRIVATE unrelated', minimized: false, maximized: false,
      bounds: { x: 200, y: 200, width: 1000, height: 800 } },
  ];
  const lookup = (id, identity) => present.find((window) => window.id === id && window.path === identity);
  const probes = [];
  const effects = [];
  const hooks = {};
  let time = 0;
  let active;
  const windows = {
    workspaceWindows: (paths) => {
      probes.push(paths);
      return present.filter(({ path }) => paths.includes(path)).map((window) => ({ ...window }));
    },
    place(id, identity, destination) {
      const window = lookup(id, identity);
      assert.ok(window);
      effects.push({ id, destination });
      window.bounds = destination;
      return true;
    },
    reveal(id, identity) {
      const window = lookup(id, identity);
      assert.ok(window);
      effects.push({ id, shown: true });
      window.minimized = false;
      return true;
    },
    bounds(id, identity) {
      hooks.afterBounds?.(id);
      return lookup(id, identity)?.bounds;
    },
    focusWindow(id, identity) {
      const window = lookup(id, identity);
      assert.ok(window);
      effects.push({ id, focused: true });
      if (!hooks.ignoreFocus) active = window;
      return true;
    },
    foreground: () => active,
  };
  const workspaces = new Workspaces(file, { windows: () => windows, displays: () => displays,
    toScreenRect: (rect) => Object.fromEntries(Object.entries(rect).map(([key, value]) => [key, value * 2])),
    now: () => time, sleep: async (ms) => { time += ms; },
    run: async (action) => {
      assert.ok(hooks.launch, 'Unexpected workspace launch');
      effects.push(action);
      return hooks.launch(action);
    },
    readShortcutLink: () => hooks.link,
    openShortcut: async (file) => { effects.push(file); return hooks.shortcutError ?? ''; },
  });
  const inventory = new AgentWorkspaceInventory(workspaces, { now: () => 400_000, aliasKey: Buffer.alloc(32, 7) });
  const reads = (params = {}, client = owner) => inventory.snapshot(workspaceParams(params), client.id);
  const history = new ActionHistory();
  let proposal;
  let decide;
  let authorized = true;
  const approve = (next) => { proposal = next; return new Promise((resolve) => { decide = resolve; }); };
  approve.isOpen = () => false;
  const actions = new AgentWorkspaceApply({ inventory, approve, history });
  const call = (params, client = owner) => actions.change(client, workspaceApplyParams(params), () => authorized);
  const callTarget = (params, client = owner) => actions.change(client, workspaceTargetParams(params), () => authorized, 'target');
  const callExternal = (params, client = owner) => actions.change(client, workspaceApplyParams(params), () => authorized, 'external');
  const submit = () => {
    const { id, revision } = reads().workspaces[0];
    return call({ command: 'request', workspace: id, revision });
  };
  const readRequest = (request, client) => call({ command: 'status', request }, client);
  async function completed(request, requestCall = call) {
    for (let n = 0; n < 20; n++) {
      const result = requestCall({ command: 'status', request });
      if (!['awaiting_confirmation', 'running', 'cancel_requested'].includes(result.status)) return result;
      await setImmediate();
    }
    assert.fail('The workspace did not complete');
  }
  return { file, write, present, displays, inventory, workspaces, reads, probes, effects, hooks, history, actions, call, callTarget, callExternal, submit, readRequest,
    completed, proposal: () => proposal, decide: (answer) => decide(answer), revoke: () => { authorized = false; } };
}

test('workspace inventory joins registered targets, matching windows and physical displays without private details', (t) => {
  const f = fixture(t);
  const view = f.reads();
  assert.equal(view.status, 'available');
  assert.equal(view.windowsStatus, 'available');
  assert.deepEqual(f.probes, [[alpha.toLowerCase(), beta.toLowerCase()]]);
  assert.equal(view.targets.length, 2);
  assert.equal(view.windows.length, 2);
  assert.equal(view.workspaces[0].state, 'ready');
  assert.equal(view.workspaces[1].state, 'external-layout');
  assert.equal(view.workspaces[1].revision, null);
  const [primary, secondary] = view.monitors;
  assert.equal(primary.primary, true);
  assert.deepEqual(secondary.workAreaPx, { width: 1800, height: 1300 });
  assert.equal(view.workspaces[0].apps[1].monitor, secondary.id);
  assert.deepEqual(view.workspaces[0].apps[1].placementPx, { x: 0, y: 326, width: 1800, height: 974 });
  assert.ok(view.windows.some(({ monitor }) => monitor === secondary.id));
  for (const secret of ['PRIVATE', 'internal-project', '12138131831', 'Alpha.exe']) assert.ok(!JSON.stringify(view).includes(secret));
  const named = f.reads({ metadata: true });
  assert.equal(named.workspaces[0].name, 'PRIVATE workspace');
  assert.equal(named.targets[0].app, 'Alpha.exe');
  assert.doesNotMatch(JSON.stringify(named), /PRIVATE_A|PRIVATE_NOTE|PRIVATE title/);
  assert.notEqual(f.reads({}, peer).workspaces[0].id, view.workspaces[0].id);
  assert.notEqual(f.reads({}, peer).workspaces[0].revision, view.workspaces[0].revision);
  const first = f.reads({ limit: 1 });
  assert.equal(f.reads({ limit: 1, cursor: first.nextCursor }).windows.length, 1);
  assert.throws(() => f.reads({ limit: 1, cursor: first.nextCursor }, peer), /cursor is unavailable/);
  assert.deepEqual(f.effects, []);
  assert.throws(() => workspaceParams({ executable: alpha }), /inventory options/);
});

test('external layout approval pins the PowerToys shortcut, launcher and display topology', async (t) => {
  const f = fixture(t);
  f.hooks.link = { target: 'C:\\PRIVATE\\PowerToys.WorkspacesLauncher.exe', args: '--layout fixture', cwd: 'C:\\PRIVATE' };
  f.workspaces.launchStamp = (file) => `${file}:1`;
  const requestParams = () => {
    const { id, externalRevision } = f.reads().workspaces[1];
    assert.match(externalRevision, /^revision-/);
    return { command: 'request', workspace: id, revision: externalRevision };
  };
  const original = requestParams();
  assert.throws(() => f.call(original), /Inspect the inventory/);
  assert.throws(() => f.callExternal(original, peer), /Inspect the inventory/);
  const stale = f.callExternal(original);
  assert.equal(f.proposal().details[0].value.arguments, '--layout fixture');
  f.hooks.link.args = '--layout replaced';
  f.decide(true);
  assert.equal((await f.completed(stale.request, f.callExternal)).status, 'unavailable');
  assert.deepEqual(f.effects, []);
  const valid = f.callExternal(requestParams());
  assert.throws(() => f.readRequest(valid.request), /unavailable/);
  f.decide(true);
  const result = await f.completed(valid.request, f.callExternal);
  assert.deepEqual([result.status, result.attempted, result.confirmed], ['unconfirmed', 1, 0]);
  assert.deepEqual(f.effects, [config.workspaces[1].powerToysShortcut]);
  assert.doesNotMatch(JSON.stringify(f.history.snapshot()), /PRIVATE|replaced/);
  f.hooks.link.target = alpha;
  assert.equal(f.reads().workspaces[1].externalRevision, null);
});

test('a reviewed focus selects exactly one aliased window among matches and verifies the foreground', async (t) => {
  const f = fixture(t);
  const target = f.present[0];
  f.present.push({ ...target, id: 'other-window-same-app' });
  const initial = f.reads();
  const id = f.inventory.alias(owner.id, 'window', [target.path, target.id]);
  const row = initial.windows.find((window) => window.id === id);
  assert.match(row.focusRevision, /^revision-/);
  const params = { command: 'focus', window: row.id, revision: row.focusRevision };
  assert.throws(() => f.callTarget(params, peer), /Inspect the inventory/);
  const request = f.callTarget(params);
  assert.match(f.proposal().operation, /Focus selected/);
  assert.match(f.proposal().details[0].value.monitor, /Monitor 1/);
  assert.throws(() => f.readRequest(request.request), /unavailable/);
  f.decide(true);
  assert.equal((await f.completed(request.request, f.callTarget)).status, 'confirmed');
  assert.deepEqual(f.effects, [{ id: target.id, focused: true }]);
  const other = initial.windows.find(({ id, target }) => id !== row.id && target === row.target);
  f.hooks.ignoreFocus = true;
  const denied = f.callTarget({ command: 'focus', window: other.id, revision: other.focusRevision });
  f.decide(true);
  assert.equal((await f.completed(denied.request, f.callTarget)).status, 'unconfirmed');
  const repeat = f.callTarget(params);
  target.bounds = { ...target.bounds, width: 999 };
  f.decide(true);
  assert.equal((await f.completed(repeat.request, f.callTarget)).status, 'unavailable');
  assert.equal(f.effects.length, 2);
});

test('reviewed launch pins the selected workspace, registered arguments and executable before any write', async (t) => {
  const f = fixture(t);
  const [target] = f.present.splice(0, 1);
  f.workspaces.launchStamp = () => 'fixture version';
  const initial = f.reads();
  const workspace = initial.workspaces[0];
  const { target: id, launchRevision } = workspace.apps[0];
  assert.match(launchRevision, /^revision-/);
  assert.equal(workspace.apps[1].launchRevision, null);
  const params = { command: 'launch', workspace: workspace.id, target: id, revision: launchRevision };
  assert.throws(() => workspaceTargetParams({ ...params, args: ['arbitrary'] }), /required/);
  const stale = f.callTarget(params);
  assert.deepEqual(f.proposal().details[0].value.arguments, config.workspaces[0].apps[0].args);
  f.workspaces.launchStamp = () => 'replaced version';
  f.decide(true);
  assert.equal((await f.completed(stale.request, f.callTarget)).status, 'unavailable');
  assert.deepEqual(f.effects, []);
  const valid = f.callTarget(params);
  f.hooks.launch = async () => { f.present.push(target); return { ok: true }; };
  f.decide(true);
  assert.equal((await f.completed(valid.request, f.callTarget)).status, 'confirmed');
  assert.deepEqual(f.effects, [{ type: 'launch', target: alpha, args: config.workspaces[0].apps[0].args }]);
  assert.throws(() => f.callTarget(params), /Inspect the inventory/);
  assert.doesNotMatch(JSON.stringify(f.history.snapshot()), /PRIVATE_A|PRIVATE_NOTE/);
});

test('missing and duplicated windows or a lost monitor withhold the reviewed revision', (t) => {
  const f = fixture(t);
  const initial = f.reads().workspaces[0];
  f.present[0].bounds = null;
  assert.equal(f.reads().workspaces[0].state, 'unavailable-windows');
  f.present[0].minimized = true;
  assert.equal(f.reads().workspaces[0].state, 'ready');
  f.present.splice(1, 1);
  assert.equal(f.reads().workspaces[0].state, 'missing-windows');
  assert.equal(f.reads().workspaces[0].revision, null);
  f.present.push({ ...f.present[0], id: 'different' });
  assert.equal(f.reads().workspaces[0].state, 'ambiguous-windows');
  f.displays.pop();
  assert.equal(f.reads().workspaces[0].state, 'unavailable-monitor');
  assert.throws(() => f.call({ command: 'request', workspace: initial.id, revision: initial.revision }), /inspect the inventory/i);
  assert.deepEqual(f.effects, []);
});

test('reviewed exact targets are shown on the local deck and confirmed through the workspace readback', async (t) => {
  const f = fixture(t);
  const initial = fs.readFileSync(f.file, 'utf8');
  const request = f.submit();
  assert.equal(request.status, 'awaiting_confirmation');
  const proposal = f.proposal();
  assert.equal(proposal.kind, 'action');
  assert.equal(proposal.target, 'PRIVATE workspace');
  assert.equal(proposal.details[0].value.executable, alpha);
  assert.match(proposal.details[1].value.destinationMonitor, /Monitor 2/);
  assert.doesNotMatch(JSON.stringify(request), /PRIVATE|12138131831|Alpha.exe/);
  assert.deepEqual(f.effects, []);
  assert.throws(() => f.readRequest(request.request, peer), /request is unavailable/);
  f.decide(true);
  const result = await f.completed(request.request);
  assert.deepEqual([result.status, result.total, result.attempted, result.confirmed], ['confirmed', 2, 2, 2]);
  assert.deepEqual(f.effects, [{ id: f.present[0].id, destination: { x: 1920, y: 0, width: 1920, height: 2080 } },
    { id: f.present[1].id, destination: { x: -1800, y: 226, width: 1800, height: 974 } }]);
  assert.equal(fs.readFileSync(f.file, 'utf8'), initial);
  assert.match(JSON.stringify(f.history.snapshot()), /Arrange approved workspace/);
  assert.doesNotMatch(JSON.stringify(f.history.snapshot()), /PRIVATE|Alpha.exe/);
});

test('rechecking the revision invalidates changed target, topology, or config and declines without effects', async (t) => {
  const f = fixture(t);
  const first = f.submit();
  f.present[0].id = 'replacement-window';
  f.decide(true);
  assert.equal((await f.completed(first.request)).status, 'unavailable');
  const second = f.submit();
  f.displays[0].workArea = { ...f.displays[0].workArea, width: 1900 };
  f.decide(true);
  assert.equal((await f.completed(second.request)).status, 'unavailable');
  const third = f.submit();
  const alternate = structuredClone(config);
  alternate.workspaces[0].apps[0].args = ['changed after review'];
  f.write(alternate);
  f.decide(true);
  assert.equal((await f.completed(third.request)).status, 'unavailable');
  const fourth = f.submit();
  f.decide(false);
  assert.equal((await f.completed(fourth.request)).status, 'declined');
  assert.deepEqual(f.effects, []);
  assert.throws(() => workspaceApplyParams({ command: 'request', workspace: 'internal-project', revision: 'raw' }), /alias and revision/);
});

test('a saved app without a placement only shows its approved existing window and confirms it is no longer minimized', async (t) => {
  const f = fixture(t);
  const current = structuredClone(config);
  delete current.workspaces[0].apps[0].placement;
  f.write(current);
  f.present[0].minimized = true;
  f.present[0].bounds = null;
  const request = f.submit();
  assert.match(f.proposal().details[0].value.effect, /Show an existing window/);
  f.decide(true);
  const result = await f.completed(request.request);
  assert.deepEqual([result.status, result.confirmed], ['confirmed', 2]);
  assert.deepEqual(f.effects[0], { id: f.present[0].id, shown: true });
  assert.equal(f.present[0].minimized, false);
});

test('revoking the agent grant during the run stops before the second already reviewed placement', async (t) => {
  const f = fixture(t);
  const request = f.submit();
  f.hooks.afterBounds = () => f.revoke();
  f.decide(true);
  // A revoked client cannot query results. Read only our isolated internal record to verify the effects and outcome.
  for (let n = 0; n < 20 && f.actions.running; n++) await setImmediate();
  const result = f.actions.requests.get(request.request);
  assert.equal(result.status, 'cancelled');
  assert.equal(result.attempted, 1);
  assert.equal(result.confirmed, 1);
  assert.equal(f.effects.length, 1);
  assert.throws(() => f.readRequest(request.request), /grant changed/);
});
