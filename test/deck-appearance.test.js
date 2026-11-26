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

  const expected = { ...DEFAULT_APPEARANCE, showPercentSigns: false, cpuReadout: 'gauge', ramReadout: 'number', gpuReadout: 'gauge',
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

test('the deck look saves its style, backdrop, shape and icon choices and rejects unknown ones', (t) => {
  const { LOOK_CHOICES, LOOK_PRESETS, ACCENT_PRESETS, applyAppearance, normalizeAppearance } = require('../src/shared/appearance');
  const file = tempSettings(t);
  const settings = new DeckAppearance(file);
  assert.deepEqual([settings.current.keyStyle, settings.current.backdrop, settings.current.keyShape, settings.current.iconWeight,
    settings.current.hideKeyLabels], ['tinted', 'glow', 'rounded', 'regular', false]);
  for (const [setting, choices] of Object.entries(LOOK_CHOICES)) {
    for (const value of Object.keys(choices)) assert.equal(settings.set(setting, value)[setting], value);
    assert.throws(() => settings.set(setting, 'sparkly'), /Invalid/);
    assert.throws(() => settings.set(setting, true), /Invalid/);
  }
  settings.set('hideKeyLabels', true);
  assert.throws(() => settings.set('hideKeyLabels', 'yes'), /Invalid/);
  const saved = new DeckAppearance(file).current;
  assert.deepEqual([saved.keyStyle, saved.backdrop, saved.keyShape, saved.iconWeight, saved.hideKeyLabels], ['glass', 'grid', 'soft', 'bold', true]);
  assert.equal(normalizeAppearance({ keyStyle: 'neon', backdrop: 7 }).keyStyle, 'tinted');
  assert.equal(normalizeAppearance({ keyStyle: 'neon', backdrop: 7 }).backdrop, 'glow');
  for (const { name, ...look } of Object.values(LOOK_PRESETS)) {
    assert.equal(typeof name, 'string');
    assert.deepEqual(Object.keys(look).sort(), Object.keys(LOOK_CHOICES).sort(), 'a quick look sets every look choice');
    for (const [setting, value] of Object.entries(look)) assert.ok(Object.hasOwn(LOOK_CHOICES[setting], value), `${name}: ${setting}`);
  }
  assert.ok(ACCENT_PRESETS.every((color) => /^#[0-9a-f]{6}$/.test(color)), 'presets are lower-case hex colors the accent setting accepts');

  const root = { dataset: {}, style: { setProperty() {}, removeProperty() {} } };
  applyAppearance(root, saved);
  assert.deepEqual([root.dataset.keyStyle, root.dataset.backdrop, root.dataset.keyShape, root.dataset.iconWeight, root.dataset.keyLabels],
    ['glass', 'grid', 'soft', 'bold', 'hidden']);
  applyAppearance(root, {});
  assert.deepEqual([root.dataset.keyStyle, root.dataset.keyLabels], ['tinted', 'shown']);
});

test('a key keeps its own color and the deck view passes it on', () => {
  const { validateProfile } = require('../src/main/profile');
  const { toView } = require('../src/shared/deck-view');
  const profile = (color) => ({ grid: { cols: 2, rows: 1 }, keys: [
    { id: 'a', label: 'A', color, action: { type: 'delay', ms: 1 } }, { id: 'b', label: 'B', action: { type: 'delay', ms: 1 } }] });
  const [first, second] = toView(validateProfile(profile('#5B9DF9'))).slots;
  assert.equal(first.color, '#5B9DF9');
  assert.equal(Object.hasOwn(second, 'color'), false);
  for (const bad of ['blue', '#fff', 'url(x)', '#5b9df9; color: red', 5]) {
    assert.throws(() => validateProfile(profile(bad)), /"color" must be a hex color/);
  }
});

test('the Minimal and Contrast themes save like any theme and keep the deck plain', (t) => {
  const { THEMES, PLAIN_THEMES, plainLook, applyAppearance } = require('../src/shared/appearance');
  const settings = new DeckAppearance(tempSettings(t));
  for (const theme of ['minimal-dark', 'minimal-light', 'contrast-dark', 'contrast-light']) {
    assert.ok(Object.hasOwn(THEMES, theme));
    assert.ok(PLAIN_THEMES.includes(theme));
    assert.equal(settings.set('theme', theme).theme, theme);
    const root = { dataset: {}, style: { setProperty() {}, removeProperty() {} } };
    applyAppearance(root, settings.current);
    assert.equal(root.dataset.plainLook, 'true');
    assert.equal(root.dataset.highContrast, String(theme.startsWith('contrast-')), 'only the Contrast themes use the high-contrast colors');
    assert.equal(root.dataset.keyStyle, 'tinted', 'the saved look stays for the day another theme is chosen');
  }
  assert.equal(plainLook({ theme: 'midnight', highContrast: false }), false);
  assert.equal(plainLook({ theme: 'midnight', highContrast: true }), true);
  const root = { dataset: {}, style: { setProperty() {}, removeProperty() {} } };
  applyAppearance(root, { theme: 'ocean' });
  assert.deepEqual([root.dataset.plainLook, root.dataset.highContrast], ['false', 'false']);
});
