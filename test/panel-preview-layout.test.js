'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Pages } = require('../src/main/pages');
const { toView, validateProfile } = require('../src/main/profile');
const { describeLayoutView } = require('../src/main/mcp-layout');
const { copyVisiblePage, panelDraftView } = require('../src/main/panel-preview-layout');

test('copying an automatic page keeps the visible screen and its shortcut guards', () => {
  const profile = validateProfile({ pages: [{ id: 'home', keys: [] }] });
  const pages = new Pages();
  pages.observe({ executable: 'windowsterminal.exe', windowId: 10n });
  const page = pages.current(profile);
  const view = toView(profile, { page });
  const projection = describeLayoutView(view, page.id, true, true);
  const screen = 1;
  const { copy, sheet } = copyVisiblePage(page, view, { portrait: true, largeKeys: true, sheet: screen });
  assert.equal(sheet, 0);
  assert.deepEqual(copy.keys.map(({ id }) => id), projection.sheets[screen].keys.map(({ id }) => id));
  assert.ok(copy.keys.every(({ action }) => action.shortcutGuard?.pack === 'terminal'));
  assert.deepEqual(copy.apps, ['windowsterminal.exe']);
  const draft = validateProfile({ ...profile, pages: [{ ...copy, id: 'draft' }] });
  const preview = panelDraftView(draft, 'draft', sheet, {});
  assert.ok(preview.slots.filter(Boolean).every((key) => !Object.hasOwn(key, 'action')));
  assert.deepEqual(describeLayoutView(preview, 'draft', true, true).sheets[0].keys, projection.sheets[screen].keys);
});

test('a saved page opens in the draft on the existing screen', () => {
  assert.deepEqual(copyVisiblePage({ id: 'work' }, null, { sheet: 2 }), { pageId: 'work', sheet: 2 });
  assert.throws(() => panelDraftView({ pages: [{ id: 'work', keys: [] }] }, 'missing', 0, {}), /draft page/);
});
