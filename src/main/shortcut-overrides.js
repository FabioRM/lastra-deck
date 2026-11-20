// @ts-check
'use strict';

const { createHash } = require('node:crypto');
const { parseCombo, VK } = require('./actions/keys');

const ID = /^[a-z0-9-]{1,48}\/[a-z0-9-]{1,64}\/[a-f0-9]{20}$/;
const MODIFIERS = new Set([VK.shift, VK.ctrl, VK.alt, VK.lwin, VK.rwin, 0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5]);

function shortcutOverrideId(pack, key) {
  const { action, binding } = key;
  const guard = action?.shortcutGuard;
  if (!guard || action.type !== 'hotkey' || !action.keys) return;
  if (binding && (binding.verification.status !== 'documented' || binding.appVersion
      || (binding.layout && binding.layout !== 'US'))) return;
  const id = binding?.id ?? key.id;
  const scope = [binding?.actionId, binding?.context, guard.platform, binding?.hostPlatform ?? 'windows',
    binding?.edition, binding?.appVersion, guard.minBuild, guard.language, guard.layout, guard.mode];
  const hash = createHash('sha256').update(JSON.stringify(scope)).digest('hex').slice(0, 20);
  const identity = pack.id + '/' + id + '/' + hash;
  return ID.test(identity) ? identity : undefined;
}

function annotateShortcut(pack, key) {
  const overrideId = shortcutOverrideId(pack, key);
  return overrideId ? { ...key, overrideId } : key;
}

function normalizeOverrideChord(value) {
  if (typeof value !== 'string' || !/^\P{C}{1,120}$/u.test(value.trim())) {
    throw new Error('Enter one shortcut chord such as Ctrl+Shift+F.');
  }
  const keys = parseCombo(value);
  const identities = keys.map(({ vk, character, scan, extended }) => String(vk ?? character ?? `scan:${extended}:${scan}`));
  if (new Set(identities).size !== keys.length) throw new Error('A shortcut cannot repeat the same key.');
  if (keys.every(({ vk }) => MODIFIERS.has(vk))) throw new Error('Add a key other than Ctrl, Shift, Alt, or Windows.');
  return value.trim();
}

function validateShortcutOverrides(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Shortcut overrides must be an object.');
  return Object.fromEntries(Object.entries(value).map(([id, chord]) => {
    if (!ID.test(id)) throw new Error('Invalid shortcut override ID.');
    return [id, normalizeOverrideChord(chord)];
  }));
}

module.exports = { annotateShortcut, shortcutOverrideId, normalizeOverrideChord, validateShortcutOverrides };
