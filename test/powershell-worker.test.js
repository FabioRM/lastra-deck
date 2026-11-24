'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { PowerShellWorker } = require('../src/main/powershell-worker');

const windows = { skip: process.platform !== 'win32' };

test('one PowerShell process answers several scripts in turn, with per-request environment', windows, async (t) => {
  let spawned = 0;
  const { spawn } = require('node:child_process');
  const worker = new PowerShellWorker({ spawnImpl: (...args) => { spawned++; return spawn(...args); } });
  t.after(() => worker.dispose());
  const [a, b] = await Promise.all([
    worker.run("[PSCustomObject]@{ n = 1 + 1 } | ConvertTo-Json -Compress", { timeout: 15_000 }),
    worker.run('"host=$env:LASTRA_TEST_VALUE"', { env: { LASTRA_TEST_VALUE: 'déjà vu' } }),
  ]);
  assert.deepEqual(JSON.parse(a), { n: 2 });
  assert.equal(b.trim(), 'host=déjà vu');
  assert.equal((await worker.run('"[$env:LASTRA_TEST_VALUE]"')).trim(), '[]');
  // A script that changes its error preference does not affect the next one.
  await worker.run("$ErrorActionPreference = 'SilentlyContinue'; Get-Item 'C:\\definitely\\missing' | Out-Null; 'ok'");
  await assert.rejects(worker.run("throw 'No echo reply'"), /No echo reply/);
  assert.equal((await worker.run("'still running'")).trim(), 'still running');
  assert.equal(spawned, 1);
});

test('a script that hangs is stopped and the next request gets a fresh process', windows, async (t) => {
  let spawned = 0;
  const { spawn } = require('node:child_process');
  const worker = new PowerShellWorker({ spawnImpl: (...args) => { spawned++; return spawn(...args); } });
  t.after(() => worker.dispose());
  await assert.rejects(worker.run('Start-Sleep -Seconds 30', { timeout: 1_500 }), /did not answer in time/);
  assert.equal((await worker.run("'recovered'")).trim(), 'recovered');
  assert.equal(spawned, 2);
});

test('queued requests can be aborted and dispose rejects pending work', async () => {
  const { EventEmitter } = require('node:events');
  const { PassThrough } = require('node:stream');
  const fake = () => Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), kill() {} });
  const worker = new PowerShellWorker({ spawnImpl: fake });
  const running = worker.run("'first'");
  const controller = new AbortController();
  const queued = worker.run("'second'", { signal: controller.signal });
  controller.abort(new Error('cancelled'));
  await assert.rejects(queued, /cancelled/);
  worker.dispose();
  await assert.rejects(running, /while Lastra closes/);
  await assert.rejects(worker.run("'late'"), /while Lastra closes/);
});
