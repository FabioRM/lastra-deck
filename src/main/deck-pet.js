'use strict';

const { normalizePetSettings, initialPetCare, DEFAULT_NEEDS, NAP_MS, petIsSleeping, petNeeds } = require('../shared/deck-pet');
const { readJsonSettings, writeJsonSettings } = require('./json-settings-file');

const CARE = new Map([
  ['feed', { fullness: 33, joy: 5, hygiene: -2 }],
  ['play', { play: 32, joy: 13, fullness: -5, energy: -8, hygiene: -5 }],
  ['pet', { joy: 14 }],
  ['wash', { hygiene: 56, joy: 5 }],
  ['explore', { play: 17, joy: 7, energy: -2 }],
  ['sleep', {}],
]);

const validStat = (value) => Number.isFinite(value) && value >= 15 && value <= 100;

class DeckPet {
  constructor(file, log = () => {}, now = Date.now) {
    this.file = file;
    this.now = now;
    let migrated = false;
    this.current = readJsonSettings(file, {
      maxBytes: 4096,
      parse(data) {
        const { care } = data ?? {};
        if (!Number.isSafeInteger(care?.at) || care.at < 0) throw new Error('Invalid pet timestamp.');
        const settings = normalizePetSettings(data.settings);
        if (data.version === 1 && validStat(care.fullness) && validStat(care.joy)) {
          const at = Math.max(care.at, now());
          const original = petNeeds({ ...initialPetCare(care.at), ...care, sleepUntil: 0 }, at);
          migrated = true;
          return { settings, care: { ...initialPetCare(at), fullness: original.fullness, joy: original.joy } };
        }
        const keys = Object.keys(DEFAULT_NEEDS);
        if (data.version !== 2 || !keys.every((key) => validStat(care[key])) || !Number.isSafeInteger(care.sleepUntil)
          || (care.sleepUntil !== 0 && (care.sleepUntil < care.at || care.sleepUntil > care.at + NAP_MS))) {
          throw new Error('Invalid pet data.');
        }
        const needs = Object.fromEntries(keys.map((key) => [key, care[key]]));
        return { settings, care: { ...needs, at: care.at, sleepUntil: care.sleepUntil } };
      },
      fallback: () => ({ settings: normalizePetSettings(), care: initialPetCare(now()) }),
      onError: () => log('Could not read deck pet settings.'),
    });
    if (migrated) {
      try { this.save(this.current); }
      catch { log('Could not update the saved deck pet.'); }
    }
  }

  save(current) {
    writeJsonSettings(this.file, { version: 2, ...current }, { failure: 'Could not save the deck pet.' });
    this.current = current;
    return current;
  }

  configure(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid pet settings.');
    return this.save({ ...this.current, settings: normalizePetSettings(settings) });
  }

  care(action) {
    const gains = CARE.get(action);
    if (!gains) throw new Error('Invalid pet action.');
    const previous = this.current.care;
    const at = Math.max(previous.at, this.now());
    const sleeping = petIsSleeping(previous, at);
    if (sleeping && action !== 'sleep' && action !== 'pet') throw new Error('Your pet is sleeping.');
    const needs = petNeeds(previous, at);
    if (!sleeping) {
      for (const [key, gain] of Object.entries(gains)) needs[key] = Math.min(100, Math.max(15, needs[key] + gain));
    }
    return this.save({ ...this.current, care: { ...needs, at, sleepUntil: action === 'sleep' && !sleeping ? at + NAP_MS : 0 } });
  }
}

module.exports = { DeckPet };
