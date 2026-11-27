'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { tempDir } = require('./helpers/temp-dir');
const { DeckPet } = require('../src/main/deck-pet');
const { readSettings } = require('../src/main/configuration-backup');
const { DEFAULTS, NAP_MS, petEmotion, petIsSleeping, petNeeds } = require('../src/shared/deck-pet');

test('pet care retains elapsed time when interactions are close together', (t) => {
  const file = path.join(tempDir(t), 'deck-pet.json');
  let now = 10_000;
  const pet = new DeckPet(file, undefined, () => now);
  const full = { fullness: 100, joy: 100, play: 100, energy: 100, hygiene: 100, health: 100 };
  assert.deepEqual(petNeeds(pet.current.care, now), full);
  assert.equal(pet.care('sleep').care.sleepUntil, 0);
  for (let index = 0; index < 12; index++) {
    now += 300_000;
    pet.care('pet');
  }
  const needs = petNeeds(pet.current.care, now);
  assert.equal(needs.fullness, 97);
  assert.equal(needs.joy, 100);
  assert.ok(needs.play < 100 && needs.energy < 100 && needs.hygiene < 100);
  assert.deepEqual(petNeeds(pet.current.care, now + 100 * 3_600_000),
    { fullness: 15, joy: 15, play: 15, energy: 15, hygiene: 15, health: 15 });
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
  assert.deepEqual(readSettings(directory).files['deck-pet.json'], { version: 3, settings, care });
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
    fullness: 68, joy: 65, play: 100, energy: 100, hygiene: 100, health: 100, at: 3_600_010, sleepUntil: 0,
  } });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).version, 3);
});

test('play, cleaning and naps update separate needs and a nap keeps progressing across restart', (t) => {
  const file = path.join(tempDir(t), 'deck-pet.json');
  let now = 50_000;
  let pet = new DeckPet(file, undefined, () => now);
  const active = pet.care('play').care;
  assert.deepEqual(active, { fullness: 95, joy: 100, play: 100, energy: 92, hygiene: 95, health: 100, at: now, sleepUntil: 0 });
  assert.equal(pet.care('wash').care.hygiene, 100);
  assert.equal(pet.care('sleep').care.sleepUntil, now + NAP_MS * .08);
  now += NAP_MS / 16;
  pet = new DeckPet(file, undefined, () => now);
  assert.equal(petIsSleeping(pet.current.care, now), true);
  assert.throws(() => pet.care('feed'), /sleeping/);
  assert.equal(petNeeds(pet.current.care, now).energy, 98.25);
  assert.equal(pet.care('pet').care.sleepUntil, 0);
  assert.equal(pet.current.care.energy, 98.25);
  const charging = pet.care('sleep').care;
  assert.equal(petIsSleeping(charging, charging.sleepUntil - 1), true);
  now = charging.sleepUntil;
  assert.equal(petIsSleeping(pet.current.care, now), false);
  assert.equal(petNeeds(pet.current.care, now).energy, 100);
  const legacyNap = { ...charging, sleepUntil: charging.at + NAP_MS };
  assert.equal(petIsSleeping(legacyNap, now), false);
  assert.equal(petNeeds(legacyNap, now).energy, 100);
  assert.ok(petNeeds(legacyNap, now + 60_000).energy < 100);
});

test('touch and care actions cycle through distinct clips without repetition at shuffle boundaries', async () => {
  const { clipLength, shuffleClips, sampleClip } = await import('../src/renderer/deck-pet-behavior.mjs');
  const choose = shuffleClips(() => .34);
  for (const [action, alternatives] of [['pet', 5], ['play', 8], ['feed', 3], ['wash', 4], ['medicine', 3], ['sky', 3]]) {
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

test('each ball trick has a separate continuous path and singing follows a distinct clip', async () => {
  const { clipEffect, clipLength, sampleClip } = await import('../src/renderer/deck-pet-behavior.mjs');
  const { playBallPosition } = await import('../src/renderer/deck-pet-reactions.mjs');
  const traces = [];
  for (const clip of ['fetch', 'dribble', 'volley', 'leapfrog']) {
    const duration = clipLength(clip);
    assert.equal(clipEffect(clip), 'ball');
    assert.equal(playBallPosition(clip, -.01), undefined);
    assert.equal(playBallPosition(clip, duration + .01), undefined);
    const positions = Array.from({ length: 151 }, (_, index) => playBallPosition(clip, duration * (index / 150)));
    assert.ok(positions.every(([x, y, z]) => [x, y, z].every(Number.isFinite) && y >= .18));
    assert.ok(positions.slice(1).every((point, index) => Math.hypot(...point.map((value, axis) => value - positions[index][axis])) < .15));
    traces.push(JSON.stringify(positions));
  }
  assert.equal(new Set(traces).size, 4);
  assert.ok(playBallPosition('volley', .98)[1] > 1.7);
  assert.ok(sampleClip('leapfrog', .60).lift > .6);
  assert.equal(clipEffect('sing'), 'music');
  assert.ok(sampleClip('sing', 1.3).open > .7);
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

test('habitat actions apply the corresponding benefits and costs, with smaller gains from self-care', (t) => {
  const file = path.join(tempDir(t), 'deck-pet.json');
  const pet = new DeckPet(file, undefined, () => 100);
  const settings = pet.current.settings;
  pet.save({ settings, care: { fullness: 84, joy: 88, play: 75, energy: 80, hygiene: 90, health: 100, at: 100, sleepUntil: 0 } });
  const pond = pet.care('splash').care;
  assert.deepEqual(pond, { fullness: 84, joy: 93, play: 83, energy: 77, hygiene: 100, health: 100, at: 100, sleepUntil: 0 });
  assert.equal(pet.care('drink').care.fullness, 94);
  assert.equal(pet.care('rest').care.energy, 95);
  assert.equal(pet.care('observe').care.play, 88);
  assert.throws(() => pet.care('feed', true), /Invalid pet action/);

  pet.save({ settings, care: { fullness: 31, joy: 55, play: 75, energy: 60, hygiene: 70, health: 100, at: 100, sleepUntil: 0 } });
  assert.ok(pet.care('forage', true).care.fullness > 31);
  for (let count = 0; count < 10; count++) pet.care('groom', true);
  assert.equal(pet.current.care.hygiene, 72);
  assert.equal(pet.care('groom').care.hygiene, 92);
  const asleep = pet.care('sleep');
  assert.equal(pet.care('observe', true), asleep);
  assert.deepEqual(new DeckPet(file, undefined, () => 100).current, asleep);
});

test('needs and sleep determine the resting expression, and startled and affectionate poses differ', async () => {
  const { emotionPose, clipLength } = await import('../src/renderer/deck-pet-behavior.mjs');
  const needs = { fullness: 84, joy: 88, play: 75, energy: 80, hygiene: 90 };
  assert.equal(petEmotion(needs, false), 'joyful');
  assert.equal(petEmotion({ ...needs, energy: 32 }, false), 'sleepy');
  assert.equal(petEmotion({ ...needs, joy: 29, fullness: 30 }, false), 'lonely');
  assert.equal(petEmotion({ ...needs, joy: 29 }, true), 'sleeping');
  const startled = emotionPose('calm', 'startled', clipLength('startled') / 2, 0);
  const affectionate = emotionPose('calm', 'nuzzle', clipLength('nuzzle') / 2, 0);
  assert.ok(startled.lid < 0 && startled.open > .3);
  assert.ok(affectionate.lid > 0 && affectionate.cheeks > .6);
});

test('older pets keep their needs and active naps, and prolonged neglect can be treated with medicine', (t) => {
  const file = path.join(tempDir(t), 'deck-pet.json');
  let now = 12_000;
  const napEnd = now + NAP_MS * .5;
  const care = { fullness: 28, joy: 64, play: 58, energy: 50, hygiene: 29, at: now, sleepUntil: napEnd };
  fs.writeFileSync(file, JSON.stringify({ version: 2, settings: DEFAULTS, care }));
  now += NAP_MS * .25;
  let pet = new DeckPet(file, undefined, () => now);
  assert.equal(pet.current.care.health, 100);
  assert.equal(pet.current.care.energy, 75);
  assert.equal(pet.current.care.sleepUntil, napEnd);
  now = napEnd + 17 * 3_600_000;
  assert.ok(petNeeds(pet.current.care, now).health < 40);
  assert.equal(petEmotion(petNeeds(pet.current.care, now), false), 'unwell');
  const before = petNeeds(pet.current.care, now).health;
  assert.equal(pet.care('medicine').care.health, before + 36);
  assert.equal(pet.care('medicine').care.health, 100);
  assert.throws(() => pet.care('medicine', true), /Invalid pet action/);
  pet = new DeckPet(file, undefined, () => now);
  assert.equal(pet.current.care.health, 100);
});
