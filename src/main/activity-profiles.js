// @ts-check
'use strict';

const path = require('node:path');
const { EventEmitter } = require('node:events');
const { ProfileStore } = require('./profile');

const ACTIVITIES = Object.freeze({ main: 'Main', work: 'Work', meeting: 'Meeting', gaming: 'Gaming', streaming: 'Streaming' });

function knownActivity(id) {
  return typeof id === 'string' && Object.hasOwn(ACTIVITIES, id);
}

class ActivityProfiles extends EventEmitter {
  constructor({ directory, stockDirectory, explicitFile }) {
    super();
    this.directory = directory;
    this.stockDirectory = stockDirectory;
    this.explicitFile = explicitFile;
    this.stores = new Map();
    this.current = null;
    this.revision = 0;
  }

  #storeFor(id) {
    if (this.stores.has(id)) return this.stores.get(id);
    const stockName = id === 'main' ? 'default.json' : `${id}.json`;
    const name = id === 'main' ? 'profile.json' : `profile-${id}.json`;
    const store = new ProfileStore({
      file: this.explicitFile ?? path.join(this.directory, name),
      defaultFile: path.join(this.stockDirectory, stockName),
    });
    store.on('change', () => {
      if (this.current?.store === store) this.emit('change');
    });
    store.on('error', (error) => {
      if (this.current?.store === store) this.emit('warning', error);
    });
    this.stores.set(id, store);
    return store;
  }

  activate(id) {
    if (!knownActivity(id) || (this.explicitFile && id !== 'main')) throw new Error('Unknown activity profile');
    if (this.current?.id === id) return this.current;
    const store = this.#storeFor(id);
    let warning = null;
    try {
      store.load({ upgradeStock: id === 'main' && !this.explicitFile });
    } catch (error) {
      warning = error.message;
      store.fallback();
    }
    store.watch();
    this.current?.store.close();
    this.current = { id, store, warning };
    this.revision++;
    return this.current;
  }

  activationTarget(id) {
    if (this.explicitFile || !knownActivity(id)) return null;
    const store = this.#storeFor(id);
    const saved = store.diskSnapshot();
    if (!saved.warning) return { version: saved.token, stock: false };
    if (saved.token !== 'missing' || store.backupVersions().length) return null;
    const defaults = new ProfileStore({ file: store.defaultFile }).diskSnapshot();
    return defaults.warning ? null : { version: defaults.token, stock: true };
  }

  snapshot() {
    if (this.explicitFile || !this.current) return null;
    return { active: this.current.id, choices: Object.entries(ACTIVITIES).map(([id, label]) => ({ id, label })) };
  }
}

module.exports = { ACTIVITIES, ActivityProfiles, knownActivity };
