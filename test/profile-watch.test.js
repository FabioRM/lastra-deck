'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { ProfileStore } = require('../src/main/profile');
const { tempDir } = require('./helpers/temp-dir');

test('a failing profile folder watcher is reported and re-armed instead of crashing', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const dir = tempDir(t);
  const file = path.join(dir, 'profile.json');
  fs.writeFileSync(file, fs.readFileSync(path.join(__dirname, '..', 'profiles', 'default.json')));
  const store = new ProfileStore({ file, defaultFile: file });
  t.after(() => store.close());
  const errors = [];
  store.on('error', (err) => errors.push(err.message));
  store.watch();
  const first = store.watcher;
  assert.ok(first);
  first.emit('error', Object.assign(new Error('handle revoked'), { code: 'EPERM' }));
  assert.equal(store.watcher, null);
  assert.match(errors[0], /Could not watch the profile folder: handle revoked/);
  t.mock.timers.tick(5_000);
  assert.ok(store.watcher && store.watcher !== first, 'the watcher is armed again');
});
