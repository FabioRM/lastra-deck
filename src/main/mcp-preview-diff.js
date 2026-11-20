// @ts-check
'use strict';

const { toView } = require('../shared/deck-view');
const { describeLayoutView } = require('./mcp-layout');

const MAX_CHANGES = 32;
const count = { type: 'integer', minimum: 0 };
const kind = { enum: ['key', 'widget'] };
const shape = (required, optional) => ({ type: 'object', properties: { ...required, ...optional }, required: Object.keys(required), additionalProperties: false });
const grid = shape({ cols: count, rows: count });
const placement = shape({ kind, surface: { enum: ['deck', 'bar'] }, sheet: { type: ['integer', 'null'], minimum: 0 },
  column: count, row: count, cols: count, rows: count });
const maybePlacement = { anyOf: [placement, { type: 'null' }] };
const difference = shape({ change: { enum: ['added', 'removed', 'changed'] }, before: maybePlacement, after: maybePlacement },
  { draftTile: { type: 'string', maxLength: 48 } });
const comparisonOutput = shape({ source: { const: 'saved' }, match: { enum: ['identity', 'position'] }, forkDiverged: { type: 'boolean' },
  currentGrid: { anyOf: [grid, { type: 'null' }] }, draftGrid: grid, currentSheets: count, draftSheets: count,
  counts: shape({ added: count, removed: count, changed: count, omitted: count }),
  changes: { type: 'array', items: difference, maxItems: MAX_CHANGES },
});

function placed(layout) {
  if (!layout) return [];
  const placement = (keys, widgets, surface, sheet) => [
    ...keys.map(({ id, layout, column, span }) => ({ id, position: {
      kind: 'key', surface, sheet, ...(layout ?? { column, row: 0, cols: span?.cols ?? 1, rows: 1 }),
    } })),
    ...widgets.map(({ id, layout }) => ({ id, position: { kind: 'widget', surface, sheet, ...layout } })),
  ];
  return [...layout.sheets.flatMap(({ keys, widgets }, sheet) => placement(keys, widgets, 'deck', sheet)),
    ...placement(layout.bar.keys, layout.bar.widgets, 'bar', null)];
}

function withDraftIdentity(items, profile, page, view) {
  const original = toView(profile, { page });
  const maps = {
    deck: { key: new Map(), widget: new Map() },
    bar: { key: new Map(), widget: new Map() },
  };
  for (const [surface, kind, raw, rendered] of [
    ['deck', 'key', original.slots, view.slots], ['bar', 'key', original.bar.keys, view.bar.keys],
    ['deck', 'widget', original.widgets, view.widgets], ['bar', 'widget', original.bar.widgets, view.bar.widgets],
  ]) {
    rendered.forEach((tile, index) => { if (tile) maps[surface][kind].set(tile.id, raw[index].id); });
  }
  return items.map((item) => ({ ...item, draftTile: item.id, id: maps[item.position.surface][item.position.kind].get(item.id) }));
}

function identity(item) {
  const { surface, kind } = item.position;
  return [kind, surface === 'bar' && kind === 'key' ? item.id.slice(4) : item.id];
}

function address(item) {
  const { surface, sheet, row, column, kind } = item.position;
  return [surface, sheet, row, column, kind];
}

function samePosition(a, b) {
  return Object.keys(a).every((key) => a[key] === b[key]);
}

function matchItems(before, after, identify) {
  const current = new Set(before);
  const proposed = new Set(after);
  const matches = new Map();
  function pair(signature, unique = false) {
    const choices = new Map();
    for (const item of current) {
      const key = JSON.stringify(signature(item));
      if (!choices.has(key)) choices.set(key, []);
      choices.get(key).push(item);
    }
    const candidateCounts = new Map();
    if (unique) for (const item of proposed) {
      const key = JSON.stringify(signature(item));
      candidateCounts.set(key, (candidateCounts.get(key) ?? 0) + 1);
    }
    for (const item of proposed) {
      const key = JSON.stringify(signature(item));
      const options = choices.get(key);
      if (!options?.length || (unique && (options.length !== 1 || candidateCounts.get(key) !== 1))) continue;
      const match = options.shift();
      matches.set(item, match);
      proposed.delete(item);
      current.delete(match);
    }
  }
  if (identify) {
    pair((item) => [item.position.surface, ...identity(item)], true);
    pair(identity, true);
  } else {
    pair((item) => [...address(item), item.position.cols, item.position.rows]);
    pair(address);
  }
  return { matches, removed: current };
}

function comparePreviewLayout(draft, plan, options, saved) {
  const { portrait, page } = options;
  const identify = draft.baseToken !== undefined;
  const proposedPage = page === undefined ? draft.profile.pages[0] : draft.profile.pages.find(({ id }) => id === page);
  const savedPage = identify ? saved.profile.pages.find(({ id }) => id === proposedPage.id)
    : saved.profile.pages[draft.profile.pages.indexOf(proposedPage)];
  const source = toView(saved.profile, { page: savedPage ?? saved.profile.pages[0] });
  const current = describeLayoutView(source, '', portrait);
  const currentPage = savedPage ? current : { ...current, grid: null, sheets: [] };
  const before = placed(currentPage);
  const projected = placed(plan.layout);
  const after = identify ? withDraftIdentity(projected, draft.profile, proposedPage, plan.view)
    : projected.map((item) => ({ ...item, draftTile: item.id }));
  const { matches, removed } = matchItems(before, after, identify);
  const counts = { added: 0, removed: 0, changed: 0, omitted: 0 };
  const changes = [];
  const include = (change, original, proposed) => {
    counts[change]++;
    if (changes.length === MAX_CHANGES) { counts.omitted++; return; }
    changes.push({ change, before: original?.position ?? null, after: proposed?.position ?? null,
      ...(proposed ? { draftTile: proposed.draftTile } : {}) });
  };
  for (const item of after) {
    const original = matches.get(item);
    if (!original) include('added', null, item);
    else if (!samePosition(original.position, item.position)) include('changed', original, item);
  }
  for (const item of removed) include('removed', item, null);
  return { source: 'saved', match: identify ? 'identity' : 'position', forkDiverged: identify && draft.baseToken !== saved.token,
    currentGrid: currentPage.grid, draftGrid: plan.layout.grid, currentSheets: currentPage.sheets.length,
    draftSheets: plan.layout.sheets.length, counts, changes };
}

module.exports = { comparePreviewLayout, comparisonOutput, MAX_CHANGES };
