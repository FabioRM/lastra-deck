'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { InterfaceLanguage, systemLanguage, matchesInterfaceUrl } = require('../src/main/interface-language');
const { translate } = require('../src/shared/i18n');
const { findActions } = require('../src/editor/action-palette');
const { tempDir } = require('./helpers/temp-dir');

test('system language follows the first supported Windows preference and defaults to English', () => {
  assert.equal(systemLanguage(['fr-FR', 'it-CH', 'en-GB']), 'it');
  assert.equal(systemLanguage(['en-US', 'it-IT']), 'en');
  assert.equal(systemLanguage(['ja-JP']), 'en');
  assert.equal(systemLanguage([]), 'en');
});

test('interface language saves and restores independently of the selected Windows language', (t) => {
  const file = path.join(tempDir(t, 'lastra-language-'), 'language.json');
  const create = () => new InterfaceLanguage(file, () => ['it-IT']);
  const initial = create();
  assert.deepEqual(initial.snapshot(), { preference: 'system', language: 'it' });
  assert.deepEqual(initial.set('en'), { preference: 'en', language: 'en' });
  assert.deepEqual(create().snapshot(), { preference: 'en', language: 'en' });
  assert.throws(() => initial.set('fr'), /supported interface language/);
  assert.equal(initial.set('system').language, 'it');
  fs.writeFileSync(file, '{broken');
  assert.deepEqual(create().snapshot(), { preference: 'system', language: 'it' });
});

test('Italian translations preserve inserted labels and English is the missing-string fallback', () => {
  assert.equal(translate('it', 'Save profile'), 'Salva profilo');
  assert.equal(translate('en', 'Save profile'), 'Save profile');
  assert.equal(translate('it', 'Provider-specific message'), 'Provider-specific message');
  assert.equal(translate('it', 'Slot {number}, {label}', { number: 9, label: 'Copy {number}' }), 'Cella 9, Copy {number}');
  const italian = (message) => translate('it', message);
  assert.deepEqual(findActions('scorciatoia da tastiera', 'Keyboard', ['hotkey', 'text'], italian).map(({ id }) => id), ['hotkey']);
});

test('the language query leaves the trusted interface document and other URL components pinned', () => {
  const editor = 'file:///lastra/src/editor/index.html';
  assert.equal(matchesInterfaceUrl(editor, editor + '?language=it'), true);
  assert.equal(matchesInterfaceUrl(editor, editor + '?language=en'), true);
  for (const url of [editor + '?language=fr', editor + '?language=it&other=1', editor + '?language=it#fragment',
    'file:///lastra/src/renderer/index.html?language=it', 'https://example.com/?language=it']) {
    assert.equal(matchesInterfaceUrl(editor, url), false);
  }
});
