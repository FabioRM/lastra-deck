'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { setSecretStorage } = require('../src/main/sealed-secret');
const { loadObsConfig } = require('../src/main/obs');
const { SyncthingView } = require('../src/main/app-view-syncthing');
const { tempDir } = require('./helpers/temp-dir');

// Reversible stand-in for Windows Data Protection.
const fakeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(`sealed:${text}`, 'utf8'),
  decryptString: (data) => {
    const text = data.toString('utf8');
    if (!text.startsWith('sealed:')) throw new Error('wrong user');
    return text.slice('sealed:'.length);
  },
};

function sealedDir(t) {
  const dir = tempDir(t, 'lastra-sealed-');
  t.after(() => setSecretStorage(null));
  return dir;
}

test('the OBS password is protected on first read and still opens afterwards', (t) => {
  const file = path.join(sealedDir(t), 'obs.json');
  fs.writeFileSync(file, JSON.stringify({ port: 4455, password: 'studio' }));
  setSecretStorage(fakeStorage);
  assert.deepEqual(loadObsConfig(file, {}), { status: 'connecting', port: 4455, password: 'studio' });
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.password, undefined);
  assert.equal(typeof saved.passwordProtected, 'string');
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /"studio"/);
  assert.deepEqual(loadObsConfig(file, {}), { status: 'connecting', port: 4455, password: 'studio' });
  setSecretStorage(null);
  assert.equal(loadObsConfig(file, {}).status, 'invalid');
});

test('without Windows Data Protection the plain OBS password is left as written', (t) => {
  const file = path.join(sealedDir(t), 'obs.json');
  fs.writeFileSync(file, JSON.stringify({ password: 'studio' }));
  assert.equal(loadObsConfig(file, {}).password, 'studio');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).password, 'studio');
});

test('the Syncthing API key is protected on first read', (t) => {
  const file = path.join(sealedDir(t), 'syncthing.json');
  fs.writeFileSync(file, JSON.stringify({ version: 1, folders: [{ id: 'default', label: 'Default' }], apiKey: 'abc123' }));
  setSecretStorage(fakeStorage);
  const view = new SyncthingView(file);
  assert.equal(view.settings().apiKey, 'abc123');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.apiKey, undefined);
  assert.equal(typeof saved.apiKeyProtected, 'string');
  assert.equal(view.settings().apiKey, 'abc123');
});

test('a password typed into the file again replaces the protected copy', (t) => {
  const file = path.join(sealedDir(t), 'obs.json');
  setSecretStorage(fakeStorage);
  fs.writeFileSync(file, JSON.stringify({ password: 'old' }));
  loadObsConfig(file, {});
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...saved, password: 'new' }));
  assert.equal(loadObsConfig(file, {}).password, 'new');
  assert.equal(loadObsConfig(file, {}).password, 'new');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).password, undefined);
});
