'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { DeckSession } = require('../src/main/deck-session');

test('a locked deck retains only the IPC needed to display the cover and stop work', () => {
  const session = new DeckSession();
  assert.equal(session.allows('audio:change'), true);
  session.lock();
  for (const channel of ['key:tap', 'audio:change', 'view:set', 'app-views:action']) {
    assert.equal(session.allows(channel), false, channel);
  }
  for (const channel of ['profile:get', 'stats:stop', 'key:confirmation:cancel']) {
    assert.equal(session.allows(channel), true, channel);
  }
  session.unlock();
  assert.equal(session.allows('audio:change'), true);
});

test('suspend and lock are distinct and resume respects the Windows state', () => {
  const session = new DeckSession(true);
  session.suspend();
  session.unlock();
  assert.equal(session.blocked, true);
  session.resume('locked');
  assert.equal(session.blocked, true);
  session.suspend();
  session.resume('unknown');
  assert.equal(session.blocked, true);
  session.unlock();
  assert.equal(session.blocked, false);
  session.suspend();
  session.resume('idle');
  assert.equal(session.blocked, false);
});
