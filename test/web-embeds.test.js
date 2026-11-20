'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter, once } = require('node:events');
const { setTimeout: wait } = require('node:timers/promises');
const { test } = require('node:test');
const { allowedNavigation, allowsEmbedding, normalizeEmbeds } = require('../src/main/web-embed-config');
const { WebEmbeds } = require('../src/main/app-view-web-embeds');
const { WebEmbedHost, createRequestBudget, embedBounds, isolatedSession } = require('../src/main/web-embed-host');
const { tempDir } = require('./helpers/temp-dir');

const id = '37i9dQZF1DXcBWIGoYBM5M';
const playlist = { id: 'playlist', name: 'Saved playlist', kind: 'spotify', url: `https://open.spotify.com/playlist/${id}?si=example` };
const config = (embeds) => ({ version: 1, embeds });

test('registered Spotify links use the official embed route and reject other origins', () => {
  const [entry] = normalizeEmbeds(config([playlist]));
  assert.equal(entry.url, `https://open.spotify.com/embed/playlist/${id}`);
  assert.equal(entry.external, `https://open.spotify.com/playlist/${id}`);
  assert.throws(() => normalizeEmbeds(config([{ ...playlist, url: playlist.url.replace('open.spotify.com', 'example.test') }])), /supported/);
  assert.throws(() => normalizeEmbeds(config([{ ...playlist, kind: 'web', url: 'https://user:secret@example.test' }])), /without credentials/);
  assert.throws(() => normalizeEmbeds(config([playlist, playlist])), /unique/);
  assert.equal(allowedNavigation(entry.url, 'https://open.spotify.com/other'), true);
  assert.equal(allowedNavigation(entry.url, 'https://open.spotify.com.example.test/other'), false);
  assert.equal(allowedNavigation(entry.url, 'http://open.spotify.com/other'), false);
  assert.equal(allowedNavigation(entry.url, 'spotify:playlist:' + id), false);
});

test('the isolated session denies permissions, downloads, and framing-restricted responses', () => {
  const handlers = {};
  const partition = {
    setPermissionCheckHandler: (cb) => { handlers.check = cb; },
    setPermissionRequestHandler: (cb) => { handlers.request = cb; },
    setDevicePermissionHandler: (cb) => { handlers.device = cb; },
    setDisplayMediaRequestHandler: (cb) => { handlers.capture = cb; },
    on: (name, cb) => { handlers[name] = cb; },
    webRequest: {
      onBeforeRequest: (cb) => { handlers.before = cb; },
      onHeadersReceived: (cb) => { handlers.headers = cb; },
    },
  };
  assert.equal(isolatedSession({ fromPartition: (name, options) => {
    assert.equal(name.startsWith('persist:'), false);
    assert.equal(options.cache, false);
    return partition;
  } }, ({ url }) => url === 'https://test.invalid/'), partition);
  assert.equal(handlers.check(), false);
  assert.equal(handlers.device(), false);
  handlers.request(null, 'media', (value) => assert.equal(value, false));
  handlers.capture({}, (value) => assert.equal(value, null));
  let downloaded = false;
  handlers['will-download']({ preventDefault() { downloaded = true; } });
  assert.equal(downloaded, true);
  handlers.before({ url: 'https://test.invalid/' }, ({ cancel }) => assert.equal(cancel, false));
  handlers.before({ url: 'https://test.invalid/x' }, ({ cancel }) => assert.equal(cancel, true));
  handlers.headers({ resourceType: 'mainFrame', responseHeaders: { 'X-Frame-Options': ['SAMEORIGIN'] } },
    ({ cancel }) => assert.equal(cancel, true));
  assert.equal(allowsEmbedding({ 'Content-Security-Policy': ["default-src 'self'; frame-ancestors 'none'"] }), false);
  assert.equal(allowsEmbedding({ 'content-security-policy': ['frame-ancestors *'] }), true);
});

test('the request budget limits a minute window and retains counts across resets', () => {
  let now = 2;
  const budget = createRequestBudget({ now: () => now, limit: 2, windowMs: 10 });
  assert.deepEqual([budget.allow(), budget.allow(), budget.allow()], [true, true, false]);
  assert.deepEqual(budget.snapshot(), { requests: 2, limit: 2, blocked: 1, total: 2 });
  now = 12;
  assert.equal(budget.allow(), true);
  assert.deepEqual(budget.snapshot(), { requests: 1, limit: 2, blocked: 1, total: 3 });
});

test('an embed has a request budget, stays open during playback, and releases its storage when idle or hidden', async (t) => {
  let cleared = 0;
  const owner = Object.assign(new EventEmitter(), { isDestroyed: () => false,
    getContentBounds: () => ({ x: 0, y: 0, width: 2560, height: 720 }) });
  class Contents extends EventEmitter {
    id = 30;
    send() {}
    setWindowOpenHandler() {}
    isDestroyed() { return Boolean(this.destroyed); }
    close() { this.destroyed = true; }
    async loadURL() {}
  }
  class View {
    webContents = new Contents();
    setBounds() {}
  }
  class Window extends EventEmitter {
    webContents = new Contents();
    contentView = { addChildView() {}, removeChildView() {} };
    async loadFile() {}
    getContentBounds() { return owner.getContentBounds(); }
    isDestroyed() { return Boolean(this.destroyed); }
    destroy() { this.destroyed = true; this.emit('closed'); }
  }
  const partition = Object.assign(new EventEmitter(), {
    setPermissionCheckHandler() {}, setPermissionRequestHandler() {}, setDevicePermissionHandler() {},
    setDisplayMediaRequestHandler() {}, webRequest: { onBeforeRequest() {}, onHeadersReceived() {} },
    async clearStorageData() { cleared++; },
  });
  const host = new WebEmbedHost({ BrowserWindow: Window, WebContentsView: View, ipcMain: new EventEmitter(),
    session: { fromPartition: () => partition }, getOwner: () => owner, idleMs: 25,
    requestBudget: () => createRequestBudget({ limit: 1 }) });
  t.after(() => host.dispose());
  await host.open(normalizeEmbeds(config([playlist]))[0]);
  const { dialog, view } = host.current;
  assert.equal(host.allowRequest({ url: 'https://test.invalid/', webContentsId: 99 }), false);
  assert.equal(host.allowRequest({ url: 'file:///C:/path', webContentsId: 30 }), false);
  for (const url of ['https://127.0.0.1:8085/data.json', 'https://192.168.1.10/', 'wss://localhost:4455/', 'https://[::1]/', 'https://nas.local/']) {
    assert.equal(host.allowRequest({ url, webContentsId: 30 }), false, url);
  }
  assert.equal(host.allowRequest({ url: 'blob:https://test.invalid/video', webContentsId: 30 }), true);
  assert.equal(host.allowRequest({ url: 'https://test.invalid/', webContentsId: 30 }), true);
  assert.equal(host.allowRequest({ url: 'https://test.invalid/image', webContentsId: 30 }), false);
  assert.deepEqual(host.usage(), { active: true, requests: 1, limit: 1, blocked: 1, total: 1 });
  view.webContents.emit('media-started-playing');
  await wait(40);
  assert.equal(dialog.isDestroyed(), false);
  const closed = once(dialog, 'closed');
  view.webContents.emit('media-paused');
  await Promise.race([closed, wait(250).then(() => assert.fail('The idle embed did not close'))]);
  await host.storage;
  assert.equal(view.webContents.isDestroyed(), true);
  assert.equal(cleared, 2);
  assert.equal(host.usage().active, false);
  assert.equal(host.usage().total, 1);

  await host.open(normalizeEmbeds(config([playlist]))[0]);
  owner.emit('minimize');
  assert.equal(host.current, null);
  assert.equal(owner.listenerCount('minimize'), 0);

  const entry = normalizeEmbeds(config([playlist]))[0];
  await host.open(entry);
  const previous = host.current.view;
  host.setSuspended(true);
  assert.equal(previous.webContents.isDestroyed(), true);
  assert.equal(host.usage().active, false);
  await assert.rejects(host.open(entry), /view-only/);
  host.setSuspended(false);
  const opening = host.open(entry);
  host.setSuspended(true);
  host.setSuspended(false);
  await assert.rejects(opening, /cancelled/);
  assert.equal(host.current, null);
  await host.open(entry);
  assert.equal(host.usage().active, true);
});

test('web embed commands accept registered IDs and preserve valid entries after a malformed save', async (t) => {
  const dir = tempDir(t, 'lastra-embeds-');
  const file = path.join(dir, 'web-embeds.json');
  fs.writeFileSync(file, JSON.stringify(config([playlist])));
  const opens = [];
  const provider = new WebEmbeds(file, {
    host: { open: (entry) => { opens.push(entry.url); return { ok: true }; } },
    openExternal: async (url) => opens.push(url),
  });
  assert.deepEqual(provider.snapshot().embeds, [{ id: 'playlist', name: 'Saved playlist', kind: 'spotify' }]);
  await assert.rejects(provider.change({ action: 'embed', id: 'https://example.test/' }), /unavailable/);
  await provider.change({ action: 'embed', id: 'playlist', url: 'https://example.test/' });
  await provider.change({ action: 'external', id: 'playlist' });
  assert.deepEqual(opens, [`https://open.spotify.com/embed/playlist/${id}`, `https://open.spotify.com/playlist/${id}`]);
  fs.writeFileSync(file, '{');
  assert.match(provider.snapshot().error, /invalid JSON/);
  assert.equal(provider.snapshot().embeds.length, 1);
  assert.deepEqual(embedBounds({ getContentBounds: () => ({ x: 200, y: -400, width: 720, height: 2_560 }) }),
    { x: 212, y: 500, width: 696, height: 760 });
});
