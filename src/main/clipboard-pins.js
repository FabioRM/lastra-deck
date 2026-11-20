// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { writeAtomic } = require('./write-atomic');

const PIN_LIMIT = 24;
const TEXT_LIMIT = 4_096;
const MAX_STORE_BYTES = 1_024 * 1_024;
const MAX_SEALED_CHARS = 30_000;
const REVIEW_MS = 120_000;
const ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const BASE64 = /^(?:[a-z\d+/]{4})*(?:[a-z\d+/]{2}==|[a-z\d+/]{3}=)?$/i;

const validLabel = (label) => typeof label === 'string' && label.trim() && label.length <= 80 && !/\p{Cc}/u.test(label);
const validText = (text) => typeof text === 'string' && text.length <= TEXT_LIMIT && text.trim() && !text.includes('\0');
const validBody = (body) => typeof body === 'string' && body.length > 0 && body.length <= MAX_SEALED_CHARS && BASE64.test(body);

function readPins(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > MAX_STORE_BYTES) throw new Error('Invalid clipboard pin file');
  const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  if (raw?.version !== 1 || !Array.isArray(raw.pins) || raw.pins.length > PIN_LIMIT) throw new Error('Invalid clipboard pin file');
  const ids = new Set();
  return raw.pins.map((pin) => {
    if (!pin || Object.keys(pin).length !== 4 || typeof pin.id !== 'string' || !ID.test(pin.id) || ids.has(pin.id)
        || !validLabel(pin.label) || !validBody(pin.sealed) || !Number.isInteger(pin.length) || pin.length < 1 || pin.length > TEXT_LIMIT) {
      throw new Error('Invalid clipboard pin');
    }
    ids.add(pin.id);
    return pin;
  });
}

/**
 * @typedef {object} ClipboardPinStorage
 * @property {() => Promise<boolean>} isAsyncEncryptionAvailable
 * @property {(text: string) => Promise<Buffer>} encryptStringAsync
 * @property {(sealed: Buffer) => Promise<{ result: string }>} decryptStringAsync
 */

/**
 * @typedef {object} ClipboardPinsOptions
 * @property {() => string} [readText]
 * @property {(text: string) => void} [writeText]
 * @property {ClipboardPinStorage} [storage]
 * @property {() => number} [now]
 * @property {() => any} [currentGuard]
 */

class ClipboardPins {
  /**
   * @param {string} file
   * @param {ClipboardPinsOptions} [options]
   */
  constructor(file, { readText, writeText, storage, now = Date.now, currentGuard = () => () => undefined } = {}) {
    this.file = file;
    this.readText = readText;
    this.writeText = writeText;
    this.storage = storage;
    this.now = now;
    this.currentGuard = currentGuard;
    this.pins = [];
    this.generation = 0;
    this.ready = this.initialize();
  }

  async initialize() {
    let encrypted;
    try { encrypted = await this.storage?.isAsyncEncryptionAvailable(); } catch { /* Use session storage. */ }
    this.mode = encrypted ? 'protected' : 'session';
    if (!encrypted) return;
    try { this.pins = readPins(this.file); }
    catch (error) { if (error.code !== 'ENOENT') this.mode = 'invalid'; }
  }

  async snapshot() {
    await this.ready;
    return { mode: this.mode, limit: PIN_LIMIT, pins: this.pins.map(({ id, label, length }) => ({ id, label, length })) };
  }

  clearReview() {
    clearTimeout(this.reviewTimer);
    this.review = undefined;
    this.generation++;
  }

  rememberReview(kind, text, guard, id) {
    const token = randomUUID();
    const expiresAt = this.now() + REVIEW_MS;
    this.review = { kind, text, guard, id, token, expiresAt };
    this.reviewTimer = setTimeout(() => this.clearReview(), REVIEW_MS).unref();
    return { kind, token, text, expiresAt };
  }

  assertGuard(guard) {
    const reason = guard();
    if (reason) throw new Error(reason);
  }

  getReview(token, kind) {
    const review = this.review;
    if (!review || review.token !== token || review.kind !== kind || this.now() >= review.expiresAt) {
      throw new Error('Open the clipboard preview again.');
    }
    this.assertGuard(review.guard);
    return review;
  }

  persist(next) {
    if (this.mode === 'protected') {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        writeAtomic(this.file, JSON.stringify({ version: 1, pins: next }) + '\n');
      } catch { throw new Error('Could not save the protected clipboard pins.'); }
    }
    this.pins = next;
  }

  capture() {
    this.clearReview();
    if (this.pins.length >= PIN_LIMIT) throw new Error('Remove a pin before capturing another.');
    const guard = this.currentGuard();
    this.assertGuard(guard);
    let text;
    try { text = this.readText(); }
    catch { throw new Error('Could not read text from the clipboard.'); }
    if (!validText(text)) throw new Error(`Copy plain text up to ${TEXT_LIMIT} characters to the clipboard first.`);
    return { ok: true, review: this.rememberReview('capture', text, guard) };
  }

  async pin({ token, label }) {
    const captured = this.getReview(token, 'capture');
    if (!validLabel(label)) throw new Error('Enter a pin name up to 80 characters.');
    const entry = { id: randomUUID(), label: label.trim(), length: captured.text.length };
    if (this.mode === 'protected') {
      try {
        entry.sealed = (await this.storage.encryptStringAsync(captured.text)).toString('base64');
        if (!validBody(entry.sealed)) throw new Error('Invalid encrypted result');
      } catch { throw new Error('Could not protect the clipboard pin.'); }
    } else entry.text = captured.text;
    this.getReview(token, 'capture');
    if (this.pins.length >= PIN_LIMIT) throw new Error('Remove a pin before saving another.');
    this.persist([...this.pins, entry]);
    this.clearReview();
    return { ok: true, id: entry.id };
  }

  async preview(id) {
    this.clearReview();
    const version = this.generation;
    const guard = this.currentGuard();
    this.assertGuard(guard);
    const entry = this.pins.find((item) => item.id === id);
    if (!entry) throw new Error('This clipboard pin is unavailable.');
    let text;
    try {
      text = this.mode === 'protected' ? (await this.storage.decryptStringAsync(Buffer.from(entry.sealed, 'base64'))).result : entry.text;
      if (!validText(text) || text.length !== entry.length) throw new Error('Invalid pin text');
    } catch { throw new Error('This clipboard pin could not be read.'); }
    this.assertGuard(guard);
    if (this.generation !== version || !this.pins.includes(entry)) throw new Error('Open the clipboard preview again.');
    return { ok: true, review: { ...this.rememberReview('saved', text, guard, id), id, label: entry.label } };
  }

  edit({ action, id, direction }) {
    this.assertGuard(this.currentGuard());
    const index = this.pins.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('This clipboard pin is unavailable.');
    const next = [...this.pins];
    if (action === 'remove') next.splice(index, 1);
    else {
      const delta = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
      if (!delta) throw new Error('Choose which way to move the clipboard pin.');
      const target = index + delta;
      if (target < 0 || target >= next.length) return { ok: true };
      [next[index], next[target]] = [next[target], next[index]];
    }
    this.persist(next);
    if (action === 'remove' && this.review?.id === id) this.clearReview();
    return { ok: true };
  }

  async change(command) {
    await this.ready;
    if (this.mode === 'invalid') throw new Error('The protected clipboard pin file could not be read.');
    switch (command?.action) {
      case 'capture': return this.capture();
      case 'pin': return this.pin(command);
      case 'preview': return this.preview(command.id);
      case 'copy': {
        const { text, id } = this.getReview(command.token, 'saved');
        if (!this.pins.some((pin) => pin.id === id)) throw new Error('This clipboard pin is unavailable.');
        try { this.writeText(text); }
        catch { throw new Error('Could not copy the pin to the clipboard.'); }
        return { ok: true };
      }
      case 'discard':
        if (this.review?.token === command.token) this.clearReview();
        return { ok: true };
      case 'move':
      case 'remove': return this.edit(command);
      default: throw new Error('Unknown clipboard pin command.');
    }
  }
}

module.exports = { ClipboardPins, PIN_LIMIT, TEXT_LIMIT, REVIEW_MS };
