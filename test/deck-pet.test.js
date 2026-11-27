'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tempDir } = require('./helpers/temp-dir');
const { DeckPet } = require('../src/main/deck-pet');
const { readSettings } = require('../src/main/configuration-backup');
const { DEFAULTS, NAP_MS, petIsSleeping, petNeeds } = require('../src/shared/deck-pet');

test('pet care retains elapsed time when interactions are close together', (t) => {
  const file = path.join(tempDir(t), 'deck-pet.json');
  let now = 10_000;
  const pet = new DeckPet(file, undefined, () => now);
  for (let index = 0; index < 12; index++) {
    now += 300_000;
    pet.care('pet');
  }
  const needs = petNeeds(pet.current.care, now);
  assert.equal(needs.fullness, 81);
  assert.equal(needs.joy, 100);
  assert.ok(needs.play < 75 && needs.energy < 80 && needs.hygiene < 90);
  assert.deepEqual(petNeeds(pet.current.care, now + 100 * 3_600_000), { fullness: 15, joy: 15, play: 15, energy: 15, hygiene: 15 });
  assert.throws(() => pet.care('invalid'), /Invalid pet action/);
  pet.care('feed');
  assert.equal(pet.current.care.fullness, 100);
});

test('pet preferences and progress persist together and are exported with settings', (t) => {
  const directory = tempDir(t);
  const file = path.join(directory, 'deck-pet.json');
  const pet = new DeckPet(file);
  const care = pet.care('play').care;
  const settings = pet.configure({ species: 'rabbit', habitat: 'moon', name: '  Luna  ', motion: false }).settings;
  assert.deepEqual(settings, { species: 'rabbit', habitat: 'moon', name: 'Luna', motion: false });
  assert.deepEqual(new DeckPet(file).current, { settings, care });
  assert.deepEqual(readSettings(directory).files['deck-pet.json'], { version: 2, settings, care });
  for (const [species, habitat] of [['panda', 'oasis'], ['axolotl', 'orbit'], ['penguin', 'aurora'], ['robodog', 'neon'], ['drone', 'cyber']]) {
    pet.configure({ species, habitat, motion: false });
    assert.deepEqual(new DeckPet(file).current, { settings: { species, habitat, name: '', motion: false }, care });
  }
  assert.deepEqual(pet.configure({ species: ['rabbit'], habitat: ['moon'] }).settings, DEFAULTS);
  fs.writeFileSync(file, '{"version":1,"care":{"fullness":999}}');
  assert.deepEqual(new DeckPet(file).current.settings, DEFAULTS);
});

test('a legacy pet keeps its preferences and decayed progress while new needs start fresh', (t) => {
  const file = path.join(tempDir(t), 'deck-pet.json');
  const settings = { ...DEFAULTS, name: 'Nebbia', species: 'cat' };
  fs.writeFileSync(file, JSON.stringify({ version: 1, settings, care: { fullness: 71, joy: 67, at: 10 } }));
  const pet = new DeckPet(file, undefined, () => 3_600_010);
  assert.deepEqual(pet.current, { settings, care: {
    fullness: 68, joy: 65, play: 75, energy: 80, hygiene: 90, at: 3_600_010, sleepUntil: 0,
  } });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).version, 2);
});

test('play, cleaning and naps update separate needs and a nap keeps progressing across restart', (t) => {
  const file = path.join(tempDir(t), 'deck-pet.json');
  let now = 50_000;
  let pet = new DeckPet(file, undefined, () => now);
  const active = pet.care('play').care;
  assert.deepEqual(active, { fullness: 79, joy: 100, play: 100, energy: 72, hygiene: 85, at: now, sleepUntil: 0 });
  assert.equal(pet.care('wash').care.hygiene, 100);
  assert.equal(pet.care('sleep').care.sleepUntil, now + NAP_MS);
  now += NAP_MS / 8;
  pet = new DeckPet(file, undefined, () => now);
  assert.equal(petIsSleeping(pet.current.care, now), true);
  assert.throws(() => pet.care('feed'), /sleeping/);
  assert.equal(petNeeds(pet.current.care, now).energy, 84.5);
  assert.equal(pet.care('pet').care.sleepUntil, 0);
  assert.equal(pet.current.care.energy, 84.5);
  pet.care('sleep');
  now += NAP_MS;
  assert.equal(petIsSleeping(pet.current.care, now), false);
  assert.equal(petNeeds(pet.current.care, now).energy, 100);
});

test('touch and care actions cycle through distinct clips without repetition at shuffle boundaries', async () => {
  const { clipLength, shuffleClips, sampleClip } = await import('../src/renderer/deck-pet-behavior.mjs');
  const choose = shuffleClips(() => .34);
  for (const [action, alternatives] of [['pet', 5], ['play', 4], ['feed', 3], ['wash', 4], ['sky', 3]]) {
    const first = Array.from({ length: alternatives }, () => choose(action));
    assert.equal(new Set(first).size, alternatives);
    assert.notEqual(first.at(-1), choose(action));
    assert.ok(first.every((clip) => clipLength(clip) > 1));
  }
  assert.ok(sampleClip('twirl', .74).turn > Math.PI / 2);
  assert.ok(sampleClip('flop', .95).lean > .75);
  assert.ok(sampleClip('gaze', .43).pitch < 0);
  assert.deepEqual(sampleClip('gaze', clipLength('gaze')), {});
});

test('the most urgent need guides idle activity and consecutive choices vary', async () => {
  const { chooseActivity } = await import('../src/renderer/deck-pet-behavior.mjs');
  for (const [need, pair] of [['fullness', ['sniff', 'sip']], ['joy', ['wave', 'nuzzle']], ['play', ['pounce', 'dance']],
    ['energy', ['yawn', 'rest']], ['hygiene', ['scrub', 'shake']]]) {
    const needs = { fullness: 80, joy: 80, play: 80, energy: 80, hygiene: 80, [need]: 28 };
    const first = chooseActivity(needs, null, () => 0);
    assert.equal(first, pair[0]);
    assert.equal(chooseActivity(needs, first, () => 0), pair[1]);
  }
});
