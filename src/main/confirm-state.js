// @ts-check
'use strict';

const { setTimeout: wait } = require('node:timers/promises');

async function confirmState(read, message, { timeoutMs = 5000, intervalMs = 200 } = {}) {
  const controller = new AbortController();
  const { signal } = controller;
  const poll = async () => {
    for (;;) {
      signal.throwIfAborted();
      if (await read()) return;
      await wait(intervalMs, undefined, { signal });
    }
  };
  const timeout = wait(timeoutMs, undefined, { signal }).then(() => { throw new Error(message); });
  try {
    await Promise.race([poll(), timeout]);
  } finally {
    controller.abort();
  }
}

module.exports = { confirmState };
