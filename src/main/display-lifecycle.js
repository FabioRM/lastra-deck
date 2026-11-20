// @ts-check
'use strict';

const SCREEN_EVENTS = ['display-added', 'display-removed', 'display-metrics-changed'];
const BOUNDS_FIELDS = ['x', 'y', 'width', 'height'];

function sameBounds(left, right) {
  // Electron can round a Windows window edge by one DIP when reading it back.
  return BOUNDS_FIELDS.every((field) => Math.abs(left[field] - right[field]) <= 1);
}

function restoreDeckWindow(window, display, { previous, ready }) {
  const moved = previous?.id !== display.id || previous?.scaleFactor !== display.scaleFactor
    || previous?.rotation !== display.rotation || !sameBounds(window.getBounds(), display.bounds);
  if (moved) window.setBounds(display.bounds);
  if (ready) {
    window.setAlwaysOnTop(true, 'screen-saver');
    if (moved || !window.isVisible() || window.isMinimized()) window.showInactive();
  }
  return moved;
}

function watchDeckDisplay({ screen, powerMonitor, select, restore, missing, settleMs = 600, wakeMs = 2200 }) {
  let suspended = false;
  let stopped = false;
  let topologyTimer;
  let wakeTimer;

  function reconcile() {
    if (stopped || suspended) return;
    const display = select();
    if (display) restore(display);
    else missing();
  }

  function schedule() {
    if (stopped || suspended || wakeTimer) return;
    clearTimeout(topologyTimer);
    topologyTimer = setTimeout(reconcile, settleMs);
  }

  function clearTimers() {
    clearTimeout(topologyTimer);
    clearTimeout(wakeTimer);
    wakeTimer = null;
  }

  function suspend() {
    suspended = true;
    clearTimers();
  }

  function resume() {
    suspended = false;
    clearTimers();
    wakeTimer = setTimeout(() => {
      wakeTimer = null;
      reconcile();
    }, wakeMs);
  }

  for (const event of SCREEN_EVENTS) screen.on(event, schedule);
  powerMonitor.on('suspend', suspend);
  powerMonitor.on('resume', resume);
  powerMonitor.on('unlock-screen', schedule);
  return {
    schedule,
    stop() {
      stopped = true;
      clearTimers();
      for (const event of SCREEN_EVENTS) screen.removeListener(event, schedule);
      powerMonitor.removeListener('suspend', suspend);
      powerMonitor.removeListener('resume', resume);
      powerMonitor.removeListener('unlock-screen', schedule);
    },
  };
}

module.exports = { restoreDeckWindow, watchDeckDisplay };
