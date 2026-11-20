// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { writeAtomic } = require('./write-atomic');

/**
 * Read a small JSON settings file. A missing, oversized, unparsable or rejected file returns
 * the fallback; `onError` runs for every failure except a missing file, so callers can warn
 * about damaged settings without warning on first launch.
 * @template T
 * @param {string} file
 * @param {object} options
 * @param {number} options.maxBytes Largest accepted file size.
 * @param {(data: any) => T} options.parse Validates and normalizes the parsed JSON. Throw to reject it.
 * @param {(error: any) => T} options.fallback Value to use instead, called with the failure.
 * @param {(error: any) => void} [options.onError] Called for failures other than a missing file.
 * @returns {T}
 */
function readJsonSettings(file, { maxBytes, parse, fallback, onError }) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('Invalid settings file');
    return parse(JSON.parse(stripBom(fs.readFileSync(file, 'utf8'))));
  } catch (error) {
    if (!isMissing(error)) onError?.(error);
    return fallback(error);
  }
}

/** @param {string} text */
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** @param {any} error */
function isMissing(error) {
  return error?.code === 'ENOENT';
}

/**
 * Create the settings folder and atomically replace the file with `value` as JSON plus a newline.
 * With `failure`, an error is rethrown with that message; the original stays in `cause` and its
 * `code` is kept so callers can still tell a locked file from a full disk.
 * @param {string} file
 * @param {unknown} value
 * @param {object} [options]
 * @param {number} [options.space] JSON indentation.
 * @param {string} [options.failure] User-facing message for a failed save.
 */
function writeJsonSettings(file, value, { space, failure } = {}) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeAtomic(file, JSON.stringify(value, null, space) + '\n');
  } catch (error) {
    if (failure === undefined) throw error;
    throw Object.assign(new Error(failure, { cause: error }), error?.code === undefined ? {} : { code: error.code });
  }
}

module.exports = { readJsonSettings, writeJsonSettings, isMissing };
