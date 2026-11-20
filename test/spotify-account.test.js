'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { setTimeout: delay } = require('node:timers/promises');
const { test } = require('node:test');
const { SpotifyAccount } = require('../src/main/spotify-account');
const { SpotifyView } = require('../src/main/app-view-spotify');
const { createAuthorization } = require('../src/main/spotify-oauth');
const { tempDir } = require('./helpers/temp-dir');

const clientId = '3'.repeat(32);
const access = 'synthetic-spotify-access';
const refresh = 'synthetic-spotify-refresh';
const scopes = 'user-read-playback-state user-read-currently-playing user-modify-playback-state';
const current = { uri: 'spotify:track:' + '7'.repeat(22), name: 'Fixture track', artists: [{ name: 'Fixture artist' }] };
const item = { title: current.name, creator: current.artists[0].name, uri: current.uri };
const api = 'https://api.spotify.com/v1/me/player';
const tokenAddress = 'https://accounts.spotify.com/api/token';

function callback(browserUrl) {
  const url = new URL(browserUrl);
  const redirect = new URL(url.searchParams.get('redirect_uri'));
  redirect.search = new URLSearchParams({ state: url.searchParams.get('state'), code: 'fixture-code' });
  return redirect;
}

function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, (response) => {
      let body = '';
      response.setEncoding('utf8').on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
      response.on('error', reject);
    }).on('error', reject);
  });
}

function testStorage() {
  const key = crypto.randomBytes(32);
  return {
    isAsyncEncryptionAvailable: async () => true,
    async encryptStringAsync(value) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    },
    async decryptStringAsync(value) {
      const cipher = crypto.createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
      cipher.setAuthTag(value.subarray(12, 28));
      return { result: Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString('utf8'), shouldReEncrypt: false };
    },
  };
}

function fixture(t, overrides = {}) {
  let account;
  t.after(() => account?.close());
  const directory = tempDir(t, 'lastra-spotify-fixture-');
  const calls = [];
  const state = { device: 'desktop1', queue: [], grants: scopes, playbackStatus: 200, queueStatus: 200 };
  let browserUrl;
  const fetcher = async (url, request) => {
    calls.push({ url, request });
    if (url === tokenAddress) {
      assert.equal(request.body.get('client_id'), clientId);
      assert.equal(request.body.has('client_secret'), false);
      if (state.revoked) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      if (request.body.get('grant_type') === 'refresh_token') return Response.json({
        token_type: 'Bearer', access_token: access, expires_in: 3600,
      });
      return Response.json({ token_type: 'Bearer', access_token: access, scope: state.grants, refresh_token: refresh, expires_in: 3600 });
    }
    assert.equal(request.headers.Authorization, `Bearer ${access}`);
    if (url === api && request.method === 'PUT') {
      [state.device] = JSON.parse(request.body).device_ids;
      return new Response(null, { status: 204 });
    }
    if (url.startsWith(api + '/queue?') && request.method === 'POST') {
      const candidate = new URL(url);
      assert.equal(candidate.searchParams.get('uri'), current.uri);
      assert.equal(candidate.searchParams.get('device_id'), state.device);
      state.queue.push(current);
      return new Response(null, { status: 204 });
    }
    if (url === api + '?additional_types=track%2Cepisode') {
      if (state.playbackStatus !== 200) return new Response(null, { status: state.playbackStatus, headers: { 'Retry-After': '60' } });
      return Response.json({ item: current, is_playing: true, device: { id: state.device } });
    }
    if (url === api + '/devices') return Response.json({ devices: [
      { id: 'desktop1', is_active: state.device === 'desktop1', name: 'Fixture desktop' },
      { id: 'speaker2', is_active: state.device === 'speaker2', name: 'Fixture speaker' },
      { id: 'blocked3', is_active: false, name: 'Restricted device', is_restricted: true },
      { id: null, name: 'Control-free device' },
    ] });
    if (url === api + '/queue') return Response.json({ queue: state.queue }, { status: state.queueStatus });
    assert.fail(`Unexpected Spotify request ${url}`);
  };
  const options = {
    openConfig: async () => ({ ok: true }),
    openExternal: async (url) => { browserUrl = url; },
    storage: testStorage(), fetcher, oauth: (id) => createAuthorization(id, { port: 0, timeout: 1000 }), ...overrides,
  };
  account = new SpotifyAccount(directory, options);
  return { account, state, calls, options, directory, get browserUrl() { return browserUrl; } };
}

async function eventually(read, match) {
  for (let i = 0; i < 60; i++) {
    const value = await read();
    if (match(value)) return value;
    await delay(10);
  }
  assert.fail('Spotify fixture did not reach the expected state');
}

async function begin(f) {
  fs.writeFileSync(f.account.file, JSON.stringify({ version: 1, clientId }));
  assert.deepEqual(await f.account.change({ action: 'account-connect' }), { ok: true });
  assert.equal((await f.account.snapshot()).status, 'authorizing');
  return callback(f.browserUrl);
}

async function connect(f) {
  const redirect = await begin(f);
  assert.equal((await httpGet(redirect)).status, 200);
  return eventually(() => f.account.snapshot(), (data) => data.status === 'connected');
}

test('Spotify PKCE rejects unrelated hosts and callback state, then consumes one valid loopback result', async () => {
  const auth = await createAuthorization(clientId, { port: 0 });
  const remote = new URL(auth.url);
  const redirect = callback(auth.url);
  try {
    assert.equal(remote.origin, 'https://accounts.spotify.com');
    assert.equal(remote.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(remote.searchParams.get('code_challenge'), crypto.createHash('sha256').update(auth.verifier).digest('base64url'));
    assert.equal(redirect.hostname, '127.0.0.1');
    assert.equal(redirect.pathname, '/spotify/callback');
    assert.equal((await httpGet(redirect, { Host: 'other.test' })).status, 400);
    const modified = new URL(redirect);
    modified.searchParams.append('state', 'foreign');
    assert.equal((await httpGet(modified)).status, 400);
    modified.searchParams.set('state', 'foreign');
    assert.equal((await httpGet(modified)).status, 400);
    const accepted = await httpGet(redirect);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.headers['cache-control'], 'no-store');
    assert.doesNotMatch(accepted.body, /fixture-code/);
    assert.deepEqual(await auth.result, { status: 'received', code: 'fixture-code' });
    await assert.rejects(httpGet(redirect), /ECONNREFUSED|ECONNRESET/);
  } finally {
    auth.cancel();
  }
});

test('Spotify accounts are opt-in and keep the playlist provider available before and after authorization', async (t) => {
  const f = fixture(t);
  const playlistFile = path.join(f.directory, 'spotify.json');
  fs.writeFileSync(playlistFile, JSON.stringify({ version: 1, playlists: [{ id: 'fixture', name: 'Playlist', url: 'spotify:playlist:' + 'a'.repeat(22) }] }));
  let opened;
  const view = new SpotifyView(playlistFile, { account: f.account, run: async (action) => { opened = action; } });
  assert.equal((await view.snapshot()).account.status, 'setup');
  assert.deepEqual(f.calls, []);
  assert.deepEqual(await view.change({ action: 'account-configure' }), { ok: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(f.account.file)), { version: 1, clientId: '' });
  const data = await connect(f);
  assert.equal(f.calls[0].request.body.get('code'), 'fixture-code');
  assert.equal(f.calls[0].request.redirect, 'error');
  assert.deepEqual(data.playback, { state: 'ready', item, playing: true });
  assert.equal(data.canTransfer, true);
  assert.equal(data.canQueue, true);
  assert.equal(data.devices.items.find(({ id }) => id === 'blocked3').restricted, true);
  assert.equal(JSON.stringify(await view.snapshot()).includes(access), false);
  assert.equal(JSON.stringify(await view.snapshot()).includes(refresh), false);
  assert.equal(Buffer.from(fs.readFileSync(f.account.tokenFile, 'utf8'), 'base64').includes(refresh), false);
  assert.deepEqual(await view.change({ action: 'account-disconnect' }), { ok: true });
  assert.equal(fs.existsSync(f.account.tokenFile), false);
  const disconnected = await view.snapshot();
  assert.equal(disconnected.account.status, 'disconnected');
  assert.equal(disconnected.account.playback, undefined);
  assert.deepEqual(disconnected.playlists, [{ id: 'fixture', name: 'Playlist' }]);
  await view.change({ action: 'open-playlist', id: 'fixture' });
  assert.equal(opened.target, 'https://open.spotify.com/playlist/' + 'a'.repeat(22));
});

test('Spotify accepts only fresh account devices and item identities and never retries a mutation', async (t) => {
  const f = fixture(t);
  await connect(f);
  assert.equal((await f.account.change({ action: 'account-transfer', deviceId: 'blocked3' })).ok, false);
  assert.equal((await f.account.change({ action: 'account-transfer', deviceId: 'unknown' })).ok, false);
  assert.equal((await f.account.change({ action: 'account-queue', uri: 'spotify:track:' + '9'.repeat(22) })).ok, false);
  assert.deepEqual(f.calls.filter(({ request }) => request.method === 'PUT'), []);
  const [transfer, parallel] = await Promise.all([
    f.account.change({ action: 'account-transfer', deviceId: 'speaker2', device_ids: ['unknown'] }),
    f.account.change({ action: 'account-transfer', deviceId: 'speaker2' }),
  ]);
  assert.deepEqual(transfer, { ok: true, message: 'Spotify device active.' });
  assert.equal(parallel.ok, false);
  assert.deepEqual(JSON.parse(f.calls.find(({ request }) => request.method === 'PUT').request.body), { device_ids: ['speaker2'] });
  assert.deepEqual(await f.account.change({ action: 'account-queue', uri: current.uri }), { ok: true, message: 'Item added to the Spotify queue.' });
  assert.equal(f.calls.filter(({ url, request }) => url.startsWith(api) && request.method === 'POST').length, 1);
  assert.deepEqual((await f.account.snapshot()).queue.items, [item]);
});

test('Spotify keeps enabled reads when the queue is restricted and honors rate limits', async (t) => {
  const f = fixture(t);
  f.state.queueStatus = 403;
  f.state.grants = 'user-read-playback-state';
  const data = await connect(f);
  assert.equal(data.playback.state, 'ready');
  assert.equal(data.queue.state, 'restricted');
  assert.equal(data.canQueue, false);
  assert.equal(data.canTransfer, false);
  assert.equal((await f.account.change({ action: 'account-queue', uri: current.uri })).ok, false);

  const now = Date.now();
  t.mock.method(Date, 'now', () => now + 5000);
  f.state.playbackStatus = 429;
  f.calls.length = 0;
  const throttled = await f.account.snapshot();
  assert.match(throttled.message, /requested a pause/);
  assert.equal(throttled.canTransfer, false);
  await f.account.snapshot();
  assert.deepEqual(f.calls.map(({ url }) => url), [api + '?additional_types=track%2Cepisode']);
});

test('Spotify restores encrypted refresh credentials, and an expired grant clears the connection', async (t) => {
  const f = fixture(t);
  await connect(f);
  f.account.close();
  const reopened = new SpotifyAccount(f.directory, f.options);
  t.after(() => reopened.close());
  f.calls.length = 0;
  assert.equal((await reopened.snapshot()).canQueue, true);
  assert.equal(f.calls[0].request.body.get('refresh_token'), refresh);
  const expired = new SpotifyAccount(f.directory, f.options);
  t.after(() => expired.close());
  f.state.revoked = true;
  assert.equal((await expired.snapshot()).status, 'disconnected');
  assert.equal(fs.existsSync(expired.tokenFile), false);
});

test('Spotify drops a token response that finishes after the user disconnects', async (t) => {
  let release;
  let started;
  const tokenStarted = new Promise((resolve) => { started = resolve; });
  const f = fixture(t, { fetcher: (url, { signal }) => {
    assert.equal(url, tokenAddress);
    started(signal);
    return new Promise((resolve) => { release = resolve; });
  } });
  assert.equal((await httpGet(await begin(f))).status, 200);
  const signal = await tokenStarted;
  assert.deepEqual(await f.account.change({ action: 'account-disconnect' }), { ok: true });
  assert.equal(signal.aborted, true);
  release(Response.json({ token_type: 'Bearer', access_token: access, scope: scopes, refresh_token: refresh, expires_in: 3600 }));
  await delay(1);
  assert.equal((await f.account.snapshot()).status, 'disconnected');
  assert.equal(fs.existsSync(f.account.tokenFile), false);
});
