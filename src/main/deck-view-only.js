// @ts-check
'use strict';

const { readJsonSettings, writeJsonSettings, isMissing } = require('./json-settings-file');

const MESSAGE = 'View-only mode is on. Switch it off from the Lastra tray menu.';
const BLOCKED = Object.freeze({ ok: false, unavailable: true, message: MESSAGE });

const PASSIVE = new Set([
  'profile:get', 'view:set', 'page:select', 'page:repaginate',
  'dashboard:pomodoro:read', 'timers:read', 'sounds:read', 'tools:choices',
  'stats:read', 'stats:stop', 'stats:tab', 'media:snapshot', 'display:backlight:read',
  'app-views:list', 'app-views:data', 'deck:badges:read', 'audio:peaks', 'audio:apps:list',
  'audio:outputs:list', 'key:confirmation:cancel', 'emoji:catalog', 'desktop-reveal:begin', 'obs:preview', 'obs:timing', 'production:timers:read',
]);

function deckRequestAllowed(channel, command) {
  return PASSIVE.has(channel)
    || (channel === 'app-views:change' && command?.type === 'provider' && command.viewId === 'github-checks' && command.action === 'stop')
    || (channel === 'app-views:change' && command?.type === 'provider' && command.viewId === 'prometheus' && command.action === 'stop')
    || (channel === 'app-views:change' && command?.type === 'provider' && command.viewId === 'kubernetes'
      && ['select', 'stop', 'stop-logs', 'logs'].includes(command.action))
    || (channel === 'dashboard:agenda' && command?.type === 'read')
    || (channel === 'stats:processes' && ['read', 'stop'].includes(command?.type))
    || (channel === 'display:backlight:widgets' && ['read', 'cancel'].includes(command?.type))
    || channel === 'sensors:widgets'
    || (channel === 'stats:incidents' && command?.type === 'read')
    || (channel === 'app-views:change' && command?.type === 'select')
    || (channel === 'production:modes' && ['read', 'preview', 'cancel'].includes(command?.type))
    || (channel === 'obs:change' && command?.type === 'select-source');
}

function read(file, log) {
  return readJsonSettings(file, {
    maxBytes: 4_096,
    parse(data) {
      if (data?.version !== 1 || typeof data.enabled !== 'boolean') throw new Error('Invalid view-only settings');
      return data.enabled;
    },
    // Fail closed: damaged settings start the deck protected.
    fallback: (error) => !isMissing(error),
    onError: () => log('Could not read view-only settings. The deck will open in view-only mode.'),
  });
}

class DeckViewOnly {
  constructor(file, log = () => {}) {
    this.file = file;
    this.enabled = read(file, log);
    this.revision = 0;
  }

  set(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Invalid view-only setting.');
    if (enabled === this.enabled) return;
    writeJsonSettings(this.file, { version: 1, enabled }, { failure: 'Could not save view-only settings.' });
    this.enabled = enabled;
    this.revision++;
  }

  guard() {
    const revision = this.revision;
    return () => this.enabled || this.revision !== revision ? MESSAGE : undefined;
  }
}

module.exports = { DeckViewOnly, deckRequestAllowed, BLOCKED };
