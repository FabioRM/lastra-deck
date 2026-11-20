'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { DEFAULT_COMPOSITION, normalizeComposition, compositionIcons, compositionMetrics } = require('../src/shared/widget-composition');
const { validateProfile, ProfileStore, toView } = require('../src/main/profile');
const { iconExists } = require('../src/main/icons');
const { previewAssetPath } = require('../src/main/preview-protocol');
const { tempDir } = require('./helpers/temp-dir');

const original = () => ({
  ...structuredClone(DEFAULT_COMPOSITION),
  name: 'Studio card',
  grid: { cols: 2, rows: 2 },
  parts: [
    ...structuredClone(DEFAULT_COMPOSITION.parts),
    { id: 'icon', type: 'icon', icon: 'activity', layout: { column: 0, row: 1, cols: 1, rows: 1 } },
    { id: 'trend', type: 'graph', metric: 'gpuTemp', layout: { column: 1, row: 1, cols: 1, rows: 1 } },
  ],
});
const widget = (composition, column = 0) => ({
  id: 'card', type: 'composition', settings: { composition }, layout: { column, row: 0, cols: 2, rows: 2 },
});

test('a composition preserves parts, identifies dependencies and rejects invalid placement', () => {
  const raw = original();
  const composition = normalizeComposition(raw);
  assert.deepEqual(composition, raw);
  assert.deepEqual(compositionIcons(composition), ['activity']);
  assert.ok(compositionIcons(composition).every(iconExists));
  assert.deepEqual(compositionMetrics(composition), ['cpu', 'gpuTemp']);
  raw.parts[0].layout.cols = 2;
  assert.throws(() => normalizeComposition(raw), /overlaps/);
  raw.parts[0].layout.column = 2;
  assert.throws(() => normalizeComposition(raw), /extends past the grid/);
  assert.throws(() => normalizeComposition({ ...original(), parts: [{ ...original().parts[3], metric: 'secret' }] }), /supported sensor/);
});

test('compositions and presets persist separately while old profiles still load', (t) => {
  const directory = tempDir(t, 'lastra-composition-');
  const defaultFile = path.join(directory, 'default.json');
  const file = path.join(directory, 'active.json');
  const initial = { pages: [{ id: 'home', keys: [] }, { id: 'other', keys: [] }] };
  fs.writeFileSync(defaultFile, JSON.stringify(initial));
  const store = new ProfileStore({ file, defaultFile });
  const legacy = store.load();
  assert.equal(legacy.widgetPresets, undefined);
  const saved = original();
  const placed = { ...structuredClone(saved), name: 'Studio on Home' };
  store.save({ ...legacy, pages: [
    { ...legacy.pages[0], widgets: [widget(placed)] },
    { ...legacy.pages[1], widgets: [widget(saved, 3)] },
  ], widgetPresets: [{ id: 'studio-card', size: { cols: 2, rows: 2 }, composition: saved }] }, store.editorSnapshot().token);
  const reloaded = new ProfileStore({ file, defaultFile }).load();
  assert.deepEqual(reloaded.widgetPresets[0].composition, saved);
  assert.equal(reloaded.pages[0].widgets[0].settings.composition.name, 'Studio on Home');
  assert.equal(reloaded.pages[1].widgets[0].layout.column, 3);
});

test('the preview resolves only the composition icons used by the widget renderer', () => {
  const views = validateProfile({ pages: [{ id: 'home', keys: [], widgets: [widget(original())] }] });
  const view = toView(views, { icon: (name) => name + '.svg' });
  assert.deepEqual(view.widgets[0].icons, { activity: 'activity.svg' });
  assert.equal(views.pages[0].widgets[0].icons, undefined);
  const root = path.resolve(__dirname, '..');
  assert.equal(previewAssetPath('lastra-preview://deck/src/shared/widget-composition.js', root),
    path.join(root, 'src/shared/widget-composition.js'));
});
