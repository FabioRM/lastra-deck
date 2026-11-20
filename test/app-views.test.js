'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { AppViews } = require('../src/main/app-views');
const { tempDir } = require('./helpers/temp-dir');

function settingsFile(t) {
  return path.join(tempDir(t, 'lastra-views-'), 'app-views.json');
}

test('app view pins and manual selection persist and pinned entries come first', async (t) => {
  const file = settingsFile(t);
  const views = new AppViews(file);
  await views.change({ type: 'pin', viewId: 'vscode', pinned: true });
  await views.change({ type: 'pin', viewId: 'vscode', pinned: true });
  await views.change({ type: 'select', viewId: 'wsl' });
  const restored = new AppViews(file).snapshot();
  assert.deepEqual(restored.pinned, ['vscode']);
  assert.equal(restored.views[0].id, 'vscode');
  assert.equal(restored.selected, 'wsl');
});

test('foreground activation is opt-in and respects the context lock', async (t) => {
  const views = new AppViews(settingsFile(t));
  assert.equal(views.observe('code.exe'), undefined);
  assert.equal(views.snapshot().automatic, null);
  await views.change({ type: 'follow', enabled: true });
  assert.equal(views.snapshot().automatic, 'vscode');
  assert.equal(views.observe('spotify.exe'), 'spotify');
  assert.equal(views.observe('spotify.exe', false), null);
  assert.equal(views.observe('spotify.exe', true), 'spotify');
  assert.equal(views.observe('chrome.exe'), null);
  assert.equal(views.observe(null), undefined);
});

test('the renderer can invoke registered app actions by ID without supplying targets', async (t) => {
  const calls = [];
  const views = new AppViews(settingsFile(t), {
    run: async (...args) => { calls.push(args); return { ok: true }; },
  });
  const view = views.snapshot().views.find(({ id }) => id === 'chatgpt');
  assert.deepEqual(view.commands, [{ id: 'web', label: 'Open ChatGPT' }]);
  await views.change({ type: 'action', viewId: 'chatgpt', actionId: 'web', target: 'https://not-selected.invalid/' });
  assert.deepEqual(calls, [[{ type: 'open', target: 'https://chatgpt.com/' }, ['chatgpt.exe']]]);
  await assert.rejects(views.change({ type: 'action', viewId: 'chatgpt', actionId: 'unknown' }), /unavailable/);
});
