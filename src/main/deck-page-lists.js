// @ts-check
'use strict';

const { ACTIVITIES } = require('./activity-profiles');
const { readJsonSettings } = require('./json-settings-file');
const { writeAtomic } = require('./write-atomic');

const ID = /^[a-z0-9_-]{1,40}$/i;
const RECENT_LIMIT = 6;
const empty = Object.freeze({ favorites: Object.freeze([]), recent: Object.freeze([]) });

function list(value, limit) {
  return Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === 'string' && ID.test(id)))].slice(0, limit) : [];
}

function read(file, log) {
  return readJsonSettings(file, {
    maxBytes: 8_192,
    parse(data) {
      if (data?.version !== 1) throw new Error('Unknown page lists version');
      return Object.fromEntries(Object.keys(ACTIVITIES).flatMap((id) => {
        const saved = data.activities?.[id];
        return saved ? [[id, { favorites: list(saved.favorites, 16), recent: list(saved.recent, RECENT_LIMIT) }]] : [];
      }));
    },
    fallback: () => ({}),
    onError: () => log('Could not read favorites and recent pages.'),
  });
}

class DeckPageLists {
  /**
   * @param {string} file
   * @param {(message: string) => void} [log]
   */
  constructor(file, log = () => {}) {
    this.file = file;
    this.log = log;
    this.activities = read(file, log);
  }

  snapshot(activity, pages) {
    const ids = new Set(pages.map(({ id }) => id));
    const { favorites, recent } = this.activities[activity] ?? empty;
    return { favorites: favorites.filter((id) => ids.has(id)), recent: recent.filter((id) => ids.has(id)) };
  }

  visit(activity, page, pages) {
    const before = this.snapshot(activity, pages);
    const next = { ...before, recent: [page, ...before.recent.filter((id) => id !== page)].slice(0, RECENT_LIMIT) };
    if (before.recent[0] === page) return false;
    try { this.save(activity, next); }
    catch { this.log('Could not save recently opened pages.'); return false; }
    return true;
  }

  favorite(activity, page, enabled, pages) {
    if (typeof enabled !== 'boolean' || !pages.some(({ id }) => id === page)) throw new Error('That saved page is unavailable.');
    const before = this.snapshot(activity, pages);
    if (before.favorites.includes(page) === enabled) return before;
    const next = { ...before, favorites: enabled ? [...before.favorites, page] : before.favorites.filter((id) => id !== page) };
    this.save(activity, next);
    return next;
  }

  save(activity, lists) {
    const next = { ...this.activities, [activity]: lists };
    writeAtomic(this.file, JSON.stringify({ version: 1, activities: next }) + '\n');
    this.activities = next;
  }
}

module.exports = { DeckPageLists };
