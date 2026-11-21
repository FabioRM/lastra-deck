'use strict';

{
  const { canPlace, cells, findPosition, keyLayout, groupWidgetPlacements } = typeof module === 'object'
    ? require('./widget-layout') : window.LastraWidgetLayout;
  const FIXED_EDITING_KEYS = Object.freeze([
    { id: 'edit:cut', label: 'Cut', icon: 'scissors' },
    { id: 'edit:copy', label: 'Copy', icon: 'copy' },
    { id: 'edit:paste', label: 'Paste', icon: 'clipboard-paste' },
    { id: 'edit:undo', label: 'Undo', icon: 'undo-2' },
    { id: 'edit:redo', label: 'Redo', icon: 'redo-2' },
  ].map(Object.freeze));
  const STANDARD_EDITING_CHORDS = Object.freeze({ cut: 'Ctrl+X', copy: 'Ctrl+C', paste: 'Ctrl+V', undo: 'Ctrl+Z', redo: 'Ctrl+Y' });
  const EDITING_LABELS = new Map([
    ['cut', 'cut'], ['taglia', 'cut'], ['copy', 'copy'], ['copia', 'copy'], ['copy selection', 'copy'], ['copy-selection', 'copy'],
    ['paste', 'paste'], ['incolla', 'paste'], ['undo', 'undo'], ['annulla', 'undo'], ['redo', 'redo'], ['ripeti', 'redo'],
  ]);

  function normalizedChord(value) {
    return typeof value === 'string' ? value.toLowerCase().replace(/\s/g, '').replace(/(^|\+)control(?=\+)/g, '$1ctrl') : '';
  }

  function duplicateEditingKey(key, editingKeys, { generated, executable } = {}) {
    if (key?.action?.type !== 'hotkey') return false;
    const stable = key.id.toLowerCase();
    const catalog = /^catalog-(cut|copy|paste|undo|redo)-[a-f0-9]+$/.exec(stable)?.[1];
    const command = catalog ?? EDITING_LABELS.get(stable) ?? EDITING_LABELS.get(key.label?.trim().toLowerCase());
    if (!command || key.hold || key.double || key.confirm || key.readout || key.onBusy === 'queue-one') return false;
    if (generated) return true;
    const fixed = editingKeys.find(({ id }) => id === `edit:${command}`);
    if (normalizedChord(key.action.keys) !== normalizedChord(fixed?.shortcut ?? STANDARD_EDITING_CHORDS[command])) return false;
    const targets = key.action.targetApps;
    if (targets?.length && !targets.some((app) => app.toLowerCase() === executable?.toLowerCase())) return false;
    return !key.action.shortcutGuard || Object.entries(key.action.shortcutGuard)
      .every(([name, value]) => fixed?.action?.shortcutGuard?.[name] === value);
  }

  function projectedGrid(grid, portrait, largeKeys) {
    const fixed = FIXED_EDITING_KEYS.length;
    if (largeKeys) {
      const cols = portrait ? 3 : fixed;
      const rows = portrait ? 5 : 2;
      return { cols, rows, normal: cols * rows - fixed };
    }
    const total = grid.cols * grid.rows;
    const columns = portrait ? fixed : Math.max(fixed, grid.cols);
    const rows = Math.max(columns === fixed ? 2 : 1, Math.ceil(total / columns));
    return { cols: columns, rows, normal: Math.min(columns * rows - fixed, total > fixed ? total - fixed : total) };
  }

  function isButtonOnlyPage(slots, widgets = []) {
    return !widgets.length && slots.every((slot) => (slot?.span?.cols ?? 1) === 1 && (slot?.span?.rows ?? 1) === 1);
  }

  function projectButtonSheets(surface, slots) {
    const indices = slots.flatMap((slot, index) => slot ? [index] : []);
    return Array.from({ length: Math.max(1, Math.ceil(indices.length / surface.normal)) }, (_, sheet) => {
      const start = sheet * surface.normal;
      const keys = Array.from({ length: surface.normal }, (_, cell) => ({
        index: indices[start + cell] ?? null, layout: keyLayout(null, cell, surface),
      }));
      return { keys, widgets: [] };
    });
  }

  function projectEditingPage(grid, slots, widgets, portrait, largeKeys = false) {
    const surface = projectedGrid(grid, portrait, largeKeys);
    const size = surface.cols * surface.rows;
    const editing = FIXED_EDITING_KEYS.map(({ id }, offset) => ({ id,
      layout: keyLayout(null, size - FIXED_EDITING_KEYS.length + offset, surface),
    }));
    if (isButtonOnlyPage(slots, widgets)) return { ...surface, editing, sheets: projectButtonSheets(surface, slots) };
    const reserved = new Set(Array.from({ length: size - surface.normal }, (_, offset) => surface.normal + offset));
    const authored = slots.flatMap((slot, index) => slot ? [{ index, layout: keyLayout(slot, index, grid) }] : []);
    authored.push(...groupWidgetPlacements(widgets).map(({ members, layout }) => ({ members, layout })));
    authored.sort((a, b) => a.layout.row - b.layout.row || a.layout.column - b.layout.column);
    const blank = () => ({ keys: [], widgets: [], taken: new Set(reserved) });
    const sheets = [blank()];
    function place(sheet, item, layout) {
      if (item.members) sheet.widgets.push(...item.members.map((widget) => ({ ...widget, layout })));
      else sheet.keys.push({ index: item.index, layout });
      for (const cell of cells(layout, surface.cols)) sheet.taken.add(cell);
    }
    const native = grid.cols === surface.cols && grid.rows === surface.rows;
    const fit = (layout) => findPosition(surface, reserved, layout);
    const deferred = authored.filter((item) => {
      if (!native || !canPlace(item.layout, surface, sheets[0].taken)) return true;
      place(sheets[0], item, item.layout);
      return false;
    });
    for (const item of deferred) {
      // Preserve the original shape on a later screen whenever it fits an empty one.
      const shapes = [];
      for (let rows = Math.min(surface.rows, item.layout.rows); rows >= 1; rows--) {
        for (let cols = Math.min(surface.cols, item.layout.cols); cols >= 1; cols--) shapes.push({ cols, rows });
      }
      shapes.sort((a, b) => b.cols * b.rows - a.cols * a.rows);
      const footprint = shapes.find(fit);
      let position;
      const sheet = sheets.find((candidate) => (position = findPosition(surface, candidate.taken, footprint)));
      if (sheet) place(sheet, item, position);
      else {
        const fresh = blank();
        place(fresh, item, fit(footprint));
        sheets.push(fresh);
      }
    }
    return { ...surface, editing, sheets: sheets.map(({ keys, widgets, taken }) => {
      for (let index = 0; index < surface.normal; index++) {
        if (!taken.has(index)) keys.push({ index: null, layout: keyLayout(null, index, surface) });
      }
      keys.sort((a, b) => a.layout.row - b.layout.row || a.layout.column - b.layout.column);
      return { keys, widgets };
    }) };
  }

  function projectShortcutPages(grid, slots, portrait, largeKeys = false, pages) {
    const selections = new Map((pages ?? [{ id: undefined, name: undefined }])
      .map(({ id, name }) => [id, { name, indices: [] }]));
    slots.forEach((key, index) => {
      if (key) selections.get(pages ? key.shortcutPage : undefined)?.indices.push(index);
    });
    const layouts = Array.from(selections.values(), ({ name, indices }) => {
      const layout = projectEditingPage(grid, indices.map((index) => slots[index]), [], portrait, largeKeys);
      const sheets = layout.sheets.map((sheet) => ({
        ...sheet,
        ...(name ? { group: name } : {}),
        keys: sheet.keys.map((key) => ({
          ...key,
          index: key.index === null ? null : indices[key.index],
        })),
      }));
      return { ...layout, sheets };
    });
    const first = layouts[0] ?? projectEditingPage(grid, [], [], portrait, largeKeys);
    return layouts.length > 1 ? { ...first, sheets: layouts.flatMap(({ sheets }) => sheets) } : first;
  }

  const api = { FIXED_EDITING_KEYS, STANDARD_EDITING_CHORDS, duplicateEditingKey, isButtonOnlyPage, projectEditingPage, projectShortcutPages };
  if (typeof module === 'object') module.exports = api;
  else window.LastraEditingKeys = api;
}
