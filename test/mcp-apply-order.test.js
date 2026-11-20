'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { diffValues, prioritizeChanges } = require('../src/main/mcp-apply');

test('approval lists action and target changes before cosmetic edits', () => {
  const page = (label, target) => ({ id: 'a', name: label, keys: [
    ...Array.from({ length: 30 }, (_, i) => ({ id: `k${i}`, label: `${label}${i}` })),
    { id: 'mute', label: `${label} mute`, action: { type: 'open', target } },
  ] });
  const changes = diffValues({ pages: [page('A', 'ms-settings:sound')] }, { pages: [page('B', 'https://attacker.invalid/x')] });
  const ordered = prioritizeChanges(changes);
  assert.equal(ordered.length, changes.length);
  assert.equal(ordered[0].field, 'pages.0.keys.30.action.target');
  assert.equal(ordered[1].field, 'pages.0.name');
});
