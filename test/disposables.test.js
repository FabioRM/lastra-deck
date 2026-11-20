'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDisposables } = require('../src/main/disposables');

test('teardown runs newest first and only once', () => {
  const calls = [];
  const disposables = createDisposables(() => {});
  disposables.add('first', () => calls.push('first'));
  disposables.add('second', () => calls.push('second'));
  disposables.add('third', () => calls.push('third'));
  assert.equal(disposables.size, 3);
  disposables.dispose();
  assert.deepEqual(calls, ['third', 'second', 'first']);
  assert.equal(disposables.size, 0);
  disposables.dispose();
  assert.deepEqual(calls, ['third', 'second', 'first']);
});

test('a failing step is logged and the remaining steps still run', () => {
  const calls = [];
  const lines = [];
  const disposables = createDisposables((...args) => lines.push(args.join(' ')));
  disposables.add('audio', () => calls.push('audio'));
  disposables.add('OBS', () => { throw new Error('socket closed'); });
  disposables.add('sensors', () => calls.push('sensors'));
  disposables.dispose();
  assert.deepEqual(calls, ['sensors', 'audio']);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^Stopping OBS failed: Error: socket closed/);
});

test('a rejected asynchronous step is logged instead of becoming an unhandled rejection', async () => {
  const lines = [];
  const disposables = createDisposables((...args) => lines.push(args.join(' ')));
  disposables.add('store', () => Promise.reject(new Error('busy')));
  disposables.dispose();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^Stopping store failed: Error: busy/);
});

test('steps added after a dispose run on the next dispose', () => {
  const calls = [];
  const disposables = createDisposables(() => {});
  disposables.add('early', () => calls.push('early'));
  disposables.dispose();
  disposables.add('late', () => calls.push('late'));
  disposables.dispose();
  assert.deepEqual(calls, ['early', 'late']);
});

test('teardown must be a function', () => {
  const disposables = createDisposables(() => {});
  assert.throws(() => disposables.add('broken', /** @type {any} */ (null)), TypeError);
});
