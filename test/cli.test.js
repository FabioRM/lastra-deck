'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { parseArgs } = require('../src/main/cli');

test('no switches start the deck with defaults', () => {
  assert.deepEqual(parseArgs([]), {
    windowed: false, preview: null, states: false, portrait: false, stats: false, display: null, editor: false, profile: null,
  });
});

test('unknown arguments such as the app path are ignored', () => {
  const opts = parseArgs(['.', '--inspect', '--unknown=1']);
  assert.equal(opts.preview, null);
  assert.equal(opts.windowed, false);
});

test('preview switches', () => {
  assert.equal(parseArgs(['--preview']).preview, 'preview.png');
  const opts = parseArgs(['--preview=out/deck.png', '--preview-states', '--preview-portrait', '--preview-pack=vscode']);
  assert.equal(opts.preview, 'out/deck.png');
  assert.equal(opts.states, true);
  assert.equal(opts.portrait, true);
  assert.equal(opts.previewPack, 'vscode');
  assert.equal(opts.stats, false);
});

test('the Stats layout check also previews Stats', () => {
  const opts = parseArgs(['--verify-stats-layout']);
  assert.equal(opts.stats, true);
  assert.equal(opts.verifyStats, true);
  assert.equal(parseArgs(['--preview-stats']).verifyStats, undefined);
});

test('verification and measurement flags', () => {
  const opts = parseArgs(['--verify-deck-swipe', '--verify-audio-faders', '--measure-deck', '--editor', '--windowed']);
  assert.equal(opts.verifySwipe, true);
  assert.equal(opts.verifyFaders, true);
  assert.equal(opts.measureDeck, true);
  assert.equal(opts.editor, true);
  assert.equal(opts.windowed, true);
});

test('a relative profile resolves against the working folder and the display stays a string', () => {
  const cwd = path.resolve('/lastra-work');
  const opts = parseArgs(['--profile=profiles/test.json', '--display=2779098405'], { cwd });
  assert.equal(opts.profile, path.join(cwd, 'profiles', 'test.json'));
  assert.equal(opts.display, '2779098405');
  assert.equal(parseArgs(['--profile=x.json']).profile, path.resolve('x.json'));
});

test('a later switch wins over an earlier one', () => {
  assert.equal(parseArgs(['--preview=a.png', '--preview=b.png']).preview, 'b.png');
});
