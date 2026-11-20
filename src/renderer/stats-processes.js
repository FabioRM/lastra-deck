'use strict';

{
  function mount(api) {
    if (!api.statsProcesses) return null;
    const { element } = window.LastraWidgetComponents;
    const { lastReading } = window.LastraReadingTime;
    const trigger = document.getElementById('stats-processes-open');
    const dialog = element('dialog', '');
    dialog.id = 'stats-processes-dialog';
    dialog.setAttribute('aria-labelledby', 'stats-processes-title');
    const title = element('h2', '', 'Top processes');
    title.id = 'stats-processes-title';
    const close = element('button', '', window.LastraI18n.t('Close'));
    close.type = 'button';
    close.autofocus = true;
    const heading = element('header', '');
    heading.append(title, close);
    const selector = element('select', '');
    const collapse = { cpu: 'CPU across logical processors', memory: 'Private working set', gpu: 'Busiest GPU engine' };
    for (const [value, label] of Object.entries({ cpu: 'CPU', memory: 'Memory', gpu: 'GPU' })) {
      selector.append(Object.assign(element('option', '', label), { value }));
    }
    const choice = element('label', '', 'Rank by');
    choice.append(selector);
    const source = element('p', 'stats-processes-source');
    const controls = element('div', 'stats-processes-controls');
    controls.append(choice, source);
    const status = element('p', 'stats-processes-status');
    status.setAttribute('role', 'status');
    const table = element('table', '');
    const header = element('thead', '');
    const columns = element('tr', '');
    const amount = element('th', '', '');
    columns.append(element('th', '', 'Process'), element('th', '', 'PID'), amount);
    for (const cell of columns.children) cell.scope = 'col';
    header.append(columns);
    const rows = element('tbody', '');
    table.append(header, rows);
    const wrapper = element('div', 'stats-processes-results');
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Process rankings');
    wrapper.append(table);
    dialog.append(heading, controls, status, wrapper);
    document.body.append(dialog);

    const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
    const metricName = { cpu: 'CPU', memory: 'Private RAM', gpu: 'GPU' };
    const format = (value, metric) => {
      if (metric !== 'memory') return value < 0.1 ? '<0.1%' : `${formatter.format(value)}%`;
      return value >= 2 ** 30 ? `${formatter.format(value / 2 ** 30)} GiB` : `${formatter.format(value / 2 ** 20)} MiB`;
    };
    let visible = false;
    let subscribed = false;
    let signature;

    function render(state) {
      const metric = selector.value;
      const entries = state.rows ?? [];
      const messages = {
        loading: 'Reading Windows performance counters…',
        warming: 'Collecting a second GPU sample…',
        'gpu-unavailable': 'Windows GPU engine readings are unavailable.',
        unavailable: 'Windows process readings are unavailable.',
      };
      const time = lastReading(state.sampledAt);
      let note = messages[state.status] ?? state.error ?? '';
      if (state.status === 'cached') note = time ? `Cached · ${time}` : 'Cached reading';
      if (state.status === 'ready' && !entries.length) note = 'No processes are using this resource in the current sample.';
      if (status.textContent !== note) status.textContent = note;
      amount.textContent = metricName[metric];
      source.textContent = collapse[metric];
      wrapper.hidden = !entries.length;
      const key = JSON.stringify([metric, entries]);
      if (signature === key) return;
      signature = key;
      rows.replaceChildren(...entries.map(({ name, pid, value }) => {
        const row = element('tr', '');
        const label = element('th', '', name);
        label.scope = 'row';
        row.append(label, element('td', '', String(pid)), element('td', '', format(value, metric)));
        return row;
      }));
    }

    const feed = window.createVisibleFeed(() => api.statsProcesses({ type: 'read', metric: selector.value }), render, { interval: 5_000 });
    function subscribe(next) {
      if (subscribed === next) return;
      subscribed = next;
      feed.setVisible(next);
      if (!next) void api.statsProcesses({ type: 'stop' }).catch(() => {});
    }

    selector.addEventListener('change', () => { render({ status: 'loading' }); feed.reload(); });
    trigger.addEventListener('click', () => {
      if (!visible || document.querySelector('dialog[open]')) return;
      dialog.showModal();
      subscribe(true);
    });
    close.addEventListener('click', () => { subscribe(false); dialog.close(); });
    dialog.addEventListener('close', () => { if (!dialog.open) subscribe(false); });
    return {
      setVisible(next) {
        visible = next;
        if (!visible && dialog.open) {
          subscribe(false);
          dialog.close();
        }
      },
    };
  }

  window.LastraStatsProcesses = { mount };
}
