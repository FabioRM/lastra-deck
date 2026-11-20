'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { createActionRunner } = require('../src/main/actions');
const { DeckViewOnly, deckRequestAllowed } = require('../src/main/deck-view-only');
const { runPageAction } = require('../src/main/pages');
const { tempDir } = require('./helpers/temp-dir');

function useSettings(t) {
  const directory = tempDir(t, 'lastra-view-only-');
  return join(directory, 'deck-view-only.json');
}

test('view-only settings persist without a profile change and start protected after an unreadable save', (t) => {
  const file = useSettings(t);
  const initial = new DeckViewOnly(file);
  assert.equal(initial.enabled, false);
  initial.set(true);
  const reopened = new DeckViewOnly(file);
  assert.equal(reopened.enabled, true);
  reopened.set(false);
  assert.equal(new DeckViewOnly(file).enabled, false);

  fs.writeFileSync(file, '{"version":1,"enabled":"false"}');
  const messages = [];
  const safe = new DeckViewOnly(file, (message) => messages.push(message));
  assert.equal(safe.enabled, true);
  assert.equal(messages.length, 1);
  safe.set(false);
  assert.equal(new DeckViewOnly(file).enabled, false);
});

test('view-only allows readings, inspection and passive navigation while blocking deck commands by default', () => {
  for (const channel of ['profile:get', 'view:set', 'page:select', 'page:repaginate', 'stats:read', 'stats:tab',
    'media:snapshot', 'app-views:list', 'app-views:data', 'audio:peaks', 'audio:apps:list', 'key:confirmation:cancel', 'emoji:catalog']) {
    assert.equal(deckRequestAllowed(channel), true, channel);
  }
  for (const channel of ['key:press', 'key:confirmation:begin', 'audio:change', 'audio:outputs:select',
    'audio:apps:pin', 'audio:apps:change', 'media:change', 'activity:select', 'page:lock',
    'dashboard:calendar:open', 'emoji:insert', 'new:action']) {
    assert.equal(deckRequestAllowed(channel), false, channel);
  }
  assert.equal(deckRequestAllowed('obs:change', { type: 'select-source' }), true);
  assert.equal(deckRequestAllowed('obs:preview'), true);
  assert.equal(deckRequestAllowed('obs:change', { type: 'record' }), false);
  assert.equal(deckRequestAllowed('app-views:change', { type: 'select' }), true);
  assert.equal(deckRequestAllowed('app-views:change', { type: 'window' }), false);
  assert.equal(deckRequestAllowed('app-views:change', { type: 'provider', action: 'embed' }), false);
});

test('turning view-only on invalidates a running untargeted macro even after unlocking again', async (t) => {
  const settings = new DeckViewOnly(useSettings(t));
  let release;
  const opened = [];
  const runner = createActionRunner({
    shell: { openExternal: async (url) => opened.push(url) },
    sleep: () => new Promise((resolve) => { release = resolve; }),
  });
  const open = { type: 'open', target: 'https://example.com/' };
  const page = { name: 'Home', apps: [] };
  const run = (action) => runPageAction(page, action, runner, null, null, undefined,
    { trace: true, guard: settings.guard() });
  const running = run({ type: 'sequence', steps: [{ type: 'delay', ms: 10, onError: 'continue' }, open] });
  assert.equal(typeof release, 'function');
  settings.set(true);
  settings.set(false);
  release();
  const result = await running;
  assert.equal(result.unavailable, true);
  assert.match(result.message, /view-only/i);
  assert.deepEqual(opened, []);
  assert.equal((await run(open)).ok, true);
  assert.deepEqual(opened, [open.target]);
});
