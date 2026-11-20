'use strict';

{
  const MAX_PAGES = 16;

  function matchKey(value, title) {
    return JSON.stringify([value.toLowerCase(), title?.mode, title?.value?.toLowerCase()]);
  }

  function prepareTemplatePages(draft, template, newId = () => crypto.randomUUID()) {
    if (draft.pages.length + template.pages.length > MAX_PAGES) {
      throw new Error(`Make room for ${template.pages.length} pages before adding this template.`);
    }
    const names = new Set(draft.pages.map(({ name }) => name));
    const apps = new Set(draft.pages.flatMap((page) => page.apps.map((value) => matchKey(value, page.windowTitle))));
    const ids = new Set(draft.pages.flatMap((page) => (page.appIds ?? []).map((value) => matchKey(value, page.windowTitle))));
    const collisions = [];
    const pages = template.pages.map((source) => {
      const page = structuredClone(source);
      page.id = newId();
      page.grid = { ...(page.grid ?? template.grid) };
      for (let i = 1; names.has(page.name); i++) {
        const suffix = i === 1 ? ' · copy' : ` · copy ${i}`;
        page.name = source.name.slice(0, 40 - suffix.length) + suffix;
      }
      names.add(page.name);
      function available(value, matches) {
        const key = matchKey(value, page.windowTitle);
        if (matches.has(key)) {
          collisions.push({ page: page.name, value });
          return false;
        }
        matches.add(key);
        return true;
      }
      page.apps = page.apps.filter((value) => available(value, apps));
      if (page.appIds) page.appIds = page.appIds.filter((value) => available(value, ids));
      if (!page.apps.length && !page.appIds?.length) {
        delete page.windowTitle;
        delete page.priority;
      }
      return page;
    });
    return { pages, collisions };
  }

  if (typeof module === 'object') module.exports = { prepareTemplatePages };
  else window.LastraProfileTemplateImport = { prepareTemplatePages };
}
