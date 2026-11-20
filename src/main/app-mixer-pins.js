// @ts-check
'use strict';

const fs = require('node:fs');
const { writeAtomic } = require('./write-atomic');

const isAppId = (id) => typeof id === 'string' && /^[0-9a-f]{64}$/.test(id);
const displayName = (name) => typeof name === 'string' ? name.trim().slice(0, 180) : '';

function loadPins(file, log) {
  const pins = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (raw?.version !== 1 || !Array.isArray(raw.pins)) throw new Error('Unrecognized audio pins file');
    for (const pin of raw.pins) {
      const name = displayName(pin?.name);
      if (isAppId(pin?.id) && name && !pins.has(pin.id)) pins.set(pin.id, name);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') log('Could not read app mixer pins:', err.message);
  }
  return pins;
}

class AppMixerPins {
  constructor(file, log = () => {}) {
    this.file = file;
    this.pins = loadPins(file, log);
  }

  withStatus(apps) {
    const byId = new Map(apps.map((app) => [app.id, app]));
    const pinned = [...this.pins].map(([id, name]) => {
      const live = byId.get(id);
      return live ? { ...live, pinned: true, online: true } : { id, name, pinned: true, online: false };
    });
    const otherApps = apps.filter((app) => !this.pins.has(app.id))
      .map((app) => ({ ...app, pinned: false, online: true }));
    return [...pinned, ...otherApps];
  }

  set(id, pinned, listApps) {
    if (!isAppId(id) || typeof pinned !== 'boolean') throw new Error('Invalid app mixer pin');
    if (this.pins.has(id) === pinned) return;

    const next = new Map(this.pins);
    if (pinned) {
      const app = listApps().find((entry) => entry.id === id && entry.canPin);
      const name = displayName(app?.name);
      if (!name) throw new Error('A stable audio session is needed to pin this app');
      next.set(id, name);
    } else {
      next.delete(id);
    }

    const pins = [...next].map(([id, name]) => ({ id, name }));
    writeAtomic(this.file, JSON.stringify({ version: 1, pins }, null, 2) + '\n');
    this.pins = next;
  }
}

module.exports = { AppMixerPins, isAppId };
