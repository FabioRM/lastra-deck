// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 64 * 1024;
const ID = /^[a-z0-9_-]{1,48}$/;
const BROWSERS = new Set(['default', 'edge', 'chrome', 'firefox', 'edge-app', 'chrome-app']);
const NETFLIX_APP_ID = '4DF9E0F8.Netflix_mcm4njqhnhss8!Netflix.App';

function netflixUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || !['netflix.com', 'www.netflix.com'].includes(url.host) || url.username || url.password) return null;
  const match = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(title|watch)\/([0-9]{1,12})\/?$/i.exec(url.pathname);
  return match ? 'https://www.netflix.com/' + match[1].toLowerCase() + '/' + match[2] : null;
}

function normalizeTitles(data, normalizeUrl = netflixUrl) {
  if (data?.version !== 1 || !Array.isArray(data.titles) || data.titles.length > 32) {
    throw new Error('Saved titles need version 1 and a list of up to 32 entries.');
  }
  const ids = new Set();
  return data.titles.map((item, index) => {
    if (!item || typeof item.id !== 'string' || !ID.test(item.id) || ids.has(item.id)) {
      throw new Error('Title ' + (index + 1) + ' needs a unique lowercase ID.');
    }
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const url = normalizeUrl(item.url);
    const browser = item.browser ?? 'default';
    if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name) || !url) {
      throw new Error('Title ' + (index + 1) + ' needs a name and a supported title link.');
    }
    if (!BROWSERS.has(browser)) throw new Error('Title ' + (index + 1) + ' has an unsupported browser.');
    ids.add(item.id);
    return { id: item.id, name, url, browser };
  });
}

class SavedTitles {
  /**
   * @param {string} file
   * @param {{ openConfig?: (file: string) => any, run?: (action: Record<string, any>, pageApps?: any, options?: Record<string, any>) => Promise<any>, normalizeUrl?: (value: any) => string | null }} [options]
   */
  constructor(file, { openConfig, run, normalizeUrl = netflixUrl } = {}) {
    this.file = file;
    this.openConfig = openConfig;
    this.run = run;
    this.normalizeUrl = normalizeUrl;
    this.titles = [];
  }

  snapshot() {
    let message = null;
    try {
      if (fs.statSync(this.file).size > MAX_BYTES) throw new Error('The saved titles file exceeds 64 KiB.');
      this.titles = normalizeTitles(JSON.parse(fs.readFileSync(this.file, 'utf8').replace(/^\uFEFF/, '')), this.normalizeUrl);
    } catch (err) {
      if (err.code === 'ENOENT') this.titles = [];
      else message = err instanceof SyntaxError ? 'The saved titles file contains invalid JSON.' : err.message;
    }
    return { message, titles: this.titles.map(({ id, name }) => ({ id, name })) };
  }

  async change(command) {
    if (command?.action === 'configure') {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      try { fs.writeFileSync(this.file, '{\n  "version": 1,\n  "titles": []\n}\n', { flag: 'wx' }); } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
      return this.openConfig(this.file);
    }
    if (command?.action === 'open-title') {
      this.snapshot();
      const title = this.titles.find(({ id }) => id === command.id);
      if (!title) throw new Error('The saved title is unavailable.');
      return this.openTitle(title);
    }
    throw new Error('Unknown saved title command.');
  }

  openTitle(title) {
    return this.run({ type: 'open', target: title.url });
  }
}

class NetflixView extends SavedTitles {
  /**
   * @param {string} file
   * @param {{ createWindows?: () => any, platform?: NodeJS.Platform } & Record<string, any>} [options] Also accepts SavedTitles options.
   */
  constructor(file, { createWindows = () => null, platform = process.platform, ...options } = {}) {
    super(file, options);
    this.platform = platform;
    this.createWindows = createWindows;
    /** @type {{ foreground: (options: { appId: boolean, title: boolean }) => any } | null | undefined} */
    this.windows;
  }

  canSendShortcut() {
    if (this.platform !== 'win32') return false;
    try {
      this.windows ??= this.createWindows();
      const active = this.windows?.foreground({ appId: true, title: false });
      return active?.appId?.toLowerCase() === NETFLIX_APP_ID.toLowerCase();
    } catch {
      return false;
    }
  }

  snapshot() {
    return { ...super.snapshot(), windowsApp: this.platform === 'win32', shortcutAvailable: this.canSendShortcut() };
  }

  async change(command) {
    if (command?.action === 'open-app') {
      if (this.platform !== 'win32') throw new Error('The Netflix Windows app is unavailable on this system.');
      return this.run({ type: 'launch', target: '%WINDIR%\\explorer.exe', args: ['shell:AppsFolder\\' + NETFLIX_APP_ID] });
    }
    if (command?.action === 'shortcut') {
      const keys = new Map([['toggle', 'Space'], ['exit-fullscreen', 'Esc']]).get(command.key);
      if (!keys || !this.canSendShortcut()) throw new Error('Bring the identified Netflix Windows app forward before using this shortcut.');
      return this.run({ type: 'hotkey', keys });
    }
    return super.change(command);
  }
}

module.exports = { NETFLIX_APP_ID, NetflixView, SavedTitles, netflixUrl, normalizeTitles };
