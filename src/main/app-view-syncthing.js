// @ts-check
'use strict';

const { readMonitorConfig, openMonitorConfig } = require('./monitoring-config');
const { openSecret, sealSecret, sealedField } = require('./sealed-secret');

const DEFAULT_URL = 'http://127.0.0.1:8384/';
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const DEVICE_ID = /^[A-Z2-7]{7}(?:-[A-Z2-7]{7}){7}$/;
const MAX_FOLDERS = 8;
const MAX_DEVICES = 16;
const MAX_BYTES = 256 * 1024;
const MODES = new Set(['idle', 'syncing', 'scanning', 'scan-waiting', 'sync-waiting', 'cleaning', 'paused', 'error', 'stopped']);
const text = (value, max) => typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= max
  && !/[\p{Cc}\p{Cf}]/u.test(value);
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;

function configList(items, maximum, validId) {
  if (!Array.isArray(items) || items.length > maximum) throw new Error('Choose a bounded list of folders or devices.');
  const ids = new Set();
  return items.map((item) => {
    const { id, label } = item ?? {};
    if (!validId(id) || !text(label, 70) || ids.has(id)) throw new Error('Use unique Syncthing IDs and readable labels.');
    ids.add(id);
    return { id, label };
  });
}

function normalizeSyncthing(config) {
  if (config?.version !== 1 || !Array.isArray(config.folders)) throw new Error('Syncthing requires version 1 and a folders list.');
  const folders = configList(config.folders, MAX_FOLDERS, (id) => text(id, 128));
  const devices = configList(config.devices ?? [], MAX_DEVICES, (id) => typeof id === 'string' && DEVICE_ID.test(id));
  const rawUrl = config.url ?? DEFAULT_URL;
  let url;
  try { if (text(rawUrl, 256)) url = new URL(rawUrl); } catch {}
  if (!url || !['http:', 'https:'].includes(url.protocol) || !LOOPBACK.has(url.hostname) || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) throw new Error('Use the root URL of a Syncthing server on this PC.');
  const { apiKey } = config;
  if (apiKey === undefined || apiKey === '') return null;
  if (typeof apiKey !== 'string' || !/^[!-~]{1,256}$/.test(apiKey)) throw new Error('Enter the Syncthing API key.');
  return { url: url.href, apiKey, folders, devices };
}

async function readJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Syncthing did not return data.');
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error('Syncthing returned too much data.');
      chunks.push(Buffer.from(value));
    }
  } finally {
    // Cancel also releases the connection if a response exceeds the read limit.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function folderRow(folder, data) {
  const entry = { id: folder.id, label: folder.label };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ...entry, state: 'unavailable', completion: null, remaining: null };
  const remaining = count(data.needTotalItems);
  const total = count(data.globalBytes);
  const synced = count(data.inSyncBytes);
  const totalItems = count(data.globalTotalItems);
  if (remaining === null && total === null && !MODES.has(data.state)) return { ...entry, state: 'unavailable', completion: null, remaining: null };
  const completion = total && synced !== null ? Math.round(100 * Math.min(total, synced) / total)
    : remaining === 0 ? 100 : totalItems && remaining !== null ? Math.round(100 * Math.max(0, totalItems - remaining) / totalItems) : null;
  return { ...entry, state: MODES.has(data.state) ? data.state : 'unknown', completion, remaining };
}

function deviceRows(settings, response) {
  const connections = response?.connections;
  if (!connections || typeof connections !== 'object' || Array.isArray(connections)) return null;
  const choices = settings.devices.length ? settings.devices
    : Object.keys(connections).filter((id) => DEVICE_ID.test(id)).sort().slice(0, MAX_DEVICES).map((id) => ({ id, label: id.slice(0, 7) }));
  return choices.map(({ id, label }) => ({ id, label, connected: typeof connections[id]?.connected === 'boolean' ? connections[id].connected : null }));
}

class SyncthingView {
  /**
   * @param {string} file
   * @param {{ fetcher?: typeof globalThis.fetch, openConfig?: (file: string) => any, openExternal?: (url: string) => Promise<unknown> }} [options]
   */
  constructor(file, { fetcher = globalThis.fetch, openConfig, openExternal } = {}) {
    this.file = file;
    this.fetcher = fetcher;
    this.openConfig = openConfig;
    this.openExternal = openExternal;
  }

  settings() {
    let raw;
    const settings = readMonitorConfig(this.file, 'Syncthing', (config) => {
      raw = config;
      if (!config || typeof config !== 'object' || !Object.hasOwn(config, sealedField('apiKey'))) return normalizeSyncthing(config);
      // A plain apiKey typed into the file replaces the protected copy.
      const { [sealedField('apiKey')]: _sealed, ...rest } = config;
      return normalizeSyncthing({ ...rest, apiKey: openSecret(config, 'apiKey') });
    });
    if (settings) sealSecret(this.file, raw, 'apiKey');
    return settings;
  }

  async get(settings, route, options) {
    const url = new URL(route, settings.url);
    for (const [key, value] of Object.entries(options ?? {})) url.searchParams.set(key, value);
    try {
      const response = await this.fetcher(url, { headers: { 'X-API-Key': settings.apiKey }, redirect: 'error', signal: AbortSignal.timeout(2500) });
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        return { authentication: response.status === 401 || response.status === 403 };
      }
      return { data: await readJson(response) };
    } catch {
      return {};
    }
  }

  async snapshot() {
    let settings;
    try { settings = this.settings(); }
    catch (error) { return { status: 'invalid', message: error.message }; }
    if (!settings?.apiKey) return { status: 'disabled' };
    const signature = JSON.stringify(settings);
    if (this.pending?.signature === signature) return this.pending.result;
    const entry = { signature };
    entry.result = this.sample(settings).then((value) => {
      try { return JSON.stringify(this.settings()) === signature ? value : { status: 'loading' }; }
      catch { return { status: 'loading' }; }
    }).finally(() => { if (this.pending === entry) this.pending = null; });
    this.pending = entry;
    return entry.result;
  }

  async sample(settings) {
    const [connections, ...results] = await Promise.all([this.get(settings, '/rest/system/connections'),
      ...settings.folders.map(({ id }) => this.get(settings, '/rest/db/status', { folder: id }))]);
    const devices = deviceRows(settings, connections.data);
    const folders = settings.folders.map((folder, index) => folderRow(folder, results[index].data));
    const observed = devices || folders.some(({ state }) => state !== 'unavailable');
    const status = observed ? 'ready' : [connections, ...results].some(({ authentication }) => authentication) ? 'authentication' : 'unavailable';
    return { status, folders, devices, canOpen: true };
  }

  /** @param {{ action?: string }} [command] */
  async change({ action } = {}) {
    if (action === 'configure') return openMonitorConfig(this.file, 'Syncthing', 'folders', this.openConfig);
    if (action !== 'open') throw new Error('Choose a Syncthing action.');
    const settings = this.settings();
    if (!settings?.apiKey) return { ok: false, message: 'Set up Syncthing first.' };
    await this.openExternal(settings.url);
    return { ok: true };
  }
}

module.exports = { SyncthingView, normalizeSyncthing };
