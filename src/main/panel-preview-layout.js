// @ts-check
'use strict';

const { describeLayoutView } = require('./mcp-layout');
const { toView, validateProfile } = require('./profile');

const APP_ID = /^[a-z0-9][a-z0-9._!{}-]{0,190}$/i;

function copyVisiblePage(page, view, { portrait, largeKeys, sheet, appId }) {
  if (!page.generated) return { pageId: page.id, sheet };
  const layout = describeLayoutView(view, page.id, portrait, largeKeys);
  const visible = layout.sheets[Math.min(sheet, layout.sheets.length - 1)];
  const originals = new Map(page.keys.map((key) => [key.id, key]));
  const appIds = typeof appId === 'string' && APP_ID.test(appId) ? [appId] : [];
  const apps = appIds.length ? [] : page.apps;
  const keys = visible.keys.map(({ id }) => {
    const { label, icon, category, action, confirm, shortcut, unavailable } = originals.get(id);
    const guarded = page.pack || !apps.length ? action : { ...action, targetApps: apps };
    return {
      id, label, icon, category, action: guarded,
      ...(confirm ? { confirm } : {}), ...(shortcut ? { shortcut } : {}),
      ...(!page.pack && unavailable ? { unavailable } : {}),
    };
  });
  return { sheet: 0, copy: { name: page.name, grid: view.grid, apps, appIds, keys, widgets: [] } };
}

function panelDraftView(raw, id, sheet, { icon, image }) {
  const profile = validateProfile(raw);
  const page = profile.pages.find((item) => item.id === id);
  if (!page) throw new Error('Choose a draft page to preview.');
  return {
    ...toView(profile, { page, icon, image }),
    page: page.id, pageName: page.name,
    pages: profile.pages.map(({ id, name, folder }) => ({ id, name, folder })),
    locked: false, followsApps: false, editorActive: true,
    deckSheet: Number.isSafeInteger(sheet) && sheet >= 0 ? sheet : 0,
  };
}

module.exports = { copyVisiblePage, panelDraftView };
