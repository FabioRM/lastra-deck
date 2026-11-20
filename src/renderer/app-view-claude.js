'use strict';

{
  const { element } = window.LastraWidgetComponents;
  const labels = { idle: 'Waiting for input', running: 'Running', approval: 'Waiting for approval', error: 'Turn ended with an error', unknown: 'Activity unknown' };
  const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: 'numeric', second: 'numeric' });

  function control(label, key, command, dispatch) {
    const button = element('button', '', label);
    button.type = 'button';
    button.dataset.claudeTarget = key;
    button.addEventListener('click', () => dispatch(command));
    return button;
  }

  function sessionCard(session, dispatch) {
    const card = element('article', 'claude-session');
    card.classList.toggle('claude-approval', session.state === 'approval');
    const header = element('header', 'claude-toolbar');
    const state = element('strong', '', labels[session.state] ?? labels.unknown);
    header.append(element('h5', '', session.project), state);
    const id = element('p', 'app-view-secondary', 'Session ' + session.session.slice(0, 8));
    id.title = session.session;
    const metrics = element('p', 'app-view-secondary', [
      session.context === null ? 'Context unavailable' : `Context ${session.context}%`,
      session.cost === null ? 'Cost unavailable' : `Reported cost $${session.cost.toFixed(4)} USD`,
    ].join(' · '));
    const updated = element('time', 'app-view-secondary', 'Updated ' + clock.format(session.updatedAt));
    updated.dateTime = new Date(session.updatedAt).toISOString();
    card.append(header, id, metrics, updated);
    if (session.state === 'approval') card.append(element('p', 'app-view-secondary', 'Review the request in Claude Code.'));
    const actions = element('div', 'claude-toolbar');
    if (session.terminalAvailable) actions.append(control('Return to terminal', session.session + '-focus',
      { action: 'focus-terminal', session: session.session }, dispatch));
    if (session.projectShellAvailable) actions.append(control('Open project shell', session.session + '-shell',
      { action: 'project-shell', session: session.session }, dispatch));
    if (actions.childElementCount) card.append(actions);
    if (!session.terminalAvailable) card.append(element('p', 'app-view-secondary', 'A session terminal is not linked.'));
    return card;
  }

  function mount(container, read, dispatch) {
    const root = element('section', 'claude-view');
    const header = element('div', 'claude-toolbar');
    const configure = control('Edit Claude settings', 'settings', { action: 'edit-config' }, dispatch);
    const desktop = control('Open Claude Desktop', 'desktop', { action: 'open-desktop' }, dispatch);
    desktop.hidden = true;
    header.append(element('h4', '', 'Saved Claude chats'), configure, desktop);
    const linkStatus = element('p', 'app-view-secondary', 'Reading saved chats…');
    linkStatus.setAttribute('role', 'status');
    const links = element('div', 'claude-toolbar');
    const status = element('p', 'app-view-secondary', 'Reading Claude Code sessions…');
    status.setAttribute('role', 'status');
    const cards = element('div', 'claude-sessions');
    root.append(header, linkStatus, links, element('h4', '', 'Claude Code sessions'), status, cards);
    container.append(root);
    let signature;

    function paint(data) {
      const { status: phase, message, windowsDesktop, links: savedLinks = [], sessions = [] } = data ?? {};
      const next = JSON.stringify(data);
      if (signature === next) return;
      signature = next;
      const target = document.activeElement?.dataset.claudeTarget;
      desktop.hidden = !windowsDesktop;
      linkStatus.textContent = message || (savedLinks.length ? '' : phase === 'loading' ? 'Reading saved chats…' : 'Add chat links in Edit Claude settings.');
      linkStatus.hidden = !linkStatus.textContent;
      links.replaceChildren(...savedLinks.map(({ id, name }) => control(name, 'link-' + id, { action: 'open-link', id }, dispatch)));
      const notices = {
        setup: 'Add the Lastra hooks in Claude Code settings to see session activity.',
        loading: 'Reading Claude Code sessions…',
        offline: 'No active Claude Code sessions were reported.',
        unavailable: 'Claude Code activity is unavailable.',
        ready: '',
      };
      status.textContent = notices[phase] ?? notices.unavailable;
      status.hidden = !status.textContent;
      cards.replaceChildren(...sessions.map((session) => sessionCard(session, dispatch)));
      if (target) [...root.querySelectorAll('[data-claude-target]')].find((button) => button.dataset.claudeTarget === target)?.focus({ preventScroll: true });
    }

    return window.createVisibleFeed(read, paint, { interval: 2000 });
  }

  window.LastraClaudeView = { mount };
}
