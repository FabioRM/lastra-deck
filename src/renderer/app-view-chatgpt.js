'use strict';

{
  const { element, button } = window.LastraDom;

  function mount(container, read, dispatch) {
    const root = element('section', 'chatgpt-view');
    const desktop = element('div', 'chatgpt-toolbar');
    const reload = button('Reload', () => void load());
    const companion = button('Open Windows companion', async () => {
      if (companion.disabled) return;
      companion.disabled = true;
      try { await dispatch({ action: 'open-companion' }); }
      finally { companion.disabled = false; }
    });
    companion.title = 'Use the ChatGPT Windows app’s default Alt+Space shortcut';
    companion.hidden = true;
    desktop.append(companion, reload);
    const linkHeader = element('div', 'chatgpt-toolbar');
    linkHeader.append(element('h4', '', 'Saved chats and Projects'),
      button('Edit links', () => dispatch({ action: 'edit-links' })));
    const status = element('p', 'app-view-secondary');
    status.setAttribute('role', 'status');
    const list = element('div', 'chatgpt-items');
    root.append(desktop, linkHeader, status, list);
    const prompts = window.LastraSnippetPicker.mount(root, dispatch, { title: 'Prompts', editLabel: 'Edit prompts' });
    container.append(root);
    let visible = false;
    let generation = 0;

    async function load() {
      if (!visible) return;
      const current = ++generation;
      reload.disabled = true;
      let state;
      try { state = await read(); }
      catch { state = { links: [], message: 'Saved ChatGPT links are unavailable.' }; }
      if (!visible || current !== generation) return;
      reload.disabled = false;
      companion.hidden = !state.windowsApp;
      const links = state.links ?? [];
      status.textContent = state.message || (links.length ? '' : 'Add a chat or Project using Edit links.');
      status.hidden = !status.textContent;
      list.replaceChildren(...links.map(({ id, name, kind }) => {
        const link = button('', () => dispatch({ action: 'open-link', id }));
        link.append(element('strong', '', name), element('span', 'app-view-secondary', kind));
        return link;
      }));
      prompts.update(state.prompts ?? { snippets: [], message: 'Prompt shortcuts are unavailable.' });
    }

    function setVisible(active) {
      if (visible === active) return;
      visible = active;
      generation++;
      if (active) void load();
      else prompts.hide();
    }

    return { setVisible, destroy: () => setVisible(false) };
  }

  window.LastraChatGptView = { mount };
}
