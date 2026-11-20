'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBacklightWidgets } = require('../src/renderer/display-backlight-widgets');
const { createRoutes } = require('../src/renderer/control-modes');
const { deckRequestAllowed } = require('../src/main/deck-view-only');

const turn = () => new Promise((resolve) => setImmediate(resolve));
const fake = (initial = 41) => {
  const calls = [];
  let update;
  let percent = initial;
  let revision = 0;
  let result;
  return {
    calls,
    get percent() { return percent; },
    resolveNext(value) { result = value; },
    api: {
      onDisplayBacklightWidgets(callback) { update = callback; },
      async displayBacklightWidgets(command) {
        calls.push(command);
        if (command.type === 'cancel') return { ok: true };
        if (result) {
          const response = result;
          result = undefined;
          return response;
        }
        if (command.type === 'apply') percent = command.percent;
        return { ok: true, token: String(++revision), percent };
      },
    },
    event(payload) { update(payload); },
  };
};

test('brightness widgets share a demand-driven read and refresh after invalidation without a timer', async () => {
  const fixture = fake();
  const provider = createBacklightWidgets(fixture.api);
  const left = [];
  const right = [];
  let finish;
  fixture.resolveNext(new Promise((resolve) => { finish = resolve; }));
  const stopLeft = provider.subscribe((value) => left.push(value));
  await turn();
  const stopRight = provider.subscribe((value) => right.push(value));
  finish({ ok: true, token: 'first-reading', percent: 41 });
  await turn();
  assert.deepEqual(fixture.calls, [{ type: 'read' }]);
  assert.equal(left.at(-1).reading.percent, 41);
  assert.equal(right.at(-1), left.at(-1));
  fixture.event('dialog-ready');
  await turn();
  assert.equal(fixture.calls.length, 1);
  fixture.event('dialog-change');
  await turn();
  assert.equal(fixture.calls.length, 2);
  stopLeft();
  stopRight();
  fixture.event('invalidated');
  await turn();
  assert.equal(fixture.calls.length, 2);
});

test('one successful commit publishes its readback, and an abandoned owner cannot submit a queued write', async () => {
  const fixture = fake();
  const provider = createBacklightWidgets(fixture.api);
  let latest;
  const stop = provider.subscribe((value) => { latest = value; });
  await turn();
  const old = latest.reading.token;
  const next = await provider.write('first', old, 60);
  assert.equal(latest.reading.percent, 60);
  assert.equal(next, latest);
  await assert.rejects(() => provider.write('first', old, 70), /Brightness changed/);
  let finish;
  fixture.resolveNext(new Promise((resolve) => { finish = resolve; }));
  const pending = provider.write('first', latest.reading.token, 72);
  provider.cancel('second');
  provider.cancel('first');
  finish({ ok: false, reason: 'stale', message: 'Display changed.' });
  await assert.rejects(pending, /Display changed/);
  await turn();
  assert.deepEqual(fixture.calls.map(({ type }) => type), ['read', 'apply', 'apply', 'cancel', 'read']);
  assert.equal(fixture.calls[3].owner, 'first');
  stop();
});

test('brightness route is deferred on controls, and view-only permits reading and cancellation only', () => {
  const { backlight } = createRoutes({
    api: {}, providers: { audio: {}, backlight: {} }, audioLabel: 'Speakers',
    settings: { device: 'output', defaultLevel: 50, modePicker: 'on' },
  });
  assert.equal(backlight.defer, true);
  assert.equal(backlight.read({ reading: { ok: false } }).endpoint, null);
  assert.deepEqual(backlight.read({ reading: { ok: true, token: 'fixture', percent: 30 }, version: 2 }), {
    endpoint: { id: 'fixture', level: 30, title: 'XENEON EDGE brightness' }, version: 2,
  });
  for (const type of ['read', 'cancel']) assert.equal(deckRequestAllowed('display:backlight:widgets', { type }), true);
  assert.equal(deckRequestAllowed('display:backlight:widgets', { type: 'apply' }), false);
});
