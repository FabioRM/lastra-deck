// @ts-check
'use strict';

const { readJsonSettings, writeJsonSettings } = require('./json-settings-file');
const { VIEWS } = require('./deck-navigation');
const { knownActivity } = require('./activity-profiles');

const COMMANDS = Object.freeze({ next: 'Next page', previous: 'Previous page', page: 'Open a page',
  view: 'Open a view', back: 'Back to the last page', reveal: 'Reveal or restore the deck' });
const VIEW_LABELS = Object.freeze({ keys: 'Deck Keys', dashboard: 'Dashboard', stats: 'Stats',
  obs: 'OBS', apps: 'Apps', emoji: 'Emoji' });
const MODIFIERS = { ctrl: 'Ctrl', control: 'Ctrl', alt: 'Alt', shift: 'Shift', super: 'Super', win: 'Super' };
const ORDER = ['Ctrl', 'Alt', 'Shift', 'Super'];
const NAMED_KEYS = ['Up', 'Down', 'Left', 'Right', 'PageUp', 'PageDown', 'Home', 'End', 'Insert', 'Delete', 'Space'];
const PAGE_ID = /^[a-z0-9_-]{1,40}$/i;

/** @typedef {{ chord: string, target?: string, activity?: string }} Binding */

function normalizeChord(input) {
  if (typeof input !== 'string' || input.length > 64) throw new Error('Enter a keyboard shortcut.');
  if (!input.trim()) return '';
  const parts = input.split('+').map((part) => part.trim().toLowerCase());
  const tail = parts.pop();
  const modifiers = parts.map((part) => Object.hasOwn(MODIFIERS, part) ? MODIFIERS[part] : null);
  const fn = /^f(?:[1-9]|1[0-9]|2[0-4])$/.test(tail);
  const key = fn || /^[a-z0-9]$/.test(tail) ? tail.toUpperCase() : NAMED_KEYS.find((name) => name.toLowerCase() === tail);
  if (!key || modifiers.includes(null) || new Set(modifiers).size !== modifiers.length || (!fn && !modifiers.length)) {
    throw new Error('Use a function key or a combination such as Ctrl+Alt+Right.');
  }
  return [...ORDER.filter((modifier) => modifiers.includes(modifier)), key].join('+');
}

/** @returns {Binding} */
function normalizeBinding(command, value) {
  if (!Object.hasOwn(COMMANDS, command) || !value || typeof value !== 'object') throw new Error('Invalid deck shortcut.');
  const chord = normalizeChord(value.chord);
  if (!chord) return { chord };
  if (command === 'view') {
    if (!VIEWS.has(value.target)) throw new Error('Choose a deck view.');
    return { chord, target: value.target };
  }
  if (command === 'page') {
    if (typeof value.target !== 'string' || !PAGE_ID.test(value.target) || !knownActivity(value.activity)) {
      throw new Error('Choose a saved page.');
    }
    return { chord, target: value.target, activity: value.activity };
  }
  return { chord };
}

class DeckShortcuts {
  /**
   * @param {{
   *  file: string,
   *  shortcuts: Pick<import('electron').GlobalShortcut, 'register' | 'unregister'>,
   *  run: (command: string, binding: Binding) => void,
   *  unavailable: (command: string, binding: Binding) => string | undefined,
   *  log?: (message: string) => void
   * }} options
   */
  constructor({ file, shortcuts, run, unavailable, log = () => {} }) {
    this.file = file;
    this.shortcuts = shortcuts;
    this.run = run;
    this.unavailable = unavailable;
    this.log = log;
    /** @type {Map<string, string>} */
    this.active = new Map();
    /** @type {Record<string, Binding>} */
    this.settings = readJsonSettings(file, {
      maxBytes: 4096,
      parse(data) {
        if (data?.version !== 1 || !data.bindings || typeof data.bindings !== 'object') throw new Error('Invalid deck shortcut settings');
        return Object.fromEntries(Object.entries(data.bindings).map(([command, binding]) => [command, normalizeBinding(command, binding)]));
      },
      fallback: () => ({}),
      onError: () => log('Could not read global deck shortcuts.'),
    });
  }

  set(command, value) {
    const binding = normalizeBinding(command, value);
    const next = { ...this.settings, [command]: binding };
    if (JSON.stringify(next) !== JSON.stringify(this.settings)) {
      writeJsonSettings(this.file, { version: 1, bindings: next }, { failure: 'Could not save the deck shortcut.' });
      this.settings = next;
    }
    return this.sync();
  }

  sync() {
    const owners = new Map();
    const rows = Object.entries(COMMANDS).map(([command, label]) => {
      const binding = this.settings[command] ?? { chord: '' };
      const { chord } = binding;
      let status = chord ? this.unavailable(command, binding) : 'Unassigned';
      if (chord) {
        const owner = owners.get(chord);
        if (owner) status = 'Also assigned to ' + COMMANDS[owner];
        else owners.set(chord, command);
      }
      return { command, label, ...binding, status };
    });
    const desired = new Map(rows.filter(({ status }) => !status).map(({ command, chord }) => [command, chord]));
    for (const [command, chord] of this.active) {
      if (desired.get(command) === chord) continue;
      this.shortcuts.unregister(chord);
      this.active.delete(command);
    }
    for (const row of rows) {
      if (row.status) continue;
      const { command, chord } = row;
      if (!this.active.has(command)) {
        try {
          if (this.shortcuts.register(chord, () => this.dispatch(command, chord))) this.active.set(command, chord);
        } catch {
          this.log('Windows rejected a deck shortcut registration.');
        }
      }
      row.status = this.active.has(command) ? 'Active' : 'Unavailable or already in use';
    }
    return rows;
  }

  dispatch(command, chord) {
    const binding = this.settings[command];
    if (this.active.get(command) !== chord || binding?.chord !== chord || this.unavailable(command, binding)) return;
    try { this.run(command, binding); }
    catch { this.log('Could not run a global deck shortcut.'); }
  }

  close() {
    for (const chord of this.active.values()) this.shortcuts.unregister(chord);
    this.active.clear();
  }
}

function stepDestination(pages, page, fallback, sheet, screens, direction) {
  const next = sheet + direction;
  if (next >= 0 && next < screens) return { sheet: next };
  const index = pages.findIndex(({ id }) => id === page);
  return { page: index < 0 ? fallback : pages[index + direction]?.id };
}

module.exports = { DeckShortcuts, VIEW_LABELS, normalizeChord, stepDestination };
