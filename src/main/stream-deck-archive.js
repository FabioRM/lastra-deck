// @ts-check
'use strict';

const fs = require('node:fs/promises');
const yauzl = require('yauzl');

const MAX_ARCHIVE = 32 * 1024 * 1024;
const MAX_UNCOMPRESSED = 128 * 1024 * 1024;
const MAX_ENTRIES = 2048;
const MAX_MANIFESTS = 64;
const MAX_MANIFEST = 512 * 1024;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const PROFILE_FOLDER = /\.sdprofile$/i;
const MANIFEST = /^(?:profiles\/[^/]+\/)*manifest\.json$/i;
const ZIP_FAILURE = 'The Stream Deck archive is invalid or uses an unsupported ZIP feature.';
const PATH_FAILURE = 'The Stream Deck archive contains an invalid or duplicate entry path.';
const ARCHIVE_LIMIT = 'Choose a Stream Deck profile archive up to 32 MB.';
const READ_LIMIT = 'The Stream Deck archive contains too many entries or too much unpacked data.';
const MANIFEST_LIMIT = 'The Stream Deck profile contains too many or oversized manifests.';
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;

class StreamDeckArchiveError extends Error {}
const fail = (message) => { throw new StreamDeckArchiveError(message); };
const validCount = (value) => Number.isSafeInteger(value) && value >= 0;

function validatePath(name) {
  const components = name.replace(/\/$/, '').split('/');
  if (name.length > 512 || components.length > 16 || components.some((part) => !part || part.length > 255
      || part === '.' || part === '..' || /[\p{Cc}\\:*?"<>|]/u.test(part) || /[ .]$/.test(part) || WINDOWS_DEVICE.test(part))) fail(PATH_FAILURE);
  return { components, path: components.map((part) => part.normalize('NFC').toLowerCase()).join('/') };
}

const crcTable = Array.from({ length: 256 }, (_, initial) => {
  let value = initial;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value;
});

function crc32(bytes) {
  let checksum = 0xffffffff;
  for (const byte of bytes) checksum = (checksum >>> 8) ^ crcTable[(checksum ^ byte) & 0xff];
  return (checksum ^ 0xffffffff) >>> 0;
}

function localMatches(local, entry) {
  if (!local.fileName.equals(entry.fileNameRaw) || local.generalPurposeBitFlag !== entry.generalPurposeBitFlag
      || local.compressionMethod !== entry.compressionMethod) return false;
  // Streaming ZIP writers put the CRC and lengths after the compressed bytes.
  if (entry.generalPurposeBitFlag & 8) return true;
  const matchesSize = (value, expected) => value === expected || value === 0xffffffff;
  return local.crc32 === entry.crc32 && matchesSize(local.compressedSize, entry.compressedSize)
    && matchesSize(local.uncompressedSize, entry.uncompressedSize);
}

async function inventory(zip) {
  if (!validCount(zip.entryCount) || zip.entryCount > MAX_ENTRIES) fail(READ_LIMIT);
  const entries = new Map();
  const ranges = [];
  let inflated = 0;
  for await (const entry of zip.eachEntry()) {
    const { components, path } = validatePath(entry.fileName);
    const directory = entry.fileName.endsWith('/');
    const unixType = entry.versionMadeBy >> 8 === 3 ? (entry.externalFileAttributes >>> 28) & 0xf : 0;
    if (entries.has(path)) fail(PATH_FAILURE);
    if (!validCount(entry.uncompressedSize) || !validCount(entry.compressedSize) || entry.compressedSize > MAX_ARCHIVE) fail(ZIP_FAILURE);
    inflated += entry.uncompressedSize;
    if (entries.size >= MAX_ENTRIES || inflated > MAX_UNCOMPRESSED) fail(READ_LIMIT);
    if ((entry.generalPurposeBitFlag & 1) || (unixType && unixType !== (directory ? 4 : 8))
        || (directory && entry.uncompressedSize !== 0)) fail(ZIP_FAILURE);
    const local = await zip.readLocalFileHeaderPromise(entry);
    if (!localMatches(local, entry)) fail(ZIP_FAILURE);
    ranges.push({ start: entry.relativeOffsetOfLocalHeader, end: local.fileDataStart + entry.compressedSize });
    entries.set(path, { entry, components, directory });
  }
  ranges.sort((a, b) => a.start - b.start);
  if (ranges.some(({ start }, index) => index > 0 && start < ranges[index - 1].end)) fail(ZIP_FAILURE);
  for (const path of entries.keys()) {
    const components = path.split('/');
    while (components.length > 1) {
      components.pop();
      if (entries.get(components.join('/'))?.directory === false) fail(PATH_FAILURE);
    }
  }
  return entries;
}

function streamDeckManifestPaths(entries) {
  const roots = [...entries].flatMap(([path, { directory, components }]) => {
    const top = components.findIndex((part) => PROFILE_FOLDER.test(part));
    return !directory && top >= 0 && top === components.length - 2 && components.at(-1).toLowerCase() === 'manifest.json'
      ? [path.slice(0, -'manifest.json'.length)] : [];
  });
  if (roots.length !== 1) fail('Choose a ZIP export containing one .sdProfile folder and its manifest.');
  const root = roots[0];
  const selected = [...entries].flatMap(([path, { entry, directory }]) => {
    if (directory || !path.startsWith(root)) return [];
    const relative = path.slice(root.length);
    return MANIFEST.test(relative) ? [{ relative, entry }] : [];
  });
  if (selected.length > MAX_MANIFESTS || selected.reduce((size, { entry }) => size + entry.uncompressedSize, 0) > MAX_MANIFEST_BYTES
      || selected.some(({ entry }) => entry.uncompressedSize > MAX_MANIFEST)) fail(MANIFEST_LIMIT);
  return { selected, ignoredEntries: [...entries.values()].filter(({ directory }) => !directory).length - selected.length };
}

async function readManifest(zip, entry) {
  if (![0, 8].includes(entry.compressionMethod)) fail(ZIP_FAILURE);
  const stream = await zip.openReadStreamPromise(entry);
  const chunks = [];
  let length = 0;
  for await (const chunk of stream) {
    length += chunk.length;
    if (length > MAX_MANIFEST || length > entry.uncompressedSize) fail(MANIFEST_LIMIT);
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks, length);
  if (length !== entry.uncompressedSize || crc32(bytes) !== entry.crc32) fail('A Stream Deck manifest failed its integrity check.');
  try {
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    fail('A Stream Deck manifest does not contain valid JSON.');
  }
}

async function decodeStreamDeckArchive(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_ARCHIVE) fail(ARCHIVE_LIMIT);
  try {
    const zip = await yauzl.fromBufferPromise(bytes, { validateEntrySizes: true, strictFileNames: true });
    try {
      const { selected, ignoredEntries } = streamDeckManifestPaths(await inventory(zip));
      const manifests = new Map();
      for (const { relative, entry } of selected) manifests.set(relative, await readManifest(zip, entry));
      return { manifests, ignoredEntries };
    } finally {
      zip.close();
    }
  } catch (error) {
    if (error instanceof StreamDeckArchiveError) throw error;
    fail(ZIP_FAILURE);
  }
}

async function readArchiveBytes(file) {
  if (!(await fs.stat(file)).isFile()) fail(ARCHIVE_LIMIT);
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_ARCHIVE) fail(ARCHIVE_LIMIT);
    const bytes = Buffer.allocUnsafe(stat.size + 1);
    let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await handle.read(bytes, size, bytes.length - size, size);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size !== stat.size) fail('The selected Stream Deck file changed while it was open. Try again.');
    return bytes.subarray(0, size);
  } finally {
    await handle.close();
  }
}

module.exports = { decodeStreamDeckArchive, readArchiveBytes, StreamDeckArchiveError, crc32 };
