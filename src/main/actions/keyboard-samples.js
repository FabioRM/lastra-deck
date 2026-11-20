// @ts-check
'use strict';

// Simulated VkKeyScanExW results from the Microsoft US, Italian, and Italian (142) layouts.
// The input adapter uses the active Windows layout for real delivery.
const layouts = {
  us: { id: 0x04090409, map: { '/': 0xbf, '`': 0xc0, '=': 0xbb, '+': 0x1bb, ';': 0xba, ':': 0x1ba, '?': 0x1bf } },
  it: { id: 0x04100410, map: { '/': 0x137, '=': 0x130, '+': 0xbb, ';': 0x1bc, ':': 0x1be, '?': 0x1db } },
  it142: { id: 0x00010410, map: { '/': 0x137, '`': 0x6bf, '=': 0x130, '+': 0xbb, ';': 0x1bc, ':': 0x1be, '?': 0x1db } },
};

function mapSampleCharacter(character, layout) {
  const mapped = layout?.map[character];
  if (Number.isInteger(mapped)) return mapped;
  if (layout && /^[a-z0-9]$/i.test(character)) {
    return character.toUpperCase().charCodeAt(0) + (/^[A-Z]$/.test(character) ? 0x100 : 0);
  }
  return -1;
}

module.exports = { layouts, mapSampleCharacter };
