'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { readJsonSettings, writeJsonSettings, isMissing } = require('../src/main/json-settings-file');
const { DeckViewOnly } = require('../src/main/deck-view-only');
const { tempDir } = require('./helpers/temp-dir');

function useDirectory(t) {
  const directory = tempDir(t, 'lastra-json-settings-');
  return directory;
}

function reader(file, maxBytes = 64) {
  const errors = [];
  const value = readJsonSettings(file, {
    maxBytes,
    parse(data) {
      if (data?.version !== 1) throw new Error('Unsupported version');
      return data.value;
    },
    fallback: (error) => (isMissing(error) ? 'missing' : 'damaged'),
    onError: (error) => errors.push(error),
  });
  return { value, errors };
}

test('settings files are read without a BOM and fall back quietly only when missing', (t) => {
  const directory = useDirectory(t);
  const file = join(directory, 'settings.json');
  assert.deepEqual(reader(file), { value: 'missing', errors: [] });

  fs.writeFileSync(file, String.fromCharCode(0xfeff) + '{"version":1,"value":"saved"}');
  assert.deepEqual(reader(file), { value: 'saved', errors: [] });

  for (const text of ['{"version":2,"value":"saved"}', '{not json', JSON.stringify({ version: 1, value: 'x'.repeat(80) })]) {
    fs.writeFileSync(file, text);
    const { value, errors } = reader(file);
    assert.equal(value, 'damaged', text);
    assert.equal(errors.length, 1, text);
  }

  fs.rmSync(file);
  fs.mkdirSync(file);
  assert.equal(reader(file).value, 'damaged', 'a folder is not a settings file');
});

test('settings are written atomically with a trailing newline and keep the failure code', (t) => {
  const directory = useDirectory(t);
  const file = join(directory, 'nested', 'settings.json');
  writeJsonSettings(file, { version: 1, value: 'saved' }, { space: 2 });
  assert.equal(fs.readFileSync(file, 'utf8'), '{\n  "version": 1,\n  "value": "saved"\n}\n');
  writeJsonSettings(file, { version: 1 });
  assert.equal(fs.readFileSync(file, 'utf8'), '{"version":1}\n');

  const blocker = join(directory, 'blocker');
  fs.writeFileSync(blocker, '');
  const blocked = join(blocker, 'settings.json');
  assert.throws(() => writeJsonSettings(blocked, {}), (error) => typeof error.code === 'string' && !error.cause);
  assert.throws(() => writeJsonSettings(blocked, {}, { failure: 'Could not save settings.' }), (error) =>
    error.message === 'Could not save settings.' && typeof error.code === 'string' && error.code === error.cause?.code);
});

test('view-only keeps its message and the Windows error code when a save fails', (t) => {
  const directory = useDirectory(t);
  const blocker = join(directory, 'blocker');
  fs.writeFileSync(blocker, '');
  const settings = new DeckViewOnly(join(blocker, 'deck-view-only.json'));
  const before = settings.enabled;
  assert.throws(() => settings.set(!before), (error) =>
    error.message === 'Could not save view-only settings.' && typeof error.code === 'string' && error.cause?.code === error.code);
  assert.equal(settings.enabled, before);
});
