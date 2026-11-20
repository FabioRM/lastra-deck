'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { WslProvider, decodeOutput, parseDistributions } = require('../src/main/app-view-wsl');

const table = '  NOME                   STATO                 VERSIONE\r\n'
  + '* Ubuntu  Test           Non in esecuzione     2\r\n'
  + '  docker-desktop         In esecuzione         2\r\n';
const verbose = Buffer.from('\uFEFF' + table, 'utf16le');
const running = Buffer.from('docker-desktop\r\n\r\n', 'utf16le');
const metricSample = '0.42 1.02 3.27 1/478 912\r\n'
  + 'MemTotal:        8388608 kB\r\nMemFree:         1048576 kB\r\nMemAvailable:   3145728 kB\r\n';

test('WSL tables preserve distro names and map running state without relying on translations', () => {
  assert.equal(decodeOutput(verbose), table);
  assert.deepEqual(parseDistributions(verbose, running), [
    { name: 'Ubuntu  Test', state: 'stopped', version: 2, default: true },
    { name: 'docker-desktop', state: 'running', version: 2, default: false },
  ]);
  assert.equal(parseDistributions(verbose, null)[0].state, 'unknown');
  assert.equal(parseDistributions('  New Distro    Installing    1', '')[0].state, 'installing');
});

function fixture({ getRunning = () => running, getMetrics = () => metricSample } = {}) {
  const commands = [];
  const actions = [];
  const provider = new WslProvider({ platform: 'win32',
    run: async (action) => { actions.push(action); return { ok: true }; },
    exec: async (_file, args, limits) => {
      assert.ok(limits.timeout > 0 && limits.timeout < 10_000);
      commands.push(args);
      if (args[1] === '--verbose') return { stdout: verbose };
      if (args[1] === '--running') return { stdout: await getRunning() };
      if (args[0] === '--distribution') {
        assert.ok(limits.maxBuffer <= 16 * 1024);
        return { stdout: await getMetrics() };
      }
      return { stdout: Buffer.alloc(0) };
    } });
  return { provider, commands, actions };
}

test('passive WSL data coalesces requests and uses only list commands', async () => {
  const { provider, commands, actions } = fixture();
  const [first, second] = await Promise.all([provider.snapshot(), provider.snapshot()]);
  assert.deepEqual(first, second);
  await provider.snapshot();
  assert.deepEqual(commands, [['--list', '--verbose'], ['--list', '--running', '--quiet']]);
  assert.deepEqual(actions, []);
  let launched = false;
  const nonWindows = new WslProvider({ platform: 'linux', exec: () => { launched = true; } });
  assert.equal((await nonWindows.snapshot()).status, 'unsupported');
  assert.equal(launched, false);
});

test('WSL commands are bound to named installed distributions and stop needs confirmation', async () => {
  const { provider, actions, commands } = fixture();
  await assert.rejects(provider.change({ action: 'stop', name: 'docker-desktop' }), /Confirm/);
  await assert.rejects(provider.change({ action: 'stop', name: 'Ubuntu  Test', confirmed: true }), /no longer running/);
  await assert.rejects(provider.change({ action: 'terminal', name: '--shutdown' }), /Invalid/);
  await assert.rejects(provider.change({ action: 'code', name: 'Missing' }), /unavailable/);
  assert.ok(!commands.some(([type]) => type === '--terminate'));

  await provider.change({ action: 'terminal', name: 'Ubuntu  Test' });
  assert.deepEqual(actions[0].args.slice(-2), ['--distribution', 'Ubuntu  Test']);
  await provider.change({ action: 'code', name: 'Ubuntu  Test' });
  assert.deepEqual(actions[1], { type: 'open', target: 'vscode://vscode-remote/wsl+Ubuntu%20%20Test/' });
  await provider.change({ action: 'stop', name: 'docker-desktop', confirmed: true });
  assert.deepEqual(commands.at(-1), ['--terminate', 'docker-desktop']);
});

test('explicit WSL metrics recheck the selected running distribution immediately before a single bounded read', async () => {
  const { provider, commands, actions } = fixture();
  const { ok, metrics } = await provider.change({ action: 'metrics', name: 'docker-desktop',
    args: ['--exec', 'ignored'] });
  assert.equal(ok, true);
  assert.ok(Math.abs(Date.now() - metrics.sampledAt) < 5_000);
  const { sampledAt, ...reading } = metrics;
  assert.deepEqual(reading, { name: 'docker-desktop', loadAverage: 0.42, memoryTotalKiB: 8388608,
    memoryAvailableKiB: 3145728 });
  assert.deepEqual(commands, [
    ['--list', '--running', '--quiet'],
    ['--distribution', 'docker-desktop', '--exec', '/bin/cat', '/proc/loadavg', '/proc/meminfo'],
  ]);
  assert.deepEqual(actions, []);
});

test('a distribution absent from the current running list is never entered even when the cached view showed it running', async () => {
  let current = running;
  const { provider, commands } = fixture({ getRunning: () => current });
  assert.equal((await provider.snapshot()).distributions[1].state, 'running');
  current = '';
  await assert.rejects(provider.change({ action: 'metrics', name: 'docker-desktop' }), /no longer running/);
  await assert.rejects(provider.change({ action: 'metrics', name: '--shutdown' }), /Invalid/);
  assert.deepEqual(commands.at(-1), ['--list', '--running', '--quiet']);
  assert.ok(commands.every(([command]) => command === '--list'));
});

test('a failed running check blocks entry even when the distro metrics read would have succeeded', async () => {
  const { provider, commands } = fixture({ getRunning: () => { throw new Error('Timed out'); } });
  await assert.rejects(provider.change({ action: 'metrics', name: 'docker-desktop' }), /verify/);
  assert.equal(commands.length, 1);
});

test('malformed output is rejected and concurrent WSL metric requests do not start a second read', async () => {
  let release;
  const { provider, commands } = fixture({ getMetrics: () => new Promise((resolve) => { release = resolve; }) });
  const first = provider.change({ action: 'metrics', name: 'docker-desktop' });
  await assert.rejects(provider.change({ action: 'metrics', name: 'docker-desktop' }), /already pending/);
  await assert.rejects(provider.change({ action: 'stop', name: 'docker-desktop', confirmed: true }), /metrics read/);
  release(metricSample.replace('3145728', '8388609'));
  await assert.rejects(first, /unavailable/);
  assert.equal(commands.filter(([arg]) => arg === '--distribution').length, 1);
  assert.equal(commands.filter(([arg]) => arg === '--terminate').length, 0);
});
