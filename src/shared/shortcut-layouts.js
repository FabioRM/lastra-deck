'use strict';

{
  const LIMITS = Object.freeze({ apps: 64, pages: 16, shortcuts: 48 });
  const PACK = /^[a-z0-9-]{1,48}$/;
  const PAGE = /^[a-z0-9_-]{1,40}$/i;
  const SHORTCUT = /^[a-z0-9_-]{1,64}$/i;
  const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
  const hasOnly = (value, names) => record(value) && Object.keys(value).every((key) => names.includes(key));

  function validateShortcutLayouts(value) {
    if (value === undefined) return {};
    if (!record(value) || Object.keys(value).length > LIMITS.apps) throw new Error('Invalid app shortcut layouts.');
    return Object.fromEntries(Object.entries(value).map(([pack, layout]) => {
      if (!PACK.test(pack) || !hasOnly(layout, ['enabled', 'pages']) || typeof layout.enabled !== 'boolean') {
        throw new Error('Choose an app shortcut layout with a valid app ID.');
      }
      if (layout.pages === undefined) return [pack, { enabled: layout.enabled }];
      if (!Array.isArray(layout.pages) || !layout.pages.length || layout.pages.length > LIMITS.pages) {
        throw new Error('Choose one to sixteen pages for an app shortcut layout.');
      }
      const pageIds = new Set();
      const pages = layout.pages.map((page) => {
        if (!hasOnly(page, ['id', 'name', 'shortcuts']) || typeof page.id !== 'string' || !PAGE.test(page.id)
            || pageIds.has(page.id) || typeof page.name !== 'string' || !/^\P{C}{1,40}$/u.test(page.name.trim())
            || !Array.isArray(page.shortcuts) || page.shortcuts.length > LIMITS.shortcuts) {
          throw new Error('App shortcut pages need unique IDs, a name, and at most 48 shortcuts.');
        }
        pageIds.add(page.id);
        const stored = new Set();
        const shortcuts = page.shortcuts.map((key) => {
          if (!hasOnly(key, ['id', 'hidden']) || typeof key.id !== 'string' || !SHORTCUT.test(key.id) || stored.has(key.id)
              || (key.hidden !== undefined && typeof key.hidden !== 'boolean')) throw new Error('Invalid or duplicate app shortcut.');
          stored.add(key.id);
          return { id: key.id, ...(key.hidden ? { hidden: true } : {}) };
        });
        return { id: page.id, name: page.name.trim(), shortcuts };
      });
      return [pack, { enabled: layout.enabled, pages }];
    }));
  }

  function applyShortcutPages(pages, available) {
    const byId = new Map(available.map((key) => [key.id, key]));
    return pages.flatMap(({ id, shortcuts }) => shortcuts.flatMap(({ id: keyId, hidden }) => {
      const key = byId.get(keyId);
      return hidden || !key ? [] : [{ ...key, id: 'app-shortcut:' + id + ':' + keyId, shortcutPage: id }];
    }));
  }

  const api = { validateShortcutLayouts, applyShortcutPages, SHORTCUT_LAYOUT_LIMITS: LIMITS };
  if (typeof module === 'object') module.exports = api;
  else window.LastraShortcutLayouts = api;
}
