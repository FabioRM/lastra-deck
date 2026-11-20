'use strict';

(() => {
  const { element } = window.LastraDom;
  const format = new Intl.NumberFormat();
  const messages = {
    loading: 'Reading Syncthing…', disabled: 'Set up a local Syncthing connection.',
    authentication: 'Syncthing rejected the API key.', unavailable: 'Could not read the local Syncthing service.',
  };

  function folder({ label, state, completion, remaining }) {
    const node = element('li', 'syncthing-folder');
    const name = element('strong', 'syncthing-name', label);
    const value = element('span', 'syncthing-state', state === 'unavailable' ? 'Unavailable'
      : state === 'unknown' ? 'State unavailable' : state.replaceAll('-', ' '));
    const detail = element('span', 'syncthing-remaining', remaining === null ? 'Remaining items unavailable' : `${format.format(remaining)} remaining`);
    const percent = element('span', 'syncthing-percent', completion === null ? '—' : `${completion}%`);
    const progress = element('progress', 'syncthing-progress');
    progress.max = 100;
    progress.setAttribute('aria-label', `Sync completion for ${label}`);
    progress.hidden = completion === null;
    if (!progress.hidden) progress.value = completion;
    node.append(name, value, detail, percent, progress);
    return node;
  }

  function device({ label, connected }) {
    const node = element('li', 'syncthing-device');
    node.dataset.connected = String(connected);
    node.append(element('strong', 'syncthing-name', label), element('span', 'syncthing-state',
      connected === true ? 'Connected' : connected === false ? 'Disconnected' : 'Unavailable'));
    return node;
  }

  function mount(container, read, dispatch) {
    const root = element('section', 'syncthing-view');
    const toolbar = element('header', 'syncthing-actions');
    const setup = element('button', '', 'Edit connection');
    const open = element('button', '', 'Open Syncthing');
    setup.type = open.type = 'button';
    open.disabled = true;
    toolbar.append(setup, open);
    const notice = element('p', 'syncthing-feedback');
    const lists = element('div', 'syncthing-lists');
    const columns = [element('section'), element('section')];
    const folders = element('ul');
    const devices = element('ul');
    columns[0].append(element('h3', '', 'Folders'), folders);
    columns[1].append(element('h3', '', 'Devices'), devices);
    lists.append(...columns);
    lists.hidden = true;
    root.append(toolbar, notice, lists);
    container.replaceChildren(root);
    let state;
    let signature;
    let busy = false;

    function sync() {
      setup.disabled = busy;
      open.disabled = busy || state?.canOpen !== true;
    }

    async function invoke(action) {
      if (busy) return;
      busy = true;
      sync();
      try {
        await dispatch({ action });
      } finally {
        busy = false;
        sync();
      }
    }

    setup.addEventListener('click', () => void invoke('configure'));
    open.addEventListener('click', () => void invoke('open'));

    return window.createVisibleFeed(read, (value) => {
      const next = JSON.stringify(value);
      if (signature === next) return;
      signature = next;
      state = value;
      notice.textContent = value.message ?? value.error ?? messages[value.status] ?? '';
      lists.hidden = !value.folders;
      folders.replaceChildren(...(value.folders?.length ? value.folders.map(folder)
        : [element('li', '', 'Choose folders in the connection settings.')]));
      devices.replaceChildren(...(value.devices?.length ? value.devices.map(device)
        : [element('li', '', value.devices ? 'No devices reported.' : 'Device status unavailable.')]));
      sync();
    }, { interval: 5_000, error: messages.unavailable });
  }

  window.LastraSyncthing = { mount };
})();
