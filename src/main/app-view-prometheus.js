// @ts-check
'use strict';

const { createHash } = require('node:crypto');
const { readMonitorConfig, openMonitorConfig } = require('./monitoring-config');

const MAX_SOURCES = 2;
const MAX_METRICS = 4;
const MAX_BYTES = 128 * 1024;
const MAX_PARALLEL = 2;
const REQUEST_BUDGET = 6_000;
const ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const LOOPBACK = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])$/;
const BEARER_ENV = /^LASTRA_PROMETHEUS_[A-Z0-9_]{1,48}$/;
const BEARER = /^[A-Za-z0-9._~+/-]+={0,2}$/;
const SECRET_PARAMETER = /^(?:access[_-]?token|auth(?:orization)?|api[_-]?key|password|token)$/i;
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rowKey = (source, metric) => source + ':' + metric;
const text = (value, max) => typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= max
  && !/[\p{Cc}\p{Cf}]/u.test(value);
const object = (value, fields) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every((key) => fields.includes(key));

function parseUrl(value, dashboard = false) {
  let url;
  try { if (text(value, 2_048)) url = new URL(value); } catch {}
  if (!url || !(url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.test(url.hostname)))
      || url.username || url.password) throw new Error('Use HTTPS or a loopback HTTP URL without credentials.');
  if (dashboard) {
    const secrets = [...url.searchParams.keys(), ...new URLSearchParams(url.hash.slice(1)).keys()];
    if (secrets.some((key) => SECRET_PARAMETER.test(key))) throw new Error('Remove credentials from the dashboard link.');
    return url.href;
  }
  if (url.search || url.hash) throw new Error('Use the Prometheus base URL before the API path or query values.');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return new URL('api/v1/query', url).href;
}

function normalizePrometheus(config) {
  const interval = config?.intervalSeconds ?? 15;
  if (!object(config, ['version', 'intervalSeconds', 'sources']) || config.version !== 1
      || !Number.isInteger(interval) || interval < 10 || interval > 60
      || !Array.isArray(config.sources) || config.sources.length > MAX_SOURCES) {
    throw new Error('Use version 1, up to two sources, and a refresh interval from 10 to 60 seconds.');
  }
  const sourceIds = new Set();
  const sources = config.sources.map((source) => {
    const { id, name, url, bearerEnv, dashboard, metrics } = source ?? {};
    if (!object(source, ['id', 'name', 'url', 'bearerEnv', 'dashboard', 'metrics']) || typeof id !== 'string'
        || !ID.test(id) || sourceIds.has(id) || !text(name, 60)
        || (bearerEnv !== undefined && (typeof bearerEnv !== 'string' || !BEARER_ENV.test(bearerEnv)))
        || !Array.isArray(metrics) || !metrics.length || metrics.length > MAX_METRICS) {
      throw new Error('Give each source a unique ID, a name, and one to four metrics. Optional bearer variable names start with LASTRA_PROMETHEUS_.');
    }
    sourceIds.add(id);
    const metricIds = new Set();
    const selected = metrics.map((metric) => {
      const { id, name, query, host, service, unit = '' } = metric ?? {};
      if (!object(metric, ['id', 'name', 'query', 'host', 'service', 'unit']) || typeof id !== 'string'
          || !ID.test(id) || metricIds.has(id) || !text(name, 60) || !text(query, 2048)
          || !text(host, 48) || !text(service, 48) || (unit !== '' && !text(unit, 20))) {
        throw new Error('Give each metric a unique ID, a host, a service, a name, and a PromQL expression.');
      }
      metricIds.add(id);
      return { id, name, query, host, service, unit };
    });
    return { id, name, endpoint: parseUrl(url), bearerEnv, dashboard: dashboard === undefined ? null : parseUrl(dashboard, true),
      metrics: selected };
  });
  return { interval: interval * 1_000, sources };
}

async function readJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Prometheus response body is unavailable.');
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error('Prometheus response exceeds the read limit.');
      chunks.push(Buffer.from(value));
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function queryResult(response) {
  const { resultType, result } = response?.data ?? {};
  if (response?.status !== 'success' || !Array.isArray(result)) return { status: 'invalid-result' };
  if (resultType === 'vector' && result.length !== 1) return { status: result.length ? 'multiple-series' : 'empty' };
  const reading = resultType === 'scalar' ? result : resultType === 'vector' ? result[0]?.value : undefined;
  if (!Array.isArray(reading) || reading.length !== 2 || !Number.isFinite(reading[0])
      || typeof reading[1] !== 'string' || !DECIMAL.test(reading[1])) return { status: 'invalid-result' };
  const value = Number(reading[1]);
  return Number.isFinite(value) ? { status: 'ready', value } : { status: 'invalid-result' };
}

function dashboardRevision(source) {
  return source.dashboard ? hash([source.id, source.dashboard]).slice(0, 24) : null;
}

class PrometheusView {
  /**
   * @param {string} file
   * @param {{ fetcher?: typeof globalThis.fetch, env?: NodeJS.ProcessEnv, now?: () => number, openConfig?: (file: string) => any,
   *   openExternal?: (url: string) => Promise<unknown>, canRead?: () => boolean }} [options]
   */
  constructor(file, { fetcher = globalThis.fetch, env = process.env, now = Date.now, openConfig, openExternal, canRead = () => true } = {}) {
    this.file = file;
    this.fetcher = fetcher;
    this.env = env;
    this.now = now;
    this.openConfig = openConfig;
    this.openExternal = openExternal;
    this.canRead = canRead;
  }

  settings() { return readMonitorConfig(this.file, 'Prometheus', normalizePrometheus); }

  configuration() {
    const settings = this.settings();
    if (!settings.sources?.length) return null;
    const tokens = settings.sources.map(({ bearerEnv }) => {
      const token = bearerEnv ? this.env[bearerEnv] : null;
      return typeof token === 'string' && token.length <= 4096 && BEARER.test(token) ? token : null;
    });
    return { ...settings, tokens, signature: hash([settings, tokens]) };
  }

  stop() {
    this.pending?.controller.abort();
    this.pending = null;
  }

  reset() {
    this.stop();
    this.cached = null;
  }

  async query(source, metric, token, signal) {
    if (source.bearerEnv && !token) return { status: 'authentication' };
    if (signal.aborted || !this.canRead()) return { status: 'unavailable' };
    try {
      const response = await this.fetcher(source.endpoint, {
        method: 'POST', redirect: 'error', signal,
        headers: { Accept: 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: new URLSearchParams({ query: metric.query, timeout: '3s', limit: '2' }),
      });
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        return { status: response.status === 401 || response.status === 403 ? 'authentication'
          : response.status >= 400 && response.status < 500 ? 'invalid-result' : 'unavailable' };
      }
      return queryResult(await readJson(response));
    } catch { return { status: 'unavailable' }; }
  }

  async collect(config, signal, previous) {
    const metrics = config.sources.flatMap((source, index) => source.metrics.map((metric) => ({ source, metric, token: config.tokens[index] })));
    const rows = new Map();
    for (let offset = 0; offset < metrics.length; offset += MAX_PARALLEL) {
      await Promise.all(metrics.slice(offset, offset + MAX_PARALLEL).map(async ({ source, metric, token }) => {
        const key = rowKey(source.id, metric.id);
        const { status, value } = await this.query(source, metric, token, signal);
        const prior = previous?.get(key);
        if (status === 'ready') rows.set(key, { status, value, updatedAt: this.now() });
        else if (status === 'unavailable' && prior?.updatedAt !== undefined && this.now() - prior.updatedAt <= config.interval * 3) {
          rows.set(key, { ...prior, status: 'cached' });
        } else rows.set(key, { status });
      }));
    }
    const sources = config.sources.map((source) => ({
      id: source.id, name: source.name, dashboardRevision: dashboardRevision(source),
      metrics: source.metrics.map(({ query, ...metric }) => ({ ...metric, ...rows.get(rowKey(source.id, metric.id)) })),
    }));
    return { rows, snapshot: { status: 'ready', sources } };
  }

  async snapshot() {
    if (!this.canRead()) {
      this.stop();
      return { status: 'unavailable' };
    }
    let config;
    try { config = this.configuration(); }
    catch (error) { this.reset(); return { status: 'invalid', message: error.message }; }
    if (!config) { this.reset(); return { status: 'disabled' }; }
    if (this.pending?.signature === config.signature) return this.pending.promise;
    if (this.pending || (this.cached && this.cached.signature !== config.signature)) this.reset();
    if (this.cached && this.now() - this.cached.at < config.interval) return this.cached.snapshot;
    const ticket = { signature: config.signature, controller: new AbortController() };
    const signal = AbortSignal.any([ticket.controller.signal, AbortSignal.timeout(REQUEST_BUDGET)]);
    const previous = this.cached?.rows;
    this.pending = ticket;
    ticket.promise = this.collect(config, signal, previous).then((result) => {
      let current;
      try { current = this.configuration(); } catch {}
      if (this.pending !== ticket || !this.canRead() || current?.signature !== ticket.signature) return { status: 'loading' };
      this.cached = { ...result, signature: ticket.signature, at: this.now() };
      return result.snapshot;
    }).finally(() => { if (this.pending === ticket) this.pending = null; });
    return ticket.promise;
  }

  /** @param {{ action?: string, id?: string, revision?: any }} [command] */
  async change({ action, id, revision } = {}) {
    if (action === 'stop') { this.stop(); return { ok: true }; }
    if (action === 'configure') return openMonitorConfig(this.file, 'Prometheus', 'sources', this.openConfig);
    if (action !== 'open-dashboard' || typeof id !== 'string' || !ID.test(id)
        || typeof revision !== 'string' || !/^[a-f0-9]{24}$/.test(revision)) throw new Error('Choose a configured Prometheus dashboard.');
    if (!this.canRead()) throw new Error('Open the Prometheus view to use its dashboard link.');
    const source = this.settings().sources?.find((item) => item.id === id);
    if (!source?.dashboard || dashboardRevision(source) !== revision) throw new Error('The dashboard link changed. Read the current connection again.');
    await this.openExternal(source.dashboard);
    return { ok: true };
  }
}

module.exports = { PrometheusView, normalizePrometheus, queryResult };
