// @ts-check
'use strict';

const { writeAtomic } = require('./write-atomic');

// Hand-edited settings files (obs.json, syncthing.json) may contain a password or API key.
// On Windows, Lastra replaces the plain value with a copy protected by Windows Data Protection
// (Electron safeStorage) the first time it reads the file. The protected copy only opens for the
// same Windows user on the same PC; enter the plain value again after moving the file elsewhere.

let storage = null;

/** Called once by the main process after Electron is ready. Tests and non-Windows runs leave it unset. */
function setSecretStorage(next) {
  storage = next ?? null;
}

function available() {
  try { return Boolean(storage?.isEncryptionAvailable?.()); } catch { return false; }
}

const sealedField = (field) => `${field}Protected`;

/**
 * Read a secret from a parsed settings object. A plain value wins, so typing a new password into
 * the file replaces the protected copy; otherwise the protected copy is opened.
 */
function openSecret(raw, field) {
  const sealed = raw?.[sealedField(field)];
  if (raw?.[field] !== undefined || typeof sealed !== 'string') return raw?.[field];
  if (!available()) throw new Error(`Enter the ${field} again: its protected copy cannot be opened here.`);
  try {
    return storage.decryptString(Buffer.from(sealed, 'base64'));
  } catch {
    throw new Error(`Enter the ${field} again: its protected copy belongs to another Windows user or PC.`);
  }
}

/** Replace a plain secret in the file with its protected copy. Returns true when the file was rewritten. */
/**
 * @param {string} file
 * @param {any} raw
 * @param {string} field
 * @param {(...args: any[]) => void} [log]
 */
function sealSecret(file, raw, field, log = () => {}) {
  const value = raw?.[field];
  if (typeof value !== 'string' || !value || !available()) return false;
  try {
    const { [field]: _plain, ...rest } = raw;
    const next = { ...rest, [sealedField(field)]: storage.encryptString(value).toString('base64') };
    writeAtomic(file, `${JSON.stringify(next, null, 2)}\n`);
    return true;
  } catch (err) {
    log(`Could not protect the ${field} in ${file}:`, err.message);
    return false;
  }
}

/** Protect several plain top-level secrets in one rewrite of the settings file. */
function sealSecrets(file, raw, fields, log = (..._args) => {}) {
  let next = { ...raw };
  let changed = false;
  for (const field of fields) {
    const value = next[field];
    if (typeof value !== 'string' || !value || !available()) continue;
    try {
      const { [field]: _plain, ...rest } = next;
      next = { ...rest, [sealedField(field)]: storage.encryptString(value).toString('base64') };
      changed = true;
    } catch (err) {
      log(`Could not protect the ${field} in ${file}:`, err.message);
    }
  }
  if (changed) writeAtomic(file, `${JSON.stringify(next, null, 2)}\n`);
  return changed;
}

module.exports = { setSecretStorage, openSecret, sealSecret, sealSecrets, sealedField };
