'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SETTINGS = ['deck-appearance.json', 'deck-navigation.json', 'interface-language.json', 'pomodoro.json',
  'timers.json', 'tool-choices.json', 'weather.json', 'feeds.json', 'deck-shortcuts.json', 'deck-view-only.json', 'deck-pet.json', 'aquarium.json'];
const EXTRA = /^(?:profile(?:-[a-z]+)?|deck-shortcuts-[a-z]+)\.json$/;

function readSettings(directory, names = SETTINGS) {
  const selected = new Set(names);
  for (const name of fs.readdirSync(directory)) if (EXTRA.test(name)) selected.add(name);
  const files = {};
  for (const name of selected) {
    const file = path.join(directory, name);
    try {
      const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
      files[name] = JSON.parse(text);
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`Could not read ${name}.`);
    }
  }
  return { version: 1, files };
}

module.exports = { SETTINGS, readSettings };
