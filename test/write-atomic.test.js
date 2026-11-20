'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { writeAtomic, renameWithRetry } = require('../src/main/write-atomic');
const { tempDir } = require('./helpers/temp-dir');

test('writeAtomic replaces the file and leaves no temporary files', (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'settings.json');
  writeAtomic(file, 'first');
  writeAtomic(file, 'second ✓');
  assert.equal(fs.readFileSync(file, 'utf8'), 'second ✓');
  assert.deepEqual(fs.readdirSync(dir), ['settings.json']);
});

test('writeAtomic retries a briefly locked target and keeps the error code when the lock persists', (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'profile.json');
  let attempts = 0;
  const flaky = (from, to) => {
    if (++attempts < 3) throw Object.assign(new Error('locked'), { code: 'EBUSY' });
    fs.renameSync(from, to);
  };
  writeAtomic(file, 'saved', { rename: flaky });
  assert.equal(attempts, 3);
  assert.equal(fs.readFileSync(file, 'utf8'), 'saved');

  const locked = () => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); };
  assert.throws(() => writeAtomic(file, 'lost', { rename: locked }), { code: 'EPERM' });
  assert.equal(fs.readFileSync(file, 'utf8'), 'saved');
  assert.deepEqual(fs.readdirSync(dir), ['profile.json']);
});

test('renameWithRetry does not retry errors that are not transient locks', () => {
  let attempts = 0;
  const missing = () => { attempts++; throw Object.assign(new Error('missing'), { code: 'ENOENT' }); };
  assert.throws(() => renameWithRetry('a', 'b', missing), { code: 'ENOENT' });
  assert.equal(attempts, 1);
});
