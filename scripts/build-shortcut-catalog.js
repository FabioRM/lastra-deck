// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { parseCombo } = require('../src/main/actions/keys');
const review = require('./shortcut-catalog-review');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'profiles', 'shortcut-catalog.json');
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLATFORMS = new Set(['windows', 'web', 'macos', 'linux', 'chromeos', 'ipados']);
const STATUSES = ['documented', 'ambiguous', 'unknown'];
const FIELDS = ['edition', 'appVersion', 'windowsBuild', 'language', 'layout', 'mode'];
const ALIASES = new Map([['←', 'Left'], ['→', 'Right'], ['↑', 'Up'], ['↓', 'Down'], ['Page Up', 'PageUp'], ['Page Down', 'PageDown']]);

function assert(ok, message) {
  if (!ok) throw new Error(message);
}

function plainText(value, maximum = 160) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function slug(value) { return plainText(value, 64) && ID.test(value); }

function https(value) {
  if (!plainText(value, 2048)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port;
  } catch { return false; }
}

function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function unique(list, label) {
  assert(new Set(list).size === list.length, 'Duplicate ' + label);
}

function platformList(list) { return Array.isArray(list) && list.every((platform) => PLATFORMS.has(platform)); }

function validStrokes(strokes) {
  return Array.isArray(strokes) && strokes.length > 0 && strokes.length <= 8 && strokes.every((step) =>
    Array.isArray(step) && step.length > 0 && step.length <= 6 && step.every((key) => plainText(key, 32) && (key === '+' || !key.includes('+'))));
}

function parseStroke(stroke) {
  const spelling = stroke.map((token) => ALIASES.get(token) ?? token).join('+');
  let keys;
  try {
    keys = parseCombo(spelling).map(({ vk, scan, extended, character }) => vk ??
      (character === undefined ? `scan:${extended ? 'e0' : ''}${scan.toString(16)}` : `char:${character}`))
      .sort((left, right) => typeof left === 'number' && typeof right === 'number' ? left - right
        : String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0);
  } catch {
    return { spelling: null, keys: stroke.map((token) => token.toLowerCase()) };
  }
  assert(new Set(keys).size === keys.length, 'Duplicate key in one shortcut stroke');
  return { spelling, keys };
}

function singleChord(strokes) {
  if (!validStrokes(strokes) || strokes.length !== 1) return null;
  return parseStroke(strokes[0]).spelling;
}

function validateBinding(binding, app, sources) {
  const label = `${binding.app}:${binding.id}`;
  assert(slug(binding.id) && plainText(binding.label, 40), `Invalid action ID or label for ${label}`);
  const [owner, context, extra] = typeof binding.context === 'string' ? binding.context.split(':') : [];
  assert(owner === app.id && slug(context) && extra === undefined, `Invalid context ownership for ${label}`);
  assert(binding.platform === null || app.platforms.includes(binding.platform), `Platform outside the app inventory for ${label}`);
  assert(binding.hostPlatform === null || (PLATFORMS.has(binding.hostPlatform) && binding.hostPlatform !== 'web'),
    `Invalid host platform for ${label}`);
  assert(binding.platform === 'web' || binding.platform === null || binding.hostPlatform === binding.platform,
    `Platform and host platform disagree for ${label}`);
  for (const field of FIELDS) {
    const value = binding[field];
    const usable = field === 'windowsBuild' ? Number.isSafeInteger(value) && value > 0 : plainText(value, 80);
    assert(value === null || usable, `Invalid ${field} for ${label}`);
  }
  assert(binding.language === null || /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})+$/.test(binding.language), `Invalid language tag for ${label}`);
  assert(binding.windowsBuild === null || binding.hostPlatform === 'windows', `Windows build without a Windows host for ${label}`);
  const source = sources.get(binding.source);
  assert(source && source.owner === app.id, `Invalid source ownership for ${label}`);
  const { status, date, method } = binding.verification ?? {};
  assert(STATUSES.includes(status) && (date === null || isoDate(date)) && (method === null || method === 'vendor-documentation'),
    `Invalid verification status, method or date for ${label}`);
  assert(status === 'unknown' || (date && method), `Review date and method required for ${label}`);
  assert(binding.platform !== null || status === 'unknown', `Verified platform missing for ${label}`);
  assert(binding.unavailable === undefined || plainText(binding.unavailable, 240), `Invalid availability reason for ${label}`);
  assert(status === 'documented' || binding.unavailable, `Unavailable reason required for ${label}`);
  assert(validStrokes(binding.strokes) || (binding.strokes === null && status === 'unknown'), `Invalid shortcut steps for ${label}`);
  assert(binding.execution === undefined || (binding.execution === 'ordered-chords' && binding.strokes?.length > 1
    && binding.hostPlatform === 'windows' && status === 'documented' && !binding.unavailable), `Invalid ordered chord review for ${label}`);
  return { source, context, verification: { status, date, method } };
}

function buildCatalog(input = review) {
  assert(plainText(input?.version, 80) && https(input.attribution) && Array.isArray(input.apps) && Array.isArray(input.bindings),
    'Invalid shortcut catalog review input');
  assert(isoDate(input.reviewedOn), 'Invalid review date');
  const apps = new Map();
  const slugs = new Set();
  for (const app of input.apps) {
    assert(slug(app?.id) && slug(app.slug) && plainText(app.name, 80) && platformList(app.platforms) && app.platforms.length,
      'Invalid app inventory record');
    assert(!apps.has(app.id) && !slugs.has(app.slug), `Duplicate app inventory record ${app.id}`);
    unique(app.platforms, `app platforms for ${app.id}`);
    slugs.add(app.slug);
    apps.set(app.id, { id: app.id, name: app.name, slug: app.slug, platforms: [...app.platforms].sort(), bindings: [] });
  }
  assert(input.sources && typeof input.sources === 'object' && !Array.isArray(input.sources), 'Invalid review sources');
  const sources = new Map(Object.entries(input.sources));
  for (const [id, source] of sources) {
    assert(slug(id) && apps.has(source?.owner) && https(source.url) && https(source.terms)
      && (source.revision === undefined || source.revision === null || plainText(source.revision, 128)), `Invalid review source ${id}`);
  }

  const seenIds = new Set();
  const seenChords = new Map();
  for (const binding of input.bindings) {
    const app = apps.get(binding?.app);
    assert(app, `Unknown binding owner ${binding?.app}`);
    const { source, context, verification } = validateBinding(binding, app, sources);
    const properties = Object.fromEntries(FIELDS.map((field) => [field, binding[field]]));
    const strokes = binding.strokes?.map((stroke) => parseStroke(stroke)) ?? [];
    const scope = [binding.context, binding.platform, binding.hostPlatform, ...Object.values(properties)];
    const chordScope = JSON.stringify([...scope, strokes.map(({ keys }) => keys)]);
    const actionId = app.id + ':' + binding.id;
    const bindingId = createHash('sha256').update(JSON.stringify([actionId, chordScope])).digest('hex').slice(0, 20);
    assert(!seenIds.has(bindingId), `Duplicate binding for ${actionId} in ${binding.context}`);
    seenIds.add(bindingId);
    const prior = seenChords.get(chordScope);
    if (strokes.length && prior) {
      assert(prior.verification.status === 'ambiguous' && verification.status === 'ambiguous',
        `Conflicting chords require an ambiguity reason for ${prior.actionId} and ${actionId}`);
    }
    const chord = strokes.length === 1 ? strokes[0].spelling : null;
    const orderedChords = binding.execution === 'ordered-chords' ? strokes.map(({ spelling }) => spelling) : null;
    const unavailable = binding.unavailable ?? (orderedChords ? undefined : strokes.length > 1 ? 'This shortcut needs multiple steps. Review it before assigning.'
      : chord === null ? 'This shortcut has no supported single chord.' : undefined);
    const output = {
      id: binding.id, actionId, bindingId, label: binding.label, category: context, context: binding.context,
      platform: binding.platform, hostPlatform: binding.hostPlatform, platforms: binding.platform ? [binding.platform] : [],
      ...properties, source: source.url, sourceRevision: source.revision ?? null,
      provenance: { sourceId: binding.source, terms: source.terms, reuse: 'facts-only', label: 'lastra-authored' },
      verification, chord, notation: binding.strokes?.map((step) => step.join('+')).join(' then ') ?? 'Unknown binding',
      ...(orderedChords ? { orderedChords } : {}),
      ...(strokes.length !== 1 ? { strokes: binding.strokes } : {}), ...(unavailable ? { unavailable } : {}),
    };
    if (strokes.length) seenChords.set(chordScope, output);
    app.bindings.push(output);
  }
  const result = [...apps.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const bindings = result.flatMap((app) => app.bindings);
  const countBy = (names, read) => Object.fromEntries(names.map((name) => [name, bindings.filter((value) => read(value) === name).length]));
  return {
    schemaVersion: 2, version: input.version, attribution: input.attribution,
    reviewedOn: input.reviewedOn,
    coverage: {
      apps: result.length, appsWithBindings: result.filter((app) => app.bindings.length).length,
      actions: new Set(bindings.map(({ actionId }) => actionId)).size, bindingVariants: bindings.length,
      byPlatform: countBy([...PLATFORMS, 'unknown'], ({ platform }) => platform ?? 'unknown'),
      byStatus: countBy(STATUSES, ({ verification }) => verification.status),
    },
    apps: result,
  };
}

function serialize(input) { return JSON.stringify(buildCatalog(input), null, 2) + '\n'; }

if (require.main === module) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  assert(args.length === 0 || (args.length === 1 && check), 'Usage: node scripts/build-shortcut-catalog.js [--check]');
  const content = serialize();
  assert(content === serialize(), 'Shortcut catalog generation is not deterministic');
  if (check) assert(fs.readFileSync(FILE, 'utf8').replaceAll('\r\n', '\n') === content, 'Tracked shortcut catalog is out of date');
  else fs.writeFileSync(FILE, content);
  console.log(JSON.stringify(JSON.parse(content).coverage));
}

module.exports = { buildCatalog, singleChord, serialize };
