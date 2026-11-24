'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { DeckAppearance, DEFAULT_APPEARANCE, appearanceMenu } = require('../src/main/deck-appearance');
const { tempDir } = require('./helpers/temp-dir');

function tempSettings(t) {
  const directory = tempDir(t, 'lastra-appearance-');
  return path.join(directory, 'deck-appearance.json');
}

test('Deck appearance starts with defaults and saves independent telemetry readouts', (t) => {
  const file = tempSettings(t);
  const settings = new DeckAppearance(file);
  assert.deepEqual(settings.current, DEFAULT_APPEARANCE);
  assert.equal(fs.existsSync(file), false);

  settings.set('showPercentSigns', false);
  settings.set('cpuReadout', 'gauge');
  settings.set('gpuReadout', 'gauge');
  settings.set('showClockSeconds', true);

  settings.set('theme', 'light');
  settings.set('highContrast', true);
  settings.set('textScale', 125);
  settings.set('largeKeys', true);
  settings.set('idleScreenSeconds', 180);
  settings.set('screenDim', 55);

  const expected = { showPercentSigns: false, cpuReadout: 'gauge', ramReadout: 'number', gpuReadout: 'gauge',
    showClockSeconds: true, theme: 'light', accent: '', highContrast: true, textScale: 125, largeKeys: true, idleScreenSeconds: 180, screenDim: 55 };
  assert.deepEqual(new DeckAppearance(file).current, expected);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
    version: 1, ...expected,
  });
});

test('preset themes and custom accents persist independently and reject CSS input', (t) => {
  const file = tempSettings(t);
  const settings = new DeckAppearance(file);
  for (const theme of ['midnight', 'forest', 'graphite', 'ocean', 'plum', 'sand', 'ember']) assert.equal(settings.set('theme', theme).theme, theme);
  settings.set('accent', '#E2814D');
  assert.throws(() => settings.set('accent', 'red; color: black'), /Invalid/);
  assert.equal(new DeckAppearance(file).current.accent, '#E2814D');
  assert.equal(new DeckAppearance(file).current.theme, 'ember');
  settings.set('accent', '');
  assert.equal(new DeckAppearance(file).current.accent, '');
});

test('Deck appearance validates each saved setting and falls back after a malformed file', (t) => {
  const file = tempSettings(t);
  fs.writeFileSync(file, '\uFEFF{"version":1,"showPercentSigns":false,"showClockSeconds":"true"}');
  assert.deepEqual(new DeckAppearance(file).current, { ...DEFAULT_APPEARANCE, showPercentSigns: false });
  fs.writeFileSync(file, '{"version":1,"theme":"blue","highContrast":true,"textScale":"115","cpuReadout":true,"ramReadout":"dial","gpuReadout":"gauge"}');
  assert.deepEqual(new DeckAppearance(file).current, { ...DEFAULT_APPEARANCE, highContrast: true, gpuReadout: 'gauge' });
  fs.writeFileSync(file, '{ invalid');
  const logs = [];
  const settings = new DeckAppearance(file, (message) => logs.push(message));
  assert.deepEqual(settings.current, DEFAULT_APPEARANCE);
  assert.equal(logs.length, 1);
});

test('A failed appearance write leaves the current setting unchanged', (t) => {
  const file = tempSettings(t);
  fs.mkdirSync(file);
  const settings = new DeckAppearance(file);

  assert.throws(() => settings.set('showPercentSigns', false), /Could not save/);
  assert.throws(() => settings.set('showClockSeconds', 'true'), /Invalid/);
  assert.throws(() => settings.set('theme', 'unknown'), /Invalid/);
  assert.throws(() => settings.set('textScale', 110), /Invalid/);
  assert.throws(() => settings.set('largeKeys', 'true'), /Invalid/);
  assert.throws(() => settings.set('screenDim', 0), /Invalid/);
  assert.throws(() => settings.set('gpuReadout', true), /Invalid/);
  assert.deepEqual(settings.current, DEFAULT_APPEARANCE);
});

test('the appearance menu reports checked settings and forwards typed choices', () => {
  const changes = [];
  const menu = appearanceMenu({ ...DEFAULT_APPEARANCE, theme: 'light', textScale: 115, ramReadout: 'gauge' },
    (setting, value) => changes.push([setting, value]));
  const [themes, contrast, sizes] = menu;
  const metrics = menu.find(({ label }) => label === 'PC telemetry').submenu;
  assert.equal(themes.submenu.find(({ checked }) => checked).label, 'Light');
  assert.equal(sizes.submenu.find(({ checked }) => checked).label, '115%');
  assert.deepEqual(metrics.map(({ label, submenu }) => [label, submenu.find(({ checked }) => checked).label]),
    [['CPU', 'Number'], ['RAM', 'Gauge'], ['GPU', 'Number']]);
  themes.submenu[2].click();
  contrast.click({ checked: true });
  sizes.submenu[2].click();
  metrics[0].submenu[1].click();
  metrics[1].submenu[0].click();
  assert.deepEqual(changes, [['theme', 'dark'], ['highContrast', true], ['textScale', 125],
    ['cpuReadout', 'gauge'], ['ramReadout', 'number']]);
});
