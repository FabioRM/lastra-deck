// @ts-check
'use strict';

const path = require('node:path');
const { execFile } = require('node:child_process');
const { findEdgeDisplay } = require('./display');
const { readTouchDevices } = require('./touch-win32');

function sameBounds(a, b) {
  return a && b && ['x', 'y', 'width', 'height'].every((key) => Math.abs(a[key] - b[key]) <= 2);
}

function describeBounds({ x, y, width, height }) {
  return `${width}×${height} px, origin (${x}, ${y})`;
}

function summarizeTouch(devices, displays, edgeId) {
  const edge = displays.find(({ id }) => id === edgeId);
  const layout = edge ? `XENEON EDGE · ${describeBounds(edge.physical)} · ${edge.dpi} DPI` : 'XENEON EDGE not detected';
  if (!devices.length) return { message: 'No touchscreen detected', detail: layout };

  let edgeMapped = false;
  const description = devices.map((device) => {
    const target = device.mappedBounds ?? device.monitorBounds;
    const display = displays.find(({ physical }) => sameBounds(physical, target));
    if (edge && display?.id === edge.id && sameBounds(edge.physical, device.mappedBounds)) edgeMapped = true;
    const name = display?.label || device.monitorName || 'Unknown monitor';
    const bounds = target ? ` · ${describeBounds(target)}` : '';
    const dpi = display ? ` · ${display.dpi} DPI` : '';
    return `${device.name} → ${name}${bounds}${dpi}`;
  });
  return {
    message: edgeMapped ? 'Touch is mapped to the XENEON EDGE' : 'Check the XENEON EDGE touch mapping',
    detail: [layout, ...description].join('\n'),
  };
}

function openTouchSetup(dialog) {
  const control = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'control.exe');
  execFile(control, ['/name', 'Microsoft.TabletPCSettings'], (err) => {
    if (err) dialog.showErrorBox('Windows touch setup', err.message);
  });
}

async function showTouchDiagnostics({ screen, dialog, clipboard }) {
  let report;
  try {
    const displays = screen.getAllDisplays();
    report = summarizeTouch(readTouchDevices(), displays.map((display) => ({
      ...display,
      physical: screen.dipToScreenRect(null, display.bounds),
      dpi: Math.round(display.scaleFactor * 96),
    })), findEdgeDisplay(displays)?.id);
  } catch (err) {
    report = { message: 'Touch diagnostics unavailable', detail: err.message };
  }
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Lastra · Touch diagnostics',
    ...report,
    buttons: ['Close', 'Configure Windows touch', 'Copy diagnostics'],
    cancelId: 0,
    defaultId: 0,
  });
  if (response === 1) openTouchSetup(dialog);
  if (response === 2) clipboard.writeText(`${report.message}\n${report.detail}`);
}

module.exports = { openTouchSetup, showTouchDiagnostics, summarizeTouch, sameBounds };
