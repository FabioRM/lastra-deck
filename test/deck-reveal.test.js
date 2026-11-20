'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');
const { DeckReveal, revealBounds, BLOCKED } = require('../src/main/deck-reveal');

class RestoreWindow extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.webContents = Object.assign(new EventEmitter(), { isCrashed: () => false, setWindowOpenHandler() {}, mainFrame: {} });
    this.visible = false;
  }

  setAlwaysOnTop() {}
  setBounds(bounds) { this.bounds = bounds; }
  showInactive() { this.visible = true; }
  hide() { this.visible = false; }
  isVisible() { return this.visible; }
  isDestroyed() { return this.destroyed === true; }
  destroy() { this.destroyed = true; this.emit('closed'); }
  async loadFile(file) { this.webContents.mainFrame.url = pathToFileURL(file).href; }
}

const landscape = { bounds: { x: -2560, y: 80, width: 2560, height: 720 }, workArea: { x: -2560, y: 80, width: 2560, height: 680 } };
const portrait = { bounds: { x: 1920, y: -200, width: 720, height: 2560 } };

test('desktop reveal follows the monitor work area and recovers after a disconnect', () => {
  const ipc = new EventEmitter();
  const reveal = new DeckReveal({ BrowserWindow: RestoreWindow, ipcMain: ipc, restore() { reveal.end(); } });
  const previousAction = reveal.guard();
  assert.equal(reveal.begin(null), false);
  assert.equal(reveal.begin(landscape), true);
  const handle = reveal.handle;
  assert.equal(handle.options.focusable, false);
  assert.deepEqual(revealBounds(landscape), { x: -172, y: 92, width: 160, height: 56 });
  assert.equal(previousAction(), BLOCKED.message);
  reveal.update(null);
  handle.emit('ready-to-show');
  assert.equal(handle.isVisible(), false);
  reveal.update(portrait);
  assert.equal(reveal.handle, handle);
  assert.deepEqual(handle.bounds, { x: 2468, y: -188, width: 160, height: 56 });
  assert.equal(handle.isVisible(), true);

  const sender = handle.webContents;
  ipc.emit('desktop-reveal:restore', { sender: {}, senderFrame: sender.mainFrame });
  ipc.emit('desktop-reveal:restore', { sender, senderFrame: { ...sender.mainFrame } });
  assert.equal(reveal.active, true);
  ipc.emit('desktop-reveal:restore', { sender, senderFrame: sender.mainFrame });
  assert.equal(reveal.active, false);
  assert.equal(handle.isDestroyed(), true);
  assert.equal(previousAction(), BLOCKED.message);
  assert.equal(reveal.guard()(), undefined);
  reveal.dispose();
  assert.equal(ipc.listenerCount('desktop-reveal:restore'), 0);
});

test('an unexpectedly closed restore control can recover the deck', () => {
  const reveal = new DeckReveal({ BrowserWindow: RestoreWindow, ipcMain: new EventEmitter(), restore() { reveal.end(); } });
  reveal.begin(portrait);
  reveal.handle.destroy();
  assert.equal(reveal.active, false);
  reveal.dispose();
});
