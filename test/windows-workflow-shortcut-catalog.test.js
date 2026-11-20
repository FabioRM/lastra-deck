'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { windowsWorkflowApplications } = require('../src/main/shortcut-catalog-windows-workflows');
const { intellijApplications } = require('../src/main/shortcut-catalog-intellij');
const { searchCatalog } = require('../src/main/mcp-catalog-search');
const { packFor, packKeys, previewPacks } = require('../src/main/shortcut-packs');

const [zoom, slack, visualStudio2022, visualStudio2026] = windowsWorkflowApplications;
const bindingFor = (app, notation) => app.bindings.find((binding) => binding.notation === notation);

test('reviewed communication shortcuts keep Zoom meeting guards and Slack desktop scope', () => {
  const zoomStarter = packKeys(packFor({ executable: 'Zoom.exe' }));
  assert.deepEqual(zoomStarter.slice(0, 3).map(({ action }) => action.keys), ['Alt+A', 'Alt+V', 'Alt+Y']);
  assert.ok(zoomStarter.slice(0, 3).every(({ unavailable }) => unavailable === 'Requires a Zoom meeting.'));
  assert.match(bindingFor(zoom, 'Alt+H').when, /desktop meeting window/);
  const slackStarter = packFor({ executable: 'slack.exe' });
  assert.deepEqual(slackStarter.keys.slice(0, 2).map((row) => row[3]), ['Ctrl+K', 'Ctrl+G']);
  assert.match(bindingFor(slack, 'Ctrl+T').requirement, /desktop-only/);
  assert.match(bindingFor(slack, 'Ctrl+F').when, /channel or direct message/);
});

test('Visual Studio editions and existing IntelliJ Windows actions stay distinct', () => {
  assert.equal(packFor({ executable: 'devenv.exe' })?.id, 'visual-studio');
  for (const [app, version] of [[visualStudio2022, '2022 (17.x)'], [visualStudio2026, '2026 (18.x)']]) {
    assert.equal(bindingFor(app, 'Ctrl+Q').command, 'Window.QuickLaunch');
    assert.equal(bindingFor(app, 'Ctrl+Shift+F').command, 'Edit.FindinFiles');
    assert.equal(bindingFor(app, 'Ctrl+Q').appVersion, version);
    assert.match(bindingFor(app, 'Ctrl+Shift+F').when, /General development settings/);
  }
  assert.match(bindingFor(visualStudio2022, 'Ctrl+T').requirement, /17\.6 and later/);
  assert.equal(bindingFor(visualStudio2026, 'Ctrl+Shift+P').command, undefined);
  const [idea] = intellijApplications;
  assert.equal(bindingFor(idea, 'Ctrl+Shift+N').command, 'GotoFile');
  assert.ok(idea.bindings.some(({ command, notation }) => command === 'RenameElement' && notation === 'Shift+F6'));
});

test('workflow references are indexed without exposing executable bindings', () => {
  const ids = new Set(windowsWorkflowApplications.map(({ id }) => id));
  const packs = previewPacks().filter(({ id }) => ids.has(id));
  assert.equal(packs.length, ids.size);
  assert.equal(packs.reduce((count, pack) => count + pack.keys.length, 0), 18);
  assert.ok(packs.every(({ referenceOnly, keys }) => referenceOnly && keys.every(({ action, overrideId }) => !action && !overrideId)));
  const { items: [match] } = searchCatalog({ kind: 'shortcut', app: visualStudio2022.id, query: 'Edit.FindinFiles' });
  assert.equal(match.binding.notation, 'Ctrl+Shift+F');
  assert.equal(match.binding.appVersion, '2022 (17.x)');
  assert.equal(match.compatibility.status, 'reference-only');
});
