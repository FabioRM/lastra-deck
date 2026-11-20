'use strict';

{
  const { element } = window.LastraWidgetComponents;
  const labels = { running: 'Running', waiting: 'Waiting', completed: 'Completed', failed: 'Failed' };
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

  function mount(container, read, dispatch) {
    const root = element('section', 'agent-activity');
    const status = element('p', 'app-view-secondary');
    status.setAttribute('role', 'status');
    const result = element('p', 'app-view-secondary');
    result.setAttribute('role', 'status');
    const list = element('ul', 'agent-activity-list');
    root.append(status, result, list);
    container.replaceChildren(root);
    let previous;
    let pending;

    async function pin(run, button) {
      if (pending) return;
      pending = run.id;
      button.disabled = true;
      result.textContent = '';
      try {
        const outcome = await dispatch({ action: 'pin', id: run.id, revision: run.revision, pinned: !run.pinned }, true);
        result.textContent = outcome?.ok ? '' : 'The run changed or cannot be pinned. Check its latest status.';
      } finally {
        pending = undefined;
        button.disabled = false;
        feed.reload();
      }
    }

    function card(run) {
      const item = element('li', 'agent-activity-card');
      const heading = element('header');
      const label = element('span', 'app-view-badge', labels[run.state]);
      label.dataset.state = run.state;
      heading.append(element('h3', '', run.summary), label);
      const meta = element('p', 'app-view-secondary');
      const updated = element('time', '', time.format(run.updatedAt));
      updated.dateTime = new Date(run.updatedAt).toISOString();
      meta.append([run.project, `Agent ${run.agent}`].filter(Boolean).join(' · '), ' · ', updated);
      item.append(heading, meta);
      if (run.step) item.append(element('p', '', run.step));
      if (run.waitReason) item.append(element('p', 'agent-wait-reason', run.waitReason));
      if (run.progress !== undefined) {
        const progress = element('progress');
        progress.max = 100;
        progress.value = run.progress;
        progress.setAttribute('aria-label', 'Run progress');
        const reading = element('div', 'agent-activity-progress');
        reading.append(progress, element('span', '', `${run.progress}%`));
        item.append(reading);
      }
      const button = element('button', 'agent-activity-pin', run.pinned ? 'Unpin' : 'Pin');
      button.type = 'button';
      button.dataset.runId = run.id;
      button.setAttribute('aria-pressed', String(run.pinned));
      button.disabled = pending === run.id;
      button.addEventListener('click', () => void pin(run, button));
      item.append(button);
      return item;
    }

    const feed = window.createVisibleFeed(read, (state) => {
      const signature = JSON.stringify(state);
      if (signature === previous) return;
      previous = signature;
      const runs = state.runs ?? [];
      status.textContent = state.error ?? (state.status === 'loading' ? 'Reading agent activity…'
        : state.status === 'unavailable' ? 'Grant Publish agent run activity in the Lastra tray to connect an agent.'
          : runs.length ? '' : 'No agent runs in this activity.');
      const focused = document.activeElement?.dataset.runId;
      list.replaceChildren(...runs.map(card));
      if (focused) [...list.querySelectorAll('.agent-activity-pin')].find((button) => button.dataset.runId === focused)?.focus({ preventScroll: true });
    }, { error: 'Agent activity could not be read.' });
    return feed;
  }

  window.LastraAgentActivity = { mount };
}
