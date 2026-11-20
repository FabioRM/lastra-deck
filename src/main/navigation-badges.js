// @ts-check
'use strict';

const reading = (status, count = null) => ({ status, count });

function serviceBadge(source, now) {
  if (!source?.active) return { badge: reading('unavailable') };
  const { checks } = source;
  if (source.error) return { badge: reading(checks.some(({ at }) => Number.isFinite(at)) ? 'stale' : 'unavailable') };
  if (!checks.length) return { badge: reading('unconfigured') };
  let down = 0;
  let waiting = false;
  let expiresAt = Infinity;
  for (const { status, at, intervalMs, timeoutMs } of checks) {
    if (!Number.isFinite(at) || !['up', 'retrying', 'down'].includes(status)) {
      waiting = true;
      continue;
    }
    // Allow one scheduled retry interval and the configured timeout before dropping the cached count.
    const expiry = at + 2 * intervalMs + timeoutMs;
    if (at > now || expiry <= now) return { badge: reading('stale') };
    expiresAt = Math.min(expiresAt, expiry);
    if (status === 'down') down++;
  }
  return { badge: waiting ? reading('warming') : reading('ready', down), expiresAt };
}

class NavigationBadges {
  constructor({ alertCount, serviceChecks, timerCount, onChange, now = Date.now }) {
    this.alertCount = alertCount;
    this.serviceChecks = serviceChecks;
    this.timerCount = timerCount;
    this.onChange = onChange;
    this.now = now;
  }

  collect() {
    const { badge: services, expiresAt } = serviceBadge(this.serviceChecks(), this.now());
    const count = (value) => Number.isSafeInteger(value) && value >= 0 ? reading('ready', value) : reading('unavailable');
    const badges = { alerts: count(this.alertCount()), services, timers: count(this.timerCount()) };
    return { badges, expiresAt };
  }

  snapshot() { return this.collect().badges; }

  refresh() {
    this.stop();
    const { badges, expiresAt } = this.collect();
    if (Number.isFinite(expiresAt)) {
      this.expiry = setTimeout(() => this.refresh(), Math.max(1, expiresAt - this.now()));
      this.expiry.unref();
    }
    const signature = JSON.stringify(badges);
    if (signature === this.signature) return;
    this.signature = signature;
    this.onChange(badges);
  }

  stop() {
    clearTimeout(this.expiry);
    this.expiry = undefined;
  }
}

module.exports = { NavigationBadges, serviceBadge };
