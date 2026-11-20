'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: wait } = require('node:timers/promises');
const { test } = require('node:test');
const { SpotifyAccount } = require('../src/main/spotify-account');
const { AgentMediaReader, spotifyParams } = require('../src/main/mcp-media');
const { AgentSpotifyActions, spotifyActionParams } = require('../src/main/mcp-spotify-actions');
const { tempDir } = require('./helpers/temp-dir');

const client = { id: 'a'.repeat(32) };
const peer = { id: 'b'.repeat(32) };
const clientId = '0'.repeat(32);
const access = 'fixture-access';
const refresh = 'fixture-refresh';
const track = 'spotify:track:' + 'C'.repeat(22);
const context = 'spotify:playlist:' + 'D'.repeat(22);
const device = 'private-fixture-device';
const scopes = ['user-read-playback-state', 'user-modify-playback-state'];
const idempotencyKey = 'spotify-fixture';

function fixture(t, granted = scopes) {
  let account;
  t.after(() => account?.close());
  const dir = tempDir(t, 'lastra-spotify-agent-');
  fs.writeFileSync(path.join(dir, 'spotify-account.json'), JSON.stringify({ version: 1, clientId }));
  fs.writeFileSync(path.join(dir, 'spotify-account.token'), Buffer.from('synthetic protected fixture').toString('base64'));
  const state = { device, track, context, playing: true, stamp: 1234, active: true, restricted: false, disallows: {}, puts: [], reads: 0 };
  account = new SpotifyAccount(dir, {
    storage: { isAsyncEncryptionAvailable: async () => true, decryptStringAsync: async () => ({
      result: JSON.stringify({ clientId, refresh, scopes: granted }), shouldReEncrypt: false,
    }) },
    fetcher: async (target, options) => {
      const url = new URL(target);
      if (url.host === 'accounts.spotify.com') {
        assert.equal(url.pathname, '/api/token');
        assert.equal(options.body.get('refresh_token'), refresh);
        return Response.json({ access_token: access, token_type: 'Bearer', expires_in: 3600 });
      }
      assert.equal(url.origin, 'https://api.spotify.com');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, `Bearer ${access}`);
      const currentDevice = { id: state.device, name: 'Fixture speaker', is_active: state.active, is_restricted: state.restricted };
      if (options.method === 'PUT') {
        state.puts.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), body: options.body });
        if (state.afterPut) return state.afterPut(url, options);
        if (state.rejectWrite) return new Response(null, { status: state.rejectWrite });
        state.playing = url.pathname.endsWith('/play');
        state.stamp++;
        return new Response(null, { status: 204 });
      }
      if (url.pathname.endsWith('/devices')) return Response.json({ devices: [currentDevice] });
      if (url.pathname.endsWith('/queue')) return Response.json({ queue: [] });
      assert.equal(url.pathname, '/v1/me/player');
      state.reads++;
      if (state.badRead) return new Response(null, { status: state.badRead });
      return Response.json({ item: { name: 'Fixture title https://hidden.test/source', uri: state.track, is_local: state.local === true },
        context: state.context === null ? null : { uri: state.context }, actions: { disallows: state.disallows },
        device: currentDevice, is_playing: state.playing, timestamp: state.stamp });
    },
  });
  const media = new AgentMediaReader({ spotify: (options) => account.snapshot({ ...options, includeControl: true }) });
  const reviews = [];
  const audits = [];
  const consent = { author: true, peer: true, canReview: true };
  const approve = (review) => new Promise((resolve) => {
    reviews.push({ ...review, choose: resolve });
    review.signal.addEventListener('abort', () => resolve(false), { once: true });
  });
  const actions = new AgentSpotifyActions({ player: account, media, approve, readbackInterval: 0,
    history: { async run(header, effect) { audits.push({ header, result: await effect() }); } }, canReview: () => consent.canReview });
  const invoke = (parameters, owner = client) => actions.change(owner, spotifyActionParams(parameters),
    () => owner.id === client.id ? consent.author : consent.peer);
  const observe = (owner = client, section = 'playback') => media.spotifyState(spotifyParams({ section, refresh: true }), owner.id);
  const request = (revision, action = 'pause', key = idempotencyKey, owner = client) =>
    invoke({ command: 'request', action, revision, idempotencyKey: key }, owner);
  const settle = async (id) => {
    for (let i = 0; i < 100; i++) {
      const reply = await invoke({ command: 'status', request: id });
      if (!['awaiting_confirmation', 'applying', 'cancel_requested'].includes(reply.status)) return reply;
      await wait(5);
    }
    assert.fail('The Spotify review did not settle.');
  };
  return { account, actions, state, reviews, audits, consent, invoke, observe, request, settle };
}

test('Spotify reviews play and pause on the exact observed device and uses redacted, owner-bound results', async (t) => {
  const f = fixture(t);
  const reading = await f.observe();
  const { control } = reading.playback;
  assert.deepEqual(control.capabilities, { play: false, pause: true });
  assert.equal(control.device, (await f.observe(client, 'devices')).devices[0].id);
  assert.notEqual((await f.observe(peer)).playback.control.revision, control.revision);
  assert.equal((await f.account.snapshot()).controlTarget, undefined);
  assert.doesNotMatch(JSON.stringify(reading), /Fixture title|fixture-access|fixture-refresh|private-fixture-device|hidden.test|spotify:track|spotify:playlist/);
  assert.throws(() => spotifyActionParams({ command: 'request', action: 'seek', revision: control.revision, idempotencyKey }), /play or pause/);
  await assert.rejects(f.request(control.revision, 'play'), /Spotify playback or its control changed/);
  await assert.rejects(f.request(control.revision, 'pause', idempotencyKey, peer), /Spotify playback or its control changed/);
  const pending = await f.request(control.revision);
  assert.equal(pending.status, 'awaiting_confirmation');
  assert.equal(f.reviews[0].target, 'Fixture speaker');
  assert.deepEqual(f.reviews[0].details, [{ field: 'Playback', value: {
    item: 'Fixture title [link]', current: 'Playing', requested: 'Paused',
  } }]);
  assert.deepEqual(f.state.puts, []);
  assert.equal((await f.account.change({ action: 'account-transfer', deviceId: 'other' })).ok, false);
  assert.deepEqual(await f.request(control.revision), pending);
  await assert.rejects(f.invoke({ command: 'cancel', request: pending.request }, peer), /review is unavailable/);
  f.reviews[0].choose(true);
  const paused = await f.settle(pending.request);
  assert.equal(paused.status, 'confirmed');
  assert.deepEqual(await f.request(control.revision), paused);
  const next = (await f.observe()).playback.control;
  assert.notEqual(next.revision, control.revision);
  const resumed = await f.request(next.revision, 'play', 'resume-fixture');
  f.reviews[1].choose(true);
  assert.equal((await f.settle(resumed.request)).status, 'confirmed');
  assert.deepEqual(f.state.puts, ['/pause', '/play'].map((method) => ({
    path: '/v1/me/player' + method, query: { device_id: device }, body: undefined,
  })));
  assert.equal(f.audits.length, 2);
  assert.ok(f.audits.every(({ result }) => result.ok));
  assert.ok(f.audits.every(({ header }) => header.context === client.id.slice(0, 8) + ' · ' + control.device));
  assert.doesNotMatch(JSON.stringify([paused, f.audits]), /Fixture title|fixture-access|fixture-refresh|Fixture speaker|spotify:|private-fixture/);
});

test('Spotify discards stale playback, disconnected accounts, and revoked or cancelled reviews before a send', async (t) => {
  for (const [caseName, change] of Object.entries({
    device: (f) => { f.state.device = 'other'; },
    item: (f) => { f.state.track = 'spotify:track:' + 'Z'.repeat(22); },
    context: (f) => { f.state.context = null; },
    playback: (f) => { f.state.stamp++; },
    unavailable: (f) => { f.state.badRead = 503; },
    restricted: (f) => { f.state.restricted = true; },
    disallowed: (f) => { f.state.disallows.pausing = true; },
    disconnected: (f) => f.account.disconnect(),
  })) {
    await t.test(caseName, async (st) => {
      const f = fixture(st);
      const pending = await f.request((await f.observe()).playback.control.revision);
      change(f);
      f.reviews[0].choose(true);
      assert.equal((await f.settle(pending.request)).status, 'stale');
      assert.deepEqual(f.state.puts, []);
    });
  }
  const f = fixture(t);
  const revision = (await f.observe()).playback.control.revision;
  f.state.stamp++;
  await assert.rejects(f.request(revision), /Spotify playback or its control changed/);
  assert.deepEqual(f.reviews, []);
  f.state.stamp--;
  const pending = await f.request(revision);
  f.consent.author = false;
  f.actions.checkPending();
  assert.ok(f.reviews[0].signal.aborted);
  f.consent.author = true;
  assert.equal((await f.settle(pending.request)).status, 'cancelled');
  const second = await f.request(revision, 'pause', 'second-review');
  assert.equal((await f.invoke({ command: 'cancel', request: second.request })).status, 'cancelled');
  assert.ok(f.reviews[1].signal.aborted);
  assert.deepEqual(f.state.puts, []);
  await wait(0);
  assert.deepEqual(f.audits.map(({ result }) => result), [{ ok: false, cancelled: true }, { ok: false, cancelled: true }]);
});

test('Spotify exposes control only for a fresh supported item and granted OAuth scopes', async (t) => {
  const f = fixture(t, ['user-read-playback-state']);
  assert.equal((await f.observe()).playback.control, undefined);
  assert.equal((await f.observe()).status, 'ready');
  assert.deepEqual(f.state.puts, []);
  for (const state of [{ active: false }, { restricted: true }, { local: true }, { stamp: 0 }, { disallows: { pausing: true } }]) {
    await t.test(JSON.stringify(state), async (st) => {
      const fixtureState = fixture(st);
      Object.assign(fixtureState.state, state);
      assert.equal((await fixtureState.observe()).playback.control, undefined);
      assert.deepEqual(fixtureState.state.puts, []);
    });
  }
});

test('Spotify sends a PUT once and corroborates the matching item after the response', async (t) => {
  for (const [caseName, change, status] of [
    ['denied', (f) => { f.state.rejectWrite = 403; }, 'failed'],
    ['rate limited', (f) => { f.state.rejectWrite = 429; }, 'unconfirmed'],
    ['accepted without readback', (f) => { f.state.afterPut = () => new Response(null, { status: 204 }); }, 'unconfirmed'],
    ['different item on readback', (f) => { f.state.afterPut = () => {
      f.state.track = 'spotify:episode:' + 'E'.repeat(22);
      f.state.playing = false;
      return new Response(null, { status: 204 });
    }; }, 'unconfirmed'],
  ]) {
    await t.test(caseName, async (st) => {
      const f = fixture(st);
      const pending = await f.request((await f.observe()).playback.control.revision);
      change(f);
      f.reviews[0].choose(true);
      assert.equal((await f.settle(pending.request)).status, status);
      assert.equal(f.state.puts.length, 1);
      assert.deepEqual(f.audits.map(({ result }) => result), [{ ok: false }]);
    });
  }
  const f = fixture(t);
  let started;
  const dispatch = new Promise((resolve) => { started = resolve; });
  f.state.afterPut = (_url, { signal }) => new Promise((resolve, reject) => {
    started();
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const pending = await f.request((await f.observe()).playback.control.revision);
  f.reviews[0].choose(true);
  await dispatch;
  assert.equal((await f.invoke({ command: 'cancel', request: pending.request })).status, 'cancel_requested');
  assert.equal((await f.settle(pending.request)).status, 'unconfirmed');
  assert.equal(f.state.puts.length, 1);
});
