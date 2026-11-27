'use strict';

const { normalizePetSettings, initialPetCare, DEFAULT_NEEDS, NAP_MS, petIsSleeping, petNeeds, petWakeAt } = require('../shared/deck-pet');
const { readJsonSettings, writeJsonSettings } = require('./json-settings-file');

const CARE = new Map([
  ['feed', { fullness: 33, joy: 5, hygiene: -2 }],
  ['play', { play: 32, joy: 13, fullness: -5, energy: -8, hygiene: -5 }],
  ['pet', { joy: 14 }],
  ['wash', { hygiene: 56, joy: 5 }],
  ['medicine', { health: 36 }],
  ['sleep', {}],
]);

const HABITAT_CARE = new Map([
  ['explore', { play: 12, joy: 5, energy: -2 }],
  ['observe', { joy: 6, play: 5 }],
  ['drink', { fullness: 10, joy: 4 }],
  ['forage', { fullness: 14, joy: 4 }],
  ['splash', { hygiene: 18, play: 8, joy: 5, energy: -3 }],
  ['rest', { energy: 18, joy: 4 }],
  ['groom', { hygiene: 20, joy: 3 }],
  ['frolic', { play: 14, joy: 7, fullness: -3, energy: -4, hygiene: -2 }],
]);
const AUTONOMOUS_SCALE = .065;
const AUTONOMOUS_CEILING = 72;

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
        const hasHealth = data.version === 3;
        if (!(hasHealth || data.version === 2) || !keys.every((key) => (!hasHealth && key === 'health') || validStat(care[key]))
          || !Number.isSafeInteger(care.sleepUntil)
          || (care.sleepUntil !== 0 && (care.sleepUntil < care.at || care.sleepUntil > care.at + NAP_MS))) {
          throw new Error('Invalid pet data.');
        }
        if (!hasHealth) {
          const at = Math.max(care.at, now());
          const sleepUntil = petIsSleeping(care, at) ? petWakeAt(care) : 0;
          migrated = true;
          return { settings, care: { ...petNeeds(care, at), health: DEFAULT_NEEDS.health, at, sleepUntil } };
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
    writeJsonSettings(this.file, { version: 3, ...current }, { failure: 'Could not save the deck pet.' });
    this.current = current;
    return current;
  }

  configure(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid pet settings.');
    return this.save({ ...this.current, settings: normalizePetSettings(settings) });
  }

  care(action, automatic = false) {
    const gains = HABITAT_CARE.get(action) ?? (!automatic && CARE.get(action));
    if (typeof automatic !== 'boolean' || !gains) throw new Error('Invalid pet action.');
    const previous = this.current.care;
    const at = Math.max(previous.at, this.now());
    const sleeping = petIsSleeping(previous, at);
    if (sleeping && automatic) return this.current;
    if (sleeping && action !== 'sleep' && action !== 'pet') throw new Error('Your pet is sleeping.');
    const needs = petNeeds(previous, at);
    if (!sleeping) {
      let changed = false;
      for (const [key, gain] of Object.entries(gains)) {
        const limit = automatic ? Math.max(AUTONOMOUS_CEILING, needs[key]) : 100;
        const value = Math.min(limit, Math.max(15, needs[key] + gain * (automatic ? AUTONOMOUS_SCALE : 1)));
        changed ||= value !== needs[key];
        needs[key] = value;
      }
      if (automatic && !changed) return this.current;
    }
    let sleepUntil = 0;
    if (action === 'sleep' && !sleeping) {
      if (Math.round(needs.energy) === 100) return this.current;
      sleepUntil = petWakeAt({ ...needs, at, sleepUntil: at + NAP_MS });
    }
    return this.save({ ...this.current, care: { ...needs, at, sleepUntil } });
  }
}

module.exports = { DeckPet };
