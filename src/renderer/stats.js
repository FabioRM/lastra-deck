'use strict';

(() => {
  const api = window.lastra ?? window.LastraDeckPreview?.panels;
  if (!api) return;
  const { t } = window.LastraI18n;

  const panel = document.getElementById('stats-panel');
  const navigation = document.getElementById('stats-groups');
  const readings = document.getElementById('stats-readings');
  const message = document.getElementById('stats-message');
  const date = document.getElementById('stats-date');
  const viewOptions = document.getElementById('stats-view-options');
  const layoutSelect = document.getElementById('stats-layout');
  const layoutControl = document.getElementById('stats-layout-control');
  const powerControl = document.getElementById('stats-power-mode');
  const powerView = document.getElementById('stats-power-view');
  const showUnavailable = document.getElementById('stats-show-unavailable');
  showUnavailable.checked = !window.lastra;
  const historyControl = document.getElementById('stats-history-control');
  const historySelect = document.getElementById('stats-history');
  const detailControls = document.getElementById('stats-detail-controls');
  const deviceChoice = document.getElementById('stats-device-choice');
  const deviceSelect = document.getElementById('stats-device');
  const pageControls = document.getElementById('stats-pages');
  const pageCount = document.getElementById('stats-page-count');
  const previous = document.getElementById('stats-prev');
  const next = document.getElementById('stats-next');
  const { element, graph } = window.LastraWidgetComponents;
  const { statsPage, statsScales, scaleKey, powerPairs } = window.LastraStatsLayout;
  const { chartRange, mount } = window.LastraStatsTimeline;
  const { preferredOverview } = window.LastraSensorBinding;
  const { lastReading } = window.LastraReadingTime;
  const { STATS_LAYOUTS, hasStatsLayout } = window.LastraStatsChart;
  const cards = new Map();
  const buttons = new Map();
  const numberFormat = (maximumFractionDigits = 1) => new Intl.NumberFormat(document.documentElement.lang, { maximumFractionDigits });
  let formatter = numberFormat();
  let voltageFormatter = numberFormat(3);
  const formatValue = ({ value, unit }) => (unit === 'V' ? voltageFormatter : formatter).format(value);
  let group = 'overview';
  let selectedDevice;
  let page = 0;
  let knownDevices = '';
  let scales;
  let snapshot;
  let preferences = { selected: null, style: 'line', layout: 'cards', revision: -1 };
  let layoutOverride;
  let historyOptions;
  let dateLocale;
  let dateFormatter;
  const timeline = mount(api, () => render(snapshot));
  const processes = window.LastraStatsProcesses.mount(api);

  function text(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }

  function card(item) {
    if (cards.has(item.id)) return cards.get(item.id);
    const title = element('h3', 'stats-label');
    const device = element('p', 'stats-device');
    const number = element('span', 'stats-value');
    const unit = element('span', 'stats-unit');
    const watts = element('span', 'stats-watts');
    watts.hidden = true;
    const headline = element('p', 'stats-headline');
    const source = element('p', 'stats-source');
    const freshness = element('details', 'stats-freshness');
    const summary = element('summary', '', t('Cached'));
    const sampleTime = element('p', 'stats-sample-time');
    freshness.hidden = true;
    freshness.append(summary, sampleTime);
    headline.append(number, unit, watts);
    const history = graph(item.name + ' over the last 60 seconds');
    const scale = element('span', 'stats-scale');
    const dashboard = element('button', 'stats-grafana', 'Grafana');
    dashboard.type = 'button';
    dashboard.hidden = true;
    const chartFooter = element('div', 'stats-chart-footer');
    chartFooter.append(dashboard, scale);
    const chart = element('div', 'stats-chart');
    const comparisonLegend = element('div', 'stats-comparison-legend');
    const legendRows = Array.from({ length: 4 }, (_, index) => {
      const root = element('span', 'stats-series-key');
      root.dataset.series = String(index);
      const name = element('span', 'stats-series-name');
      const value = element('span', 'stats-series-value');
      root.append(name, value);
      return { root, name, value };
    });
    comparisonLegend.hidden = true;
    comparisonLegend.append(...legendRows.map(({ root }) => root));
    chart.append(history.element, comparisonLegend, chartFooter);
    const root = element('article', 'stats-card');
    root.append(title, device, headline, chart, source, freshness);
    const value = { root, title, device, number, unit, watts, source, freshness, summary, sampleTime, history, scale, dashboard,
      comparisonLegend, legendRows };
    dashboard.addEventListener('click', () => { void timeline?.openDashboard(value.range); });
    cards.set(item.id, value);
    return value;
  }

  function updateCard(item, now, distinguishDevice = false, overlays = [], powerView = false) {
    const current = card(item);
    const { root, title, device, number, unit, watts, source, freshness, summary, sampleTime, history, scale, dashboard,
      comparisonLegend, legendRows } = current;
    const available = item.status !== 'unavailable';
    root.dataset.state = item.status;
    root.dataset.group = item.group;
    const label = t(group === 'overview' && item.group === 'display' ? 'Display refresh rate' : item.name);
    text(title, label);
    if (title.title !== label) title.title = label;
    const deviceLabel = distinguishDevice ? `${item.device} · ${item.deviceId}` : item.device ?? '';
    text(device, group === 'overview' || group === 'power' ? deviceLabel : '');
    if (device.title !== deviceLabel) device.title = deviceLabel;
    text(number, available ? formatValue(item) : 'N/A');
    text(unit, available ? item.unit : '');
    const power = powerView ? overlays[0] : overlays.some(({ unit }) => unit === 'W') ? null : item.watts;
    watts.hidden = !power || power.status === 'unavailable';
    if (!watts.hidden) {
      const value = formatter.format(power.value) + ' W';
      watts.dataset.state = power.status;
      text(watts, value);
      const freshness = power.status === 'stale' ? ' · ' + t('Cached') : '';
      watts.title = [t('Measured power') + freshness, lastReading(power.sampledAt ?? power.at)].filter(Boolean).join(' · ');
      watts.setAttribute('aria-label', watts.title + ' · ' + value);
    }
    const detailText = available ? item.source : t(item.reason || 'The selected sensor is disconnected.');
    text(source, detailText);
    source.title = detailText;
    const cached = item.status === 'stale';
    if (cached) {
      text(summary, t('Cached'));
      const detail = lastReading(item.at) || 'Update time unavailable';
      text(sampleTime, detail);
      if (summary.title !== detail) {
        summary.title = detail;
        summary.setAttribute('aria-description', detail);
      }
      freshness.hidden = false;
    } else if (!freshness.hidden) {
      freshness.open = false;
      freshness.hidden = true;
      text(sampleTime, '');
      summary.removeAttribute('title');
      summary.removeAttribute('aria-description');
    }
    const compared = overlays.length > 0;
    const series = [item, ...overlays];
    const unitScales = compared ? statsScales(series, ({ unit }) => unit) : null;
    const windowMs = Math.max(60_000, ...series.map(({ chartWindow }) => chartWindow ?? 60_000));
    current.range = chartRange(now, windowMs);
    const lines = series.map((reading, index) => {
      const points = reading.points;
      const count = points.filter(([, value]) => Number.isFinite(value)).length;
      const { low, high } = (compared ? unitScales.get(reading.unit) : scales.get(scaleKey(reading))) ?? { low: 0, high: 1 };
      const style = compared && count === 1 ? 'points' : index ? 'line' : preferences.style;
      return { points, count, low, high, style, stale: reading.status === 'stale',
        range: { low, ...current.range }, expiresAfter: reading.chartGap ?? reading.maxAge };
    });
    const first = lines[0];
    const singleSample = preferences.style === 'bars' || preferences.style === 'points';
    history.element.toggleAttribute('data-empty', !lines.slice(1).some(({ count }) => count) && first.count < (singleSample || compared ? 1 : 2));
    scale.hidden = compared || first.count < 2;
    const scaleLabel = (line, unit) => `${formatter.format(line.low)}–${formatter.format(line.high)} ${unit}`;
    text(scale, scaleLabel(first, item.unit));
    const rangeLabel = series.find(({ chartLabel }) => chartLabel)?.chartLabel;
    const chartLabel = rangeLabel ? `${t(rangeLabel)}, ${t('Averages')}` : t('Last minute');
    history.update(first.points, first.high, first.expiresAfter, first.range, first.style);
    history.setOverlays(lines.slice(1));
    comparisonLegend.hidden = !compared;
    comparisonLegend.toggleAttribute('data-power', powerView);
    const legends = [];
    for (const [index, entry] of legendRows.entries()) {
      const reading = series[index];
      entry.root.hidden = !compared || !reading;
      if (entry.root.hidden) continue;
      const name = powerView ? t(index ? 'Power' : 'Load') : t(reading.name);
      const value = Number.isFinite(reading.value) && reading.status !== 'unavailable'
        ? `${formatValue(reading)} ${reading.unit}` : t('Unavailable');
      const axis = lines[index].count ? scaleLabel(lines[index], reading.unit) : t('History unavailable');
      const freshness = reading.status === 'stale' ? t('Cached') : '';
      const recent = windowMs > 60_000 && !reading.chartWindow ? t('Last minute') : '';
      const detail = [name, reading.device, value, axis, freshness, recent].filter(Boolean).join(' · ');
      text(entry.name, name);
      text(entry.value, powerView ? axis : lines[index].count ? `${value} · ${axis}` : value);
      if (entry.root.title !== detail) entry.root.title = detail;
      entry.root.dataset.state = reading.status;
      legends.push(detail);
    }
    const events = timeline?.draw(history.element, current.range) ?? 0;
    const annotations = events ? `, ${events} timeline ${events === 1 ? 'event' : 'events'}` : '';
    const scalesLabel = compared ? legends.join('. ') : scale.textContent;
    history.element.setAttribute('aria-label', `${label}, ${chartLabel}, ${scalesLabel}${annotations}`);
    dashboard.hidden = !timeline?.canOpenDashboard;
    if (!dashboard.hidden) dashboard.setAttribute('aria-label', `Open ${label}, ${chartLabel}, in Grafana`);
    return root;
  }

  function updateNavigation(groups) {
    for (const [id, label] of Object.entries({ overview: 'Overview', ...groups })) {
      if (!buttons.has(id)) {
        const button = element('button', 'stats-group', t(label));
        button.type = 'button';
        button.addEventListener('click', () => {
          void api.selectStatsTab?.(id).catch(() => {});
          selectTab(id);
        });
        buttons.set(id, button);
        navigation.insertBefore(button, timeline?.trigger ?? null);
      }
      text(buttons.get(id), t(label));
      buttons.get(id).setAttribute('aria-pressed', String(group === id));
    }
  }

  function selectTab(id) {
    if (group === id) return;
    group = id;
    selectedDevice = undefined;
    page = 0;
    render(snapshot);
    feed.reload();
  }

  function renderHistory(options) {
    historyControl.hidden = group !== 'overview' || !options.length;
    const signature = JSON.stringify([document.documentElement.lang, options]);
    if (signature === historyOptions) return;
    historyOptions = signature;
    const wanted = historySelect.value;
    historySelect.replaceChildren(...[{ ms: 60_000, label: 'Last minute' }, ...options].map(({ ms, label }) => {
      const option = element('option', '', t(label));
      option.value = String(ms);
      return option;
    }));
    historySelect.value = options.some(({ ms }) => String(ms) === wanted) ? wanted : '60000';
  }

  function renderDetailControls(detail) {
    const { devices, selected, pageCount: count } = detail;
    const showDevice = devices.length > 1 || Boolean(devices[0]?.id);
    const signature = JSON.stringify(devices);
    if (signature !== knownDevices) {
      knownDevices = signature;
      const labels = new Map();
      for (const { name } of devices) labels.set(name, (labels.get(name) ?? 0) + 1);
      const instances = new Map();
      deviceSelect.replaceChildren(...devices.map(({ id, name }) => {
        const index = (instances.get(name) ?? 0) + 1;
        instances.set(name, index);
        const option = element('option', '', labels.get(name) > 1 ? `${name} (${index})` : name);
        option.value = id;
        return option;
      }));
    }
    const readingPages = count > 1;
    deviceChoice.hidden = !showDevice;
    deviceSelect.value = selected ?? '';
    pageControls.hidden = !readingPages;
    detailControls.hidden = !showDevice && !readingPages;
    previous.disabled = page === 0;
    next.disabled = page >= count - 1;
    text(pageCount, `${page + 1} / ${count}`);
  }

  function syncChildren(parent, children) {
    children.forEach((child, index) => {
      if (parent.children[index] !== child) parent.insertBefore(child, parent.children[index] ?? null);
    });
    while (parent.children.length > children.length) parent.lastElementChild.remove();
  }

  function syncPreferences(next) {
    if (!(next?.revision > preferences.revision)) return;
    preferences = next;
    layoutOverride = undefined;
  }

  function localizeLayouts() {
    layoutSelect.replaceChildren(...Object.entries(STATS_LAYOUTS).map(([id, label]) => new Option(t(label), id)));
  }
  localizeLayouts();

  function render(state) {
    syncPreferences(state?.preferences);
    if (state?.groups && state !== snapshot) {
      snapshot = state;
      scales = statsScales([...state.overview, ...state.readings]);
    }
    let info = state?.status === 'loading' ? 'Reading telemetry…' : state?.error
      || (group === 'frames' ? snapshot?.frameStatus : '');
    if (!snapshot) {
      text(message, t(info));
      message.hidden = !info;
      return;
    }
    updateNavigation(snapshot.groups);
    renderHistory(snapshot.historyOptions ?? []);
    viewOptions.hidden = false;
    const layout = layoutOverride ?? preferences.layout ?? 'cards';
    const combined = group === 'power' && powerView.value === 'combined';
    const customOverview = group === 'overview' && Array.isArray(preferences.wide);
    layoutSelect.value = layout;
    layoutControl.hidden = combined;
    powerControl.hidden = group !== 'power';
    readings.dataset.layout = combined ? 'charts' : layout;
    readings.toggleAttribute('data-combined-power', combined);
    readings.dataset.mode = ['overview', 'power'].includes(group) ? group : 'details';
    readings.toggleAttribute('data-custom-overview', customOverview);
    const now = api.fixtureTime ?? Date.now();
    const visibleItems = (items) => showUnavailable.checked ? items : items.filter(({ status }) => status !== 'unavailable');
    if (group === 'overview') {
      const preferred = preferredOverview(snapshot, preferences.selected);
      const items = preferences.selected === null ? visibleItems(preferred) : preferred;
      const comparisons = new Map((preferences.series ?? []).map(({ id, readings }) => [id, preferredOverview(snapshot, readings)]));
      const graphed = [...items, ...[...comparisons.values()].flat()];
      timeline?.setRange(chartRange(now, Math.max(60_000, ...graphed.map((item) => item.chartWindow ?? 60_000))));
      detailControls.hidden = true;
      readings.toggleAttribute('data-compact-selection', !customOverview && items.length < 5);
      readings.style.setProperty('--stats-selection-columns', String(Math.max(1, items.length)));
      readings.style.setProperty('--stats-selection-rows', String(Math.max(1, Math.ceil(items.length / 2))));
      syncChildren(readings, items.map((item) => {
        const sameName = item.device && item.deviceId
          && items.some((other) => item.device === other.device && other.deviceId && item.deviceId !== other.deviceId);
        const card = updateCard(item, now, sameName, comparisons.get(item.id));
        card.toggleAttribute('data-wide', customOverview && preferences.wide.includes(item.id));
        return card;
      }));
    } else if (group === 'power') {
      readings.removeAttribute('data-compact-selection');
      detailControls.hidden = true;
      timeline?.setRange(chartRange(now));
      const items = snapshot.readings.filter((item) => item.group === 'power');
      syncChildren(readings, combined
        ? powerPairs(items).filter(({ load, watts }) => visibleItems([load, watts]).length)
          .map(({ load, watts }) => updateCard(load, now, false, [watts], true))
        : visibleItems(items).map((item) => updateCard(item, now)));
    } else {
      readings.removeAttribute('data-compact-selection');
      timeline?.setRange(chartRange(now));
      const detail = statsPage(visibleItems(snapshot.readings), group, selectedDevice, page);
      selectedDevice = detail.selected;
      page = detail.page;
      renderDetailControls(detail);
      readings.style.setProperty('--stats-columns', String(Math.max(4, detail.items.length)));
      syncChildren(readings, detail.items.map((item) => updateCard(item, now)));
    }
    if (!readings.childElementCount && !info) info = 'No readings available in this group. Turn on Show unavailable for details.';
    text(message, t(info));
    message.hidden = !info;
    const ids = new Set([...snapshot.overview, ...snapshot.readings, ...(preferences.selected ?? [])].map(({ id }) => id));
    for (const id of cards.keys()) if (!ids.has(id)) cards.delete(id);
  }

  deviceSelect.addEventListener('change', () => {
    selectedDevice = deviceSelect.value;
    page = 0;
    render(snapshot);
  });
  previous.addEventListener('click', () => { page--; render(snapshot); });
  next.addEventListener('click', () => { page++; render(snapshot); });
  showUnavailable.addEventListener('change', () => { page = 0; render(snapshot); });
  powerView.addEventListener('change', () => render(snapshot));
  layoutSelect.addEventListener('change', () => {
    if (hasStatsLayout(layoutSelect.value)) layoutOverride = layoutSelect.value;
    render(snapshot);
  });

  const feed = window.createVisibleFeed(() => api.readStats(group === 'overview' ? Number(historySelect.value) : undefined), render,
    { interval: 1_000, error: 'Could not read telemetry.' });
  document.addEventListener('lastra-language', () => {
    formatter = numberFormat();
    voltageFormatter = numberFormat(3);
    localizeLayouts();
    render(snapshot);
  });
  historySelect.addEventListener('change', () => feed.reload());
  let visible = false;
  let sessionBlocked = document.getElementById('windows-session-cover').open;
  function refresh() {
    const next = !panel.hidden && !document.hidden && !sessionBlocked;
    if (visible === next) return;
    visible = next;
    feed.setVisible(next);
    timeline?.setVisible(next);
    processes?.setVisible(next);
    if (!next) void api.stopStats().catch(() => {});
  }

  function setOpen(open) {
    if (panel.hidden === !open) return;
    window.LastraDeckViews.setPanel(panel, open);
    refresh();
  }

  function updateDate(now, locale) {
    if (!dateFormatter || dateLocale !== locale) {
      dateLocale = locale;
      dateFormatter = new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' });
    }
    text(date, dateFormatter.format(now));
  }

  panel.addEventListener('lastra:close-view', () => setOpen(false));
  document.addEventListener('visibilitychange', refresh);
  document.addEventListener('lastra:session-blocked', ({ detail }) => {
    sessionBlocked = detail;
    refresh();
  });
  timeline?.setViewOnly(document.getElementById('stage').hasAttribute('data-view-only'));
  document.addEventListener('lastra:view-only', ({ detail }) => {
    timeline?.setViewOnly(detail);
    render(snapshot);
  });
  const stopPreferences = api.onStatsPreferences?.((next) => {
    syncPreferences(next);
    if (visible) render(snapshot);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented && !panel.hidden && !document.querySelector('dialog[open]')) setOpen(false);
  });
  window.addEventListener('pagehide', () => {
    feed.destroy();
    timeline?.setVisible(false);
    stopPreferences?.();
    processes?.setVisible(false);
    if (visible) void api.stopStats().catch(() => {});
  });
  window.LastraStats = { setOpen, updateDate, selectTab };
})();
