'use strict';

{
  const dom = window.LastraDom;
  const { element } = dom;

  function mount(container, read, dispatch) {
    const root = element('section', 'web-embeds');
    const notice = element('p', 'app-view-secondary');
    notice.setAttribute('role', 'status');
    const displays = element('p', 'app-view-secondary');
    const entries = element('div', 'web-embeds-list');
    let signature;
    let submitting = false;

    // Dispatches one command at a time and disables the control while it runs.
    function button(label, command) {
      const control = dom.button(label, async () => {
        if (submitting) return;
        submitting = true;
        control.disabled = true;
        try { await dispatch(command); } finally {
          submitting = false;
          control.disabled = false;
          feed.reload();
        }
      });
      return control;
    }

    function card(entry, running, last) {
      const article = element('article', 'app-view-capability');
      const actions = element('div', 'web-embed-actions');
      const open = button(running === entry.id ? 'Opening…' : 'Open workspace', { action: 'apply', id: entry.id });
      open.disabled = Boolean(running);
      actions.append(open);
      const scope = entry.apps ? `${entry.apps} ${entry.apps === 1 ? 'app' : 'apps'}` : 'PowerToys Workspaces';
      article.append(element('h4', '', entry.name), element('p', 'app-view-secondary', `${entry.id} · ${scope}`), actions);
      for (const result of last?.id === entry.id ? last.results : []) {
        article.append(element('p', 'app-view-secondary', `${result.name} · ${result.status}`));
      }
      return article;
    }

    function render(state) {
      const next = JSON.stringify(state);
      if (signature === next) return;
      signature = next;
      const workspaces = state.entries ?? [];
      notice.textContent = state.error ?? (state.status === 'loading' ? 'Reading workspaces…'
        : workspaces.length ? '' : 'Add a group of apps or a PowerToys workspace shortcut in the configuration file.');
      displays.textContent = (state.displays ?? []).map((display) =>
        `${display.label || 'Display'} · ${display.id}${display.primary ? ' · Primary' : ''}`).join(' / ');
      entries.replaceChildren(...workspaces.map((entry) => card(entry, state.running, state.last)));
    }

    const toolbar = element('header');
    toolbar.append(button('Edit workspaces', { action: 'configure' }));
    root.append(toolbar, notice, displays, entries);
    container.replaceChildren(root);
    const feed = window.createVisibleFeed(read, render, { error: 'Could not read workspaces.' });
    return feed;
  }

  window.LastraWorkspaces = { mount };
}
