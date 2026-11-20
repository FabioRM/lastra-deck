'use strict';

(() => {
  const { element, button } = window.LastraDom;
  const messages = {
    loading: 'Reading Kubernetes…', disabled: 'Set up a Kubernetes context and namespace.',
    unavailable: 'Could not read the selected Kubernetes namespace.',
  };

  function option(value, label) {
    const node = element('option', '', label);
    node.value = value;
    return node;
  }

  function workloadList(label) {
    const section = element('section');
    const rows = element('ul', 'kubernetes-items');
    section.append(element('h3', '', label), rows);
    return { section, rows };
  }

  function workload(name, state, description, attention) {
    const row = element('li', 'kubernetes-workload');
    const tag = element('span', 'kubernetes-state', state);
    tag.dataset.attention = String(attention);
    row.append(element('strong', 'kubernetes-name', name), tag, element('span', 'kubernetes-secondary', description));
    return row;
  }

  function renderRows(rows, data, render, empty, unavailable) {
    rows.replaceChildren(...(data?.length ? data.map(render) : [element('li', 'kubernetes-secondary', data ? empty : unavailable)]));
  }

  function mount(container, read, dispatch) {
    const root = element('section', 'kubernetes-view');
    const toolbar = element('div', 'kubernetes-toolbar');
    const targetLabel = element('label', 'kubernetes-target', 'Target');
    const target = element('select');
    targetLabel.append(target);
    const setup = button('Edit connection');
    const refresh = button('Refresh');
    refresh.className = 'kubernetes-refresh';
    toolbar.append(targetLabel, refresh, setup);
    const scope = element('p', 'kubernetes-scope');
    const feedback = element('p', 'kubernetes-secondary');
    feedback.setAttribute('role', 'status');
    const pods = workloadList('Pods');
    const deployments = workloadList('Deployments');
    const columns = element('div', 'kubernetes-columns');
    columns.append(pods.section, deployments.section);
    const panel = element('section', 'kubernetes-logs');
    const logHeading = element('h3');
    logHeading.tabIndex = -1;
    const logStatus = element('p', 'kubernetes-secondary');
    logStatus.setAttribute('role', 'status');
    const output = element('pre');
    output.tabIndex = 0;
    const close = button('Close logs');
    close.className = 'kubernetes-close-logs';
    panel.append(logHeading, close, logStatus, output);
    panel.hidden = true;
    root.append(toolbar, scope, feedback, panel, columns);
    container.replaceChildren(root);
    let data;
    let signature;
    let visible = false;
    let generation = 0;
    let readingLog = false;

    function clearLogs() {
      generation++;
      readingLog = false;
      panel.hidden = true;
      output.textContent = '';
    }

    async function showLogs(row, containerName, trigger) {
      if (readingLog || !visible) return;
      clearLogs();
      const token = generation;
      readingLog = true;
      panel.hidden = false;
      output.hidden = true;
      logHeading.textContent = `${row.name} · ${containerName}`;
      logStatus.textContent = 'Reading log…';
      panel.scrollIntoView({ block: 'nearest' });
      logHeading.focus({ preventScroll: true });
      close.onclick = () => {
        clearLogs();
        void dispatch({ action: 'stop-logs' }, true);
        if (trigger.isConnected) trigger.focus({ preventScroll: true });
      };
      const response = await dispatch({ action: 'logs', pod: row.name, uid: row.uid, container: containerName }, true);
      if (token !== generation || !visible) return;
      readingLog = false;
      output.textContent = response?.text ?? '';
      output.hidden = !output.textContent;
      logStatus.textContent = !response?.ok ? 'Could not read the selected pod log.'
        : output.hidden ? 'The pod returned no log lines.' : 'Up to 80 recent lines';
    }

    function podRow(row) {
      const { name, waiting, phase, ready, containers, restarts } = row;
      const node = workload(name, waiting || phase, `${ready}/${containers.length} ready · ${restarts} restart${restarts === 1 ? '' : 's'}`,
        Boolean(waiting || (phase !== 'Succeeded' && (phase !== 'Running' || ready < containers.length)) || restarts));
      if (data.logs && containers.length) {
        const actions = element('div', 'kubernetes-pod-actions');
        const choose = element('select');
        choose.setAttribute('aria-label', `Container for ${name}`);
        choose.replaceChildren(...containers.map((item) => option(item, item)));
        choose.hidden = containers.length === 1;
        const logs = button('Logs');
        logs.addEventListener('click', () => void showLogs(row, choose.value, logs));
        actions.append(choose, logs);
        node.append(actions);
      }
      return node;
    }

    function render(value) {
      const next = JSON.stringify(value);
      if (next === signature) return;
      signature = next;
      if (data?.id !== value.id || value.status === 'unavailable' || !value.logs) {
        if (readingLog) void dispatch({ action: 'stop-logs' }, true);
        clearLogs();
      }
      data = value;
      targetLabel.hidden = !value.targets?.length;
      if (value.targets?.length) {
        target.replaceChildren(...value.targets.map(({ id, label }) => option(id, label)));
        target.value = value.id;
      }
      scope.textContent = value.id ? `Context ${value.context} · Namespace ${value.namespace}` : '';
      refresh.hidden = !value.id;
      feedback.textContent = value.message ?? value.error ?? messages[value.status]
        ?? (value.more ? 'Showing up to 60 pods and 60 deployments, with problems first.' : '');
      columns.hidden = !value.id;
      if (columns.hidden) return;
      renderRows(pods.rows, value.pods, podRow, 'No pods in this namespace.', 'Pod status unavailable.');
      renderRows(deployments.rows, value.deployments, (row) => workload(row.name, row.state,
        `${row.ready}/${row.desired} ready · ${row.available} available`, row.state === 'Stalled'),
      'No deployments in this namespace.', 'Rollout status unavailable.');
    }

    const feed = window.createVisibleFeed(read, render, { interval: 15_000, error: messages.unavailable });
    setup.addEventListener('click', () => void dispatch({ action: 'configure' }));
    refresh.addEventListener('click', feed.reload);
    target.addEventListener('change', async () => {
      target.disabled = true;
      clearLogs();
      try {
        if (await dispatch({ action: 'select', target: target.value })) {
          render({ status: 'loading' });
          feed.reload();
        } else if (data?.id) target.value = data.id;
      } finally {
        target.disabled = false;
      }
    });

    function setVisible(next) {
      if (visible === next) return;
      visible = next;
      feed.setVisible(next);
      if (!visible) {
        clearLogs();
        void dispatch({ action: 'stop' }, true);
      }
    }

    return { setVisible, destroy: () => setVisible(false) };
  }

  window.LastraKubernetes = { mount };
})();
