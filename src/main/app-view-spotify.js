// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 64 * 1024;
const MAX_PLAYLISTS = 24;
const ID = /^[a-z0-9_-]{1,48}$/;

function playlistUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  const uri = /^spotify:playlist:([A-Za-z0-9]{22})$/i.exec(value.trim());
  if (uri) return 'https://open.spotify.com/playlist/' + uri[1];
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.host !== 'open.spotify.com' || url.username || url.password) return null;
  const match = /^\/(?:intl-[a-z]{2,3}(?:-[a-z]{2,4})?\/)?playlist\/([A-Za-z0-9]{22})\/?$/i.exec(url.pathname);
  return match ? 'https://open.spotify.com/playlist/' + match[1] : null;
}

function normalizePlaylists(value) {
  if (value?.version !== 1 || !Array.isArray(value.playlists) || value.playlists.length > MAX_PLAYLISTS) {
    throw new Error('Spotify playlists need version 1 and a list of up to ' + MAX_PLAYLISTS + ' entries.');
  }
  const ids = new Set();
  return value.playlists.map((item, index) => {
    const label = 'Playlist ' + (index + 1);
    if (typeof item?.id !== 'string' || !ID.test(item.id) || ids.has(item.id)) {
      throw new Error(label + ' needs a unique lowercase ID using letters, numbers, hyphens or underscores.');
    }
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name || name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error(label + ' needs a name up to 60 characters.');
    const url = playlistUrl(item.url);
    if (!url) throw new Error(label + ' needs a Spotify playlist link or URI.');
    ids.add(item.id);
    return { id: item.id, name, url };
  });
}

class SpotifyView {
  /**
   * @param {string} file
   * @param {{ openConfig?: (file: string) => any, openEmbed?: (target: any) => any, run?: (action: Record<string, any>, pageApps?: any, options?: Record<string, any>) => Promise<any>,
   *   account?: { snapshot: () => Promise<any>, change: (command: any) => any } }} [options]
   */
  constructor(file, { openConfig, openEmbed, run, account } = {}) {
    this.file = file;
    this.openConfig = openConfig;
    this.openEmbed = openEmbed;
    this.run = run;
    this.account = account;
    this.playlists = [];
  }

  snapshot() {
    const playlists = this.playlistSnapshot();
    return this.account ? this.account.snapshot().then((account) => ({ ...playlists, account })) : playlists;
  }

  playlistSnapshot() {
    let message;
    try {
      if (fs.statSync(this.file).size > MAX_BYTES) throw new Error('The Spotify playlists file exceeds 64 KiB.');
      const source = fs.readFileSync(this.file, 'utf8').replace(/^\uFEFF/, '');
      let parsed;
      try { parsed = JSON.parse(source); } catch { throw new Error('The Spotify playlists file contains invalid JSON.'); }
      this.playlists = normalizePlaylists(parsed);
    } catch (err) {
      if (err.code === 'ENOENT') this.playlists = [];
      else message = err.message;
    }
    return {
      status: message ? 'invalid' : 'ready', message,
      embedAvailable: Boolean(this.openEmbed),
      playlists: this.playlists.map(({ id, name }) => ({ id, name })),
    };
  }

  async change(command) {
    if (command?.action?.startsWith?.('account-') && this.account) return this.account.change(command);
    if (command?.action === 'configure') {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      try {
        fs.writeFileSync(this.file, '{\n  "version": 1,\n  "playlists": []\n}\n', { flag: 'wx' });
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
      return this.openConfig(this.file);
    }

    if (command?.action === 'open-playlist' || command?.action === 'embed-playlist') {
      this.playlistSnapshot();
      const target = this.playlists.find((entry) => entry.id === command.id);
      if (!target) throw new Error('The saved playlist is unavailable.');
      if (command.action === 'embed-playlist') {
        if (!this.openEmbed) throw new Error('Spotify embeds are unavailable. Open the playlist in your browser.');
        return this.openEmbed(target);
      }
      return this.run({ type: 'open', target: target.url });
    }
    throw new Error('Unknown Spotify command.');
  }
}

module.exports = { SpotifyView, normalizePlaylists, playlistUrl };
