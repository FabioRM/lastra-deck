'use strict';

{
  const CHART_STYLES = Object.freeze({ line: 'Line', area: 'Filled area', step: 'Step', bars: 'Bars', points: 'Points' });
  const STATS_LAYOUTS = Object.freeze({ cards: 'Cards', charts: 'Chart view', values: 'Readings view' });
  const hasChartStyle = (value) => typeof value === 'string' && Object.hasOwn(CHART_STYLES, value);
  const hasStatsLayout = (value) => typeof value === 'string' && Object.hasOwn(STATS_LAYOUTS, value);

  function chartPaths(points, high, expiresAfter, range, style) {
    const recent = points.slice(-60);
    const first = range?.from ?? recent[0]?.[0] ?? 0;
    const duration = Math.max((range?.to ?? recent.at(-1)?.[0] ?? first) - first, 1);
    const low = range?.low ?? 0;
    const lines = [];
    const areas = [];
    let previous = null;
    let segment = '';
    let start;
    let end;
    function flush() {
      if (!segment) return;
      lines.push(segment);
      if (style === 'area') areas.push(`${segment} L${end},40 L${start},40 Z`);
      segment = '';
    }
    for (const [time, value] of recent) {
      if (!Number.isFinite(value)) {
        flush();
        previous = null;
        continue;
      }
      const x = (2 + (time - first) / duration * 146).toFixed(1);
      const y = (40 - Math.max(0, Math.min(1, (value - low) / Math.max(high - low, 1e-9))) * 38).toFixed(1);
      if (style === 'bars' || style === 'points') {
        if (time >= first && time <= first + duration) {
          lines.push(style === 'bars' ? `M${x},40 V${y}` : `M${x},${y} h0.01`);
        }
        continue;
      }
      if (previous === null || time - previous > expiresAfter) {
        flush();
        start = x;
        segment = `M${x},${y}`;
      } else {
        segment += style === 'step' ? ` H${x} V${y}` : ` L${x},${y}`;
      }
      end = x;
      previous = time;
    }
    flush();
    return { line: lines.join(' '), area: areas.join(' ') };
  }

  const api = { CHART_STYLES, STATS_LAYOUTS, hasChartStyle, hasStatsLayout, chartPaths };
  if (typeof module === 'object') module.exports = api;
  else window.LastraStatsChart = api;
}
