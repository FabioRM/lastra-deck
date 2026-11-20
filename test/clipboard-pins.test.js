'use strict';

const assert = require('node:assert/strict');
const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { ClipboardPins, PIN_LIMIT, TEXT_LIMIT, REVIEW_MS } = require('../src/main/clipboard-pins');
const { AppViews } = require('../src/main/app-views');
const { tempDir } = require('./helpers/temp-dir');

function protectedStorage() {
  const key = randomBytes(32);
  return {
    isAsyncEncryptionAvailable: async () => true,
    async encryptStringAsync(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    },
    async decryptStringAsync(bytes) {
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return { result: Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8') };
    },
  };
}

function fixture(t) {
  const opened = [];
  t.after(() => opened.forEach((pins) => pins.clearReview()));
  const directory = tempDir(t, 'lastra-clipboard-pins-');
  const file = path.join(directory, 'clipboard-pins.json');
  const storage = protectedStorage();
  function open(options = {}) {
    const pins = new ClipboardPins(file, { storage, ...options });
    opened.push(pins);
    return pins;
  }
  return { directory, file, storage, open };
}

async function add(pins, label) {
  const captured = await pins.change({ action: 'capture' });
  return pins.change({ action: 'pin', label, token: captured.review.token });
}

test('the app view captures once, saves protected bytes and recalls selected pins in the same order after restart', async (t) => {
  const { directory, file, open } = fixture(t);
  const written = [];
  let clipboard = ' Exact captured text\nwith break ';
  let reads = 0;
  const readText = () => { reads++; return clipboard; };
  const writeText = (value) => written.push(value);
  const pins = open({ readText, writeText });
  const views = new AppViews(path.join(directory, 'app-views.json'), { providers: { 'clipboard-pins': pins } });
  assert.equal(views.snapshot().views.find(({ id }) => id === 'clipboard-pins').name, 'Pinned clipboard');
  const change = (action, input = {}) => views.change({ type: 'provider', viewId: 'clipboard-pins', action, ...input });
  assert.deepEqual(await views.data('clipboard-pins'), { mode: 'protected', limit: PIN_LIMIT, pins: [] });
  assert.equal(reads, 0);
  const { review } = await change('capture');
  assert.equal(review.text, clipboard);
  assert.equal(fs.existsSync(file), false);
  clipboard = 'New unrelated clipboard value';
  const first = await change('pin', { token: review.token, label: 'Original text', text: 'Replacement' });
  assert.equal(reads, 1);
  clipboard = 'Second synthetic pin';
  const second = await add(pins, 'Second');
  await change('move', { id: second.id, direction: 'up' });
  const bytes = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(bytes, /Exact captured text|Second synthetic pin|New unrelated clipboard/);
  const snapshot = await views.data('clipboard-pins');
  assert.deepEqual(snapshot.pins.map(({ id }) => id), [second.id, first.id]);
  assert.deepEqual(Object.keys(snapshot.pins[0]), ['id', 'label', 'length']);
  const restored = open({ readText, writeText });
  assert.deepEqual(await restored.snapshot(), snapshot);
  await assert.rejects(restored.change({ action: 'copy', token: 'unknown' }), /preview again/);
  const selected = await restored.change({ action: 'preview', id: first.id });
  assert.equal(selected.review.text, ' Exact captured text\nwith break ');
  assert.deepEqual(written, []);
  await restored.change({ action: 'copy', token: selected.review.token, text: 'Replacement' });
  assert.deepEqual(written, [' Exact captured text\nwith break ']);
  assert.equal(reads, 2);
  await restored.change({ action: 'remove', id: first.id });
  await assert.rejects(restored.change({ action: 'copy', token: selected.review.token }), /preview again/);
  assert.deepEqual((await open().snapshot()).pins.map(({ id }) => id), [second.id]);
});

test('expired reviews and view changes deny side effects before and during protected storage', async (t) => {
  const { file, open, storage } = fixture(t);
  let now = 1;
  let generation = 0;
  let read = 0;
  let writable = true;
  const copied = [];
  const currentGuard = () => {
    const captured = generation;
    return () => !writable || captured !== generation ? 'Deck mode changed' : undefined;
  };
  let enter;
  let resume;
  let delayed = false;
  const started = new Promise((resolve) => { enter = resolve; });
  const encryption = new Promise((resolve) => { resume = resolve; });
  const pins = open({ now: () => now, currentGuard, readText: () => { read++; return 'Synthetic text'; }, writeText: (value) => copied.push(value),
    storage: { ...storage, async encryptStringAsync(text) { if (delayed) { enter(); await encryption; } return storage.encryptStringAsync(text); } },
  });
  writable = false;
  await assert.rejects(pins.change({ action: 'capture' }), /mode changed/);
  assert.equal(read, 0);
  writable = true;
  const expired = (await pins.change({ action: 'capture' })).review;
  now += REVIEW_MS;
  await assert.rejects(pins.change({ action: 'pin', token: expired.token, label: 'Expired' }), /preview again/);
  assert.equal(fs.existsSync(file), false);
  const capture = (await pins.change({ action: 'capture' })).review;
  delayed = true;
  const save = pins.change({ action: 'pin', token: capture.token, label: 'Changed' });
  await started;
  generation++;
  resume();
  await assert.rejects(save, /mode changed/);
  assert.equal(fs.existsSync(file), false);
  delayed = false;
  const pinned = await add(pins, 'Available');
  const review = (await pins.change({ action: 'preview', id: pinned.id })).review;
  writable = false;
  await assert.rejects(pins.change({ action: 'copy', token: review.token }), /mode changed/);
  await assert.rejects(pins.change({ action: 'remove', id: pinned.id }), /mode changed/);
  assert.deepEqual(copied, []);
  assert.equal((await pins.snapshot()).pins.length, 1);
});

test('unavailable encryption uses session memory and a damaged store stays byte-for-byte intact', async (t) => {
  const { file, open } = fixture(t);
  fs.writeFileSync(file, '{broken');
  const broken = open({ readText: () => assert.fail('Invalid store touched the clipboard') });
  assert.equal((await broken.snapshot()).mode, 'invalid');
  await assert.rejects(broken.change({ action: 'capture' }), /file could not be read/);
  let raw = 'Session-only text';
  const session = open({ storage: { isAsyncEncryptionAvailable: async () => false }, readText: () => raw });
  assert.equal((await session.snapshot()).mode, 'session');
  const pinned = await add(session, 'Local');
  assert.equal((await session.change({ action: 'preview', id: pinned.id })).review.text, raw);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  raw = 'x'.repeat(TEXT_LIMIT + 1);
  await assert.rejects(session.change({ action: 'capture' }), /up to 4096/);
  raw = '   ';
  await assert.rejects(session.change({ action: 'capture' }), /plain text/);
  assert.deepEqual((await open({ storage: undefined }).snapshot()).pins, []);
});
