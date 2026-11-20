'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { StreamingWatchlist, streamingUrl } = require('../src/main/app-view-watchlist');
const { tempDir } = require('./helpers/temp-dir');

test('watchlist recognizes official title links across supported providers without accepting redirects', () => {
  assert.equal(streamingUrl('https://www.netflix.com/watch/123456?tag=tracking'), 'https://www.netflix.com/watch/123456');
  assert.equal(streamingUrl('https://www.primevideo.com/detail/a-show/B1234'), 'https://www.primevideo.com/detail/a-show/B1234');
  assert.equal(streamingUrl('https://tv.apple.com/it/show/a-show/umc.cmc.132abc#info'), 'https://tv.apple.com/it/show/a-show/umc.cmc.132abc');
  assert.equal(streamingUrl('https://youtu.be/dQw4w9WgXcQ?t=30'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(streamingUrl('https://www.disneyplus.com/series/a-show/abc723'), 'https://www.disneyplus.com/series/a-show/abc723');
  assert.equal(streamingUrl('https://www.hulu.com/watch/9b231-c2e5'), 'https://www.hulu.com/watch/9b231-c2e5');
  for (const rejected of ['https://www.youtube.com/redirect?q=https://any.test', 'https://www.hulu.com.evil.example/movie/example',
    'https://www.amazon.com/gp/video/storefront', 'https://tv.apple.com:4100/us/show/a-show/umc.cmc.132abc', 'file:///example']) {
    assert.equal(streamingUrl(rejected), null);
  }
});

test('watchlist routes saved title IDs to an installed preferred browser or the system fallback', async (t) => {
  const directory = tempDir(t, 'lastra-watchlist-');
  const file = path.join(directory, 'streaming-watchlist.json');
  const url = 'https://www.netflix.com/title/80057281';
  const video = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const chrome = 'C:\\Apps\\Google\\Chrome\\Application\\chrome.exe';
  const calls = [];
  const view = new StreamingWatchlist(file, { platform: 'win32', env: { ProgramFiles: 'C:\\Apps' },
    exists: (filePath) => filePath === chrome, openConfig: async () => ({ ok: true }),
    run: async (action) => { calls.push(action); return { ok: true }; } });
  fs.writeFileSync(file, JSON.stringify({ version: 1, titles: [
    { id: 'netflix', name: 'My show', url, browser: 'chrome-app' },
    { id: 'youtube', name: 'My video', url: video, browser: 'firefox' },
  ] }));
  assert.deepEqual(view.snapshot().titles, [
    { id: 'netflix', name: 'My show', provider: 'Netflix' }, { id: 'youtube', name: 'My video', provider: 'YouTube' },
  ]);
  await view.change({ action: 'open-title', id: 'netflix', url: 'https://wrong.example' });
  await view.change({ action: 'open-title', id: 'youtube' });
  await assert.rejects(view.change({ action: 'open-title', id: 'new' }), /unavailable/);
  assert.deepEqual(calls, [
    { type: 'launch', target: chrome, args: ['--app=' + url] },
    { type: 'open', target: video },
  ]);
});
