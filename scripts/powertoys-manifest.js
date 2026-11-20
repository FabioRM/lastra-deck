// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isAlias, isMap, isScalar, isSeq, parseDocument, stringify } = require('yaml');
const { VK, parseCombo } = require('../src/main/actions/keys');
const { validateProfile } = require('../src/main/profile');

const RELEASE = Object.freeze({ tag: 'v0.102.3001', revision: 'a00b2bce7403f0a48efe5cbb6671074e01f27824', locale: 'en-US' });
const MAX_MANIFEST_BYTES = 128 * 1024;
const PACKAGE = /^\+?[a-z\d][a-z\d._-]{0,179}$/i;
const EXECUTABLE = /^[^<>:"/\\|?*;\p{Cc}]{1,124}\.exe$/iu;
const LOCALE = /^[a-z]{2,3}(?:-[a-z\d]{2,8})*$/i;
const MODIFIERS = { [VK.win]: 'Win', [VK.ctrl]: 'Ctrl', [VK.shift]: 'Shift', [VK.alt]: 'Alt' };
const MODIFIER_NAMES = ['Win', 'Ctrl', 'Shift', 'Alt'];
const SPECIAL = new Map([
  [VK.left, '<Left>'], [VK.right, '<Right>'], [VK.up, '<Up>'], [VK.down, '<Down>'], [VK.enter, '<Enter>'],
  [VK.space, '<Space>'], [VK.tab, '<Tab>'], [VK.backspace, '<Backspace>'], [VK.delete, '<Delete>'], [VK.insert, '<Insert>'],
  [VK.home, '<Home>'], [VK.end, '<End>'], [VK.printscreen, '<PrtScr>'], [VK.pause, '<Pause>'], [VK.pageup, '<PageUp>'],
  [VK.pagedown, '<PageDown>'], [VK.escape, '<Escape>'],
]);

function readBoundedFile(file, limit) {
  const fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw new Error('Choose a regular file within the size limit.');
    const buffer = Buffer.alloc(limit + 1);
    let read = 0;
    while (read < buffer.length) {
      const count = fs.readSync(fd, buffer, read, buffer.length - read, null);
      if (!count) return buffer.subarray(0, read);
      read += count;
    }
    throw new Error('The file exceeds the size limit.');
  } finally { fs.closeSync(fd); }
}

function decode(bytes) { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }

function assertSafeYaml(root) {
  let count = 0;
  function visit(node, depth = 0) {
    if (!node) return;
    if (++count > 25_000 || depth > 20) throw new Error('The shortcut manifest exceeds the structure limits.');
    if (isAlias(node) || node.anchor || node.tag) throw new Error('The shortcut manifest must use plain YAML without aliases, anchors or explicit tags.');
    if (isMap(node)) {
      for (const { key, value } of node.items) {
        if (!isScalar(key) || typeof key.value !== 'string' || key.value === '<<') throw new Error('Manifest mapping keys must be plain names.');
        visit(key, depth + 1);
        visit(value, depth + 1);
      }
    } else if (isSeq(node)) for (const item of node.items) visit(item, depth + 1);
  }
  visit(root);
}

function readYaml(bytes) {
  if (bytes.length > MAX_MANIFEST_BYTES) throw new Error('The shortcut manifest exceeds the size limit.');
  const document = parseDocument(decode(bytes), { schema: 'core', strict: true, merge: false, uniqueKeys: true, prettyErrors: false });
  if (document.errors.length || document.warnings.length || document.directives.yaml.version !== '1.2') {
    throw new Error('Choose one valid YAML 1.2 shortcut manifest with unique mapping keys.');
  }
  assertSafeYaml(document.contents);
  return document.toJS({ maxAliasCount: 0 });
}

function mapping(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a mapping.`);
  return value;
}

function members(value, max, label) {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label} must be a list with at most ${max} entries.`);
  return value;
}

function name(value, label, max = 180) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /\p{Cc}/u.test(value)) throw new Error(`${label} must be readable text.`);
  return value;
}

function flag(value, label) {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new Error(`${label} must be true or false.`);
  return value;
}

function manifestIdentity(packageName, process) {
  if (typeof packageName !== 'string' || !PACKAGE.test(packageName)) throw new Error('Enter a PowerToys package identifier.');
  if (typeof process !== 'string' || process.length > 2_048) throw new Error('Specify a valid WindowFilter.');
  if (process === '*') return ['*'];
  const filters = process.split(';').map((value) => value.trim());
  if (filters.length > 32 || filters.some((value) => !EXECUTABLE.test(value))) {
    throw new Error('WindowFilter must use exact executable filenames or *.');
  }
  return filters;
}

function fileLocale(filename) {
  const match = /\.([a-z]{2,3}(?:-[a-z\d]{2,8})*)\.(?:KBSC\.)?ya?ml$/i.exec(path.basename(filename ?? ''));
  return match ? canonicalLocale(match[1]) : undefined;
}

function canonicalLocale(locale) {
  if (typeof locale !== 'string' || !LOCALE.test(locale)) throw new Error('Enter a manifest locale such as en-US or it-IT.');
  try { return Intl.getCanonicalLocales(locale)[0]; }
  catch { throw new Error('Enter a valid manifest locale.'); }
}

function reviewRows(review, sha256) {
  if (review === undefined) return new Map();
  if (review?.manifestSha256 !== sha256) throw new Error('The chord review does not match this manifest SHA-256.');
  const rows = new Map();
  for (const row of members(review.rows, 1_500, 'Reviewed rows')) {
    if (!Number.isSafeInteger(row?.section) || row.section < 1 || !Number.isSafeInteger(row?.entry) || row.entry < 1
        || !['alternatives', 'ordered'].includes(row.semantics)) throw new Error('Choose one-based section and entry numbers and alternatives or ordered.');
    const id = `${row.section}/${row.entry}`;
    if (rows.has(id)) throw new Error('A chord review lists the same row twice.');
    rows.set(id, row.semantics);
  }
  return rows;
}

function describeKey(value) {
  if (value == null || value === '') return { kind: 'placeholder' };
  const label = typeof value === 'number' && Number.isInteger(value) ? String(value) : name(value, 'Shortcut key', 70);
  if (/^<\d>$/.test(label)) return { kind: 'digit', value: label[1] };
  // The release converter uses Int32.TryParse, including for a quoted decimal string.
  if (/^[+-]?\d+$/.test(label.trim())) {
    const code = Number(label);
    return Number.isInteger(code) && code > 0 && code < 255 ? { kind: 'virtual-key', code } : { kind: 'label', value: label };
  }
  if (/^[a-z]$/i.test(label) || /^F(?:[1-9]|1\d|2[0-4])$/i.test(label)) return { kind: 'key', value: label };
  return { kind: /^<[^<>]+>$/.test(label) ? 'special' : 'label', value: label };
}

/**
 * @param {Buffer} bytes
 * @param {{ filename?: string, review?: any }} [options]
 */
function inspectManifest(bytes, { filename, review } = {}) {
  const raw = mapping(readYaml(bytes), 'Manifest');
  const processFilters = manifestIdentity(raw.PackageName, raw.WindowFilter);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const reviewed = reviewRows(review, sha256);
  const warnings = [];
  const unsupported = (record, allowed, location) => {
    for (const field of Object.keys(record)) if (!allowed.includes(field)) warnings.push({ code: 'unrecognized-field', location, field });
  };
  unsupported(raw, ['PackageName', 'Name', 'WindowFilter', 'BackgroundProcess', 'Shortcuts'], 'Manifest');
  if (processFilters.length > 1) warnings.push({ code: 'release-executable-list' });
  if (raw.WindowFilter.includes('#')) warnings.push({ code: 'release-index-comment-character' });
  const locale = fileLocale(filename);
  if (!filename || path.basename(filename) !== `${raw.PackageName}.${RELEASE.locale}.yml`) warnings.push({ code: 'release-discovery', expected: `${raw.PackageName}.${RELEASE.locale}.yml` });
  const sections = members(raw.Shortcuts, 64, 'Shortcuts').map((value, sectionIndex) => {
    const section = mapping(value, 'Section');
    const sectionName = name(section.SectionName, 'SectionName');
    unsupported(section, ['SectionName', 'Properties'], `Section ${sectionIndex + 1}`);
    const entries = members(section.Properties ?? [], 300, 'Properties').map((value, entryIndex) => {
      const entry = mapping(value, 'Shortcut entry');
      const row = `${sectionIndex + 1}/${entryIndex + 1}`;
      unsupported(entry, ['Name', 'Description', 'Recommended', 'Shortcut'], row);
      if (entry.Description !== undefined && (typeof entry.Description !== 'string' || entry.Description.length > 1_500)) {
        throw new Error('Shortcut descriptions must be text up to 1500 characters.');
      }
      const chords = members(entry.Shortcut ?? [], 16, 'Shortcut').map((position, index) => {
        const chord = mapping(position, 'Chord');
        unsupported(chord, [...MODIFIER_NAMES, 'Keys'], `${row}/${index + 1}`);
        return { modifiers: MODIFIER_NAMES.filter((modifier) => flag(chord[modifier], modifier)),
          keys: members(chord.Keys ?? [], 8, 'Keys').map(describeKey) };
      });
      const interpretation = reviewed.get(row);
      if (interpretation && chords.length < 2) throw new Error(`Reviewed row ${row} does not contain multiple chords.`);
      reviewed.delete(row);
      if (entry.Name === '') warnings.push({ code: 'missing-display-name', location: row });
      return { row, name: entry.Name === '' ? '' : name(entry.Name, 'Shortcut name', 512), description: entry.Description,
        recommended: flag(entry.Recommended, 'Recommended'),
        semantics: interpretation ?? ['display-only', 'single'][chords.length] ?? 'unresolved', chords };
    });
    return { name: sectionName, special: /^<[^<>]+>$/.test(sectionName), entries };
  });
  if (reviewed.size) throw new Error('The chord review names a row missing from the manifest.');
  return { release: RELEASE, sha256, packageName: raw.PackageName, name: raw.Name === undefined ? undefined : name(raw.Name, 'Manifest Name'),
    locale, windowFilter: raw.WindowFilter, processFilters,
    backgroundProcess: flag(raw.BackgroundProcess, 'BackgroundProcess'), sections, warnings };
}

function exportChord(chord) {
  const output = { Win: false, Ctrl: false, Shift: false, Alt: false, Keys: [] };
  const seen = new Set();
  for (const { vk } of parseCombo(chord)) {
    if (!vk || vk === VK.rwin || (vk >= 0xa0 && vk <= 0xa5)) throw new Error('Layout-specific or side-specific key');
    if (seen.has(vk)) throw new Error('Duplicate key in a chord');
    seen.add(vk);
    const modifier = MODIFIERS[vk];
    if (modifier) {
      if (output.Keys.length) throw new Error('Modifier after a primary key');
      output[modifier] = true;
    } else if (vk >= 0x30 && vk <= 0x39) output.Keys.push(`<${vk - 0x30}>`);
    else if (vk >= 0x41 && vk <= 0x5a) output.Keys.push(String.fromCharCode(vk));
    else if (vk >= 0x70 && vk <= 0x87) output.Keys.push(`F${vk - 0x6f}`);
    else output.Keys.push(SPECIAL.get(vk) ?? vk);
  }
  if (!output.Keys.length) throw new Error('Modifier-only chord');
  return output;
}

function sameProcesses(left, right) {
  const normalized = (items) => [...new Set(items.map((item) => item.toLowerCase()))].sort();
  const expected = normalized(left);
  const requested = normalized(right);
  return expected.length === requested.length && expected.every((item, index) => item === requested[index]);
}

function actionChords(action, processFilters, backgroundProcess) {
  if (action?.onError && action.onError !== 'stop') throw new Error('A step failure policy or retry is present.');
  const steps = action?.type === 'sequence' ? action.steps : [action];
  if (steps.length > 16) throw new Error('Sequence exceeds the prototype chord limit.');
  return steps.map((step) => {
    if (step?.type !== 'hotkey') throw new Error('Only plain hotkeys and straight hotkey sequences are representable.');
    if (step.shortcutGuard || step.requiresPhotoshopWorkspace || typeof step.keys !== 'string') {
      throw new Error('A verified layout, mode, language, confirmation or expression is present.');
    }
    if (step.onError && step.onError !== 'stop') throw new Error('A step failure policy or retry is present.');
    if (step.targetApps?.length && (backgroundProcess || !sameProcesses(step.targetApps, processFilters))) {
      throw new Error('The action foreground requirement differs from the requested WindowFilter.');
    }
    try { return exportChord(step.keys); }
    catch { throw new Error('The chord has layout-specific, side-specific, repeated or unsupported keys or ordering.'); }
  });
}

/**
 * @param {any} profileSource
 * @param {{ page?: string, packageName?: string, windowFilter?: string, locale?: string, backgroundProcess?: boolean }} [options]
 */
function exportManifest(profileSource, { page: id, packageName, windowFilter, locale = RELEASE.locale, backgroundProcess = false } = {}) {
  const processFilters = manifestIdentity(packageName, windowFilter);
  flag(backgroundProcess, 'BackgroundProcess');
  if (windowFilter.includes('#')) throw new Error('The release index treats # as a comment in WindowFilter.');
  if (/^\+WindowsNT/i.test(packageName)) throw new Error('The +WindowsNT namespace is reserved for Windows manifests.');
  const targetLocale = canonicalLocale(locale);
  const filename = `${packageName}.${targetLocale}.yml`;
  const { pages } = validateProfile(profileSource);
  const page = pages.find((candidate) => candidate.id === id);
  if (!page) throw new Error('Choose a saved page ID from the supplied Lastra profile.');
  const warnings = [];
  if (page.appIds?.length) warnings.push('Package and web app identities cannot be expressed as executable matching.');
  if (page.windowTitle) warnings.push('Window, document or project title rules cannot be represented.');
  if (page.apps.length && (backgroundProcess || !sameProcesses(page.apps, processFilters))) {
    warnings.push('The page foreground executables do not match the requested process scope.');
  }
  const scopeBlocked = warnings.length > 0;
  if (targetLocale !== RELEASE.locale) warnings.push('This release looks up only en-US manifests.');
  if (processFilters.length > 1) warnings.push('This release accepts executable lists. The WinGet draft specifies a single executable or *.');
  const included = [];
  const omitted = [];
  if (!scopeBlocked) for (const key of page.keys.filter(Boolean)) {
    if (key.hold) omitted.push({ id: key.id, gesture: 'hold', reason: 'Long presses are Lastra gestures.' });
    if (key.double) omitted.push({ id: key.id, gesture: 'double', reason: 'Double taps are Lastra gestures.' });
    if (key.onBusy === 'queue-one') omitted.push({ id: key.id, behavior: 'queue-one', reason: 'Queued deck presses cannot be represented.' });
    try {
      if (key.confirm) throw new Error('The key has a Lastra confirmation requirement.');
      if (key.controlId) throw new Error('Linked control bindings and feedback cannot be represented.');
      const chords = actionChords(key.action, processFilters, backgroundProcess);
      included.push({ id: key.id, name: name(key.label, 'Key label'), semantics: chords.length === 1 ? 'single' : 'ordered', chords });
    } catch (error) { omitted.push({ id: key.id, gesture: 'tap', reason: error.message }); }
  }
  const manifest = included.length ? { PackageName: packageName, Name: name(page.name, 'Page name'), WindowFilter: windowFilter,
    BackgroundProcess: backgroundProcess, Shortcuts: [{ SectionName: page.name,
      Properties: included.map(({ name, chords }) => ({ Name: name, Shortcut: chords })) }] } : null;
  const yaml = manifest && stringify(manifest, { lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN' });
  return { release: RELEASE, filename, warnings, scopeBlocked, included, omitted, yaml };
}

module.exports = { RELEASE, MAX_MANIFEST_BYTES, exportManifest, inspectManifest, readBoundedFile, decode };
