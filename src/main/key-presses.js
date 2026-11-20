// @ts-check
'use strict';

const IGNORED = Object.freeze({ ok: true, ignored: true });

class KeyPresses {
  #active = new Map();

  async run(id, policy, execute) {
    const active = this.#active.get(id);
    if (active) {
      if (policy !== 'queue-one' || active.pending) return IGNORED;
      return new Promise((resolve) => { active.pending = { execute, resolve }; });
    }

    const entry = {};
    this.#active.set(id, entry);
    try {
      return await execute();
    } finally {
      this.#active.delete(id);
      if (entry.pending) entry.pending.resolve(this.run(id, 'ignore', entry.pending.execute));
    }
  }

  cancelPending(id) {
    const entries = id === undefined ? this.#active.values() : [this.#active.get(id)];
    for (const entry of entries) {
      if (!entry) continue;
      entry.pending?.resolve(IGNORED);
      entry.pending = undefined;
    }
  }
}

module.exports = { KeyPresses, IGNORED };
