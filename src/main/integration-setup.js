// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RECENT_OBSERVATION_MS = 15_000;
const asList = (value) => Array.isArray(value) ? value : [];
const control = (name, state) => ({ name, state });
const permission = (name, state) => ({ name, state });
const when = (value, yes = 'ready', no = 'unknown') => value === true ? yes : value === false ? no : 'unknown';
const validTime = (time, now) => Number.isSafeInteger(time) && time >= 0 && time <= now ? time : null;
const summarize = (state, controls, permissions = [], observedAt = null) => ({ state, controls, permissions, observedAt });

function cachedSpotifySetup(account) {
  const session = account.session;
  return {
    config: account.settings?.state,
    status: session?.state,
    readGranted: session?.scopes?.has('user-read-playback-state'),
    queueReadGranted: session?.scopes?.has('user-read-currently-playing'),
    modifyGranted: session?.scopes?.has('user-modify-playback-state'),
    deviceReady: session?.sample?.devices?.state === 'ready',
    transferReady: asList(session?.sample?.devices?.items).some(({ id, restricted }) => Boolean(id) && restricted !== true
      && !session.blockedTransfers?.has(id)),
    queueReady: session?.sample?.queue?.state === 'ready',
    sampledAt: session?.sample?.sampledAt,
  };
}

const PROVIDERS = [
  {
    id: 'obs', name: 'OBS Studio', group: 'Production',
    hint: 'Configure the local WebSocket server in OBS. Lastra uses the status it has already received.',
    observe(raw, now) {
      const states = { connected: 'ready', disabled: 'setup', connecting: 'configured', syncing: 'configured',
        invalid: 'setup', authentication: 'limited', unsupported: 'unavailable', revoked: 'limited', disconnected: 'offline' };
      const state = Object.hasOwn(states, raw?.status) ? states[raw.status] : 'unknown';
      const active = raw?.status === 'connected';
      const authorization = active ? 'granted' : ['authentication', 'revoked'].includes(raw?.status) ? 'required' : 'unknown';
      return summarize(state, [control('Scene selection', when(active)), control('Studio preview and take', active ? when(raw.studio, 'ready', 'limited') : 'unknown'),
        control('Recording and streaming status', when(active && Boolean(raw.recording && raw.streaming))),
        control('Saved replay verification', active ? when(Boolean(raw.replay?.active), 'ready', 'limited') : 'unknown')],
      [permission('OBS WebSocket authorization', authorization)], validTime(raw?.sampledAt, now));
    },
  },
  {
    id: 'spotify', name: 'Spotify Connect', group: 'Media',
    hint: 'Set up the connection, then use Connect Spotify in the deck’s Spotify view to grant account access.',
    observe(raw, now) {
      const account = raw?.config === 'ready' && raw.status === 'connected';
      const observedAt = validTime(raw?.sampledAt, now);
      const fresh = account && observedAt !== null && now - observedAt <= RECENT_OBSERVATION_MS;
      const state = account ? fresh ? 'ready' : 'configured' : raw?.config === 'ready' ? 'configured' : raw?.config === 'invalid'
        || raw?.config === 'setup' ? 'setup' : 'unknown';
      const grant = (value) => account ? when(value, 'granted', 'required') : raw?.config === 'ready' ? 'required' : 'unknown';
      const playbackGrant = account && raw.readGranted;
      const queueGrant = account && (raw.readGranted || raw.queueReadGranted);
      return summarize(state, [control('Playback device list', fresh ? when(playbackGrant && raw.deviceReady, 'ready', 'limited') : 'unknown'),
        control('Playback transfer', fresh ? when(playbackGrant && raw.modifyGranted && raw.transferReady, 'configured', 'limited') : 'unknown'),
        control('Queue inventory', fresh ? when(queueGrant && raw.queueReady, 'ready', 'limited') : 'unknown')],
      [permission('Read playback state', grant(raw?.readGranted)), permission('Read current playback and queue', grant(raw?.queueReadGranted || raw?.readGranted)),
        permission('Control playback', grant(raw?.modifyGranted))], observedAt);
    },
  },
  {
    id: 'vscode', name: 'Visual Studio Code', group: 'Development',
    hint: 'Enable Lastra for VS Code in the selected workspace and trust that workspace before running tasks.',
    observe(raw, now) {
      const sessions = asList(raw?.sessions).slice(0, 16);
      const ready = raw?.status === 'ready' && sessions.length > 0;
      const anyTrusted = sessions.some(({ trusted }) => trusted === true);
      const task = sessions.some(({ trusted, tasks }) => trusted === true && asList(tasks).length > 0);
      const at = ready ? Math.max(...sessions.map(({ updatedAt }) => validTime(updatedAt, now) ?? -1)) : -1;
      return summarize(ready ? 'ready' : ['setup', 'offline', 'unavailable'].includes(raw?.status) ? raw.status : 'unknown',
        [control('Workspace status', when(ready)), control('Configured task controls', ready ? when(task, 'ready', 'limited') : 'unknown')],
        [permission('Workspace trust', ready ? when(anyTrusted, 'granted', 'required') : 'unknown')], validTime(at, now));
    },
  },
  {
    id: 'claude', name: 'Claude Code', group: 'Development',
    hint: 'Enable the local Lastra hooks in Claude Code. Review Claude Code tool permissions in its terminal.',
    observe(raw, now) {
      const sessions = asList(raw?.sessions).slice(0, 16);
      const ready = raw?.status === 'ready' && sessions.length > 0;
      const at = ready ? Math.max(...sessions.map(({ updatedAt }) => validTime(updatedAt, now) ?? -1)) : -1;
      return summarize(ready ? 'ready' : ['setup', 'offline', 'unavailable'].includes(raw?.status) ? raw.status : 'unknown',
        [control('Local session status', when(ready)), control('Pending approval indicators', when(ready))],
        [permission('Local hooks reporting', ready ? 'observed' : 'unknown')], validTime(at, now));
    },
  },
  {
    id: 'chatgpt', name: 'ChatGPT', group: 'AI',
    hint: 'Set up saved conversations or Projects locally. They open in your signed-in browser.',
    observe(raw) {
      return summarize(raw?.message ? 'setup' : Array.isArray(raw?.links) ? raw.links.length ? 'configured' : 'setup' : 'unknown',
        [control('Saved conversation and Project links', raw?.links?.length ? 'configured' : 'setup'), control('Windows companion route', when(raw?.windowsApp, 'unknown', 'unavailable'))],
        [permission('Browser sign-in', 'unknown')]);
    },
  },
  {
    id: 'services', name: 'Service health', group: 'Monitoring',
    hint: 'Configure service checks in the existing Service Health setup. This inspector shows the latest results already in Lastra.',
    observe(raw, now) {
      const items = asList(raw?.checks).slice(0, 32);
      const at = items.length ? Math.max(...items.map(({ latest }) => validTime(latest?.at, now) ?? -1)) : -1;
      const state = raw?.error ? 'setup' : !raw ? 'unknown' : !items.length ? 'setup'
        : items.some(({ status }) => ['down', 'retrying'].includes(status)) ? 'limited' : at < 0 ? 'configured' : 'ready';
      return summarize(state, [control('Configured service checks', items.length ? 'configured' : 'setup'),
        control('Latest availability reading', at < 0 ? 'unknown' : state === 'limited' ? 'limited' : 'ready')], [], validTime(at, now));
    },
  },
  {
    id: 'audio', name: 'Windows audio', group: 'Devices',
    hint: 'Choose the default speaker or microphone in Windows Sound settings. Lastra uses the devices it has already read.',
    observe(raw, now) {
      const observedAt = validTime(raw?.sampledAt, now);
      const present = observedAt !== null;
      const output = present && Boolean(raw.output);
      const microphones = present && Boolean(raw.inputs?.length || raw.microphone);
      return summarize(!present ? 'unknown' : output || microphones ? 'ready' : 'unavailable',
        [control('Default speaker', present ? when(output, 'ready', 'unavailable') : 'unknown'),
          control('Available microphones', present ? when(microphones, 'ready', 'unavailable') : 'unknown')],
        [permission('Windows microphone privacy setting', 'unknown')], observedAt);
    },
  },
];

const openError = 'The selected integration setup could not be opened.';
const wrongAction = 'Choose an available integration setup action.';

function isRegularFile(file) {
  try { return fs.lstatSync(file).isFile(); } catch { return false; }
}

function integrationSetupActions({ dataDirectory, sourceRoot, openLocal, openExternal, platform = process.platform }) {
  const local = (label, file) => ({ label, available: () => isRegularFile(file), open: () => openLocal(file) });
  const config = (file) => local('Open existing settings', path.join(dataDirectory, file));
  const guide = (file) => local('Open setup guide', path.join(sourceRoot, 'docs', file));
  return {
    obs: { settings: config('obs.json'), guide: guide('obs.md') },
    spotify: { settings: config('spotify-account.json'), guide: guide('app-views.md') },
    vscode: { guide: local('Open extension setup guide', path.join(sourceRoot, 'extensions', 'lastra-vscode', 'README.md')) },
    claude: { settings: config('claude.json'), guide: guide('claude-code.md') },
    chatgpt: { settings: config('chatgpt.json'), guide: guide('chatgpt.md') },
    services: { settings: config('service-checks.json'), guide: guide('telemetry.md') },
    audio: { sound: { label: 'Open Windows Sound settings', available: () => platform === 'win32', open: () => openExternal('ms-settings:sound') } },
  };
}

class IntegrationSetup {
  constructor({ sources, actions, now = Date.now }) {
    this.sources = sources;
    this.actions = actions;
    this.now = now;
  }

  async read() {
    const now = this.now();
    const rows = await Promise.all(PROVIDERS.map(async ({ id, name, group, hint, observe }) => {
      let result;
      try { result = observe(await this.sources[id]?.(), now); }
      catch { result = observe(null, now); }
      const actions = Object.entries(this.actions[id] ?? {}).flatMap(([id, action]) => action.available() ? [{ id, label: action.label }] : []);
      return { id, name, group, hint, ...result, actions };
    }));
    return { version: 1, readAt: now, providers: rows };
  }

  async open(params) {
    if (!params || typeof params !== 'object' || Array.isArray(params) || Object.keys(params).length !== 2
        || !Object.hasOwn(params, 'provider') || !Object.hasOwn(params, 'action')
        || typeof params.provider !== 'string' || !PROVIDERS.some(({ id }) => id === params.provider)
        || typeof params.action !== 'string') return { ok: false, message: wrongAction };
    const actions = this.actions[params.provider];
    const entry = actions && Object.hasOwn(actions, params.action) ? actions[params.action] : null;
    if (!entry || !entry.available()) return { ok: false, message: wrongAction };
    try {
      const result = await entry.open();
      return result?.ok === false ? { ok: false, message: openError } : { ok: true };
    } catch { return { ok: false, message: openError }; }
  }
}

module.exports = { IntegrationSetup, cachedSpotifySetup, integrationSetupActions };
