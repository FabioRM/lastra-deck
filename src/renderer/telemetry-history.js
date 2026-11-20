'use strict';

{
  const MAX_AGE = 15 * 60_000;
  const METRICS = ['cpu', 'ram', 'gpu', 'cpuTemp', 'gpuTemp'];

  function summarize({ count, total, peak }) {
    return count === 0 ? null : { average: total / count, peak };
  }

  class TelemetryHistory {
    constructor(series = null) {
      this.series = series ?? Object.fromEntries(METRICS.map((name) => [name, []]));
    }

    record(sample) {
      const now = sample.sampledAt;
      if (!Number.isFinite(now)) return;

      for (const name of METRICS) {
        const time = name === 'cpu' || name === 'ram' ? now : sample.hardwareAt;
        this.recordPoint(name, time, sample[name], now);
      }
    }

    recordPoint(metric, time, value, now) {
      const points = this.series[metric] ??= [];
      const cutoff = now - MAX_AGE;
      if (Number.isFinite(time) && time >= cutoff && (!points.length || time > points.at(-1)[0])) {
        points.push([time, Number.isFinite(value) ? value : null]);
      }
      while (points.length && points[0][0] < cutoff) points.shift();
    }

    compare(metric, now, rangeMs) {
      const start = now - rangeMs;
      const middle = start + rangeMs / 2;
      const previous = { count: 0, total: 0, peak: -Infinity };
      const latest = { count: 0, total: 0, peak: -Infinity };
      for (const [time, reading] of this.series[metric] ?? []) {
        if (!Number.isFinite(time) || !Number.isFinite(reading) || time < start || time > now) continue;
        const window = time < middle ? previous : latest;
        window.count++;
        window.total += reading;
        window.peak = Math.max(window.peak, reading);
      }
      return { latest: summarize(latest), previous: summarize(previous) };
    }
  }

  if (typeof module === 'object') module.exports = { TelemetryHistory };
  else window.TelemetryHistory = TelemetryHistory;
}
