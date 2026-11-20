// @ts-check
'use strict';

const { toView, validateProfile } = require('./profile');
const { projectEditingPage, projectShortcutGroups } = require('../shared/editing-keys');

function describeLayoutView(view, page, portrait, largeKeys = false) {
  const { cols, rows, editing, sheets } = view.shortcutGroups
    ? projectShortcutGroups(view.grid, view.slots, portrait, largeKeys, view.shortcutPages)
    : projectEditingPage(view.grid, view.slots, view.widgets, portrait, largeKeys);
  return {
    page, orientation: portrait ? 'portrait' : 'landscape', grid: { cols, rows },
    editing,
    sheets: sheets.map((/** @type {{ keys: any[], widgets: any[], group?: string }} */ { keys, widgets, group }) => ({
      ...(group ? { group } : {}),
      keys: keys.filter(({ index }) => index !== null).map(({ index, layout }) => ({ id: view.slots[index].id, layout })),
      widgets: widgets.map(({ id, type, layout }) => ({ id, type, layout })),
    })),
    bar: {
      keys: view.bar.keys.flatMap((key, column) => key ? [{ id: key.id, column, span: key.span }] : []),
      widgets: view.bar.widgets.map(({ id, type, layout }) => ({ id, type, layout })),
    },
  };
}

/**
 * @param {unknown} raw
 * @param {{ page?: string, portrait?: boolean }} [options]
 */
function offlineLayout(raw, { page, portrait = false } = {}) {
  const profile = validateProfile(raw);
  const selected = page === undefined ? profile.pages[0] : profile.pages.find(({ id }) => id === page);
  if (!selected) throw new Error('The requested page does not exist in the supplied profile.');
  return describeLayoutView(toView(profile, { page: selected }), selected.id, portrait === true);
}

module.exports = { describeLayoutView, offlineLayout };
