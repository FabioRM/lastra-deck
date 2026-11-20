'use strict';

{
  const { element } = window.LastraWidgetComponents;
  const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'medium' });
  const gestures = { tap: 'Tap', hold: 'Long press', double: 'Double tap', confirm: 'Confirmed' };
  const outcomes = { succeeded: 'Succeeded', failed: 'Failed', warning: 'Continued after a failure', skipped: 'Skipped', cancelled: 'Stopped' };

  function renderStepResults(entry) {
    const content = document.createDocumentFragment();
    const list = element('ul', 'action-history-step-list');
    for (const { path, type, status, attempts } of entry.steps) {
      const item = element('li', '');
      const label = [...path, type.replaceAll('-', ' ')].join(' · ');
      item.append(element('span', '', label), element('strong', '', outcomes[status]));
      if (attempts > 1) item.append(element('small', '', `${attempts} attempts`));
      list.append(item);
    }
    content.append(list);
    if (entry.stepCount > entry.steps.length) content.append(element('p', 'app-view-secondary',
      `Showing ${entry.steps.length} of ${entry.stepCount} steps.`));
    return content;
  }

  function renderEntry(entry) {
    const row = element('li', 'action-history-entry');
    const header = element('header');
    const outcome = element('span', 'action-history-outcome', outcomes[entry.outcome] ?? 'Failed');
    outcome.dataset.outcome = entry.outcome;
    header.append(element('h4', '', entry.label), outcome);
    const time = element('time', '', date.format(entry.at));
    time.dateTime = new Date(entry.at).toISOString();
    const origins = { deck: 'Deck', agent: 'Agent', app: 'App view' };
    const context = [origins[entry.origin], entry.context, gestures[entry.gesture]].filter(Boolean);
    const detail = element('p', 'app-view-secondary');
    detail.append(context.join(' · ') + ' · ', time);
    row.append(header, detail);
    if (entry.steps?.length) {
      const steps = element('details', 'action-history-steps');
      steps.append(element('summary', '', 'Step results'));
      steps.addEventListener('toggle', () => {
        if (!steps.open || steps.childElementCount > 1) return;
        steps.append(renderStepResults(entry));
      });
      row.append(steps);
    }
    return row;
  }

  function mount(container, read) {
    const root = element('section', 'action-history');
    const notice = element('p', 'app-view-secondary');
    notice.setAttribute('role', 'status');
    const list = element('ol', 'action-history-list');
    root.append(notice, list);
    container.replaceChildren(root);
    let signature;

    return window.createVisibleFeed(read, (state) => {
      const key = JSON.stringify(state);
      if (key === signature) return;
      signature = key;
      const entries = state.entries ?? [];
      notice.textContent = state.error ?? (state.status === 'loading' ? 'Reading action history…'
        : entries.length ? '' : 'No actions have run in this session.');
      notice.hidden = !notice.textContent;
      list.replaceChildren(...entries.map(renderEntry));
    }, { error: 'Could not read action history.' });
  }

  window.LastraActionHistory = { mount, renderStepResults };
}
