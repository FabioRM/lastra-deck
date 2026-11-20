// @ts-check
'use strict';

const { createHash } = require('node:crypto');
const { SnapshotRequestError } = require('./mcp-snapshot');
const { GROUPS, HISTORY_WINDOW_MS } = require('./stats');
const { ALERT_REVISION, alertAlias, alertSource, alertRevision } = require('./mcp-alert-identity');
const { SERVICE_KINDS } = require('./service-probes');
const { WATCHLIST_PIN_IDS: PIN_IDS } = require('./monitoring-watchlist');

const VERSION = 1;
const ROW_LIMIT = 40;
const POINT_LIMIT = 120;
const START = 0;
const END = 8_640_000_000_000_000;
const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/i;
const METRIC_STATUSES = ['live', 'stale', 'unavailable'];
const SERVICE_STATUSES = ['waiting', 'up', 'retrying', 'down'];
const ALERT_STATUSES = ['active', 'recovered', 'retired'];
const THRESHOLD_STATUSES = ['active', 'pending', 'normal', 'unavailable'];
const USAGE_STATUSES = ['ready', 'measuring', 'inactive', 'unavailable'];
const POWER_SOURCES = ['ac', 'battery', 'unknown'];
const UNITS = ['%', '°C', 'GiB', 'MiB', 'MiB/s', 'MT/s', 'MHz', 'Hz', 'FPS', 'ms', 'W', 'RPM', 'ns'];
const SECTIONS = {
  metrics: ['group', 'limit', 'cursor'], history: ['metric', 'from', 'to', 'limit'], compare: ['metric', 'windows'],
  services: ['id', 'limit', 'cursor'], alerts: ['status', 'limit', 'cursor'], thresholds: ['limit', 'cursor'],
  watchlist: [], power: [], usage: [], diagnostic: [],
};
const FIXED_METRICS = {
  cpu: ['cpu', 'CPU load'], cpuTemp: ['cpu', 'CPU temperature'], cpuClock: ['cpu', 'Processor frequency'],
  gpu: ['gpu', 'GPU load'], gpuTemp: ['gpu', 'GPU temperature'], ram: ['memory', 'RAM usage'],
  ramUsed: ['memory', 'RAM used'], ramTotal: ['memory', 'RAM capacity'], refresh: ['display', 'Display refresh rate'],
  fps: ['frames', 'Present rate'], frameMs: ['frames', 'Mean frame time'], frame95: ['frames', '95th percentile frame time'],
  fpsMin: ['frames', 'Slowest frame rate'], 'volume-info': ['storage', 'Volume capacity'],
  'power:cpu': ['power', 'CPU load'], 'power:gpu': ['power', 'GPU load'],
  cpuPower: ['power', 'CPU package power'], gpuPower: ['power', 'GPU measured power'],
};
const SOURCES = { Windows: 'windows', LibreHardwareMonitor: 'hardware', 'LibreHardwareMonitor HTTP': 'hardware-http',
  PresentMon: 'presentmon', 'Sample data': 'sample' };
const MEASURES = { '%': 'load', '°C': 'temperature', GiB: 'capacity', MiB: 'memory', 'MiB/s': 'throughput', 'MT/s': 'speed',
  MHz: 'clock', Hz: 'refresh rate', FPS: 'frame rate', ms: 'latency', W: 'power', RPM: 'fan speed', ns: 'timing' };
const VOLUME_LABELS = { busy: 'Disk active time', capacity: 'Volume capacity', free: 'Free space', read: 'Disk read rate', write: 'Disk write rate' };

const enumeration = (values) => ({ enum: values });
const text = { type: 'string' };
const number = { type: 'number' };
const count = { type: 'integer', minimum: 0 };
const boolean = { type: 'boolean' };
const nullable = (value) => ({ anyOf: [value, { type: 'null' }] });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const array = (items, maxItems) => ({ type: 'array', items, maxItems });
const time = { type: 'integer', minimum: START, maximum: END };
const rangeSchema = object({ from: time, to: time });
const telemetryInput = object({ section: enumeration(Object.keys(SECTIONS)), group: enumeration(Object.keys(GROUPS)),
  metric: text, id: text, status: enumeration(ALERT_STATUSES), from: time, to: time,
  windows: { ...array(rangeSchema, 2), minItems: 2 }, limit: { type: 'integer', minimum: 1, maximum: POINT_LIMIT }, cursor: text }, ['section']);
const metricSchema = object({ id: text, group: enumeration(Object.keys(GROUPS)), name: text, unit: enumeration(UNITS),
  value: nullable(number), source: enumeration([...Object.values(SOURCES), 'unknown']), status: enumeration(METRIC_STATUSES),
  sampledAt: nullable(time), ageMs: nullable(count) });
const pointSchema = object({ at: time, value: nullable(number) });
const aggregateSchema = object({ from: time, to: time, count, minimum: nullable(number), maximum: nullable(number), average: nullable(number) });
const serviceSchema = object({ id: text, kind: enumeration([...SERVICE_KINDS, 'unknown']),
  status: enumeration([...SERVICE_STATUSES, 'unavailable']), lastCheckedAt: nullable(time), latencyMs: nullable(number), intervalMs: nullable(count) });
const alertSchema = object({ id: text, source: enumeration(['service', 'threshold', 'unknown']), status: enumeration(ALERT_STATUSES),
  target: nullable(text), openedAt: nullable(time), updatedAt: nullable(time), acknowledgedAt: nullable(time), occurrences: count,
  revision: { ...text, pattern: ALERT_REVISION.source } }, ['id', 'source', 'status', 'target', 'openedAt', 'updatedAt', 'acknowledgedAt', 'occurrences']);
const thresholdSchema = object({ id: text, metric: text, unit: enumeration(UNITS), direction: enumeration(['above', 'below']),
  limit: number, holdSeconds: count, status: enumeration(THRESHOLD_STATUSES), value: nullable(number), sampledAt: nullable(time) });
const watchlistStates = [...new Set([...METRIC_STATUSES, ...USAGE_STATUSES, ...SERVICE_STATUSES])];
const watchlistSchema = object({ id: text, kind: enumeration(['hardware', 'app', 'service']), status: enumeration(watchlistStates), value: nullable(number),
  unit: nullable(enumeration([...UNITS, 'containers'])), sampledAt: nullable(time), partial: boolean });
const usageRow = object({ id: enumeration(['electron', 'hardware', 'media']), status: enumeration(USAGE_STATUSES),
  cpuStatus: enumeration(USAGE_STATUSES), count, cpuPercent: nullable(number), workingSetMiB: nullable(number) });
const usageSchema = object({ sampledAt: nullable(time), ageMs: nullable(count), intervalMs: nullable(count), rows: array(usageRow, 3),
  embed: nullable(object({ active: boolean, requests: nullable(count), limit: nullable(count), blocked: nullable(count), total: nullable(count) })) });
const powerSchema = object({ system: object({ status: enumeration(['ready', 'unsupported', 'unavailable']), source: enumeration(POWER_SOURCES),
  battery: nullable(boolean), percent: nullable(number), charging: nullable(boolean), remainingSeconds: nullable(count), saver: nullable(boolean),
  watts: nullable(number) }, ['status', 'source', 'battery', 'percent', 'charging', 'remainingSeconds', 'saver']),
ups: object({ status: enumeration(['ready', 'stale', 'disabled', 'invalid', 'unavailable']), source: enumeration(POWER_SOURCES),
  percent: nullable(number), remainingSeconds: nullable(count), sampledAt: nullable(time), ageMs: nullable(count), watts: nullable(number) },
  ['status', 'source', 'percent', 'remainingSeconds', 'sampledAt', 'ageMs']),
transitions: array(object({ at: time, source: enumeration(['ac', 'battery']) }), 5) });
const diagnosticSchema = object({ metrics: array(metricSchema, 7), power: powerSchema, usage: usageSchema,
  services: object({ total: count, up: count, down: count, waiting: count, retrying: count, configurationError: boolean }),
  alerts: object({ active: count, unacknowledged: count, storageWarning: boolean }),
  thresholds: object({ total: count, active: count, configurationError: boolean }), watchlist: array(watchlistSchema, 6) });
const telemetryOutput = object({ version: { const: VERSION }, section: telemetryInput.properties.section,
  sampledAt: time, status: enumeration(['ready', 'empty', 'unavailable']), nextCursor: text, metrics: array(metricSchema, ROW_LIMIT),
  metric: metricSchema, points: array(pointSchema, POINT_LIMIT), range: rangeSchema, retentionMs: count, totalPoints: count,
  windows: array(aggregateSchema, 2), averageDelta: nullable(number),
  services: array(serviceSchema, ROW_LIMIT), serviceHistory: array(object({ at: time, ok: boolean }), POINT_LIMIT),
  alerts: array(alertSchema, ROW_LIMIT), thresholds: array(thresholdSchema, ROW_LIMIT), warning: boolean,
  watchlist: array(watchlistSchema, 6), usage: usageSchema, power: powerSchema, diagnostic: diagnosticSchema }, ['version', 'section', 'sampledAt', 'status']);

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const allowed = (value, choices, fallback) => choices.includes(value) ? value : fallback;
const numeric = (value, min = -1e15, max = 1e15) => Number.isFinite(value) && min <= value && value <= max ? value : null;
const cardinal = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && min <= value && value <= max ? value : null;
const flag = (value) => typeof value === 'boolean' ? value : null;
const records = (value) => Array.isArray(value) ? value.filter(record) : [];
const alias = (kind, id) => `${kind}-${createHash('sha256').update(kind + '\0' + id).digest('hex').slice(0, 20)}`;
const validId = (value) => typeof value === 'string' && ID.test(value);
const sampleTime = (value, now) => cardinal(value, START, Math.min(END, now + 30_000));
const age = (at, now) => at === null ? null : Math.max(0, now - at);

function checkedRange(value) {
  if (!record(value) || Object.keys(value).length !== 2 || cardinal(value.from, START, END) === null ||
      cardinal(value.to, START, END) === null || value.from >= value.to || value.to - value.from > HISTORY_WINDOW_MS) {
    throw new Error('Choose valid from and to timestamps up to 60 seconds apart.');
  }
  return { from: value.from, to: value.to };
}

function telemetryParams(input) {
  if (!record(input) || typeof input.section !== 'string' || !Object.hasOwn(SECTIONS, input.section) ||
      Object.keys(input).some((key) => key !== 'section' && !SECTIONS[input.section].includes(key))) {
    throw new Error('Choose a telemetry section and its supported parameters.');
  }
  const { section, group, metric, id, status, cursor, limit = section === 'history' ? POINT_LIMIT : 20 } = input;
  if ((group !== undefined && (typeof group !== 'string' || !Object.hasOwn(GROUPS, group))) ||
      (status !== undefined && !ALERT_STATUSES.includes(status)) ||
      (id !== undefined && (typeof id !== 'string' || !/^service-[a-f0-9]{20}$/.test(id))) ||
      (['history', 'compare'].includes(section) && !validId(metric)) ||
      (cursor !== undefined && (typeof cursor !== 'string' || !/^[a-f0-9]{24}\.\d{1,4}$/.test(cursor))) ||
      cardinal(limit, 1, section === 'history' ? POINT_LIMIT : ROW_LIMIT) === null) {
    throw new Error('Choose a supported telemetry metric, filter, and result limit.');
  }
  const params = { section, group, metric, id, status, cursor, limit };
  if (section === 'history' && (input.from !== undefined || input.to !== undefined)) {
    params.range = checkedRange({ from: input.from, to: input.to });
  }
  if (section === 'compare') {
    if (!Array.isArray(input.windows) || input.windows.length !== 2) throw new Error('Supply two windows for comparison.');
    params.windows = input.windows.map(checkedRange);
  }
  return params;
}

function pageRows(rows, { section, group, status, limit, cursor }) {
  // Bind cursors to the requested filter and the current ordered set of available entries.
  const prefix = createHash('sha256').update(JSON.stringify([section, group, status, limit, rows.map(({ id }) => id)])).digest('hex').slice(0, 24) + '.';
  const offset = cursor === undefined ? 0 : cursor.startsWith(prefix) ? Number(cursor.slice(prefix.length)) : -1;
  if (offset < 0 || offset > rows.length || offset % limit !== 0) throw new SnapshotRequestError('The telemetry cursor is unavailable for this filter or sample.');
  return { rows: rows.slice(offset, offset + limit), ...(offset + limit < rows.length ? { nextCursor: prefix + (offset + limit) } : {}) };
}

function metricReadings(snapshot, now) {
  const byId = new Map();
  for (const item of [...records(snapshot?.readings), ...records(snapshot?.overview)].slice(0, 400)) {
    if (typeof item.id !== 'string' || item.id.length > 200 || !UNITS.includes(item.unit) || typeof item.group !== 'string' ||
        !Object.hasOwn(GROUPS, item.group)) continue;
    const fixed = Object.hasOwn(FIXED_METRICS, item.id) ? FIXED_METRICS[item.id] : null;
    const id = fixed ? item.id : alias('metric', item.id);
    if (byId.has(id)) continue;
    const group = fixed?.[0] ?? item.group;
    const volumeType = item.id.startsWith('volume:') ? item.id.split(':').at(-1) : '';
    const name = fixed?.[1] ?? (Object.hasOwn(VOLUME_LABELS, volumeType) ? VOLUME_LABELS[volumeType] : `${GROUPS[group]} ${MEASURES[item.unit]}`);
    const sampledAt = sampleTime(item.at, now);
    const value = sampledAt === null ? null : numeric(item.value);
    const status = value === null ? 'unavailable' : allowed(item.status, METRIC_STATUSES, 'unavailable');
    const source = typeof item.source === 'string' && Object.hasOwn(SOURCES, item.source) ? SOURCES[item.source] : 'unknown';
    byId.set(id, { metric: { id, name, group, unit: item.unit, value, status, source, sampledAt, ageMs: age(sampledAt, now) },
      points: Array.isArray(item.points) ? item.points : [] });
  }
  return byId;
}

function historyPoints(points, { from, to }, now) {
  const earliest = Math.max(from, now - HISTORY_WINDOW_MS);
  const values = new Map();
  for (const point of points) {
    if (!Array.isArray(point) || cardinal(point[0], earliest, Math.min(to, now)) === null) continue;
    values.set(point[0], numeric(point[1]));
  }
  return [...values].sort(([left], [right]) => left - right).map(([at, value]) => ({ at, value }));
}

function aggregate(points, window, now) {
  const values = historyPoints(points, window, now).flatMap(({ value }) => value === null ? [] : [value]);
  return { ...window, count: values.length, minimum: values.length ? Math.min(...values) : null,
    maximum: values.length ? Math.max(...values) : null,
    average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null };
}

function serviceReads(snapshot, now) {
  return records(snapshot?.checks).flatMap((entry) => validId(entry.id) ? [{
    row: { id: alias('service', entry.id), kind: allowed(entry.kind, SERVICE_KINDS, 'unknown'),
      status: allowed(entry.status, SERVICE_STATUSES, 'unavailable'), lastCheckedAt: sampleTime(entry.latest?.at, now),
      latencyMs: numeric(entry.latest?.latencyMs, 0), intervalMs: cardinal(entry.intervalMs) },
    resultHistory: records(entry.history).slice(-POINT_LIMIT).flatMap(({ ok, at }) => typeof ok === 'boolean' && sampleTime(at, now) !== null ? [{ at, ok }] : []),
  }] : []);
}

function alertReads(snapshot, now, includeRevisions = false) {
  return records(snapshot?.entries).flatMap((entry) => {
    if (typeof entry.id !== 'string' || entry.id.length > 80 || !ALERT_STATUSES.includes(entry.status)) return [];
    const source = alertSource(entry);
    const revision = includeRevisions ? alertRevision(entry) : null;
    return [{ id: alertAlias(entry.id), source, status: entry.status,
      target: source !== 'unknown' && validId(entry.targetId) ? alias(source, entry.targetId) : null,
      openedAt: sampleTime(entry.openedAt, now), updatedAt: sampleTime(entry.updatedAt, now),
      acknowledgedAt: sampleTime(entry.acknowledgedAt, now), occurrences: cardinal(entry.occurrences) ?? 0,
      ...(revision ? { revision } : {}) }];
  });
}

function thresholdReads(snapshot, now) {
  return records(snapshot?.rules).flatMap((entry) => validId(entry.id) && ['cpu', 'gpu', 'ram', 'cpuTemp', 'gpuTemp'].includes(entry.metric) &&
      UNITS.includes(entry.unit) && ['above', 'below'].includes(entry.direction) && numeric(entry.limit, 0) !== null ? [{
    id: alias('threshold', entry.id), metric: entry.metric, unit: entry.unit, direction: entry.direction, limit: entry.limit,
    holdSeconds: cardinal(entry.holdSeconds) ?? 0, status: allowed(entry.state, THRESHOLD_STATUSES, 'unavailable'),
    value: numeric(entry.value), sampledAt: sampleTime(entry.lastAt, now),
  }] : []);
}

function watchlistReads(snapshot, now, readings) {
  return records(snapshot?.tiles).slice(0, 6).flatMap((tile) => {
    if (typeof tile.id !== 'string' || !['hardware', 'app', 'service'].includes(tile.kind)) return [];
    const service = /^service:([a-z0-9_-]{1,40})$/i.exec(tile.id);
    const id = tile.kind === 'service' && service ? alias('service', service[1]) : PIN_IDS.includes(tile.id) ? tile.id : null;
    if (!id) return [];
    if (tile.kind === 'hardware') {
      const measured = readings.get(tile.id.slice('hardware:'.length))?.metric;
      return [{ id, kind: 'hardware', status: measured?.status ?? 'unavailable', value: measured?.value ?? null,
        unit: measured?.unit ?? null, sampledAt: measured?.sampledAt ?? null, partial: false }];
    }
    const sampledAt = sampleTime(tile.sampledAt, now);
    const state = allowed(tile.state, [...SERVICE_STATUSES, ...USAGE_STATUSES], 'unavailable');
    const status = tile.kind === 'app' && state === 'ready' && (sampledAt === null || now - sampledAt > 30_000) ? 'stale' : state;
    const unit = { 'app:lastra-cpu': '%', 'app:lastra-memory': 'MiB', 'app:docker': 'containers' }[id] ?? 'ms';
    return [{ id, kind: tile.kind, status, value: numeric(tile.kind === 'service' ? tile.latencyMs : tile.value, 0),
      unit, sampledAt, partial: tile.partial === true }];
  });
}

function usageRead(snapshot, now) {
  const sampledAt = sampleTime(snapshot?.sampledAt, now);
  const embed = snapshot?.embed;
  return { sampledAt, ageMs: age(sampledAt, now), intervalMs: cardinal(snapshot?.intervalMs),
    rows: records(snapshot?.rows).filter(({ id }) => ['electron', 'hardware', 'media'].includes(id)).slice(0, 3).map((row) => ({
      id: row.id, status: allowed(row.status, USAGE_STATUSES, 'unavailable'), cpuStatus: allowed(row.cpuStatus, USAGE_STATUSES, 'unavailable'),
      count: cardinal(row.count) ?? 0, cpuPercent: numeric(row.cpuPercent, 0, 100), workingSetMiB: numeric(row.workingSetMiB, 0),
    })), embed: record(embed) ? { active: embed.active === true, requests: cardinal(embed.requests), limit: cardinal(embed.limit),
      blocked: cardinal(embed.blocked), total: cardinal(embed.total) } : null };
}

function powerRead(snapshot, now) {
  const system = snapshot?.system ?? {};
  const ups = snapshot?.ups ?? {};
  const sampledAt = sampleTime(ups.sampledAt, now);
  return { system: { status: allowed(system.status, ['ready', 'unsupported', 'unavailable'], 'unavailable'),
    source: allowed(system.source, POWER_SOURCES, 'unknown'), battery: flag(system.battery), percent: numeric(system.percent, 0, 100),
    charging: flag(system.charging), remainingSeconds: cardinal(system.remainingSeconds), saver: flag(system.saver),
    ...(Number.isFinite(system.watts) ? { watts: system.watts } : {}) },
  ups: { status: allowed(ups.status, ['ready', 'stale', 'disabled', 'invalid'], 'unavailable'),
    source: allowed(ups.source, POWER_SOURCES, 'unknown'), percent: numeric(ups.percent, 0, 100),
    remainingSeconds: cardinal(ups.remainingSeconds), sampledAt, ageMs: age(sampledAt, now),
    ...(Number.isFinite(ups.watts) && ups.watts >= 0 ? { watts: ups.watts } : {}) },
  transitions: records(snapshot?.transitions).filter(({ at, source }) => ['ac', 'battery'].includes(source) && sampleTime(at, now) !== null)
    .slice(0, 5).map(({ at, source }) => ({ at, source })) };
}

async function readTelemetry(params, sources, now = Date.now) {
  const sampledAt = now();
  const { section, limit } = params;
  const base = { version: VERSION, section, sampledAt };
  const read = async (name) => {
    try { return await sources[name]?.(); } catch { return undefined; }
  };
  const result = (status, data) => ({ ...base, status, ...data });
  const availability = (source, count) => source ? count === 0 ? 'empty' : 'ready' : 'unavailable';
  const paged = (source, field, rows, extra) => {
    const { rows: data, ...navigation } = pageRows(rows, params);
    return result(availability(source, rows.length), { [field]: data, ...navigation, ...extra });
  };
  switch (section) {
    case 'metrics':
    case 'history':
    case 'compare': {
      const stats = await read('stats');
      const readings = metricReadings(stats, sampledAt);
      if (section === 'metrics') return paged(stats, 'metrics', [...readings.values()].map(({ metric }) => metric)
        .filter(({ group }) => !params.group || group === params.group));
      const selected = readings.get(params.metric);
      if (!selected) return result('unavailable');
      const { metric, points } = selected;
      if (section === 'history') {
        const range = params.range ?? { from: Math.max(0, sampledAt - HISTORY_WINDOW_MS), to: sampledAt };
        const all = historyPoints(points, range, sampledAt);
        return result(availability(stats, all.length), { metric, range, points: all.slice(-limit), totalPoints: all.length,
          retentionMs: HISTORY_WINDOW_MS });
      }
      const windows = params.windows.map((window) => aggregate(points, window, sampledAt));
      const [before, after] = windows;
      return result(availability(stats, before.count + after.count), { metric, windows, retentionMs: HISTORY_WINDOW_MS,
        averageDelta: before.average === null || after.average === null ? null : after.average - before.average });
    }
    case 'services': {
      const raw = await read('services');
      const serviceData = serviceReads(raw, sampledAt);
      const warning = Boolean(raw?.error);
      if (!params.id) return paged(raw, 'services', serviceData.map(({ row }) => row), { warning });
      const selected = serviceData.find(({ row }) => row.id === params.id);
      if (!selected) return result('unavailable', { warning, services: [] });
      if (params.cursor) throw new SnapshotRequestError('Choose a collection cursor or a single service.');
      return result('ready', { warning, services: [selected.row], serviceHistory: selected.resultHistory.slice(-limit) });
    }
    case 'alerts': {
      const raw = await read('alerts');
      return paged(raw, 'alerts', alertReads(raw, sampledAt, true).filter(({ status }) => !params.status || status === params.status), { warning: Boolean(raw?.warning) });
    }
    case 'thresholds': {
      const raw = await read('thresholds');
      return paged(raw, 'thresholds', thresholdReads(raw, sampledAt), { warning: Boolean(raw?.error) });
    }
    case 'watchlist': {
      const raw = await read('watchlist');
      const stats = records(raw?.tiles).some(({ kind }) => kind === 'hardware') ? await read('stats') : undefined;
      const watchlist = watchlistReads(raw, sampledAt, metricReadings(stats, sampledAt));
      return result(availability(raw, watchlist.length), { watchlist });
    }
    case 'usage': {
      const raw = await read('usage');
      return result(availability(raw), { usage: usageRead(raw, sampledAt) });
    }
    case 'power': {
      const raw = await read('power');
      return result(availability(raw), { power: powerRead(raw, sampledAt) });
    }
    case 'diagnostic': {
      const [stats, power, usage, services, alerts, thresholds, watchlist] = await Promise.all(
        ['stats', 'power', 'usage', 'services', 'alerts', 'thresholds', 'watchlist'].map(read));
      const available = [stats, power, usage, services, alerts, thresholds, watchlist].some(Boolean);
      const readings = metricReadings(stats, sampledAt);
      const serviceRows = serviceReads(services, sampledAt).map(({ row }) => row);
      const activeAlerts = alertReads(alerts, sampledAt).filter(({ status }) => status === 'active');
      const thresholdRows = thresholdReads(thresholds, sampledAt);
      return result(availability(available), { diagnostic: {
        metrics: ['cpu', 'gpu', 'ram', 'cpuTemp', 'gpuTemp', 'fps', 'frameMs'].flatMap((id) => readings.has(id) ? [readings.get(id).metric] : []),
        power: powerRead(power, sampledAt), usage: usageRead(usage, sampledAt),
        services: { total: serviceRows.length, ...Object.fromEntries(SERVICE_STATUSES.map((state) => [state, serviceRows.filter(({ status }) => status === state).length])),
          configurationError: Boolean(services?.error) },
        alerts: { active: activeAlerts.length, unacknowledged: activeAlerts.filter(({ acknowledgedAt }) => acknowledgedAt === null).length,
          storageWarning: Boolean(alerts?.warning) },
        thresholds: { total: thresholdRows.length, active: thresholdRows.filter(({ status }) => status === 'active').length,
          configurationError: Boolean(thresholds?.error) }, watchlist: watchlistReads(watchlist, sampledAt, readings),
      } });
    }
  }
}

module.exports = { telemetryInput, telemetryOutput, telemetryParams, readTelemetry, telemetryAlias: alias };
