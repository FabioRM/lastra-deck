'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { DockerProvider, containerList, logText, normalizeStats, publishedPorts } = require('../src/main/app-view-docker');
const { engineRequest, readDockerContext, socketFor } = require('../src/main/docker-engine');

const id = 'a'.repeat(64);
const key = 'b'.repeat(24);
const context = { status: 'local', key, name: 'desktop-test', socket: 'fixture-pipe' };
const state = {
  Id: id, State: { Status: 'running', Health: { Status: 'healthy' } }, RestartCount: 3, Config: { Tty: true },
  NetworkSettings: { Ports: {
    '80/tcp': [{ HostPort: '8080', HostIp: '0.0.0.0' }, { HostPort: '8080', HostIp: '127.0.0.1' }],
    '443/tcp': [{ HostPort: '9443', HostIp: '::' }, { HostPort: '9443', HostIp: '192.168.7.1' }],
    '53/udp': [{ HostPort: '53', HostIp: '0.0.0.0' }],
  } },
};
const stats = {
  os_type: 'linux', read: '2026-11-18T22:00:02Z', preread: '2026-11-18T22:00:01Z',
  cpu_stats: { cpu_usage: { total_usage: 250 }, system_cpu_usage: 3500, online_cpus: 4 },
  precpu_stats: { cpu_usage: { total_usage: 125 }, system_cpu_usage: 2500 },
  memory_stats: { usage: 7000, limit: 10_000, stats: { inactive_file: 1500 } },
  networks: { eth0: { rx_bytes: 100, tx_bytes: 80 }, eth1: { rx_bytes: 40, tx_bytes: 20 } },
  blkio_stats: { io_service_bytes_recursive: [{ op: 'Read', value: 500 }, { op: 'Write', value: 100 }] },
};

function response(value) {
  return { body: Buffer.from(JSON.stringify(value)) };
}

function fixture() {
  const calls = [];
  const launches = [];
  let contextResult = context;
  let inspect = state;
  const docker = new DockerProvider({
    readContext: async () => contextResult,
    run: async (command) => { launches.push(command); return { ok: true }; },
    request: async (socket, route, options = {}) => {
      calls.push({ socket, route, options });
      if (route === '/containers/json?all=1') {
        return response([{ Id: id, Names: ['/web-1'], State: 'running', Status: 'Up 3m (healthy)',
          Labels: { 'com.docker.compose.project': 'demo', 'com.docker.compose.service': 'web' } }]);
      }
      if (route.endsWith('/json')) return response(inspect);
      if (route.includes('/stats?')) return response(stats);
      if (route.includes('/logs?')) return { body: Buffer.from('line 1\nline 2'), clipped: false };
      if (options.method === 'POST') return { body: Buffer.alloc(0) };
      throw new Error('Unexpected route ' + route);
    },
  });
  return { docker, calls, launches, setContext(value) { contextResult = value; }, setInspect(value) { inspect = value; } };
}

test('Docker context discovery recognizes named pipes and Unix sockets and reports remote contexts before opening a socket', async () => {
  assert.equal(socketFor('npipe:////./pipe/docker_engine', 'win32'), '\\\\.\\pipe\\docker_engine');
  assert.equal(socketFor('npipe:////another-host/pipe/docker_engine', 'win32'), null);
  assert.equal(socketFor('unix:///var/run/docker.sock', 'linux'), '/var/run/docker.sock');
  assert.equal(socketFor('tcp://localhost:2375', 'linux'), null);
  const result = await readDockerContext({ platform: 'linux', exec: async (binary, args, opts) => {
    assert.equal(binary, 'docker');
    assert.deepEqual(args, ['context', 'ls', '--format', '{{json .}}']);
    assert.ok(opts.timeout < 3000);
    return { stdout: '{"Current":false,"Name":"default","DockerEndpoint":"unix:///var/run/docker.sock"}\n'
      + '{"Current":true,"Name":"server","DockerEndpoint":"ssh://host.example"}\n' };
  } });
  assert.deepEqual(result, { status: 'remote', name: 'server' });
  const sample = fixture();
  sample.setContext(result);
  assert.deepEqual(await sample.docker.snapshot(), { status: 'remote', context: 'server', containers: [] });
  assert.deepEqual(sample.calls, []);
});

test('Docker provider observes Compose projects and reads only the selected container metrics', async () => {
  const { docker, calls } = fixture();
  const [summary, duplicate] = await Promise.all([docker.snapshot(), docker.snapshot()]);
  assert.deepEqual(summary, duplicate);
  assert.equal(summary.controls, false);
  assert.deepEqual(summary.containers[0], { id, name: 'web-1', project: 'demo', service: 'web', state: 'running', health: 'healthy' });
  assert.deepEqual(calls.map(({ route }) => route), ['/containers/json?all=1']);
  const result = await docker.change({ action: 'detail', contextKey: key, id });
  assert.equal(result.detail.health, 'healthy');
  assert.equal(result.detail.restartCount, 3);
  assert.deepEqual(result.detail.ports, [
    { host: '127.0.0.1', port: 8080, containerPort: 80 },
    { host: '[::1]', port: 9443, containerPort: 443 },
  ]);
  assert.deepEqual(result.detail.metrics, { cpuPercent: 50, memoryBytes: 5500, memoryLimit: 10_000,
    networkRx: 140, networkTx: 100, blockRead: 500, blockWrite: 100 });
  assert.equal(containerList([]).length, 0);

  const windows = normalizeStats({ os_type: 'windows', read: stats.read, preread: stats.preread, num_procs: 2,
    cpu_stats: { cpu_usage: { total_usage: 11_000_000 } }, precpu_stats: { cpu_usage: { total_usage: 1_000_000 } },
    memory_stats: { privateworkingset: 500, limit: 1000 }, storage_stats: { read_size_bytes: 20, write_size_bytes: 30 } });
  assert.deepEqual(windows, { cpuPercent: 50, memoryBytes: 500, memoryLimit: 1000,
    networkRx: null, networkTx: null, blockRead: 20, blockWrite: 30 });
});

test('Docker lifecycle requires per-context opt-in, explicit confirmation and the current container state', async () => {
  const { docker, calls, setContext, setInspect } = fixture();
  const stop = { action: 'stop', contextKey: key, id, confirmed: true };
  await assert.rejects(docker.change(stop), /Enable Docker controls/);
  await docker.change({ action: 'allow-controls', contextKey: key, enabled: true });
  await assert.rejects(docker.change({ ...stop, confirmed: false }), /confirm the action/);
  await assert.rejects(docker.change({ ...stop, action: 'start' }), /container state has changed/);
  await assert.rejects(docker.change({ ...stop, id: '../../any' }), /Select a Docker container/);

  setContext({ ...context, name: 'other', key: 'c'.repeat(24), socket: 'other-socket' });
  await assert.rejects(docker.change(stop), /context has changed/);
  setContext(context);
  setInspect({ ...state, Id: 'd'.repeat(64) });
  await assert.rejects(docker.change(stop), /selected container has changed/);
  assert.equal(calls.some(({ options }) => options.method === 'POST'), false);
  setInspect(state);
  assert.deepEqual(await docker.change(stop), { ok: true });
  assert.deepEqual(calls.at(-1), {
    socket: context.socket, route: '/containers/' + id + '/stop', options: { method: 'POST', timeout: 20_000 },
  });
});

test('Docker logs remove terminal escapes and published links stay on current loopback mappings', async () => {
  const { docker, calls, launches } = fixture();
  const frame = (stream, text) => {
    const data = Buffer.from(text);
    const header = Buffer.alloc(8);
    header[0] = stream;
    header.writeUInt32BE(data.length, 4);
    return Buffer.concat([header, data]);
  };
  assert.equal(logText(Buffer.concat([frame(1, 'one\n'), frame(2, '\u001b[31mtwo\u001b[0m\n')]), false), 'one\ntwo\n');
  assert.equal(publishedPorts({ '1/tcp': [{ HostPort: '70000', HostIp: '127.0.0.1' }] }).length, 0);
  const command = { contextKey: key, id };
  assert.deepEqual((await docker.change({ ...command, action: 'logs' })).logs, { id, text: 'line 1\nline 2', clipped: false });
  assert.match(calls.at(-1).route, /\/logs\?stdout=1&stderr=1&tail=100$/);
  assert.equal(calls.at(-1).options.maxBytes, 96 * 1024);
  await assert.rejects(docker.change({ ...command, action: 'open-port', host: '192.168.7.1', port: 9443 }), /no longer published/);
  await docker.change({ ...command, action: 'open-port', host: '127.0.0.1', port: 8080 });
  assert.deepEqual(launches, [{ type: 'open', target: 'http://127.0.0.1:8080/' }]);
});

test('Docker socket HTTP bounds response size and elapsed time without using an Internet listener', async (t) => {
  const name = 'lastra-docker-' + randomUUID();
  const socket = process.platform === 'win32' ? '\\\\.\\pipe\\' + name : path.join(os.tmpdir(), name);
  const server = http.createServer((req, res) => {
    if (req.url === '/slow') return;
    res.end('123456789');
  });
  await new Promise((resolve) => server.listen(socket, resolve));
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  assert.equal((await engineRequest(socket, '/')).body.toString(), '123456789');
  await assert.rejects(engineRequest(socket, '/', { maxBytes: 4 }), /size limit/);
  const clipped = await engineRequest(socket, '/', { maxBytes: 4, truncate: true });
  assert.equal(clipped.clipped, true);
  assert.equal(clipped.body.toString(), '1234');
  await assert.rejects(engineRequest(socket, '/slow', { timeout: 15 }), /timed out/);
});
