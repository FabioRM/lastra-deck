// @ts-check
'use strict';

const { validateProfile } = require('./profile');

const FORMAT = 'lastra.editor.v1';
const MAX_BYTES = 128 * 1024;
const ITEM_NAMES = { key: 'a key', page: 'a page', group: 'a key group' };

function validateItem(kind, item) {
  const largestGrid = { cols: 12, rows: 6 };
  if (kind === 'key' && item) return validateProfile({ grid: largestGrid, keys: [item] }).keys[0];
  if (kind === 'page' && item) {
    const { pages: [page] } = validateProfile({
      grid: largestGrid,
      pages: [item],
    });
    return page;
  }
  if (kind === 'group' && item?.grid && Array.isArray(item.keys) && item.keys.some(Boolean)) {
    const { grid, keys } = validateProfile({ grid: item.grid, keys: item.keys });
    return { grid, keys };
  }
  throw new Error('Invalid Lastra clipboard content type');
}

function encodeEditorClipboard(kind, item) {
  const text = JSON.stringify({ format: FORMAT, kind, item: validateItem(kind, item) });
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('The content is too large for the clipboard');
  return text;
}

function decodeEditorClipboard(kind, text) {
  if (!Object.hasOwn(ITEM_NAMES, kind)) throw new Error('Invalid Lastra clipboard content type');
  const expected = ITEM_NAMES[kind];
  let data;
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('The content is too large for the clipboard');
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Copy ${expected} from the Lastra Editor before pasting`);
  }
  if (data?.format !== FORMAT || data.kind !== kind) {
    throw new Error(`Copy ${expected} from the Lastra Editor before pasting`);
  }
  return validateItem(kind, data.item);
}

module.exports = { encodeEditorClipboard, decodeEditorClipboard };
