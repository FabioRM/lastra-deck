'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { WindowsMedia } = require('../src/main/windows-media');
const { SpotifyAccount } = require('../src/main/spotify-account');
const { Obs } = require('../src/main/obs');
const { AgentMediaReader, mediaParams, spotifyParams, obsParams } = require('../src/main/mcp-media');
const { tempDir } = require('./helpers/temp-dir');

const owner = 'a'.repeat(32);
const peer = 'b'.repeat(32);
const windowsDefault = '0'.repeat(32);
const windowsSelected = '1'.repeat(32);
const track = 'spotify:track:' + '7'.repeat(22);

test('Windows helper uses a separate agent read mode and retains normal deck artwork requests', async () => {
  const media = new WindowsMedia('fixture-cache');
  const messages = [];
  media.request = async (args) => { messages.push(args); return { status: 'ready' }; };
  await media.snapshotForAgent(undefined);
  await media.snapshotForAgent(windowsSelected, { metadata: true });
  assert.equal((await media.snapshotForAgent('not-a-native-id', { metadata: true })).status, 'missing');
  await media.snapshot(windowsDefault, windowsSelected);
  assert.deepEqual(messages, [{ command: 'snapshot', detail: 'state' },
    { command: 'snapshot', selectionId: windowsSelected, detail: 'metadata' },
    { command: 'snapshot', artworkId: windowsDefault, selectionId: windowsSelected }]);
});

test('Windows discovery and selected readback use per-client aliases and request metadata only explicitly', async () => {
  let now = 150_000;
  const requests = [];
  let selectedChanges = false;
  const media = new AgentMediaReader({ now: () => now, windows: async (session, options) => {
    requests.push([session, options]);
    return { status: 'ready', sessions: [{ id: windowsDefault, isDefault: true, source: 'C:/PRIVATE path/browser.exe' },
      { id: windowsSelected, source: 'spotify' }], sessionId: selectedChanges ? windowsDefault : session ?? windowsDefault,
    playback: 'playing', playerToken: 'PRIVATE PLAYER TOKEN', title: 'Private track', artist: 'Private artist', album: 'https://private.test/album',
    artwork: 'data:image/png;base64,PRIVATE', durationMs: 190_000, positionMs: 30_000, positionUpdatedAt: 149_000, canPause: true,
    seekMinMs: 0, seekMaxMs: 190_000, rate: 1 };
  } });
  const state = await media.windowsState(mediaParams({ section: 'active' }), owner);
  assert.equal(state.active.positionMs, 30_000);
  assert.equal(state.active.capabilities.seek, true);
  assert.equal(state.active.metadata, undefined);
  assert.equal(state.active.source, 'windows');
  const discovery = await media.windowsState(mediaParams({ section: 'sessions', limit: 1 }), owner);
  assert.equal(discovery.sessions[0].id, state.active.id);
  await assert.rejects(media.windowsState(mediaParams({ section: 'sessions', limit: 1, cursor: discovery.nextCursor }), peer), /cursor is unavailable/);
  const selected = await media.windowsState(mediaParams({ section: 'sessions', limit: 1, cursor: discovery.nextCursor }), owner);
  const alias = selected.sessions[0].id;
  const metadata = mediaParams({ section: 'active', session: alias, metadata: true });
  assert.equal((await media.windowsState(metadata, peer)).status, 'missing');
  const named = await media.windowsState(metadata, owner);
  assert.deepEqual(named.active.metadata, { title: 'Private track', artist: 'Private artist', album: '[link]' });
  assert.deepEqual(requests.at(-1), [windowsSelected, { metadata: true }]);
  assert.ok(requests.slice(0, -1).every(([, options]) => options.metadata === false));
  const returned = JSON.stringify([state, discovery, selected, named]);
  for (const secret of [windowsDefault, windowsSelected, 'browser.exe', 'PRIVATE', 'private.test', 'artwork', 'trackId']) assert.ok(!returned.includes(secret));
  selectedChanges = true;
  assert.deepEqual((await media.windowsState(metadata, owner)).active, null);
  const before = requests.length;
  now += 10_001;
  assert.equal((await media.windowsState(metadata, owner)).status, 'missing');
  assert.equal(requests.length, before);
  assert.throws(() => mediaParams({ section: 'active', session: windowsSelected }), /session alias/);
  assert.throws(() => mediaParams({ section: 'sessions', metadata: true }), /supported media options/);
});

test('Spotify reuses existing OAuth reads, cache by default and explicit refresh, while retaining private tokens and account labels', async (t) => {
  const directory = tempDir(t, 'lastra-mcp-media-');
  const clientId = '2'.repeat(32);
  fs.writeFileSync(path.join(directory, 'spotify-account.json'), JSON.stringify({ version: 1, clientId }));
  const tokenPath = path.join(directory, 'spotify-account.token');
  fs.writeFileSync(tokenPath, Buffer.from('protected-fixture').toString('base64'));
  const stored = fs.readFileSync(tokenPath);
  const scopes = ['user-read-playback-state', 'user-read-currently-playing'];
  const sent = [];
  const rawTrack = { name: 'Private currently playing', artists: [{ name: 'Private artist' }], uri: track, duration_ms: 120_000 };
  const readOnlyAccount = new SpotifyAccount(directory, { storage: { isAsyncEncryptionAvailable: async () => true,
    decryptStringAsync: async () => ({ result: JSON.stringify({ clientId, refresh: 'PRIVATE_REFRESH_TOKEN', scopes }), shouldReEncrypt: false }) },
  fetcher: async (argument, options) => {
    const url = new URL(argument);
    sent.push({ host: url.host, path: url.pathname, method: options?.method ?? 'GET' });
    const response = (data) => ({ status: 200, ok: true, json: async () => data });
    if (url.host === 'accounts.spotify.com') return response({ access_token: 'PRIVATE_ACCESS_TOKEN', expires_in: 3600, token_type: 'Bearer' });
    const device = { id: 'private-playback-device', name: 'Private speaker name', is_active: true, is_restricted: false };
    if (url.pathname.endsWith('/devices')) return response({ devices: [device] });
    if (url.pathname.endsWith('/queue')) return response({ queue: [rawTrack, { ...rawTrack, name: 'Other private queued item' }] });
    return response({ progress_ms: 24_000, is_playing: true, device, item: rawTrack });
  } });
  t.after(() => readOnlyAccount.close());
  const reader = new AgentMediaReader({ spotify: (options) => readOnlyAccount.snapshot(options) });
  const read = (section, options = {}) => reader.spotifyState(spotifyParams({ section, ...options }), owner);
  const cached = await read('playback');
  assert.equal(cached.accountStatus, 'connected');
  assert.equal(cached.status, 'unavailable');
  assert.deepEqual(sent, []);
  const newData = await read('playback', { refresh: true });
  assert.equal(newData.playback.positionMs, 24_000);
  assert.equal(newData.playback.durationMs, 120_000);
  assert.equal(newData.playback.metadata, undefined);
  assert.equal(sent.length, 4);
  assert.ok(sent.slice(1).every(({ method }) => method === 'GET'));
  const devices = await read('devices');
  assert.equal(devices.devices[0].active, true);
  assert.equal(devices.devices[0].name, undefined);
  const queue = await read('queue', { limit: 1 });
  assert.equal(queue.queue[0].kind, 'track');
  assert.equal(queue.queue[0].position, 1);
  assert.ok(queue.nextCursor);
  const names = await read('queue', { metadata: true });
  assert.equal(names.queue[0].metadata.title, rawTrack.name);
  assert.equal(sent.length, 4);
  assert.deepEqual(fs.readFileSync(tokenPath), stored);
  const serialized = JSON.stringify([cached, newData, devices, queue, names]);
  for (const secret of [track, 'private-playback-device', 'Private speaker name', 'TOKEN', clientId, 'open.spotify.com']) assert.ok(!serialized.includes(secret));
});

test('Spotify without a usable current account avoids returning stale media names and distinguishes denied scopes', async () => {
  const instant = 75_000;
  const cached = { status: 'connected', sampledAt: instant - 16_000, queue: { state: 'ready', items: [{ title: 'Private history', uri: track }] },
    devices: { state: 'restricted' }, playback: { state: 'scope' } };
  const reader = new AgentMediaReader({ now: () => instant, spotify: () => cached });
  const read = (section) => reader.spotifyState(spotifyParams({ section, metadata: true }), owner);
  const queue = await read('queue');
  assert.equal(queue.status, 'stale');
  assert.equal(queue.queue[0].metadata, undefined);
  assert.equal((await read('devices')).status, 'restricted');
  assert.equal((await read('playback')).status, 'scope');
  cached.status = 'disconnected';
  assert.deepEqual((await read('queue')).queue, []);
});

test('OBS reads the existing scene view and discards selections across reconnects without initiating OBS commands', () => {
  const obs = new Obs({ status: 'disabled', password: 'PRIVATE OBS PASSWORD', host: 'private.test' });
  const reader = new AgentMediaReader({ obs: () => obs.view });
  const read = (section, options, client = owner) => reader.obsState(obsParams({ section, ...options }), client);
  const state = { status: 'connected', studio: true, recording: { active: true, paused: false, phase: 'stopping' },
    streaming: { active: false, phase: 'reconnecting', outputUrl: 'wss://private.test/' },
    program: 'Private broadcast', preview: 'Private camera', sourceScene: 'Private camera', scenes: ['Private broadcast', 'Private camera'],
    items: [{ id: 5981, name: 'Private webcam', visible: false }, { id: 5982, name: 'Private monitor', visible: true }],
    detail: { id: 5981, name: 'Private webcam', muted: true, volume: .4, filters: [{ name: 'Private filter', enabled: true }] } };
  obs.setView(state);
  const overview = read('state');
  assert.equal(overview.state.recording.phase, 'stopping');
  assert.equal(overview.state.streaming.phase, 'reconnecting');
  const scenes = read('scenes', { limit: 1 });
  assert.equal(scenes.scenes[0].id, overview.state.program.id);
  assert.notEqual(read('state', {}, peer).state.program.id, overview.state.program.id);
  const sources = read('sources');
  assert.equal(sources.sourceScene.id, overview.state.preview.id);
  assert.equal(sources.sources[0].id, sources.selectedSource.id);
  assert.equal(sources.selectedSource.volumePercent, 40);
  assert.equal(sources.selectedSource.muted, true);
  assert.equal(sources.selectedSource.filters[0].enabled, true);
  assert.ok(overview.sourceSampledAt > 0);
  const names = read('sources', { metadata: true });
  assert.equal(names.sources[0].name, 'Private webcam');
  const serialized = JSON.stringify([overview, scenes, sources]);
  for (const secret of ['Private', 'PRIVATE', '"id":5981', 'private.test', 'outputUrl']) assert.ok(!serialized.includes(secret));
  assert.throws(() => obsParams({ section: 'sources', sceneName: 'Private camera' }), /supported media options/);
  obs.connectionChanged('disconnected');
  const disconnected = read('state');
  assert.equal(disconnected.status, 'disconnected');
  assert.equal(disconnected.canReconnect, true);
  assert.equal(disconnected.state, null);
  obs.setView(state);
  assert.notEqual(read('state').state.program.id, overview.state.program.id);
  assert.throws(() => read('scenes', { limit: 1, cursor: scenes.nextCursor }), /cursor is unavailable/);
});
