// @ts-check
'use strict';

const { createHash, createHmac, randomBytes } = require('node:crypto');
const { SnapshotRequestError } = require('./mcp-snapshot');

const VERSION = 1;
const ROW_LIMIT = 32;
const DISCOVERY_LIMIT = 256;
const WINDOWS_SELECTION_MS = 10_000;
const MAX_MEDIA_MS = 7 * 24 * 60 * 60 * 1000;
const WINDOWS_ID = /^[a-f0-9]{32}$/;
const SESSION_ALIAS = /^media-session-[a-f0-9]{24}$/;
const SPOTIFY_REVISION = /^spotify-playback-[a-f0-9]{24}$/;
const SPOTIFY_DEVICE = /^[A-Za-z0-9_-]{1,128}$/;
const CURSOR = /^[a-f0-9]{24}\.\d{1,4}$/;
const MEDIA_KINDS = ['windows', 'spotify', 'netflix'];
const MEDIA_STATES = ['ready', 'empty', 'missing', 'busy', 'unsupported', 'unavailable'];
const PLAYBACK_STATES = ['closed', 'opened', 'changing', 'stopped', 'playing', 'paused', 'unknown'];
const ACCOUNT_STATES = ['setup', 'invalid', 'disconnected', 'authorizing', 'connected', 'disconnect-error', 'unavailable'];
const SPOTIFY_STATES = ['ready', 'empty', 'stale', 'scope', 'restricted', 'unavailable'];
const OBS_STATES = ['disabled', 'invalid', 'connecting', 'syncing', 'connected', 'disconnected', 'authentication', 'unsupported', 'revoked', 'unavailable'];
const OBS_PHASES = ['starting', 'stopping', 'reconnecting'];
const ITEM_KINDS = ['track', 'episode', 'unknown'];
const SECTIONS = {
  media: { active: ['session', 'metadata'], sessions: ['limit', 'cursor'] },
  spotify: { playback: ['metadata', 'refresh'], devices: ['metadata', 'refresh', 'limit', 'cursor'], queue: ['metadata', 'refresh', 'limit', 'cursor'] },
  obs: { state: ['metadata'], scenes: ['metadata', 'limit', 'cursor'], sources: ['metadata', 'limit', 'cursor'] },
};

const enumeration = (items) => ({ enum: items });
const text = { type: 'string' };
const boolean = { type: 'boolean' };
const whole = { type: 'integer', minimum: 0 };
const ms = { ...whole, maximum: MAX_MEDIA_MS };
const nullable = (value) => ({ anyOf: [value, { type: 'null' }] });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const list = (items, maxItems = ROW_LIMIT) => ({ type: 'array', items, maxItems });
const paging = { limit: { ...whole, minimum: 1, maximum: ROW_LIMIT }, cursor: { ...text, pattern: CURSOR.source } };
const mediaInput = object({ section: enumeration(Object.keys(SECTIONS.media)), session: { ...text, pattern: SESSION_ALIAS.source },
  metadata: boolean, ...paging }, ['section']);
const spotifyInput = object({ section: enumeration(Object.keys(SECTIONS.spotify)), metadata: boolean, refresh: boolean, ...paging }, ['section']);
const obsInput = object({ section: enumeration(Object.keys(SECTIONS.obs)), metadata: boolean, ...paging }, ['section']);

const base = { version: { const: VERSION }, sampledAt: whole, sourceSampledAt: nullable(whole), ageMs: nullable(whole) };
const keys = ['version', 'section', 'status', 'sampledAt', 'sourceSampledAt', 'ageMs'];
const windowsSession = object({ id: { ...text, pattern: SESSION_ALIAS.source }, source: enumeration(MEDIA_KINDS), default: boolean });
const playCapabilities = object({ play: boolean, pause: boolean, toggle: boolean, previous: boolean, next: boolean, seek: boolean });
const windowsView = object({ id: nullable(windowsSession.properties.id), source: enumeration(MEDIA_KINDS), state: enumeration(PLAYBACK_STATES),
  durationMs: nullable(ms), positionMs: nullable(ms), positionUpdatedAt: nullable(whole), rate: nullable({ type: 'number' }),
  seekMinMs: nullable(ms), seekMaxMs: nullable(ms), capabilities: playCapabilities,
  metadata: object({ title: text, artist: text, album: text }) }, ['id', 'source', 'state', 'durationMs', 'positionMs', 'positionUpdatedAt',
  'rate', 'seekMinMs', 'seekMaxMs', 'capabilities']);
const mediaOutput = object({ ...base, section: mediaInput.properties.section, status: enumeration(MEDIA_STATES),
  active: nullable(windowsView), sessions: list(windowsSession), nextCursor: paging.cursor }, keys);

const musicMetadata = object({ title: text, creator: text });
const spotifyDevice = object({ id: nullable(text), active: boolean, restricted: boolean, name: text }, ['id', 'active', 'restricted']);
const spotifyItem = object({ id: text, kind: enumeration(ITEM_KINDS), position: whole, metadata: musicMetadata }, ['id', 'kind', 'position']);
const spotifyControl = object({ revision: { ...text, pattern: SPOTIFY_REVISION.source }, device: text,
  capabilities: object({ play: boolean, pause: boolean }) });
const spotifyPlayback = object({ hasItem: boolean, kind: enumeration(ITEM_KINDS), playing: nullable(boolean),
  positionMs: nullable(ms), durationMs: nullable(ms), metadata: musicMetadata, control: spotifyControl },
  ['hasItem', 'kind', 'playing', 'positionMs', 'durationMs']);
const spotifyOutput = object({ ...base, section: spotifyInput.properties.section, status: enumeration(SPOTIFY_STATES),
  accountStatus: enumeration(ACCOUNT_STATES), playback: nullable(spotifyPlayback), devices: list(spotifyDevice), queue: list(spotifyItem),
  nextCursor: paging.cursor }, [...keys, 'accountStatus']);

const ref = object({ id: text, name: text }, ['id']);
const obsOutputState = { active: boolean, phase: nullable(enumeration(OBS_PHASES)) };
const obsState = object({ studio: boolean, program: nullable(ref), preview: nullable(ref), sourceScene: nullable(ref),
  recording: nullable(object({ ...obsOutputState, paused: boolean })), streaming: nullable(object(obsOutputState)) });
const obsSource = object({ id: text, visible: nullable(boolean), name: text }, ['id', 'visible']);
const obsDetail = object({ id: text, muted: nullable(boolean), volumePercent: nullable({ type: 'number' }),
  filters: list(object({ id: text, enabled: nullable(boolean), name: text }, ['id', 'enabled'])) });
const obsOutput = object({ ...base, section: obsInput.properties.section, status: enumeration(OBS_STATES),
  generation: nullable(whole), canReconnect: boolean, state: nullable(obsState), scenes: list(ref), sources: list(obsSource),
  selectedSource: nullable(obsDetail), sourceScene: nullable(ref), truncated: boolean, nextCursor: paging.cursor }, [...keys, 'generation', 'canReconnect']);

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const valid = (value, pattern) => typeof value === 'string' && pattern.test(value);
const integer = (value, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
const timeline = (value) => integer(value, MAX_MEDIA_MS);
const flag = (value) => typeof value === 'boolean' ? value : null;
const pick = (value, options, fallback) => options.includes(value) ? value : fallback;
const named = (value) => typeof value === 'string' && value.length > 0 && value.length <= 512;
const textValue = (value) => typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/(?:https?|wss?|file|spotify):\S+/gi, '[link]')
  .trim().slice(0, 180) : '';
const sampleTime = (value, now) => integer(value, now + 30_000);

function parse(provider, input) {
  const sections = SECTIONS[provider];
  if (!record(input) || typeof input.section !== 'string' || !Object.hasOwn(sections, input.section) ||
      Object.keys(input).some((key) => key !== 'section' && !sections[input.section].includes(key))) {
    throw new Error('Choose a section and its supported media options.');
  }
  const { section, session, metadata = false, refresh = false, limit = 16, cursor } = input;
  if (typeof metadata !== 'boolean' || typeof refresh !== 'boolean' || integer(limit, ROW_LIMIT) === null || limit < 1 ||
      (cursor !== undefined && !valid(cursor, CURSOR)) || (session !== undefined && !valid(session, SESSION_ALIAS))) {
    throw new Error('Choose valid media options, session alias, or page limit.');
  }
  return { section, session, metadata, refresh, limit, cursor };
}

const mediaParams = (input) => parse('media', input);
const spotifyParams = (input) => parse('spotify', input);
const obsParams = (input) => parse('obs', input);

function timestamped(now, section, status, sourceAt, value) {
  const at = sampleTime(sourceAt, now);
  return { version: VERSION, section, status, sampledAt: now, sourceSampledAt: at, ageMs: at === null ? null : Math.max(0, now - at), ...value };
}

function page(items, params) {
  const { section, limit, metadata, cursor } = params;
  const ids = items.map((entry, index) => entry.id ?? index);
  const prefix = createHash('sha256').update(JSON.stringify([section, metadata, limit, ids])).digest('hex').slice(0, 24) + '.';
  const offset = cursor === undefined ? 0 : cursor.startsWith(prefix) ? Number(cursor.slice(prefix.length)) : -1;
  if (offset < 0 || offset > items.length || offset % limit !== 0) throw new SnapshotRequestError('The media cursor is unavailable for this view or options.');
  return { rows: items.slice(offset, offset + limit), ...(offset + limit < items.length ? { nextCursor: prefix + (offset + limit) } : {}) };
}

function windowSessions(value) {
  const rows = new Map();
  for (const item of Array.isArray(value) ? value.slice(0, 128) : []) {
    if (valid(item?.id, WINDOWS_ID) && !rows.has(item.id)) rows.set(item.id,
      { id: item.id, source: pick(item.source, MEDIA_KINDS, 'windows'), default: item.isDefault === true });
  }
  return [...rows.values()];
}

function windowsActive(raw, alias, metadata, now) {
  const seekMinMs = timeline(raw.seekMinMs);
  const seekMaxMs = timeline(raw.seekMaxMs);
  const seek = seekMinMs !== null && seekMaxMs !== null && seekMinMs < seekMaxMs;
  return { id: valid(raw.sessionId, WINDOWS_ID) ? alias(raw.sessionId) : null,
    state: pick(raw.playback, PLAYBACK_STATES, 'unknown'), source: pick(raw.source, MEDIA_KINDS, 'windows'),
    durationMs: timeline(raw.durationMs), positionMs: timeline(raw.positionMs), positionUpdatedAt: sampleTime(raw.positionUpdatedAt, now) || null,
    rate: Number.isFinite(raw.rate) && raw.rate > 0 && raw.rate <= 16 ? raw.rate : null,
    seekMinMs: seek ? seekMinMs : null, seekMaxMs: seek ? seekMaxMs : null,
    capabilities: { play: raw.canPlay === true, pause: raw.canPause === true, toggle: raw.canToggle === true, seek,
      previous: raw.canPrevious === true, next: raw.canNext === true },
    ...(metadata ? { metadata: { title: textValue(raw.title), artist: textValue(raw.artist), album: textValue(raw.album) } } : {}) };
}

const itemKind = (item) => /^spotify:(track|episode):[a-z0-9]{22}$/i.exec(typeof item?.uri === 'string' ? item.uri : '')?.[1]?.toLowerCase() ?? 'unknown';
const music = (item) => ({ title: textValue(item?.title), creator: textValue(item?.creator) });

class AgentMediaReader {
  constructor({ windows, spotify, obs, now = Date.now, aliasKey = randomBytes(32) }) {
    this.windows = windows;
    this.spotify = spotify;
    this.obs = obs;
    this.now = now;
    this.aliasKey = aliasKey;
    this.sessions = [];
  }

  alias(owner, kind, value) {
    return `${kind}-${createHmac('sha256', this.aliasKey).update(JSON.stringify([owner, kind, value])).digest('hex').slice(0, 24)}`;
  }

  resolveWindows(owner, session) {
    const now = this.now();
    const matches = (id) => this.alias(owner, 'media-session', id) === session;
    const listed = now - this.sessionsAt <= WINDOWS_SELECTION_MS ? this.sessions.find(({ id }) => matches(id)) : undefined;
    if (listed) return { id: listed.id, selectionId: listed.id };
    if (this.defaultSession && now - this.defaultSession.at <= WINDOWS_SELECTION_MS && matches(this.defaultSession.id)) {
      return { id: this.defaultSession.id };
    }
    return undefined;
  }

  spotifyControl(owner, target) {
    if (!target || !valid(target.device, SPOTIFY_DEVICE) || (!target.canPlay && !target.canPause)) return undefined;
    const { generation, device, item, context, stamp, playing, canPlay, canPause } = target;
    return { revision: this.alias(owner, 'spotify-playback', [generation, device, item, context, stamp, playing, canPlay, canPause]),
      device: this.alias(owner, 'spotify-device', device), capabilities: { play: canPlay, pause: canPause } };
  }

  async windowsState(params, owner) {
    const { section, session, metadata } = params;
    const alias = (id) => this.alias(owner, 'media-session', id);
    const current = this.now();
    const known = session !== undefined ? this.resolveWindows(owner, session) : undefined;
    if (session && !known) return timestamped(current, section, 'missing', undefined, { active: null });
    let raw;
    try { raw = await this.windows(known?.selectionId, { metadata }); } catch {}
    const now = this.now();
    let status = pick(raw?.status, MEDIA_STATES, 'unavailable');
    if (known && status === 'ready' && raw.sessionId !== known.id) status = 'missing';
    if (!known?.selectionId && status !== 'busy') {
      this.defaultSession = status === 'ready' && valid(raw?.sessionId, WINDOWS_ID) ? { id: raw.sessionId, at: now } : undefined;
    }
    if (['ready', 'empty', 'missing'].includes(status)) {
      this.sessions = windowSessions(raw.sessions);
      this.sessionsAt = now;
    } else if (status !== 'busy') {
      this.sessions = [];
      this.sessionsAt = undefined;
    }
    if (section === 'active') return timestamped(now, section, status, raw ? now : undefined,
      { active: status === 'ready' ? windowsActive(raw, alias, metadata, now) : null });
    // Busy and unavailable reads never re-publish a cached session list.
    const listed = ['ready', 'empty'].includes(status) ? this.sessions.map((item) => ({ ...item, id: alias(item.id) })) : [];
    const { rows, ...navigation } = page(listed, params);
    return timestamped(now, section, ['ready', 'empty'].includes(status) ? listed.length ? 'ready' : 'empty' : status, raw ? now : undefined,
      { sessions: rows, ...navigation });
  }

  async spotifyState(params, owner) {
    const { section, metadata, refresh } = params;
    let raw;
    try { raw = await this.spotify({ refresh }); } catch {}
    const now = this.now();
    const accountStatus = pick(raw?.status, ACCOUNT_STATES, 'unavailable');
    const account = accountStatus === 'connected' ? raw : null;
    const observed = account?.[section];
    const sampledAt = sampleTime(account?.sampledAt, now);
    const dataState = pick(observed?.state, SPOTIFY_STATES, 'unavailable');
    const status = dataState === 'ready' && (account.stale === true || sampledAt === null || now - sampledAt >= 15_000) ? 'stale' : dataState;
    const show = metadata && status === 'ready';
    const reply = (data, value = status) => timestamped(now, section, value, sampledAt, { accountStatus, ...data });
    if (section === 'playback') {
      const control = status === 'ready' && this.spotifyControl(owner, account.controlTarget);
      const playback = dataState !== 'ready' ? null : { hasItem: record(observed.item), kind: itemKind(observed.item),
        playing: flag(observed.playing), positionMs: timeline(observed.positionMs), durationMs: timeline(observed.durationMs),
        ...(control ? { control } : {}),
        ...(show && record(observed.item) ? { metadata: music(observed.item) } : {}) };
      return reply({ playback });
    }
    const items = dataState === 'ready' && Array.isArray(observed.items) ? observed.items.slice(0, section === 'queue' ? 20 : 32).filter(record) : [];
    const list = section === 'devices' ? items.map((item) => ({
      id: valid(item.id, SPOTIFY_DEVICE) ? this.alias(owner, 'spotify-device', item.id) : null,
      active: item.active === true, restricted: item.restricted === true, ...(show ? { name: textValue(item.name) } : {}),
    })) : items.map((item, position) => ({ id: this.alias(owner, 'spotify-queue', [position, typeof item.uri === 'string' ? item.uri : null, sampledAt]),
      kind: itemKind(item), position: position + 1, ...(show ? { metadata: music(item) } : {}) }));
    const { rows, ...navigation } = page(list, params);
    return reply({ [section]: rows, ...navigation }, status === 'ready' && !list.length ? 'empty' : status);
  }

  obsState(params, owner) {
    const { section, metadata } = params;
    let view;
    try { view = this.obs(); } catch {}
    const now = this.now();
    const status = pick(view?.status, OBS_STATES, 'unavailable');
    const generation = integer(view?.generation);
    const canReconnect = view?.canReconnect === true;
    const reply = (value) => timestamped(now, section, status, view?.sampledAt, { generation, canReconnect, ...value });
    const connected = status === 'connected';
    const scoped = (kind, ...values) => this.alias(owner, kind, [generation, ...values]);
    const scene = (name) => named(name) ? { id: scoped('obs-scene', name), ...(metadata ? { name: textValue(name) } : {}) } : null;
    const sourceScene = connected ? scene(view.sourceScene) : null;
    if (section === 'state') {
      const output = (value) => typeof value?.active === 'boolean'
        ? { active: value.active, phase: pick(value.phase, OBS_PHASES, null) } : null;
      const recording = output(view?.recording);
      return reply({ state: connected ? { studio: view.studio === true, sourceScene,
        program: scene(view.program), preview: scene(view.preview),
        recording: recording && { ...recording, paused: view.recording.paused === true }, streaming: output(view.streaming) } : null });
    }
    if (section === 'scenes') {
      const values = connected && Array.isArray(view.scenes) ? view.scenes : [];
      const { rows, ...navigation } = page([...new Set(values.slice(0, DISCOVERY_LIMIT))].map(scene).filter(Boolean), params);
      return reply({ scenes: rows, ...navigation, truncated: values.length > DISCOVERY_LIMIT });
    }
    const values = sourceScene && Array.isArray(view.items) ? view.items : [];
    const items = values.slice(0, DISCOVERY_LIMIT).filter((item) => integer(item?.id) !== null && named(item.name));
    const identify = (item) => scoped('obs-source', view.sourceScene, item.id, item.name);
    const detail = view?.detail;
    const selected = detail && items.find((item) => item.id === detail.id && item.name === detail.name);
    const selectedSource = selected ? { id: identify(selected), muted: flag(detail.muted),
      volumePercent: Number.isFinite(detail.volume) && detail.volume >= 0 && detail.volume <= 20 ? Math.round(detail.volume * 100) : null,
      filters: (Array.isArray(detail.filters) ? detail.filters : []).slice(0, ROW_LIMIT).filter((filter) => named(filter?.name)).map((filter) => ({
        id: scoped('obs-filter', view.sourceScene, selected.id, filter.name), enabled: flag(filter.enabled), ...(metadata ? { name: textValue(filter.name) } : {}),
      })) } : null;
    const { rows, ...navigation } = page(items.map((item) => ({
      id: identify(item), visible: flag(item.visible), ...(metadata ? { name: textValue(item.name) } : {}),
    })), params);
    return reply({ sourceScene, selectedSource, sources: rows, ...navigation, truncated: values.length > DISCOVERY_LIMIT });
  }
}

module.exports = { AgentMediaReader, SPOTIFY_REVISION, mediaInput, mediaOutput, mediaParams, spotifyInput, spotifyOutput, spotifyParams, obsInput, obsOutput, obsParams };
