'use strict';

{
  const { element, stat, graph, gauge } = window.LastraWidgetComponents;
  const { ICONS, METRICS, compositionMetrics } = window.LastraWidgetComposition;

  function createCompositionCard(composition, icons = {}) {
    const root = element('article', 'lastra-widget widget-composition');
    const header = element('header', 'widget-header');
    header.append(element('h3', 'widget-title', composition.name));
    const grid = element('div', 'composition-grid');
    grid.style.setProperty('--composition-cols', composition.grid.cols);
    grid.style.setProperty('--composition-rows', composition.grid.rows);
    root.append(header, grid);
    const readings = [];
    for (const part of composition.parts) {
      const tile = element('div', 'composition-part');
      tile.dataset.kind = part.type;
      const { column, row, cols, rows } = part.layout;
      tile.style.gridColumn = `${column + 1} / span ${cols}`;
      tile.style.gridRow = `${row + 1} / span ${rows}`;
      grid.append(tile);
      if (part.type === 'text') {
        tile.textContent = part.text;
      } else if (part.type === 'icon') {
        const svg = icons[part.icon];
        if (typeof svg === 'string' && svg) {
          const glyph = element('span', 'composition-icon');
          glyph.setAttribute('role', 'img');
          glyph.setAttribute('aria-label', ICONS[part.icon]);
          glyph.style.setProperty('--composition-icon', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
          tile.append(glyph);
        } else tile.textContent = ICONS[part.icon];
      } else {
        const label = METRICS[part.metric];
        const value = stat();
        const range = part.type === 'gauge' ? gauge(label) : null;
        const trend = part.type === 'graph' ? graph(`${label} history`) : null;
        tile.append(element('span', 'composition-metric', label), value, range ?? trend.element);
        readings.push({ metric: part.metric, tile, value, range, trend });
      }
    }

    function render(sample = {}) {
      for (const { metric, tile, value, range, trend } of readings) {
        const amount = sample[metric];
        const temperature = metric.endsWith('Temp');
        const available = Number.isFinite(amount);
        const system = metric === 'cpu' || metric === 'ram';
        const at = system ? sample.sampledAt : sample.hardwareAt;
        const staleMs = system ? 3_000 : sample.hardwareStaleMs ?? 6_000;
        const stale = available && Number.isFinite(at) && Date.now() - at >= staleMs;
        const formatted = available ? Math.round(temperature ? amount : amount * 100) + (temperature ? ' °C' : '%') : 'N/A';
        if (value.textContent !== formatted) value.textContent = formatted;
        tile.dataset.reading = stale ? 'cached' : available ? 'ready' : 'unavailable';
        const source = system ? 'Operating system' : ({ managed: 'LibreHardwareMonitor', http: 'LibreHardwareMonitor HTTP', preview: 'Sample' })[sample.hardwareSource];
        tile.title = [METRICS[metric], source, stale ? 'Cached' : available ? '' : 'Reading unavailable'].filter(Boolean).join(' · ');
        if (range) {
          range.max = temperature ? 110 : 100;
          range.value = available ? temperature ? amount : amount * 100 : 0;
          range.hidden = !available;
        }
        if (trend) {
          trend.element.hidden = !available;
          trend.update(sample.history?.[metric] ?? [], temperature ? 110 : 1, staleMs);
        }
      }
    }

    render();
    return { root, render, usesTelemetry: compositionMetrics(composition).length > 0 };
  }

  window.LastraCompositionCard = { createCompositionCard };
}
