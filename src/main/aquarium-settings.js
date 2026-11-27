'use strict';

const { readJsonSettings, writeJsonSettings } = require('./json-settings-file');
const { normalizeAquarium } = require('../shared/aquarium');

class AquariumSettings {
  constructor(file, log = () => {}) {
    this.file = file;
    this.current = readJsonSettings(file, {
      maxBytes: 4096,
      parse(data) {
        if (data?.version !== 1) throw new Error('Invalid aquarium settings.');
        return normalizeAquarium(data.settings);
      },
      fallback: () => normalizeAquarium(),
      onError: () => log('Could not read aquarium settings.'),
    });
  }

  configure(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid aquarium settings.');
    const current = normalizeAquarium(settings);
    writeJsonSettings(this.file, { version: 1, settings: current }, { failure: 'Could not save aquarium settings.' });
    this.current = current;
    return current;
  }
}

module.exports = { AquariumSettings };
