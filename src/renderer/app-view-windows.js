'use strict';

(() => {
  const POLL_MS = 2000;
  const ICON = /^data:image\/(?:png|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

  function mount(container, read, dispatch) {
    let epoch = 0;
    let timer;
    let drawn = '';

    function render(state) {
      const signature = JSON.stringify(state);
      if (drawn === signature) return;
      drawn = signature;
      const heading = document.createElement('h4');
      heading.textContent = 'Matching windows';
      container.replaceChildren(heading);

      if (!state.windows?.length) {
        const message = document.createElement('p');
        message.className = 'app-view-secondary';
        message.textContent = state.status === 'available' ? 'No matching windows are open.'
          : state.status === 'loading' ? 'Reading app windows…' : 'App window detection is unavailable.';
        container.append(message);
        return;
      }

      const list = document.createElement('div');
      list.className = 'app-view-windows-list';
      for (const entry of state.windows) {
        const button = document.createElement('button');
        button.type = 'button';
        button.title = entry.title;
        const picture = document.createElement('span');
        picture.className = 'app-view-window-icon';
        if (typeof entry.icon === 'string' && entry.icon.length <= 40_000 && ICON.test(entry.icon)) {
          const image = document.createElement('img');
          image.alt = '';
          image.src = entry.icon;
          picture.append(image);
        }
        const title = document.createElement('span');
        title.className = 'app-view-window-title';
        title.textContent = entry.title;
        button.append(picture, title);
        button.addEventListener('click', () => dispatch({ windowId: entry.id }));
        list.append(button);
      }
      container.append(list);
    }

    async function poll(token) {
      let state;
      try { state = await read(); } catch { state = { status: 'unavailable' }; }
      if (token !== epoch) return;
      render(state);
      timer = setTimeout(() => poll(token), POLL_MS);
    }

    function setVisible(visible) {
      clearTimeout(timer);
      epoch++;
      if (visible) {
        render({ status: 'loading' });
        void poll(epoch);
      }
    }

    return { setVisible, destroy: () => setVisible(false) };
  }

  window.LastraAppWindows = { mount };
})();
