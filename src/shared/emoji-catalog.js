'use strict';

const fs = require('node:fs');
const path = require('node:path');

const GROUPS = [
  { id: 'faces', label: 'Smileys', icon: '😀', unicode: 'Smileys & Emotion' },
  { id: 'people', label: 'People', icon: '👋', unicode: 'People & Body' },
  { id: 'nature', label: 'Animals & nature', icon: '🐻', unicode: 'Animals & Nature' },
  { id: 'food', label: 'Food & drink', icon: '🍕', unicode: 'Food & Drink' },
  { id: 'travel', label: 'Travel & places', icon: '🚗', unicode: 'Travel & Places' },
  { id: 'activities', label: 'Activities', icon: '⚽', unicode: 'Activities' },
  { id: 'objects', label: 'Objects', icon: '💡', unicode: 'Objects' },
  { id: 'symbols', label: 'Symbols', icon: '🔣', unicode: 'Symbols' },
  { id: 'flags', label: 'Flags', icon: '🏁', unicode: 'Flags' },
];
const byGroup = new Map(GROUPS.map(({ id, unicode }) => [unicode, id]));
byGroup.set('Component', 'people');

const EMOJI_GROUPS = Object.freeze(GROUPS.map(({ id, label, icon }) => Object.freeze({ id, label, icon })));

function loadCatalog() {
  const entries = [];
  const source = fs.readFileSync(path.join(__dirname, 'emoji-test-18.0.txt'), 'utf8');
  let group;
  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith('# group: ')) {
      group = byGroup.get(line.slice(9));
      if (!group) throw new Error('Unknown emoji group: ' + line);
      continue;
    }
    // The remaining qualification statuses describe alternate spellings of these same emoji.
    const match = /^([A-F0-9 ]+)\s*;\s*(?:fully-qualified|component)\s*#\s+\S+\s+E[\d.]+\s+(.+)$/u.exec(line);
    if (!match) continue;
    const codepoints = match[1].trim().split(/\s+/).map((point) => parseInt(point, 16));
    const id = codepoints.map((point) => point.toString(16)).join('-');
    const glyph = String.fromCodePoint(...codepoints);
    entries.push(Object.freeze({ id, glyph, label: match[2], group }));
  }
  return Object.freeze(entries);
}

const EMOJI_CATALOG = loadCatalog();

// These mixed-tone sequences expand older emoji into two separate people or hands.
const EXPANDED_EMOJI = new Map([
  ['1faf1-200d-1faf2', '1f91d'],
  ['1f9d1-200d-1f430-200d-1f9d1', '1f46f'],
  ['1f468-200d-1f430-200d-1f468', '1f46f-200d-2642-fe0f'],
  ['1f469-200d-1f430-200d-1f469', '1f46f-200d-2640-fe0f'],
  ['1f9d1-200d-1faef-200d-1f9d1', '1f93c'],
  ['1f468-200d-1faef-200d-1f468', '1f93c-200d-2642-fe0f'],
  ['1f469-200d-1faef-200d-1f469', '1f93c-200d-2640-fe0f'],
  ['1f469-200d-1f91d-200d-1f469', '1f46d'],
  ['1f469-200d-1f91d-200d-1f468', '1f46b'],
  ['1f468-200d-1f91d-200d-1f468', '1f46c'],
  ['1f9d1-200d-2764-200d-1f48b-200d-1f9d1', '1f48f'],
  ['1f9d1-200d-2764-200d-1f9d1', '1f491'],
]);

const BY_NEUTRAL_SEQUENCE = new Map(EMOJI_CATALOG.map(({ id }) => [id.replace(/-fe0f(?=-|$)/g, ''), id]));
const EMOJI_BASE_IDS = new Map();
const variants = Map.groupBy(EMOJI_CATALOG.filter(({ id }) => /-1f3f[b-f](?=-|$)/.test(id)), ({ id }) => {
  const neutral = id.replace(/-(?:1f3f[b-f]|fe0f)(?=-|$)/g, '');
  const base = EXPANDED_EMOJI.get(neutral) ?? BY_NEUTRAL_SEQUENCE.get(neutral);
  if (!base) throw new Error('Missing neutral emoji for ' + id);
  EMOJI_BASE_IDS.set(id, base);
  return base;
});
const toneOrder = ({ id }) => {
  const tones = [...id.matchAll(/-1f3f([b-f])(?=-|$)/g)].map((match) => parseInt(match[1], 16));
  return tones[0] * 16 + (tones[1] ?? tones[0]);
};
const EMOJI_KEYS = EMOJI_CATALOG.filter(({ id }) => !EMOJI_BASE_IDS.has(id)).map((entry) => {
  const tones = variants.get(entry.id);
  return tones ? { ...entry, tones: tones.sort((a, b) => toneOrder(a) - toneOrder(b)) } : entry;
});

module.exports = { EMOJI_CATALOG, EMOJI_GROUPS, EMOJI_KEYS, EMOJI_BASE_IDS };
