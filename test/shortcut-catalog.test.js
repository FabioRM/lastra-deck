'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { buildCatalog, singleChord, serialize } = require('../scripts/build-shortcut-catalog');
const review = require('../scripts/shortcut-catalog-review');
const { catalog } = require('../src/main/shortcut-catalog');
const { packs, packFor, previewPacks } = require('../src/main/shortcut-packs');
const { chromiumWebAppId, normalizeWebApp } = require('../src/main/shortcut-packs-web');
const { iconExists, shortcutPackIcons } = require('../src/main/icons');
const { shortcutGuardForAction } = require('../src/shared/shortcut-library');
const { createActionRunner } = require('../src/main/actions');
const { US_LAYOUT } = require('../src/main/shortcut-guards');

test('the reviewed sources reproduce the tracked JSON and report coverage by binding platform and evidence', () => {
  const first = serialize(review);
  assert.equal(first, serialize(structuredClone(review)));
  assert.equal(first, readFileSync(path.join(__dirname, '../profiles/shortcut-catalog.json'), 'utf8').replaceAll('\r\n', '\n'));
  assert.deepEqual(catalog.coverage, {
    apps: 6, appsWithBindings: 6, actions: 49, bindingVariants: 62,
    byPlatform: { windows: 51, web: 11, macos: 0, linux: 0, chromeos: 0, ipados: 0, unknown: 0 },
    byStatus: { documented: 56, ambiguous: 5, unknown: 1 },
  });
  assert.equal(catalog.version, 'lastra-public-2026-11-19');
  const docs = catalog.apps.find(({ id }) => id === 'gdocs');
  assert.deepEqual(docs.platforms, ['web']);
  assert.ok(docs.bindings.every((binding) => binding.platform === 'web' && binding.hostPlatform === 'windows'));
  const find = docs.bindings.find(({ id }) => id === 'find');
  assert.equal(find.actionId, 'gdocs:find');
  assert.equal(find.sourceRevision, null);
  assert.equal(find.appVersion, null);
  assert.equal(find.layout, null);
  assert.equal(find.provenance.label, 'lastra-authored');
  assert.match(find.source, /^https:\/\/support\.google\.com\//);
  const vscode = catalog.apps.find(({ id }) => id === 'vscode');
  const steps = vscode.bindings.find(({ id }) => id === 'keyboard-shortcuts');
  assert.equal(steps.chord, null);
  assert.deepEqual(steps.strokes, [['Ctrl', 'K'], ['Ctrl', 'S']]);
  assert.deepEqual(steps.orderedChords, ['Ctrl+K', 'Ctrl+S']);
  assert.equal(steps.unavailable, undefined);
  assert.equal(singleChord([['Alt', '→']]), 'Alt+Right');
});

test('the generator rejects invalid ownership, malformed bindings and unexplained duplicates or conflicts', () => {
  const [base] = review.bindings;
  const build = (...bindings) => buildCatalog({ ...review, bindings });
  assert.throws(() => build({ ...base, context: 'gdocs:editor' }), /context ownership/);
  assert.throws(() => build({ ...base, source: 'docs' }), /source ownership/);
  assert.throws(() => build({ ...base, platform: 'web' }), /outside the app inventory/);
  assert.throws(() => build({ ...base, strokes: false }), /Invalid shortcut steps/);
  assert.throws(() => build({ ...base, execution: 'ordered-chords' }), /Invalid ordered chord review/);
  const sequence = build({ ...base, strokes: [['Ctrl', 'K'], ['Ctrl', 'S']] }).apps.find(({ id }) => id === 'chrome').bindings[0];
  assert.match(sequence.unavailable, /multiple steps/);
  assert.equal(sequence.orderedChords, undefined);
  assert.throws(() => build({ ...base, strokes: [['Ctrl', 'Control', 'T']] }), /Duplicate key/);
  assert.throws(() => build({ ...base, language: [] }), /Invalid language/);
  assert.throws(() => build({ ...base, verification: { ...base.verification, date: '2026-02-30' } }), /Invalid verification/);
  assert.throws(() => build(base, { ...base, strokes: [['t', 'Control']] }), /Duplicate binding/);
  assert.throws(() => build(base, { ...base, id: 'different-action' }), /Conflicting chords/);
  assert.throws(() => build({ ...base, verification: { status: 'unknown', date: null, method: null } }), /Unavailable reason/);
  const original = build(base).apps.find(({ id }) => id === 'chrome').bindings[0];
  const renamed = build({ ...base, label: 'Open a tab' }).apps.find(({ id }) => id === 'chrome').bindings[0];
  assert.equal(original.actionId, renamed.actionId);
  assert.equal(original.bindingId, renamed.bindingId);
});

test('reviewed ordered chords keep their pack and layout guard for both strokes', async () => {
  const key = previewPacks('en-US').find(({ id }) => id === 'vscode').keys.find(({ binding }) => binding?.id === 'keyboard-shortcuts');
  assert.equal(key.action.type, 'sequence');
  assert.deepEqual(key.action.steps.map(({ keys }) => keys), ['Ctrl+K', 'Ctrl+S']);
  assert.equal(shortcutGuardForAction(key.action).layout, US_LAYOUT);
  assert.equal(key.overrideId, undefined);
  let context = { executable: 'code.exe', id: 1, windowId: 1n, keyboardLayout: US_LAYOUT };
  const readForeground = Object.assign(() => context.executable, { context: () => context, windowId: () => context.windowId });
  let interrupt = false;
  const calls = [];
  const runner = createActionRunner({ readForeground, readShortcutSettings: () => ({ platform: 'win32' }),
    input: { sendChord(keys) {
      calls.push(String.fromCharCode(keys.at(-1).vk));
      if (interrupt) context = { ...context, id: 2, windowId: 2n };
    } } });
  assert.equal((await runner.run(key.action, [])).ok, true);
  assert.deepEqual(calls, ['K', 'S']);
  calls.length = 0;
  interrupt = true;
  const result = await runner.run(key.action, [], { trace: true });
  assert.equal(result.unavailable, true);
  assert.deepEqual(calls, ['K']);
  context = { ...context, keyboardLayout: 0x04100410 };
  assert.match((await runner.run(key.action, [])).message, /US keyboard layout/);
  assert.deepEqual(calls, ['K']);
});

test('conflicting Excel bindings and missing Teams evidence stay browsable with an explicit reason', () => {
  const previews = previewPacks('it-IT');
  const excel = previews.find(({ id }) => id === 'excel');
  const conflicts = excel.keys.filter((key) => key.binding?.verification.status === 'ambiguous' && key.binding.language === 'it-IT');
  assert.equal(conflicts.length, 4);
  assert.ok(conflicts.every(({ unavailable }) => /Italian Windows guide assigns/.test(unavailable)));
  const teams = previews.find(({ id }) => id === 'teams');
  const candidates = teams.keys.filter(({ binding }) => binding?.actionId === 'teams:mic');
  assert.ok(candidates.some(({ binding, unavailable }) => binding.platform === 'web' && /Teams web/.test(unavailable)));
  assert.ok(candidates.some(({ binding, unavailable }) => binding.verification.status === 'unknown' && /Personal edition/.test(unavailable)));
});

test('clean checkout packs expose catalog shortcuts without making unverified apps actionable', () => {
  const previews = previewPacks('en-US');
  const chrome = previews.find(({ id }) => id === 'chrome');
  assert.equal(catalog.apps.length, 6);
  assert.equal(chrome.keys[0].id, packs.find(({ id }) => id === 'chrome').keys[0][0]);
  assert.equal(chrome.keys.filter(({ action }) => action?.keys === 'Ctrl+T').length, 1);
  assert.deepEqual(chrome.keys.find(({ id }) => id === 'new-tab').contexts, ['chrome:tabs', 'chrome:browser-controls']);
  assert.ok(chrome.keys.find(({ action }) => action?.keys === 'Ctrl+Shift+W').confirm);
  assert.ok(chrome.keys.some(({ action }) => action?.keys === 'Ctrl+Tab'));
  for (const key of previews.flatMap(({ keys }) => keys)) assert.ok(iconExists(key.icon), key.id);
  assert.ok(previews.find(({ id }) => id === 'gdocs').keys.every((key) => key.unavailable));
});

test('the editor previews distinct action icons with a label-only fallback', () => {
  const photoshop = previewPacks().find(({ id }) => id === 'photoshop');
  const [copy, transform] = photoshop.keys;
  assert.equal(copy.icon, 'layers-2');
  assert.equal(transform.icon, 'scaling');
  const icons = shortcutPackIcons([photoshop, { keys: [{ icon: '../missing' }, copy] }]);
  assert.match(icons[copy.icon], /^data:image\/svg\+xml;base64,/);
  assert.notEqual(icons[copy.icon], icons[transform.icon]);
  assert.equal(icons['../missing'], undefined);
  const fit = photoshop.keys.find(({ id }) => id === 'fit-on-screen');
  const actual = photoshop.keys.find(({ id }) => id === 'actual-pixels');
  assert.notEqual(icons[fit.icon], icons[actual.icon]);
});

test('desktop catalog packs distinguish installed variants and require the appropriate editor context', () => {
  assert.equal(packFor({ executable: 'cursor.exe' })?.id, 'cursor');
  assert.equal(packFor({ executable: 'premiere pro.exe' }), null);
  assert.equal(packFor({ executable: 'adobe premiere pro.exe' })?.id, 'premiere');
  assert.equal(packFor({ executable: 'lightroom.exe', path: 'c:\\adobe\\lightroom\\lightroom.exe' }), null);
  assert.equal(packFor({ executable: 'lightroom.exe', path: 'c:\\adobe\\adobe lightroom classic\\lightroom.exe' })?.id, 'lightroom');
  const editorPacks = previewPacks();
  assert.deepEqual(editorPacks.find(({ id }) => id === 'lightroom').apps, []);
  const premiere = editorPacks.find(({ id }) => id === 'premiere');
  assert.match(premiere.keys[0].unavailable, /timeline/);
  assert.match(premiere.source, /^https:\/\/helpx\.adobe\.com\//);
});

test('installed Chromium web app packs use exact manifest identities and scope custom IDs to the selected app', () => {
  const id = chromiumWebAppId('https://www.youtube.com/?feature=ytca');
  assert.equal(id, 'agimnkijcaahngcdmfeangaknmldooml');
  const app = { executable: 'msedge.exe', appId: 'msedge._crx_' + id + '.profile2' };
  assert.equal(packFor(app)?.id, 'youtube');
  assert.equal(packFor({ ...app, executable: 'unrelated.exe' }), null);
  assert.equal(packFor({ ...app, appId: 'msedge', title: 'YouTube' })?.id, 'edge');
  assert.equal(packFor({ ...app, appId: 'msedge._crx_' + 'a'.repeat(32) }), null);
  const jira = normalizeWebApp({ pack: 'jira', manifestId: 'https://team.atlassian.net/jira/your-work#main' });
  assert.equal(jira.manifestId, 'https://team.atlassian.net/jira/your-work');
  assert.equal(packFor({ ...app, appId: 'msedge._crx_' + chromiumWebAppId(jira.manifestId) }, [jira])?.id, 'jira');
  for (const invalid of [
    { ...jira, manifestId: 'https://team.atlassian.net/wiki/' },
    { ...jira, manifestId: 'https://team.atlassian.net.example.com/jira/your-work' },
    { pack: 'gdocs', manifestId: 'https://docs.google.com/spreadsheets/' },
  ]) assert.throws(() => normalizeWebApp(invalid), /supported HTTPS/);
  const exposed = new Map(previewPacks().map((pack) => [pack.id, pack]));
  for (const { id } of catalog.apps) {
    const entry = exposed.get(id === 'windows-terminal' ? 'terminal' : id === 'outlook' ? 'outlook-classic' : id);
    assert.ok(entry && (entry.keys.length || entry.availability), id);
  }
});
