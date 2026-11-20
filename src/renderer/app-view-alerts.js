'use strict';

{
  const { element, button } = window.LastraDom;
  const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const LABEL = { active: 'Active', recovered: 'Recovered', retired: 'Monitoring stopped' };

  function mount(container, read, dispatch, { openRelated }) {
    const root = element('section', 'alerts-view');
    const list = element('div', 'alerts-list');
    const notice = element('p', 'app-view-secondary');
    notice.setAttribute('role', 'status');
    root.append(notice, list);
    container.replaceChildren(root);
    let signature;

    function card(entry) {
      const status = [LABEL[entry.status], entry.acknowledgedAt == null ? '' : 'Acknowledged'].filter(Boolean).join(' · ');
      const outcome = element('span', 'alert-status', status);
      outcome.dataset.status = entry.status;
      const header = element('header');
      header.append(element('h4', '', entry.name), outcome);
      const detail = [entry.source, entry.detail, date.format(entry.updatedAt)];
      if (entry.occurrences > 1) detail.push(`${entry.occurrences} occurrences`);
      const node = element('article', 'alert-card');
      node.append(header, element('p', 'app-view-secondary', detail.filter(Boolean).join(' · ')));
      const actions = element('div', 'alert-actions');
      if (entry.acknowledgedAt == null) {
        const acknowledge = button('Acknowledge', async () => {
          acknowledge.disabled = true;
          if (await dispatch({ action: 'acknowledge', id: entry.id })) feed.reload();
          acknowledge.disabled = false;
        });
        actions.append(acknowledge);
      }
      if (entry.status !== 'retired' && entry.viewId) {
        actions.append(button('View check', () => openRelated(entry.viewId, entry.targetId)));
      }
      if (actions.childElementCount) node.append(actions);
      return node;
    }

    function render(state) {
      const key = JSON.stringify(state);
      if (key === signature) return;
      signature = key;
      const entries = state.entries ?? [];
      notice.textContent = state.error ?? state.warning ?? (state.status === 'loading' ? 'Reading alerts…' : entries.length ? '' : 'No alerts yet.');
      const active = entries.filter((entry) => entry.status === 'active');
      const history = entries.filter((entry) => entry.status !== 'active');
      const sections = [];
      for (const [title, items] of [['Active alerts', active], ['Recent history', history]]) {
        if (!items.length) continue;
        const group = element('section', 'alerts-group');
        group.append(element('h4', '', title), ...items.map(card));
        sections.push(group);
      }
      list.replaceChildren(...sections);
    }

    const feed = window.createVisibleFeed(read, render, { error: 'Could not read alerts.' });
    return feed;
  }

  window.LastraAlertInbox = { mount };
}
