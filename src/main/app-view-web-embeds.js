// @ts-check
'use strict';

const { normalizeEmbeds, normalizeEntry } = require('./web-embed-config');
const { readMonitorConfig, openMonitorConfig } = require('./monitoring-config');

class WebEmbeds {
  /**
   * @param {string} file
   * @param {{ host?: { open: (entry: any) => any }, openConfig?: (file: string) => any, openExternal?: (url: string) => Promise<unknown> }} [options]
   */
  constructor(file, { host, openConfig, openExternal } = {}) {
    this.file = file;
    this.host = host;
    this.openConfig = openConfig;
    this.openExternal = openExternal;
    this.entries = [];
  }

  reload() {
    try {
      this.entries = readMonitorConfig(this.file, 'web embeds', normalizeEmbeds);
      this.error = null;
    } catch (err) {
      this.error = err.message;
    }
  }

  snapshot() {
    this.reload();
    return { error: this.error, embeds: this.entries.map(({ id, name, kind }) => ({ id, name, kind })) };
  }

  async change(command) {
    if (command?.action === 'configure') return openMonitorConfig(this.file, 'web embeds', 'embeds', this.openConfig);
    this.reload();
    const entry = this.entries.find(({ id }) => id === command?.id);
    if (!entry) throw new Error('The selected embed is unavailable');
    if (command.action === 'embed') return this.host.open(entry);
    if (command.action !== 'external') throw new Error('Unknown web embed command');
    await this.openExternal(entry.external);
    return { ok: true };
  }

  openSpotify({ id, name, url }) {
    return this.host.open(normalizeEntry({ id, name, kind: 'spotify', url }));
  }
}

module.exports = { WebEmbeds };
