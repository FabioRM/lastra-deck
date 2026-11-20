'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AgentDrafts } = require('../src/main/mcp-drafts');
const { validateProfile } = require('../src/main/profile');
const { AgentVisualPreview, buildVisualPreview, visualPreviewParams, visualPreviewOutput } = require('../src/main/mcp-visual-preview');
const { comparePreviewLayout, MAX_CHANGES } = require('../src/main/mcp-preview-diff');

const key = (id) => ({ id, label: 'Private author label', icon: 'pin', action: { type: 'delay', ms: 50 } });
const grid = { cols: 8, rows: 3 };
const original = { version: 2, name: 'Private profile', grid, pages: [{ id: 'private-page', name: 'Private page',
  keys: [key('private-moved'), key('private-wide'), key('private-removed')] }],
bar: { keys: [key('private-pinned')] } };
const saved = { token: 'private-token', profile: validateProfile(original) };

function draftFor(drafts, profile, token) {
  const { id, revision } = drafts.create('client', 'main', profile, token);
  return { draft: id, revision, compareCurrent: true };
}

function layoutDiff(drafts, input, baseline = saved) {
  const options = visualPreviewParams(input);
  const draft = drafts.resolve('client', 'main', input.draft, input.revision);
  return comparePreviewLayout(draft, buildVisualPreview(draft, options), options, baseline);
}

test('a saved fork reports stable moves, width changes and removals with only draft aliases', () => {
  const drafts = new AgentDrafts();
  const initial = draftFor(drafts, original, saved.token);
  const { revision } = drafts.edit('client', 'main', initial.draft, 1, [
    { op: 'move-key', surface: 'private-page', slot: 0, toSurface: 'bar:', toSlot: 1 },
    { op: 'resize-key', surface: 'private-page', slot: 1, span: { cols: 1, rows: 2 } },
    { op: 'remove-key', surface: 'private-page', slot: 2 },
    { op: 'set-key', surface: 'private-page', slot: 3, key: key('private-added') },
  ]);
  const comparison = layoutDiff(drafts, { ...initial, revision });
  assert.equal(comparison.match, 'identity');
  assert.equal(comparison.forkDiverged, false);
  assert.deepEqual(comparison.counts, { added: 1, removed: 1, changed: 2, omitted: 0 });
  const moved = comparison.changes.find(({ draftTile }) => draftTile === 'bar:key-2');
  assert.deepEqual(moved.before, { kind: 'key', surface: 'deck', sheet: 0, row: 0, column: 0, cols: 1, rows: 1 });
  assert.deepEqual(moved.after, { kind: 'key', surface: 'bar', sheet: null, row: 0, column: 1, cols: 1, rows: 1 });
  const taller = comparison.changes.find(({ draftTile }) => draftTile === 'key-2');
  assert.deepEqual([taller.before.rows, taller.after.rows], [1, 2]);
  const removed = comparison.changes.find(({ change }) => change === 'removed');
  assert.equal(Object.hasOwn(removed, 'draftTile'), false);
  assert.equal(removed.after, null);
  assert.doesNotMatch(JSON.stringify(comparison), /Private|private-|profile|icon|shortcut/i);
  assert.equal(layoutDiff(drafts, { ...initial, revision }, { ...saved, token: 'updated-token' }).forkDiverged, true);
});

test('a supplied draft compares placement against the corresponding saved page ordinal only', () => {
  const drafts = new AgentDrafts();
  const proposed = { ...original, pages: [
    { id: 'different-page', keys: [key('supplied-a'), key('supplied-b'), key('supplied-c')] },
    { id: 'new-page', keys: [key('new-page-key')] },
  ], bar: { keys: [{ ...key('supplied-pinned'), span: { cols: 2, rows: 1 } }] } };
  const input = draftFor(drafts, proposed);
  const comparison = layoutDiff(drafts, input);
  assert.equal(comparison.match, 'position');
  assert.equal(comparison.forkDiverged, false);
  assert.deepEqual(comparison.counts, { added: 0, removed: 0, changed: 1, omitted: 0 });
  assert.equal(comparison.changes[0].draftTile, 'bar:supplied-pinned');
  assert.deepEqual([comparison.changes[0].before.cols, comparison.changes[0].after.cols], [1, 2]);
  assert.doesNotMatch(JSON.stringify(comparison), /private-/i);
  const otherPage = layoutDiff(drafts, { ...input, page: 'new-page' });
  assert.equal(otherPage.currentGrid, null);
  assert.equal(otherPage.currentSheets, 0);
  assert.equal(otherPage.counts.added, 1);
  assert.equal(otherPage.counts.changed, 1);
});

test('comparison counts include other sheets and bound placement listings', () => {
  const drafts = new AgentDrafts();
  const dense = { grid: { cols: 12, rows: 6 }, pages: [{ id: 'dense', keys: Array.from({ length: 72 }, (_, index) => key(`item-${index}`)) }] };
  const baseline = { token: 'token', profile: validateProfile({ pages: [{ id: 'before', keys: [] }] }) };
  const input = draftFor(drafts, dense);
  const comparison = layoutDiff(drafts, { ...input, portrait: true }, baseline);
  assert.ok(comparison.draftSheets > 1);
  assert.deepEqual(comparison.counts, { added: 72, removed: 0, changed: 0, omitted: 72 - MAX_CHANGES });
  assert.equal(comparison.changes.length, MAX_CHANGES);
  assert.ok(Buffer.byteLength(JSON.stringify(comparison)) < 10 * 1024);
});

test('comparison reads saved bytes only with both grants and checks them again after rendering', async () => {
  const drafts = new AgentDrafts();
  const input = draftFor(drafts, original);
  let current = saved;
  let reads = 0;
  let authorized = true;
  let canCompare = true;
  let done;
  const preview = new AgentVisualPreview({ drafts, readCurrent() { reads++; return current; },
    render: () => new Promise((resolve) => {
      done = () => resolve({ inspection: {}, image: { mimeType: 'image/jpeg', width: 1280, height: 360 }, imageData: 'YWJj' });
    }) });
  const request = () => preview.preview('client', 'main', input, () => authorized, () => canCompare);
  await assert.rejects(preview.preview('wrong', 'main', input, () => true, () => true), /draft is unavailable/);
  await assert.rejects(preview.preview('client', 'wrong-activity', input, () => true, () => true), /draft is unavailable/);
  await assert.rejects(preview.preview('client', 'main', input), /requires the Deck layout grant/);
  assert.equal(reads, 0);
  const simple = preview.preview('client', 'main', { ...input, compareCurrent: false });
  done();
  assert.equal(Object.hasOwn(await simple, 'comparison'), false);
  assert.equal(reads, 0);

  const revoked = request();
  canCompare = false;
  done();
  await assert.rejects(revoked, /Saved layout access expired/);
  assert.equal(reads, 1);
  canCompare = true;
  const changedActivity = request();
  authorized = false;
  done();
  await assert.rejects(changedActivity, /Visual preview access expired/);
  assert.equal(reads, 2);
  authorized = true;
  const changedSaved = request();
  current = { ...saved, token: 'changed-saved-version' };
  done();
  await assert.rejects(changedSaved, /saved layout changed during this preview/);
  current = { ...saved, warning: 'Private parse details' };
  await assert.rejects(request(), { message: 'The saved layout is unavailable.' });
  current = saved;
  const success = request();
  done();
  const result = await success;
  assert.equal(result.comparison.source, 'saved');
  assert.deepEqual(result.comparison.counts, { added: 0, removed: 0, changed: 0, omitted: 0 });
  assert.equal(visualPreviewOutput.required.includes('comparison'), false);
});
