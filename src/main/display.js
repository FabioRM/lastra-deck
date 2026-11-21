// @ts-check
'use strict';

// Find the XENEON EDGE among the connected displays.
// Electron reports sizes in DIP. Multiply by the scale factor for physical pixels.

const EDGE_W = 2560;
const EDGE_H = 720;
const TOLERANCE = 2; // DIP-to-pixel rounding (for example, 1707 * 1.5 = 2560.5)

function physicalSize(display) {
  return {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor),
  };
}

function near(a, b) {
  return Math.abs(a - b) <= TOLERANCE;
}

/** 'landscape' | 'portrait' | null */
function edgeOrientation(display) {
  const { width, height } = physicalSize(display);
  if (near(width, EDGE_W) && near(height, EDGE_H)) return 'landscape';
  if (near(width, EDGE_H) && near(height, EDGE_W)) return 'portrait';
  return null;
}

function findEdgeDisplay(displays, preferredId, platform = 'win32') {
  const preferred = preferredId === undefined || preferredId === null || preferredId === '' ? null
    : displays.find((display) => String(display.id) === String(preferredId));
  if (platform === 'linux' && preferred) return preferred;
  const edge = displays.find((d) => /\bxeneon\s+edge\b/i.test(d.label || ''));
  if (edge) return preferred ?? edge;
  // Some Linux sessions report a connector name instead of the EDID model name.
  if (platform !== 'linux') return null;
  const candidates = displays.filter(edgeOrientation);
  return candidates.length === 1 ? candidates[0] : null;
}

function describeDisplay(display) {
  const { width, height } = physicalSize(display);
  const name = display.label ? `${display.label} ` : '';
  return `${name}${width}x${height} (id ${display.id}, scale ${display.scaleFactor})`;
}

module.exports = { findEdgeDisplay, edgeOrientation, physicalSize, describeDisplay, EDGE_W, EDGE_H };
