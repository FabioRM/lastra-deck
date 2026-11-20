'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { SpotifyView, normalizePlaylists, playlistUrl } = require('../src/main/app-view-spotify');
const { WebEmbeds } = require('../src/main/app-view-web-embeds');
const { AppViews } = require('../src/main/app-views');
const { tempDir } = require('./helpers/temp-dir');

const playlistId = '37i9dQZF1DXcBWIGoYBM5M';
const url = 'https://open.spotify.com/playlist/' + playlistId;
const entry = { id: 'favorites', name: 'My favorites', url };
const config = (...playlists) => ({ version: 1, playlists });

test('Spotify playlists normalize shared locale URLs and Spotify URIs to a canonical playlist link', () => {
  const uri = 'spotify:playlist:' + playlistId;
  assert.equal(playlistUrl(uri), url);
  assert.equal(playlistUrl('https://open.spotify.com/intl-it/playlist/' + playlistId + '?si=tracking'), url);
  assert.equal(playlistUrl(url + '#search'), url);
  const disallowed = [
    'https://open.spotify.com.evil.example/playlist/' + playlistId,
    'https://username:password@open.spotify.com/playlist/' + playlistId,
    'http://open.spotify.com/playlist/' + playlistId, 'https://open.spotify.com:8081/playlist/' + playlistId,
    'https://open.spotify.com/episode/' + playlistId, 'javascript:alert(1)', 'spotify:playlist:not-an-id',
  ];
  for (const candidate of disallowed) assert.equal(playlistUrl(candidate), null);
  assert.deepEqual(normalizePlaylists(config({ ...entry, url: uri })), [entry]);
  assert.throws(() => normalizePlaylists(config(entry, entry)), /unique lowercase ID/);
});

test('Spotify view creates a playlist library on request and opens only registered playlist IDs', async (t) => {
  const directory = tempDir(t, 'lastra-spotify-lists-');
  const file = path.join(directory, 'spotify.json');
  const opened = [];
  const view = new SpotifyView(file, {
    openConfig: async (target) => { opened.push(target); return { ok: true }; },
    run: async (action) => { opened.push(action); return { ok: true }; },
  });
  assert.equal(fs.existsSync(file), false);
  assert.deepEqual(view.snapshot().playlists, []);
  assert.equal((await view.change({ action: 'configure' })).ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), config());
  fs.writeFileSync(file, JSON.stringify(config(entry)));
  assert.equal((await view.change({ action: 'configure' })).ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), config(entry));
  assert.deepEqual(view.snapshot().playlists, [{ id: entry.id, name: entry.name }]);
  await assert.rejects(view.change({ action: 'open-playlist', id: url }), /playlist is unavailable/);
  await view.change({ action: 'open-playlist', id: entry.id, url: 'https://wrong.example' });
  assert.deepEqual(opened, [file, file, { type: 'open', target: url }]);

  fs.writeFileSync(file, '{invalid');
  assert.equal(view.snapshot().status, 'invalid');
  assert.deepEqual(view.snapshot().playlists, [{ id: entry.id, name: entry.name }]);
  fs.writeFileSync(file, JSON.stringify(config()));
  await assert.rejects(view.change({ action: 'open-playlist', id: entry.id }), /playlist is unavailable/);
});

test('the built-in Spotify listening view includes the Spotify widget and native provider', () => {
  const model = new AppViews(path.join(os.tmpdir(), 'lastra-playlist-catalog-missing.json'));
  const view = model.snapshot().views.find(({ id }) => id === 'spotify');
  assert.equal(view.provider, 'spotify');
  assert.equal(view.widgets[0].type, 'spotify');
  assert.match(view.capabilities[0].detail, /authorized Spotify connection/);
});

test('Spotify opens a registered playlist in the official embed and keeps the external route', async (t) => {
  const directory = tempDir(t, 'lastra-spotify-embeds-');
  const file = path.join(directory, 'spotify.json');
  fs.writeFileSync(file, JSON.stringify(config(entry)));
  const calls = [];
  const host = { open: async (target) => { calls.push(target); return { ok: true }; } };
  const embeds = new WebEmbeds(path.join(directory, 'web-embeds.json'), { host });
  const spotify = new SpotifyView(file, { openEmbed: (item) => embeds.openSpotify(item),
    run: async (target) => { calls.push(target); return { ok: true }; } });
  assert.equal(spotify.snapshot().embedAvailable, true);
  await assert.rejects(spotify.change({ action: 'embed-playlist', id: 'nonexistent', url }), /playlist is unavailable/);
  await spotify.change({ action: 'embed-playlist', id: entry.id, url: 'https://wrong.example' });
  await spotify.change({ action: 'open-playlist', id: entry.id });
  assert.deepEqual(calls, [
    { id: entry.id, name: entry.name, kind: 'spotify', url: 'https://open.spotify.com/embed/playlist/' + playlistId, external: url },
    { type: 'open', target: url },
  ]);
});
