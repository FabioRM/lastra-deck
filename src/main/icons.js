// @ts-check
'use strict';

// Use Lucide icons from lucide-static (ISC license) or embed a custom image as a data URL.

const fs = require('node:fs');
const path = require('node:path');
const { CROP_SIZE } = require('../shared/asset-crop');

const ICON_DIR = path.join(path.dirname(require.resolve('lucide-static/package.json')), 'icons');
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_PNG_BYTES = CROP_SIZE * CROP_SIZE * 4 + 2_048;
const PNG_PREFIX = 'data:image/png;base64,';
const PNG_START = Buffer.from('89504e470d0a1a0a', 'hex');
const PNG_END = Buffer.from('0000000049454e44ae426082', 'hex');
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif' };

const cache = new Map();

/** Strip SVG comments and root presentation attributes. CSS sets the size and styling. */
function lucideIcon(name) {
  if (!name || !/^[a-z0-9-]{1,60}$/.test(name)) return null;
  if (cache.has(name)) return cache.get(name);
  let svg = null;
  try {
    svg = fs.readFileSync(path.join(ICON_DIR, `${name}.svg`), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      // Keep the dimensions on child elements such as <rect>.
      .replace(/^<svg[^>]*>/, (tag) => tag.replace(/\s(width|height|class)="[^"]*"/g, ''));
  } catch {
    svg = null; // Show the key label if the icon is missing.
  }
  cache.set(name, svg);
  return svg;
}

function iconExists(name) {
  return lucideIcon(name) !== null;
}

function iconDataUrl(name) {
  const svg = lucideIcon(name);
  return svg ? 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') : null;
}

function shortcutPackIcons(packs) {
  const names = new Set(packs.flatMap(({ keys }) => keys.map(({ icon }) => icon)));
  return Object.fromEntries([...names].flatMap((name) => {
    const preview = iconDataUrl(name);
    return preview ? [[name, preview]] : [];
  }));
}

function embeddedImageDataUrl(value) {
  if (typeof value !== 'string' || !value.startsWith(PNG_PREFIX)
      || value.length > PNG_PREFIX.length + Math.ceil(MAX_PNG_BYTES / 3) * 4) return null;
  const encoded = value.slice(PNG_PREFIX.length);
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length < 45 || bytes.length > MAX_PNG_BYTES || bytes.toString('base64') !== encoded
      || !bytes.subarray(0, 8).equals(PNG_START) || !bytes.subarray(-12).equals(PNG_END)
      || bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 1 || width > CROP_SIZE || height < 1 || height > CROP_SIZE) return null;
  let hasPixels = false;
  for (let offset = 8; offset <= bytes.length - 12;) {
    const length = bytes.readUInt32BE(offset);
    const chunk = bytes.toString('ascii', offset + 4, offset + 8);
    offset += length + 12;
    if (offset > bytes.length) return null;
    if (chunk === 'IDAT' && length) hasPixels = true;
    if (chunk === 'IEND') return hasPixels && offset === bytes.length ? value : null;
  }
  return null;
}

// UNC, WebDAV and device paths: reading them would make Windows authenticate to a remote host
// and send the user's NTLM credentials, so key images must be local files or embedded PNGs.
const REMOTE_PATH = /^(?:\\\\|\/\/)/;
const IMAGE_CACHE_LIMIT = 64;
const imageCache = new Map();

/** Convert supported local images up to 2 MB to a data URL, reusing the encoding until the file changes. */
function imageDataUrl(file) {
  if (typeof file !== 'string') return null;
  if (file.startsWith('data:')) return embeddedImageDataUrl(file);
  if (REMOTE_PATH.test(file.trim())) return null;
  try {
    const mime = MIME[path.extname(file).toLowerCase()];
    if (!mime) return null;
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) return null;
    const cached = imageCache.get(file);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      imageCache.delete(file);
      imageCache.set(file, cached);
      return cached.url;
    }
    const url = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
    imageCache.delete(file);
    imageCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, url });
    if (imageCache.size > IMAGE_CACHE_LIMIT) imageCache.delete(imageCache.keys().next().value);
    return url;
  } catch {
    return null;
  }
}

module.exports = { lucideIcon, iconExists, iconDataUrl, shortcutPackIcons, embeddedImageDataUrl, imageDataUrl, ICON_DIR };
