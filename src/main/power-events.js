// @ts-check
'use strict';

/**
 * Subscribers to Windows power and session events, in the order they run. The deck session has to change
 * before agent access reads `deckSession.blocked` on unlock, and the display watcher runs last so it sees
 * the unblocked deck. The Pomodoro clock is restored first on resume, as it always has been, and the timers follow it.
 */
const POWER_SUBSCRIBERS = Object.freeze(['pomodoro', 'timers', 'soundboard', 'deck-session', 'power-source', 'agent-session', 'deck-display']);

/**
 * Attaches one listener per power event to Electron's `powerMonitor` and dispatches to the subscribers in a
 * fixed order, whatever order the services start in. A failing subscriber is logged and the rest still run.
 *
 * @param {{ on(event: string, listener: (...args: any[]) => void): unknown,
 *   removeListener(event: string, listener: (...args: any[]) => void): unknown }} powerMonitor
 * @param {{ log: (...args: any[]) => void, order?: readonly string[] }} options
 */
function createPowerEvents(powerMonitor, { log, order = POWER_SUBSCRIBERS }) {
  /** @type {Map<string, { rank: number, subscriber: string, listener: (...args: any[]) => void }[]>} */
  const handlers = new Map();
  /** @type {Map<string, (...args: any[]) => void>} */
  const attached = new Map();

  function dispatch(event, args) {
    for (const { subscriber, listener } of [...(handlers.get(event) ?? [])]) {
      try {
        listener(...args);
      } catch (err) {
        log(`Power event ${event} (${subscriber}) failed:`, err?.stack ?? err);
      }
    }
  }

  /**
   * @param {string} subscriber One of the names in the dispatch order.
   * @param {string} event An Electron powerMonitor event such as `resume` or `lock-screen`.
   * @param {(...args: any[]) => void} listener
   */
  function on(subscriber, event, listener) {
    const rank = order.indexOf(subscriber);
    if (rank < 0) throw new Error(`Unknown power event subscriber ${subscriber}.`);
    const list = handlers.get(event) ?? [];
    // Stable insert: equal ranks keep their registration order.
    const index = list.findIndex((entry) => entry.rank > rank);
    list.splice(index < 0 ? list.length : index, 0, { rank, subscriber, listener });
    handlers.set(event, list);
    if (!attached.has(event)) {
      const forward = (...args) => dispatch(event, args);
      attached.set(event, forward);
      powerMonitor.on(event, forward);
    }
  }

  /**
   * @param {string} event
   * @param {(...args: any[]) => void} listener
   */
  function off(event, listener) {
    const list = handlers.get(event);
    const index = list?.findIndex((entry) => entry.listener === listener) ?? -1;
    if (index >= 0) list.splice(index, 1);
  }

  return {
    on,
    off,
    /**
     * An `on`/`removeListener` view for modules that expect Electron's powerMonitor.
     * @param {string} subscriber
     */
    subscriber(subscriber) {
      const view = {
        /** @param {string} event @param {(...args: any[]) => void} listener */
        on(event, listener) { on(subscriber, event, listener); return view; },
        /** @param {string} event @param {(...args: any[]) => void} listener */
        removeListener(event, listener) { off(event, listener); return view; },
      };
      return view;
    },
    dispose() {
      for (const [event, forward] of attached) powerMonitor.removeListener(event, forward);
      attached.clear();
      handlers.clear();
    },
  };
}

module.exports = { createPowerEvents, POWER_SUBSCRIBERS };
