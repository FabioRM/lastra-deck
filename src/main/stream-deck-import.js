// @ts-check
'use strict';

const { VK, parseCombo } = require('./actions/keys');
const { decodeStreamDeckArchive, readArchiveBytes, StreamDeckArchiveError } = require('./stream-deck-archive');

const HOTKEY = 'com.elgato.streamdeck.system.hotkey';
const FOLDER = 'com.elgato.streamdeck.profile.openchild';
/** @type {[field: string, name: string, bit: number][]} */
const MODIFIERS = [['KeyCtrl', 'Ctrl', 2], ['KeyShift', 'Shift', 1], ['KeyOption', 'Alt', 4], ['KeyCmd', 'Win', 8]];
const KEYS = new Map(Object.entries(VK).filter(([, vk]) => ![0x10, 0x11, 0x12, 0x5b, 0x5c].includes(vk)).reverse()
  .map(([name, vk]) => [vk, name.length === 1 ? name.toUpperCase() : name]));
const OEM = new Set([0xba, 0xbb, 0xbc, 0xbd, 0xbe, 0xbf, 0xc0, 0xdb, 0xdc, 0xdd, 0xde]);
const QT_NAMED = new Map([[0x08, 3], [0x09, 1], [0x0d, 4], [0x13, 8], [0x14, 36], [0x1b, 0], [0x21, 22],
  [0x22, 23], [0x23, 17], [0x24, 16], [0x25, 18], [0x26, 19], [0x27, 20], [0x28, 21], [0x2c, 9], [0x2d, 6], [0x2e, 7]]);
const ACTION_LIMIT = 4096;
const BASE32 = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
const ID = /^[a-z0-9_-]+(?:\.[a-z0-9_-]+){1,10}$/i;
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function label(value, fallback = '') {
  return (typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) : '') || fallback;
}

function references(value) {
  if (typeof value !== 'string' || !/^[a-z0-9_-]{1,72}(?:\.sdprofile)?$/i.test(value)) return [];
  const normalized = value.replace(/\.sdprofile$/i, '').toLowerCase();
  const guid = normalized.replaceAll('-', '');
  if (!/^[a-f0-9]{32}$/.test(guid)) return [normalized];
  const bits = [...Buffer.from(guid, 'hex')].map((byte) => byte.toString(2).padStart(8, '0')).join('').padEnd(130, '0');
  const folder = bits.match(/.{5}/g).map((part) => BASE32[Number.parseInt(part, 2)]).join('').toLowerCase() + 'z';
  return [normalized, guid, folder];
}

function coordinate(value) {
  const match = /^(0|[1-9][0-9]{0,2}),(0|[1-9][0-9]{0,2})$/.exec(value);
  return match ? { column: Number(match[1]), row: Number(match[2]) } : null;
}

function qtAgrees(vk, qt, shift) {
  if (qt === undefined || qt === -1 || qt === 0 || qt === 0x1ffffff) return true;
  if (!Number.isSafeInteger(qt) || qt < 0) return false;
  if (vk >= 0x41 && vk <= 0x5a) return qt === vk || qt === vk + 32;
  if (vk >= 0x30 && vk <= 0x39) return qt === vk || (shift && qt === ')!@#$%^&*('.charCodeAt(vk - 0x30));
  if (vk >= 0x60 && vk <= 0x69) return qt === vk - 0x30;
  if (vk >= 0x70 && vk <= 0x87) return qt === 0x01000030 + vk - 0x70;
  if (QT_NAMED.has(vk)) return qt === 0x01000000 + QT_NAMED.get(vk) || (vk === 0x0d && qt === 0x01000005);
  if (vk === 0x20) return qt === 0x20;
  if (OEM.has(vk)) return qt < 0x01000000 && !/^[0-9a-z]$/i.test(String.fromCodePoint(Math.min(qt, 0x10ffff)));
  return true;
}

/**
 * A converted key, or why it could not be converted.
 * @typedef {{ reason?: string, dependency?: string, keys?: string, layoutDependent?: boolean }} ConvertedKey
 */

/** @returns {ConvertedKey} */
function windowsChord(settings) {
  const values = settings?.Hotkeys;
  if (!Array.isArray(values) || !values.length || values.length > 8 || values.some((item) => !record(item))) return { reason: 'unmapped-key' };
  const configured = values.filter((item) => item.VKeyCode !== -1 || MODIFIERS.some(([field]) => item[field] !== undefined && item[field] !== false)
    || (item.KeyModifiers !== undefined && item.KeyModifiers !== 0));
  if (configured.length !== 1) return { reason: configured.length ? 'multiple-chords' : 'unmapped-key' };
  const hotkey = configured[0];
  const vk = hotkey.VKeyCode;
  if (!KEYS.has(vk) || MODIFIERS.some(([field]) => hotkey[field] !== undefined && typeof hotkey[field] !== 'boolean')) return { reason: 'unmapped-key' };
  const modifiers = MODIFIERS.filter(([name]) => hotkey[name] === true);
  const mask = modifiers.reduce((bits, [, , bit]) => bits | bit, 0);
  if ((hotkey.KeyModifiers !== undefined && hotkey.KeyModifiers !== mask)
      || (hotkey.NativeCode !== undefined && ![-1, 0, vk].includes(hotkey.NativeCode))
      || !qtAgrees(vk, hotkey.QTKeyCode, hotkey.KeyShift)) return { reason: 'ambiguous-keyboard' };
  const layoutDependent = OEM.has(vk);
  const keys = [...modifiers.map(([, name]) => name), layoutDependent ? `vk:${vk.toString(16)}` : KEYS.get(vk)].join('+');
  parseCombo(keys);
  return { keys, layoutDependent };
}

function actionEntries(manifest) {
  const controllers = Array.isArray(manifest.Controllers) ? manifest.Controllers : [];
  const keypads = controllers.filter((item) => record(item) && item.Type === 'Keypad');
  if (record(manifest.Actions)) return { items: Object.entries(manifest.Actions), ignoredControllers: controllers.length };
  return { items: keypads.flatMap(({ Actions }) => record(Actions) ? Object.entries(Actions) : []),
    ignoredControllers: controllers.length - keypads.length };
}

function actionLabel(action, fallback = '') {
  const states = Array.isArray(action?.States) ? action.States : [];
  return label(states[0]?.Title, label(action?.Name, fallback));
}

/** @returns {ConvertedKey} */
function unsupported(action, uuid) {
  if (uuid === FOLDER || uuid.startsWith('com.elgato.streamdeck.profile.') || uuid.startsWith('com.elgato.streamdeck.page.')) return { reason: 'navigation' };
  if (uuid === 'com.elgato.streamdeck.system.open' || uuid === 'com.elgato.streamdeck.system.website') return { reason: 'external-action' };
  if (uuid.startsWith('com.elgato.streamdeck.')) return { reason: 'unsupported-action' };
  const original = action?.Plugin?.UUID;
  const dependency = typeof original === 'string' && original.length <= 100 && ID.test(original) ? original
    : uuid.length <= 100 && ID.test(uuid) ? uuid : null;
  return { reason: dependency ? 'plugin' : 'unsupported-action', ...(dependency ? { dependency } : {}) };
}

function convertStreamDeckArchive({ manifests, ignoredEntries }) {
  const root = manifests.get('manifest.json');
  const version = root.Version ?? (record(root.Pages) ? '2.0' : '1.0');
  if (!['1.0', '2.0'].includes(version) || (version === '1.0' ? !record(root.Actions) : !record(root.Pages))) {
    throw new Error('The Stream Deck export uses an unsupported profile format.');
  }
  const name = label(root.Name, 'Stream Deck');
  const candidates = [...manifests].flatMap(([path, manifest]) => {
    const rootManifest = path === 'manifest.json';
    const hasSurface = record(manifest.Actions) || Array.isArray(manifest.Controllers);
    return hasSurface && (!rootManifest || version === '1.0') ? [{ path, manifest,
      id: path.split('/').at(-2) ?? '', ...actionEntries(manifest) }] : [];
  });
  if (!candidates.length) throw new Error('The Stream Deck export contains no supported page manifests.');
  if (candidates.reduce((total, { items }) => total + items.length, 0) > ACTION_LIMIT) throw new Error('The Stream Deck export contains too many actions.');
  const byReference = new Map();
  for (const page of candidates) {
    for (const ref of references(page.id)) {
      if (!byReference.has(ref)) byReference.set(ref, []);
      byReference.get(ref).push(page);
    }
  }
  function findPage(value) {
    const results = new Set(references(value).flatMap((ref) => byReference.get(ref) ?? []));
    return results.size === 1 ? [...results][0] : undefined;
  }
  const ordered = new Set();
  const pageOrder = Array.isArray(root.Pages?.Pages) ? root.Pages.Pages.slice(0, 64) : [];
  pageOrder.forEach((ref) => { const page = findPage(ref); if (page) ordered.add(page); });
  candidates.sort((a, b) => a.path.length - b.path.length || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  candidates.forEach((page) => ordered.add(page));
  const folderNames = new Map();
  for (const { items } of ordered) for (const [, action] of items) {
    if (typeof action?.UUID === 'string' && action.UUID.toLowerCase() === FOLDER) {
      const child = findPage(action.Settings?.ProfileUUID);
      if (child && !folderNames.has(child)) folderNames.set(child, actionLabel(action, 'Folder'));
    }
  }
  const dependencies = new Set();
  const pages = [...ordered].map((page, index) => {
    const keys = [];
    const issues = [];
    const positions = new Map();
    for (const [loc] of page.items) positions.set(loc, (positions.get(loc) ?? 0) + 1);
    for (const [loc, action] of page.items) {
      const position = coordinate(loc);
      const keyLabel = actionLabel(action, 'Unnamed action');
      const uuid = typeof action?.UUID === 'string' && action.UUID.length <= 100 ? action.UUID.toLowerCase() : '';
      if (!position) { issues.push({ label: keyLabel, reason: 'unmapped-position' }); continue; }
      if (positions.get(loc) > 1) { issues.push({ ...position, label: keyLabel, reason: 'duplicate-position' }); continue; }
      const converted = uuid === HOTKEY ? windowsChord(action.Settings) : unsupported(action, uuid);
      if (converted.reason) {
        if (converted.dependency) dependencies.add(converted.dependency);
        issues.push({ ...position, label: keyLabel, ...converted });
      } else keys.push({ ...position, label: actionLabel(action, converted.keys), ...converted });
    }
    keys.sort((a, b) => a.row - b.row || a.column - b.column);
    const pageName = label(page.manifest.Name, folderNames.get(page) ?? (index === 0 ? name : `Page ${index + 1}`));
    return { id: `stream-deck-${index + 1}`, name: pageName, keys, issues, ignoredControllers: page.ignoredControllers };
  });
  return { name, version, pages, dependencies: [...dependencies].sort().slice(0, 128), omittedDependencies: Math.max(0, dependencies.size - 128), ignoredEntries,
    hasForegroundHint: typeof root.AppIdentifier === 'string' && !!root.AppIdentifier.trim() };
}

async function previewStreamDeckProfile(bytes) {
  return convertStreamDeckArchive(await decodeStreamDeckArchive(bytes));
}

async function readStreamDeckProfile(file) {
  if (typeof file !== 'string' || !/\.streamDeckProfile$/i.test(file)) throw new Error('Choose a .streamDeckProfile export.');
  let bytes;
  try { bytes = await readArchiveBytes(file); }
  catch (error) {
    if (error instanceof StreamDeckArchiveError) throw error;
    throw new Error('The selected Stream Deck file could not be opened.');
  }
  return previewStreamDeckProfile(bytes);
}

module.exports = { previewStreamDeckProfile, readStreamDeckProfile };
