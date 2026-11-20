'use strict';

{
  const { element } = window.LastraDom;
  const LABELS = { waiting: 'Waiting', up: 'Available', retrying: 'Retrying', down: 'Down' };
  const KINDS = { http: 'HTTP', tcp: 'TCP', dns: 'DNS', ping: 'Ping', certificate: 'HTTPS certificate', heartbeat: 'Job heartbeat' };
  const time = new Intl.DateTimeFormat('en-GB', { timeStyle: 'medium' });
  const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'medium' });

  function timestamp(label, stamp, { stale = false, fallback = 'Unavailable' } = {}) {
    const line = element('p', 'app-view-secondary', `${label}${stale ? ' (last observed)' : ''} · `);
    const value = Number.isFinite(stamp) ? new Date(stamp) : null;
    if (!value || !Number.isFinite(value.getTime())) line.append(fallback);
    else {
      const reading = element('time', '', dateTime.format(value));
      reading.dateTime = value.toISOString();
      line.append(reading);
    }
    return line;
  }

  function checkCard(check) {
    const card = element('article', 'service-check');
    card.dataset.checkId = check.id;
    card.tabIndex = -1;
    const header = element('header');
    const deadline = check.kind === 'certificate' || check.kind === 'heartbeat';
    const badge = element('span', 'service-check-state', deadline && check.status === 'down' ? 'Check failed' : LABELS[check.status]);
    badge.dataset.state = check.status;
    header.append(element('h4', '', check.name), badge);
    const details = [KINDS[check.kind]];
    if (check.latest) {
      const { detail, latencyMs, at } = check.latest;
      details.push(detail);
      if (Number.isFinite(latencyMs)) details.push(`${latencyMs} ms`);
      details.push(time.format(at));
    } else details.push(`Every ${check.intervalMs / 1_000} s`);
    card.append(header, element('p', 'app-view-secondary', details.join(' · ')));
    if (deadline) {
      const { timing } = check;
      card.append(timestamp('Last successful check', check.lastSuccessfulAt, { fallback: 'None yet' }));
      if (check.kind === 'certificate') card.append(timestamp('Certificate expiry', timing?.expiresAt, { stale: timing?.stale }));
      else card.append(timestamp('Last heartbeat', timing?.heartbeatAt, { stale: timing?.stale }),
        timestamp('Heartbeat deadline', timing?.deadlineAt, { stale: timing?.stale }));
    }

    if (check.history.length) {
      const successes = check.history.filter(({ ok }) => ok).length;
      const percentage = Math.round(successes * 100 / check.history.length);
      const chart = element('div', 'service-check-history');
      chart.setAttribute('role', 'img');
      chart.setAttribute('aria-label', `${successes} successful checks out of ${check.history.length}`);
      for (const point of check.history.slice(-30)) {
        const tick = element('span');
        tick.dataset.result = point.ok ? 'up' : 'down';
        tick.title = `${time.format(point.at)} · ${point.ok ? 'Available' : 'Failed'}`;
        chart.append(tick);
      }
      card.append(chart, element('p', 'app-view-secondary', `${percentage}% successful · ${check.history.length} recent checks`));
    }
    return card;
  }

  function mount(container, read, dispatch) {
    const root = element('section', 'service-health');
    const toolbar = element('header');
    const configure = element('button', '', 'Edit checks');
    configure.type = 'button';
    const notice = element('p', 'service-health-notice');
    notice.setAttribute('role', 'status');
    const list = element('div', 'service-health-list');
    toolbar.append(configure);
    root.append(toolbar, notice, list);
    container.replaceChildren(root);
    let signature;
    let targetId;

    configure.addEventListener('click', async () => {
      configure.disabled = true;
      try {
        await dispatch({ action: 'configure' });
      } finally {
        configure.disabled = false;
      }
    });

    function render(state) {
      const next = JSON.stringify(state);
      if (signature === next) return;
      signature = next;
      notice.textContent = state.error ?? (state.status === 'loading' ? 'Reading service checks…'
        : state.status === 'empty' ? 'Add a check to track its availability.' : '');
      list.replaceChildren(...(state.checks ?? []).map(checkCard));
      focusTarget();
    }

    function focusTarget() {
      if (!targetId) return;
      const card = list.querySelector(`[data-check-id="${CSS.escape(targetId)}"]`);
      if (card) {
        card.scrollIntoView({ block: 'nearest' });
        card.focus({ preventScroll: true });
        targetId = null;
      }
    }

    const feed = window.createVisibleFeed(read, render, { error: 'Could not read service checks.' });
    return { ...feed, focusItem(id) { targetId = id; focusTarget(); } };
  }

  window.LastraServiceHealth = { mount };
}
