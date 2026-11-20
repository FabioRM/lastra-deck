'use strict';

(() => {
  const { element, button } = window.LastraDom;
  const api = window.lastraEditor;
  const dialog = document.getElementById('integration-setup');
  const trigger = document.getElementById('integration-setup-open');
  const refresh = dialog.querySelector('[data-setup-refresh]');
  const close = dialog.querySelector('[data-setup-close]');
  const status = dialog.querySelector('[data-setup-status]');
  const choices = dialog.querySelector('[data-setup-choices]');
  const detail = dialog.querySelector('[data-setup-detail]');
  const labels = {
    ready: 'Available', setup: 'Needs setup', configured: 'Configured', limited: 'Limited', offline: 'Offline',
    unavailable: 'Unavailable', unknown: 'Not observed', granted: 'Granted', required: 'Required', observed: 'Observed',
  };
  let result;
  let selection;
  let revision = 0;
  let opening = false;

  const stateLabel = (state) => Object.hasOwn(labels, state) ? labels[state] : labels.unknown;

  function list(heading, rows) {
    if (!rows?.length) return [];
    const values = element('dl');
    for (const { name, state } of rows) values.append(element('dt', '', name), element('dd', '', stateLabel(state)));
    return [element('h4', '', heading), values];
  }

  async function openAction(provider, action) {
    if (opening) return;
    opening = true;
    const request = revision;
    status.textContent = window.LastraI18n.t('Opening setup…');
    try {
      const answer = await api.openIntegrationSetup({ provider, action });
      if (dialog.open && revision === request) status.textContent = answer?.ok ? window.LastraI18n.t('Setup opened.') : 'The selected setup could not be opened.';
    } catch {
      if (dialog.open && revision === request) status.textContent = 'The selected setup could not be opened.';
    } finally { opening = false; }
  }

  function render() {
    choices.replaceChildren();
    detail.replaceChildren();
    if (!result?.providers?.length) return;
    const selected = result.providers.find(({ id }) => id === selection) ?? result.providers[0];
    selection = selected.id;
    for (const { id, name, state } of result.providers) {
      const item = button(name, () => {
        selection = id;
        render();
        choices.querySelector('[aria-pressed="true"]')?.focus();
      });
      item.setAttribute('aria-pressed', String(id === selection));
      item.append(element('small', '', stateLabel(state)));
      choices.append(item);
    }
    detail.append(element('h3', '', selected.name), element('p', '', selected.hint), element('p', '', `Status · ${stateLabel(selected.state)}`));
    if (selected.observedAt !== null) detail.append(element('p', '', `Last observation · ${new Date(selected.observedAt).toLocaleString()}`));
    detail.append(...list('Controls', selected.controls), ...list('Permissions and prerequisites', selected.permissions));
    for (const action of selected.actions) detail.append(button(action.label, () => openAction(selected.id, action.id)));
  }

  async function load() {
    const request = ++revision;
    refresh.disabled = true;
    status.textContent = window.LastraI18n.t('Reading local provider status…');
    try {
      const next = await api.readIntegrationSetup();
      if (request !== revision || !dialog.open) return;
      if (next?.version !== 1 || !Array.isArray(next.providers)) throw new Error();
      result = next;
      render();
      status.textContent = window.LastraI18n.t('Showing local observations.');
    } catch {
      if (request === revision && dialog.open) status.textContent = window.LastraI18n.t('Integration status is unavailable.');
    } finally {
      if (request === revision) refresh.disabled = false;
    }
  }

  trigger.addEventListener('click', () => {
    if (dialog.open) return;
    result = undefined;
    render();
    dialog.showModal();
    void load();
  });
  refresh.addEventListener('click', load);
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { revision++; });
})();
