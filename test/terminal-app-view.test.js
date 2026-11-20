'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: wait } = require('node:timers/promises');
const test = require('node:test');
const { TerminalView, normalizeTerminalConfig } = require('../src/main/app-view-terminal');
const { MAX_LOG_BYTES } = require('../src/main/terminal-run-logs');
const { tempDir } = require('./helpers/temp-dir');

const env = { USERPROFILE: 'C:\\Users\\Example', WORKSPACE: 'D:\\Projects\\My app' };
const profile = { id: 'linux', name: 'Project Linux', profile: 'Ubuntu', directory: '\\\\wsl.localhost\\Ubuntu\\home\\dev\\work' };
const command = { id: 'status', name: 'Git status', program: 'git.exe', args: ['status', '--short'], directory: '%WORKSPACE%' };
const config = { version: 1, profiles: [profile], commands: [command] };

function fixture(t, options) {
  let provider;
  t.after(() => provider?.close());
  const root = tempDir(t, 'lastra-terminal-view-');
  const file = path.join(root, 'terminal.json');
  const runs = [];
  const opened = [];
  const launched = [];
  const deps = {
    env, platform: 'win32',
    run: async (action) => { launched.push(action); return { ok: true }; },
    openConfig: async (name) => { opened.push(name); return { ok: true }; },
    openLog: async (name) => { opened.push(name); return ''; },
    spawnChild: (...args) => {
      const child = new EventEmitter();
      child.kill = () => { child.killed = true; child.emit('exit', null); };
      runs.push({ args, child });
      return child;
    },
    ...options,
  };
  provider = new TerminalView(file, deps);
  return { root, file, runs, opened, launched, deps, provider };
}

test('Terminal validates named shell profiles and keeps executable and project arguments separate', () => {
  const { profiles, commands } = normalizeTerminalConfig(config, env);
  assert.deepEqual(profiles, [profile]);
  assert.equal(commands[0].directory, 'D:\\Projects\\My app');
  assert.equal(commands[0].program, 'git.exe');
  assert.deepEqual(commands[0].args, ['status', '--short']);
  assert.throws(() => normalizeTerminalConfig({ ...config, profiles: [{ ...profile, profile: 'Ubuntu; new-tab' }] }, env),
    /unsupported Windows Terminal argument/);
  assert.throws(() => normalizeTerminalConfig({ ...config, profiles: [{ ...profile, directory: 'D:\\foo;bar' }] }, env),
    /unsupported Windows Terminal argument/);
  for (const program of ['task.cmd', 'tools\\..\\git.exe', '.\\git.exe', 'C:git.exe']) {
    assert.throws(() => normalizeTerminalConfig({ ...config, commands: [{ ...command, program }] }, env), /absolute executable path/);
  }
});

test('Terminal opens only saved profiles and creates settings only on request', async (t) => {
  const { provider, file, runs, opened, launched } = fixture(t);
  assert.equal(fs.existsSync(file), false);
  assert.equal(provider.snapshot().profiles.length, 2);
  assert.equal(runs.length, 0);
  await provider.change({ action: 'configure' });
  assert.deepEqual(opened, [file]);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).profiles.length, 2);
  fs.writeFileSync(file, JSON.stringify(config));
  await provider.change({ action: 'configure' });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), config);
  await provider.change({ action: 'open-profile', id: profile.id, profile: 'No custom override' });
  await assert.rejects(provider.change({ action: 'open-profile', id: 'made-up' }), /profile is unavailable/);
  assert.deepEqual(launched, [{
    type: 'launch', target: 'wt.exe', args: ['new-tab', '--profile', profile.profile, '--startingDirectory', profile.directory],
  }]);
});

test('Terminal records scoped last status and duration and retains the result on restart', async (t) => {
  let stamp = 300;
  const { provider, file, runs, deps } = fixture(t, { monotonic: () => stamp, now: () => 12345 });
  fs.writeFileSync(file, JSON.stringify(config));
  await provider.change({ action: 'run-command', id: command.id, program: 'not-the-saved.exe', args: ['not the saved args'] });
  await assert.rejects(provider.change({ action: 'run-command', id: command.id }), /already running/);
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0].args, ['git.exe', ['status', '--short'], {
    cwd: 'D:\\Projects\\My app', env, stdio: 'ignore', windowsHide: true,
  }]);
  assert.equal(provider.snapshot().commands[0].running, true);
  stamp = 423;
  runs[0].child.emit('exit', 2);
  const result = { status: 'exited', exitCode: 2, durationMs: 123 };
  assert.deepEqual(provider.snapshot().commands[0].last, result);
  const reopened = new TerminalView(file, deps);
  assert.deepEqual(reopened.snapshot().commands[0].last, result);
  fs.writeFileSync(file, JSON.stringify({ ...config, commands: [{ ...command, args: ['status'] }] }));
  assert.equal(reopened.snapshot().commands[0].last, null);
});

test('Terminal reports startup failure, bounds execution, and interrupts owned runs on close', async (t) => {
  const { provider, file, runs } = fixture(t);
  fs.writeFileSync(file, JSON.stringify({ ...config, commands: [{ ...command, timeoutMs: 1000 }] }));
  const launch = () => provider.change({ action: 'run-command', id: command.id });
  await launch();
  runs.at(-1).child.emit('error', new Error('missing executable'));
  assert.equal(provider.snapshot().commands[0].last.status, 'failed');
  await launch();
  const target = runs.at(-1).child;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Command timeout was not enforced')), 3500);
    target.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  assert.equal(target.killed, true);
  assert.equal(provider.snapshot().commands[0].last.status, 'timed-out');
  await launch();
  provider.close();
  assert.equal(runs.at(-1).child.killed, true);
  assert.equal(provider.snapshot().commands[0].last.status, 'interrupted');
});

test('invalid Terminal settings prevent any process from starting', async (t) => {
  const { provider, file, runs } = fixture(t);
  fs.writeFileSync(file, JSON.stringify(config));
  assert.equal(provider.snapshot().commands.length, 1);
  fs.writeFileSync(file, '{broken');
  assert.equal(provider.snapshot().status, 'invalid');
  await assert.rejects(provider.change({ action: 'run-command', id: command.id }), /Fix the Windows Terminal configuration/);
  assert.deepEqual(runs, []);
});

test('Terminal preserves legacy command identity and bounds opt-in capture and server execution settings', () => {
  const normalize = (entry) => normalizeTerminalConfig({ ...config, commands: [{ ...command, ...entry }] }, env).commands[0];
  const legacy = normalize({});
  assert.equal(legacy.fingerprint, normalize({ kind: 'task', captureOutput: false }).fingerprint);
  assert.equal(legacy.timeout, 30_000);
  assert.notEqual(legacy.fingerprint, normalize({ captureOutput: true }).fingerprint);
  assert.equal(normalize({ kind: 'server' }).timeout, 3_600_000);
  assert.equal(normalize({ kind: 'server', timeoutMs: 28_800_000 }).timeout, 28_800_000);
  assert.throws(() => normalize({ kind: 'script' }), /kind must be/);
  assert.throws(() => normalize({ captureOutput: 'true' }), /captureOutput must/);
  assert.throws(() => normalize({ timeoutMs: 900_001 }), /900000/);
  assert.throws(() => normalize({ kind: 'server', timeoutMs: 28_800_001 }), /28800000/);
});

test('Terminal refuses old run tokens and keeps the exact direct child reachable across config edits', async (t) => {
  const { provider, file, runs } = fixture(t);
  fs.writeFileSync(file, JSON.stringify(config));
  const revision = provider.snapshot().commands[0].revision;
  const launch = () => provider.change({ action: 'run-command', id: command.id, revision });
  const stop = (run) => provider.change({ action: 'stop-command', id: command.id, run });
  await launch();
  const first = provider.snapshot().commands[0].active.id;
  await assert.rejects(stop('0'.repeat(32)), /no longer active/);
  assert.equal(runs[0].child.killed, undefined);
  fs.writeFileSync(file, '{broken');
  assert.equal(provider.snapshot().commands[0].active.id, first);
  await stop(first);
  assert.equal(provider.snapshot().commands[0].last.status, 'stopped');

  fs.writeFileSync(file, JSON.stringify(config));
  await launch();
  const second = provider.snapshot().commands[0].active.id;
  const child = runs[1].child;
  child.kill = () => false;
  assert.notEqual(first, second);
  await assert.rejects(stop(first), /no longer active/);
  await assert.rejects(stop(second), /did not stop/);
  assert.equal(provider.snapshot().commands[0].active.state, 'stop-failed');
  child.emit('exit', 0);
  assert.equal(provider.snapshot().commands[0].last.status, 'exited');
  assert.equal(provider.snapshot().commands[0].last.exitCode, 0);
  fs.writeFileSync(file, JSON.stringify({ ...config, commands: [{ ...command, args: ['log'] }] }));
  await assert.rejects(launch(), /pinned command changed/);
});

test('Terminal captures an exact scoped log from a real Windows child and keeps only the latest run', { skip: process.platform !== 'win32' }, async (t) => {
  const { provider, root, file, opened, deps } = fixture(t, { spawnChild: spawn, env: process.env });
  const logs = path.join(root, 'terminal-logs');
  const source = "process.stdout.write('build stdout\\n'); process.stderr.write('test stderr\\n');";
  const entry = { ...command, program: process.execPath, directory: root, kind: 'server', captureOutput: true, timeoutMs: 20_000 };
  const configure = (args) => fs.writeFileSync(file, JSON.stringify({ ...config, commands: [{ ...entry, args }] }));
  const current = () => provider.snapshot().commands[0];
  const launch = () => provider.change({ action: 'run-command', id: command.id });
  const open = (run) => provider.change({ action: 'open-log', id: command.id, run });
  const waitFor = async (predicate) => {
    const limit = Date.now() + 5_000;
    while (Date.now() < limit) {
      if (predicate()) return;
      await wait(25);
    }
    throw new Error('Timed out waiting for Terminal child in test.');
  };

  configure(['-e', source + 'setInterval(() => {}, 500);']);
  await launch();
  const active = current().active.id;
  await waitFor(() => {
    const capture = provider.running.get(command.id)?.output?.bytes().toString();
    return capture?.includes('build stdout') && capture?.includes('test stderr');
  });
  assert.equal(fs.existsSync(logs), false, 'capture stays in memory until opening or finishing');
  await open(active);
  const first = opened.at(-1);
  const text = fs.readFileSync(first, 'utf8');
  assert.match(text, /build stdout/);
  assert.match(text, /test stderr/);
  assert.doesNotMatch(JSON.stringify(provider.snapshot()), /build stdout|test stderr/);
  await provider.change({ action: 'stop-command', id: command.id, run: active });
  await waitFor(() => !current().active);
  assert.equal(current().last.status, 'stopped');
  assert.equal(current().last.logRun, active);

  configure(['-e', source + "process.stdout.write('x'.repeat(400000)); process.exitCode = 3;"]);
  await assert.rejects(open(active), /log is unavailable/);
  await launch();
  await waitFor(() => !current().active);
  assert.equal(current().last.exitCode, 3);
  assert.ok(current().last.durationMs >= 0);
  const next = current().last.logRun;
  assert.notEqual(next, active);
  assert.equal(fs.existsSync(first), false);
  await assert.rejects(open('../stdout.txt'), /log is unavailable/);
  await open(next);
  const latest = opened.at(-1);
  assert.ok(fs.statSync(latest).size <= MAX_LOG_BYTES);
  assert.match(fs.readFileSync(latest, 'utf8'), /Output limit reached/);

  const reopened = new TerminalView(file, deps);
  assert.equal(reopened.snapshot().commands[0].last.logRun, next);
  await reopened.change({ action: 'open-log', id: command.id, run: next });
  assert.equal(opened.at(-1), latest);
});
