'use strict';

{
  const { element, button } = window.LastraDom;

  function stat() {
    return element('strong', 'widget-stat', 'N/A');
  }

  function badge(text) {
    return element('span', 'widget-badge', text);
  }

  function gauge(label) {
    const meter = element('meter', 'widget-gauge');
    meter.min = 0;
    meter.max = 100;
    meter.setAttribute('aria-label', label);
    return meter;
  }

  function graph(label) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    const area = document.createElementNS(ns, 'path');
    const line = document.createElementNS(ns, 'path');
    const overlays = [];
    const { chartPaths } = window.LastraStatsChart;
    svg.classList.add('widget-graph');
    area.classList.add('widget-graph-area');
    line.classList.add('widget-graph-line');
    svg.setAttribute('viewBox', '0 0 150 42');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
    svg.append(area, line);
    return {
      element: svg,
      update(points, high, expiresAfter = 3_000, range, style = 'line') {
        const paths = chartPaths(points, high, expiresAfter, range, style);
        line.setAttribute('d', paths.line);
        area.setAttribute('d', paths.area);
        svg.dataset.chartStyle = style;
      },
      setOverlays(series) {
        while (overlays.length > series.length) overlays.pop().remove();
        for (const [index, { points, high, expiresAfter, range, style, stale }] of series.entries()) {
          let overlay = overlays[index];
          if (!overlay) {
            overlay = document.createElementNS(ns, 'path');
            overlay.classList.add('widget-graph-overlay');
            overlay.dataset.series = String(index + 1);
            svg.append(overlay);
            overlays.push(overlay);
          }
          overlay.dataset.style = style;
          overlay.toggleAttribute('data-stale', stale);
          overlay.setAttribute('d', chartPaths(points, high, expiresAfter, range, style).line);
        }
      },
    };
  }

  function progress(label) {
    const timeline = element('progress', 'widget-progress');
    timeline.setAttribute('aria-label', label);
    return timeline;
  }

  function list() {
    const root = element('ul', 'widget-list');
    return {
      element: root,
      update(values) {
        root.replaceChildren(...values.map((value) => element('li', '', value)));
      },
    };
  }

  function action(label, handler, icon = label) {
    return button(icon, handler, { className: 'widget-action', label, title: label });
  }

  function decisionCard(choices, { sample = false } = {}) {
    const { decisionResult } = window.LastraDecisions;
    const root = element('article', 'lastra-widget widget-decision');
    root.append(element('h3', 'widget-title', 'Quick decision'));
    const result = element('output', 'widget-decision-result', sample ? choices[0] : '—');
    result.setAttribute('aria-label', 'Decision result');
    const controls = element('div', 'widget-actions');
    for (const [kind, label, text] of [
      ['coin', 'Flip a coin', 'Coin'], ['die', 'Roll a six-sided die', 'Die'], ['pick', 'Pick an option', 'Pick'],
    ]) {
      const control = action(label, () => {
        result.textContent = decisionResult(kind, choices);
        result.title = result.textContent;
      }, text);
      control.disabled = sample;
      controls.append(control);
    }
    root.append(result, controls);
    return root;
  }

  window.LastraWidgetComponents = { element, stat, badge, gauge, graph, progress, list, action, decisionCard };
}
