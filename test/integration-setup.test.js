'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { IntegrationSetup, integrationSetupActions, cachedSpotifySetup } = require('../src/main/integration-setup');
const { tempDir } = require('./helpers/temp-dir');

const now = () => 100_000;
const byId = (rows) => Object.fromEntries(rows.providers.map((row) => [row.id, row]));

test('setup observations and permissions retain only known types and availability', async () => {
  const privateValue = 'FixtureSecret https://private.invalid/a C:\\private\\path';
  const setup = new IntegrationSetup({ now, actions: {}, sources: {
    obs: () => ({ status: 'connected', studio: false, program: privateValue, config: { password: privateValue }, sampledAt: 99_000,
      recording: { active: true }, streaming: { active: false }, replay: { active: false } }),
    spotify: () => ({ config: 'ready', status: 'connected', readGranted: true, queueReadGranted: false, modifyGranted: false,
      deviceReady: true, transferReady: true, queueReady: true, sampledAt: 100_000, id: privateValue }),
    vscode: () => ({ status: 'ready', sessions: [{ trusted: false, updatedAt: 90_000, directory: privateValue,
      tasks: [{ name: privateValue }] }] }),
    claude: () => ({ status: 'offline', sessions: [], message: privateValue }),
    chatgpt: () => ({ links: [{ url: privateValue, title: privateValue }], windowsApp: true }),
    services: () => ({ checks: [{ status: 'down', latest: { at: 96_000, detail: privateValue }, target: privateValue }] }),
    audio: () => ({ sampledAt: 99_000, output: { id: privateValue, name: privateValue }, inputs: [] }),
  } });
  const raw = await setup.read();
  const rows = byId(raw);
  assert.equal(raw.version, 1);
  assert.equal(raw.providers.length, 7);
  assert.equal(rows.obs.state, 'ready');
  assert.equal(rows.obs.permissions[0].state, 'granted');
  assert.equal(rows.obs.controls.find(({ name }) => name.includes('Studio preview')).state, 'limited');
  assert.equal(rows.spotify.state, 'ready');
  assert.equal(rows.spotify.controls.find(({ name }) => name.includes('transfer')).state, 'limited');
  assert.equal(rows.spotify.permissions.find(({ name }) => name === 'Control playback').state, 'required');
  assert.equal(rows.vscode.permissions[0].state, 'required');
  assert.equal(rows.vscode.controls[1].state, 'limited');
  assert.equal(rows.claude.state, 'offline');
  assert.equal(rows.chatgpt.state, 'configured');
  assert.equal(rows.chatgpt.permissions[0].state, 'unknown');
  assert.equal(rows.services.state, 'limited');
  assert.equal(rows.services.observedAt, 96_000);
  assert.equal(rows.audio.controls[0].state, 'ready');
  assert.equal(rows.audio.controls[1].state, 'unavailable');
  assert.doesNotMatch(JSON.stringify(raw), /FixtureSecret|private\.invalid|private\\\\path|password/i);
});

test('Spotify setup uses only cached scalar state and keeps unknown and old findings distinct', async () => {
  const account = {
    settings: { state: 'ready', get clientId() { throw new Error('private client ID'); } },
    session: { state: 'connected', scopes: new Set(['user-read-playback-state', 'user-modify-playback-state']),
      blockedTransfers: new Set(['restricted-id']), sample: { sampledAt: 1, devices: { state: 'ready', items: [{ id: 'restricted-id' }] } },
      get access() { throw new Error('private token'); }, get refresh() { throw new Error('private token'); } },
    snapshot() { throw new Error('Provider read could use the network'); },
    readSettings() { throw new Error('Provider read could restore a token'); },
    request() { throw new Error('Provider read could use the network'); },
  };
  const cached = cachedSpotifySetup(account);
  assert.equal(cached.config, 'ready');
  assert.equal(cached.transferReady, false);
  assert.doesNotMatch(JSON.stringify(cached), /restricted-id|private/);
  const setup = new IntegrationSetup({ now, actions: {}, sources: { spotify: () => cached, obs() { throw new Error('Private OBS config'); } } });
  const result = await setup.read();
  const rows = byId(result);
  assert.equal(rows.spotify.state, 'configured');
  assert.equal(rows.spotify.controls[0].state, 'unknown');
  assert.equal(rows.spotify.permissions[0].state, 'granted');
  assert.equal(rows.obs.state, 'unknown');
  assert.doesNotMatch(JSON.stringify(result), /Private OBS config/);
});

test('opening setup accepts registered choices only, leaves missing files absent, and masks opener errors', async (t) => {
  const root = tempDir(t, 'lastra-setup-');
  const dataDirectory = path.join(root, 'data');
  fs.mkdirSync(dataDirectory);
  fs.mkdirSync(path.join(root, 'docs'));
  const config = path.join(dataDirectory, 'obs.json');
  fs.writeFileSync(config, '{"password":"FixtureSecret"}');
  const guide = path.join(root, 'docs', 'obs.md');
  fs.writeFileSync(guide, 'Fixture guide');
  const opened = [];
  const openLocal = async (target) => {
    opened.push(target);
    return target === guide ? { ok: false, message: 'Private opener detail' } : { ok: true, value: 'Private opener detail' };
  };
  const openExternal = async (target) => { opened.push(target); };
  const actions = integrationSetupActions({ dataDirectory, sourceRoot: root, openLocal, openExternal, platform: 'win32' });
  const setup = new IntegrationSetup({ sources: {}, actions, now });
  const rows = byId(await setup.read());
  assert.deepEqual(rows.obs.actions.map(({ id }) => id), ['settings', 'guide']);
  assert.deepEqual(rows.spotify.actions, []);
  assert.deepEqual(opened, []);
  for (const invalid of [{ provider: 'obs', action: 'settings', path: guide }, { provider: 'ops', action: 'settings' },
    { provider: 'spotify', action: 'settings' }, { provider: 'audio', action: 'https://external.invalid' }, { provider: 'obs', action: '__proto__' },
    Object.assign(Object.create({ provider: 'obs', action: 'settings' }), { ignored: 1, other: 2 })]) {
    assert.equal((await setup.open(invalid)).ok, false);
  }
  assert.deepEqual(opened, []);
  assert.equal(fs.existsSync(path.join(dataDirectory, 'spotify-account.json')), false);
  assert.deepEqual(await setup.open({ provider: 'obs', action: 'settings' }), { ok: true });
  assert.deepEqual(await setup.open({ provider: 'obs', action: 'guide' }), { ok: false, message: 'The selected integration setup could not be opened.' });
  assert.deepEqual(await setup.open({ provider: 'audio', action: 'sound' }), { ok: true });
  assert.deepEqual(opened, [config, guide, 'ms-settings:sound']);
  assert.equal(fs.readFileSync(config, 'utf8'), '{"password":"FixtureSecret"}');
  fs.unlinkSync(config);
  assert.equal((await setup.open({ provider: 'obs', action: 'settings' })).ok, false);
});
