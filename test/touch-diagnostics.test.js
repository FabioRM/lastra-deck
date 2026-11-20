'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeTouch } = require('../src/main/touch-diagnostics');

const lg = { id: 1, label: 'LG', physical: { x: 0, y: 0, width: 3840, height: 2160 }, dpi: 144 };
const edge = { id: 2, label: 'XENEON EDGE', physical: { x: 3840, y: 0, width: 2560, height: 720 }, dpi: 96 };

test('diagnostics show the actual destination when touch is mapped to the wrong display', () => {
  const report = summarizeTouch([{ name: 'TouchScreen', monitorBounds: edge.physical, mappedBounds: lg.physical }], [lg, edge], edge.id);
  assert.match(report.message, /Check the XENEON EDGE touch mapping/);
  assert.match(report.detail, /TouchScreen → LG · 3840×2160 px, origin \(0, 0\) · 144 DPI/);
});

test('diagnostics recognise a mapped Edge and handle missing touch devices', () => {
  const attached = summarizeTouch([{ name: 'TouchScreen', mappedBounds: edge.physical }], [lg, edge], edge.id);
  assert.match(attached.message, /mapped to the XENEON EDGE/);
  assert.match(summarizeTouch([], [lg], undefined).message, /No touchscreen/);
});
