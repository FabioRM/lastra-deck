// @ts-check
'use strict';

// Background updates for installed (NSIS) builds through electron-updater and GitHub Releases.
// The deck is a touch surface without a keyboard nearby, so this module never opens a dialog or
// steals focus: it checks quietly, downloads in the background, and installs when Lastra quits.
// The tray can show the state and offer "Check for updates" or "Restart to update".

const fs = require('node:fs');
const path = require('node:path');

const STARTUP_DELAY_MS = 90_000;
const INTERVAL_MS = 4 * 60 * 60 * 1000;
const UPDATE_CONFIG = 'app-update.yml';

/**
 * @typedef {'disabled' | 'idle' | 'checking' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'} UpdateState
 * @typedef {{ state: UpdateState, reason?: string, version?: string, percent?: number,
 *   message?: string, checkedAt?: number }} UpdateStatus
 * @typedef {{ label: string, enabled: boolean, click?: () => void }} UpdateMenuItem
 */

/** @param {unknown} value */
function versionOf(value) {
  const version = value && typeof value === 'object' ? /** @type {{ version?: unknown }} */ (value).version : undefined;
  return typeof version === 'string' && version.length <= 64 ? version : undefined;
}

/** @param {unknown} error */
function messageOf(error) {
  const text = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  // electron-updater errors can include long HTTP bodies; keep the first line for the tray and log.
  return text.split(/\r?\n/, 1)[0].slice(0, 200);
}

/** The installer writes app-update.yml next to app.asar / app; an unpacked `dist:dir` build has none. */
function defaultHasUpdateConfig() {
  try {
    // Electron adds process.resourcesPath; the Node typings used for type checks do not declare it.
    const resources = /** @type {{ resourcesPath?: string }} */ (/** @type {unknown} */ (process)).resourcesPath;
    return Boolean(resources) && fs.statSync(path.join(resources, UPDATE_CONFIG)).isFile();
  } catch {
    return false;
  }
}

/**
 * @param {object} options
 * @param {{ isPackaged: boolean }} options.app Electron `app`.
 * @param {(...args: unknown[]) => void} options.log Lastra logger.
 * @param {boolean} [options.preview] True for `--preview` and other one-shot runs.
 * @param {boolean} [options.supported] Whether this installer has a configured update feed.
 * @param {NodeJS.ProcessEnv} [options.env]
 * @param {() => any} [options.loadAutoUpdater] Returns electron-updater's `autoUpdater` (injected in tests).
 * @param {() => boolean} [options.hasUpdateConfig]
 * @param {(status: UpdateStatus) => void} [options.onChange] Called on every state change, e.g. to rebuild the tray menu.
 * @param {{ setTimeout: typeof setTimeout, clearTimeout: typeof clearTimeout,
 *   setInterval: typeof setInterval, clearInterval: typeof clearInterval }} [options.timers]
 * @param {() => number} [options.now]
 * @param {number} [options.startupDelayMs]
 * @param {number} [options.intervalMs]
 */
function createUpdater({
  app, log, preview = false, supported = true, env = process.env,
  loadAutoUpdater = () => require('electron-updater').autoUpdater,
  hasUpdateConfig = defaultHasUpdateConfig, onChange = () => {},
  timers = { setTimeout, clearTimeout, setInterval, clearInterval }, now = Date.now,
  startupDelayMs = STARTUP_DELAY_MS, intervalMs = INTERVAL_MS,
}) {
  /** @type {string | null} */
  let disabledReason = null;
  if (!app.isPackaged) disabledReason = 'not-packaged';
  else if (preview) disabledReason = 'preview';
  else if (!supported) disabledReason = 'unsupported-platform';
  else if (env.LASTRA_DISABLE_UPDATES === '1') disabledReason = 'LASTRA_DISABLE_UPDATES';
  else if (!hasUpdateConfig()) disabledReason = 'no-update-config';

  /** @type {UpdateStatus} */
  let status = disabledReason ? { state: 'disabled', reason: disabledReason } : { state: 'idle' };
  /** @type {any} */
  let updater = null;
  /** @type {Promise<UpdateStatus> | null} */
  let pending = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let startupTimer = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let intervalTimer = null;
  let lastLoggedPercent = -1;

  /** @param {UpdateStatus} next */
  function set(next) {
    status = { ...next, ...(status.checkedAt && !next.checkedAt ? { checkedAt: status.checkedAt } : {}) };
    try { onChange({ ...status }); } catch (error) { log('[updater] status listener failed:', messageOf(error)); }
  }

  function ensureUpdater() {
    if (updater) return updater;
    const instance = loadAutoUpdater();
    instance.autoDownload = true;
    instance.autoInstallOnAppQuit = true;
    instance.allowPrerelease = false;
    instance.allowDowngrade = false;
    instance.logger = {
      info: (/** @type {unknown} */ message) => log('[updater]', message),
      warn: (/** @type {unknown} */ message) => log('[updater] warning:', message),
      error: (/** @type {unknown} */ message) => log('[updater] error:', messageOf(message)),
      debug: () => {},
    };
    instance.on('checking-for-update', () => { if (status.state !== 'checking') set({ state: 'checking' }); });
    instance.on('update-available', (/** @type {unknown} */ info) => {
      lastLoggedPercent = -1;
      set({ state: 'downloading', version: versionOf(info), percent: 0, checkedAt: now() });
    });
    instance.on('update-not-available', () => set({ state: 'up-to-date', checkedAt: now() }));
    instance.on('download-progress', (/** @type {{ percent?: number }} */ progress) => {
      if (status.state === 'downloaded') return;
      const percent = Math.max(0, Math.min(100, Math.floor(Number(progress?.percent) || 0)));
      // Rebuild the tray at most every 10% to keep menu churn low on slow connections.
      if (percent - lastLoggedPercent < 10 && percent < 100) return;
      lastLoggedPercent = percent;
      set({ state: 'downloading', version: status.version, percent });
    });
    instance.on('update-downloaded', (/** @type {unknown} */ info) => {
      const version = versionOf(info) ?? status.version;
      log('[updater] update', version ?? '(unknown version)', 'downloaded; it installs when Lastra quits.');
      set({ state: 'downloaded', version });
    });
    instance.on('error', (/** @type {unknown} */ error) => {
      // A failed check or download leaves an already downloaded update in place.
      if (status.state === 'downloaded') return;
      set({ state: 'error', message: messageOf(error), checkedAt: now() });
    });
    updater = instance;
    return instance;
  }

  /** @returns {Promise<UpdateStatus>} */
  function checkNow() {
    if (status.state === 'disabled' || status.state === 'downloaded' || status.state === 'downloading') {
      return Promise.resolve({ ...status });
    }
    if (pending) return pending;
    pending = (async () => {
      try {
        const instance = ensureUpdater();
        set({ state: 'checking' });
        const result = await instance.checkForUpdates();
        // Download failures are reported through the 'error' event; never leave the promise unhandled.
        result?.downloadPromise?.catch?.(() => {});
        if (status.state === 'checking') {
          set(result?.isUpdateAvailable
            ? { state: 'downloading', version: versionOf(result.updateInfo), percent: 0, checkedAt: now() }
            : { state: 'up-to-date', checkedAt: now() });
        }
      } catch (error) {
        if (status.state !== 'downloaded') {
          log('[updater] check failed:', messageOf(error));
          set({ state: 'error', message: messageOf(error), checkedAt: now() });
        }
      } finally {
        pending = null;
      }
      return { ...status };
    })();
    return pending;
  }

  function scheduledCheck() {
    void checkNow();
  }

  /** Begin the delayed first check and the periodic checks. Safe to call more than once. */
  function start() {
    if (status.state === 'disabled') {
      log('[updater] automatic updates are off:', status.reason);
      return false;
    }
    if (startupTimer || intervalTimer) return true;
    startupTimer = timers.setTimeout(() => {
      startupTimer = null;
      scheduledCheck();
    }, startupDelayMs);
    intervalTimer = timers.setInterval(scheduledCheck, intervalMs);
    startupTimer?.unref?.();
    intervalTimer?.unref?.();
    return true;
  }

  function stop() {
    if (startupTimer) timers.clearTimeout(startupTimer);
    if (intervalTimer) timers.clearInterval(intervalTimer);
    startupTimer = intervalTimer = null;
  }

  /** Quit now and run the downloaded installer silently, then start Lastra again. */
  function restartToUpdate() {
    if (status.state !== 'downloaded' || !updater) return false;
    log('[updater] restarting to install', status.version ?? 'the downloaded update');
    stop();
    updater.quitAndInstall(true, true);
    return true;
  }

  /**
   * A tray menu item, or null while updates are off because this is a dev, preview, or unpacked build.
   * @returns {UpdateMenuItem | null}
   */
  function menuItem() {
    switch (status.state) {
      case 'disabled':
        return status.reason === 'LASTRA_DISABLE_UPDATES' ? { label: 'Updates turned off', enabled: false } : null;
      case 'checking':
        return { label: 'Checking for updates…', enabled: false };
      case 'downloading':
        return { label: `Downloading update${status.version ? ' ' + status.version : ''} (${status.percent ?? 0}%)`, enabled: false };
      case 'downloaded':
        return { label: `Restart to update${status.version ? ' to ' + status.version : ''}`, enabled: true, click: () => void restartToUpdate() };
      case 'up-to-date':
        return { label: 'Check for updates (up to date)', enabled: true, click: () => void checkNow() };
      case 'error':
        return { label: 'Check for updates (last check failed)', enabled: true, click: () => void checkNow() };
      default:
        return { label: 'Check for updates', enabled: true, click: () => void checkNow() };
    }
  }

  return { start, stop, checkNow, restartToUpdate, menuItem, status: () => ({ ...status }) };
}

module.exports = { createUpdater, STARTUP_DELAY_MS, INTERVAL_MS };
