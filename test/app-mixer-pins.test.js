'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { AppMixerPins } = require('../src/main/app-mixer-pins');
const { tempDir } = require('./helpers/temp-dir');

function tempFile(t) {
  const directory = tempDir(t, 'lastra-audio-pins-');
  return path.join(directory, 'audio-pins.json');
}

test('places pinned apps first, persists offline controls, and reconnects by app ID', (t) => {
  const file = tempFile(t);
  const browser = { id: 'a'.repeat(64), name: 'Browser', canPin: true, level: 60 };
  const game = { id: 'b'.repeat(64), name: 'Game', canPin: true, level: 70 };
  const duplicateName = { id: 'c'.repeat(64), name: 'Browser', canPin: true, level: 51 };

  const pins = new AppMixerPins(file);
  pins.set(game.id, true, () => [browser, game]);
  pins.set(browser.id, true, () => [browser, game]);
  assert.deepEqual(pins.withStatus([browser, game]).map(({ id }) => id), [game.id, browser.id]);

  const reopened = new AppMixerPins(file);
  assert.deepEqual(reopened.withStatus([duplicateName]), [
    { id: game.id, name: 'Game', pinned: true, online: false },
    { id: browser.id, name: 'Browser', pinned: true, online: false },
    { ...duplicateName, pinned: false, online: true },
  ]);
  const restartedBrowser = { ...browser, name: 'Updated browser name', level: 20 };
  assert.deepEqual(reopened.withStatus([restartedBrowser])[1], { ...restartedBrowser, pinned: true, online: true });

  reopened.set(game.id, false, () => { throw new Error('Should not query Windows to unpin an offline app'); });
  assert.deepEqual(new AppMixerPins(file).withStatus([]), [
    { id: browser.id, name: 'Browser', pinned: true, online: false },
  ]);
});

test('pins only validated stable apps and ignores invalid stored records', (t) => {
  const file = tempFile(t);
  const valid = { id: 'd'.repeat(64), name: 'Music' };
  fs.writeFileSync(file, JSON.stringify({ version: 1, pins: [
    valid, { ...valid, name: 'Duplicate' }, { id: 'invalid', name: 'Invalid record' }, null,
  ] }));
  const pins = new AppMixerPins(file);
  assert.deepEqual(pins.withStatus([]), [{ ...valid, pinned: true, online: false }]);

  assert.throws(() => pins.set('read-files', true, () => []), /Invalid app mixer pin/);
  assert.throws(() => pins.set(valid.id, undefined, () => []), /Invalid app mixer pin/);
  const transient = { id: 'e'.repeat(64), name: 'Transient process', canPin: false };
  assert.throws(() => pins.set(transient.id, true, () => [transient]), /stable audio session/);
  assert.throws(() => pins.set('f'.repeat(64), true, () => []), /stable audio session/);
  assert.equal(pins.withStatus([]).length, 1);
});

test('leaves the in-memory mixer list unchanged when persistence fails', (t) => {
  const file = tempFile(t);
  fs.mkdirSync(file);
  const app = { id: 'e'.repeat(64), name: 'Music', canPin: true };
  const pins = new AppMixerPins(file);
  assert.throws(() => pins.set(app.id, true, () => [app]));
  assert.deepEqual(pins.withStatus([]), []);
});
