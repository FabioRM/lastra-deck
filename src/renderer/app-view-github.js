'use strict';

{
  const dom = window.LastraDom;
  const { element } = dom;
  const times = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const buildStates = { pending: 'Running or queued', passed: 'Passed', failed: 'Failed', cancelled: 'Cancelled', neutral: 'Skipped or neutral', unknown: 'Outcome unavailable' };
  const messages = { loading: 'Reading configured repositories…', setup: 'Add a public repository in GitHub checks settings.',
    unavailable: 'GitHub checks are unavailable.', 'not-public': 'Public data is unavailable for this repository.', 'rate-limited': 'GitHub’s request limit was reached.' };

  function mount(container, read, dispatch) {
    const root = element('section', 'github-checks');
    const actions = element('header', 'github-toolbar');
    const setup = button('Edit repositories', 'configure', () => send({ action: 'configure' }));
    const choices = element('div', 'github-repositories');
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', 'GitHub repositories');
    const notice = element('p', 'app-view-secondary');
    notice.setAttribute('role', 'status');
    const sections = element('div', 'github-columns');
    actions.append(setup, choices);
    root.append(actions, notice, sections);
    container.append(root);
    let active;
    let state;
    let signature;
    let visible = false;
    let pending = false;

    // Keeps the focus id so a re-render can restore focus to the same control.
    function button(label, focusId, clicked) {
      return dom.button(label, clicked, { dataset: { githubFocus: focusId } });
    }

    function report(section) {
      const readTime = Number.isFinite(section.sampledAt) ? times.format(section.sampledAt) : null;
      if (section.stale) return [messages[section.status], readTime && `Cached · ${readTime}`].filter(Boolean).join(' ');
      return messages[section.status] || (readTime ? `Checked at ${readTime}` : '');
    }

    function rows(title, kind, repo) {
      const section = element('section', 'github-results');
      const data = repo[kind];
      const note = report(data);
      section.append(element('h4', '', title));
      if (note) section.append(element('p', 'app-view-secondary', note));
      if (!data.rows.length) {
        if (data.status === 'ready') section.append(element('p', 'app-view-secondary', kind === 'runs' ? 'No recent workflows.' : 'No open pull requests.'));
        return section;
      }
      for (const row of data.rows) {
        const detail = kind === 'runs' ? [buildStates[row.state], row.branch].filter(Boolean).join(' · ')
          : [`#${row.id}`, row.state === 'draft' ? 'Draft' : 'Open', row.ci && `${row.ciStale ? 'Cached CI' : 'Observed CI'} · ${buildStates[row.ci]}`].filter(Boolean).join(' · ');
        const control = button('', `${repo.id}-${kind}-${row.id}`, () => send({ action: 'open', kind, repository: repo.id, id: row.id, revision: row.revision }));
        control.dataset.state = kind === 'runs' ? row.state : row.ci ?? '';
        control.className = 'github-result';
        control.append(element('strong', 'github-result-name', row.name), element('span', 'app-view-secondary', detail));
        control.title = row.name;
        section.append(control);
      }
      return section;
    }

    function render(next) {
      state = next;
      const current = JSON.stringify([next, active]);
      if (current === signature) return;
      signature = current;
      const focus = root.contains(document.activeElement) ? document.activeElement.dataset.githubFocus : null;
      const repositories = next.repositories ?? [];
      if (!repositories.some(({ id }) => id === active)) active = repositories[0]?.id;
      const selected = repositories.find(({ id }) => id === active);
      choices.replaceChildren(...repositories.map((repo) => {
        const control = button(repo.label, `repo-${repo.id}`, () => { active = repo.id; render(state); });
        control.className = 'github-repository';
        control.title = repo.repository;
        control.setAttribute('aria-pressed', String(repo.id === active));
        return control;
      }));
      notice.textContent = next.message ?? next.error ?? (next.retryAt ? `Refresh available after ${times.format(next.retryAt)}.` : messages[next.status] ?? '');
      notice.hidden = !notice.textContent;
      sections.hidden = !selected;
      sections.replaceChildren(...(selected ? [rows(selected.branch ? `Workflow runs · ${selected.branch}` : 'Workflow runs', 'runs', selected),
        rows('Open pull requests', 'pulls', selected)] : []));
      if (focus) [...root.querySelectorAll('[data-github-focus]')].find((control) => control.dataset.githubFocus === focus)?.focus({ preventScroll: true });
    }

    async function send(command) {
      if (!visible || pending) return;
      pending = true;
      try { await dispatch(command); }
      finally {
        pending = false;
        if (command.action === 'configure') feed.reload();
      }
    }

    const feed = window.createVisibleFeed(read, render, { interval: 15_000, error: messages.unavailable });
    function setVisible(next) {
      if (visible === next) return;
      visible = next;
      feed.setVisible(next);
      if (!next) void dispatch({ action: 'stop' }, true);
    }

    return { setVisible, destroy: () => setVisible(false) };
  }

  window.LastraGitHubChecks = { mount };
}
