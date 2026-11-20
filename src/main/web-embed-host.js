// @ts-check
'use strict';

const path = require('node:path');
const { once } = require('node:events');
const { allowedNavigation, allowsEmbedding } = require('./web-embed-config');
const { isPrivateHost } = require('./private-host');

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function sameHostAsEntry(url, entryUrl) {
  const host = hostOf(url);
  return Boolean(host) && host === hostOf(entryUrl ?? '');
}

const HTML = path.join(__dirname, '..', 'renderer', 'embed-window.html');
const PRELOAD = path.join(__dirname, '..', 'preload', 'embed-window.js');
const PARTITION = 'lastra-web-embed';
const TOOLBAR = 64;
const IDLE_MS = 5 * 60_000;
const REQUEST_WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 240;
const LIMIT_MESSAGE = 'The embed has reached its request limit.';

function embedBounds(owner) {
  const area = owner.getContentBounds();
  const width = Math.min(1_400, Math.max(1, area.width - 24));
  const height = Math.min(760, Math.max(1, area.height - 24));
  return { x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2), width, height };
}

function createRequestBudget({ now = () => performance.now(), limit = REQUESTS_PER_WINDOW, windowMs = REQUEST_WINDOW_MS } = {}) {
  let began = now();
  let used = 0;
  let total = 0;
  let blocked = 0;
  function resetIfExpired() {
    const time = now();
    if (time - began < windowMs) return;
    began = time;
    used = 0;
  }
  return {
    allow() {
      resetIfExpired();
      if (used < limit) {
        used++;
        total++;
        return true;
      }
      blocked++;
      return false;
    },
    snapshot() { resetIfExpired(); return { requests: used, limit, blocked, total }; },
  };
}

/**
 * @param {typeof Electron.session} session
 * @param {(details: { url: string, webContentsId?: number }) => boolean} [allowRequest]
 * @returns {Electron.Session}
 */
function isolatedSession(session, allowRequest = () => true) {
  const partition = session.fromPartition(PARTITION, { cache: false });
  partition.setPermissionCheckHandler(() => false);
  partition.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  partition.setDevicePermissionHandler(() => false);
  partition.setDisplayMediaRequestHandler((_request, callback) => callback(null));
  partition.on('will-download', (event) => event.preventDefault());
  partition.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !allowRequest(details) }));
  partition.webRequest.onHeadersReceived((details, callback) => {
    callback({ cancel: details.resourceType === 'mainFrame' && !allowsEmbedding(details.responseHeaders) });
  });
  return partition;
}

class WebEmbedHost {
  constructor({ BrowserWindow, WebContentsView, session, ipcMain, getOwner, openExternal, idleMs = IDLE_MS, requestBudget = createRequestBudget }) {
    this.BrowserWindow = BrowserWindow;
    this.WebContentsView = WebContentsView;
    this.session = session;
    this.ipcMain = ipcMain;
    this.getOwner = getOwner;
    this.openExternal = openExternal;
    this.idleMs = idleMs;
    this.requestBudget = requestBudget;
    this.storage = Promise.resolve();
    /** @type {Electron.Session | undefined} Created on first open. */
    this.partition;
    this.suspension = 0;
    this.command = (event, action) => {
      const current = this.current;
      if (!current || event.sender !== current.dialog.webContents || event.senderFrame !== current.dialog.webContents.mainFrame) return;
      if (action === 'close') current.dialog.close();
      if (action === 'external') {
        void this.openExternal(current.entry.external).then(() => {
          if (!current.dialog.isDestroyed()) current.dialog.close();
        }).catch(() => this.message(current, 'Could not open the external link.'));
      }
    };
    ipcMain.on('embed-window:command', this.command);
  }

  async open(entry) {
    if (this.suspended) throw new Error('Web embeds are unavailable in view-only mode');
    if (this.opening) throw new Error('An embed is opening');
    this.opening = true;
    try { return await this.show(entry, this.suspension); } finally { this.opening = false; }
  }

  setSuspended(suspended) {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    this.suspension++;
    if (suspended) this.current?.dialog.destroy();
  }

  clearStorage() {
    this.storage = this.storage.catch(() => {}).then(() => this.partition.clearStorageData());
    return this.storage;
  }

  usage() {
    const current = this.current;
    return current?.view ? { active: true, ...current.budget.snapshot() }
      : { active: false, ...this.lastUsage };
  }

  /** @param {{ url: string, webContentsId?: number }} details */
  allowRequest({ url, webContentsId }) {
    const current = this.current;
    if (!current?.view || (webContentsId > 0 && webContentsId !== current.view.webContents.id)) return false;
    if (/^(?:blob|data):/i.test(url)) return true;
    if (!/^(?:https|wss):/i.test(url)) return false;
    // An approved public page must not reach devices or services on this PC or the LAN.
    if (!sameHostAsEntry(url, current.entry?.url) && isPrivateHost(hostOf(url))) return false;
    if (current.budget.allow()) {
      if (current.status === LIMIT_MESSAGE) this.message(current, '');
      return true;
    }
    if (current.status !== LIMIT_MESSAGE) this.message(current, LIMIT_MESSAGE);
    return false;
  }

  async show(entry, suspension) {
    if (this.disposed) throw new Error('Web embeds are unavailable');
    const previous = this.current?.dialog;
    if (previous && !previous.isDestroyed()) {
      const closed = once(previous, 'closed');
      previous.destroy();
      await closed;
    }
    this.partition ??= isolatedSession(this.session, (details) => this.allowRequest(details));
    await this.clearStorage();
    if (suspension !== this.suspension) throw new Error('The embed was cancelled.');
    const owner = this.getOwner();
    if (!owner || owner.isDestroyed() || owner.isMinimized?.() || this.disposed) throw new Error('The deck window is unavailable');
    const dialog = new this.BrowserWindow({
      ...embedBounds(owner), parent: owner, show: false, frame: false,
      focusable: false, skipTaskbar: true, resizable: false, alwaysOnTop: true,
      backgroundColor: '#171c21',
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    const current = { entry, dialog, owner, status: 'Loading page…', budget: this.requestBudget() };
    this.current = current;
    const close = () => { if (!dialog.isDestroyed()) dialog.destroy(); };
    const armIdle = () => {
      clearTimeout(current.idleTimer);
      if (!dialog.isDestroyed() && !current.playing) current.idleTimer = setTimeout(() => {
        if (current.view?.webContents.isCurrentlyAudible?.()) armIdle();
        else close();
      }, this.idleMs).unref();
    };
    const follow = () => {
      if (!owner.isDestroyed() && !dialog.isDestroyed()) dialog.setBounds(embedBounds(owner));
    };
    function layout() {
      const { width, height } = dialog.getContentBounds();
      current.view?.setBounds({ x: 0, y: TOOLBAR, width, height: Math.max(0, height - TOOLBAR) });
    }
    owner.on('hide', close);
    owner.on('minimize', close);
    owner.on('closed', close);
    owner.on('move', follow);
    owner.on('resize', follow);
    dialog.on('resize', layout);
    dialog.once('closed', () => {
      if (this.current === current) {
        this.lastUsage = current.budget.snapshot();
        this.current = null;
      }
      clearTimeout(current.idleTimer);
      owner.removeListener('hide', close);
      owner.removeListener('minimize', close);
      owner.removeListener('closed', close);
      owner.removeListener('move', follow);
      owner.removeListener('resize', follow);
      if (current.view && !current.view.webContents.isDestroyed()) current.view.webContents.close();
      void this.clearStorage().catch(() => {});
    });
    dialog.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    dialog.webContents.on('will-navigate', (event) => event.preventDefault());
    dialog.webContents.once('did-finish-load', () => this.message(current));
    dialog.once('ready-to-show', () => dialog.showInactive());
    armIdle();

    try {
      await dialog.loadFile(HTML);
      if (dialog.isDestroyed()) return { ok: true };
      const view = new this.WebContentsView({ webPreferences: {
        session: this.partition, sandbox: true, contextIsolation: true, nodeIntegration: false,
        nodeIntegrationInSubFrames: false, nodeIntegrationInWorker: false, webviewTag: false, spellcheck: false, safeDialogs: true,
      } });
      current.view = view;
      const remote = view.webContents;
      remote.on('before-input-event', armIdle);
      remote.on('before-mouse-event', armIdle);
      remote.on('media-started-playing', () => { current.playing = true; armIdle(); });
      remote.on('media-paused', () => { current.playing = false; armIdle(); });
      remote.setWindowOpenHandler(() => ({ action: 'deny' }));
      const navigation = (event) => {
        if (event.isMainFrame !== false && !allowedNavigation(entry.url, event.url)) event.preventDefault();
      };
      remote.on('will-navigate', navigation);
      remote.on('will-redirect', navigation);
      remote.on('will-attach-webview', (event) => event.preventDefault());
      const unavailable = () => {
        if (dialog.isDestroyed() || current.view !== view) return;
        current.view = null;
        dialog.contentView.removeChildView(view);
        if (!remote.isDestroyed()) remote.close();
        current.playing = false;
        armIdle();
        this.message(current, 'The page could not load here. Open it in your browser.');
      };
      remote.on('render-process-gone', unavailable);
      dialog.contentView.addChildView(view);
      layout();
      void remote.loadURL(entry.url).then(() => {
        if (current.status === 'Loading page…') this.message(current, '');
      }).catch(unavailable);
      return { ok: true };
    } catch (err) {
      close();
      throw err;
    }
  }

  message(current, status = current.status) {
    current.status = status;
    if (!current.dialog.isDestroyed()) current.dialog.webContents.send('embed-window:state', { title: current.entry.name, status });
  }

  dispose() {
    this.disposed = true;
    this.ipcMain.removeListener('embed-window:command', this.command);
    this.current?.dialog.destroy();
  }
}

module.exports = { WebEmbedHost, embedBounds, isolatedSession, createRequestBudget };
