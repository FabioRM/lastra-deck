'use strict';

{
  const { canPlace, fits, keyLayout, occupiedCells } = typeof module === 'object'
    ? require('../shared/widget-layout') : window.LastraWidgetLayout;

  function captureKeyGroup(keys, grid, selection) {
    const entries = [...selection].filter((index) => keys[index])
      .map((index) => ({ key: keys[index], layout: keyLayout(keys[index], index, grid) }));
    if (!entries.length) return null;
    const left = Math.min(...entries.map(({ layout }) => layout.column));
    const top = Math.min(...entries.map(({ layout }) => layout.row));
    const cols = Math.max(...entries.map(({ layout }) => layout.column + layout.cols)) - left;
    const rows = Math.max(...entries.map(({ layout }) => layout.row + layout.rows)) - top;
    const groupKeys = Array(cols * rows).fill(null);
    for (const { key, layout } of entries) groupKeys[(layout.row - top) * cols + layout.column - left] = key;
    return { grid: { cols, rows }, keys: groupKeys };
  }

  function placeKeyGroup(group, grid, occupied, index) {
    const start = keyLayout(null, index, grid);
    if (!fits({ ...start, ...group.grid }, grid)) return null;
    const positions = [];
    for (const [source, key] of group.keys.entries()) {
      if (!key) continue;
      const { column, row, cols, rows } = keyLayout(key, source, group.grid);
      const placement = { column: start.column + column, row: start.row + row, cols, rows };
      if (!canPlace(placement, grid, occupied)) return null;
      positions.push({ index: placement.row * grid.cols + placement.column, key });
    }
    return positions;
  }

  function findKeyGroupPosition(group, grid, occupied) {
    for (let index = 0; index < grid.cols * grid.rows; index++) {
      const positions = placeKeyGroup(group, grid, occupied, index);
      if (positions) return positions;
    }
    return null;
  }

  function keyGroupMoves(keys, grid, widgets, selection, group) {
    const indices = [...selection].filter((index) => keys[index]);
    if (!indices.length) return new Map();
    const left = Math.min(...indices.map((index) => index % grid.cols));
    const top = Math.min(...indices.map((index) => Math.floor(index / grid.cols)));
    const origin = top * grid.cols + left;
    const remaining = keys.map((key, index) => selection.has(index) ? null : key);
    const occupied = occupiedCells(grid, remaining, widgets);
    const moves = new Map();
    for (let index = 0; index < grid.cols * grid.rows; index++) {
      if (index === origin) continue;
      const positions = placeKeyGroup(group, grid, occupied, index);
      if (positions) moves.set(index, positions);
    }
    return moves;
  }

  function applyKeyAppearance(key, { category, asset }) {
    if (category) key.category = category;
    if (!asset) return;
    if (asset.kind === 'image') {
      key.image = asset.value;
    } else {
      delete key.image;
      delete key.iconExpression;
      if (asset.kind === 'icon') key.icon = asset.value;
      else delete key.icon;
    }
  }

  const api = { captureKeyGroup, placeKeyGroup, findKeyGroupPosition, keyGroupMoves, applyKeyAppearance };
  if (typeof module === 'object') module.exports = api;
  else window.LastraKeyGroups = api;
}
