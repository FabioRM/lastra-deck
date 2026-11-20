// @ts-check
/// <reference lib="dom" />
'use strict';

function sampleStatsHardware() {
  const cpu = { id: '/intelcpu/0/power/0', kind: 'Cpu', device: 'Example CPU', type: 'Power', name: 'CPU Package', value: 42 };
  return [cpu, ...[0, 1].flatMap((index) => {
    const id = '/gpu-nvidia/' + index;
    const row = (type, name, value, sensor = 0) => ({
      id: `${id}/${type}/${sensor}`, kind: 'GpuNvidia', device: 'Example GPU', type, name, value,
    });
    return [
      row('load', 'GPU Core', 88),
      row('temperature', 'GPU Core', 74),
      row('power', 'GPU Power', 184),
      row('smalldata', 'GPU Memory Used', 8_192),
      ...Array.from({ length: 11 }, (_, sensor) => row('clock', 'Clock ' + (sensor + 1), 1_900 + sensor * 70, sensor)),
      row('fan', 'GPU fan', 1420),
    ];
  })];
}

// Runs in the preview renderer after Chromium applies the requested orientation.
function inspectStatsLayout() {
  const panel = document.getElementById('stats-panel');
  const grid = document.getElementById('stats-readings');
  const device = /** @type {HTMLSelectElement} */ (document.getElementById('stats-device'));
  const next = /** @type {HTMLButtonElement} */ (document.getElementById('stats-next'));
  const previous = /** @type {HTMLButtonElement} */ (document.getElementById('stats-prev'));
  const header = panel.querySelector('.stats-header');
  const time = document.getElementById('stats-time');
  const date = document.getElementById('stats-date');
  const navigation = document.getElementById('stats-groups');
  const layout = /** @type {HTMLSelectElement} */ (document.getElementById('stats-layout'));
  const unavailable = /** @type {HTMLInputElement} */ (document.getElementById('stats-show-unavailable'));
  const powerView = /** @type {HTMLSelectElement} */ (document.getElementById('stats-power-view'));
  const controls = [.../** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('#stats-groups button:not([hidden])'))];
  const groups = controls.filter((button) => button.hasAttribute('aria-pressed'));
  if (groups.length < 8 || panel.hidden) throw new Error('Stats is still loading');

  function inspectHeader() {
    const bounds = header.getBoundingClientRect();
    const clock = time.getBoundingClientRect();
    const day = date.getBoundingClientRect();
    const tabs = navigation.getBoundingClientRect();
    const portrait = document.getElementById('stage').classList.contains('portrait');
    if (!time.textContent || !date.textContent || Math.abs(clock.left - bounds.left) > 1
        || tabs.left < Math.max(clock.right, day.right) - 1 || tabs.right > bounds.right + 1
        || clock.bottom <= tabs.top || tabs.bottom > bounds.bottom + 1) {
      throw new Error('The Stats clock, date and group buttons do not fit in the header');
    }
    const firstTop = groups[0].getBoundingClientRect().top;
    for (const button of controls) {
      if (button.scrollWidth > button.clientWidth + 1 || button.scrollHeight > button.clientHeight + 1
          || (!portrait && Math.abs(button.getBoundingClientRect().top - firstTop) > 1)) {
        throw new Error('Stats header clips or wraps ' + button.textContent);
      }
    }
    for (const control of document.querySelectorAll('#home-page, #dashboard-switch, .dashboard-audio-buttons button')) {
      const rect = control.getBoundingClientRect();
      if (rect.width && rect.height && rect.left < tabs.right - 1 && rect.right > tabs.left + 1
          && rect.top < tabs.bottom - 1 && rect.bottom > tabs.top + 1) {
        throw new Error('Stats tabs overlap the deck controls');
      }
    }
  }

  function inspect(label, counts) {
    const viewport = grid.getBoundingClientRect();
    if (panel.scrollHeight > panel.clientHeight + 1 || grid.scrollHeight > grid.clientHeight + 1) {
      throw new Error(label + ' requires vertical scrolling');
    }
    if (!grid.children.length) throw new Error(label + ' has no visible readings');
    for (const card of /** @type {HTMLCollectionOf<HTMLElement>} */ (grid.children)) {
      const bounds = card.getBoundingClientRect();
      if (bounds.bottom > viewport.bottom + 1 || bounds.right > viewport.right + 1 || card.scrollHeight > card.clientHeight + 1) {
        throw new Error(label + ' clips ' + card.querySelector('h3').textContent);
      }
      const cache = /** @type {HTMLDetailsElement | null} */ (card.querySelector('.stats-freshness'));
      const detail = cache?.querySelector('.stats-sample-time');
      const cached = card.dataset.state === 'stale';
      if (!detail || cache.hidden !== !cached || (!cached && detail.textContent)) {
        throw new Error(label + ' has incorrect last-sample visibility');
      }
      if (cached) {
        const summary = cache.querySelector('summary');
        cache.open = true;
        const area = detail.getBoundingClientRect();
        if (!detail.textContent || summary.title !== detail.textContent
            || summary.getAttribute('aria-description') !== detail.textContent
            || area.left < bounds.left - 1 || area.top < bounds.top - 1 || area.right > bounds.right + 1) {
          throw new Error(label + ' cannot show its cached timestamp details');
        }
        cache.open = false;
      }
      counts.readings++;
    }
    counts.screens++;
  }

  function inspectScreens() {
    const counts = { screens: 0, readings: 0 };
    inspectHeader();
    for (const group of groups) {
      group.click();
      if (grid.hasAttribute('data-combined-power')) {
        inspect('Combined power', counts);
        for (const legend of document.querySelectorAll('#stats-readings .stats-comparison-legend')) {
          if (!legend.textContent.includes('%') || !legend.textContent.includes(' W')) throw new Error('Combined power requires both unit scales');
        }
        if (grid.querySelectorAll('.widget-graph-overlay[d]:not([d=""])').length !== 2) throw new Error('Missing measured watt overlays');
        powerView.value = 'separate';
        powerView.dispatchEvent(new Event('change'));
        inspect('Separate power readings', counts);
        powerView.value = 'combined';
        powerView.dispatchEvent(new Event('change'));
        continue;
      }
      const choices = device.parentElement.hidden || device.parentElement.parentElement.hidden
        ? [null] : [...device.options].map((option) => option.value);
      for (const choice of choices) {
        if (choice !== null) {
          device.value = choice;
          device.dispatchEvent(new Event('change'));
        }
        const label = group.textContent;
        inspect(label, counts);
        let depth = 0;
        while (!next.disabled && !next.parentElement.hidden && !next.parentElement.parentElement.hidden) {
          next.click();
          inspect(label, counts);
          if (++depth > 32) throw new Error(label + ' did not terminate pagination');
        }
        if (depth && previous.disabled) throw new Error(label + ' cannot page back');
      }
    }
    groups[0].click();
    return counts;
  }

  function inspectLayouts() {
    return Object.fromEntries([...layout.options].map(({ value }) => {
      layout.value = value;
      layout.dispatchEvent(new Event('change'));
      if (grid.dataset.layout !== value) throw new Error('Stats layout did not change');
      return [value, inspectScreens()];
    }));
  }

  const root = document.documentElement;
  const originalScale = root.getAttribute('data-text-scale');
  const originalContrast = root.getAttribute('data-high-contrast');
  const originalLayout = layout.value;
  try {
    unavailable.checked = true;
    unavailable.dispatchEvent(new Event('change'));
    const current = inspectLayouts();
    root.dataset.textScale = '125';
    root.dataset.highContrast = 'true';
    return { current, largeHighContrast: inspectLayouts() };
  } finally {
    unavailable.checked = false;
    unavailable.dispatchEvent(new Event('change'));
    layout.value = originalLayout;
    layout.dispatchEvent(new Event('change'));
    if (originalScale === null) delete root.dataset.textScale;
    else root.dataset.textScale = originalScale;
    if (originalContrast === null) delete root.dataset.highContrast;
    else root.dataset.highContrast = originalContrast;
  }
}

function inspectCustomOverview() {
  return new Promise((resolve) => requestAnimationFrame(() => {
    const grid = document.getElementById('stats-readings');
    const [first, second, third] = grid.children;
    const wide = first?.getBoundingClientRect().width;
    const narrow = second?.getBoundingClientRect().width;
    resolve(grid.hasAttribute('data-custom-overview') && grid.children.length === 3
      && first.querySelector('.stats-label').textContent === 'GPU load'
      && second.querySelector('.stats-label').textContent === 'CPU load'
      && third.querySelector('.stats-label').textContent === 'RAM use'
      && wide > narrow * 1.8 && Math.abs(third.getBoundingClientRect().width - narrow) < 2);
  }));
}

module.exports = { sampleStatsHardware, inspectStatsLayout, inspectCustomOverview };
