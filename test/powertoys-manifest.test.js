'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { RELEASE, MAX_MANIFEST_BYTES, exportManifest, inspectManifest, readBoundedFile } = require('../scripts/powertoys-manifest');
const { tempDir } = require('./helpers/temp-dir');

const input = (filename) => fs.readFileSync(path.join(__dirname, 'fixtures', 'powertoys', filename));
const classic = 'Example.Classic.en-US.yml';
const target = { page: 'home', packageName: 'Example.Classic', windowFilter: 'classic.exe' };
const hotkey = (keys, fields = {}) => ({ type: 'hotkey', keys, ...fields });
const key = (id, action, fields) => ({ id, label: id, action, ...fields });
const sequence = (...steps) => ({ type: 'sequence', steps });
const profile = (keys, fields) => ({ pages: [{ id: 'home', name: 'Fixture', apps: ['classic.exe'], keys, ...fields }] });

test('pinned model preserves section, alternate, and ordered chord preview with exact review binding', () => {
  assert.equal(RELEASE.tag, 'v0.102.3001');
  const manifest = input(classic);
  const preview = inspectManifest(manifest, { filename: classic });
  assert.deepEqual(preview.warnings, []);
  assert.equal(preview.name, 'Classic fixture');
  assert.deepEqual(preview.sections[0].entries.map(({ semantics }) => semantics), ['unresolved', 'unresolved']);
  const review = { manifestSha256: preview.sha256, rows: [
    { section: 1, entry: 1, semantics: 'alternatives' }, { section: 1, entry: 2, semantics: 'ordered' },
  ] };
  const rows = inspectManifest(manifest, { filename: classic, review }).sections[0].entries;
  assert.equal(rows[0].recommended, true);
  assert.equal(rows[0].semantics, 'alternatives');
  assert.equal(rows[1].semantics, 'ordered');
  assert.deepEqual(rows[0].chords[0], { modifiers: ['Alt'], keys: [{ kind: 'special', value: '<Left>' }] });
  assert.deepEqual(rows[1].chords.map(({ keys }) => keys[0].value), ['K', 'S']);
  assert.throws(() => inspectManifest(Buffer.concat([manifest, Buffer.from('\n')]), { filename: classic, review }), /SHA-256/);
  assert.throws(() => inspectManifest(manifest, { filename: classic, review: { ...review,
    rows: [{ section: 1, entry: 99, semantics: 'ordered' }],
  } }), /row missing/);
});

test('packaged, localized and background manifests preserve their IDs and report release differences', () => {
  const packaged = 'Example.Packaged.en-US.yml';
  const variant = inspectManifest(input(packaged), { filename: packaged });
  assert.equal(variant.packageName, 'Example.Packaged');
  assert.deepEqual(variant.processFilters, ['packaged.exe']);
  assert.deepEqual(variant.sections[0].entries.map(({ chords }) => chords[0].keys[0]), [
    { kind: 'digit', value: '9' }, { kind: 'virtual-key', code: 9 },
  ]);
  const localized = 'Example.Packaged.it-IT.yml';
  const translation = inspectManifest(input(localized), { filename: localized });
  assert.equal(translation.locale, 'it-IT');
  assert.equal(translation.sections[0].entries[0].name, 'Ultima scheda');
  assert.equal(translation.warnings[0].expected, 'Example.Packaged.en-US.yml');
  const specFilename = inspectManifest(input(packaged), { filename: 'Example.Packaged.en-US.KBSC.yaml' });
  assert.equal(specFilename.locale, 'en-US');
  assert.equal(specFilename.warnings[0].code, 'release-discovery');
  const background = 'Example.Background.en-US.yml';
  const process = inspectManifest(input(background), { filename: background });
  assert.equal(process.backgroundProcess, true);
  assert.deepEqual(process.processFilters, ['Background helper.exe', 'Background alternative.exe']);
  assert.equal(process.warnings[0].code, 'release-executable-list');
  assert.deepEqual(process.sections[0].entries[0].chords[0].modifiers, ['Win', 'Ctrl']);
});

test('bounded YAML import rejects aliases, tags, duplicate keys, extra documents and malformed values', () => {
  const text = input(classic).toString('utf8');
  const read = (value) => inspectManifest(Buffer.from(value), { filename: classic });
  for (const [invalid, message] of [
    [text.replace('Classic fixture', '&ref Classic fixture') + '\nUnknown: *ref\n', /without aliases/],
    [text.replace('Classic fixture', '!!str Classic fixture'), /explicit tags/],
    ['%YAML 1.1\n---\n' + text, /YAML 1.2/],
    [text + '\nPackageName: Other\n', /unique mapping keys/],
    [text + '\n---\nName: Other\n', /one valid YAML/],
    [text.replace('classic.exe', 'c:/other.exe'), /executable filenames/],
    [text.replace('Alt: true', 'Alt: "true"'), /true or false/],
    ['#'.repeat(MAX_MANIFEST_BYTES + 1), /size limit/],
  ]) assert.throws(() => read(invalid), message);
  const unrecognized = read(text.replace('Recommended: true', 'Recommended: true\n        AdditionalInfo: [{MinWindowsVersion: "10.0"}]'));
  assert.deepEqual(unrecognized.warnings, [{ code: 'unrecognized-field', location: '1/1', field: 'AdditionalInfo' }]);
});

test('export preserves simple and ordered chords while reporting gesture and provider losses', () => {
  const draft = profile([
    key('digit', hotkey('Ctrl+9'), { hold: hotkey('Ctrl+F2'), onBusy: 'queue-one' }),
    key('sequence', sequence(hotkey('Ctrl+K'), hotkey('Ctrl+S'))),
    key('provider', { type: 'open', target: 'https://private.invalid/fixture' }),
    key('layout', hotkey('Ctrl+char:=', { targetApps: ['classic.exe'] })),
    key('scope', hotkey('Ctrl+T', { targetApps: ['other.exe'] })),
    key('confirm', hotkey('Ctrl+X'), { confirm: true }),
  ]);
  const output = exportManifest(draft, target);
  assert.equal(output.scopeBlocked, false);
  assert.deepEqual(output.included.map(({ id, semantics }) => [id, semantics]), [['digit', 'single'], ['sequence', 'ordered']]);
  assert.deepEqual(output.omitted.map(({ id, gesture, behavior }) => [id, gesture ?? behavior]), [
    ['digit', 'hold'], ['digit', 'queue-one'], ['provider', 'tap'], ['layout', 'tap'], ['scope', 'tap'], ['confirm', 'tap'],
  ]);
  assert.doesNotMatch(output.yaml, /private|provider|layout|confirm|https:/);
  const manifest = inspectManifest(Buffer.from(output.yaml), { filename: output.filename });
  assert.deepEqual(manifest.warnings, []);
  assert.deepEqual(manifest.sections[0].entries.map(({ chords }) => chords.map(({ keys }) => keys[0].value)), [['9'], ['K', 'S']]);
  assert.equal(manifest.sections[0].entries[1].semantics, 'unresolved');
  assert.equal(exportManifest(draft, target).yaml, output.yaml);
  assert.equal(exportManifest(draft, { ...target, backgroundProcess: true }).scopeBlocked, true);
});

test('export preserves executable lists and reports application IDs and title rules as unavailable', () => {
  const allowed = exportManifest(profile([key('copy', hotkey('Ctrl+C'))], { apps: ['classic.exe', 'classic2.exe'] }), {
    ...target, windowFilter: 'classic2.exe;classic.exe', locale: 'it-IT',
  });
  assert.equal(allowed.included.length, 1);
  assert.match(allowed.warnings.join(' '), /only en-US.*executable lists/);
  const joined = exportManifest(profile([key('copy', hotkey('Ctrl+C'))], { apps: ['classic.exe;classic2.exe'] }), {
    ...target, windowFilter: 'classic.exe;classic2.exe',
  });
  assert.equal(joined.scopeBlocked, true);
  assert.equal(joined.yaml, null);
  const blocked = exportManifest(profile([key('copy', hotkey('Ctrl+C'))], {
    appIds: ['Example.Packaged_abcd!App'], windowTitle: { mode: 'contains', value: 'Fixture' },
  }), target);
  assert.equal(blocked.scopeBlocked, true);
  assert.equal(blocked.yaml, null);
  assert.match(blocked.warnings.join(' '), /app identities.*document/);
  assert.throws(() => exportManifest(profile([key('copy', hotkey('Ctrl+C'))]), { ...target, windowFilter: 'classic#.exe' }), /comment/);
});

test('CLI previews without writing and creates only an explicitly named new manifest', (t) => {
  const temp = tempDir(t, 'lastra-powertoys-cli-');
  const draft = path.join(temp, 'profile.json');
  const output = path.join(temp, classic);
  fs.writeFileSync(draft, JSON.stringify(profile([key('copy', hotkey('Ctrl+C'))])));
  const cli = path.join(__dirname, '..', 'scripts', 'powertoys-shortcuts.js');
  const call = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  const flags = ['export', draft, '--page', 'home', '--package', target.packageName, '--process', target.windowFilter];
  const preview = call(...flags);
  assert.equal(preview.status, 0, preview.stderr);
  assert.deepEqual(fs.readdirSync(temp), ['profile.json']);
  assert.equal(call(...flags, '--output', path.join(temp, 'index.yml')).status, 1);
  assert.equal(call(...flags, '--output', output).status, 0);
  assert.equal(fs.readFileSync(output, 'utf8'), JSON.parse(preview.stdout).yaml);
  const reviewed = call('inspect', output);
  assert.equal(reviewed.status, 0, reviewed.stderr);
  assert.equal(JSON.parse(reviewed.stdout).sections[0].entries[0].semantics, 'single');
  assert.equal(call(...flags, '--output', output).status, 1);
  assert.equal(fs.readFileSync(output, 'utf8'), JSON.parse(preview.stdout).yaml);
  assert.throws(() => readBoundedFile(output, 3), /size limit/);
});
