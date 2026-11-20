// @ts-check
'use strict';

const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

// Antivirus scanners, the search indexer and OneDrive briefly hold files open on Windows,
// which makes the final rename fail with one of these codes. They usually clear within milliseconds.
const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RETRY_DELAYS_MS = [20, 40, 80, 160];
const pause = new Int32Array(new SharedArrayBuffer(4));

function sleep(ms) {
  Atomics.wait(pause, 0, 0, ms);
}

function renameWithRetry(from, to, rename = fs.renameSync) {
  for (let attempt = 0; ; attempt++) {
    try {
      rename(from, to);
      return;
    } catch (err) {
      if (!TRANSIENT.has(err?.code) || attempt >= RETRY_DELAYS_MS.length) throw err;
      sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

/**
 * Replace a file so readers see either the old or the new text, never a partial one.
 * The data is flushed before the rename so a power loss cannot leave an empty file behind.
 * Errors keep their original `code` so callers can tell a lock from a full disk.
 * @param {string} file
 * @param {string | Buffer} text
 * @param {{ rename?: (from: string, to: string) => void }} [options] Test hook replacing fs.renameSync.
 */
function writeAtomic(file, text, { rename } = {}) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const fd = fs.openSync(temporary, 'wx');
    try {
      const data = Buffer.isBuffer(text) ? text : Buffer.from(String(text), 'utf8');
      for (let offset = 0; offset < data.length;) offset += fs.writeSync(fd, data, offset, data.length - offset);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    renameWithRetry(temporary, file, rename);
  } finally {
    try { fs.unlinkSync(temporary); } catch { /* already renamed or never created */ }
  }
}

module.exports = { writeAtomic, renameWithRetry };
