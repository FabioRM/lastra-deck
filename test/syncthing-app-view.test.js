'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');
const { test } = require('node:test');
const { SyncthingView, normalizeSyncthing } = require('../src/main/app-view-syncthing');
const { tempDir } = require('./helpers/temp-dir');

const laptop = 'AAAAAAA-BBBBBBB-CCCCCCC-DDDDDDD-EEEEEEE-FFFFFFF-GGGGGGG-HHHHHHH';
const tablet = 'IIIIIII-JJJJJJJ-KKKKKKK-LLLLLLL-MMMMMMM-NNNNNNN-OOOOOOO-PPPPPPP';
const apiKey = 'fixture-private-key';

function fixture(t, options) {
  const dir = tempDir(t, 'lastra-syncthing-');
  const file = path.join(dir, 'syncthing.json');
  return { file, view: new SyncthingView(file, options), write: (settings) => fs.writeFileSync(file, JSON.stringify(settings)) };
}

async function server(t, handler) {
  const instance = http.createServer(handler);
  instance.listen(0, '127.0.0.1');
  await once(instance, 'listening');
  t.after(() => { instance.close(); instance.closeAllConnections(); });
  return `http://127.0.0.1:${instance.address().port}/`;
}

test('reads only selected local folders and returns peer states without raw provider data', async (t) => {
  const requests = [];
  const url = await server(t, (req, res) => {
    requests.push([req.method, req.url, req.headers['x-api-key']]);
    const parsed = new URL(req.url, 'http://127.0.0.1/');
    if (parsed.pathname === '/rest/system/connections') {
      res.end(JSON.stringify({ connections: { [laptop]: { connected: true, address: 'remote-private-address' }, [tablet]: { connected: false } } }));
    } else if (parsed.pathname === '/rest/db/status' && parsed.searchParams.get('folder') === 'work notes & archive') {
      res.end(JSON.stringify({ state: 'syncing', globalBytes: 200, inSyncBytes: 110, globalTotalItems: 8, needTotalItems: 3 }));
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  const opened = [];
  const { view, write } = fixture(t, { openExternal: (target) => opened.push(target) });
  write({ version: 1, url, apiKey, folders: [{ id: 'work notes & archive', label: 'Work' }, { id: 'offline', label: 'Offline' }],
    devices: [{ id: laptop, label: 'Laptop' }, { id: tablet, label: 'Tablet' }] });
  const value = await view.snapshot();
  assert.equal(value.status, 'ready');
  assert.deepEqual(value.folders.map(({ label, state, completion, remaining }) => [label, state, completion, remaining]),
    [['Work', 'syncing', 55, 3], ['Offline', 'unavailable', null, null]]);
  assert.deepEqual(value.devices.map(({ label, connected }) => [label, connected]), [['Laptop', true], ['Tablet', false]]);
  assert.doesNotMatch(JSON.stringify(value), /fixture-private-key|remote-private-address/);
  assert.deepEqual(requests.map(([method, , secret]) => [method, secret]), Array.from({ length: 3 }, () => ['GET', apiKey]));
  assert.equal((await view.change({ action: 'open' })).ok, true);
  assert.deepEqual(opened, [url]);
});

test('only explicit loopback configuration can send a key, and the setup file starts disabled', async (t) => {
  let requests = 0;
  const { file, view, write } = fixture(t, { fetcher: () => requests++, openConfig: (selected) => ({ ok: selected === file }) });
  assert.equal((await view.snapshot()).status, 'disabled');
  assert.equal((await view.change({ action: 'configure' })).ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { version: 1, folders: [] });
  assert.equal((await view.snapshot()).status, 'disabled');
  for (const url of ['https://example.com/', 'http://localhost@evil.example/', 'file:///C:/', 'http://127.0.0.1/x', 'http://127.0.0.1/?secret=1']) {
    write({ version: 1, url, apiKey, folders: [] });
    assert.equal((await view.snapshot()).status, 'invalid');
  }
  assert.equal(requests, 0);
  assert.throws(() => normalizeSyncthing({ version: 1, url: 'http://localhost/', apiKey: 'bad\nheader', folders: [] }), /API key/);
});

test('a bad API key, redirected request, and oversized response get bounded failure states', async (t) => {
  let followed = 0;
  const elsewhere = await server(t, (_req, res) => { followed++; res.end('{}'); });
  let mode = 'auth';
  const url = await server(t, (_req, res) => {
    if (mode === 'redirect') {
      res.writeHead(302, { location: elsewhere });
      res.end();
    } else if (mode === 'auth') {
      res.writeHead(401);
      res.end(apiKey);
    } else res.end(JSON.stringify({ connections: {}, padding: 'a'.repeat(300 * 1024) }));
  });
  const { view, write } = fixture(t);
  write({ version: 1, url, apiKey, folders: [] });
  assert.equal((await view.snapshot()).status, 'authentication');
  mode = 'redirect';
  assert.equal((await view.snapshot()).status, 'unavailable');
  assert.equal(followed, 0);
  mode = 'oversize';
  assert.equal((await view.snapshot()).status, 'unavailable');
});

test('a configuration change discards an in-flight result and concurrent reads share one job', async (t) => {
  let complete;
  let calls = 0;
  const { view, write } = fixture(t, { fetcher: () => { calls++; return new Promise((resolve) => { complete = resolve; }); } });
  write({ version: 1, apiKey, folders: [] });
  const first = view.snapshot();
  const second = view.snapshot();
  assert.equal(calls, 1);
  write({ version: 1, folders: [] });
  complete(new Response('{"connections":{}}'));
  assert.deepEqual(await first, { status: 'loading' });
  assert.deepEqual(await second, { status: 'loading' });
  assert.equal((await view.snapshot()).status, 'disabled');
});
