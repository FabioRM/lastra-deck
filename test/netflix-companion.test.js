'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { NetflixView, netflixUrl, NETFLIX_APP_ID } = require('../src/main/app-view-netflix');
const { playbackRequest } = require('../src/main/windows-media');
const { tempDir } = require('./helpers/temp-dir');

test('saved Netflix titles accept only official HTTPS title and watch links', () => {
  assert.equal(netflixUrl('https://netflix.com/it/title/123456?trackId=42'), 'https://www.netflix.com/title/123456');
  assert.equal(netflixUrl('https://www.netflix.com/watch/123456#time'), 'https://www.netflix.com/watch/123456');
  for (const value of ['https://www.netflix.com.evil.example/title/123', 'http://netflix.com/watch/123',
    'https://person:secret@netflix.com/watch/123', 'https://netflix.com/redirect?link=https://example.test']) {
    assert.equal(netflixUrl(value), null);
  }
});

test('Netflix checks the active Windows app for each documented shortcut and uses saved title IDs', async (t) => {
  const folder = tempDir(t, 'lastra-netflix-');
  const config = path.join(folder, 'netflix.json');
  const calls = [];
  let foreground = { executable: 'msedge.exe', title: 'Netflix' };
  const view = new NetflixView(config, {
    platform: 'win32', createWindows: () => ({ foreground: () => foreground }),
    openConfig: async () => ({ ok: true }),
    run: async (action) => { calls.push(action); return { ok: true }; },
  });
  assert.equal(view.snapshot().shortcutAvailable, false);
  await assert.rejects(view.change({ action: 'shortcut', key: 'toggle' }), /identified Netflix/);
  foreground = { appId: NETFLIX_APP_ID.toUpperCase() };
  assert.equal(view.snapshot().shortcutAvailable, true);
  await view.change({ action: 'shortcut', key: 'toggle' });
  await view.change({ action: 'shortcut', key: 'exit-fullscreen' });
  foreground = { appId: 'Unrelated', title: 'Netflix' };
  await assert.rejects(view.change({ action: 'shortcut', key: 'exit-fullscreen' }), /identified Netflix/);
  assert.deepEqual(calls, [{ type: 'hotkey', keys: 'Space' }, { type: 'hotkey', keys: 'Esc' }]);

  await view.change({ action: 'configure' });
  fs.writeFileSync(config, JSON.stringify({ version: 1, titles: [{ id: 'saved', name: 'Saved show', url: 'https://netflix.com/title/123456' }] }));
  await view.change({ action: 'open-title', id: 'saved', url: 'https://wrong.example' });
  assert.deepEqual(calls.at(-1), { type: 'open', target: 'https://www.netflix.com/title/123456' });
  await assert.rejects(view.change({ action: 'open-title', id: 'https://example.test' }), /unavailable/);
});

test('Netflix media commands cannot fall through to an unrelated selected player', () => {
  const sessionId = 'a'.repeat(32);
  assert.deepEqual(playbackRequest({ sessionId, command: 'pause', route: 'netflix' }), { sessionId, command: 'pause', route: 'netflix' });
  assert.equal(playbackRequest({ sessionId, command: 'pause', route: 'netflix', selectionId: sessionId }), null);
});
