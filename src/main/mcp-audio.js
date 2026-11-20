// @ts-check
'use strict';

const { createHash, createHmac, randomBytes } = require('node:crypto');
const { SnapshotRequestError } = require('./mcp-snapshot');

const VERSION = 1;
const MAX_ROWS = 32;
const SAMPLE_MAX_AGE = 5_000;
const LIST_INTERVAL = 1_000;
const PEAK_INTERVAL = 500;
const INPUT = /^input-[a-f0-9]{24}$/;
const ALIAS = /^(?:input|output|app)-[a-f0-9]{24}$/;
const APP_REVISION = /^app-rev-[a-f0-9]{24}$/;
const SESSION_STAMP = /^[a-f0-9]{64}$/;
const CURSOR = /^[a-f0-9]{24}\.\d{1,5}$/;
const TARGETS = ['output', 'input', 'both'];
const ENDPOINT_STATUS = ['live', 'stale', 'unavailable'];
const SECTIONS = { state: ['limit', 'cursor'], playback: ['limit', 'cursor'], mixer: ['limit', 'cursor', 'pinnedOnly'], peaks: ['target', 'input'] };
const DEVICE_STATES = ['active', 'disabled', 'disconnected', 'unavailable'];
const MUTE_STATES = ['muted', 'unmuted', 'mixed', 'unknown', 'unavailable'];

const enumeration = (values) => ({ enum: values });
const boolean = { type: 'boolean' };
const count = { type: 'integer', minimum: 0 };
const aliasType = { type: 'string', pattern: ALIAS.source };
const levelType = { ...count, maximum: 100 };
const nullable = (value) => ({ anyOf: [value, { type: 'null' }] });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const rows = (items) => ({ type: 'array', maxItems: MAX_ROWS, items });
const endpoint = object({ id: aliasType, status: enumeration(ENDPOINT_STATUS), level: nullable(levelType), muted: nullable(boolean) });
const group = object({ defaultId: nullable(aliasType), muteState: enumeration(MUTE_STATES), activeCount: count,
  mutedCount: count, unmutedCount: count, unknownCount: count });
const device = object({ id: aliasType, state: enumeration(DEVICE_STATES), default: boolean });
const mixerProperties = { id: aliasType, status: enumeration([...ENDPOINT_STATUS, 'offline']), pinned: boolean, canPin: boolean,
  online: nullable(boolean), active: nullable(boolean), count: nullable(count), level: nullable(levelType), muted: nullable(boolean),
  mixedLevel: nullable(boolean), mixedMute: nullable(boolean) };
const app = object({ ...mixerProperties, revision: { type: 'string', pattern: APP_REVISION.source } }, Object.keys(mixerProperties));
const peak = object({ id: nullable(aliasType), status: enumeration([...ENDPOINT_STATUS, 'muted', 'throttled']),
  value: nullable({ type: 'number', minimum: 0, maximum: 1 }) });
const audioInput = object({ section: enumeration(Object.keys(SECTIONS)), limit: { ...count, minimum: 1, maximum: MAX_ROWS },
  cursor: { type: 'string', pattern: CURSOR.source }, pinnedOnly: boolean, target: enumeration(TARGETS),
  input: { type: 'string', pattern: INPUT.source } }, ['section']);
const audioOutput = object({ version: { const: VERSION }, section: audioInput.properties.section,
  status: enumeration(['ready', 'empty', 'unavailable', 'stale', 'throttled']), sampledAt: count, ageMs: nullable(count),
  sourceSampledAt: nullable(count), nextCursor: audioInput.properties.cursor,
  output: nullable(endpoint), inputs: rows(endpoint), capture: group, devices: rows(device), defaultOutput: nullable(aliasType), apps: rows(app),
  peaks: object({ output: peak, input: peak }, []), retryAfterMs: count }, ['version', 'section', 'status', 'sampledAt', 'ageMs', 'sourceSampledAt']);

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = (value) => typeof value === 'string' && /^\P{Cc}{1,512}$/u.test(value);
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
const flag = (value) => typeof value === 'boolean' ? value : null;
const inList = (value, choices, fallback) => choices.includes(value) ? value : fallback;

function audioParams(input) {
  if (!record(input) || typeof input.section !== 'string' || !Object.hasOwn(SECTIONS, input.section) ||
      Object.keys(input).some((key) => key !== 'section' && !SECTIONS[input.section].includes(key))) {
    throw new Error('Choose an audio section and its supported options.');
  }
  const { section, limit = 16, cursor, pinnedOnly = false, target = 'both', input: selection } = input;
  if (integer(limit, 1, MAX_ROWS) === null || (cursor !== undefined && (typeof cursor !== 'string' || !CURSOR.test(cursor))) ||
      typeof pinnedOnly !== 'boolean' || !TARGETS.includes(target) ||
      (selection !== undefined && (target === 'output' || typeof selection !== 'string' || !INPUT.test(selection)))) {
    throw new Error('Choose a valid audio filter, microphone alias or page limit.');
  }
  return { section, limit, cursor, pinnedOnly, target, input: selection };
}

function summary(rows, params) {
  const { section, pinnedOnly, limit, cursor } = params;
  const prefix = createHash('sha256').update(JSON.stringify([section, pinnedOnly, limit, rows.map(({ id }) => id)])).digest('hex').slice(0, 24) + '.';
  const offset = cursor === undefined ? 0 : cursor.startsWith(prefix) ? Number(cursor.slice(prefix.length)) : -1;
  if (offset < 0 || offset > rows.length || offset % limit !== 0) throw new SnapshotRequestError('The audio cursor is unavailable for this filter or sample.');
  return { rows: rows.slice(offset, offset + limit), ...(offset + limit < rows.length ? { nextCursor: prefix + (offset + limit) } : {}) };
}

function normalizedRows(items, fields) {
  const byId = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!validId(item?.id) || byId.has(item.id)) continue;
    byId.set(item.id, { id: item.id, ...fields(item) });
  }
  return [...byId.values()];
}

function endpointFields(item) {
  return { level: integer(item.level, 0, 100), muted: flag(item.muted) };
}

function mixerFields(item) {
  return { ...endpointFields(item), pinned: item.pinned === true, canPin: item.canPin === true, online: item.online === true,
    active: flag(item.active), count: integer(item.count), mixedLevel: flag(item.mixedLevel), mixedMute: flag(item.mixedMute),
    revision: item.binding?.revision };
}

function describeCapture(inputs, defaultId) {
  const mutedCount = inputs.filter(({ muted }) => muted === true).length;
  const unmutedCount = inputs.filter(({ muted }) => muted === false).length;
  const activeCount = inputs.length;
  const unknownCount = activeCount - mutedCount - unmutedCount;
  const muteState = !activeCount ? 'unavailable' : mutedCount && unmutedCount ? 'mixed'
    : unknownCount ? 'unknown' : mutedCount ? 'muted' : 'unmuted';
  return { defaultId, muteState, activeCount, mutedCount, unmutedCount, unknownCount };
}

class AgentAudioReader {
  constructor({ readState, listPlayback, listApps, pinStatus, readPeaks, now = Date.now, monotonic = () => performance.now(),
    aliasKey = randomBytes(32) }) {
    this.readState = readState;
    this.listPlayback = listPlayback;
    this.listApps = listApps;
    this.pinStatus = pinStatus;
    this.readPeaks = readPeaks;
    this.now = now;
    this.monotonic = monotonic;
    this.aliasKey = aliasKey;
    this.collections = {};
  }

  alias(owner, kind, id) {
    if (!id) return null;
    const data = JSON.stringify([owner, kind, id]);
    return `${kind}-${createHmac('sha256', this.aliasKey).update(data).digest('hex').slice(0, 24)}`;
  }

  appRevision(owner, id, stamp) {
    return typeof stamp === 'string' && SESSION_STAMP.test(stamp) ? this.alias(owner, 'app-rev', [id, stamp]) : undefined;
  }

  state(now) {
    let state;
    try { state = this.readState(); } catch {}
    const at = integer(state?.sampledAt, 0, now + 1000);
    const output = validId(state?.output?.id) ? { id: state.output.id, ...endpointFields(state.output) } : null;
    const inputs = normalizedRows(state?.inputs, endpointFields);
    const defaultInput = inputs.find(({ id }) => id === state?.microphone?.id)?.id ?? null;
    return { at, output, inputs, defaultInput, status: at === null ? 'unavailable' : now - at > SAMPLE_MAX_AGE ? 'stale'
      : output || inputs.length ? 'ready' : 'empty' };
  }

  collection(name, read, fallback) {
    const now = this.monotonic();
    const previous = this.collections[name];
    if (previous && now - previous.attemptedAt < LIST_INTERVAL) return previous;
    let next;
    try { next = { ...read(), at: this.now(), stale: false }; }
    catch { next = previous?.at != null ? { ...previous, stale: true } : { ...fallback(), at: null, stale: false }; }
    return this.collections[name] = { ...next, attemptedAt: now };
  }

  snapshot(params, owner) {
    const { section } = params;
    const sampledAt = this.now();
    const withTime = (status, at, data) => ({ version: VERSION, section, status, sampledAt, sourceSampledAt: at,
      ageMs: at === null ? null : Math.max(0, sampledAt - at), ...data });
    const alias = (kind, id) => this.alias(owner, kind, id);
    if (section === 'state') {
      const state = this.state(sampledAt);
      const describe = (kind, row) => ({ ...row, id: alias(kind, row.id), status: row.level === null && row.muted === null ? 'unavailable'
        : inList(state.status, ['stale', 'unavailable'], 'live') });
      const inputRows = state.inputs.map((row) => describe('input', row));
      const defaultId = alias('input', state.defaultInput);
      inputRows.sort((a, b) => Number(b.id === defaultId) - Number(a.id === defaultId) || a.id.localeCompare(b.id));
      const { rows: inputs, ...navigation } = summary(inputRows, params);
      return withTime(state.status, state.at, { ...navigation, inputs,
        output: state.output && describe('output', state.output), capture: describeCapture(state.inputs, defaultId) });
    }
    if (section === 'peaks') return this.meter(params, alias, withTime, sampledAt);
    if (section === 'playback') {
      const list = this.collection('playback', () => {
        const snapshot = this.listPlayback();
        if (!Array.isArray(snapshot?.devices)) throw new Error('Playback unavailable');
        return { items: normalizedRows(snapshot.devices, ({ state }) => ({ state: inList(state, DEVICE_STATES, 'unavailable') })),
          defaultId: snapshot.defaultId };
      }, () => ({ items: [] }));
      const devices = list.items.map(({ id, state }) => ({ id: alias('output', id), state, default: id === list.defaultId && state === 'active' }));
      devices.sort((a, b) => Number(b.default) - Number(a.default) || a.id.localeCompare(b.id));
      const { rows, ...navigation } = summary(devices, params);
      return withTime(this.collectionStatus(list, devices.length), list.at, { ...navigation, devices: rows,
        defaultOutput: devices.find((row) => row.default)?.id ?? null });
    }
    const list = this.collection('mixer', () => {
      const apps = this.listApps();
      if (!Array.isArray(apps)) throw new Error('Mixer unavailable');
      return { items: normalizedRows(this.pinStatus(apps), mixerFields) };
    }, () => {
      try { return { items: normalizedRows(this.pinStatus([]), mixerFields) }; }
      catch { return { items: [] }; }
    });
    const apps = list.items.filter((row) => !params.pinnedOnly || row.pinned).map(({ revision: stamp, ...row }) => {
      const revision = !list.stale && row.online ? this.appRevision(owner, row.id, stamp) : undefined;
      return { ...row, id: alias('app', row.id), online: list.stale || list.at === null ? null : row.online,
        status: list.stale ? 'stale' : list.at === null ? 'unavailable' : row.online ? 'live' : 'offline',
        ...(revision ? { revision } : {}) };
    });
    apps.sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.id.localeCompare(b.id));
    const { rows, ...navigation } = summary(apps, params);
    return withTime(this.collectionStatus(list, apps.length), list.at, { ...navigation, apps: rows });
  }

  collectionStatus(list, count) {
    return list.stale && list.at !== null ? 'stale' : list.at === null ? 'unavailable' : count ? 'ready' : 'empty';
  }

  meter({ target, input }, alias, withTime, now) {
    const state = this.state(now);
    const outputId = target !== 'input' ? state.output?.id : undefined;
    const inputId = target === 'output' ? undefined : input === undefined ? state.defaultInput :
      state.inputs.find(({ id }) => alias('input', id) === input)?.id;
    const requested = Object.fromEntries([['output', outputId], ['input', inputId]].filter(([kind]) => target === 'both' || target === kind));
    const empty = (status) => Object.fromEntries(Object.entries(requested).map(([kind, id]) => [kind, { id: alias(kind, id), status, value: null }]));
    if (state.status !== 'ready' || (!outputId && !inputId)) {
      const status = state.status === 'stale' ? 'stale' : 'unavailable';
      return withTime(status, state.at, { peaks: empty(status) });
    }
    const budget = this.monotonic();
    if (this.lastPeakAt !== undefined && budget - this.lastPeakAt < PEAK_INTERVAL) {
      return withTime('throttled', state.at, { peaks: empty('throttled'), retryAfterMs: Math.ceil(PEAK_INTERVAL - (budget - this.lastPeakAt)) });
    }
    this.lastPeakAt = budget;
    let observed;
    try { observed = this.readPeaks({ outputId, inputId, requireDefaultInput: Boolean(inputId && input === undefined) }); } catch {}
    const peaks = empty('unavailable');
    for (const [kind, id] of Object.entries(requested)) {
      const reading = observed?.[kind];
      if (!id || reading?.id !== id) continue;
      if (reading.status === 'muted') peaks[kind].status = 'muted';
      if (reading.status === 'live' && Number.isFinite(reading.value) && reading.value >= 0 && reading.value <= 1) {
        peaks[kind] = { ...peaks[kind], status: 'live', value: reading.value };
      }
    }
    const someKnown = Object.values(peaks).some(({ status }) => status === 'live' || status === 'muted');
    return withTime(someKnown ? 'ready' : 'unavailable', state.at, { peaks });
  }
}

module.exports = { AgentAudioReader, audioInput, audioOutput, audioParams };
