// @ts-check
'use strict';

const SESSION_BLOCKED = Object.freeze({ ok: false, unavailable: true, message: 'The Windows session is locked or suspended.' });
const PASSIVE = new Set(['profile:get', 'stats:stop', 'key:confirmation:cancel', 'update:status']);

class DeckSession {
  constructor(locked = false) {
    this.locked = locked;
    this.suspended = false;
  }

  get blocked() { return this.locked || this.suspended; }

  lock() { this.locked = true; }

  unlock() { this.locked = false; }

  suspend() { this.suspended = true; }

  resume(state) {
    if (state === 'locked') this.locked = true;
    if (state === 'active' || state === 'idle') this.locked = false;
    this.suspended = false;
  }

  allows(channel) { return !this.blocked || PASSIVE.has(channel); }
}

module.exports = { DeckSession, SESSION_BLOCKED };
