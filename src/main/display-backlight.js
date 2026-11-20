// @ts-check
'use strict';

const { randomUUID } = require('node:crypto');
const { createBacklightDriver } = require('./display-backlight-win32');

const REVIEW_MS = 60_000;
const UNAVAILABLE = { ok: false, message: 'DDC/CI brightness is unavailable on the selected XENEON EDGE.' };
const STALE = { ok: false, reason: 'stale', message: 'Brightness or display details changed. Read the current brightness again.' };
const BUSY = { ok: false, reason: 'busy', message: 'A brightness request is still running.' };

function valid(reading) {
  return reading && [reading.minimum, reading.current, reading.maximum].every(Number.isSafeInteger)
    && reading.minimum >= 0 && reading.minimum < reading.maximum && reading.maximum <= 0xffffffff
    && reading.current >= reading.minimum && reading.current <= reading.maximum;
}

function percentOf({ minimum, current, maximum }) {
  return Math.round(100 * (current - minimum) / (maximum - minimum));
}

/**
 * @typedef {object} BacklightMonitor
 * @property {() => Promise<{ minimum: number, current: number, maximum: number } | null>} read
 * @property {(value: number) => Promise<boolean>} write
 */

/**
 * @typedef {object} BacklightDriver
 * @property {(window: any) => { identity: string } | null | undefined} identify
 * @property {<T>(target: { identity: string }, use: (monitor: BacklightMonitor) => Promise<T>) => Promise<T>} withMonitor
 */

/**
 * @typedef {object} DisplayBacklightOptions
 * @property {() => any} getWindow
 * @property {() => boolean} canWrite
 * @property {() => BacklightDriver | null} [driver]
 * @property {() => number} [now]
 * @property {(reason: string) => void} [onWidgetUpdate]
 */

class DisplayBacklight {
  /** @param {DisplayBacklightOptions} options */
  constructor({ getWindow, canWrite, driver = createBacklightDriver, now = Date.now, onWidgetUpdate = () => {} }) {
    this.getWindow = getWindow;
    this.canWrite = canWrite;
    this.driver = driver;
    this.now = now;
    this.onWidgetUpdate = onWidgetUpdate;
    this.revision = 0;
    this.reviews = new Map();
    /** @type {BacklightDriver | null | undefined} */
    this.native = undefined;
  }

  invalidate() {
    this.revision++;
    this.reviews.clear();
    this.onWidgetUpdate('invalidated');
  }

  view(scope, window, target, reading) {
    const token = randomUUID();
    const until = scope === 'dialog' ? this.now() + REVIEW_MS : Infinity;
    this.reviews.set(scope, { window, identity: target.identity, reading, token, until });
    return { ok: true, token, percent: percentOf(reading) };
  }

  async read(scope = 'dialog') {
    if (this.busy) return BUSY;
    this.reviews.delete(scope);
    this.busy = true;
    const revision = this.revision;
    let ready = false;
    try {
      const window = this.getWindow();
      if (!window) return UNAVAILABLE;
      this.native ??= this.driver();
      const target = this.native?.identify(window);
      if (!target) return UNAVAILABLE;
      const reading = await this.native.withMonitor(target, (monitor) => monitor.read());
      if (revision !== this.revision || this.getWindow() !== window || this.native.identify(window)?.identity !== target.identity) return STALE;
      if (!valid(reading)) return UNAVAILABLE;
      ready = true;
      return this.view(scope, window, target, reading);
    } catch {
      return UNAVAILABLE;
    } finally {
      this.busy = false;
      if (ready && scope === 'dialog') this.onWidgetUpdate('dialog-ready');
    }
  }

  async change(token, percent, { scope = 'dialog', allowed = () => true } = {}) {
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) return { ok: false, message: 'Choose brightness from 0% to 100%.' };
    if (this.busy) return BUSY;
    const review = this.reviews.get(scope);
    if (!review || review.token !== token) return STALE;
    this.reviews.delete(scope);
    this.busy = true;
    const revision = this.revision;
    const { window, identity, reading, until } = review;
    const currentTarget = () => {
      if (revision !== this.revision || this.now() > until || !this.canWrite() || !allowed() || this.getWindow() !== window) return null;
      const target = this.native.identify(window);
      return target?.identity === identity ? target : null;
    };
    let sent = false;
    try {
      const target = currentTarget();
      if (!target) return STALE;
      return await this.native.withMonitor(target, async (monitor) => {
        const before = await monitor.read();
        if (!valid(before)) return UNAVAILABLE;
        if (!currentTarget() || before.minimum !== reading.minimum || before.maximum !== reading.maximum || before.current !== reading.current) return STALE;
        const value = before.minimum + Math.round((before.maximum - before.minimum) * percent / 100);
        if (percent === percentOf(before) || value === before.current) return this.view(scope, window, target, before);
        sent = true;
        if (!(await monitor.write(value))) return { ok: false, message: 'The display rejected the brightness change.' };
        const after = await monitor.read();
        if (currentTarget() && valid(after) && after.current === value && after.minimum === before.minimum && after.maximum === before.maximum) {
          return this.view(scope, window, target, after);
        }
        return { ok: false, message: 'Could not verify brightness after the change. Read the current brightness again.' };
      }) ?? UNAVAILABLE;
    } catch {
      return sent ? { ok: false, message: 'Could not verify brightness after the change. Read the current brightness again.' } : UNAVAILABLE;
    } finally {
      this.busy = false;
      if (sent && scope === 'dialog') {
        this.reviews.delete('widgets');
        this.onWidgetUpdate('dialog-change');
      }
    }
  }
}

module.exports = { DisplayBacklight, BUSY, STALE };
