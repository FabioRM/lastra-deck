// @ts-check
'use strict';

const { engineRequest, readDockerContext } = require('./docker-engine');

const MAX_CONTAINERS = 240;
const MAX_LOG_BYTES = 96 * 1024;
const CONTAINER_ID = /^[a-f0-9]{64}$/;
const CONTEXT_KEY = /^[a-f0-9]{24}$/;
const LIFECYCLE = new Set(['start', 'stop', 'restart']);
const STATE = new Set(['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead']);
const HEALTH = new Set(['healthy', 'unhealthy', 'starting']);

const number = (value) => Number.isFinite(value) && value >= 0 ? value : null;
const label = (value, length = 128) => typeof value === 'string' ? value.slice(0, length) : '';

function containerList(rows) {
  return rows.filter(({ Id, Names }) => typeof Id === 'string' && CONTAINER_ID.test(Id) && Array.isArray(Names))
    .slice(0, MAX_CONTAINERS).map((row) => {
      const name = label(row.Names[0]).replace(/^\//, '') || row.Id.slice(0, 12);
      const matchedHealth = /\((?:health:\s+)?(healthy|unhealthy|starting)\)$/.exec(label(row.Status, 120));
      return {
        id: row.Id, name, project: label(row.Labels?.['com.docker.compose.project']),
        service: label(row.Labels?.['com.docker.compose.service']),
        state: STATE.has(row.State) ? row.State : 'unknown',
        health: HEALTH.has(row.Health?.Status) ? row.Health.Status : matchedHealth?.[1] ?? null,
      };
    }).sort((a, b) => a.project.localeCompare(b.project, 'en') || a.name.localeCompare(b.name, 'en'));
}

function publishedPorts(ports) {
  const found = new Map();
  for (const [internal, bindings] of Object.entries(ports ?? {})) {
    if (!/^\d{1,5}\/tcp$/.test(internal) || !Array.isArray(bindings)) continue;
    for (const binding of bindings) {
      if (!/^\d{1,5}$/.test(binding.HostPort)) continue;
      const port = Number(binding.HostPort);
      if (port < 1 || port > 65535) continue;
      const host = ['0.0.0.0', '127.0.0.1', ''].includes(binding.HostIp) ? '127.0.0.1'
        : ['::', '::1'].includes(binding.HostIp) ? '[::1]' : null;
      if (!host) continue;
      const href = 'http://' + host + ':' + port + '/';
      found.set(href, { host, port, containerPort: Number.parseInt(internal, 10), href });
    }
  }
  return [...found.values()].sort((a, b) => a.port - b.port).slice(0, 20);
}

function cpuCounters(stats, previous = false) {
  const sample = previous ? stats.precpu_stats : stats.cpu_stats;
  return {
    used: number(sample?.cpu_usage?.total_usage),
    system: number(sample?.system_cpu_usage),
    cores: number(sample?.online_cpus || sample?.cpu_usage?.percpu_usage?.length || stats.num_procs),
    time: Date.parse(previous ? stats.preread : stats.read),
  };
}

function normalizeStats(stats, last) {
  const cpu = cpuCounters(stats);
  const previous = last ?? cpuCounters(stats, true);
  let cpuPercent = null;
  if (cpu.used !== null && previous.used !== null && (previous.used > 0 || last) && cpu.used >= previous.used && cpu.cores) {
    const used = cpu.used - previous.used;
    if (stats.os_type === 'windows') {
      const elapsed = (cpu.time - previous.time) * 10_000 * cpu.cores;
      if (elapsed > 0) cpuPercent = used / elapsed * 100;
    } else if (cpu.system !== null && previous.system !== null && cpu.system > previous.system) {
      cpuPercent = used / (cpu.system - previous.system) * cpu.cores * 100;
    }
  }

  const memory = stats.memory_stats ?? {};
  let memoryBytes = number(memory.privateworkingset ?? memory.usage);
  const reclaimable = number(memory.stats?.total_inactive_file ?? memory.stats?.inactive_file);
  if (memoryBytes !== null && reclaimable !== null && reclaimable <= memoryBytes) memoryBytes -= reclaimable;

  const network = Object.values(stats.networks ?? {});
  const networkTotal = (field) => network.some((item) => number(item[field]) !== null)
    ? network.reduce((sum, item) => sum + (number(item[field]) ?? 0), 0) : null;
  const io = stats.blkio_stats?.io_service_bytes_recursive ?? [];
  const ioTotal = (op) => io.length
    ? io.reduce((sum, item) => sum + (String(item.op).toLowerCase() === op ? number(item.value) ?? 0 : 0), 0) : null;
  return {
    cpuPercent, memoryBytes, memoryLimit: number(memory.limit), networkRx: networkTotal('rx_bytes'),
    networkTx: networkTotal('tx_bytes'), blockRead: number(stats.storage_stats?.read_size_bytes) ?? ioTotal('read'),
    blockWrite: number(stats.storage_stats?.write_size_bytes) ?? ioTotal('write'),
  };
}

function logText(body, tty) {
  let output = body;
  if (!tty) {
    const frames = [];
    for (let offset = 0; offset + 8 <= body.length;) {
      const size = body.readUInt32BE(offset + 4);
      const content = offset + 8;
      frames.push(body.subarray(content, content + size));
      offset = content + size;
    }
    output = Buffer.concat(frames);
  }
  return output.toString('utf8').replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\u0000-\u0008\u000b-\u000c\u000e-\u001f\u007f]/g, '');
}

class DockerProvider {
  /**
   * @param {{ readContext?: typeof readDockerContext, request?: typeof engineRequest, run?: (action: Record<string, any>, pageApps?: any, options?: Record<string, any>) => Promise<any>,
   *   now?: () => number, contextCacheMs?: number, cacheMs?: number }} [options]
   */
  constructor({ readContext = readDockerContext, request = engineRequest, run, now = Date.now, contextCacheMs = 8_000,
    cacheMs = 1_750 } = {}) {
    this.readContext = readContext;
    this.request = request;
    this.run = run;
    this.now = now;
    this.contextCacheMs = contextCacheMs;
    this.cacheMs = cacheMs;
    this.enabledContext = null;
    this.mutating = false;
  }

  async context({ fresh = false } = {}) {
    if (fresh) return this.readContext();
    if (this.contextCache && this.now() - this.contextAt < this.contextCacheMs) return this.contextCache;
    if (!this.contextPending) {
      this.contextPending = this.readContext().then((value) => {
        this.contextCache = value;
        this.contextAt = this.now();
        return value;
      }).finally(() => { this.contextPending = null; });
    }
    return this.contextPending;
  }

  async json(context, route, options) {
    const result = await this.request(context.socket, route, options);
    return JSON.parse(result.body.toString('utf8'));
  }

  async snapshot() {
    if (this.cache && this.now() - this.cacheAt < this.cacheMs) return this.cache;
    if (!this.pending) {
      this.pending = this.discover().then((value) => {
        this.cache = value;
        this.cacheAt = this.now();
        return value;
      }).finally(() => { this.pending = null; });
    }
    return this.pending;
  }

  async discover() {
    const context = await this.context();
    if (context.status !== 'local') return { status: context.status, context: context.name ?? null, containers: [] };
    try {
      const rows = await this.json(context, '/containers/json?all=1', { maxBytes: 2 * 1024 * 1024 });
      return {
        status: 'ready', context: context.name, contextKey: context.key,
        controls: this.enabledContext === context.key, containers: containerList(rows), total: rows.length,
      };
    } catch {
      return { status: 'engine-unavailable', context: context.name, containers: [] };
    }
  }

  async target(context, id) {
    let info;
    try {
      info = await this.json(context, '/containers/' + id + '/json', { maxBytes: 1024 * 1024 });
    } catch {
      throw new Error('Could not read the selected container');
    }
    if (info.Id !== id || !info.State) throw new Error('The selected container has changed');
    return info;
  }

  async detail(context, id, info) {
    const state = STATE.has(info.State.Status) ? info.State.Status : 'unknown';
    const restartCount = number(info.RestartCount);
    const health = HEALTH.has(info.State.Health?.Status) ? info.State.Health.Status : null;
    const ports = state === 'running' ? publishedPorts(info.NetworkSettings?.Ports)
      .map(({ href, ...binding }) => binding) : [];
    let metrics = null;
    if (state === 'running') {
      try {
        const stats = await this.json(context, '/containers/' + id + '/stats?stream=false&one-shot=true', { maxBytes: 256 * 1024 });
        const previous = this.previousStats;
        const baseline = previous?.id === id && previous.context === context.key && this.now() - previous.time < 20_000
          ? previous.sample : null;
        metrics = normalizeStats(stats, baseline);
        this.previousStats = { id, context: context.key, time: this.now(), sample: cpuCounters(stats) };
      } catch {
        // Container details remain useful when the daemon cannot sample statistics.
      }
    }
    return { id, state, restartCount, health, ports, metrics };
  }

  async change({ action, contextKey, id, confirmed, enabled, host, port }) {
    const lifecycle = LIFECYCLE.has(action);
    if (!['detail', 'logs', 'open-port', 'allow-controls'].includes(action) && !lifecycle) {
      throw new Error('Unknown Docker command');
    }
    if (typeof contextKey !== 'string' || !CONTEXT_KEY.test(contextKey)) throw new Error('Docker context unavailable');
    const context = await this.context({ fresh: action !== 'detail' });
    if (context.status !== 'local' || context.key !== contextKey) {
      this.contextCache = this.cache = null;
      throw new Error('The Docker context has changed. Select the container again.');
    }
    if (action === 'allow-controls') {
      if (typeof enabled !== 'boolean') throw new Error('Choose whether to enable Docker controls');
      this.enabledContext = enabled ? contextKey : null;
      this.cache = null;
      return { ok: true, controls: enabled };
    }
    if (typeof id !== 'string' || !CONTAINER_ID.test(id)) throw new Error('Select a Docker container');
    if (lifecycle && (this.enabledContext !== contextKey || confirmed !== true)) {
      throw new Error('Enable Docker controls and confirm the action first');
    }
    const info = await this.target(context, id);
    if (action === 'detail') return { ok: true, detail: await this.detail(context, id, info) };
    if (action === 'logs') {
      try {
        const { body, clipped } = await this.request(context.socket, '/containers/' + id + '/logs?stdout=1&stderr=1&tail=100',
          { maxBytes: MAX_LOG_BYTES, truncate: true });
        return { ok: true, logs: { id, text: logText(body, info.Config?.Tty === true), clipped } };
      } catch {
        throw new Error('Docker could not read logs for this container');
      }
    }
    if (action === 'open-port') {
      const published = info.State.Status === 'running'
        && publishedPorts(info.NetworkSettings?.Ports).find((entry) => entry.host === host && entry.port === port);
      if (!published) throw new Error('The local port is no longer published');
      return this.run({ type: 'open', target: published.href });
    }

    const validState = action === 'start' ? ['created', 'exited'].includes(info.State.Status) : info.State.Status === 'running';
    if (!validState) throw new Error('The container state has changed. Refresh the view.');
    if (this.mutating) throw new Error('A Docker action is already pending');
    if (this.enabledContext !== contextKey) throw new Error('Docker controls are disabled');
    this.mutating = true;
    try {
      const current = await this.context({ fresh: true });
      if (current.status !== 'local' || current.key !== contextKey || this.enabledContext !== contextKey) {
        throw new Error('Docker context or controls changed. Confirm the action again.');
      }
      try {
        await this.request(current.socket, '/containers/' + id + '/' + action, { method: 'POST', timeout: 20_000 });
        return { ok: true };
      } catch {
        throw new Error('Docker did not confirm the action. Refresh the container state before retrying.');
      }
    } finally {
      this.mutating = false;
      this.cache = null;
      this.previousStats = null;
    }
  }
}

module.exports = { DockerProvider, containerList, logText, normalizeStats, publishedPorts };
