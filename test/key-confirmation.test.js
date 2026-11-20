'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { KeyConfirmation } = require('../src/main/key-confirmation');
const { validateProfile, toView } = require('../src/main/profile');

test('key confirmations preserve the legacy setting and validate both configured modes', () => {
  const action = { type: 'delay', ms: 50 };
  const profile = (confirm, extra) => validateProfile({ keys: [{ id: 'example', action, confirm, ...extra }] });
  const slot = (confirm) => toView(profile(confirm)).slots[0];
  assert.equal(slot(false).confirm, null);
  assert.equal(slot(true).confirm, 'hold');
  assert.equal(slot(true).confirmMs, undefined);
  assert.equal(slot({ mode: 'hold', holdMs: 850 }).confirmMs, 850);
  assert.equal(slot({ mode: 'prompt' }).confirm, 'prompt');
  assert.throws(() => profile({ mode: 'prompt', holdMs: 500 }), /for hold confirmation/);
  assert.throws(() => profile({ mode: 'hold', holdMs: 150 }), /250 and 3000/);
  assert.throws(() => profile({ mode: 'prompt' }, { double: action }), /single gesture/);
});

test('a confirmation token is single-use and bound to its key, revision and foreground window', () => {
  const prompts = new KeyConfirmation();
  const token = prompts.begin('example', 2, 123n);
  assert.equal(prompts.consume('unknown', 'example', 2, 123n), false);
  assert.equal(prompts.consume(token, 'example', 2, 123n), true);
  assert.equal(prompts.consume(token, 'example', 2, 123n), false);

  const stale = prompts.begin('example', 2, 123n);
  assert.equal(prompts.consume(stale, 'example', 2, 456n), false);
  assert.equal(prompts.consume(stale, 'example', 2, 123n), false);
  const changedPage = prompts.begin('example', 2, 123n);
  assert.equal(prompts.consume(changedPage, 'example', 3, 123n), false);
  const changedKey = prompts.begin('example', 2, 123n);
  assert.equal(prompts.consume(changedKey, 'other', 2, 123n), false);
});

test('cancelling an old dialog cannot invalidate the current prompt', () => {
  const prompts = new KeyConfirmation();
  const old = prompts.begin('example', 2, 123n);
  const next = prompts.begin('example', 2, 123n);
  prompts.cancel(old);
  assert.equal(prompts.consume(next, 'example', 2, 123n), true);

  const cancelled = prompts.begin('example', 2, 123n);
  prompts.cancel(cancelled);
  assert.equal(prompts.consume(cancelled, 'example', 2, 123n), false);
  const hidden = prompts.begin('example', 2, 123n);
  prompts.clear();
  assert.equal(prompts.consume(hidden, 'example', 2, 123n), false);
});
