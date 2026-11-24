'use strict';

{
  const api = window.lastraEditor;
  const { t } = window.LastraI18n;
  const statsRoot = document.getElementById('stats-maintenance');
  const systemRoot = document.getElementById('system-maintenance');
  if (!statsRoot || !systemRoot || !api.maintenance) {
    /* Older preloads keep the page without these controls. */
  } else {
    let state = null;
    let busy = false;

    const text = (value) => String(value).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
    const attr = (value) => text(value).replace(/"/g, '&quot;');
    const option = (value, label, selected) =>
      `<option value="${attr(value)}"${selected ? ' selected' : ''}>${text(label)}</option>`;

    function statsMarkup() {
      const history = state.history.map((item) => option(item.hours, t(item.label), item.hours === state.historyHours)).join('');
      const intervals = state.intervals.map((item) => `<label class="field">${text(t(item.label))}<select data-command="interval" data-source="${attr(item.source)}">${
        item.options.map((value) => option(value, `${value / 1000} s`, value === item.value)).join('')
      }</select></label>`).join('');
      const watches = state.watchlist.length
        ? `<div class="deck-checks">${state.watchlist.map((item) =>
          `<label class="check"><input type="checkbox" data-command="watch" data-id="${attr(item.id)}"${item.pinned ? ' checked' : ''}>${text(t(item.label))}</label>`).join('')}</div>`
        : `<p class="muted">${text(t('No readings available.'))}</p>`;
      return `<section class="deck-settings-card"><h3>${text(t('Local Stats history'))}</h3><label class="field">${text(t('Keep local history'))}<select data-command="history">${history}</select></label></section>
        <p id="stats-maintenance-status" class="muted" role="status"></p>
        <section class="deck-settings-card"><h3>${text(t('Refresh intervals'))}</h3><div class="deck-settings-fields">${intervals || `<p class="muted">${text(t('Refresh intervals are unavailable.'))}</p>`}</div></section>
        <section class="deck-settings-card"><h3>${text(t('Watchlist readings'))}</h3>${watches}</section>`;
    }

    function agentMarkup(agent) {
      if (!agent) return `<section class="deck-settings-card"><h3>${text(t('Agent access'))}</h3><p class="muted">${text(t('Agent access is unavailable.'))}</p></section>`;
      const grants = `<optgroup label="${attr(t('Grant access'))}">${agent.grants.map((item) => option(item.id, item.label, false)).join('')}</optgroup>`
        + `<optgroup label="${attr(t('Grant for 15 minutes'))}">${agent.temporary.map((item) => option(item.id, item.label, false)).join('')}</optgroup>`;
      const projects = agent.projects.map((item) => option(`${item.id}:${item.revision}`, item.name, false)).join('');
      const clients = agent.clients.length ? `<ul class="maintenance-list">${agent.clients.map((client) => {
        const when = client.expiresAt == null ? '' : `<span class="muted">${text(t('Expires at {time}', { time: new Date(client.expiresAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) }))}</span>`;
        return `<li><div><strong>${text(t('Agent {id}', { id: client.short }))} · ${text(t(client.online ? 'Connected' : 'Offline'))}</strong><span class="muted">${text(client.summary)}</span>${client.project ? `<span class="muted">${text(client.project)}</span>` : ''}${when}</div><button type="button" data-command="revoke" data-id="${attr(client.id)}">${text(t('Revoke access'))}</button></li>`;
      }).join('')}</ul>` : `<p class="muted">${text(t('No agent clients.'))}</p>`;
      return `<section class="deck-settings-card" aria-labelledby="agent-access-heading">
        <h3 id="agent-access-heading">${text(t('Agent access'))}</h3>
        <p class="muted">${agent.locked ? text(t('Windows session unavailable')) : text(t('{count} connected', { count: agent.connected }))}</p>
        <label class="check"><input type="checkbox" data-command="agent-enabled"${agent.enabled ? ' checked' : ''}>${text(t('Enable local agent access'))}</label>
        <label class="check"><input type="checkbox" data-command="agent-paused"${agent.paused ? ' checked' : ''}${agent.enabled ? '' : ' disabled'}>${text(t('Pause agent access'))}</label>
        <div class="deck-settings-fields">
          <label class="field">${text(t('Grant access'))}<select data-command="grant-choice"${agent.grantEnabled ? '' : ' disabled'}>${grants}</select></label>
          <button type="button" data-command="grant"${agent.grantEnabled ? '' : ' disabled'}>${text(t('Grant and copy setup'))}</button>
        </div>
        ${projects ? `<div class="deck-settings-fields">
          <label class="field">${text(t('Project'))}<select data-command="project-choice"${agent.grantEnabled ? '' : ' disabled'}>${projects}</select></label>
          <button type="button" data-command="project-read"${agent.grantEnabled ? '' : ' disabled'}>${text(t('Grant project inventory'))}</button>
          <button type="button" data-command="project-actions"${agent.grantEnabled ? '' : ' disabled'}>${text(t('Grant project commands'))}</button>
        </div>` : ''}
        <h4>${text(t('Clients'))}</h4>
        ${clients}
        <p id="agent-access-status" class="muted" role="status"></p>
      </section>`;
    }

    function systemMarkup() {
      const measure = state.measuring ? ' disabled' : '';
      const touch = state.windows ? `<button type="button" data-command="touch">${text(t('Touch diagnostics'))}</button><button type="button" data-command="touch-setup">${text(t('Configure Windows touch'))}</button>` : '';
      const measurement = state.measurement ? `<h4>${text(t('Panel measurement'))}</h4><div class="deck-settings-fields">
            <button type="button" data-command="measure" data-phase="idle"${measure}>${text(t('Record idle (60 seconds)'))}</button>
            <button type="button" data-command="measure" data-phase="active"${measure}>${text(t('Record active (60 seconds)'))}</button>
          </div>` : '';
      return `${agentMarkup(state.agent)}
        <section class="deck-settings-card"><h3>${text(t('Diagnostics'))}</h3>
          <div class="deck-settings-fields">${touch}
            <button type="button" data-command="export-diagnostics">${text(t('Export diagnostics…'))}</button>
            <button type="button" data-command="reload">${text(t('Reload interface'))}</button>
            <button type="button" data-command="devtools">${text(t('Developer tools'))}</button>
          </div>
          ${measurement}
        </section>
        <section class="deck-settings-card"><h3>${text(t('Profile files'))}</h3>
          <div class="deck-settings-fields">
            <button type="button" data-command="open-profile">${text(t('Open profile JSON'))}</button>
            <button type="button" data-command="show-profile">${text(t('Show profile in folder'))}</button>
          </div>
        </section>
        <p id="system-maintenance-status" class="muted" role="status"></p>`;
    }

    function render() {
      statsRoot.innerHTML = statsMarkup();
      systemRoot.innerHTML = systemMarkup();
    }

    async function apply(command, statusId) {
      if (busy) return;
      busy = true;
      const status = document.getElementById(statusId);
      if (status) status.textContent = '';
      try {
        state = await api.setMaintenance(command);
        render();
      } catch (error) {
        const message = error.message || t('Could not update these settings.');
        render();
        const next = document.getElementById(statusId);
        if (next) next.textContent = message;
      } finally {
        busy = false;
      }
    }

    function onChange(event) {
      const control = event.target;
      const command = control.dataset?.command;
      if (command === 'history') void apply({ type: 'history', hours: Number(control.value) }, 'stats-maintenance-status');
      else if (command === 'interval') void apply({ type: 'interval', source: control.dataset.source, intervalMs: Number(control.value) }, 'stats-maintenance-status');
      else if (command === 'watch') void apply({ type: 'watch', id: control.dataset.id, pinned: control.checked }, 'stats-maintenance-status');
      else if (command === 'agent-enabled' || command === 'agent-paused') {
        void apply({ type: command, enabled: control.checked }, 'agent-access-status');
      }
    }

    function onClick(event) {
      const button = event.target.closest('button[data-command]');
      if (!button || button.disabled) return;
      const command = button.dataset.command;
      if (command === 'measure') void apply({ type: 'measure', phase: button.dataset.phase }, 'system-maintenance-status');
      else if (command === 'grant') {
        const choice = systemRoot.querySelector('[data-command="grant-choice"]');
        void apply({ type: 'grant', id: choice?.value }, 'agent-access-status');
      } else if (command === 'project-read' || command === 'project-actions') {
        const [id, revision] = (systemRoot.querySelector('[data-command="project-choice"]')?.value ?? '').split(':');
        void apply({ type: 'project-grant', kind: command === 'project-actions' ? 'actions' : 'read', id, revision: Number(revision) }, 'agent-access-status');
      } else if (command === 'revoke') void apply({ type: 'revoke', id: button.dataset.id }, 'agent-access-status');
      else void apply({ type: command }, 'system-maintenance-status');
    }

    statsRoot.addEventListener('change', onChange);
    systemRoot.addEventListener('change', onChange);
    systemRoot.addEventListener('click', onClick);

    window.LastraMaintenance = {
      refresh() {
        return api.maintenance().then((snapshot) => {
          state = snapshot;
          render();
        }).catch((error) => {
          systemRoot.textContent = error.message || t('Could not update these settings.');
        });
      },
    };
    void window.LastraMaintenance.refresh();
  }
}
