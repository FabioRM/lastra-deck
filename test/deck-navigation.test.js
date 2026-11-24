'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { DeckNavigation } = require('../src/main/deck-navigation');
const { tempDir } = require('./helpers/temp-dir');

const defaults = { view: 'dashboard', page: null, locked: false, calendar: 'none', activity: 'main', activityPages: {},
  desktopRevealGesture: false, contextReturn: 'manual', preferredDisplay: null };

function fixture(t) {
  const directory = tempDir(t, 'lastra-navigation-');
  const file = path.join(directory, 'deck-navigation.json');
  return file;
}

test('deck navigation starts on Dashboard and restores the last view, manual page and lock', (t) => {
  const file = fixture(t);
  let navigation = new DeckNavigation(file);
  assert.deepEqual(navigation.current, defaults);
  navigation.setView('keys');
  navigation.setPage('work', true);
  navigation = new DeckNavigation(file);
  assert.deepEqual(navigation.current, { ...defaults, view: 'keys', page: 'work', locked: true });
  navigation.setView('apps');
  assert.deepEqual(new DeckNavigation(file).current, { ...defaults, view: 'apps', page: 'work', locked: true });
  navigation.setView('stats');
  assert.deepEqual(new DeckNavigation(file).current, { ...defaults, view: 'stats', page: 'work', locked: true });
});

test('a saved Media view now resumes Dashboard and keeps the deck page', (t) => {
  const file = fixture(t);
  fs.writeFileSync(file, JSON.stringify({ version: 1, view: 'media', page: 'work', locked: true }));
  assert.deepEqual(new DeckNavigation(file).current, { ...defaults, page: 'work', locked: true });
});

test('the desktop reveal gesture is opt-in and persists with the current page', (t) => {
  const file = fixture(t);
  const navigation = new DeckNavigation(file);
  navigation.setView('keys');
  navigation.setPage('work', true);
  navigation.setDesktopRevealGesture(true);
  const restored = new DeckNavigation(file);
  assert.deepEqual(restored.current, { ...defaults, view: 'keys', page: 'work', locked: true, desktopRevealGesture: true });
  restored.setDesktopRevealGesture(false);
  assert.equal(new DeckNavigation(file).current.desktopRevealGesture, false);
});

test('invalid navigation files and views fall back safely', (t) => {
  const file = fixture(t);
  fs.writeFileSync(file, '{invalid');
  let navigation = new DeckNavigation(file);
  assert.equal(navigation.current.view, 'dashboard');
  assert.throws(() => navigation.setView('https://example.test'), /Unknown deck view/);
  fs.writeFileSync(file, JSON.stringify({ version: 1, view: 'unsupported', page: [], locked: 'yes' }));
  navigation = new DeckNavigation(file);
  assert.deepEqual(navigation.current, defaults);
});

test('a Dashboard calendar choice persists and accepts only registered targets', (t) => {
  const file = fixture(t);
  let navigation = new DeckNavigation(file);
  navigation.setCalendar('google');
  navigation = new DeckNavigation(file);
  assert.equal(navigation.current.calendar, 'google');
  assert.throws(() => navigation.setCalendar('https://example.test'), /Unknown calendar/);
  navigation.setCalendar('none');
  assert.equal(new DeckNavigation(file).current.calendar, 'none');
});

test('the preferred display survives restart and can return to automatic detection', (t) => {
  const file = fixture(t);
  let navigation = new DeckNavigation(file);
  assert.equal(navigation.current.preferredDisplay, null);
  navigation.setPreferredDisplay('-135789');
  navigation = new DeckNavigation(file);
  assert.equal(navigation.current.preferredDisplay, '-135789');
  assert.throws(() => navigation.setPreferredDisplay('unknown'), /Unknown deck display/);
  navigation.setPreferredDisplay(null);
  assert.equal(new DeckNavigation(file).current.preferredDisplay, null);
  fs.writeFileSync(file, JSON.stringify({ version: 1, preferredDisplay: { id: '1' } }));
  assert.equal(new DeckNavigation(file).current.preferredDisplay, null);
});

test('each activity retains its own manual page and page lock, including the legacy Main page', (t) => {
  const file = fixture(t);
  fs.writeFileSync(file, JSON.stringify({ version: 1, view: 'keys', page: 'browser', locked: true }));
  const navigation = new DeckNavigation(file);
  navigation.setActivity('meeting');
  navigation.setPage('teams', false);
  navigation.setActivity('streaming');
  assert.deepEqual(navigation.pageFor(), { page: null, locked: false });
  navigation.setPage('obs', true);
  assert.throws(() => navigation.setActivity('../../other'), /Unknown activity profile/);
  const restored = new DeckNavigation(file);
  assert.equal(restored.current.activity, 'streaming');
  assert.deepEqual(restored.pageFor(), { page: 'obs', locked: true });
  assert.deepEqual(restored.pageFor('meeting'), { page: 'teams', locked: false });
  assert.deepEqual(restored.pageFor('main'), { page: 'browser', locked: true });
});

test('app-page return defaults to the last manual page and preserves a saved Home choice', (t) => {
  const file = fixture(t);
  fs.writeFileSync(file, JSON.stringify({ version: 1, view: 'keys', page: 'work', contextReturn: { toString: '' } }));
  const navigation = new DeckNavigation(file);
  assert.equal(navigation.current.contextReturn, 'manual');
  assert.equal(navigation.current.view, 'keys');
  assert.throws(() => navigation.setContextReturn('missing'), /Unknown app page return mode/);
  navigation.setContextReturn('home');
  const restored = new DeckNavigation(file);
  assert.equal(restored.current.contextReturn, 'home');
  assert.deepEqual(restored.pageFor(), { page: 'work', locked: false });
});

test('saved locks retain a distinct manual selection in Main and other activities', (t) => {
  const file = fixture(t);
  const navigation = new DeckNavigation(file);
  navigation.setPage('home', true, 'main', 'work');
  navigation.setPage('meeting', true, 'meeting', null);
  let restored = new DeckNavigation(file);
  assert.deepEqual(restored.pageFor('main'), { page: 'home', locked: true, manualPage: 'work' });
  assert.deepEqual(restored.pageFor('meeting'), { page: 'meeting', locked: true, manualPage: null });
  restored.setPage('work', false, 'main', 'work');
  restored = new DeckNavigation(file);
  assert.deepEqual(restored.pageFor('main'), { page: 'work', locked: false });
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(file, 'utf8')), 'manualPage'), false);
});
