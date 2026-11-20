'use strict';

(() => {
  const { element: node, button } = window.LastraDom;
  function mount(container, read, dispatch, netflix = false) {
    const section = node('section', 'streaming-titles');
    container.append(section);
    let visible = false;
    let token = 0;
    let timer;
    let drawn = '';

    function render(state) {
      const key = JSON.stringify(state);
      if (key === drawn) return;
      drawn = key;
      section.replaceChildren();
      if (netflix) {
        const actions = node('div', 'streaming-controls');
        if (state.windowsApp) actions.append(button('Open Netflix Windows app', () => dispatch({ action: 'open-app' })));
        if (state.windowsApp) {
          actions.append(
            button('Play / pause key', () => dispatch({ action: 'shortcut', key: 'toggle' }), { disabled: !state.shortcutAvailable }),
            button('Exit full screen', () => dispatch({ action: 'shortcut', key: 'exit-fullscreen' }), { disabled: !state.shortcutAvailable }),
          );
          if (!state.shortcutAvailable) actions.append(node('span', 'app-view-secondary', 'Shortcuts require the identified Netflix Windows app.'));
        }
        section.append(actions);
      }
      const toolbar = node('div', 'streaming-controls streaming-toolbar');
      toolbar.append(node('h4', '', 'Saved titles'), button('Edit titles', () => dispatch({ action: 'configure' })),
        button('Reload', reload));
      section.append(toolbar);
      if (state.message || !state.titles.length) {
        const status = node('p', state.message ? 'streaming-error' : 'app-view-secondary',
          state.message || 'Add a title using Edit titles.');
        status.setAttribute('role', 'status');
        section.append(status);
      }
      const list = node('div', 'streaming-list');
      for (const { id, name, provider } of state.titles) {
        const item = button('', () => dispatch({ action: 'open-title', id }));
        item.append(node('strong', '', name));
        if (provider) item.append(node('span', 'app-view-secondary', provider));
        list.append(item);
      }
      section.append(list);
    }

    async function poll(current) {
      let state;
      try { state = await read(); } catch { state = { titles: [], message: 'Could not read saved titles.' }; }
      if (!visible || current !== token) return;
      render(state);
      if (netflix && state.windowsApp) timer = setTimeout(() => poll(current), 1500);
    }

    function reload() {
      clearTimeout(timer);
      const current = ++token;
      if (visible) void poll(current);
    }

    return {
      setVisible(active) {
        if (visible === active) return;
        visible = active;
        reload();
      },
      destroy() {
        visible = false;
        reload();
      },
    };
  }

  window.LastraNetflixView = { mount: (container, read, dispatch) => mount(container, read, dispatch, true) };
  window.LastraStreamingWatchlist = { mount };
})();
