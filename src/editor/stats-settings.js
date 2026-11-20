'use strict';

{
  const api = window.lastraEditor;
  const { t } = window.LastraI18n;
  const { element, button } = window.LastraDom;
  const { graph } = window.LastraWidgetComponents;
  const { searchSensors } = window.LastraSensorBinding;
  const { CHART_STYLES, STATS_LAYOUTS } = window.LastraStatsChart;
  const byId = (id) => document.getElementById(id);
  const details = byId('stats-settings');
  const form = byId('stats-settings-form');
  const list = byId('stats-settings-readings');
  const board = byId('stats-overview-board');
  const count = byId('stats-settings-count');
  const status = byId('stats-settings-status');
  const loadStatus = byId('stats-settings-load');
  const apply = form.querySelector('[type="submit"]');
  const { style, layout, search, seriesSearch } = form.elements;
  const seriesEditor = byId('stats-series-editor');
  const seriesTitle = byId('stats-series-title');
  const seriesList = byId('stats-series-readings');
  const seriesCount = byId('stats-series-count');
  const sample = graph(t('Sample of the selected Stats chart style'));
  byId('stats-chart-sample').append(sample.element);
  let settings;
  let selection = new Set();
  let wide = null;
  let series = new Map();
  let seriesFor;
  let dragId;
  let defaults = true;

  function localizeOptions() {
    for (const [control, entries] of [[style, CHART_STYLES], [layout, STATS_LAYOUTS]]) {
      const value = control.value;
      control.replaceChildren(...Object.entries(entries).map(([key, label]) => new Option(t(label), key)));
      if (value) control.value = value;
    }
    sample.element.setAttribute('aria-label', t('Sample of the selected Stats chart style'));
  }
  localizeOptions();
  document.addEventListener('lastra-language', () => {
    localizeOptions();
    if (settings) { renderList(); renderBoard(); renderSeries(); }
  });

  function updateChart() {
    sample.update([26, 33, 30, 58, 50, 67, 61, 79].map((value, index) => [index * 1_000, value]),
      100, 3_000, undefined, style.value);
  }

  function updateChecks() {
    const { limit } = settings;
    count.textContent = t('{count} of {limit} selected', { count: selection.size, limit }) + (defaults ? ' · ' + t('Default readings') : '');
    apply.disabled = !defaults && !selection.size;
    updateListChecks(list, selection, limit);
  }

  function updateListChecks(container, picked, limit) {
    for (const input of container.querySelectorAll('input')) {
      input.checked = picked.has(input.value);
      input.disabled = !input.checked && picked.size >= limit;
    }
  }

  function renderBoard(focusId, focusAction) {
    const rows = new Map(settings.choices.map((row) => [row.id, row]));
    const ids = [...selection];
    let target;
    board.replaceChildren(...ids.map((id, index) => {
      const name = t(rows.get(id)?.name || id);
      const card = element('article', 'overview-layout-card');
      card.draggable = true;
      card.toggleAttribute('data-wide', wide?.has(id));
      const actions = element('div', 'overview-layout-actions');
      const earlier = button('↑', () => move(id, index - 1, 'earlier'), {
        disabled: index === 0, label: t('Move {name} earlier', { name }), title: t('Move earlier'),
      });
      const later = button('↓', () => move(id, index + 1, 'later'), {
        disabled: index === ids.length - 1, label: t('Move {name} later', { name }), title: t('Move later'),
      });
      const resize = button(t(wide?.has(id) ? 'Narrow' : 'Widen'), () => {
        defaults = false;
        wide ??= new Set();
        if (wide.has(id)) wide.delete(id);
        else wide.add(id);
        updateChecks();
        renderBoard(id, 'size');
      }, { label: t(wide?.has(id) ? 'Narrow {name}' : 'Widen {name}', { name }) });
      if (id === focusId) {
        const control = { earlier, later, size: resize }[focusAction];
        target = control && !control.disabled ? control : resize;
      }
      const seriesButton = button(t('Chart series') + (series.get(id)?.size ? ` (${series.get(id).size})` : ''), () => {
        const opening = seriesFor !== id;
        seriesFor = opening ? id : undefined;
        seriesSearch.value = '';
        renderSeries();
        renderBoard(id, 'series');
        if (opening) seriesSearch.focus();
      }, { label: t('Edit chart series for {name}', { name }) });
      seriesButton.setAttribute('aria-expanded', String(seriesFor === id));
      seriesButton.setAttribute('aria-controls', seriesEditor.id);
      if (id === focusId && focusAction === 'series') target = seriesButton;
      actions.append(earlier, later, resize, seriesButton);
      card.append(element('strong', { text: name, title: name }), actions);
      card.addEventListener('dragstart', (event) => {
        dragId = id;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', id);
      });
      card.addEventListener('dragover', (event) => {
        if (!dragId || dragId === id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        card.dataset.drop = '';
      });
      card.addEventListener('dragleave', (event) => { if (!card.contains(event.relatedTarget)) delete card.dataset.drop; });
      card.addEventListener('drop', (event) => {
        event.preventDefault();
        if (dragId && dragId !== id) move(dragId, index, 'size');
        dragId = undefined;
      });
      card.addEventListener('dragend', () => {
        dragId = undefined;
        for (const item of board.children) delete item.dataset.drop;
      });
      return card;
    }));
    if (!ids.length) board.append(element('p', 'muted', t('Choose readings to arrange the Overview.')));
    target?.focus();
  }

  function move(id, index, focusAction) {
    const ids = [...selection];
    const current = ids.indexOf(id);
    if (current < 0 || index < 0 || index >= ids.length) return;
    ids.splice(current, 1);
    ids.splice(index, 0, id);
    selection = new Set(ids);
    defaults = false;
    wide ??= new Set();
    updateChecks();
    renderBoard(id, focusAction);
  }

  function renderReadings(container, matches) {
    const selectable = (row) => {
      const label = element('label', 'stats-settings-reading');
      label.toggleAttribute('data-unavailable', row.status === 'unavailable');
      const input = Object.assign(element('input'), { type: 'checkbox', value: row.id });
      const text = element('span', '', t(row.name));
      const detail = [row.device, row.deviceId !== row.device && row.deviceId, row.unit,
        row.status === 'unavailable' ? t(row.reason || 'The selected sensor is disconnected.') : row.source].filter(Boolean).join(' · ');
      if (detail) text.append(element('small', 'muted', detail));
      label.append(input, text);
      return label;
    };
    const available = matches.filter((row) => row.status !== 'unavailable');
    const unavailable = matches.filter((row) => row.status === 'unavailable');
    container.replaceChildren(...available.map(selectable));
    if (unavailable.length) container.append(element('h4', 'stats-unavailable-heading', t('Unavailable readings')),
      ...unavailable.map(selectable));
    if (!matches.length) container.append(element('p', 'muted', t('No matching readings.')));
  }

  function renderList() {
    renderReadings(list, searchSensors(settings.choices, search.value));
    updateChecks();
  }

  function renderSeries() {
    const primary = settings.choices.find(({ id }) => id === seriesFor);
    seriesEditor.hidden = !primary || !selection.has(seriesFor);
    if (seriesEditor.hidden) return;
    seriesTitle.textContent = t('Chart series for {name}', { name: t(primary.name) });
    const picked = series.get(seriesFor) ?? new Set();
    const rank = (row) => picked.has(row.id) ? 0
      : primary.deviceId && row.deviceId === primary.deviceId ? 1 : row.group === primary.group ? 2 : 3;
    const rows = searchSensors(settings.choices.filter(({ id }) => id !== seriesFor), seriesSearch.value)
      .sort((a, b) => rank(a) - rank(b));
    renderReadings(seriesList, rows);
    updateSeriesChecks(picked);
  }

  function updateSeriesChecks(picked) {
    seriesCount.textContent = t('{count} of {limit} additional readings', { count: picked.size, limit: settings.seriesLimit });
    updateListChecks(seriesList, picked, settings.seriesLimit);
  }

  async function load({ keepDraft = false } = {}) {
    form.inert = true;
    loadStatus.textContent = window.LastraI18n.t('Reading available sensors…');
    try {
      settings = await api.getStatsSettings();
      if (!keepDraft) {
        defaults = settings.selected === null;
        selection = new Set(defaults ? settings.defaults : settings.selected.map(({ id }) => id));
        wide = Array.isArray(settings.wide) ? new Set(settings.wide) : null;
        series = new Map(settings.series.map(({ id, readings }) => [id, new Set(readings.map((row) => row.id))]));
        style.value = settings.style;
        layout.value = settings.layout;
      } else if (defaults) selection = new Set(settings.defaults);
      updateChart();
      renderList();
      renderBoard();
      renderSeries();
      status.textContent = settings.warning ?? '';
      loadStatus.textContent = '';
    } catch {
      loadStatus.textContent = window.LastraI18n.t('Could not read Stats settings. Reopen this section to retry.');
    } finally {
      form.inert = !settings;
    }
  }

  details.addEventListener('toggle', () => { if (details.open && !settings) void load(); });
  style.addEventListener('change', updateChart);
  search.addEventListener('input', renderList);
  seriesSearch.addEventListener('input', renderSeries);
  seriesList.addEventListener('change', ({ target }) => {
    const picked = series.get(seriesFor) ?? new Set();
    if (target.checked && picked.size < settings.seriesLimit) picked.add(target.value);
    else picked.delete(target.value);
    if (picked.size) series.set(seriesFor, picked);
    else series.delete(seriesFor);
    defaults = false;
    updateChecks();
    updateSeriesChecks(picked);
    renderBoard();
  });
  list.addEventListener('change', ({ target }) => {
    defaults = false;
    if (target.checked && selection.size < settings.limit) selection.add(target.value);
    else {
      selection.delete(target.value);
      wide?.delete(target.value);
      series.delete(target.value);
      if (seriesFor === target.value) seriesFor = undefined;
    }
    updateChecks();
    renderBoard();
    renderSeries();
  });
  byId('stats-settings-clear').addEventListener('click', () => {
    defaults = false;
    selection.clear();
    wide = null;
    series.clear();
    seriesFor = undefined;
    renderList();
    renderBoard();
    renderSeries();
  });
  byId('stats-settings-defaults').addEventListener('click', () => {
    defaults = true;
    selection = new Set(settings.defaults);
    wide = null;
    series.clear();
    seriesFor = undefined;
    renderList();
    renderBoard();
    renderSeries();
  });
  byId('stats-settings-refresh').addEventListener('click', () => void load({ keepDraft: true }));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (form.inert || apply.disabled) return;
    form.inert = true;
    try {
      const result = await api.setStatsSettings({ ids: defaults ? null : [...selection], style: style.value, layout: layout.value,
        wide: wide === null ? null : [...wide], series: [...series].map(([id, readings]) => ({ id, readings: [...readings] })) });
      if (!result.ok) throw new Error(result.message);
      status.textContent = window.LastraI18n.t('Stats settings saved and applied to the deck.');
    } catch (error) {
      status.textContent = error.message || window.LastraI18n.t('Could not save Stats settings.');
    } finally {
      form.inert = false;
    }
  });
}
