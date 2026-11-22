'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createActionRunner } = require('../src/main/actions');
const { parseCombo } = require('../src/main/actions/keys');
const { fixedEditingKeys } = require('../src/main/fixed-editing-keys');
const { iconExists } = require('../src/main/icons');
const { searchCatalog } = require('../src/main/mcp-catalog-search');
const { Pages, runPageAction } = require('../src/main/pages');
const { toView, validateProfile } = require('../src/main/profile');
const { US_LAYOUT, validShortcutGuard } = require('../src/main/shortcut-guards');
const { packFor, packs, previewPacks } = require('../src/main/shortcut-packs');
const { chromiumWebAppId, webPacks } = require('../src/main/shortcut-packs-web');
const { shortcutTitleMode, usesShortcutWindowTitle } = require('../src/main/shortcut-surface');
const addedDesktop = [
  ...require('../src/main/shortcut-packs-office'),
  ...require('../src/main/shortcut-packs-creative'),
  ...require('../src/main/shortcut-packs-development'),
  ...require('../src/main/shortcut-packs-utilities'),
  ...require('../src/main/shortcut-packs-design'),
  ...require('../src/main/shortcut-packs-technical'),
  ...require('../src/main/shortcut-packs-windows-utilities'),
  ...require('../src/main/shortcut-packs-desktop-more'),
  ...require('../src/main/shortcut-packs-authoring'),
  ...require('../src/main/shortcut-packs-desktop-workspaces'),
  ...require('../src/main/shortcut-packs-creative-studios'),
  ...require('../src/main/shortcut-packs-windows-specialty'),
  ...require('../src/main/shortcut-packs-engineering'),
  ...require('../src/main/shortcut-packs-desktop-specialists'),
  ...require('../src/main/shortcut-packs-portable').newWindowsPacks,
];
const addedWeb = [
  ...require('../src/main/shortcut-packs-web-popular'),
  ...require('../src/main/shortcut-packs-web-work'),
  ...require('../src/main/shortcut-packs-web-more'),
  ...require('../src/main/shortcut-packs-web-workspaces'),
  ...require('../src/main/shortcut-packs-web-service-tools'),
  ...require('../src/main/shortcut-packs-web-engineering'),
  ...require('../src/main/shortcut-packs-web-specialists'),
];

const windows = { platform: 'win32', osRelease: '10.0.26100' };
const profile = validateProfile({ pages: [{ id: 'home', keys: [] }] });
const webWindow = (manifestId, executable = 'msedge.exe') => ({
  executable, appId: executable + '._crx_' + chromiumWebAppId(manifestId), keyboardLayout: US_LAYOUT, windowId: 42n,
});

test('452 distinct app products have active packs with separate packs for nine variants', () => {
  const all = [...packs, ...webPacks];
  const variants = new Set(['outlook-classic', 'antigravity-workbench', 'chatgpt-companion', 'cursor-agents', 'photoshop-web',
    'kicad-schematic', 'kicad-footprint', 'kicad-symbol', 'kicad-gerbview']);
  assert.equal(new Set(all.map(({ id }) => id)).size, all.length);
  assert.equal(all.filter(({ id }) => !variants.has(id)).length, 452);
  assert.equal(addedDesktop.length + addedWeb.length, 401);
  const layouts = Object.fromEntries(all.map(({ id }) => [id, { enabled: true }]));
  assert.deepEqual(validateProfile({ ...profile, shortcutLayouts: layouts }).shortcutLayouts, layouts);
});

test('all new app identities open usable, guarded shortcut pages and appear in the editor', () => {
  const previews = new Map(previewPacks('en-US').map((pack) => [pack.id, pack]));
  const check = (pack, context, currentProfile = profile) => {
    const pages = new Pages();
    pages.observe(context);
    const page = pages.current(currentProfile);
    assert.equal(page.pack, pack.id, pack.name);
    assert.ok(page.keys.length >= 2, pack.name);
    assert.equal(new Set(page.keys.map(({ id }) => id)).size, page.keys.length, pack.name);
    const preview = previews.get(pack.id);
    assert.equal(new URL(preview.source).protocol, 'https:');
    for (const key of page.keys) {
      assert.ok(iconExists(key.icon), pack.id + '/' + key.id);
      assert.ok(key.label.length <= 24, pack.id + '/' + key.id);
      assert.equal(key.unavailable, undefined, pack.id + '/' + key.id);
      const previewAction = preview.keys.find(({ id }) => id === key.id)?.action;
      assert.deepEqual(previewAction, key.action);
      for (const step of key.action.type === 'sequence' ? key.action.steps : [key.action]) {
        assert.doesNotThrow(() => parseCombo(step.keys), pack.id + '/' + key.id);
        assert.ok(validShortcutGuard(step.shortcutGuard));
        assert.equal(step.shortcutGuard.pack, pack.id);
      }
    }
    assert.ok(toView(currentProfile, { page }).slots.some((slot) => slot?.id === page.keys[0].id));
  };
  for (const pack of addedDesktop) {
    for (const executable of pack.executables) {
      check(pack, { executable: executable.toUpperCase(), keyboardLayout: US_LAYOUT, windowId: 17n, mode: pack.windowMode });
    }
    for (const appId of pack.appIds ?? []) {
      check(pack, { executable: 'ApplicationFrameHost.exe', appId: appId.toUpperCase(), keyboardLayout: US_LAYOUT, windowId: 18n });
    }
  }
  for (const pack of addedWeb) {
    if (pack.manifests.length) {
      for (const manifestId of pack.manifests) check(pack, webWindow(manifestId));
    } else {
      const manifestId = pack.manifestExample.replace('your-team.', 'acme.');
      assert.equal(packFor(webWindow(manifestId)), null);
      const configured = validateProfile({ ...profile, webApps: [{ manifestId, pack: pack.id }] });
      check(pack, webWindow(manifestId), configured);
    }
  }
  assert.equal(packFor({ executable: 'Godot_v4.6.3-stable_win64.exe' }).id, 'godot');
  assert.equal(packFor({ executable: 'other_godot_v4.6.3-stable_win64.exe' }), null);
  assert.equal(packFor({ executable: 'VEGAS230.exe' }).id, 'vegas-pro');
  assert.equal(packFor({ executable: 'another-vegas230.exe' }), null);
  assert.equal(packFor({ executable: 'Vectorworks2026.exe' }).id, 'vectorworks');
  assert.equal(packFor({ executable: 'MobaXterm_Personal_25.3.exe' }).id, 'mobaxterm');
  assert.equal(packFor({ executable: 'PAD.Console.Host.exe' }), null);
});

function titledWindow(executable, title) {
  return { executable, id: '1:42', windowId: 42n, mode: shortcutTitleMode(executable, title) };
}

test('engineering packs follow the editor inside shared foreground processes', () => {
  const pages = new Pages();
  for (const [executable, title, expected, command] of [
    ['kicad.exe', 'Test Board — PCB Editor', 'kicad', 'route'],
    ['kicad.exe', 'Test Board — Editor schemi', 'kicad-schematic', 'wire'],
    ['kicad.exe', 'Test Board — Gerber Viewer', 'kicad-gerbview', 'd-codes'],
    ['pcbnew.exe', 'Test Board — Editor impronte', 'kicad-footprint', 'anchor'],
    ['eeschema.exe', 'Test Board — Symbol Editor', 'kicad-symbol', 'pin'],
    ['matlabwindow.exe', 'MATLAB R2025a', 'matlab', 'run-section'],
    ['matlabwindow.exe', 'plant* - Simulink', 'simulink', 'update-model'],
  ]) {
    assert.equal(usesShortcutWindowTitle(executable), true);
    pages.observe(titledWindow(executable, title));
    const page = pages.current(profile);
    assert.equal(page.pack, expected);
    assert.equal(page.keys.find(({ id }) => id === command)?.action.shortcutGuard.pack, expected);
  }
  assert.equal(packFor(titledWindow('kicad.exe', 'Test Board — KiCad 10.0')), null);
  assert.equal(packFor(titledWindow('kicad.exe', 'Test Board — PCB Editor Settings')), null);
  assert.equal(packFor(titledWindow('matlabwindow.exe', 'MATLAB Help Center')), null);
  assert.equal(packFor(titledWindow('chrome.exe', 'Test Board — PCB Editor')).id, 'chrome');
});

test('Altium sequences send ordered chords and recheck the foreground between strokes', async () => {
  const original = { executable: 'x2.exe', id: '1:42', windowId: 42n };
  const pages = new Pages();
  pages.observe(original);
  const page = pages.current(profile);
  const key = page.keys.find(({ id }) => id === 'drc');
  assert.equal(key.shortcut, 'T → D → R');
  const copied = validateProfile({ pages: [{ id: 'altium', keys: [{ id: 'drc', action: key.action }] }] });
  assert.equal(copied.pages[0].keys[0].action.type, 'sequence');
  let target = original;
  const foreground = Object.assign(() => target.executable, { context: () => target, windowId: () => target.windowId });
  const sent = [];
  let switchTarget = false;
  const runner = createActionRunner({ readForeground: foreground, readShortcutSettings: () => windows,
    input: { sendChord: (keys) => {
      sent.push(keys.map(({ name }) => name).join('+'));
      if (switchTarget) target = { ...target, id: '1:44', windowId: 44n };
    } } });
  const run = () => runPageAction(page, key.action, runner, foreground, pages.binding(page));
  assert.equal((await run()).ok, true);
  assert.deepEqual(sent, ['t', 'd', 'r']);
  sent.length = 0;
  switchTarget = true;
  assert.equal((await run()).ok, false);
  assert.deepEqual(sent, ['t']);
});

test('web matches stay scoped to installed identities and tenant paths', () => {
  assert.equal(packFor({ executable: 'msedge.exe', title: 'Netflix' }).id, 'edge');
  assert.equal(packFor(webWindow('https://www.netflix.com/')).id, 'netflix');
  assert.equal(packFor(webWindow('https://www.netflix.com/', 'vivaldi.exe')).id, 'netflix');
  assert.equal(packFor(webWindow('https://www.netflix.com/', 'unrelated.exe')), null);
  assert.equal(packFor(webWindow('https://www.netflix.com.evil.test/')), null);
  assert.equal(packFor(webWindow('https://next.frame.io/')).id, 'frame-io');
  assert.equal(packFor(webWindow('https://app.frame.io/')), null);
  const webApps = webPacks.map((pack) => ({ pack: pack.id, manifestId: pack.manifestExample ?? pack.manifests[0] }));
  assert.equal(validateProfile({ ...profile, webApps }).webApps.length, webPacks.length);
  assert.throws(() => validateProfile({ ...profile, webApps: [{
    pack: 'confluence', manifestId: 'https://acme.atlassian.net/jira/your-work',
  }] }), /supported HTTPS/);
  assert.throws(() => validateProfile({ ...profile, webApps: [{
    pack: 'desmos-graphing', manifestId: 'https://www.desmos.com/calculator-notebook',
  }] }), /supported HTTPS/);
  assert.throws(() => validateProfile({ ...profile, webApps: [{
    pack: 'openstreetmap-id', manifestId: 'https://www.openstreetmap.org/'
  }] }), /supported HTTPS/);
});

test('pack search and copied actions preserve the target and cautious fixed editing', async () => {
  const [search] = searchCatalog({ kind: 'shortcut', app: 'whatsapp', query: 'find in chat' }, windows).items;
  assert.equal(search.binding.chord, 'Ctrl+Shift+F');
  assert.equal(search.source.url, 'https://faq.whatsapp.com/6204576529560565/?cms_platform=windows-desktop');
  const pages = new Pages();
  const original = { ...webWindow('https://www.netflix.com/'), id: '1:42' };
  pages.observe(original);
  const page = pages.current(profile);
  assert.equal(page.pack, 'netflix');
  assert.ok(fixedEditingKeys(profile, original, windows).every(({ action }) => !action));
  const sent = [];
  let target = original;
  const foreground = Object.assign(() => target.executable, { context: () => target, windowId: () => target.windowId });
  const runner = createActionRunner({ readForeground: foreground, readShortcutSettings: () => windows,
    input: { sendChord: (keys) => sent.push(keys.map(({ name }) => name).join('+')) } });
  const key = page.keys.find(({ id }) => id === 'play-pause');
  const run = () => runPageAction(page, key.action, runner, foreground, pages.binding(page));
  target = { ...webWindow('https://www.disneyplus.com/'), id: '1:42' };
  assert.equal((await run()).ok, false);
  assert.deepEqual(sent, []);
  target = original;
  assert.equal((await run()).ok, true);
  assert.deepEqual(sent, ['space']);
  pages.observe({ executable: 'soffice.bin', windowId: 44n });
  const action = pages.current(profile).keys.find(({ id }) => id === 'save').action;
  const copied = validateProfile({ pages: [{ id: 'writer', apps: ['soffice.bin'], keys: [{ id: 'save', action }] }] });
  assert.equal(pages.current(copied).id, 'writer');
});
