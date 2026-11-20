'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { profileTemplates } = require('../src/main/profile-templates');
const { validateProfile } = require('../src/main/profile');
const { prepareTemplatePages } = require('../src/shared/profile-template-import');
const { iconExists } = require('../src/main/icons');
const { parseCombo } = require('../src/main/actions/keys');

test('ships local, valid pages for the six workflows with scoped contextual actions', () => {
  const templates = profileTemplates('it-IT');
  assert.deepEqual(templates.map(({ id }) => id), ['work', 'vscode', 'meetings', 'streaming', 'editing', 'sim-racing']);
  for (const { profile, requirements } of templates) {
    assert.ok(requirements.length > 0);
    assert.equal(validateProfile(profile).pages.length, profile.pages.length);
    for (const page of profile.pages) {
      assert.ok(page.keys.length);
      for (const key of page.keys.filter(Boolean)) {
        assert.ok(iconExists(key.icon), key.icon);
        if (key.action.type === 'hotkey') {
          assert.ok(parseCombo(key.action.keys).length);
          if (page.apps.length) assert.ok(key.action.targetApps?.length || key.action.shortcutGuard, `${page.name} / ${key.id}`);
        }
      }
    }
  }
  const editing = templates.find(({ id }) => id === 'editing').profile;
  assert.equal(editing.pages.find(({ id }) => id === 'photoshop').keys[0].action.shortcutGuard.mode, 'the Photoshop workspace');
  const racing = templates.find(({ id }) => id === 'sim-racing').profile;
  assert.ok(racing.pages[0].keys.some(({ id }) => id === 'simhub'));
  assert.deepEqual(racing.pages[0].widgets.map(({ id }) => id), ['output', 'microphone', 'cpu', 'gpu']);
});

test('adding a template keeps the draft and uses fresh IDs and explicit grid dimensions', () => {
  const template = profileTemplates().find(({ id }) => id === 'work').profile;
  const draft = validateProfile({
    grid: { cols: 3, rows: 2 },
    pages: [
      { id: 'main', name: 'Work keys', keys: [] },
      { id: 'editor', name: 'Visual Studio Code', apps: ['Code.exe'], appIds: ['microsoft.visualstudiocode'], keys: [] },
      { id: 'folder', name: 'Specific folder', apps: ['chrome.exe'], windowTitle: { mode: 'contains', value: 'Reference' }, keys: [] },
    ],
  });
  const original = structuredClone(draft);
  let number = 0;
  const plan = prepareTemplatePages(draft, template, () => 'copy-' + ++number);
  assert.deepEqual(draft, original);
  assert.deepEqual(plan.pages.map(({ id, name }) => [id, name]),
    [['copy-1', 'Work keys · copy'], ['copy-2', 'Browser'], ['copy-3', 'Visual Studio Code · copy']]);
  assert.deepEqual(plan.collisions.map(({ value }) => value), ['code.exe', 'microsoft.visualstudiocode']);
  assert.ok(plan.pages[1].apps.includes('chrome.exe'));
  assert.deepEqual(plan.pages[2].grid, { cols: 8, rows: 3 });
  assert.equal(plan.pages[2].keys[0].action.shortcutGuard.pack, 'vscode');
  assert.equal(validateProfile({ ...draft, pages: [...draft.pages, ...plan.pages] }).pages.length, 6);
  plan.pages[0].keys[0].label = 'Modified';
  assert.equal(template.pages[0].keys[0].label, 'Terminal');
});

test('a colliding browser template retains the source shortcut targets when the copied page is manual', () => {
  const profile = profileTemplates().find(({ id }) => id === 'work').profile;
  const browser = profile.pages.find(({ id }) => id === 'browser');
  const draft = validateProfile({ pages: [{ id: 'existing', name: 'Existing', apps: browser.apps, keys: [] }] });
  const plan = prepareTemplatePages(draft, { grid: profile.grid, pages: [browser] }, () => 'manual-copy');
  assert.deepEqual(plan.pages[0].apps, []);
  assert.deepEqual(plan.pages[0].keys[0].action.targetApps, browser.apps);
});

test('a template that exceeds the profile capacity makes no changes', () => {
  const draft = validateProfile({ pages: Array.from({ length: 15 }, (_, index) => ({ id: 'page-' + index, keys: [] })) });
  const work = profileTemplates()[0].profile;
  assert.throws(() => prepareTemplatePages(draft, work), /Make room for 3 pages/);
  assert.equal(draft.pages.length, 15);
});
