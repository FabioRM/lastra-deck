// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { SavedTitles, netflixUrl } = require('./app-view-netflix');

/** @type {Array<[string, string[], RegExp | ((url: URL) => string | null)]>} */
const SERVICES = [
  ['Netflix', ['www.netflix.com', 'netflix.com'], (url) => netflixUrl(url.href)],
  ['Prime Video', ['www.primevideo.com', 'primevideo.com'], /^\/(?:[a-z]{2}\/)?(?:detail|dp)\/(?:[a-z0-9_-]+\/)?[a-z0-9]+\/?$/i],
  ['Prime Video', ['www.amazon.com', 'www.amazon.it', 'www.amazon.co.uk', 'www.amazon.de', 'www.amazon.fr', 'www.amazon.es'],
    /^\/gp\/video\/detail\/[a-z0-9]+\/?$/i],
  ['Disney+', ['www.disneyplus.com', 'disneyplus.com'], /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:movies|series|play)\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)?\/?$/i],
  ['Apple TV', ['tv.apple.com'], /^\/(?:[a-z]{2}\/)?(?:movie|show|episode)\/[a-z0-9_-]+\/umc\.cmc\.[a-z0-9]+\/?$/i],
  ['Hulu', ['www.hulu.com', 'hulu.com'], /^\/(?:movie|series|watch)\/[a-z0-9_-]+\/?$/i],
  ['Max', ['www.max.com', 'max.com', 'play.max.com'],
    /^\/(?:[a-z]{2}\/)?(?:movies|shows|movie|show|video)\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)?\/?$/i],
  ['YouTube', ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be'], youtubeUrl],
];

const BROWSER_PATHS = {
  edge: ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
  chrome: ['Google', 'Chrome', 'Application', 'chrome.exe'],
  firefox: ['Mozilla Firefox', 'firefox.exe'],
};

function youtubeUrl(url) {
  const video = url.host === 'youtu.be' ? url.pathname.slice(1) : url.pathname === '/watch' ? url.searchParams.get('v') : null;
  return video && /^[a-z0-9_-]{11}$/i.test(video) ? 'https://www.youtube.com/watch?v=' + video : null;
}

function streamingUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const service = SERVICES.find(([, hosts]) => hosts.includes(url.host));
  if (!service) return null;
  const rule = service[2];
  if (typeof rule === 'function') return rule(url);
  return rule.test(url.pathname) ? url.origin + url.pathname : null;
}

class StreamingWatchlist extends SavedTitles {
  /**
   * @param {string} file
   * @param {{ platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv, exists?: (path: import('node:fs').PathLike) => boolean }
   *   & Record<string, any>} [options] Also accepts the base view options.
   */
  constructor(file, { platform = process.platform, env = process.env, exists = fs.existsSync, ...options } = {}) {
    super(file, { ...options, normalizeUrl: streamingUrl });
    this.platform = platform;
    this.env = env;
    this.exists = exists;
  }

  snapshot() {
    const result = super.snapshot();
    return { ...result, titles: this.titles.map(({ id, name, url }) => ({
      id, name, provider: SERVICES.find(([, hosts]) => hosts.includes(new URL(url).host))[0],
    })) };
  }

  openTitle(title) {
    const browser = title.browser.replace(/-app$/, '');
    if (this.platform === 'win32' && Object.hasOwn(BROWSER_PATHS, browser)) {
      const program = [this.env.LOCALAPPDATA, this.env.ProgramFiles, this.env['ProgramFiles(x86)']]
        .filter(Boolean).map((folder) => path.win32.join(folder, ...BROWSER_PATHS[browser]))
        .find((file) => this.exists(file));
      if (program) {
        const args = title.browser.endsWith('-app') ? ['--app=' + title.url] : [title.url];
        return this.run({ type: 'launch', target: program, args });
      }
    }
    return super.openTitle(title);
  }
}

module.exports = { StreamingWatchlist, streamingUrl };
