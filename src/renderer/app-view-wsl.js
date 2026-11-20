'use strict';

(() => {
  const { element: node, button } = window.LastraDom;
  const PAGE_SIZE = 2;
  const POLL_MS = 3500;
  const labels = {
    loading: 'Reading WSL distributions…',
    empty: 'No WSL distributions found.',
    unavailable: 'Could not read WSL distributions. Retrying…',
    unsupported: 'WSL is unavailable on this system.',
  };
  const distroStates = {
    running: 'Running', stopped: 'Stopped', unknown: 'State unavailable',
    installing: 'Installing', uninstalling: 'Uninstalling',
  };
  const metricTime = new Intl.DateTimeFormat('en-GB', { timeStyle: 'medium' });
  const loadValue = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const memoryValue = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

  function metricsSummary(metrics) {
    const memory = (kib) => memoryValue.format(kib / (1024 * 1024));
    const summary = node('div', 'wsl-metrics');
    summary.setAttribute('role', 'status');
    summary.append(
      node('p', '', `Load average (1 min) ${loadValue.format(metrics.loadAverage)}`),
      node('p', '', `Memory available ${memory(metrics.memoryAvailableKiB)} / ${memory(metrics.memoryTotalKiB)} GiB`),
      node('p', 'app-view-secondary', `Linux snapshot at ${metricTime.format(metrics.sampledAt)}`),
    );
    return summary;
  }

  function mount(container, read, dispatch) {
    let state = { status: 'loading', distributions: [] };
    let selected = null;
    let confirm = null;
    let visible = false;
    let pendingAction = null;
    let metrics = null;
    let page = 0;
    let timer;
    let generation = 0;
    let drawn = '';

    async function action(type, distro, confirmed = false) {
      if (pendingAction) return;
      pendingAction = type;
      const current = generation;
      confirm = null;
      render();
      try {
        const result = await dispatch({ action: type, name: distro.name, confirmed });
        if (!result || !visible || current !== generation) return;
        if (type === 'stop') reload();
        else if (type === 'metrics' && result.metrics?.name === selected) metrics = result.metrics;
      } finally {
        pendingAction = null;
        if (visible) render();
      }
    }

    function render() {
      if (!visible) return;
      const target = state.distributions.find(({ name }) => name === selected)
        ?? state.distributions.find((distro) => distro.default) ?? state.distributions[0];
      selected = target?.name ?? null;
      const pages = Math.ceil(state.distributions.length / PAGE_SIZE);
      page = Math.max(0, Math.min(page, pages - 1));
      if (target?.state !== 'running' || target?.name !== confirm) confirm = null;
      if (target?.state !== 'running' || target.name !== metrics?.name) metrics = null;
      const signature = JSON.stringify([state, selected, confirm, pendingAction, page, metrics]);
      if (drawn === signature) return;
      drawn = signature;
      container.replaceChildren();

      if (state.status !== 'ready') {
        container.append(node('p', 'app-view-secondary', labels[state.status] ?? labels.unavailable));
        return;
      }

      const overview = node('div', 'wsl-overview');
      const listing = node('section', 'wsl-list');
      const heading = node('header', 'wsl-header');
      heading.append(node('h4', '', 'Distributions'));
      if (pages > 1) {
        const pager = node('div', 'wsl-actions');
        const previous = button('‹', () => { page--; render(); });
        const next = button('›', () => { page++; render(); });
        previous.disabled = page === 0;
        next.disabled = page === pages - 1;
        previous.setAttribute('aria-label', 'Previous distributions');
        next.setAttribute('aria-label', 'Next distributions');
        pager.append(previous, node('span', 'app-view-secondary', (page + 1) + ' / ' + pages), next);
        heading.append(pager);
      }
      listing.append(heading);
      for (const distro of state.distributions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
        const entry = button('', () => { selected = distro.name; confirm = null; render(); });
        entry.className = 'wsl-distro';
        entry.setAttribute('aria-pressed', String(distro.name === selected));
        entry.disabled = Boolean(pendingAction);
        entry.append(node('strong', '', distro.name),
          node('span', 'app-view-secondary', [distroStates[distro.state], 'WSL ' + distro.version,
            distro.default ? 'Default' : ''].filter(Boolean).join(' · ')));
        listing.append(entry);
      }

      const workspace = node('section', 'wsl-workspace');
      workspace.append(node('h4', '', target.name));
      const changing = target.state === 'installing' || target.state === 'uninstalling';
      if (confirm) {
        workspace.append(node('p', 'wsl-warning', 'Stop this distribution? Running Linux processes will be closed.'));
        const controls = node('div', 'wsl-actions');
        const stop = button('Stop ' + target.name, () => action('stop', target, true));
        stop.className = 'wsl-stop';
        controls.append(button('Cancel', () => { confirm = null; render(); }), stop);
        workspace.append(controls);
      } else {
        const controls = node('div', 'wsl-actions');
        const terminal = button('Open terminal', () => action('terminal', target));
        const code = button('Open in VS Code', () => action('code', target));
        const stop = button('Stop…', () => { confirm = target.name; render(); });
        const read = button(pendingAction === 'metrics' ? 'Reading metrics…' : 'Read metrics', () => action('metrics', target));
        read.title = 'Reads once. A distribution that just exited may restart.';
        terminal.disabled = code.disabled = Boolean(pendingAction) || changing;
        stop.disabled = read.disabled = Boolean(pendingAction) || target.state !== 'running';
        controls.append(terminal, code, read, stop);
        workspace.append(controls);
        workspace.append(node('p', 'app-view-secondary', target.state === 'stopped'
          ? 'Opening this distribution starts it.' : 'Terminal uses Windows Terminal. VS Code requires its WSL extension.'));
        if (metrics) workspace.append(metricsSummary(metrics));
      }
      overview.append(listing, workspace);
      container.append(overview);
    }

    async function refresh(current) {
      if (!visible || current !== generation) return;
      let snapshot;
      try { snapshot = await read(); } catch { snapshot = { status: 'unavailable', distributions: [] }; }
      if (current !== generation || !visible) return;
      state = snapshot;
      render();
      timer = setTimeout(() => refresh(current), POLL_MS);
    }

    function reload() {
      generation++;
      clearTimeout(timer);
      refresh(generation);
    }

    return {
      setVisible(active) {
        if (active === visible) return;
        visible = active;
        if (visible) render();
        reload();
      },
      destroy() {
        visible = false;
        reload();
      },
    };
  }

  window.LastraWslView = { mount };
})();
