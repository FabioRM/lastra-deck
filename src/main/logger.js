// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { format } = require('node:util');

/**
 * Console logger that also appends to a small rotating file, so a deck started from
 * Windows sign-in (without a console) still leaves a trace of what went wrong.
 * The file stays on this PC: it may contain paths, so it is never part of the diagnostics export.
 */
/**
 * @param {{ directory?: string | (() => string | null | undefined), file?: string, maxBytes?: number, recent?: number, console?: Console }} [options]
 */
function createLogger({ directory, file = 'lastra.log', maxBytes = 1024 * 1024, recent = 200, console: output = console } = {}) {
  const lines = [];
  let target = null;
  let disabled = false;

  function resolveTarget() {
    if (target || disabled) return target;
    try {
      const dir = typeof directory === 'function' ? directory() : directory;
      if (!dir) return null;
      fs.mkdirSync(dir, { recursive: true });
      target = path.join(dir, file);
    } catch {
      disabled = true;
    }
    return target;
  }

  function append(line) {
    const destination = resolveTarget();
    if (!destination) return;
    try {
      const size = fs.statSync(destination, { throwIfNoEntry: false })?.size ?? 0;
      if (size > maxBytes) fs.renameSync(destination, `${destination}.1`);
      fs.appendFileSync(destination, line + '\n', 'utf8');
    } catch {
      // Logging must never take the deck down; keep the in-memory copy only.
    }
  }

  function log(...args) {
    const line = `${new Date().toISOString()} ${format(...args)}`;
    lines.push(line);
    if (lines.length > recent) lines.shift();
    output.log('[lastra]', ...args);
    append(line);
  }

  log.recent = () => [...lines];
  log.file = () => resolveTarget();
  return log;
}

/** Run a periodic callback without letting one failing tick become an uncaught exception. */
function guarded(log, name, fn) {
  let reported = -Infinity;
  return function guardedTick(...args) {
    try {
      const result = fn.apply(this, args);
      if (result && typeof result.catch === 'function') {
        return result.catch((err) => report(err));
      }
      return result;
    } catch (err) {
      report(err);
      return undefined;
    }
  };
  function report(err) {
    // Repeat failures are logged at most once a minute so a broken tick cannot flood the file.
    const now = Date.now();
    if (now - reported < 60_000) return;
    reported = now;
    log(`${name} failed:`, err?.stack ?? err);
  }
}

module.exports = { createLogger, guarded };
