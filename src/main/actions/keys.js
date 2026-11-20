// @ts-check
'use strict';

// Windows virtual-key codes and hotkey parsing. This module is platform-independent.

const { layoutTokens } = require('../../shared/action-flow');

const VK = {
  // modifiers
  ctrl: 0x11, control: 0x11, shift: 0x10, alt: 0x12, win: 0x5b, lwin: 0x5b, rwin: 0x5c,
  // editing and navigation
  backspace: 0x08, tab: 0x09, enter: 0x0d, return: 0x0d, pause: 0x13, capslock: 0x14,
  esc: 0x1b, escape: 0x1b, space: 0x20, pageup: 0x21, pagedown: 0x22, end: 0x23,
  home: 0x24, left: 0x25, up: 0x26, right: 0x27, down: 0x28, printscreen: 0x2c,
  insert: 0x2d, delete: 0x2e, del: 0x2e, apps: 0x5d, menu: 0x5d,
  // numeric keypad
  num0: 0x60, num1: 0x61, num2: 0x62, num3: 0x63, num4: 0x64, num5: 0x65,
  num6: 0x66, num7: 0x67, num8: 0x68, num9: 0x69, multiply: 0x6a, add: 0x6b,
  subtract: 0x6d, decimal: 0x6e, divide: 0x6f,
  // Legacy punctuation names denote Windows OEM virtual keys.
  semicolon: 0xba, plus: 0xbb, equals: 0xbb, comma: 0xbc, minus: 0xbd, period: 0xbe, slash: 0xbf,
  backquote: 0xc0, bracketleft: 0xdb, backslash: 0xdc, bracketright: 0xdd, quote: 0xde,
  // media and volume
  volumemute: 0xad, volumedown: 0xae, volumeup: 0xaf, medianext: 0xb0, mediaprev: 0xb1,
  mediastop: 0xb2, mediaplaypause: 0xb3,
};

for (let i = 0; i < 26; i++) VK[String.fromCharCode(97 + i)] = 0x41 + i; // a-z
for (let i = 0; i < 10; i++) VK[String(i)] = 0x30 + i; // 0-9
for (let i = 1; i <= 24; i++) VK['f' + i] = 0x6f + i; // f1-f24

// Windows marks these keys as extended to distinguish them from numeric keypad keys.
const EXTENDED = new Set([
  0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, // page keys, home/end, arrows
  0x2c, 0x2d, 0x2e, // print screen, insert, delete
  0x5b, 0x5c, 0x5d, // win, menu
  0x6f, // numeric keypad divide
  0xad, 0xae, 0xaf, 0xb0, 0xb1, 0xb2, 0xb3, // media and volume
]);

const MEDIA = {
  playpause: VK.mediaplaypause,
  next: VK.medianext,
  prev: VK.mediaprev,
  stop: VK.mediastop,
  mute: VK.volumemute,
  volup: VK.volumeup,
  voldown: VK.volumedown,
};

const CHARACTERS = Object.freeze({ slash: '/', backquote: '`', equals: '=', plus: '+', semicolon: ';', colon: ':' });
const SHIFT = 1;
const CONTROL = 2;
const ALT = 4;

function characterToken(value) {
  const character = Object.hasOwn(CHARACTERS, value.toLowerCase()) ? CHARACTERS[value.toLowerCase()] : value;
  if (character.length !== 1 || /[\p{C}\s]/u.test(character)) throw new Error(`Invalid character key "${value}"`);
  return { name: 'char:' + value, character };
}

function parseKey(token) {
  const name = token.toLowerCase();
  if (name.startsWith('char:')) return characterToken(token.slice(5));
  if (Object.values(CHARACTERS).includes(token)) return characterToken(token);
  if (/^vk:[0-9a-f]{2}$/.test(name)) {
    const vk = Number.parseInt(name.slice(3), 16);
    if (vk > 0 && vk < 0xff) return { name, vk, extended: EXTENDED.has(vk) };
  }
  if (/^scan:(?:e0)?[0-9a-f]{2}$/.test(name)) {
    const scan = Number.parseInt(name.slice(5), 16);
    if ((scan & 0xff) > 0 && (scan & 0xff) < 0x80) return { name, scan: scan & 0xff, extended: scan > 0xff };
  }
  const vk = VK[name];
  if (!Number.isInteger(vk)) throw new Error(`Unknown key: "${name}"`);
  return { name, vk, extended: EXTENDED.has(vk) };
}

/**
 * "ctrl+shift+m" -> [{ name, vk, extended }, ...]
 * Throw a readable error for an unknown key.
 */
function parseCombo(combo) {
  if (typeof combo !== 'string' || !combo.trim()) {
    throw new Error('Empty key combination');
  }
  const text = combo.trim();
  const notation = text === '+' ? 'char:plus' : text.replace(/char:\s*\+$/i, 'char:plus').replace(/\+\s*\+$/, '+char:plus');
  const parts = notation.split('+').map((part) => part.trim());
  if (parts.length > 6 || parts.some((part) => !part)) {
    throw new Error(`Invalid key combination: "${combo}"`);
  }
  const keys = parts.map(parseKey);
  if (keys.filter(({ character }) => character !== undefined).length > 1) throw new Error('Use one character per shortcut chord.');
  return keys;
}

function resolveCombo(keys, layout, mapCharacter) {
  const index = keys.findIndex(({ character }) => character !== undefined);
  if (index === -1) return keys;
  const { character, name } = keys[index];
  if (layout == null || layout === 0 || layout === 0n || !mapCharacter) throw new Error('The target keyboard layout is unavailable.');
  const mapping = mapCharacter(character, layout);
  if (!Number.isInteger(mapping) || mapping < 0 || mapping === 0xffff) {
    throw new Error(`The active layout cannot type “${character}” with one key.`);
  }
  const modifiers = mapping >>> 8;
  if (modifiers & (CONTROL | ALT)) throw new Error(`“${character}” uses AltGr or another Ctrl/Alt combination on this layout.`);
  const vk = mapping & 0xff;
  if (!vk || (modifiers & ~SHIFT)) throw new Error(`“${character}” needs an unsupported keyboard combination.`);
  const explicit = keys.some((key) => key.vk === VK.shift || key.vk === 0xa0 || key.vk === 0xa1
    || (!key.extended && (key.scan === 0x2a || key.scan === 0x36)));
  const shift = modifiers & SHIFT && !explicit ? [{ name: 'shift', vk: VK.shift, extended: false }] : [];
  return [...keys.slice(0, index), ...shift, { name, vk, extended: EXTENDED.has(vk) }, ...keys.slice(index + 1)];
}

function mediaKey(name) {
  const vk = MEDIA[name];
  if (vk === undefined) {
    throw new Error(`Unknown media key: "${name}" (use ${Object.keys(MEDIA).join(', ')})`);
  }
  return { name, vk, extended: true };
}

module.exports = { VK, EXTENDED, MEDIA, parseCombo, layoutTokens, resolveCombo, mediaKey };
