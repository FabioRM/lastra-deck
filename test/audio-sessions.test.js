'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { groupSessions } = require('../src/main/audio-sessions-win32');

test('combines audio sessions for the same app without mixing different apps', () => {
  const sessions = [
    { id: 'browser', name: 'Browser', level: 100, active: false, muted: true, canPin: true },
    { id: 'player', name: 'Player', level: 80, active: false, muted: true },
    { id: 'browser', name: 'Browser', level: 20, active: true, muted: false },
  ];
  assert.deepEqual(groupSessions(sessions), [
    {
      id: 'browser', name: 'Browser', count: 2, level: 60, active: true, canPin: true,
      mixedLevel: true, mixedMute: true, muted: false,
    },
    {
      id: 'player', name: 'Player', count: 1, level: 80, active: false, canPin: false,
      mixedLevel: false, mixedMute: false, muted: true,
    },
  ]);
});

test('keeps distinct apps with the same display name independently addressable', () => {
  const base = { name: 'Browser', level: 100, active: true, muted: false };
  assert.deepEqual(groupSessions([{ id: 'a', ...base }, { id: 'b', ...base }]).map((app) => app.id), ['a', 'b']);
  assert.deepEqual(groupSessions([]), []);
});
