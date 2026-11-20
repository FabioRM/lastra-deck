'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { toView } = require('../src/shared/deck-view');
const { previewAssetPath } = require('../src/main/preview-protocol');

test('the live preview projects draft visuals without action data', () => {
  const page = {
    keys: [{ id: 'template', label: 'Unsaved label', icon: 'pen',
      action: { type: 'text', text: 'Sample private text' }, hold: { type: 'launch', target: 'private.exe' } }],
  };
  const draft = { grid: { cols: 2, rows: 1 }, locale: 'en-GB', pages: [page] };
  const view = toView(draft, { icon: (name) => name });
  assert.equal(view.slots[0].label, 'Unsaved label');
  assert.equal(view.slots[0].icon, 'pen');
  assert.equal(view.slots[0].hasHold, true);
  assert.equal(view.slots[1], null);
  assert.doesNotMatch(JSON.stringify(view), /private|target|action/);
});

test('the preview only serves packaged deck assets from its own origin', () => {
  const root = path.resolve('lastra-app');
  const asset = (part) => previewAssetPath(`lastra-preview://deck/${part}`, root);
  assert.equal(asset('src/renderer/index.html?editor-preview=1'), path.join(root, 'src', 'renderer', 'index.html'));
  assert.equal(asset('src/renderer/fonts/barlow-condensed-latin-400-normal.woff2'),
    path.join(root, 'src', 'renderer', 'fonts', 'barlow-condensed-latin-400-normal.woff2'));
  assert.equal(asset('src/shared/widget-layout.js'), path.join(root, 'src', 'shared', 'widget-layout.js'));
  assert.equal(asset('src/shared/appearance.js'), path.join(root, 'src', 'shared', 'appearance.js'));
  assert.equal(asset('src/shared/editing-keys.js'), path.join(root, 'src', 'shared', 'editing-keys.js'));
  assert.equal(asset('src/shared/key-readouts.js'), path.join(root, 'src', 'shared', 'key-readouts.js'));
  assert.equal(asset('src/shared/linked-controls.js'), path.join(root, 'src', 'shared', 'linked-controls.js'));
  assert.equal(asset('src/main/main.js'), null);
  assert.equal(asset('src/preload/editor.js'), null);
  assert.equal(asset('src/renderer/fonts/license.txt'), null);
  assert.equal(asset('profiles/default.json'), null);
  assert.equal(previewAssetPath('https://deck/src/renderer/index.html', root), null);
  assert.equal(previewAssetPath('lastra-preview://elsewhere/src/renderer/index.html', root), null);
});
