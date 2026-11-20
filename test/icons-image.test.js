'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { imageDataUrl } = require('../src/main/icons');
const { tempDir } = require('./helpers/temp-dir');

test('key images refuse network and device paths so rendering never authenticates to a remote host', () => {
  for (const file of [String.raw`\\attacker.invalid\share\a.png`, String.raw`\\attacker@SSL\s\a.png`, '//attacker.invalid/share/a.png',
    String.raw`\\?\UNC\attacker.invalid\share\a.png`, String.raw`\\.\pipe\a.png`]) {
    assert.equal(imageDataUrl(file), null, file);
  }
});

test('key images are re-encoded only when the file changes', (t) => {
  const dir = tempDir(t, 'lastra-icons-');
  const file = path.join(dir, 'key.png');
  fs.writeFileSync(file, Buffer.from('first'));
  const first = imageDataUrl(file);
  assert.equal(first, `data:image/png;base64,${Buffer.from('first').toString('base64')}`);
  assert.equal(imageDataUrl(file), first);
  fs.writeFileSync(file, Buffer.from('second!'));
  fs.utimesSync(file, new Date(), new Date(Date.now() + 5_000));
  assert.equal(imageDataUrl(file), `data:image/png;base64,${Buffer.from('second!').toString('base64')}`);
});
