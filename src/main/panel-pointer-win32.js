// @ts-check
'use strict';

const { fn } = require('./win32');

function createPanelPointerReader() {
  if (process.platform !== 'win32') return () => null;
  const read = fn('GetPhysicalCursorPos');
  const point = Buffer.alloc(8);
  return () => read(point) ? { x: point.readInt32LE(0), y: point.readInt32LE(4) } : null;
}

module.exports = { createPanelPointerReader };
