'use strict';

{
  const { catalog, cells, fits, keyLayout, groupWidgetPlacements, widgetTabLabel } = typeof module === 'object'
    ? require('../shared/widget-layout') : window.LastraWidgetLayout;

  function planGridResize(page, before, after) {
    const items = page.keys.flatMap((key, index) => key ? [{
      label: key.label || key.id, kind: 'key', layout: keyLayout(key, index, before), key,
    }] : []);
    for (const { members, layout } of groupWidgetPlacements(page.widgets ?? [])) {
      const [widget] = members;
      const label = members.length > 1 ? members.map(widgetTabLabel).join(', ') : catalog[widget.type]?.name ?? widget.type;
      items.push({ label, kind: 'widget', layout, members });
    }
    const occupied = new Map();
    for (const item of items) {
      if (!fits(item.layout, after)) {
        item.reason = 'extends past the proposed grid';
        continue;
      }
      for (const cell of cells(item.layout, after.cols)) {
        const other = occupied.get(cell);
        if (other) other.reason = item.reason = 'overlaps another item';
        else occupied.set(cell, item);
      }
    }
    const keys = [];
    const widgets = [];
    const blocked = [];
    for (const item of items) {
      if (item.reason) blocked.push(item);
      else if (item.key) keys[item.layout.row * after.cols + item.layout.column] = item.key;
      else widgets.push(...item.members);
    }
    return { keys: Array.from(keys, (key) => key ?? null), widgets, blocked };
  }

  if (typeof module === 'object') module.exports = { planGridResize };
  else window.LastraGridResize = { planGridResize };
}
