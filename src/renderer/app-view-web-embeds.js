'use strict';

{
  const dom = window.LastraDom;
  const { element } = dom;

  function mount(container, read, dispatch) {
    const root = element('section', 'web-embeds');
    const notice = element('p', 'app-view-secondary');
    notice.setAttribute('role', 'status');
    const list = element('div', 'web-embeds-list');
    let signature;

    // Disables the control while its command runs.
    function button(label, command) {
      const control = dom.button(label, async () => {
        control.disabled = true;
        try { await dispatch(command); } finally { control.disabled = false; }
      });
      return control;
    }

    function card(entry) {
      const node = element('article', 'app-view-capability');
      const actions = element('div', 'web-embed-actions');
      actions.append(button('Open embed', { id: entry.id, action: 'embed' }), button('Open in browser', { id: entry.id, action: 'external' }));
      node.append(element('h4', '', entry.name),
        element('p', 'app-view-secondary', entry.kind === 'spotify' ? 'Spotify Embed' : 'Webpage'), actions);
      return node;
    }

    function render(state) {
      const next = JSON.stringify(state);
      if (signature === next) return;
      signature = next;
      const entries = state.embeds ?? [];
      notice.textContent = state.error ?? (state.status === 'loading' ? 'Reading web embeds…'
        : entries.length ? '' : 'Add an HTTPS page or a Spotify link to open it from the deck.');
      list.replaceChildren(...entries.map(card));
    }

    const toolbar = element('header');
    toolbar.append(button('Edit web embeds', { action: 'configure' }));
    root.append(toolbar, notice, list);
    container.replaceChildren(root);
    return window.createVisibleFeed(read, render, { error: 'Could not read web embeds.' });
  }

  window.LastraWebEmbeds = { mount };
}
