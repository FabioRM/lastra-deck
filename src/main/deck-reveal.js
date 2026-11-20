// @ts-check
'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');

const HTML = path.join(__dirname, '..', 'restore', 'index.html');
const PRELOAD = path.join(__dirname, '..', 'preload', 'deck-reveal.js');
const RESTORE = 'desktop-reveal:restore';
const BLOCKED = Object.freeze({ ok: false, unavailable: true, message: 'Restore Lastra before using the deck.' });

function revealBounds(display) {
  const area = display.workArea ?? display.bounds;
  const margin = Math.min(12, Math.floor(Math.min(area.width, area.height) / 4));
  const width = Math.min(160, area.width - 2 * margin);
  const height = Math.min(56, area.height - 2 * margin);
  return { x: area.x + area.width - width - margin, y: area.y + margin, width, height };
}

class DeckReveal {
  constructor({ BrowserWindow, ipcMain, restore }) {
    this.BrowserWindow = BrowserWindow;
    this.ipcMain = ipcMain;
    this.restore = restore;
    this.active = false;
    this.revision = 0;
    this.onRestore = (event) => {
      const contents = this.handle?.webContents;
      if (contents && event.sender === contents && event.senderFrame === contents.mainFrame
          && event.senderFrame?.url === pathToFileURL(HTML).href) this.restore();
    };
    ipcMain.on(RESTORE, this.onRestore);
  }

  begin(display) {
    if (this.active || !display) return false;
    this.active = true;
    this.revision++;
    try { this.update(display); }
    catch (error) { this.end(); throw error; }
    return true;
  }

  update(display) {
    if (!this.active) return;
    this.display = display;
    if (!display) {
      if (this.handle && !this.handle.isDestroyed()) this.handle.hide();
      return;
    }
    const bounds = revealBounds(display);
    if (this.handle && !this.handle.isDestroyed() && !this.handle.webContents.isCrashed()) {
      this.handle.setBounds(bounds);
      if (this.ready && !this.handle.isVisible()) this.handle.showInactive();
      return;
    }
    const previous = this.handle;
    this.handle = null;
    if (previous && !previous.isDestroyed()) previous.destroy();
    this.ready = false;
    const handle = new this.BrowserWindow({
      ...bounds, show: false, title: 'Restore Lastra', frame: false, focusable: false, alwaysOnTop: true, skipTaskbar: true,
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
      backgroundColor: '#1c2530', webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    this.handle = handle;
    handle.setAlwaysOnTop(true, 'screen-saver');
    handle.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    handle.webContents.on('will-navigate', (event) => event.preventDefault());
    const recover = () => { if (this.active && this.handle === handle) this.restore(); };
    handle.webContents.on('render-process-gone', recover);
    handle.once('closed', recover);
    handle.once('ready-to-show', () => {
      if (!this.active || this.handle !== handle) return;
      this.ready = true;
      if (this.display) handle.showInactive();
    });
    void handle.loadFile(HTML).catch(recover);
  }

  guard() {
    const revision = this.revision;
    return () => this.active || this.revision !== revision ? BLOCKED.message : undefined;
  }

  end() {
    if (this.active) this.revision++;
    this.active = false;
    this.display = null;
    const handle = this.handle;
    this.handle = null;
    if (handle && !handle.isDestroyed()) handle.destroy();
  }

  dispose() {
    this.end();
    this.ipcMain.removeListener(RESTORE, this.onRestore);
  }
}

module.exports = { DeckReveal, revealBounds, BLOCKED };
