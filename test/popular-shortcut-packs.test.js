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
];
const addedWeb = [
  ...require('../src/main/shortcut-packs-web-popular'),
  ...require('../src/main/shortcut-packs-web-work'),
  ...require('../src/main/shortcut-packs-web-more'),
];

const windows = { platform: 'win32', osRelease: '10.0.26100' };
const profile = validateProfile({ pages: [{ id: 'home', keys: [] }] });
const webWindow = (manifestId, executable = 'msedge.exe') => ({
  executable, appId: executable + '._crx_' + chromiumWebAppId(manifestId), keyboardLayout: US_LAYOUT, windowId: 42n,
});

test('342 distinct app products have active packs with separate packs for five variants', () => {
  const all = [...packs, ...webPacks];
  const variants = new Set(['outlook-classic', 'antigravity-workbench', 'chatgpt-companion', 'cursor-agents', 'photoshop-web']);
  assert.equal(new Set(all.map(({ id }) => id)).size, all.length);
  assert.equal(all.filter(({ id }) => !variants.has(id)).length, 342);
  assert.equal(addedDesktop.length + addedWeb.length, 287);
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
      assert.doesNotThrow(() => parseCombo(key.action.keys), pack.id + '/' + key.id);
      assert.ok(validShortcutGuard(key.action.shortcutGuard));
      assert.equal(key.action.shortcutGuard.pack, pack.id);
      assert.equal(preview.keys.find(({ id }) => id === key.id)?.action.keys, key.action.keys);
    }
    assert.ok(toView(currentProfile, { page }).slots.some((slot) => slot?.id === page.keys[0].id));
  };
  for (const pack of addedDesktop) {
    for (const executable of pack.executables) {
      check(pack, { executable: executable.toUpperCase(), keyboardLayout: US_LAYOUT, windowId: 17n });
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
});

test('web matches stay scoped to installed identities and tenant paths', () => {
  assert.equal(packFor({ executable: 'msedge.exe', title: 'Netflix' }).id, 'edge');
  assert.equal(packFor(webWindow('https://www.netflix.com/')).id, 'netflix');
  assert.equal(packFor(webWindow('https://www.netflix.com/', 'vivaldi.exe')).id, 'netflix');
  assert.equal(packFor(webWindow('https://www.netflix.com/', 'unrelated.exe')), null);
  assert.equal(packFor(webWindow('https://www.netflix.com.evil.test/')), null);
  const webApps = webPacks.map((pack) => ({ pack: pack.id, manifestId: pack.manifestExample ?? pack.manifests[0] }));
  assert.equal(validateProfile({ ...profile, webApps }).webApps.length, webPacks.length);
  assert.throws(() => validateProfile({ ...profile, webApps: [{
    pack: 'confluence', manifestId: 'https://acme.atlassian.net/jira/your-work',
  }] }), /supported HTTPS/);
  assert.throws(() => validateProfile({ ...profile, webApps: [{
    pack: 'desmos-graphing', manifestId: 'https://www.desmos.com/calculator-notebook',
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
