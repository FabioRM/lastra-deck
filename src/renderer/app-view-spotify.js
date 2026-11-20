'use strict';

(() => {
  const { element: node, button } = window.LastraDom;
  const connectionText = {
    setup: 'Set a Spotify app client ID to enable Spotify Connect. Windows media controls remain available.',
    invalid: 'The Spotify client ID is invalid. Edit the connection settings, then reload.',
    disconnected: 'No Spotify account connected. Use the Windows media controls above.',
    'disconnect-error': 'No Spotify account connected. Use the Windows media controls above.',
    authorizing: 'Waiting for Spotify authorization in your browser.',
    connected: 'Spotify account connected.',
  };

  function sectionText(state, label) {
    if (state === 'scope') return label + ' access was not granted.';
    if (state === 'restricted') return label + ' is unavailable for this Spotify account.';
    return label + ' is temporarily unavailable.';
  }

  function accountPanel(send, reload) {
    const section = node('section', 'spotify-account');
    const toolbar = node('div', 'spotify-playlists-toolbar');
    const status = node('p', 'app-view-secondary');
    const feedback = node('p', 'app-view-secondary');
    status.setAttribute('role', 'status');
    feedback.setAttribute('role', 'status');
    feedback.hidden = true;
    const connect = button('Connect Spotify', () => send({ action: 'account-connect' }));
    const disconnect = button('Disconnect Spotify', () => send({ action: 'account-disconnect' }));
    const edit = button('Edit connection', () => send({ action: 'account-configure' }));
    const refresh = button('Reload connection', reload);
    const content = node('div', 'spotify-account-content');
    const playback = node('p', 'spotify-account-track');
    const deviceList = node('div', 'spotify-account-devices');
    const queue = node('div', 'spotify-account-queue');
    const queueButton = button('Add current item to queue', () => send({ action: 'account-queue', uri: latest.playback.item.uri }));
    const queueStatus = node('p', 'app-view-secondary');
    queueStatus.id = 'spotify-account-queue-status';
    queueButton.setAttribute('aria-describedby', queueStatus.id);
    toolbar.append(node('h4', '', 'Spotify Connect'), edit, refresh, connect, disconnect);
    content.append(playback, node('h5', '', 'Playback devices'), deviceList, node('h5', '', 'Queue'), queue, queueButton, queueStatus);
    section.append(toolbar, status, feedback, content);
    let signature;
    let latest;

    function render(account, pending) {
      latest = account;
      const state = account?.status;
      const connected = state === 'connected';
      const authorizing = state === 'authorizing';
      const report = [connectionText[state] || 'Spotify Connect is unavailable.', account?.message].filter(Boolean).join(' ');
      if (status.textContent !== report) status.textContent = report;
      connect.hidden = state !== 'disconnected';
      disconnect.hidden = !(connected || authorizing || state === 'disconnect-error');
      disconnect.textContent = authorizing ? 'Cancel authorization' : 'Disconnect Spotify';
      edit.disabled = pending || authorizing;
      refresh.disabled = pending;
      connect.disabled = pending;
      disconnect.disabled = pending;
      content.hidden = !connected;
      queueButton.disabled = pending || !account?.canQueue;
      if (!connected) return;

      const { sampledAt, ...visibleData } = account;
      const nextSignature = JSON.stringify([visibleData, pending]);
      if (signature === nextSignature) return;
      signature = nextSignature;
      const playing = account.playback;
      const current = playing?.item;
      const text = !playing || playing.state !== 'ready' ? sectionText(playing?.state, 'Playback') :
        current ? [playing.playing ? 'Playing' : 'Paused', current.title, current.creator].filter(Boolean).join(' · ') : 'Nothing is playing on Spotify.';
      playback.textContent = text + (account.stale ? ' Last available data.' : '');

      const priorFocus = document.activeElement?.dataset.device;
      const devices = account.devices;
      if (!devices || devices.state !== 'ready' || !devices.items.length) {
        deviceList.textContent = devices?.state === 'ready' ? 'No Spotify devices found.' : sectionText(devices?.state, 'Device list');
      } else {
        const rows = devices.items.map((device) => {
          const detail = device.active ? ' · Active' : device.restricted || !device.id ? ' · Unavailable for transfer' : '';
          const row = device.active || device.restricted || !device.id ? node('span', '', device.name + detail) :
            button(device.name, () => send({ action: 'account-transfer', deviceId: device.id }));
          if (row instanceof HTMLButtonElement) {
            row.disabled = pending || !account.canTransfer;
            row.dataset.device = device.id;
            row.setAttribute('aria-label', 'Transfer Spotify playback to ' + device.name);
          }
          return row;
        });
        deviceList.replaceChildren(...rows);
        rows.find((row) => priorFocus && row.dataset.device === priorFocus && !row.disabled)?.focus();
      }

      const upcoming = account.queue;
      queueStatus.hidden = Boolean(account.canQueue || pending || upcoming?.state !== 'ready');
      queueStatus.textContent = 'Adding to the queue is currently unavailable.';
      if (!upcoming || upcoming.state !== 'ready' || !upcoming.items.length) {
        queue.textContent = upcoming?.state === 'ready' ? 'The Spotify queue is empty.' : sectionText(upcoming?.state, 'Queue');
      } else {
        const list = node('ol');
        const entries = upcoming.items.map((item) => node('li', '', [item.title, item.creator].filter(Boolean).join(' · ')));
        list.append(...entries.slice(0, 5));
        const expanded = queue.querySelector('details')?.open;
        queue.replaceChildren(list);
        if (entries.length > 5) {
          const more = node('details');
          more.open = Boolean(expanded);
          const rest = node('ol');
          rest.start = 6;
          rest.append(...entries.slice(5));
          more.append(node('summary', '', `Show ${entries.length - 5} more queued items`), rest);
          queue.append(more);
        }
      }
    }

    return { section, render, feedback };
  }

  function mount(container, read, dispatch) {
    const section = node('section', 'spotify-playlists');
    const toolbar = node('div', 'spotify-playlists-toolbar');
    const status = node('p', 'app-view-secondary');
    status.setAttribute('role', 'status');
    const list = node('div', 'spotify-playlists-list');
    let visible = false;
    let generation = 0;
    let timer;
    let pending = false;
    let account;
    let playlistSignature;
    const panel = accountPanel(accountCommand, () => load());

    async function accountCommand(command) {
      if (pending) return;
      pending = true;
      clearTimeout(timer);
      panel.feedback.hidden = true;
      panel.render(account, pending);
      try {
        const result = await dispatch(command);
        if (result?.message) {
          panel.feedback.textContent = result.message;
          panel.feedback.hidden = false;
        }
      } finally {
        pending = false;
        await load();
      }
    }

    async function load() {
      if (!visible) return;
      clearTimeout(timer);
      const current = ++generation;
      let result;
      try { result = await read(); } catch { result = { status: 'unavailable', playlists: [] }; }
      if (!visible || generation !== current) return;
      if (!result) result = { status: 'unavailable', playlists: [] };
      account = result.account;
      panel.render(account, pending);
      if (!pending && (account?.status === 'authorizing' || account?.status === 'connected')) {
        timer = setTimeout(load, account.status === 'authorizing' ? 750 : 5000);
      }
      const { account: accountData, ...local } = result;
      const signature = JSON.stringify(local);
      if (signature === playlistSignature) return;
      playlistSignature = signature;
      status.hidden = false;
      if (result.status === 'invalid') {
        status.textContent = result.message;
        status.classList.add('spotify-playlists-error');
      } else {
        status.textContent = result.status === 'ready' ? 'Add a playlist using Edit playlists.' : 'Saved playlists are unavailable.';
        status.hidden = result.status === 'ready' && result.playlists.length > 0;
        status.classList.remove('spotify-playlists-error');
      }
      const links = result.playlists.map(({ id, name }) => {
        const row = node('div', 'spotify-playlist');
        const action = result.embedAvailable ? 'embed-playlist' : 'open-playlist';
        const open = button(name, () => dispatch({ action, id }));
        open.title = result.embedAvailable ? 'Open Spotify embed' : 'Open in browser';
        row.append(open);
        if (result.embedAvailable) {
          const browser = button('Browser', () => dispatch({ action: 'open-playlist', id }));
          browser.setAttribute('aria-label', 'Open ' + name + ' in browser');
          row.append(browser);
        }
        return row;
      });
      list.replaceChildren(...links);
    }

    toolbar.append(node('h4', '', 'Saved playlists'),
      button('Edit playlists', () => dispatch({ action: 'configure' })),
      button('Reload playlists', load));
    section.append(toolbar, status, list);
    status.textContent = 'Reading saved playlists…';
    panel.render(null, false);
    container.append(panel.section, section);

    return {
      setVisible(active) {
        if (visible === active) return;
        visible = active;
        generation++;
        if (visible) void load();
        else clearTimeout(timer);
      },
      destroy() {
        visible = false;
        generation++;
        clearTimeout(timer);
      },
    };
  }

  window.LastraSpotifyView = { mount };
})();
