'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { KubernetesView } = require('../src/main/app-view-kubernetes');
const { deckRequestAllowed } = require('../src/main/deck-view-only');
const { tempDir } = require('./helpers/temp-dir');

const executable = 'C:\\Program Files\\Kubernetes\\kubectl.exe';
const kubeconfig = 'C:\\Local\\kube.yaml';
const targets = [
  { id: 'staging', label: 'Staging', context: 'local-staging', namespace: 'app-staging' },
  { id: 'dev', label: 'Development', context: 'local-dev', namespace: 'app-dev' },
];
const config = { version: 1, executable, kubeconfig, targets, logs: true };

function setup(t, options) {
  const directory = tempDir(t, 'lastra-kubernetes-');
  const file = path.join(directory, 'kubernetes.json');
  const view = new KubernetesView(file, options);
  t.after(() => view.stop());
  return { view, write: (value = config) => fs.writeFileSync(file, JSON.stringify(value)) };
}

function pod(name, phase = 'Running', { ready = false, restartCount = 0, waiting, uid = 'uid-' + name } = {}) {
  return {
    metadata: { name, uid }, spec: { containers: [{ name: 'app' }] },
    status: { phase, containerStatuses: [{ name: 'app', ready, restartCount, state: { waiting: { reason: waiting } } }] },
  };
}

function deployment(name, properties) {
  return { metadata: { name, generation: 2 }, spec: { replicas: 2 }, status: properties };
}

const reply = (value) => ({ stdout: JSON.stringify(value) });

test('Kubernetes is idle without a valid opt-in configuration or an open deck view', async (t) => {
  let open = true;
  let configurationOpened = false;
  const { view, write } = setup(t, { canRead: () => open, execute: () => assert.fail('Unexpected process'),
    openConfig: () => { configurationOpened = true; return { ok: true }; } });
  assert.equal((await view.snapshot()).status, 'disabled');
  await view.change({ action: 'configure' });
  assert.equal(configurationOpened, true);
  assert.equal((await view.snapshot()).status, 'disabled');
  write({ ...config, executable: 'kubectl.exe' });
  assert.equal((await view.snapshot()).status, 'invalid');
  write({ ...config, targets: [{ ...targets[0], namespace: '--all-namespaces' }] });
  assert.equal((await view.snapshot()).status, 'invalid');
  write();
  open = false;
  assert.equal((await view.snapshot()).status, 'unavailable');
  await assert.rejects(view.change({ action: 'logs', pod: 'api' }), /Open Kubernetes/);
});

test('Kubernetes samples only declared namespaces and sorts pod and rollout trouble first', async (t) => {
  const calls = [];
  const { view, write } = setup(t, {
    async execute(file, args, options) {
      calls.push({ file, args });
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.windowsHide, true);
      assert.equal(options.timeout, 5200);
      if (args.includes('deployments')) return reply({ items: [
        deployment('green', { readyReplicas: 2, availableReplicas: 2, observedGeneration: 2 }),
        deployment('growing', { readyReplicas: 2, availableReplicas: 2, observedGeneration: 1 }),
        deployment('blocked', { conditions: [{ type: 'Progressing', status: 'False', reason: 'ProgressDeadlineExceeded' }] }),
      ] });
      return reply({ items: [
        pod('healthy', 'Running', { ready: true }), pod('pending', 'Pending'),
        pod('crashing', 'Running', { restartCount: 5, waiting: 'CrashLoopBackOff' }),
        pod('slow-ready'), pod('--bad'),
      ] });
    },
  });
  write();
  const first = await view.snapshot();
  assert.equal(first.status, 'ready');
  assert.equal(first.context, 'local-staging');
  assert.equal(first.namespace, 'app-staging');
  assert.deepEqual(first.pods.map((row) => row.name), ['crashing', 'pending', 'slow-ready', 'healthy']);
  assert.deepEqual(first.deployments.map((row) => row.state), ['Stalled', 'Rolling out', 'Ready']);
  assert.deepEqual(calls, ['pods', 'deployments'].map((resource) => ({
    file: executable, args: ['--context=local-staging', '--namespace=app-staging', '--request-timeout=4s',
      '--kubeconfig=' + kubeconfig, 'get', resource, '-o', 'json'],
  })));
  await assert.rejects(view.change({ action: 'select', target: 'other' }), /unavailable/);
  await view.change({ action: 'select', target: 'dev' });
  assert.equal((await view.snapshot()).namespace, 'app-dev');
  assert.ok(calls[3].args.includes('--context=local-dev'));
});

test('Kubernetes keeps the successful collection and redacts errors from the other collection', async (t) => {
  const { view, write } = setup(t, {
    async execute(_file, args) {
      if (args.includes('pods')) throw new Error('server certificate and private URL');
      return reply({ items: Array.from({ length: 63 }, (_, i) => deployment('rollout-' + i, {})) });
    },
  });
  write();
  const result = await view.snapshot();
  assert.equal(result.status, 'ready');
  assert.equal(result.pods, null);
  assert.equal(result.deployments.length, 60);
  assert.equal(result.more, true);
  assert.doesNotMatch(JSON.stringify(result), /certificate|private URL|kube\.yaml/);
});

test('Kubernetes verifies pod identity around bounded log reads and never exposes kubectl errors', async (t) => {
  let targetedReads = 0;
  let replacePod = false;
  const requests = [];
  const { view, write } = setup(t, {
    async execute(_file, args, options) {
      if (args.includes('pods')) return reply({ items: [pod('api')] });
      if (args.includes('deployments')) return reply({ items: [] });
      if (args.includes('pod')) {
        targetedReads++;
        return reply(pod('api', 'Running', { uid: replacePod && targetedReads % 2 === 0 ? 'replaced' : 'uid-api' }));
      }
      requests.push(args.slice(args.indexOf('logs')));
      assert.equal(options.maxBuffer, 24 * 1024);
      return { stdout: 'first\r\n<literal>\u0000\u202e' };
    },
  });
  write();
  const request = { action: 'logs', pod: 'api', uid: 'uid-api', container: 'app' };
  await assert.rejects(view.change(request), /Refresh the list/);
  await view.snapshot();
  await assert.rejects(view.change({ ...request, container: 'other' }), /Refresh the list/);
  assert.deepEqual(await view.change(request), { ok: true, text: 'first\n<literal>' });
  assert.deepEqual(requests, [['logs', 'api', '--container=app', '--tail=80', '--limit-bytes=8192', '--timestamps=true']]);
  replacePod = true;
  await assert.rejects(view.change(request), /Could not read logs/);
  assert.equal(targetedReads, 4);
  write({ ...config, logs: false });
  await assert.rejects(view.change(request), /enabled Kubernetes action/);
});

test('Kubernetes cancels visible collection or logs on close and ignores old deck owners', async (t) => {
  let owner = {};
  let blockCollection = true;
  let observedSignal;
  const { view, write } = setup(t, {
    canRead: () => owner,
    async execute(_file, args, { signal }) {
      if ((blockCollection && args.includes('pods')) || args.includes('logs')) {
        observedSignal = signal;
        await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
        return args.includes('logs') ? { stdout: 'discarded' } : reply({ items: [pod('api')] });
      }
      return reply(args.includes('pod') ? pod('api') : { items: args.includes('pods') ? [pod('api')] : [] });
    },
  });
  write();
  const oldSample = view.snapshot();
  const oldSignal = observedSignal;
  view.stop();
  assert.equal(oldSignal.aborted, true);
  assert.equal((await oldSample).status, 'loading');
  blockCollection = false;
  await view.snapshot();
  const request = { action: 'logs', pod: 'api', uid: 'uid-api', container: 'app' };
  owner = {};
  await assert.rejects(view.change(request), /Refresh the list/);
  await view.snapshot();
  const log = view.change(request);
  const stopped = assert.rejects(log, /Could not read logs/);
  await new Promise(setImmediate);
  assert.notEqual(observedSignal, oldSignal);
  assert.equal(observedSignal.aborted, false);
  await view.change({ action: 'stop-logs' });
  assert.equal(observedSignal.aborted, true);
  await stopped;
});

test('view-only mode permits scoped Kubernetes reads and cancellation', () => {
  for (const action of ['select', 'logs', 'stop-logs', 'stop']) {
    assert.equal(deckRequestAllowed('app-views:change', { type: 'provider', viewId: 'kubernetes', action }), true);
  }
  assert.equal(deckRequestAllowed('app-views:change', { type: 'provider', viewId: 'kubernetes', action: 'configure' }), false);
});
