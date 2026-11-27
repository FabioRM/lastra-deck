'use strict';

{
  const SPECIES = Object.freeze({
    fox: { label: 'Fox', name: 'Mochi', emoji: '🦊' },
    rabbit: { label: 'Rabbit', name: 'Luna', emoji: '🐰' },
    cat: { label: 'Cat', name: 'Pixel', emoji: '🐱' },
    panda: { label: 'Red panda', name: 'Nori', emoji: '🐾' },
    axolotl: { label: 'Axolotl', name: 'Bolla', emoji: '🫧' },
    penguin: { label: 'Penguin', name: 'Pip', emoji: '🐧' },
    robodog: { label: 'Robot dog', name: 'K-9', emoji: '🤖' },
    drone: { label: 'Companion drone', name: 'Bip', emoji: '🛸' },
  });
  const HABITATS = Object.freeze({
    grove: 'Lantern Grove', moon: 'Moon Garden', tide: 'Tidal Cove',
    aurora: 'Aurora Peak', oasis: 'Golden Oasis', orbit: 'Orbital Garden',
    neon: 'Neon Alley', cyber: 'Cybergreenhouse',
  });
  const HABITAT_FEATURES = Object.freeze({
    grove: 'Lantern', moon: 'Moon crystal', tide: 'Tide pool', aurora: 'Ice crystal',
    oasis: 'Spring', orbit: 'Orbital beacon', neon: 'Neon terminal', cyber: 'Bio-reactor',
  });
  const DEFAULTS = Object.freeze({ species: 'fox', habitat: 'grove', name: '', motion: true });
  const NAME_LIMIT = 20;
  const DEFAULT_NEEDS = Object.freeze({ fullness: 100, joy: 100, play: 100, energy: 100, hygiene: 100, health: 100 });
  const DECAY = { fullness: 3, joy: 2, play: 4.5, energy: 3.8, hygiene: 2.6 };
  const HEALTH_RISK = { fullness: 2.1, energy: 1.1, hygiene: 1.8 };
  const NAP_MS = 8 * 60_000;

  function normalizePetSettings(value = {}) {
    const { species, habitat, name, motion } = value ?? {};
    return {
      species: typeof species === 'string' && Object.hasOwn(SPECIES, species) ? species : DEFAULTS.species,
      habitat: typeof habitat === 'string' && Object.hasOwn(HABITATS, habitat) ? habitat : DEFAULTS.habitat,
      name: typeof name === 'string' ? [...name.trim()].slice(0, NAME_LIMIT).join('') : '',
      motion: motion !== false,
    };
  }

  function petWakeAt(care) {
    const deficit = 100 - (care.energy ?? DEFAULT_NEEDS.energy);
    return Math.min(care.sleepUntil ?? 0, care.at + Math.ceil(deficit * NAP_MS / 100));
  }

  function petIsSleeping(care, now = Date.now()) {
    return petWakeAt(care) > Math.max(now, care.at);
  }

  function hoursBelowCareThreshold(start, end, hours) {
    const threshold = 35;
    const low = Math.min(start, end);
    const high = Math.max(start, end);
    if (low >= threshold) return 0;
    if (high <= threshold) return hours;
    return hours * (threshold - low) / (high - low);
  }

  function petNeeds(care, now = Date.now()) {
    const elapsed = Math.max(0, now - care.at);
    const sleepMs = Math.max(0, Math.min(now, petWakeAt(care)) - care.at);
    const hours = (elapsed - sleepMs) / 3_600_000;
    const sleepHours = sleepMs / 3_600_000;
    const needs = {};
    let healthLoss = 0;
    for (const [stat, rate] of Object.entries(DECAY)) {
      const value = care[stat] ?? DEFAULT_NEEDS[stat];
      const afterSleep = stat === 'energy' ? Math.min(100, value + (sleepMs / NAP_MS) * 100)
        : value - sleepHours * rate * .5;
      const current = afterSleep - hours * rate;
      needs[stat] = Math.max(15, current);
      if (HEALTH_RISK[stat]) {
        const strain = hoursBelowCareThreshold(value, afterSleep, sleepHours) + hoursBelowCareThreshold(afterSleep, current, hours);
        healthLoss += HEALTH_RISK[stat] * strain;
      }
    }
    needs.health = Math.max(15, (care.health ?? DEFAULT_NEEDS.health) - healthLoss);
    return needs;
  }

  function initialPetCare(at = Date.now()) { return { ...DEFAULT_NEEDS, at, sleepUntil: 0 }; }

  function petEmotion(needs, sleeping) {
    if (sleeping) return 'sleeping';
    if (!needs) return 'calm';
    if (needs.health < 42) return 'unwell';
    const emotions = { fullness: 'hungry', joy: 'lonely', play: 'bored', energy: 'sleepy', hygiene: 'uncomfortable' };
    const urgent = Object.keys(emotions).reduce((lowest, stat) => needs[stat] < needs[lowest] ? stat : lowest);
    if (needs[urgent] < 43) return emotions[urgent];
    return needs.joy >= 80 && needs.energy >= 57 ? 'joyful' : 'calm';
  }

  const pet = Object.freeze({ SPECIES, HABITATS, HABITAT_FEATURES, DEFAULTS, DEFAULT_NEEDS, NAME_LIMIT, NAP_MS,
    normalizePetSettings, initialPetCare, petEmotion, petIsSleeping, petNeeds, petWakeAt });
  if (typeof module === 'object') module.exports = pet;
  else window.LastraPet = pet;
}
