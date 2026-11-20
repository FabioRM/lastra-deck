// @ts-check
'use strict';

const { EMOJI_CATALOG, EMOJI_GROUPS, EMOJI_KEYS, EMOJI_BASE_IDS } = require('../shared/emoji-catalog');
const { readJsonSettings, writeJsonSettings } = require('./json-settings-file');

const BY_ID = new Map(EMOJI_CATALOG.map((entry) => [entry.id, entry]));
const PROMOTED = 16;
const BAD_TARGET = 'Select a text field in an external app, then tap the emoji again.';
const TARGET_CHANGED = 'The focused Windows control changed. The emoji was not inserted.';

const baseId = (id) => EMOJI_BASE_IDS.get(id) ?? id;

function readUsage(file, log) {
  return readJsonSettings(file, {
    maxBytes: 512 * 1024,
    parse(data) {
      if (data?.version !== 1 || !Array.isArray(data.counts)) throw new Error('Invalid Emoji usage data');
      const counts = new Map(data.counts.filter((entry) => Array.isArray(entry) && entry.length === 2
        && BY_ID.has(entry[0]) && Number.isSafeInteger(entry[1]) && entry[1] > 0));
      const tones = new Map();
      if (Array.isArray(data.tones)) {
        for (const id of data.tones) {
          if (EMOJI_BASE_IDS.has(id)) tones.set(baseId(id), id);
        }
      } else {
        // Older files have counts only. Prefer the most used version when there is no last selection.
        for (const [id, count] of counts) {
          const base = baseId(id);
          const current = tones.get(base) ?? base;
          if (id !== base && count >= (counts.get(current) ?? 0)) tones.set(base, id);
        }
      }
      return { counts, tones };
    },
    fallback: () => ({ counts: new Map(), tones: new Map() }),
    onError: () => log('Could not load local Emoji usage counts.'),
  });
}

class EmojiUsage {
  /**
   * @param {string} file
   * @param {(message: string) => void} [log]
   */
  constructor(file, log = () => {}) {
    this.file = file;
    this.log = log;
    const { counts, tones } = readUsage(file, log);
    this.counts = counts;
    this.tones = tones;
  }

  catalog() {
    const ranked = new Map();
    for (const [id, count] of this.counts) {
      const base = baseId(id);
      ranked.set(base, count + (ranked.get(base) ?? 0));
    }
    const frequent = [...ranked]
      .sort(([idA, countA], [idB, countB]) => countB - countA || idA.localeCompare(idB))
      .slice(0, PROMOTED)
      .map(([id]) => id);
    return { groups: EMOJI_GROUPS, entries: EMOJI_KEYS, frequent, tones: Object.fromEntries(this.tones) };
  }

  record(id) {
    if (!BY_ID.has(id)) return;
    const count = this.counts.get(id) ?? 0;
    if (count < Number.MAX_SAFE_INTEGER) this.counts.set(id, count + 1);
    const base = baseId(id);
    if (base === id) this.tones.delete(base);
    else this.tones.set(base, id);
    try {
      writeJsonSettings(this.file, { version: 1, counts: [...this.counts], tones: [...this.tones.values()] });
      this.writeFailed = false;
    } catch {
      if (!this.writeFailed) this.log('Could not save local Emoji usage counts.');
      this.writeFailed = true;
    }
  }
}

async function insertEmoji(id, { readTarget, run, usage, guard }) {
  const entry = BY_ID.get(id);
  if (!entry) return { ok: false, message: 'Choose an emoji from the catalog.' };
  const target = readTarget();
  if (!target) return { ok: false, unavailable: true, message: BAD_TARGET };
  const verify = () => {
    const blocked = guard();
    if (blocked) return blocked;
    const current = readTarget();
    if (current?.id !== target.id || current.focusId !== target.focusId) return TARGET_CHANGED;
  };
  const result = await run({ type: 'text', text: entry.glyph }, [], { guard: verify, trace: true });
  if (result.ok) usage.record(id);
  return { ok: result.ok, message: result.ok ? entry.label + ' inserted.' : result.message };
}

module.exports = { EmojiUsage, insertEmoji };
