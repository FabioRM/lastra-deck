// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createProfileKeys } = require('../shared/profile-keys');
const { catalog } = require('../shared/widget-layout');
const { SENSOR_READOUTS } = require('../shared/key-readouts');
const { embeddedImageDataUrl } = require('./icons');
const { validateProfile } = require('./profile');
const { writeAtomic } = require('./write-atomic');

const FORMAT = 'lastra.exchange';
const VERSION = 1;
const MAX_BYTES = 16 * 1024 * 1024;
const PROPERTIES = new Set(['password', 'passwd', 'secret', 'credential', 'credentials', 'authorization',
  'apikey', 'accesstoken', 'refreshtoken', 'clientsecret', 'privatekey', 'authtoken', 'bottoken', 'obscredentials']);
const AUTH_QUERY = /^(?:auth|token|signature|sig|oauth|bearer|xamzcredential|xamzsignature)$/;
const AUTH_LITERAL = /\b(?:passw(?:or)?d|client[_-]?secret|api[_-]?key|(?:access|refresh|auth)[_-]?token)\s*[:=]\s*["']?([^\s"'&]+)/ig;
const SAFE_VARIABLE_REFERENCE = /^(?:%[A-Z_][A-Z0-9_]*%|\$\{[A-Z_][A-Z0-9_]*\})$/i;
const SECRET_LITERAL = /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----|\bBearer\s+[\w./+\-=]{8,}|\b(?:gh[pousr]_|github_pat_|xox[baprs]-|sk-(?:proj-|live-|test-)?)[A-Za-z0-9_-]{14,}\b/i;
const PROFILE_REQUIRED = 'Choose a Lastra profile or page JSON file.';
const NO_CREDENTIALS = 'Remove credentials from the exchange data and configure them separately on the destination.';
const TOO_LARGE = 'Lastra exchange files must be at most 16 MB.';
const dependencyFor = Object.freeze({
  audio: 'Windows audio', media: 'Windows media sessions', 'spotify-playback': 'Spotify desktop',
  'obs-scene': 'OBS WebSocket',
});
const scopedProvider = Object.freeze({
  'speaker-muted': 'Windows audio', 'microphones-muted': 'Windows audio',
  'obs-connected': 'OBS WebSocket', 'obs-scene': 'OBS WebSocket', 'obs-recording': 'OBS WebSocket', 'obs-streaming': 'OBS WebSocket',
});

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const normalizeName = (value) => value.toLowerCase().replace(/[^a-z]/g, '');
const credential = (name) => PROPERTIES.has(normalizeName(name));

function secretIn(value) {
  if (value.startsWith('data:image/png;base64,')) return false;
  if (SECRET_LITERAL.test(value)) return true;
  for (const [, assignment] of value.matchAll(AUTH_LITERAL)) if (!SAFE_VARIABLE_REFERENCE.test(assignment)) return true;
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password) return true;
    for (const [name, value] of [...url.searchParams, ...new URLSearchParams(url.hash.slice(1))]) {
      if (value && (credential(name) || AUTH_QUERY.test(normalizeName(name)))) return true;
    }
  } catch {
    // Non-URLs may be ordinary macro text.
  }
  return false;
}

function inspectTree(root, checkCredentials = true) {
  const open = [[root, 0]];
  let visited = 0;
  while (open.length) {
    const [value, depth] = open.pop();
    if (++visited > 500_000 || depth > 64) throw new Error('The exchange data is too complex.');
    if (checkCredentials && typeof value === 'string' && secretIn(value)) throw new Error(NO_CREDENTIALS);
    if (!value || typeof value !== 'object') continue;
    if (checkCredentials && typeof value.id === 'string' && credential(value.id)
        && (value.value !== undefined || value.default !== undefined)) {
      throw new Error(NO_CREDENTIALS);
    }
    if (checkCredentials && value.type === 'launch' && Array.isArray(value.args)) {
      for (let i = 0; i + 1 < value.args.length; i++) {
        const flag = value.args[i];
        const next = value.args[i + 1];
        if (typeof flag === 'string' && /^--?[a-z][a-z_-]*$/i.test(flag) && credential(flag)
            && typeof next === 'string' && !SAFE_VARIABLE_REFERENCE.test(next)) throw new Error(NO_CREDENTIALS);
      }
    }
    for (const [key, entry] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('The exchange data contains an unsupported field.');
      if (checkCredentials && credential(key) && entry !== null && entry !== '' && entry !== undefined) throw new Error(NO_CREDENTIALS);
      open.push([entry, depth + 1]);
    }
  }
}

function cleanImages(profile) {
  let removed = 0;
  function surface(source) {
    const keys = source.keys.map((key) => {
      if (!key || key.image === undefined || embeddedImageDataUrl(key.image)) return key;
      if (key.image) removed++;
      const { image, ...rest } = key;
      return rest;
    });
    return { ...source, keys };
  }
  const { keys, ...record } = profile;
  const clean = { ...record, version: 2, pages: profile.pages.map(surface), bar: surface(profile.bar) };
  return { clean, removed };
}

function summarize(profile) {
  const actions = {};
  const programs = new Set();
  const applications = new Set();
  const links = new Set();
  const workspaces = new Set();
  const obsScenes = new Set();
  const providers = new Set();
  const resolver = createProfileKeys(profile);
  let keys = 0;
  let widgets = 0;
  function action(item) {
    if (!item) return;
    actions[item.type] = (actions[item.type] ?? 0) + 1;
    if (dependencyFor[item.type]) providers.add(dependencyFor[item.type]);
    if (scopedProvider[item.condition]) providers.add(scopedProvider[item.condition]);
    if (item.condition === 'foreground') applications.add(item.expected);
    if (item.condition === 'obs-scene') obsScenes.add(item.expected);
    if (item.type === 'obs-scene') obsScenes.add(item.scene);
    // Network locations are shown in full so a reviewer can tell \\host\share\tool.exe from a local tool.exe.
    const remote = (target) => /^(?:\\\\|\/\/)/.test(target);
    if (item.type === 'launch') programs.add(remote(item.target) ? item.target : path.win32.basename(item.target));
    if (item.type === 'open') {
      if (remote(item.target)) links.add(item.target);
      else if (path.win32.isAbsolute(item.target)) links.add(path.win32.basename(item.target));
      else {
        try {
          const target = new URL(item.target);
          // HTTPS links show their host; other schemes keep the scheme so http: or app handlers stand out.
          if (!target.hostname) links.add(target.protocol);
          else links.add(target.protocol === 'https:' ? target.hostname : `${target.protocol}//${target.hostname}`);
        } catch {
          links.add(path.win32.basename(item.target));
        }
      }
    }
    if (item.type === 'sound' && typeof item.file === 'string') links.add(path.win32.basename(item.file));
    if (item.type === 'workspace') workspaces.add(item.workspace);
    if (Array.isArray(item.targetApps)) for (const app of item.targetApps) applications.add(app);
    if (item.type === 'sequence' || item.type === 'repeat') item.steps.forEach(action);
    if (item.type === 'if') {
      action(item.then);
      action(item.else);
    }
    if (item.type === 'choose') item.choices.forEach((choice) => action(choice.action));
    if (item.type === 'random') item.pool.forEach(action);
  }
  for (const page of [...profile.pages, profile.bar]) {
    for (const id of [...(page.apps ?? []), ...(page.appIds ?? [])]) applications.add(id);
    for (const widget of page.widgets) {
      widgets++;
      providers.add(catalog[widget.type].provider);
    }
    for (const placement of page.keys) {
      if (!placement) continue;
      keys++;
      const key = resolver.resolve(placement, page);
      if (key.readout === 'spotify-remaining') providers.add('Spotify desktop');
      if (key.readout && Object.hasOwn(SENSOR_READOUTS, key.readout)) providers.add('Lastra telemetry');
      if (['speakers', 'microphones'].includes(key.readout)) providers.add('Windows audio');
      for (const behavior of [key.action, key.hold, key.double]) {
        if (behavior) inspectTree(behavior);
        action(behavior);
      }
    }
  }
  return { keys, widgets, actions, linkedControls: profile.controlBindings?.length ?? 0, macros: profile.macros?.length ?? 0,
    dependencies: {
      applications: [...applications].sort(), programs: [...programs].sort(), links: [...links].sort(),
      workspaces: [...workspaces].sort(), obsScenes: [...obsScenes].sort(), providers: [...providers].sort(),
    } };
}

function normalized(kind, input) {
  inspectTree(input);
  let profile;
  if (kind === 'profile' && record(input) && (Array.isArray(input.pages) || Array.isArray(input.keys))) {
    profile = validateProfile(input);
  } else if (kind === 'page' && record(input) && record(input.grid)) {
    profile = validateProfile({ grid: input.grid, pages: [input] });
  } else {
    throw new Error(PROFILE_REQUIRED);
  }
  const { clean, removed } = cleanImages(profile);
  const item = kind === 'profile' ? clean : clean.pages[0];
  const name = item.name;
  return {
    bundle: { format: FORMAT, version: VERSION, kind, item },
    summary: { kind, name, pages: clean.pages.length, removedImages: removed, ...summarize(clean) },
  };
}

function prepareExchange(kind, draft, pageId) {
  if (kind !== 'page') return normalized(kind, draft);
  inspectTree(draft, false);
  const profile = validateProfile(draft);
  const page = profile.pages.find(({ id }) => id === pageId);
  if (!page) throw new Error('Choose a regular page to export.');
  const source = createProfileKeys(profile).materialize('page', { ...page, grid: page.grid ?? profile.grid }, page);
  const keys = source.keys.map((key) => {
    if (!key) return key;
    const { controlId, ...standalone } = key;
    return standalone;
  });
  return normalized('page', { ...source, keys });
}

function decodeBundle(root) {
  if (record(root) && root.format === undefined) return normalized('profile', root);
  if (root?.format !== FORMAT || root.version !== VERSION || !['page', 'profile'].includes(root.kind)) {
    throw new Error('Unsupported Lastra exchange format or version.');
  }
  if (Object.keys(root).some((key) => !['format', 'version', 'kind', 'item'].includes(key))) {
    throw new Error('Lastra exchange files contain one profile or page.');
  }
  return normalized(root.kind, root.item);
}

function decodeExchange(text) {
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error(TOO_LARGE);
  let root;
  try {
    root = JSON.parse(text.toString('utf8').replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('The selected file does not contain valid JSON.');
  }
  return decodeBundle(root);
}

function encodeExchange(bundle) {
  const { bundle: clean, summary } = decodeBundle(bundle);
  const text = JSON.stringify(clean, null, 2) + '\n';
  if (Buffer.byteLength(text) > MAX_BYTES) throw new Error(TOO_LARGE);
  return { text, summary };
}

function suggestedName({ kind, name }) {
  const stem = name.replace(/[^a-z\d_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 56) || 'lastra';
  return `${stem}-${kind}.lastra.json`;
}

function readExchangeFile(file) {
  if (!fs.statSync(file).isFile()) throw new Error(PROFILE_REQUIRED);
  const fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error(PROFILE_REQUIRED);
    if (stat.size > MAX_BYTES) throw new Error(TOO_LARGE);
    const bytes = Buffer.allocUnsafe(stat.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = fs.readSync(fd, bytes, length, bytes.length - length, length);
      if (!read) break;
      length += read;
    }
    if (length > stat.size) throw new Error('The file changed while opening it. Try again.');
    return decodeExchange(bytes.subarray(0, length));
  } finally {
    fs.closeSync(fd);
  }
}

function writeExchangeFile(file, text, profileFiles = []) {
  function fileInDirectory(value) {
    const absolute = path.resolve(value);
    const resolved = path.join(fs.realpathSync(path.dirname(absolute)), path.basename(absolute));
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }
  const destination = fileInDirectory(file);
  if (profileFiles.some((source) => fileInDirectory(source) === destination)) {
    throw new Error('Choose a separate exchange file. Use Save profile to update the profile you are editing.');
  }
  writeAtomic(file, text);
}

module.exports = { decodeExchange, encodeExchange, prepareExchange, suggestedName, readExchangeFile, writeExchangeFile };
