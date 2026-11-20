'use strict';

{
  const { element } = window.LastraWidgetComponents;
  const { lastReading } = window.LastraReadingTime;
  const number = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 6 });
  const messages = {
    loading: 'Reading configured metrics…',
    disabled: 'Configure a Prometheus connection to see metrics.',
    unavailable: 'Prometheus is unavailable.',
    authentication: 'Prometheus credentials are unavailable or rejected.',
    'invalid-result': 'The query did not return a finite numeric sample.',
    'multiple-series': 'Choose a query that returns one time series.',
    empty: 'The query returned no series.',
  };

  function mount(container, read, dispatch) {
    const root = element('section', 'prometheus-view');
    const actions = element('header', 'prometheus-actions');
    const setup = element('button', '', 'Edit connections');
    setup.type = 'button';
    actions.append(setup);
    const status = element('p', 'prometheus-note');
    status.setAttribute('role', 'status');
    const cards = element('div', 'prometheus-sources');
    root.append(actions, status, cards);
    container.replaceChildren(root);
    let latest;
    let signature;

    async function change(command) {
      try { await dispatch(command); } catch { status.textContent = 'Could not complete the Prometheus request.'; }
    }

    setup.addEventListener('click', () => { void change({ action: 'configure' }); });

    function metricRow(metric) {
      const row = element('div', 'prometheus-metric');
      row.dataset.status = metric.status;
      const label = element('dt', '', metric.name);
      const value = Number.isFinite(metric.value) ? number.format(metric.value) + (metric.unit ? ' ' + metric.unit : '') : 'Unavailable';
      const detail = element('dd', '');
      detail.append(element('strong', '', value));
      const freshness = metric.status === 'cached' ? ['Cached', lastReading(metric.updatedAt)].filter(Boolean).join(' · ')
        : metric.status === 'ready' ? lastReading(metric.updatedAt) : messages[metric.status];
      if (freshness) detail.append(element('small', '', freshness));
      row.append(label, detail);
      return row;
    }

    function sourceCard(source) {
      const card = element('article', 'prometheus-source');
      const heading = element('header', 'prometheus-source-heading');
      heading.append(element('h3', '', source.name));
      if (source.dashboardRevision) {
        const open = element('button', '', 'Open dashboard');
        open.type = 'button';
        open.dataset.dashboardId = source.id;
        open.setAttribute('aria-label', 'Open dashboard for ' + source.name);
        open.addEventListener('click', () => {
          const current = latest?.sources?.find(({ id }) => id === source.id);
          if (current?.dashboardRevision) void change({ action: 'open-dashboard', id: current.id, revision: current.dashboardRevision });
        });
        heading.append(open);
      }
      const hosts = new Map();
      for (const metric of source.metrics) {
        if (!hosts.has(metric.host)) hosts.set(metric.host, new Map());
        const services = hosts.get(metric.host);
        if (!services.has(metric.service)) services.set(metric.service, []);
        services.get(metric.service).push(metric);
      }
      card.append(heading);
      for (const [host, services] of hosts) {
        const hostGroup = element('section', 'prometheus-host');
        hostGroup.append(element('h4', '', host));
        for (const [service, metrics] of services) {
          const serviceGroup = element('section', 'prometheus-service');
          const list = element('dl', '');
          list.append(...metrics.map(metricRow));
          serviceGroup.append(element('h5', '', service), list);
          hostGroup.append(serviceGroup);
        }
        card.append(hostGroup);
      }
      return card;
    }

    const feed = window.createVisibleFeed(read, (state) => {
      const next = JSON.stringify(state);
      if (next === signature) return;
      latest = state;
      signature = next;
      status.textContent = state.message ?? state.error ?? messages[state.status] ?? '';
      const focused = document.activeElement?.dataset.dashboardId;
      cards.replaceChildren(...(state.sources ?? []).map(sourceCard));
      if (focused) cards.querySelector(`[data-dashboard-id="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
    }, { interval: 5_000, error: messages.unavailable });
    let visible = false;
    function setVisible(next) {
      if (next === visible) return;
      visible = next;
      feed.setVisible(next);
      if (!next) void dispatch({ action: 'stop' }, true).catch(() => {});
    }
    return { setVisible, destroy: () => setVisible(false) };
  }

  window.LastraPrometheus = { mount };
}
