// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { writeAtomic } = require('./write-atomic');
const { createAuthorization, exchangeToken } = require('./spotify-oauth');

const API = 'https://api.spotify.com/v1/me/player';
const PLAYBACK = '?additional_types=track%2Cepisode';
const CLIENT_ID = /^[a-f0-9]{32}$/i;
const TOKEN = /^[\x21-\x7e]{1,8000}$/;
const URI = /^spotify:(track|episode):[A-Za-z0-9]{22}$/;
const DEVICE = /^[A-Za-z0-9_-]{1,128}$/;
const CONTEXT = /^spotify:(album|artist|playlist|show):[A-Za-z0-9]{22}$/;
const READ = 'user-read-playback-state';
const CURRENT = 'user-read-currently-playing';
const WRITE = 'user-modify-playback-state';
const SCOPES = new Set([READ, CURRENT, WRITE]);
const CONFIG = '{\n  "version": 1,\n  "clientId": ""\n}\n';
const MAX_FILE = 24 * 1024;
const MAX_MEDIA_MS = 7 * 24 * 60 * 60 * 1000;

function mediaTime(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_MEDIA_MS ? value : null;
}

function readSmall(file) {
  if (fs.statSync(file).size > MAX_FILE) throw new Error('Spotify file exceeds its size limit.');
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}

function name(value) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 150) : '';
}

function item(raw) {
  if (!name(raw?.name)) return null;
  const names = Array.isArray(raw.artists) ? raw.artists.slice(0, 6).map((artist) => name(artist?.name)).filter(Boolean) : [];
  return { title: name(raw.name), creator: names.join(', ') || name(raw.show?.name),
    uri: typeof raw.uri === 'string' && URI.test(raw.uri) ? raw.uri : '' };
}

function device(raw) {
  return { id: typeof raw?.id === 'string' && DEVICE.test(raw.id) ? raw.id : '', name: name(raw?.name) || 'Spotify device',
    active: raw?.is_active === true, restricted: raw?.is_restricted === true };
}

function playbackScopes(values) {
  return new Set(values.filter((value) => SCOPES.has(value)));
}

function transportTarget(raw, generation) {
  const active = device(raw?.device);
  const current = item(raw?.item);
  const context = raw?.context?.uri ?? null;
  if (!active.id || !active.active || raw.device.is_restricted !== false || raw.item?.is_local === true
      || !current?.uri || typeof raw.is_playing !== 'boolean' || !Number.isSafeInteger(raw.timestamp) || raw.timestamp <= 0 || (raw.context != null
        && (typeof context !== 'string' || !CONTEXT.test(context)))) return null;
  const blocked = (key) => raw.actions?.disallows?.[key] === true || raw.actions?.[key] === true;
  return { generation, device: active.id, item: current.uri, context, stamp: raw.timestamp, playing: raw.is_playing,
    canPlay: !raw.is_playing && !blocked('resuming'), canPause: raw.is_playing && !blocked('pausing'),
    deviceName: active.name, itemName: current.title };
}

function sameSpotifyPlayback(a, b) {
  return a && b && a.generation === b.generation && a.device === b.device && a.item === b.item && a.context === b.context;
}

class SpotifyAccount {
  /**
   * @param {string} dir
   * @param {{ openConfig?: (file: string) => any, openExternal?: (url: string) => any,
   *   storage?: Pick<Electron.SafeStorage, 'encryptStringAsync' | 'decryptStringAsync' | 'isAsyncEncryptionAvailable'>,
   *   fetcher?: typeof fetch, oauth?: typeof createAuthorization }} [options]
   */
  constructor(dir, { openConfig, openExternal, storage, fetcher = globalThis.fetch, oauth = createAuthorization } = {}) {
    this.file = path.join(dir, 'spotify-account.json');
    this.tokenFile = path.join(dir, 'spotify-account.token');
    this.openConfig = openConfig;
    this.openExternal = openExternal;
    this.storage = storage;
    this.fetcher = fetcher;
    this.oauth = oauth;
    this.settings = null;
    this.session = this.newSession();
  }

  newSession() {
    return { controller: new AbortController(), generation: randomBytes(16).toString('hex'),
      state: 'disconnected', scopes: new Set(), retryAt: 0,
      blockedTransfers: new Set(), blockedQueueDevices: new Set() };
  }

  close() {
    this.session.authorization?.cancel();
    this.session.controller.abort();
    this.session = this.newSession();
  }

  readSettings() {
    let state = 'setup';
    let clientId = '';
    try {
      const raw = JSON.parse(readSmall(this.file));
      if (raw?.version === 1 && raw.clientId === '') state = 'setup';
      else if (raw?.version === 1 && typeof raw.clientId === 'string' && CLIENT_ID.test(raw.clientId)) {
        clientId = raw.clientId.toLowerCase();
        state = 'ready';
      } else state = 'invalid';
    } catch (error) {
      if (error.code !== 'ENOENT') state = 'invalid';
    }
    if (this.settings?.state === state && this.settings.clientId === clientId) return this.settings;

    this.close();
    this.settings = { state, clientId };
    if (state === 'ready') this.session.loading = this.restoreToken(this.session, clientId);
    return this.settings;
  }

  async restoreToken(session, clientId) {
    try {
      if (!await this.storage?.isAsyncEncryptionAvailable() || session !== this.session) return;
      const encrypted = Buffer.from(readSmall(this.tokenFile), 'base64');
      const { result, shouldReEncrypt } = await this.storage.decryptStringAsync(encrypted);
      const stored = JSON.parse(result);
      if (session !== this.session || stored?.clientId !== clientId || typeof stored.refresh !== 'string' || !TOKEN.test(stored.refresh)) return;
      session.refresh = stored.refresh;
      session.scopes = playbackScopes(Array.isArray(stored.scopes) ? stored.scopes : []);
      session.reencrypt = shouldReEncrypt;
      session.state = 'connected';
    } catch (error) {
      if (session === this.session && error.code !== 'ENOENT') session.note = 'The saved Spotify connection could not be read. Connect again.';
    }
  }

  async saveToken(session, clientId, data) {
    if (session !== this.session) return;
    if (data?.token_type?.toLowerCase() !== 'bearer' || typeof data.access_token !== 'string' ||
        !TOKEN.test(data.access_token) || !Number.isFinite(data.expires_in) || data.expires_in < 1) {
      throw new Error('Spotify returned an invalid token.');
    }
    const refresh = data.refresh_token ?? session.refresh;
    if (typeof refresh !== 'string' || !TOKEN.test(refresh)) throw new Error('Spotify did not return a refresh token.');
    const scopes = typeof data.scope === 'string' ? playbackScopes(data.scope.split(/\s+/)) : session.scopes;
    const changed = session.reencrypt || session.refresh !== refresh || [...SCOPES].some((scope) => session.scopes.has(scope) !== scopes.has(scope));
    if (changed) {
      try {
        if (!await this.storage?.isAsyncEncryptionAvailable()) throw new Error('Encryption unavailable.');
        const encrypted = await this.storage.encryptStringAsync(JSON.stringify({ clientId, refresh, scopes: [...scopes] }));
        this.readSettings();
        if (session !== this.session) return;
        writeAtomic(this.tokenFile, encrypted.toString('base64'));
        session.reencrypt = false;
        session.note = '';
      } catch {
        session.note = 'Automatic reconnection is unavailable. This connection lasts until Lastra closes.';
      }
    }
    if (session !== this.session) return;
    session.scopes = scopes;
    session.refresh = refresh;
    session.access = data.access_token;
    session.accessUntil = Date.now() + Math.min(data.expires_in, 86_400) * 1000;
    session.state = 'connected';
  }

  async connect(settings) {
    if (settings.state !== 'ready') return { ok: false, message: 'Set the Spotify client ID first.' };
    if (this.session.state === 'authorizing') return { ok: true };
    if (this.session.state === 'connected') return { ok: false, message: 'Disconnect the current Spotify account first.' };
    this.close();
    const session = this.session;
    session.state = 'authorizing';
    try {
      const authorization = await this.oauth(settings.clientId);
      if (session !== this.session) {
        authorization.cancel();
        return { ok: false, message: 'Spotify connection canceled.' };
      }
      session.authorization = authorization;
      await this.openExternal(authorization.url);
      void this.completeAuthorization(session, settings.clientId, authorization);
      return { ok: true };
    } catch {
      session.authorization?.cancel();
      if (session === this.session) {
        session.state = 'disconnected';
        session.note = 'Could not open Spotify authorization. Check that the callback port is available and try again.';
      }
      return { ok: false, message: 'Could not start Spotify authorization.' };
    }
  }

  async completeAuthorization(session, clientId, authorization) {
    const result = await authorization.result;
    if (session !== this.session) return;
    session.authorization = null;
    if (result.status !== 'received') {
      session.state = 'disconnected';
      session.note = result.status === 'expired' ? 'Spotify authorization expired. Try connecting again.' : 'Spotify authorization ended.';
      return;
    }
    try {
      const data = await exchangeToken(this.fetcher, clientId, {
        grant_type: 'authorization_code', code: result.code, redirect_uri: authorization.redirect, code_verifier: authorization.verifier,
      }, session.controller.signal);
      this.readSettings();
      await this.saveToken(session, clientId, data);
    } catch {
      if (session === this.session) {
        session.state = 'disconnected';
        session.note = 'Spotify could not finish connecting. Check the client ID and callback settings.';
      }
    }
  }

  disconnect() {
    this.close();
    try {
      fs.rmSync(this.tokenFile, { force: true });
    } catch {
      this.session.state = 'disconnect-error';
      this.session.note = 'The Spotify session ended. Retry Disconnect Spotify to remove the saved connection.';
      return { ok: false, message: 'Could not remove the saved Spotify connection.' };
    }
    return { ok: true };
  }

  async accessToken(session, clientId) {
    if (session.access && session.accessUntil > Date.now() + 10_000) return;
    try {
      const data = await exchangeToken(this.fetcher, clientId, { grant_type: 'refresh_token', refresh_token: session.refresh }, session.controller.signal);
      await this.saveToken(session, clientId, data);
    } catch (error) {
      if (session !== this.session) return;
      if (error.reauthorize) {
        if (this.disconnect().ok) this.session.note = 'Spotify authorization ended. Connect again to use account controls.';
        return;
      }
      session.retryAt = Date.now() + 10_000;
      session.status = 'Spotify could not refresh the connection.';
    }
  }

  /**
   * @param {any} session
   * @param {string} [route]
   * @param {RequestInit} [options]
   * @returns {Promise<{ state: string, data?: any }>}
   */
  async request(session, route = '', options = {}) {
    if (session !== this.session || session.retryAt > Date.now() || !session.access) return { state: 'unavailable' };
    const { signal, ...request } = options;
    const signals = [session.controller.signal, AbortSignal.timeout(5000), ...(signal ? [signal] : [])];
    try {
      const active = AbortSignal.any(signals);
      active.throwIfAborted();
      const response = await this.fetcher(API + route, { ...request, redirect: 'error',
        headers: { Authorization: `Bearer ${session.access}`, ...(request.headers || {}) }, signal: active,
      });
      if (response.status === 429) {
        const seconds = Number.parseInt(response.headers.get('Retry-After'), 10);
        session.retryAt = Date.now() + 1000 * (Number.isSafeInteger(seconds) && seconds > 0 ? seconds : 30);
        session.status = 'Spotify requested a pause. Live data will retry automatically.';
      }
      if (response.status === 401) {
        session.access = null;
        session.status = 'Spotify needs to refresh the connection.';
      }
      if (!response.ok) return { state: response.status === 403 ? 'restricted' : 'unavailable' };
      return { state: 'ready', data: response.status === 204 || request.method ? null : await response.json() };
    } catch {
      return { state: 'unavailable' };
    }
  }

  async sample(session, clientId) {
    if (session.retryAt > Date.now()) return;
    session.status = '';
    await this.accessToken(session, clientId);
    if (session !== this.session || !session.access || session.retryAt > Date.now()) return;
    const read = session.scopes.has(READ);
    const current = session.scopes.has(CURRENT);
    const playback = read ? await this.request(session, PLAYBACK) : { state: 'scope' };
    const playbackReadAt = Date.now();
    const devices = read ? await this.request(session, '/devices') : { state: 'scope' };
    const queue = current || read ? await this.request(session, '/queue') : { state: 'scope' };
    if (session !== this.session) return;
    const deviceList = Array.isArray(devices.data?.devices) ? devices.data.devices.slice(0, 32).map(device) : [];
    const queueList = Array.isArray(queue.data?.queue) ? queue.data.queue.slice(0, 20).map(item).filter(Boolean) : [];
    const positionMs = mediaTime(playback.data?.progress_ms);
    const durationMs = mediaTime(playback.data?.item?.duration_ms);
    session.sample = {
      playback: { state: playback.state, item: item(playback.data?.item), playing: playback.data?.is_playing === true,
        ...(positionMs === null ? {} : { positionMs }), ...(durationMs === null ? {} : { durationMs }) },
      devices: { state: devices.state, items: deviceList },
      queue: { state: queue.state, items: queueList },
      deviceId: device(playback.data?.device).id,
      transportTarget: playback.state === 'ready' ? transportTarget(playback.data, session.generation) : null,
      playbackReadAt,
      sampledAt: Date.now(),
    };
  }

  async snapshot({ refresh = true, includeControl = false } = {}) {
    const settings = this.readSettings();
    const session = this.session;
    await session.loading;
    if (session !== this.session) return this.snapshot({ refresh: false, includeControl });
    if (refresh && session.state === 'connected' && !session.command && Date.now() >= (session.sample?.sampledAt ?? 0) + 3500) {
      session.reading ??= this.sample(session, settings.clientId).finally(() => { session.reading = null; });
      await session.reading;
    }
    if (session !== this.session) return this.snapshot({ refresh: false, includeControl });
    const data = session.sample;
    const current = data && Date.now() - data.sampledAt < 15_000 && session.retryAt <= Date.now() && !!session.access;
    const active = data?.devices.items.find((entry) => entry.id && entry.active && entry.id === data.deviceId);
    const canWrite = Boolean(current && session.scopes.has(WRITE) && !session.command);
    return {
      status: settings.state === 'ready' ? session.state : settings.state,
      message: session.status || session.note || '',
      playback: data?.playback,
      devices: data && { ...data.devices, items: data.devices.items.map((entry) => ({ ...entry,
        restricted: entry.restricted || session.blockedTransfers.has(entry.id),
      })) },
      queue: data?.queue,
      sampledAt: data?.sampledAt,
      stale: Boolean(data && !current),
      ...(includeControl ? { controlTarget: this.cachedControlTarget() } : {}),
      canTransfer: canWrite && data.devices.state === 'ready',
      canQueue: Boolean(canWrite && data.queue.state === 'ready' && data.playback.item?.uri && active && !active.restricted &&
        !session.blockedQueueDevices.has(active.id)),
    };
  }

  cachedControlTarget() {
    this.readSettings();
    const session = this.session;
    const sample = session.sample;
    const age = Date.now() - sample?.playbackReadAt;
    if (!sample?.transportTarget || session.state !== 'connected' || !session.access || session.retryAt > Date.now()
        || !session.scopes.has(READ) || !session.scopes.has(WRITE) || session.command || !(age >= 0 && age < 15_000)) return null;
    return sample.transportTarget;
  }

  holdPlaybackControl(target) {
    if (!sameSpotifyPlayback(this.cachedControlTarget(), target)) return null;
    const settings = this.settings;
    const session = this.session;
    session.command = true;
    let released = false;
    const valid = () => {
      this.readSettings();
      return !released && this.session === session && session.state === 'connected'
        && session.scopes.has(READ) && session.scopes.has(WRITE) && session.retryAt <= Date.now();
    };
    const read = async (signal) => {
      if (session.reading) await session.reading;
      if (signal?.aborted || !valid()) return { state: 'unavailable' };
      await this.accessToken(session, settings.clientId);
      if (signal?.aborted || !valid()) return { state: 'unavailable' };
      const result = await this.request(session, PLAYBACK, { signal });
      if (signal?.aborted || !valid()) return { state: 'unavailable' };
      const observed = result.state === 'ready' ? transportTarget(result.data, session.generation) : null;
      return { state: result.state, target: observed };
    };
    return {
      read,
      apply: async (action, observed, authorized, signal) => {
        if (!valid() || !authorized() || signal.aborted || !sameSpotifyPlayback(target, observed) || target.stamp !== observed.stamp
            || (action === 'play' ? !observed.canPlay : action !== 'pause' || !observed.canPause)) return 'stale';
        const query = new URLSearchParams({ device_id: observed.device });
        const result = await this.request(session, `/${action}?${query}`, { method: 'PUT', signal });
        if (session === this.session) session.sample = undefined;
        return result.state;
      },
      release: () => {
        if (released) return;
        released = true;
        session.command = false;
      },
    };
  }

  async command(command, settings) {
    const session = this.session;
    if (session.state !== 'connected' || session.command || !session.scopes.has(WRITE)) {
      return { ok: false, message: 'Spotify playback controls are unavailable.' };
    }
    session.command = true;
    try {
      if (session.reading) await session.reading;
      if (session !== this.session) return { ok: false, message: 'The Spotify connection changed.' };
      await this.sample(session, settings.clientId);
      this.readSettings();
      if (session !== this.session || !session.sample || session.retryAt > Date.now() || !session.access || !session.scopes.has(WRITE)) {
        return { ok: false, message: 'Spotify playback controls are unavailable.' };
      }
      const before = session.sample;
      const isTransfer = command.action === 'account-transfer';
      const target = before.devices.items.find((entry) => entry.id && entry.id === (isTransfer ? command.deviceId : before.deviceId));
      const uri = before.playback.item?.uri;
      const blocked = isTransfer ? session.blockedTransfers : session.blockedQueueDevices;
      if (before.devices.state !== 'ready' || !target || target.restricted || blocked.has(target.id) ||
          (isTransfer ? target.active : !target.active || before.queue.state !== 'ready' || !uri || uri !== command.uri)) {
        return { ok: false, message: 'Spotify playback changed or the selected control is unavailable.' };
      }
      const route = isTransfer ? '' : '/queue?' + new URLSearchParams({ uri, device_id: target.id });
      const options = isTransfer ? { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: [target.id] }) } : { method: 'POST' };
      const result = await this.request(session, route, options);
      if (result.state === 'restricted') blocked.add(target.id);
      const resultMessage = result.state === 'restricted' ? 'Spotify denied this control for the current account or device.' :
        'Spotify did not confirm the request. Check the current playback or queue before trying again.';
      if (result.state !== 'ready' || session !== this.session) return { ok: false, message: resultMessage };
      await this.sample(session, settings.clientId);
      if (session !== this.session) return { ok: false, message: 'The Spotify connection changed.' };
      const after = session.sample;
      const confirmed = isTransfer ? after?.devices.items.some((entry) => entry.id === target.id && entry.active) :
        after?.queue.items.filter((entry) => entry.uri === uri).length > before.queue.items.filter((entry) => entry.uri === uri).length;
      return { ok: true, message: confirmed ? (isTransfer ? 'Spotify device active.' : 'Item added to the Spotify queue.') :
        'Spotify accepted the request. The latest playback data has not confirmed it yet.' };
    } finally {
      session.command = false;
    }
  }

  async change(command) {
    const settings = this.readSettings();
    if (command?.action !== 'account-disconnect' && command?.action !== 'account-configure') {
      const session = this.session;
      await session.loading;
      if (session !== this.session) return { ok: false, message: 'The Spotify connection changed.' };
    }
    switch (command?.action) {
      case 'account-configure': {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        try { fs.writeFileSync(this.file, CONFIG, { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
        return this.openConfig(this.file);
      }
      case 'account-connect': return this.connect(settings);
      case 'account-disconnect': return this.disconnect();
      case 'account-transfer':
      case 'account-queue': return this.command(command, settings);
      default: throw new Error('Unknown Spotify account command.');
    }
  }
}

module.exports = { SpotifyAccount, sameSpotifyPlayback };
