'use strict';

(() => {
  const { element: node, button } = window.LastraDom;
  const POLL_MS = 5000;
  const PAGE_SIZE = 4;
  const statuses = {
    loading: 'Reading the Docker context…',
    missing: 'Docker CLI is unavailable. Install Docker or add docker to PATH.',
    unavailable: 'The active Docker context could not be read.',
    remote: 'This context uses a remote connection. Choose a local Docker context.',
    'engine-unavailable': 'Could not reach the local Docker engine. Check that it is running.',
  };
  const stateLabels = {
    created: 'Created', running: 'Running', paused: 'Paused', restarting: 'Restarting', removing: 'Removing',
    exited: 'Exited', dead: 'Dead', unknown: 'Unknown state',
  };
  const healthLabels = { healthy: 'Healthy', unhealthy: 'Unhealthy', starting: 'Health check starting' };
  const actions = { start: 'Start', stop: 'Stop', restart: 'Restart' };

  function bytes(value) {
    if (value == null) return '—';
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    return value.toLocaleString('en', { maximumFractionDigits: unit ? 1 : 0 }) + ' ' + units[unit];
  }

  function metricsList(metrics) {
    const list = node('dl', 'docker-metrics');
    const items = [
      ['CPU', metrics.cpuPercent == null ? '—' : metrics.cpuPercent.toFixed(1) + '%'],
      ['Memory', bytes(metrics.memoryBytes) + (metrics.memoryLimit ? ' / ' + bytes(metrics.memoryLimit) : '')],
      ['Network RX / TX', bytes(metrics.networkRx) + ' / ' + bytes(metrics.networkTx)],
      ['Block read / write', bytes(metrics.blockRead) + ' / ' + bytes(metrics.blockWrite)],
    ];
    for (const [label, text] of items) {
      const row = node('div');
      row.append(node('dt', 'app-view-secondary', label), node('dd', '', text));
      list.append(row);
    }
    return list;
  }

  function mount(container, read, dispatch) {
    let data = { status: 'loading', containers: [] };
    let visible = false;
    let token = 0;
    let timer;
    let id = null;
    let project = null;
    let projectPicker = false;
    let page = 0;
    let detail = null;
    let detailMissing = false;
    let logs = null;
    let confirmation = null;
    let busy = false;
    let drawn = '';

    function resetSelection() {
      id = null;
      detail = logs = confirmation = null;
      detailMissing = false;
    }

    function select(next) {
      if (id === next) return;
      resetSelection();
      id = next;
      reload();
    }

    async function action(name, extras = {}) {
      if (busy || !data.contextKey) return;
      clearTimeout(timer);
      const current = ++token;
      busy = true;
      confirmation = null;
      render();
      const result = await dispatch({ action: name, contextKey: data.contextKey, id, ...extras });
      if (current !== token || !visible) return;
      busy = false;
      if (result?.logs) logs = result.logs;
      if (typeof result?.controls === 'boolean') data.controls = result.controls;
      render();
      reload();
    }

    function render() {
      if (!visible) return;
      const projectNames = [...new Set(data.containers.map((item) => item.project))];
      const filtered = data.containers.filter((item) => project === null || item.project === project);
      if (!filtered.some((item) => item.id === id)) resetSelection();
      const count = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      page = Math.min(page, count - 1);
      const signature = JSON.stringify([data, project, projectPicker, page, id, detail, detailMissing, logs, confirmation, busy]);
      if (signature === drawn) return;
      drawn = signature;

      const scroll = container.querySelector('.docker-log-body')?.scrollTop ?? 0;
      const layout = node('section', 'docker-view');
      if (data.context) layout.append(node('p', 'app-view-secondary docker-context', 'Context ' + data.context));
      if (data.status !== 'ready') {
        layout.append(node('p', 'app-view-secondary', statuses[data.status] ?? statuses.unavailable));
        container.replaceChildren(layout);
        return;
      }

      const columns = node('div', 'docker-columns');
      const browser = node('section', 'docker-browser');
      const filter = node('div', 'docker-controls docker-filter');
      const projects = button(project === null ? 'All containers' : project || 'Standalone', () => {
        projectPicker = !projectPicker;
        render();
      }, { disabled: busy });
      projects.setAttribute('aria-expanded', String(projectPicker));
      projects.setAttribute('aria-label', 'Filter by Compose project');
      filter.append(projects, node('span', 'app-view-secondary', filtered.length + ' containers'));
      browser.append(filter);

      if (projectPicker) {
        const choices = node('div', 'docker-projects');
        for (const option of [null, ...projectNames]) {
          choices.append(button(option === null ? 'All containers' : option || 'Standalone', () => {
            project = option;
            projectPicker = false;
            page = 0;
            resetSelection();
            reload();
          }, { pressed: project === option }));
        }
        browser.append(choices);
      } else {
        for (const item of filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
          const entry = button('', () => select(item.id), { pressed: item.id === id, disabled: busy });
          entry.className = 'docker-container';
          const description = [item.service, stateLabels[item.state], healthLabels[item.health]].filter(Boolean).join(' · ');
          entry.append(node('strong', '', item.name), node('span', 'app-view-secondary', description));
          browser.append(entry);
        }
        if (count > 1) {
          const pager = node('div', 'docker-controls docker-pager');
          pager.append(
            button('‹', () => { page--; render(); }, { disabled: !page || busy, label: 'Previous containers' }),
            node('span', 'app-view-secondary', (page + 1) + ' / ' + count),
            button('›', () => { page++; render(); }, { disabled: page + 1 >= count || busy, label: 'Next containers' }),
          );
          browser.append(pager);
        }
        if (data.total > data.containers.length) {
          browser.append(node('p', 'app-view-secondary', 'Showing ' + data.containers.length + ' of ' + data.total + ' containers.'));
        }
        if (!filtered.length) browser.append(node('p', 'app-view-secondary', 'No containers found.'));
      }
      columns.append(browser);

      const selected = filtered.find((item) => item.id === id);
      const inspector = node('section', 'docker-inspector');
      if (selected) {
        inspector.append(node('h4', '', selected.name));
        const description = [selected.project, stateLabels[detail?.state ?? selected.state], healthLabels[detail?.health ?? selected.health],
          detail?.restartCount == null ? null : 'Restarts ' + detail.restartCount].filter(Boolean).join(' · ');
        inspector.append(node('p', 'app-view-secondary', description));

        if (detail?.metrics) inspector.append(metricsList(detail.metrics));
        if (!detail) inspector.append(node('p', 'app-view-secondary', detailMissing ? 'Container details are unavailable.' : 'Reading container details…'));
        else if (detail.state === 'running' && !detail.metrics) inspector.append(node('p', 'app-view-secondary', 'Container metrics are unavailable.'));

        const tools = node('div', 'docker-controls');
        tools.append(button(logs ? 'Refresh logs' : 'View logs', () => action('logs'), { disabled: busy }));
        for (const { host, port } of detail?.ports ?? []) {
          tools.append(button(host + ':' + port, () => action('open-port', { host, port }), { disabled: busy, label: 'Open HTTP port ' + port }));
        }
        inspector.append(tools);
        if (logs) {
          const panel = node('section', 'docker-log-panel');
          const logHeader = node('div', 'docker-controls');
          logHeader.append(node('h4', '', 'Recent logs'), button('Close logs', () => { logs = null; reload(); }));
          panel.append(logHeader);
          const output = node('pre', 'docker-log-body', logs.text || 'No recent log output.');
          output.tabIndex = 0;
          panel.append(output);
          if (logs.clipped) panel.append(node('p', 'app-view-secondary', 'Log output reached the size limit.'));
          inspector.append(panel);
        }

        const controls = node('div', 'docker-controls docker-lifecycle');
        controls.append(button(data.controls ? 'Disable controls' : 'Enable controls',
          () => action('allow-controls', { enabled: !data.controls }), { pressed: data.controls, disabled: busy }));
        if (data.controls && confirmation) {
          const label = actions[confirmation];
          controls.append(
            node('strong', 'docker-warning', label + ' ' + selected.name + ' on ' + data.context + '?'),
            button('Cancel', () => { confirmation = null; render(); }),
            button('Confirm ' + label.toLowerCase(), () => action(confirmation, { confirmed: true })),
          );
        } else if (data.controls && detail) {
          const valid = detail.state === 'running' ? ['stop', 'restart'] : ['created', 'exited'].includes(detail.state) ? ['start'] : [];
          for (const name of valid) {
            controls.append(button(actions[name] + '…', () => { confirmation = name; render(); }, { disabled: busy }));
          }
        }
        inspector.append(controls);
      } else {
        inspector.append(node('p', 'app-view-secondary', 'Select a container to see its details.'));
      }
      columns.append(inspector);
      layout.append(columns);
      container.replaceChildren(layout);
      const body = container.querySelector('.docker-log-body');
      if (body) body.scrollTop = scroll;
    }

    async function poll(current) {
      let snapshot;
      try { snapshot = await read(); } catch { snapshot = { status: 'unavailable', containers: [] }; }
      if (current !== token || !visible) return;
      if (data.contextKey !== snapshot.contextKey) {
        project = null;
        projectPicker = false;
        page = 0;
        resetSelection();
      }
      data = snapshot;
      render();
      if (data.status === 'ready' && id && !logs) {
        const result = await dispatch({ action: 'detail', contextKey: data.contextKey, id }, true);
        if (current !== token || !visible) return;
        detailMissing = !result?.detail;
        detail = result?.detail ?? null;
        render();
      }
      timer = setTimeout(() => poll(current), POLL_MS);
    }

    function reload() {
      clearTimeout(timer);
      const current = ++token;
      if (visible) {
        render();
        void poll(current);
      }
    }

    return {
      setVisible(active) {
        if (visible === active) return;
        visible = active;
        if (!visible) confirmation = null;
        busy = false;
        reload();
      },
      destroy() {
        visible = false;
        reload();
      },
    };
  }

  window.LastraDockerView = { mount };
})();
