// @ts-check
'use strict';

const { readJsonSettings, writeJsonSettings } = require('./json-settings-file');

const LANGUAGES = ['it', 'en'];
const PREFERENCES = ['system', ...LANGUAGES];

/** The preload bridge accepts only the bundled page and its generated language query. */
function matchesInterfaceUrl(expected, actual) {
  return actual === expected || LANGUAGES.some((language) => actual === `${expected}?language=${language}`);
}

/** @param {readonly string[]} preferredLocales */
function systemLanguage(preferredLocales) {
  for (const locale of preferredLocales) {
    const base = locale.toLowerCase().split(/[-_]/)[0];
    if (base === 'it' || base === 'en') return base;
  }
  return 'en';
}

class InterfaceLanguage {
  /** @param {string} file @param {() => string[]} preferredLocales */
  constructor(file, preferredLocales) {
    this.file = file;
    this.preferredLocales = preferredLocales;
    this.preference = readJsonSettings(file, {
      maxBytes: 1024,
      parse(value) {
        if (value?.version !== 1 || !PREFERENCES.includes(value.preference)) throw new Error('Invalid language preference');
        return value.preference;
      },
      fallback: () => 'system',
    });
  }

  get language() {
    return this.preference === 'system' ? systemLanguage(this.preferredLocales()) : this.preference;
  }

  snapshot() {
    return { preference: this.preference, language: this.language };
  }

  set(preference) {
    if (!PREFERENCES.includes(preference)) throw new Error('Choose a supported interface language.');
    if (preference !== this.preference) {
      writeJsonSettings(this.file, { version: 1, preference });
      this.preference = preference;
    }
    return this.snapshot();
  }
}

module.exports = { InterfaceLanguage, systemLanguage, matchesInterfaceUrl };
