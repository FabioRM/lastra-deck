// @ts-check
'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const { readMonitorConfig, openMonitorConfig } = require('./monitoring-config');
const { localProjectDirectory } = require('../../extensions/lastra-vscode/project-location');

const run = promisify(execFile);
const TARGET = /^[a-z0-9_-]{1,40}$/;
const DNS_LABEL = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/;
const DNS_NAME = /^[a-z0-9](?:[-.a-z0-9]{0,251}[a-z0-9])?$/;
const STATE = new Set(['Pending', 'Running', 'Succeeded', 'Failed', 'Unknown']);
const MAX_ROWS = 60;
const amount = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const short = (value, maximum = 80) => typeof value === 'string' && value.trim() === value && value.length >= 1
  && value.length <= maximum && !/[\p{Cc}\p{Cf}]/u.test(value);
const named = (value, rule) => typeof value === 'string' && rule.test(value);

function normalizeKubernetes(config) {
  if (config?.version !== 1 || !Array.isArray(config.targets) || config.targets.length > 12) {
    throw new Error('Use version 1 and a list of up to twelve Kubernetes targets.');
  }
  if (!config.targets.length) return null;
  const executable = localProjectDirectory(config.executable);
  const kubeconfig = config.kubeconfig === undefined ? undefined : localProjectDirectory(config.kubeconfig);
  if (!executable || path.win32.basename(executable).toLowerCase() !== 'kubectl.exe' || kubeconfig === null) {
    throw new Error('Choose the full local path to kubectl.exe and an optional local kubeconfig.');
  }
  if (config.logs !== undefined && typeof config.logs !== 'boolean') throw new Error('Choose whether to enable pod logs.');
  const ids = new Set();
  const targets = config.targets.map((item) => {
    const { id, label, context, namespace } = item ?? {};
    if (!named(id, TARGET) || ids.has(id) || !short(label) || !short(context, 150) || !named(namespace, DNS_LABEL)) {
      throw new Error('Choose unique target IDs, labels, Kubernetes contexts and namespaces.');
    }
    ids.add(id);
    return { id, label, context, namespace };
  });
  return { executable, kubeconfig, logs: config.logs === true, targets };
}

function pod(item) {
  const { name, uid } = item?.metadata ?? {};
  if (!named(name, DNS_NAME) || !short(uid, 128)) return null;
  const containers = (Array.isArray(item.spec?.containers) ? item.spec.containers : []).map((row) => row?.name).filter((value) => named(value, DNS_LABEL)).slice(0, 16);
  const reports = Array.isArray(item.status?.containerStatuses) ? item.status.containerStatuses.filter((state) => containers.includes(state?.name)) : [];
  const phase = STATE.has(item.status?.phase) ? item.status.phase : 'Unknown';
  const ready = reports.filter(({ ready }) => ready === true).length;
  const restarts = reports.reduce((sum, state) => sum + amount(state.restartCount), 0);
  const waiting = reports.map((state) => state.state?.waiting?.reason).find((reason) => named(reason, /^[\w-]{1,48}$/));
  return { name, uid, containers, phase, ready, restarts, waiting };
}

function deployment(item) {
  const { name, generation } = item?.metadata ?? {};
  if (!named(name, DNS_NAME)) return null;
  const desired = amount(item.spec?.replicas);
  const ready = amount(item.status?.readyReplicas);
  const available = amount(item.status?.availableReplicas);
  const fresh = Number.isSafeInteger(generation) && item.status?.observedGeneration >= generation;
  const blocked = Array.isArray(item.status?.conditions) && item.status.conditions
    .some((row) => row?.type === 'Progressing' && row.status === 'False' && row.reason === 'ProgressDeadlineExceeded');
  return { name, desired, ready, available, state: item.spec?.paused === true ? 'Paused' : blocked ? 'Stalled'
    : fresh && ready >= desired && available >= desired ? 'Ready' : 'Rolling out' };
}

function items(value, parse, compare) {
  if (!Array.isArray(value?.items)) throw new Error('Kubernetes did not return a collection.');
  const rows = value.items.map(parse).filter(Boolean).sort(compare);
  return { rows: rows.slice(0, MAX_ROWS), overflow: rows.length > MAX_ROWS };
}

const healthyPod = ({ waiting, phase, ready, containers }) => !waiting && (phase === 'Succeeded' || (phase === 'Running' && ready === containers.length));
const podOrder = (a, b) => Number(healthyPod(a)) - Number(healthyPod(b))
  || b.restarts - a.restarts || a.name.localeCompare(b.name);
const deploymentOrder = (a, b) => Number(a.state === 'Ready') - Number(b.state === 'Ready') || a.name.localeCompare(b.name);

class KubernetesView {
  /**
   * @param {string} file
   * @param {{ execute?: typeof run, openConfig?: (file: string) => any, canRead?: () => boolean }} [options]
   */
  constructor(file, { execute = run, openConfig, canRead = () => true } = {}) {
    this.file = file;
    this.execute = execute;
    this.openConfig = openConfig;
    this.canRead = canRead;
  }

  settings() { return readMonitorConfig(this.file, 'Kubernetes', normalizeKubernetes); }

  stop() {
    this.pending?.controller.abort();
    this.stopLogs();
    this.pending = null;
    this.latest = null;
  }

  stopLogs() {
    this.logJob?.abort();
    this.logJob = null;
  }

  async call(settings, target, args, signal, maxBuffer = 2 * 1024 * 1024) {
    const options = [`--context=${target.context}`, `--namespace=${target.namespace}`, '--request-timeout=4s'];
    if (settings.kubeconfig) options.push(`--kubeconfig=${settings.kubeconfig}`);
    const { stdout } = await this.execute(settings.executable, [...options, ...args], { signal, maxBuffer, timeout: 5200, windowsHide: true });
    return stdout;
  }

  selected(settings) { return settings?.targets?.find(({ id }) => id === this.target) ?? settings?.targets?.[0]; }

  current(signature, id, owner) {
    if (this.canRead() !== owner) return false;
    try {
      const settings = this.settings();
      return this.selected(settings)?.id === id && JSON.stringify(settings) === signature;
    } catch { return false; }
  }

  async snapshot() {
    const owner = this.canRead();
    if (!owner) return { status: 'unavailable' };
    let settings;
    try { settings = this.settings(); } catch (error) { this.stop(); return { status: 'invalid', message: error.message }; }
    const target = this.selected(settings);
    if (!target) { this.stop(); return { status: 'disabled' }; }
    const signature = JSON.stringify(settings);
    if (this.pending?.signature === signature && this.pending.id === target.id && this.pending.owner === owner) return this.pending.result;
    this.pending?.controller.abort();
    const entry = { signature, id: target.id, owner, controller: new AbortController() };
    entry.result = this.sample(settings, target, entry).finally(() => { if (this.pending === entry) this.pending = null; });
    this.pending = entry;
    return entry.result;
  }

  async sample(settings, target, entry) {
    const get = (noun, parse, order) => this.call(settings, target, ['get', noun, '-o', 'json'], entry.controller.signal)
      .then((result) => items(JSON.parse(result), parse, order));
    const [pods, deployments] = /** @type {Array<Partial<PromiseFulfilledResult<{ rows: any, overflow: boolean }>>>} */ (await Promise.allSettled([get('pods', pod, podOrder), get('deployments', deployment, deploymentOrder)]));
    if (entry.controller.signal.aborted || !this.current(entry.signature, target.id, entry.owner)) return { status: 'loading' };
    const outcome = { status: pods.value || deployments.value ? 'ready' : 'unavailable', id: target.id,
      context: target.context, namespace: target.namespace, targets: settings.targets.map(({ id, label }) => ({ id, label })),
      pods: pods.value?.rows ?? null, deployments: deployments.value?.rows ?? null, more: Boolean(pods.value?.overflow || deployments.value?.overflow), logs: settings.logs };
    this.latest = { signature: entry.signature, id: target.id, owner: entry.owner, pods: outcome.pods };
    return outcome;
  }

  /** @param {{ action?: string, target?: string, pod?: string, uid?: string, container?: string }} [command] */
  async change({ action, target: id, pod: name, uid, container } = {}) {
    if (action === 'configure') return openMonitorConfig(this.file, 'Kubernetes', 'targets', this.openConfig);
    if (action === 'stop') { this.stop(); return { ok: true }; }
    if (action === 'stop-logs') { this.stopLogs(); return { ok: true }; }
    const owner = this.canRead();
    if (!owner) throw new Error('Open Kubernetes on the deck to read the cluster.');
    const settings = this.settings();
    if (action === 'select') {
      if (!settings?.targets?.some((entry) => entry.id === id)) throw new Error('That Kubernetes target is unavailable.');
      this.stop();
      this.target = id;
      return { ok: true };
    }
    if (action !== 'logs' || !settings?.logs) throw new Error('Choose an enabled Kubernetes action.');
    const target = this.selected(settings);
    const signature = JSON.stringify(settings);
    const latest = this.latest;
    const row = latest?.pods?.find((item) => item.name === name && item.uid === uid && item.containers.includes(container));
    if (!target || latest?.signature !== signature || latest.id !== target.id || latest.owner !== owner || !row) {
      throw new Error('The selected pod or container changed. Refresh the list.');
    }
    if (this.logJob) throw new Error('A pod log is already loading.');
    const controller = new AbortController();
    this.logJob = controller;
    const active = () => !controller.signal.aborted && this.current(signature, target.id, owner);
    const verify = async () => {
      const observed = pod(JSON.parse(await this.call(settings, target, ['get', 'pod', row.name, '-o', 'json'], controller.signal)));
      if (observed?.uid !== row.uid || !observed.containers.includes(container) || !active()) throw new Error();
    };
    try {
      await verify();
      const result = await this.call(settings, target, ['logs', row.name, `--container=${container}`, '--tail=80', '--limit-bytes=8192', '--timestamps=true'],
        controller.signal, 24 * 1024);
      if (!active()) throw new Error();
      await verify();
      const text = result.slice(-8192).replace(/\r\n?/g, '\n').replace(/[\p{Cc}\p{Cf}]/gu, (character) => '\n\t'.includes(character) ? character : '');
      return { ok: true, text };
    } catch {
      throw new Error('Could not read logs for the selected pod and container.');
    } finally {
      if (this.logJob === controller) this.logJob = null;
    }
  }
}

module.exports = { KubernetesView, normalizeKubernetes };
