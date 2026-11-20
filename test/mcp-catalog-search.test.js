'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { searchCatalog, inputSchema, outputSchema } = require('../src/main/mcp-catalog-search');
const { LIVE_OPERATIONS } = require('../src/main/mcp-catalog');
const { ACTION_TYPES, validateProfile } = require('../src/main/profile');
const { catalog: widgets, normalizeWidgetInstances } = require('../src/main/widgets');
const { iconExists } = require('../src/main/icons');
const { createSession } = require('../extensions/lastra-mcp/stdio');

const current = { platform: 'win32', osRelease: '10.0.26100' };
const find = (input, system = current) => searchCatalog(input, system).items;

test('offline action and widget results reuse the complete catalogs and supply valid parameter examples', () => {
  const actionItems = find({ kind: 'action', limit: 40 });
  assert.deepEqual(new Set(actionItems.map(({ id }) => id)), ACTION_TYPES);
  for (const { example, icon, settings } of actionItems) {
    assert.ok(iconExists(icon));
    assert.ok(settings.required.every((parameter) => Object.hasOwn(example, parameter)));
    const macros = example.type === 'macro' ? [{ id: example.macro, label: 'Example', action: { type: 'delay', ms: 100 } }] : undefined;
    assert.deepEqual(validateProfile({ macros, keys: [{ id: 'example', action: example }] }).keys[0].action, example);
  }
  const widgetItems = find({ kind: 'widget', limit: 40 });
  assert.deepEqual(widgetItems.map(({ id }) => id), Object.keys(widgets));
  for (const { example, icon } of widgetItems) {
    assert.ok(iconExists(icon));
    assert.deepEqual(normalizeWidgetInstances([example], { grid: { cols: 8, rows: 3 } }), [example]);
  }
  const recording = find({ kind: 'action', integration: 'OBS', tag: 'streaming', icon: 'video' });
  assert.deepEqual(recording.map(({ id }) => id), ['obs-scene']);
  assert.deepEqual(recording[0].settings.required, ['type', 'scene']);
  assert.equal(recording[0].settings.properties.bus.default, 'program');
  assert.equal(recording[0].compatibility.status, 'conditional');
  const fader = find({ kind: 'widget', query: 'speaker level', icon: 'sliders-horizontal' })[0];
  assert.equal(fader.id, 'audio-fader');
  assert.equal(fader.settings.properties.defaultLevel.maximum, 100);
  assert.equal(fader.example.settings.orientation, 'horizontal');
  assert.equal(find({ integration: 'OBS' }).some(({ id }) => id.startsWith('obsidian/')), false);
});

test('web and Windows shortcut searches preserve E16 spelling, binding context, and vendor provenance', () => {
  const tabs = find({ kind: 'shortcut', app: 'Google Chrome', query: 'Control + Page Up' });
  assert.ok(tabs.some(({ id, binding }) => id === 'chrome/previous-tab' && binding.chord === 'Ctrl+PageUp'));
  const address = find({ kind: 'shortcut', app: 'chrome', query: 'omnibox', platform: 'windows' });
  assert.equal(address.length, 1);
  assert.deepEqual(address[0].app, { id: 'chrome', name: 'Google Chrome' });
  const docs = find({ kind: 'shortcut', app: 'Google Docs', context: 'editor', query: 'find', platform: 'web' })[0];
  assert.equal(docs.binding.platform, 'web');
  assert.equal(docs.binding.hostPlatform, 'windows');
  assert.equal(docs.binding.edition, 'browser');
  assert.equal(docs.binding.mode, 'the Google Docs document editor');
  assert.equal(docs.binding.verification.status, 'documented');
  assert.equal(docs.compatibility.status, 'conditional');
  assert.match(docs.source.url, /^https:\/\/support\.google\.com\/docs\//);
  assert.equal(docs.source.sourceId, 'docs');
  assert.equal(docs.source.reuse, 'facts-only');
  assert.equal(docs.source.catalogVersion, searchCatalog({}, current).shortcutCatalogVersion);
  assert.deepEqual(find({ kind: 'shortcut', app: 'gdocs', query: 'find', platform: 'windows' }), []);
  assert.equal(docs.binding.language, null);
  assert.equal(docs.binding.layout, null);
});

test('reference-only and conditional variants retain the reason and report known host mismatches', () => {
  const excel = find({ kind: 'shortcut', app: 'Excel', query: 'select all', shortcutLanguage: 'en-US', platform: 'reference' })[0];
  assert.equal(excel.binding.verification.status, 'ambiguous');
  assert.match(excel.compatibility.reason, /current data region/);
  const teams = find({ kind: 'shortcut', app: 'Teams', query: 'end call', platform: 'windows', keyboardLayout: 'it' })[0];
  assert.equal(teams.binding.edition, 'work-or-school desktop');
  assert.equal(teams.binding.layout, 'US');
  assert.equal(teams.binding.requiresConfirmation, true);
  assert.equal(teams.compatibility.status, 'unavailable');
  assert.match(teams.compatibility.reason, /US keyboard layout/);
  assert.ok(teams.compatibility.requirements.some((reason) => /Teams call/.test(reason)));
  const oldWin = find({ kind: 'shortcut', app: 'Explorer', query: 'new tab' }, { platform: 'win32', osRelease: '10.0.19045' })[0];
  assert.equal(oldWin.compatibility.status, 'unavailable');
  assert.match(oldWin.compatibility.reason, /Windows 11/);
  const offHost = searchCatalog({ kind: 'action', query: 'select OBS scene' }, { platform: 'darwin', osRelease: '25.1.0' });
  assert.deepEqual(offHost.system, { platform: 'macos', windowsBuild: null, shortcutLanguage: null, keyboardLayout: null });
  assert.equal(offHost.items[0].compatibility.status, 'unavailable');
  assert.match(offHost.items[0].compatibility.reason, /requires Windows/);
});

test('catalog pages have stable unique IDs and reject cursors from other filters or page sizes', () => {
  const args = { kind: 'shortcut', limit: 40 };
  const first = searchCatalog(args, current);
  assert.equal(first.items.length, 40);
  assert.equal(first.nextCursor, searchCatalog(args, current).nextCursor);
  const results = [...first.items];
  let cursor = first.nextCursor;
  while (cursor) {
    const page = searchCatalog({ ...args, cursor }, current);
    assert.equal(page.total, first.total);
    assert.ok(page.items.length <= 40);
    results.push(...page.items);
    cursor = page.nextCursor;
  }
  assert.equal(results.length, first.total);
  assert.equal(results.length, new Set(results.map(({ id }) => id)).size);
  assert.throws(() => searchCatalog({ ...args, cursor: first.nextCursor, app: 'Google Docs' }, current), /Invalid cursor/);
  assert.throws(() => searchCatalog({ ...args, cursor: first.nextCursor, limit: 20 }, current), /Invalid cursor/);
  for (const invalid of [{ limit: 0 }, { limit: 41 }, { cursor: 'bad' }, { query: 'a'.repeat(161) },
    { shortcutLanguage: 'es-ES' }, { keyboardLayout: '0x0409' }, { execute: true }]) {
    assert.throws(() => searchCatalog(invalid, current), /Invalid/);
  }
  assert.deepEqual(find({ query: 'impossible fake search term xyzz' }), []);
});

test('catalog cursors survive interleaved searches and keep filtered result scopes', () => {
  const args = { kind: 'shortcut', app: 'IntelliJ IDEA', context: 'Editor', platform: 'reference', limit: 20 };
  const first = searchCatalog(args, current);
  const second = searchCatalog({ ...args, cursor: first.nextCursor }, current);
  assert.ok(first.total > 40);
  assert.ok(second.items.every(({ binding, compatibility }) => binding.contexts.includes('Editor') && compatibility.status === 'reference-only'));
  assert.ok(second.items.every(({ id }) => !first.items.some((entry) => entry.id === id)));
  // Move the first search out of the bounded cache before testing its next page again.
  for (const query of ['Chrome', 'Excel', 'Illustrator', 'Teams', 'Lightroom']) find({ kind: 'shortcut', app: query });
  assert.deepEqual(searchCatalog({ ...args, cursor: first.nextCursor }, current), second);
  assert.throws(() => searchCatalog({ ...args, cursor: first.nextCursor, icon: 'keyboard' }, current), /Invalid cursor/);
  assert.throws(() => searchCatalog({ ...args, cursor: first.nextCursor }, { ...current, osRelease: '10.0.19045' }), /Invalid cursor/);
});

test('stdio discovers and calls the offline search without a running agent connection', async () => {
  assert.equal(LIVE_OPERATIONS.search_catalog, undefined);
  for (const protocolVersion of ['2025-06-18', '2025-03-26', '2024-11-05']) {
    const responses = [];
    const send = (response) => responses.push(response);
    const session = createSession({ send, connect: () => assert.fail('Catalog search attempted an agent connection') });
    const receive = (method, params) => session.receive({ jsonrpc: '2.0', id: responses.length, method, params });
    await receive('initialize', { protocolVersion });
    let list = {};
    let published;
    do {
      await receive('tools/list', list);
      const { tools, nextCursor } = responses.at(-1).result;
      published ??= tools.find(({ name }) => name === 'search_catalog');
      list = nextCursor ? { cursor: nextCursor } : null;
    } while (list && !published);
    assert.deepEqual(published.inputSchema, inputSchema);
    assert.equal(published.annotations.readOnlyHint, true);
    assert.equal(published.annotations.openWorldHint, false);
    assert.deepEqual(published.outputSchema, protocolVersion === '2025-06-18' ? outputSchema : undefined);
    await receive('tools/call', { name: 'capabilities' });
    const discovery = JSON.parse(responses.at(-1).result.content[0].text).tools.find(({ name }) => name === 'search_catalog');
    assert.match(discovery.reason, /bundled offline catalogs/);
    assert.equal(discovery.permission, 'none');
    await receive('tools/call', { name: 'search_catalog', arguments: { limit: 40 } });
    const output = responses.at(-1).result;
    const data = JSON.parse(output.content[0].text);
    assert.equal(data.items.length, 40);
    assert.deepEqual(output.structuredContent, protocolVersion === '2025-06-18' ? data : undefined);
    assert.ok(Buffer.byteLength(JSON.stringify(responses.at(-1))) < 256 * 1024);
    await receive('tools/call', { name: 'search_catalog', arguments: { limit: 999 } });
    assert.equal(responses.at(-1).result.isError, true);
    session.close();
  }
});
