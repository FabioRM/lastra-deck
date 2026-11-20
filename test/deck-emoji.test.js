'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { EmojiUsage, insertEmoji } = require('../src/main/deck-emoji');
const { DeckNavigation } = require('../src/main/deck-navigation');
const { createActionRunner } = require('../src/main/actions');
const { EMOJI_CATALOG, EMOJI_GROUPS, EMOJI_KEYS } = require('../src/shared/emoji-catalog');
const { tempDir } = require('./helpers/temp-dir');

function settings(t) {
  const directory = tempDir(t, 'lastra-emoji-');
  return directory;
}

test('the local catalog includes every Unicode 18.0 emoji and component in a category', () => {
  const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  assert.equal(EMOJI_CATALOG.length, 3963 + 9);
  assert.equal(new Set(EMOJI_CATALOG.map(({ id }) => id)).size, EMOJI_CATALOG.length);
  assert.deepEqual([...new Set(EMOJI_CATALOG.map(({ group }) => group))], EMOJI_GROUPS.map(({ id }) => id));
  for (const { id, glyph, label } of EMOJI_CATALOG) {
    assert.equal([...segments.segment(glyph)].length, 1, label);
    assert.ok(label);
    assert.equal(Array.from(glyph, (point) => point.codePointAt(0).toString(16)).join('-'), id);
  }
  for (const [glyph, group] of [['🏽', 'people'], ['👍🏽', 'people'], ['👩🏽‍💻', 'people'],
    ['🏳️‍🌈', 'flags'], ['🇮🇹', 'flags'], ['1️⃣', 'symbols'], ['🛙', 'travel']]) {
    assert.equal(EMOJI_CATALOG.find((entry) => entry.glyph === glyph)?.group, group, glyph);
  }
});

test('frequent emoji are promoted after reopening with deterministic ranking and no duplicate keys', (t) => {
  const directory = settings(t);
  const file = path.join(directory, 'emoji-usage.json');
  const first = new EmojiUsage(file);
  assert.deepEqual(first.catalog(), { groups: EMOJI_GROUPS, entries: EMOJI_KEYS, frequent: [], tones: {} });
  const least = EMOJI_CATALOG.at(-3);
  const most = EMOJI_CATALOG.at(-1);
  first.record(least.id);
  first.record(most.id);
  first.record(most.id);
  first.record('unknown');
  const reopened = new EmojiUsage(file);
  const catalog = reopened.catalog();
  assert.deepEqual(catalog.frequent, [most.id, least.id]);
  assert.equal(catalog.entries, EMOJI_KEYS);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).counts, [[least.id, 1], [most.id, 2]]);

  const navigation = path.join(directory, 'deck-navigation.json');
  new DeckNavigation(navigation).setView('emoji');
  assert.equal(new DeckNavigation(navigation).current.view, 'emoji');
});

test('skin tone families have a neutral key and retain all single and mixed sequences', () => {
  const displayed = EMOJI_KEYS.flatMap((entry) => [entry.id, ...(entry.tones ?? []).map(({ id }) => id)]);
  assert.equal(displayed.length, new Set(displayed).size);
  assert.deepEqual(new Set(displayed), new Set(EMOJI_CATALOG.map(({ id }) => id)));
  const find = (glyph) => EMOJI_KEYS.find((entry) => entry.glyph === glyph);
  assert.deepEqual(find('👍').tones.map(({ glyph }) => glyph), ['👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿']);
  for (const [glyph, mixed] of [['🤝', '🫱🏻‍🫲🏿'], ['👭', '👩🏻‍🤝‍👩🏿'], ['👯', '🧑🏻‍🐰‍🧑🏿'], ['💏', '🧑🏻‍❤️‍💋‍🧑🏿']]) {
    const { tones } = find(glyph);
    assert.equal(tones.length, 25, glyph);
    assert.ok(tones.some((entry) => entry.glyph === mixed), mixed);
  }
});

test('each emoji keeps its last inserted tone across reloads and can return to yellow', (t) => {
  const file = path.join(settings(t), 'emoji-usage.json');
  fs.writeFileSync(file, JSON.stringify({ version: 1, counts: [['1f44d-1f3ff', 9], ['1f44d', 1], ['1f44b', 3]] }));
  const usage = new EmojiUsage(file);
  assert.deepEqual(usage.catalog().tones, { '1f44d': '1f44d-1f3ff' });
  usage.record('1f44d-1f3fb');
  const reopened = new EmojiUsage(file);
  assert.deepEqual(reopened.catalog().tones, { '1f44d': '1f44d-1f3fb' });
  assert.deepEqual(reopened.catalog().frequent, ['1f44d', '1f44b']);
  reopened.record('1f44d');
  assert.deepEqual(new EmojiUsage(file).catalog().tones, {});
});

test('emoji insertion verifies the same focused control and passes the full sequence to the Unicode runner', async (t) => {
  const usage = new EmojiUsage(path.join(settings(t), 'emoji-usage.json'));
  const sent = [];
  const runner = createActionRunner({ input: { sendText: (text) => sent.push(text) } });
  const firstTarget = { id: 'program:100', focusId: 201n };
  let targets = [firstTarget, firstTarget, firstTarget];
  let currentRestriction;
  const insert = (id) => insertEmoji(id, { readTarget: () => targets.shift(), run: runner.run,
    usage, guard: () => currentRestriction });
  const entry = EMOJI_CATALOG.find(({ glyph }) => glyph === '👩🏽‍💻');
  assert.equal((await insert(entry.id)).ok, true);
  assert.deepEqual(sent, [entry.glyph]);
  const [family] = usage.catalog().frequent;
  assert.equal(usage.catalog().entries.find(({ id }) => id === family).glyph, '👩‍💻');
  assert.equal(usage.catalog().tones[family], entry.id);

  targets = [firstTarget, firstTarget, { ...firstTarget, focusId: 333n }];
  assert.match((await insert(entry.id)).message, /focused Windows control changed/i);
  targets = [firstTarget, { ...firstTarget, id: 'another-app:100' }];
  assert.equal((await insert(entry.id)).ok, false);
  targets = [];
  assert.equal((await insert(entry.id)).ok, false);
  targets = [firstTarget, firstTarget];
  currentRestriction = 'View-only mode is on';
  assert.match((await insert(entry.id)).message, /view-only/i);
  assert.equal((await insert('arbitrary literal')).ok, false);
  assert.deepEqual(sent, [entry.glyph]);
  assert.equal(usage.counts.get(entry.id), 1);
});
