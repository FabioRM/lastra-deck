'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { createLogger, guarded } = require('../src/main/logger');
const { tempDir } = require('./helpers/temp-dir');

const quiet = { log() {} };

test('the logger keeps recent lines and rotates its file', (t) => {
  const dir = tempDir(t);
  const log = createLogger({ directory: dir, maxBytes: 200, recent: 3, console: quiet });
  for (let i = 0; i < 10; i++) log('line', i, { ok: true });
  assert.equal(log.recent().length, 3);
  assert.match(log.recent()[2], /line 9 \{ ok: true \}$/);
  assert.ok(fs.existsSync(path.join(dir, 'lastra.log')));
  assert.ok(fs.existsSync(path.join(dir, 'lastra.log.1')), 'the file rotates past maxBytes');
});

test('a logger without a usable folder still logs to memory', () => {
  const log = createLogger({ directory: () => { throw new Error('no path yet'); }, console: quiet });
  log('kept');
  assert.equal(log.recent().length, 1);
});

test('guarded ticks report failures at most once a minute and keep running', async (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  const lines = [];
  const log = (...args) => lines.push(args.join(' '));
  let calls = 0;
  const tick = guarded(log, 'Foreground check', () => { calls++; throw new Error('boom'); });
  tick(); tick();
  assert.equal(calls, 2);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^Foreground check failed: Error: boom/);
  t.mock.timers.tick(60_000);
  tick();
  assert.equal(lines.length, 2);
  const failing = guarded(log, 'Sensor update', async () => { throw new Error('later'); });
  await failing();
  assert.match(lines.at(-1), /Sensor update failed: Error: later/);
});
