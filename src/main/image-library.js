// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { iconDataUrl, embeddedImageDataUrl, imageDataUrl, ICON_DIR } = require('./icons');
const { CROP_SIZE } = require('../shared/asset-crop');

const PAGE_SIZE = 36;
const APP_CACHE_MS = 30_000;
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'];
const LINK_GUID = Buffer.from('0114020000000000c000000000000046', 'hex');
let iconNames;
let driveType;

function defaultAppRoots(platform = process.platform, env = process.env) {
  if (platform !== 'win32') return [];
  return [[env.APPDATA, 'This user'], [env.ProgramData ?? env.PROGRAMDATA, 'All users']].filter(([folder]) => folder && localPath(folder))
    .map(([folder, scope]) => ({ directory: path.join(folder, 'Microsoft', 'Windows', 'Start Menu', 'Programs'), scope }));
}

function localPath(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || /^(?:[\\/]{2}|[a-z]+:\/\/)/i.test(file)) return false;
  if (process.platform !== 'win32') return true;
  const root = path.parse(file).root;
  if (!/^[a-z]:[\\/]$/i.test(root)) return false;
  try {
    driveType ??= require('koffi').load('kernel32.dll').func('uint32_t __stdcall GetDriveTypeW(str16)');
    return [2, 3, 5, 6].includes(driveType(root.replaceAll('/', '\\')));
  } catch { return false; }
}

function regularLocalPath(file, directory = false) {
  if (!localPath(file)) return false;
  const normalized = path.normalize(file);
  const root = path.parse(normalized).root;
  let current = root;
  try {
    for (const part of normalized.slice(root.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      if (fs.lstatSync(current).isSymbolicLink()) return false;
    }
    const stat = fs.lstatSync(normalized);
    return directory ? stat.isDirectory() : stat.isFile();
  } catch { return false; }
}

function startMenuEntries(roots) {
  const found = new Map();
  function visit(directory, scope, depth = 0) {
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory() && depth < 8) visit(file, scope, depth + 1);
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.lnk') continue;
      const label = entry.name.slice(0, -4);
      const id = createHash('sha256').update(file).digest('hex').slice(0, 24);
      found.set(id, { id, label, scope, file });
    }
  }
  for (const { directory, scope } of roots) if (regularLocalPath(directory, true)) visit(directory, scope);
  return found;
}

function pageOf(entries, query, index, label) {
  const terms = query.trim().toLowerCase().split(/[\s_-]+/).filter(Boolean);
  const results = entries.filter((entry) => terms.every((term) => label(entry).toLowerCase().includes(term)));
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const page = Math.min(index, pages - 1);
  return { page, pages, total: results.length, items: results.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) };
}

function linkString(info, offset, wide) {
  if (offset < info.readUInt32LE(4) || offset >= info.length) return null;
  const step = wide ? 2 : 1;
  for (let end = offset; end + step <= info.length; end += step) {
    if (wide ? info.readUInt16LE(end) === 0 : info[end] === 0) {
      return wide ? info.toString('utf16le', offset, end) : new TextDecoder('windows-1252').decode(info.subarray(offset, end));
    }
  }
  return null;
}

// Read LinkInfo directly. Loading or resolving the shortcut through the Shell can touch a remote target.
function localShortcutTarget(file) {
  if (fs.statSync(file).size > 1_048_576) return null;
  const bytes = fs.readFileSync(file);
  if (bytes.length < 76 || bytes.readUInt32LE(0) !== 76 || !bytes.subarray(4, 20).equals(LINK_GUID)) return null;
  const flags = bytes.readUInt32LE(20);
  if (!(flags & 0x02) || (flags & 0x20)) return null;
  let offset = 76;
  if (flags & 0x01) {
    if (bytes.length < 78) return null;
    offset += 2 + bytes.readUInt16LE(offset);
  }
  if (offset + 28 > bytes.length) return null;
  const info = bytes.subarray(offset, offset + bytes.readUInt32LE(offset));
  if (info.length < 28 || info.readUInt32LE(0) !== info.length || info.readUInt32LE(8) !== 1) return null;
  const header = info.readUInt32LE(4);
  if (header < 28 || header > info.length) return null;
  const unicode = header >= 36;
  const localOffset = unicode ? info.readUInt32LE(28) : 0;
  const suffixOffset = unicode ? info.readUInt32LE(32) : 0;
  const base = linkString(info, localOffset || info.readUInt32LE(16), Boolean(localOffset));
  const suffix = linkString(info, suffixOffset || info.readUInt32LE(24), Boolean(suffixOffset));
  if (!base || suffix === null || /^[\\/]|^[a-z]+:/i.test(suffix)) return null;
  return !suffix || base.toLowerCase().endsWith(suffix.toLowerCase()) ? base : path.join(base, suffix);
}

class ImageLibrary {
  constructor({ choose, getFileIcon, roots = defaultAppRoots(), now = Date.now }) {
    this.choose = choose;
    this.getFileIcon = getFileIcon;
    this.roots = roots;
    this.now = now;
  }

  search(mode, query, page) {
    if (typeof query !== 'string' || query.length > 120 || !Number.isSafeInteger(page) || page < 0
        || !['icons', 'apps'].includes(mode)) throw new Error('Invalid library search.');
    if (mode === 'icons') {
      iconNames ??= fs.readdirSync(ICON_DIR).filter((name) => name.endsWith('.svg')).map((name) => name.slice(0, -4)).sort();
      const results = pageOf(iconNames, query, page, (name) => name);
      return { ...results, items: results.items.map((name) => ({ id: name, label: name, preview: iconDataUrl(name) })) };
    }
    if (!this.apps || this.now() >= this.appExpiry) {
      this.apps = startMenuEntries(this.roots);
      this.appExpiry = this.now() + APP_CACHE_MS;
    }
    const apps = [...this.apps.values()].sort((a, b) => a.label.localeCompare(b.label) || a.scope.localeCompare(b.scope));
    const results = pageOf(apps, query, page, (entry) => entry.label);
    return { ...results, items: results.items.map(({ id, label, scope }) => ({ id, label, scope })) };
  }

  async executableIcon(file, label) {
    if (typeof file !== 'string' || path.extname(file).toLowerCase() !== '.exe' || !regularLocalPath(file)) {
      throw new Error('Choose a local application executable.');
    }
    let source;
    try {
      const item = await this.getFileIcon(file);
      source = item?.resize({ width: CROP_SIZE, height: CROP_SIZE }).toDataURL();
    } catch {}
    if (!embeddedImageDataUrl(source)) throw new Error('Windows could not read that application icon.');
    return { label, source };
  }

  async selectedApp(id) {
    const entry = typeof id === 'string' && this.apps?.get(id);
    if (!entry || !regularLocalPath(entry.file)) throw new Error('Choose an app from the installed list.');
    let target;
    try { target = localShortcutTarget(entry.file); }
    catch { throw new Error('Choose the application executable directly.'); }
    if (!target) throw new Error('Choose the application executable directly.');
    return this.executableIcon(target, entry.label);
  }

  async browse(mode) {
    if (mode !== 'app' && mode !== 'image') throw new Error('Invalid library file choice.');
    const filters = mode === 'app' ? [{ name: 'Windows applications', extensions: ['exe'] }]
      : [{ name: 'Images', extensions: IMAGE_EXTENSIONS }];
    const result = await this.choose({ title: mode === 'app' ? 'Choose an application executable' : 'Choose a key image',
      properties: ['openFile'], filters });
    if (result.canceled || result.filePaths?.length !== 1) return null;
    const [file] = result.filePaths;
    const label = path.basename(file);
    if (mode === 'app') return this.executableIcon(file, label);
    if (!IMAGE_EXTENSIONS.includes(path.extname(file).slice(1).toLowerCase())) throw new Error('Choose a supported image.');
    const source = imageDataUrl(file);
    if (!source) throw new Error('The image could not be read. Choose an image up to 2 MB.');
    return { label, source };
  }
}

module.exports = { ImageLibrary, startMenuEntries };
