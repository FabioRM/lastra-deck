'use strict';

{
  const dom = window.LastraDom;
  const { element } = dom;
  const DESTINATIONS = { repository: 'Repository', issues: 'Issues', terminal: 'Terminal', documentation: 'Documentation' };

  function mount(container, read, dispatch) {
    const root = element('section', 'project-palette');
    const toolbar = element('div', 'project-toolbar');
    const choices = element('div', 'project-choices');
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', 'Choose a project');
    const notice = element('p', 'app-view-secondary');
    notice.setAttribute('role', 'status');
    const destinations = element('div', 'project-destinations');
    destinations.setAttribute('role', 'group');
    destinations.setAttribute('aria-label', 'Project destinations');
    let selected;
    let state;
    let signature;
    let busy = false;

    // Keeps the focus id so a re-render can restore focus to the same control.
    function button(label, className, focus, clicked) {
      return dom.button(label, clicked, { className, dataset: { projectFocus: focus } });
    }

    async function send(command) {
      if (busy) return;
      busy = true;
      destinations.setAttribute('aria-busy', 'true');
      try { await dispatch(command); } finally {
        busy = false;
        destinations.removeAttribute('aria-busy');
        feed.reload();
      }
    }

    function draw(next) {
      state = next;
      const current = JSON.stringify([next, selected]);
      if (current === signature) return;
      signature = current;
      const focus = root.contains(document.activeElement) ? document.activeElement.dataset.projectFocus : null;
      const projects = next.projects ?? [];
      const project = projects.find(({ id }) => id === (selected ?? next.workspace?.id));
      const options = [];
      if (next.workspace) {
        const automatic = button('Current VS Code folder', 'project-select', 'workspace', () => { selected = undefined; draw(state); });
        automatic.setAttribute('aria-pressed', String(selected === undefined));
        options.push(automatic);
      }
      for (const { id, name } of projects) {
        const option = button(name, 'project-select', `select-${id}`, () => { selected = id; draw(state); });
        option.setAttribute('aria-pressed', String(selected === id));
        options.push(option);
      }
      choices.replaceChildren(...options);
      choices.hidden = !options.length;

      const status = next.error ?? next.message ?? (next.status === 'loading' ? 'Reading projects…'
        : next.status === 'unsupported' ? 'The Projects palette needs Windows.'
          : next.status === 'setup' ? 'Use Edit projects to add a Windows folder and its links.'
            : project ? (selected ? '' : project.name)
              : selected ? 'That project is unavailable. Choose a project again.' : 'Choose a project.');
      notice.textContent = status;
      notice.hidden = !status;
      const workspace = selected === undefined ? next.workspace?.token : undefined;
      const actions = (project?.actions ?? []).map((action) => button(DESTINATIONS[action], 'project-destination', action,
        () => void send({ action, id: project.id, revision: project.revision, ...(workspace ? { workspace } : {}) })));
      destinations.replaceChildren(...actions);
      destinations.hidden = !actions.length;
      if (focus) [...root.querySelectorAll('[data-project-focus]')].find((item) => item.dataset.projectFocus === focus)?.focus({ preventScroll: true });
    }

    toolbar.append(button('Edit projects', 'project-configure', 'configure', () => void send({ action: 'configure' })));
    root.append(toolbar, choices, notice, destinations);
    container.append(root);
    const feed = window.createVisibleFeed(read, draw, { interval: 1_500, error: 'Could not read projects.' });
    return feed;
  }

  window.LastraProjectPalette = { mount };
}
