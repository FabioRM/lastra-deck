// @ts-check
'use strict';

const { readJsonSettings, writeJsonSettings } = require('./json-settings-file');
const { ACTIVITIES, knownActivity } = require('./activity-profiles');

const VIEWS = new Set(['dashboard', 'keys', 'stats', 'feeds', 'aquarium', 'obs', 'apps', 'emoji']);
const CONTEXT_RETURN_CHOICES = Object.freeze({ manual: 'Last manually selected page', home: 'Home' });
const CALENDARS = {
  none: { label: 'Do nothing', url: null },
  google: { label: 'Google Calendar', url: 'https://calendar.google.com/calendar/' },
  outlook: { label: 'Outlook.com Calendar', url: 'https://outlook.live.com/calendar/' },
  microsoft365: { label: 'Microsoft 365 Calendar', url: 'https://outlook.office.com/calendar/' },
};
const DEFAULT_PAGE = Object.freeze({ page: null, locked: false });
/** @type {NavigationState} */
const DEFAULT = { view: 'dashboard', ...DEFAULT_PAGE, calendar: 'none', activity: 'main', activityPages: {},
  desktopRevealGesture: false, contextReturn: 'manual', preferredDisplay: null };

function knownCalendar(calendar) {
  return typeof calendar === 'string' && Object.hasOwn(CALENDARS, calendar);
}

function knownContextReturn(mode) {
  return typeof mode === 'string' && Object.hasOwn(CONTEXT_RETURN_CHOICES, mode);
}

function pageId(value) {
  return typeof value === 'string' && /^[a-z0-9_-]{1,40}$/i.test(value) ? value : null;
}

function displayId(value) {
  return typeof value === 'string' && /^-?\d{1,20}$/.test(value) ? value : null;
}

/**
 * @typedef {{ page: string | null, locked: boolean, manualPage?: string | null }} PageSelection
 * @typedef {PageSelection & { view: string, calendar: string, activity: string, desktopRevealGesture: boolean,
 *   contextReturn: string, preferredDisplay: string | null, activityPages: Record<string, PageSelection> }} NavigationState
 */

/**
 * @param {string | null} page
 * @param {boolean} locked
 * @param {string | null} [manualPage]
 * @returns {PageSelection}
 */
function pageSelection(page, locked, manualPage = page) {
  /** @type {PageSelection} */
  const state = { page, locked };
  if (locked && manualPage !== page) state.manualPage = manualPage;
  return state;
}

function readPage(data) {
  const page = pageId(data?.page);
  const manualPage = data?.manualPage === null ? null : pageId(data?.manualPage) ?? page;
  return pageSelection(page, data?.locked === true, manualPage);
}

/** @returns {NavigationState} */
function read(file, log) {
  return readJsonSettings(file, {
    maxBytes: 4_096,
    parse(data) {
      if (data?.version !== 1) throw new Error('Unsupported settings version');
      return {
        view: VIEWS.has(data.view) ? data.view : DEFAULT.view,
        ...readPage(data),
        calendar: knownCalendar(data.calendar) ? data.calendar : DEFAULT.calendar,
        activity: knownActivity(data.activity) ? data.activity : DEFAULT.activity,
        desktopRevealGesture: data.desktopRevealGesture === true,
        contextReturn: knownContextReturn(data.contextReturn) ? data.contextReturn : DEFAULT.contextReturn,
        preferredDisplay: displayId(data.preferredDisplay),
        activityPages: Object.fromEntries(Object.keys(ACTIVITIES).filter((id) => id !== 'main' && data.activityPages?.[id])
          .map((id) => [id, readPage(data.activityPages[id])])),
      };
    },
    fallback: () => ({ ...DEFAULT }),
    onError: () => log('Deck navigation settings unavailable. Using defaults.'),
  });
}

class DeckNavigation {
  /**
   * @param {string} file
   * @param {(message: string) => void} [log]
   */
  constructor(file, log = () => {}) {
    this.file = file;
    this.log = log;
    this.current = read(file, log);
    this.unsaved = false;
  }

  setView(view) {
    if (!VIEWS.has(view)) throw new Error('Unknown deck view');
    this.save({ view });
  }

  /** @returns {PageSelection} */
  pageFor(activity = this.current.activity) {
    if (!knownActivity(activity)) throw new Error('Unknown activity profile');
    if (activity === 'main') return readPage(this.current);
    return this.current.activityPages[activity] ?? DEFAULT_PAGE;
  }

  setPage(page, locked, activity = this.current.activity, manualPage = page) {
    const next = pageSelection(page, locked, manualPage);
    if (activity === 'main') {
      this.save({ ...next, manualPage: next.manualPage });
      return;
    }
    const before = this.pageFor(activity);
    if (!this.unsaved && before.page === next.page && before.locked === next.locked && before.manualPage === next.manualPage) return;
    this.save({ activityPages: { ...this.current.activityPages, [activity]: next } });
  }

  setActivity(activity) {
    if (!knownActivity(activity)) throw new Error('Unknown activity profile');
    this.save({ activity });
  }

  setCalendar(calendar) {
    if (!knownCalendar(calendar)) throw new Error('Unknown calendar');
    this.save({ calendar });
  }

  setDesktopRevealGesture(enabled) {
    this.save({ desktopRevealGesture: enabled === true });
  }

  setContextReturn(mode) {
    if (!knownContextReturn(mode)) throw new Error('Unknown app page return mode');
    this.save({ contextReturn: mode });
  }

  setPreferredDisplay(id) {
    if (id !== null && displayId(id) === null) throw new Error('Unknown deck display');
    this.save({ preferredDisplay: id });
  }

  save(update) {
    if (!this.unsaved && Object.entries(update).every(([key, value]) => this.current[key] === value)) return;
    this.current = { ...this.current, ...update };
    if (this.current.manualPage === undefined) delete this.current.manualPage;
    try {
      writeJsonSettings(this.file, { version: 1, ...this.current });
      this.unsaved = false;
    } catch {
      this.unsaved = true;
      this.log('Could not save deck navigation.');
    }
  }
}

module.exports = { DeckNavigation, CALENDARS, CONTEXT_RETURN_CHOICES, VIEWS };
