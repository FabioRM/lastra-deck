'use strict';

const { readJsonSettings, writeJsonSettings } = require('./json-settings-file');
const { normalizeAquarium, normalizeNightLighting } = require('../shared/aquarium');

class AquariumSettings {
  constructor(file, log = () => {}) {
    this.file = file;
    this.lightingPreview = null;
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

  previewLighting(value) {
    if (value === null) {
      this.lightingPreview = null;
    } else {
      if ((value?.mode !== 'day' && value?.mode !== 'night')
        || !Number.isFinite(value.nightBrightness) || !Number.isFinite(value.glowIntensity)) {
        throw new Error('Invalid aquarium lighting preview.');
      }
      this.lightingPreview = { mode: value.mode, ...normalizeNightLighting(value) };
    }
    return this.lightingPreview;
  }

  configure(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid aquarium settings.');
    const current = normalizeAquarium(settings);
    writeJsonSettings(this.file, { version: 1, settings: current }, { failure: 'Could not save aquarium settings.' });
    this.current = current;
    if (this.lightingPreview) this.previewLighting({ ...current, mode: this.lightingPreview.mode });
    return current;
  }
}

module.exports = { AquariumSettings };
