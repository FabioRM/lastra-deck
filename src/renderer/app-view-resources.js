'use strict';

{
  const { element: node } = window.LastraDom;
  const names = { electron: 'Lastra', hardware: 'Hardware monitor', media: 'Windows media helper' };
  const percent = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
  const memory = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

  function resourceCard(row) {
    const root = node('article', 'resource-card');
    root.append(node('h4', '', names[row.id]));
    if (row.status !== 'ready') {
      root.append(node('p', 'app-view-secondary', row.status === 'inactive' ? 'Inactive' : 'Unavailable'));
      return root;
    }
    const values = node('dl', 'resource-values');
    values.append(node('dt', '', 'CPU'),
      node('dd', '', row.cpuStatus === 'measuring' ? 'Measuring…'
        : row.cpuPercent === null ? 'Unavailable' : `${percent.format(row.cpuPercent)}%`),
      node('dt', '', 'Working set'),
      node('dd', '', row.workingSetMiB === null ? 'Unavailable' : `${memory.format(row.workingSetMiB)} MiB`));
    root.append(values);
    if (row.count > 1) root.append(node('p', 'app-view-secondary', `${row.count} processes`));
    return root;
  }

  function mount(container, read) {
    const message = node('p', 'app-view-secondary');
    message.setAttribute('role', 'status');
    const rows = node('div', 'resource-cards');
    const embed = node('p', 'app-view-secondary');
    embed.hidden = true;
    container.replaceChildren(message, rows, embed);
    let settings;

    function render(state) {
      const text = state.error ?? (state.status === 'loading' ? 'Reading process usage…' : '');
      if (message.textContent !== text) message.textContent = text;
      message.hidden = !text;
      rows.replaceChildren(...(state.rows ?? []).map(resourceCard));
      embed.hidden = !state.embed?.active && state.embed?.total === undefined;
      if (!embed.hidden) {
        const { active, requests, limit, blocked, total } = state.embed;
        const text = active ? `Web embed · ${requests}/${limit} requests this minute` : `Last web embed · ${total} requests`;
        embed.textContent = text + (blocked ? ` · ${blocked} blocked` : '');
      }
      if (state.settings) settings = state.settings;
    }

    const feed = window.createVisibleFeed(read, render, {
      error: 'Could not read process usage.',
      interval: () => settings?.intervals.resources ?? 2_000,
    });
    return feed;
  }

  window.LastraResourceView = { mount };
}
