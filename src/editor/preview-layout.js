'use strict';

{
  const { keyLayout, occupiedCells, canPlace, groupWidgetPlacements, widgetTabLabel } = typeof module === 'object'
    ? require('../shared/widget-layout') : window.LastraWidgetLayout;

  function draftLayoutItems(page, grid) {
    return [
      ...page.keys.flatMap((key, index) => key ? [{
        kind: 'key', id: key.id, label: key.label ?? key.id, layout: keyLayout(key, index, grid), index,
      }] : []),
      ...groupWidgetPlacements(page.widgets ?? []).map(({ members, layout }) => ({
        kind: 'widget', id: members[0].id, layout,
        label: members.length > 1 ? widgetTabLabel(members[0]) + ' stack' : members[0].settings?.composition?.name ?? members[0].type,
        members: new Set(members.map(({ id }) => id)),
      })),
    ];
  }

  function proposeDraftLayout(page, grid, target, resize, dx, dy) {
    const item = draftLayoutItems(page, grid).find(({ id, kind }) => id === target.id && kind === target.kind);
    if (!item || !Number.isInteger(dx) || !Number.isInteger(dy)) return null;
    const { column, row, cols, rows } = item.layout;
    const layout = resize ? { column, row, cols: cols + dx, rows: rows + dy }
      : { column: column + dx, row: row + dy, cols, rows };
    const keys = page.keys.slice();
    const widgets = page.widgets ?? [];
    const key = item.kind === 'key' ? keys[item.index] : undefined;
    if (key) keys[item.index] = null;
    const unstacked = item.members ? widgets.filter(({ id }) => !item.members.has(id)) : widgets;
    if (!canPlace(layout, grid, occupiedCells(grid, keys, unstacked))) return { layout, valid: false };
    if (key) {
      const edited = { ...key };
      if (layout.cols === 1 && layout.rows === 1) delete edited.span;
      else edited.span = { cols: layout.cols, rows: layout.rows };
      keys[layout.row * grid.cols + layout.column] = edited;
    }
    const placed = item.members ? widgets.map((widget) => item.members.has(widget.id) ? { ...widget, layout } : widget) : widgets;
    return { layout, valid: true, keys: Array.from(keys, (value) => value ?? null), widgets: placed, changed: dx !== 0 || dy !== 0 };
  }

  const api = { draftLayoutItems, proposeDraftLayout };
  if (typeof module === 'object') module.exports = api;
  else window.LastraPreviewLayout = api;
}
