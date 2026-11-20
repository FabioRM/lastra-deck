// @ts-check
'use strict';

const { readJsonSettings, writeJsonSettings } = require('./json-settings-file');
const { DEFAULT_APPEARANCE, THEMES, TEXT_SCALES, DIM_LEVELS, TELEMETRY_READOUTS, READOUT_FORMATS,
  normalizeAppearance, validAppearanceSetting } = require('../shared/appearance');

function read(file, log) {
  return readJsonSettings(file, {
    maxBytes: 4_096,
    parse(data) {
      if (data?.version !== 1) throw new Error('Unsupported settings version');
      return normalizeAppearance(data);
    },
    fallback: () => ({ ...DEFAULT_APPEARANCE }),
    onError: () => log('Deck appearance settings unavailable. Using defaults.'),
  });
}

class DeckAppearance {
  constructor(file, log = () => {}) {
    this.file = file;
    this.current = read(file, log);
  }

  set(setting, value) {
    if (!validAppearanceSetting(setting, value)) {
      throw new Error('Invalid Deck appearance setting');
    }
    if (this.current[setting] === value) return this.current;
    const next = { ...this.current, [setting]: value };
    writeJsonSettings(this.file, { version: 1, ...next }, { failure: 'Could not save Deck appearance settings.' });
    this.current = next;
    return this.current;
  }
}

function appearanceMenu(current, set) {
  const checkbox = (setting, label) => ({ label, type: 'checkbox', checked: current[setting],
    click: ({ checked }) => set(setting, checked) });
  const choices = (setting, label, values) => ({ label, submenu: values.map(([value, name]) => ({
    label: name, type: 'radio', checked: current[setting] === value, click: () => set(setting, value),
  })) });
  return [
    choices('theme', 'Theme', Object.entries(THEMES)),
    checkbox('highContrast', 'High contrast'),
    choices('textScale', 'Text size', TEXT_SCALES.map((size) => [size, `${size}%`])),
    checkbox('largeKeys', 'Large Deck Keys'),
    choices('screenDim', 'Night dimming', [100, 80, 55, 35].map((value) => [value, DIM_LEVELS[value]])),
    { type: 'separator' },
    { label: 'PC telemetry', submenu: Object.entries(TELEMETRY_READOUTS).map(([setting, label]) =>
      choices(setting, label, Object.entries(READOUT_FORMATS))) },
    checkbox('showPercentSigns', 'Show percent signs'),
    checkbox('showClockSeconds', 'Show clock seconds'),
  ];
}

module.exports = { DeckAppearance, DEFAULT_APPEARANCE, appearanceMenu };
