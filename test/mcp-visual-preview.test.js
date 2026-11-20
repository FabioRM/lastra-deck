'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { AgentDrafts } = require('../src/main/mcp-drafts');
const { AgentAppViewDrafts } = require('../src/main/mcp-app-view-drafts');
const { AgentVisualPreview, buildVisualPreview, MAX_IMAGE_BASE64, previewImageContent, visualPreviewParams } = require('../src/main/mcp-visual-preview');
const { previewRequestAllowed } = require('../src/main/mcp-deck-render');

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const action = { type: 'delay', ms: 50 };
const sampleProfile = {
  version: 2, name: 'Private team name', grid: { cols: 6, rows: 3 },
  pages: [{ id: 'private-page', name: 'Private project name', keys: [
    { id: 'internal', label: 'Preview key label', image: pixel, action },
    { id: 'local', label: 'Linked file', image: 'C:\\Private\\image.png', action },
    { id: 'remote', label: 'Linked URL', image: 'https://private.invalid/image.png', action },
  ], widgets: [{ id: 'private-widget', type: 'composition', stackId: 'private-stack', tabLabel: 'Private tab',
    layout: { column: 0, row: 1, cols: 2, rows: 1 }, settings: {
    composition: { name: 'Private composition', grid: { cols: 1, rows: 1 }, parts: [
      { id: 'private-note', type: 'text', text: 'Private note text', layout: { column: 0, row: 0, cols: 1, rows: 1 } },
    ] },
  } }, { id: 'private-widget-two', type: 'now-playing', stackId: 'private-stack', layout: { column: 0, row: 1, cols: 2, rows: 1 } }] }],
  bar: { keys: [{ id: 'private-bar', label: 'Pinned key', icon: 'pin', action }], widgets: [
    { id: 'private-choices', type: 'decision', settings: { options: ['Private choice A', 'Private choice B'] } },
  ] },
};

function draftFixture(baseToken) {
  const drafts = new AgentDrafts();
  const { id, revision } = drafts.create('owner', 'activity', sampleProfile, baseToken);
  return { drafts, input: { draft: id, revision }, draft: drafts.resolve('owner', 'activity', id, revision) };
}

const captured = { inspection: { tiles: [], checks: {} }, image: { mimeType: 'image/jpeg', width: 1280, height: 360 }, imageData: 'YWJj' };

test('visual draft preview uses the deck projection and embedded PNGs only', () => {
  const { draft, input } = draftFixture();
  for (const portrait of [true, false]) {
    const plan = buildVisualPreview(draft, visualPreviewParams({ ...input, portrait, theme: 'light', textScale: 125, highContrast: true }));
    assert.deepEqual([plan.width, plan.height], portrait ? [720, 2560] : [2560, 720]);
    assert.deepEqual(plan.assets, [pixel]);
    assert.equal(plan.view.slots[0].image, pixel);
    assert.equal(plan.view.slots[1].image, null);
    assert.equal(plan.view.slots[2].image, null);
    assert.match(plan.view.bar.keys[0].icon, /^<svg/);
    assert.equal(plan.view.editorActive, true);
    assert.equal(plan.view.editorLayout, false);
    assert.ok(plan.layout.sheets[0].keys.some(({ id }) => id === 'internal'));
    assert.equal(plan.layout.bar.keys[0].id, 'bar:private-bar');
    assert.deepEqual(plan.view.bar.widgets[0].settings.options, ['Private choice A', 'Private choice B']);
    assert.equal(plan.appearance.textScale, 125);
  }
  assert.throws(() => buildVisualPreview(draft, visualPreviewParams({ ...input, sheet: 100 })), /sheet is unavailable/);
  assert.throws(() => buildVisualPreview(draft, visualPreviewParams({ ...input, page: 'other' })), /page is unavailable/);
  for (const extra of [{ live: true }, { path: 'C:\\Private\\demo.png' }, { textScale: 133 }, { sheet: 0.5 }, { view: 'unknown' },
    { liveReadings: ['audio', 'audio'] }, { liveReadings: ['obs'] }, { liveReadings: 'audio' }]) {
    assert.throws(() => visualPreviewParams({ ...input, ...extra }), /Choose/);
  }
});

test('custom app-view previews use draft widgets and command names with no registered action payloads', async () => {
  const drafts = new AgentDrafts();
  const { id: draft, revision } = new AgentAppViewDrafts(drafts).create('owner', 'activity', {
    id: 'photo-tools', name: 'Photo tools', match: { executable: 'private-app.exe' }, url: 'https://private.invalid/app',
    shortcuts: [{ id: 'save', label: 'Save the document', keys: 'Ctrl+S' }],
    widgets: [{ id: 'media', type: 'now-playing', layout: { column: 0, row: 0, cols: 2, rows: 1 } }],
  });
  const input = { draft, revision, view: 'apps' };
  const preview = new AgentVisualPreview({ drafts, render: async (plan) => {
    assert.equal(plan.view.deckView, 'apps');
    assert.equal(plan.view.appView.name, 'Photo tools');
    assert.deepEqual(plan.view.appView.commands.map(({ id, label }) => [id, label]), [['open', 'Open app'], ['save', 'Save the document']]);
    assert.equal(plan.view.appView.widgets[0].id, 'media');
    assert.deepEqual(plan.view.bar, { keys: [], widgets: [] });
    assert.doesNotMatch(JSON.stringify(plan), /private\.invalid|private-app\.exe|Ctrl\+S/);
    return captured;
  } });
  for (const portrait of [true, false]) {
    const result = await preview.preview('owner', 'activity', { ...input, portrait });
    assert.equal(result.view, 'apps');
    assert.equal(result.page, 'photo-tools');
    assert.deepEqual(result.grid, { cols: 4, rows: 4 });
    assert.deepEqual(result.viewport, portrait ? { width: 720, height: 2560 } : { width: 2560, height: 720 });
  }
  await assert.rejects(preview.preview('somebody-else', 'activity', input), /draft is unavailable/);
  await assert.rejects(preview.preview('owner', 'activity', { ...input, view: 'keys' }), /draft is unavailable/);
  assert.throws(() => visualPreviewParams({ ...input, page: 'home' }), /without a page/);
});

test('Dashboard and Stats preview the same draft bar without exposing hidden page content', async () => {
  const { drafts, draft, input } = draftFixture('saved-revision');
  const service = new AgentVisualPreview({ drafts, render: async (plan) => {
    assert.ok(['dashboard', 'stats'].includes(plan.panel));
    assert.equal(plan.view.deckView, plan.panel);
    assert.equal(plan.view.locale, 'en-GB');
    assert.ok(plan.view.slots.every((item) => item === null));
    assert.deepEqual(plan.view.widgets, []);
    assert.deepEqual(plan.view.editingKeys, []);
    assert.deepEqual(plan.assets, []);
    assert.equal(plan.view.bar.keys[0].id, 'bar:key-1');
    const owned = JSON.stringify(plan.view);
    assert.equal(owned.includes('Private'), false);
    assert.equal(owned.includes('Preview key label'), false);
    return captured;
  } });
  for (const view of ['dashboard', 'stats']) {
    const result = await service.preview('owner', 'activity', { ...input, view, portrait: true });
    assert.equal(result.view, view);
    assert.equal(result.readings, 'fixture');
    assert.equal(result.orientation, 'portrait');
    assert.equal(result.sheets, 1);
    assert.equal(result.redacted, true);
    for (const extra of [{ sheet: 1 }, { compareCurrent: true }]) {
      assert.throws(() => visualPreviewParams({ ...input, view, ...extra }), /Choose Deck Keys/);
    }
  }
  assert.equal(buildVisualPreview(draft, visualPreviewParams(input)).panel, null);
});

test('active forks mask authored text and identifiers before they enter the renderer', () => {
  const { draft, input } = draftFixture('revision-token');
  const plan = buildVisualPreview(draft, visualPreviewParams(input));
  const content = JSON.stringify(plan);
  assert.equal(plan.redacted, true);
  assert.deepEqual(plan.assets, []);
  assert.equal(plan.view.slots[0].image, undefined);
  assert.equal(plan.view.bar.keys[0].id, 'bar:key-1');
  assert.deepEqual(plan.view.bar.widgets[0].settings, {});
  assert.equal(plan.view.page, 'page-1');
  assert.equal(plan.view.widgets[0].tabLabel, 'Tab 1');
  assert.equal(plan.view.widgets[1].stackId, 'stack-1');
  assert.equal(plan.view.widgets[0].settings.composition.parts[0].text, 'Sample text');
  for (const original of ['Private', 'private-', 'Preview key label', 'Pinned key', 'revision-token', pixel]) {
    assert.equal(content.includes(original), false, original);
  }
});

test('preview partition allows only exact shell, bundled deck assets and approved image bytes', () => {
  const root = path.resolve(__dirname, '..');
  const shell = 'file:///lastra/src/agent-preview/index.html';
  const allows = (url) => previewRequestAllowed(url, root, shell, new Set([pixel]));
  assert.equal(allows(shell), true);
  assert.equal(allows(pixel), true);
  assert.equal(allows('lastra-preview://deck/src/shared/snippets.js'), true);
  assert.equal(allows('lastra-preview://deck/src/shared/dom.js'), true);
  assert.equal(allows('lastra-preview://deck/src/shared/sensor-binding.js'), true);
  assert.equal(allows('lastra-preview://deck/src/renderer/index.html?editor-preview=1'), true);
  assert.equal(allows('lastra-preview://deck/src/renderer/index.html?editor-preview=1&panel-preview=stats'), true);
  for (const url of ['file:///lastra/src/main/profile.js', 'https://deck/src/renderer/index.html',
    'lastra-preview://elsewhere/src/renderer/index.html', 'lastra-preview://deck/src/shared/secret.js',
    'data:image/png;base64,AAAA', 'data:image/svg+xml,<svg/>', 'blob:lastra-preview://deck/a', `${shell}?elsewhere=1`]) {
    assert.equal(allows(url), false, url);
  }
});

test('preview access and exact revision are checked again before returning image bytes', async () => {
  const { drafts, input } = draftFixture();
  let done;
  let allowed = true;
  const service = new AgentVisualPreview({ drafts, render: () => new Promise((resolve) => { done = () => resolve(captured); }) });
  await assert.rejects(service.preview('other', 'activity', input), /draft is unavailable/);
  await assert.rejects(service.preview('owner', 'other', input), /draft is unavailable/);
  await assert.rejects(service.preview('owner', 'activity', input, () => false), /access expired/);
  const revoked = service.preview('owner', 'activity', input, () => allowed);
  await assert.rejects(service.preview('owner', 'activity', input), /already rendering/);
  allowed = false;
  done();
  await assert.rejects(revoked, /access expired/);

  const stale = service.preview('owner', 'activity', input);
  drafts.edit('owner', 'activity', input.draft, 1, [{ op: 'page-settings', page: 'private-page', settings: { name: 'Updated' } }]);
  done();
  await assert.rejects(stale, /draft changed/);

  const current = service.preview('owner', 'activity', { ...input, revision: 2 });
  done();
  const { summary, image } = previewImageContent(await current);
  assert.equal(summary.revision, 2);
  assert.equal(summary.readings, 'fixture');
  assert.equal(Object.hasOwn(summary, 'view'), false);
  assert.equal(Object.hasOwn(summary, 'imageData'), false);
  assert.deepEqual(image, { type: 'image', mimeType: 'image/jpeg', data: 'YWJj' });
});

test('selected live sources require their grants before sampling and after capture', async () => {
  const { drafts, input } = draftFixture();
  const options = { ...input, view: 'stats', liveReadings: ['telemetry', 'audio'] };
  const grants = new Set(['telemetry']);
  const hasScope = (scope) => grants.has(scope);
  let reads = 0;
  let finish;
  const sample = { sensors: { cpu: 0.78 }, stats: [], audio: { output: null, microphone: null, inputs: [] } };
  const preview = new AgentVisualPreview({ drafts, readLive(sources, view) {
    assert.deepEqual(sources, options.liveReadings);
    assert.equal(view, 'stats');
    reads++;
    return sample;
  }, render: (plan) => {
    assert.equal(plan.readings, sample);
    return new Promise((resolve) => { finish = () => resolve(captured); });
  } });
  const render = () => preview.preview('owner', 'activity', options, () => true, hasScope);
  await assert.rejects(render(), /requires the read grant/);
  assert.equal(reads, 0);
  grants.add('audio');
  const revoked = render();
  grants.delete('telemetry');
  finish();
  await assert.rejects(revoked, /reading access expired/);
  grants.add('telemetry');
  const authorized = render();
  finish();
  const result = await authorized;
  assert.equal(result.readings, 'live');
  assert.deepEqual(result.liveReadings, options.liveReadings);
  assert.equal(Object.hasOwn(result, 'sensors'), false);
  assert.equal(reads, 2);
});

test('oversized screenshot and geometry cannot consume a local pipe frame', async () => {
  const { drafts, input } = draftFixture();
  for (const response of [
    { ...captured, imageData: 'a'.repeat(MAX_IMAGE_BASE64 + 1) },
    { ...captured, inspection: { tiles: [{ id: 'a'.repeat(260 * 1024) }], checks: {} } },
  ]) {
    const preview = new AgentVisualPreview({ drafts, render: async () => response });
    await assert.rejects(preview.preview('owner', 'activity', input), /size limit/);
  }
});
