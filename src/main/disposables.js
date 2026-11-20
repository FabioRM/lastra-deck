// @ts-check
'use strict';

/**
 * A list of teardown steps for the main process. Each service registers its own cleanup right after it
 * starts, so every exit path (a normal quit, a lost XENEON EDGE, a failed startup) releases the same set.
 * Steps run in reverse registration order, like nested `finally` blocks, and one failing step never stops
 * the rest.
 *
 * @param {(...args: any[]) => void} log
 */
function createDisposables(log) {
  /** @type {{ name: string, dispose: () => unknown }[]} */
  let entries = [];

  return {
    /**
     * @param {string} name A short label for the log when the step fails.
     * @param {() => unknown} dispose
     */
    add(name, dispose) {
      if (typeof dispose !== 'function') throw new TypeError(`Teardown for ${name} must be a function.`);
      entries.push({ name, dispose });
    },

    /** Runs and forgets every registered step, newest first. Steps added later run on the next call. */
    dispose() {
      const pending = entries;
      entries = [];
      for (let index = pending.length - 1; index >= 0; index--) {
        const { name, dispose } = pending[index];
        try {
          const result = dispose();
          if (result && typeof (/** @type {any} */ (result).catch) === 'function') {
            /** @type {Promise<unknown>} */ (result).catch((err) => log(`Stopping ${name} failed:`, err?.stack ?? err));
          }
        } catch (err) {
          log(`Stopping ${name} failed:`, err?.stack ?? err);
        }
      }
    },

    get size() {
      return entries.length;
    },
  };
}

module.exports = { createDisposables };
