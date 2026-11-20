'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { test } = require('node:test');
const { ActionHistory } = require('../src/main/action-history');
const { AgentAccess } = require('../src/main/mcp-access');
const { connectAgent } = require('../src/main/mcp-client');
const { readFrames, writeFrame } = require('../src/main/mcp-link');
const { AgentService } = require('../src/main/mcp-service');
const { AgentEvents, eventParams } = require('../src/main/mcp-events');
const { navigationParams, navigationSurface } = require('../src/main/mcp-navigation');
const { providerStatus } = require('../src/main/mcp-catalog');
const { createSession } = require('../extensions/lastra-mcp/stdio');
const { tempDir } = require('./helpers/temp-dir');

const profile = { grid: { cols: 8, rows: 3 }, pages: [
  { id: 'sample', keys: [{ id: 'folder', action: { type: 'open', target: 'C:/private-fixture/file.txt' } }] },
] };

function fixture(t, events) {
  let service;
  t.after(() => {
    service?.stop();
    events?.close();
  });
  const dir = tempDir(t, 'lastra-agent-test-');
  const file = path.join(dir, 'agent-access.json');
  const address = process.platform === 'win32' ? undefined : () => path.join(dir, 'test.sock');
  // Windows uses the real current-user DPAPI in every live test.
  const protect = process.platform === 'win32' ? undefined : () => ({
    protect: (bytes) => Buffer.from(bytes), unprotect: (bytes) => Buffer.from(bytes),
  });
  const access = new AgentAccess(file, { protect });
  const history = new ActionHistory();
  let activity = 'main';
  const readers = {
    profile_layout: () => ({ page: 'profile-fixture' }),
    provider_status: () => ({ audio: 'available' }),
  };
  service = new AgentService(access, { profile: () => activity, readers, history, events, address });
  const client = async (credential, { onNotice } = {}) => {
    const link = await connectAgent(credential, { address, protect, onNotice });
    t.after(() => link.close());
    return link;
  };
  return { access, service, readers, history, client, select: (id) => { activity = id; } };
}

test('agent grants start disabled, restrict the active profile, and record redacted reads', async (t) => {
  const { access, service, history, client, select } = fixture(t);
  assert.equal(access.state.enabled, false);
  assert.throws(() => access.grant(['layout'], 'main'), /Enable agent access/);
  access.setEnabled(true);
  const layoutCredential = access.grant(['layout'], 'main');
  const providerCredential = access.grant(['providers'], 'main');
  service.setLocked(false);
  await once(service.server, 'listening');

  const layout = await client(layoutCredential);
  const provider = await client(providerCredential);
  const wrongSecret = layoutCredential.split('.');
  wrongSecret[3] = providerCredential.split('.')[3];
  await assert.rejects(client(wrongSecret.join('.')), /unavailable/);
  assert.equal(service.connected().size, 2);
  assert.deepEqual((await layout.call('connection')).data.scopes, ['layout']);
  assert.deepEqual((await layout.call('profile_layout')).data, { page: 'profile-fixture' });
  assert.equal((await layout.call('provider_status')).ok, false);
  assert.deepEqual((await provider.call('provider_status')).data, { audio: 'available' });
  select('meeting');
  assert.equal((await layout.call('profile_layout')).ok, false);
  assert.equal((await provider.call('C:/sensitive-fixture')).ok, false);
  const serialized = JSON.stringify(history.snapshot());
  assert.match(serialized, /Read profile layout/);
  assert.match(serialized, /Unknown agent request/);
  assert.doesNotMatch(serialized, /sensitive-fixture|profile-fixture/);
  assert.ok(!serialized.includes(layoutCredential));
});

test('locking, pausing and revocation close clients and discard an in-flight read', async (t) => {
  const { access, service, readers, client } = fixture(t);
  access.setEnabled(true);
  const credential = access.grant(['layout'], 'main');
  service.setLocked(false);
  await once(service.server, 'listening');
  const link = await client(credential);

  let readStarted;
  let complete;
  const started = new Promise((resolve) => { readStarted = resolve; });
  readers.profile_layout = () => new Promise((resolve) => { complete = resolve; readStarted(); });
  const read = link.call('profile_layout');
  await started;
  access.revoke(access.state.clients[0].id);
  service.reconcile();
  complete({ page: 'discarded' });
  await assert.rejects(read, /unavailable/);
  await assert.rejects(client(credential), /unavailable/);

  const otherCredential = access.grant(['providers'], 'main');
  const paused = await client(otherCredential);
  access.setPaused(true);
  service.reconcile();
  await assert.rejects(paused.call('connection'), /unavailable/);
  access.setPaused(false);
  service.reconcile();
  await once(service.server, 'listening');
  const locked = await client(otherCredential);
  service.setLocked(true);
  await assert.rejects(locked.call('connection'), /unavailable/);
  assert.equal(service.server, null);
});

test('temporary access closes its connection and discards a pending read at expiry', async (t) => {
  const { access, service, client, readers } = fixture(t);
  access.setEnabled(true);
  const temporary = access.grant(['layout'], 'main', { durationMs: 1_200 });
  const permanent = access.grant(['providers'], 'main');
  service.setLocked(false);
  await once(service.server, 'listening');
  const [limited, normal] = await Promise.all([client(temporary), client(permanent)]);
  const connection = await limited.call('connection');
  assert.ok(connection.data.expiresAt > Date.now());
  assert.equal((await normal.call('connection')).data.expiresAt, undefined);

  let complete;
  const started = new Promise((resolve) => {
    readers.profile_layout = () => new Promise((answer) => { complete = answer; resolve(); });
  });
  const pending = limited.call('profile_layout');
  const disconnected = assert.rejects(pending, /unavailable/);
  await started;
  await disconnected;
  complete({ page: 'discarded' });
  await assert.rejects(client(temporary), /unavailable/);
  assert.equal(access.activeClients().length, 1);
  assert.equal(access.state.clients.length, 1);
  assert.equal((await normal.call('provider_status')).ok, true);
});

test('expired grants fail after reload and their entries are reclaimed when granting access', (t) => {
  const directory = tempDir(t, 'lastra-temporary-grants-');
  const file = path.join(directory, 'agent-access.json');
  const protect = () => ({ protect: (value) => Buffer.from(value) });
  let now = 1200;
  const options = { protect, now: () => now };
  const access = new AgentAccess(file, options);
  access.setEnabled(true);
  access.grant(['layout'], 'main', { durationMs: 300 });
  const [{ id }] = access.activeClients();
  assert.equal(access.expirationDelay(), 300);
  now = 1500;
  const restarted = new AgentAccess(file, options);
  assert.equal(restarted.client(id), null);
  assert.equal(restarted.expirationDelay(), undefined);
  restarted.grant(['providers'], 'main');
  assert.equal(restarted.state.clients.length, 1);
  assert.throws(() => restarted.grant(['providers'], 'main', { durationMs: 0 }), /duration/);
});

test('navigation uses a distinct activity grant and only dispatches typed commands for the local deck', async (t) => {
  const { access, service, readers, client, select } = fixture(t);
  const calls = [];
  readers.deck_navigation = (parameters) => { calls.push(parameters); return { view: parameters.view }; };
  access.setEnabled(true);
  const readGrant = access.grant(['layout'], 'main');
  const navigationGrant = access.grant(['navigate'], 'main');
  service.setLocked(false);
  await once(service.server, 'listening');
  const read = await client(readGrant);
  const navigate = await client(navigationGrant);
  assert.equal((await read.call('deck_navigation', { command: 'inspect' })).ok, false);
  assert.ok((await navigate.call('connection')).data.available.includes('deck_navigation'));
  assert.equal((await navigate.call('deck_navigation', { command: 'view', view: 'stats', surface: 'other' })).ok, false);
  assert.equal((await navigate.call('deck_navigation', { command: 'stats', tab: 'unknown' })).ok, false);
  assert.equal((await navigate.call('deck_navigation', { command: 'appearance', setting: 'theme', value: true })).ok, false);
  assert.equal((await navigate.call('deck_navigation', { command: 'lock', enabled: false, view: 'keys' })).ok, false);
  const command = { command: 'view', view: 'stats', surface: 'deck' };
  assert.deepEqual((await navigate.call('deck_navigation', command)).data, { view: 'stats' });
  select('work');
  assert.equal((await navigate.call('deck_navigation', command)).ok, false);
  assert.deepEqual(calls, [command]);
  assert.deepEqual(navigationParams({ command: 'page', page: 'Meeting_A' }), { command: 'page', page: 'Meeting_A' });
  const surface = navigationSurface({ available: true, rotation: 90,
    logical: { width: 576, height: 2048, units: 'dip' }, physical: { width: 720, height: 2560, units: 'px' } });
  assert.equal(surface.orientation, 'portrait');
  assert.equal(surface.controls.brightness, 'unavailable');
});

test('offline MCP tools validate and project the same five editing controls without connecting', async () => {
  const responses = [];
  const session = createSession({ send: (response) => responses.push(response),
    connect: () => assert.fail('Offline tool attempted a connection') });
  await session.receive({ jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2025-03-26' } });
  assert.equal(responses[0].result.protocolVersion, '2025-03-26');
  await session.receive({ jsonrpc: '2.0', method: 'tools/call', id: 2,
    params: { name: 'preview_profile', arguments: { profile } } });
  const output = responses[1].result.content[0].text;
  assert.equal(responses[1].result.structuredContent, undefined);
  assert.doesNotMatch(output, /private-fixture/);
  const result = JSON.parse(output);
  assert.deepEqual(result.grid, { cols: 8, rows: 3 });
  assert.deepEqual(result.editing.map(({ id }) => id), ['edit:cut', 'edit:copy', 'edit:paste', 'edit:undo', 'edit:redo']);
  await session.receive({ jsonrpc: '2.0', method: 'tools/call', id: 3,
    params: { name: 'validate_profile', arguments: { profile: { pages: [] } } } });
  assert.equal(responses[2].result.isError, true);
});

test('deck events coalesce matching state, paginate scoped revisions, and invalidate stale cursors', () => {
  const journal = new AgentEvents({ now: () => 123 });
  const origin = journal.cursor();
  journal.publish('page', 'main', { id: 'older' });
  journal.publish('page', 'main', { id: 'home' });
  journal.flush();
  journal.publish('page', 'main', { id: 'unsettled' });
  journal.publish('page', 'main', { id: 'home' });
  journal.flush();
  journal.publish('action', 'other', { outcome: 'failed' });
  journal.publish('action', 'main', { outcome: 'succeeded' });

  const mainOnly = ({ activity }) => activity === 'main';
  const first = journal.read(eventParams({ limit: 1, after: origin }), mainOnly);
  assert.deepEqual(first.events, [{ type: 'page', at: 123, revision: 1, data: { id: 'home' } }]);
  assert.equal(first.more, true);
  const last = journal.read(eventParams({ after: first.cursor }), mainOnly);
  assert.equal(last.more, false);
  assert.deepEqual(last.events.map(({ revision, data }) => [revision, data.outcome]), [[3, 'succeeded']]);
  for (let index = 0; index < 120; index++) journal.publish('action', 'main', { outcome: 'succeeded' });
  assert.deepEqual(journal.read(eventParams({ after: last.cursor }), mainOnly).resyncRequired, false);
  assert.deepEqual(journal.read(eventParams({ after: first.cursor }), mainOnly).resyncRequired, true);
  const beforeReset = journal.cursor();
  journal.reset();
  assert.equal(journal.read(eventParams({ after: beforeReset }), mainOnly).resyncRequired, true);
  assert.throws(() => eventParams({ types: [['page']] }), /valid event types/);
  journal.close();
});

test('authenticated MCP subscriptions filter scope and activity, and recover through a fresh cursor', { timeout: 10_000 }, async (t) => {
  const journal = new AgentEvents();
  const { access, service, client, select } = fixture(t, journal);
  access.setEnabled(true);
  const layout = access.grant(['layout'], 'main');
  const providers = access.grant(['providers']);
  service.setLocked(false);
  await once(service.server, 'listening');
  const notifications = [];
  let nextNotice;
  const session = createSession({ credential: 'fixture', connect: (_, options) => client(layout, options), send(message) {
    notifications.push(message);
    if (message.method) nextNotice?.(message);
  } });
  t.after(() => session.close());
  async function request(method, params) {
    const id = notifications.length;
    await session.receive({ jsonrpc: '2.0', id, method, params });
    return notifications.findLast((message) => message.id === id);
  }
  const pageEvents = 'lastra://v1/deck/events?types=page';
  const providerEvents = 'lastra://v1/deck/events?types=audio';
  await request('initialize', { protocolVersion: '2025-06-18' });
  assert.match((await request('resources/subscribe', { uri: providerEvents })).error.message, /scope/);
  assert.deepEqual((await request('resources/subscribe', { uri: pageEvents })).result, {});
  assert.deepEqual((await request('resources/subscribe', { uri: pageEvents })).result, {});
  assert.equal(service.interested('page'), true);

  const provider = await client(providers);
  const subscribed = await provider.call('event_subscribe', { types: ['audio', 'playback'] });
  assert.equal(subscribed.ok, true);
  assert.equal(service.interested('playback'), true);
  const delivered = new Promise((resolve) => { nextNotice = resolve; });
  journal.publish('page', 'other', { id: 'other-fixture' });
  journal.publish('audio', 'main', { speakerMuted: false });
  journal.publish('page', 'main', { id: 'sample' });
  journal.flush();
  assert.deepEqual(await delivered, { jsonrpc: '2.0', method: 'notifications/resources/updated', params: { uri: pageEvents } });
  const result = await request('resources/read', { uri: pageEvents });
  const feed = JSON.parse(result.result.contents[0].text);
  assert.deepEqual(feed.events.map(({ data }) => data), [{ id: 'sample' }]);
  assert.deepEqual((await provider.call('events_since')).data.events.map(({ type }) => type), ['audio']);

  select('other');
  assert.equal(service.interested('page'), false);
  assert.equal((await request('resources/read', { uri: pageEvents })).error.code, -32002);
  await request('resources/unsubscribe', { uri: pageEvents });
  select('main');
  assert.equal(service.interested('page'), false);
  const providerId = access.state.clients.at(-1).id;
  const [providerSocket] = [...service.connections].find(([, state]) => state.client === providerId);
  const disconnected = once(providerSocket, 'close');
  provider.close();
  await disconnected;
  assert.equal(service.interested('playback'), false);
  const [layoutSocket] = service.connections.keys();
  const locked = once(layoutSocket, 'close');
  service.setLocked(true);
  await locked;
  service.setLocked(false);
  await once(service.server, 'listening');
  const resumed = await request('resources/read', { uri: `${pageEvents}&after=${feed.cursor}` });
  assert.equal(JSON.parse(resumed.result.contents[0].text).resyncRequired, true);
});

test('MCP capability discovery types results, paginates tools, and exposes versioned resources and prompts', async () => {
  const responses = [];
  const link = { call: async () => ({ ok: true, data: { status: 'connected', scopes: ['providers'], available: ['connection', 'provider_status'] } }) };
  const session = createSession({ credential: 'fixture', connect: async () => link, send: (response) => responses.push(response) });
  async function request(method, params) {
    const id = responses.length + 1;
    await session.receive({ jsonrpc: '2.0', method, id, params });
    return responses.at(-1);
  }
  const initialized = await request('initialize', { protocolVersion: 'future' });
  assert.equal(initialized.result.protocolVersion, '2025-06-18');
  assert.deepEqual(initialized.result.capabilities, { tools: {}, prompts: {}, resources: { subscribe: true } });
  const first = (await request('tools/list')).result;
  assert.equal(first.tools.length, 4);
  assert.ok(first.nextCursor);
  const listed = [...first.tools];
  let cursor = first.nextCursor;
  while (cursor) {
    const next = (await request('tools/list', { cursor })).result;
    assert.ok(next.tools.length > 0 && next.nextCursor !== cursor);
    listed.push(...next.tools);
    cursor = next.nextCursor;
  }
  assert.ok(listed.every(({ name, inputSchema, outputSchema, annotations }) =>
    inputSchema && outputSchema && annotations.readOnlyHint ===
      !['profile_draft', 'app_view_draft', 'monitoring_draft', 'profile_changes', 'profile_activity', 'agent_choice', 'deck_navigation', 'gesture_fixture', 'registered_action',
        'workspace_apply', 'workspace_target', 'workspace_external', 'project_command', 'alert_acknowledge', 'obs_action', 'obs_output', 'agent_run', 'audio_action', 'audio_mute', 'audio_route', 'audio_app_level',
        'media_action', 'spotify_action'].includes(name)));
  assert.equal((await request('tools/list', { cursor: 'other:tools:4' })).error.code, -32602);
  const cap = (await request('tools/call', { name: 'capabilities' })).result.structuredContent;
  const names = listed.map(({ name }) => name);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(names, cap.tools.map(({ name }) => name));
  const tools = Object.fromEntries(cap.tools.map((entry) => [entry.name, entry]));
  assert.equal(tools.provider_status.status, 'connected');
  assert.equal(tools.profile_layout.status, 'unavailable');
  assert.equal(tools.profile_draft.permission, 'drafts');
  assert.equal(tools.profile_draft.status, 'unavailable');
  assert.equal(tools.app_view_draft.permission, 'drafts');
  assert.equal(tools.app_view_draft.status, 'unavailable');
  assert.equal(tools.monitoring_draft.permission, 'drafts and telemetry');
  assert.equal(tools.profile_activity.permission, 'profile-switch');
  assert.equal(tools.agent_choice.permission, 'agent-choices');
  assert.equal(tools.workspace_target.permission, 'workspace-targets and workspaces');
  assert.equal(tools.workspace_external.permission, 'workspace-external and workspaces');
  assert.equal(tools.project_command.permission, 'project-actions and projects');
  assert.equal(tools.audio_mute.permission, 'audio-mute and audio');
  assert.equal(tools.audio_route.permission, 'audio-routing and audio');
  assert.equal(tools.audio_app_level.permission, 'audio-app-level and audio');
  assert.equal(tools.spotify_action.permission, 'spotify-control and spotify');
  assert.equal(tools.preview_profile.status, 'simulated');
  assert.ok(tools.preview_profile.example.profile);
  assert.ok(cap.tools.every((entry) => !('inputSchema' in entry) && !('outputSchema' in entry)));
  assert.equal(initialized.result.serverInfo.version, require('../package.json').version);
  const capabilityReply = responses.find((response) => response.result?.structuredContent === cap);
  assert.ok(Buffer.byteLength(JSON.stringify(capabilityReply)) < 192 * 1024, 'capabilities must stay well below the 256 KiB frame limit');
  const resources = (await request('resources/list')).result.resources;
  assert.equal(resources.every((resource) => resource.uri.startsWith('lastra://v1/')), true);
  const example = (await request('resources/read', { uri: 'lastra://v1/profile/example' })).result.contents[0];
  assert.equal(JSON.parse(example.text).grid.cols, 8);
  const prompts = (await request('prompts/list')).result.prompts;
  const prompt = (await request('prompts/get', { name: prompts[0].name })).result.messages[0];
  assert.match(prompt.content.text, /validate_profile/);
  assert.equal(prompt.role, 'user');
});

test('offline workflow prompts expose contextual arguments without opening a live connection', async () => {
  const responses = [];
  const session = createSession({ send: (message) => responses.push(message),
    connect: () => assert.fail('A workflow prompt opened a live connection') });
  async function request(method, params) {
    await session.receive({ jsonrpc: '2.0', method, id: responses.length + 1, params });
    return responses.at(-1);
  }
  await request('initialize', { protocolVersion: '2025-06-18' });
  const first = (await request('prompts/list')).result;
  const second = (await request('prompts/list', { cursor: first.nextCursor })).result;
  const prompts = new Map([...first.prompts, ...second.prompts].map((prompt) => [prompt.name, prompt]));
  assert.equal(prompts.size, 7);
  assert.deepEqual(prompts.get('plan_activity_layout').arguments.map(({ name }) => name), ['activity', 'project', 'goal']);
  for (const activity of ['work', 'meeting', 'gaming', 'streaming', 'monitoring']) {
    const layout = await request('prompts/get', { name: 'plan_activity_layout', arguments: { activity, project: 'Board', goal: 'Clear \n links' } });
    const content = layout.result.messages[0].content.text;
    assert.match(content, /profile_draft.*preview_profile/);
    assert.match(content, /lastra:\/\/v1\/capabilities/);
    assert.deepEqual(JSON.parse(content.split('User-supplied workflow details\n')[1]), { activity, project: 'Board', goal: 'Clear \n links' });
  }
  const diagnosis = await request('prompts/get', { name: 'diagnose_provider', arguments: { provider: 'obs' } });
  assert.match(diagnosis.result.messages[0].content.text, /provider_status/);
  assert.equal((await request('prompts/get', { name: 'diagnose_provider', arguments: { provider: 'unknown' } })).error.code, -32602);
  assert.equal((await request('prompts/get', { name: 'explain_macro_failure', arguments: { goal: 'x'.repeat(501) } })).error.code, -32602);
  assert.equal((await request('prompts/get', { name: 'explain_macro_failure', arguments: { typo: 'key' } })).error.code, -32602);
});

test('provider discovery reports stale telemetry separately from availability of sound, media and OBS', () => {
  const status = providerStatus({ now: 100, audio: true, media: false, telemetry: 10, obs: true, freshnessMs: 35 });
  assert.equal(status.version, 1);
  assert.equal(status.sampledAt, 100);
  assert.equal(status.providers.audio.status, 'connected');
  assert.equal(status.providers.audio.source, 'Windows Core Audio');
  assert.equal(status.providers.media.status, 'unavailable');
  assert.equal(status.providers.telemetry.status, 'stale');
  assert.match(status.providers.telemetry.reason, /expired/);
  assert.equal(status.providers.obs.status, 'connected');
});

test('stdio discovers and calls the running Windows agent service with an issued credential', { skip: process.platform !== 'win32' }, async (t) => {
  const { access, service } = fixture(t);
  access.setEnabled(true);
  const credential = access.grant(['providers'], 'main');
  service.setLocked(false);
  await once(service.server, 'listening');
  const child = spawn(process.execPath, [path.resolve(__dirname, '../extensions/lastra-mcp/stdio.js')], {
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, LASTRA_AGENT_CREDENTIAL: credential },
  });
  t.after(() => child.kill());
  const answers = [];
  const exited = once(child, 'exit');
  readFrames(child.stdout, (answer) => answers.push(answer), () => assert.fail('Invalid stdio reply'));
  writeFrame(child.stdin, { jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2025-06-18' } });
  writeFrame(child.stdin, { jsonrpc: '2.0', method: 'tools/list', id: 2 });
  writeFrame(child.stdin, { jsonrpc: '2.0', method: 'tools/call', id: 3, params: { name: 'provider_status' } });
  child.stdin.end();
  const [exit] = await exited;
  assert.equal(exit, 0);
  assert.equal(answers[0].result.serverInfo.name, 'lastra');
  assert.ok(answers[1].result.tools.some(({ name }) => name === 'provider_status'));
  assert.deepEqual(JSON.parse(answers[2].result.content[0].text), { audio: 'available' });
});

test('an oversized MCP reply becomes a JSON-RPC error instead of ending the session', async () => {
  const responses = [];
  const session = createSession({ send: (message) => {
    if (message.result && Buffer.byteLength(JSON.stringify(message)) > 1024) throw new Error('The Lastra response exceeded the size limit.');
    responses.push(message);
  } });
  await session.receive({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  await session.receive({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'capabilities', arguments: {} } });
  assert.deepEqual(responses.at(-1), { jsonrpc: '2.0', id: 2, error: { code: -32603, message: 'The Lastra response exceeded the size limit.' } });
  await session.receive({ jsonrpc: '2.0', id: 3, method: 'ping' });
  assert.deepEqual(responses.at(-1), { jsonrpc: '2.0', id: 3, result: {} });
  session.close();
});
