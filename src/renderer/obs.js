'use strict';

(() => {
  const api = window.lastra;
  if (!api?.onObs) return;

  const byId = (id) => document.getElementById(id);
  const tab = byId('obs-tab');
  const fullTally = document.createElement('span');
  const compactTally = document.createElement('span');
  fullTally.className = 'obs-tally-full';
  compactTally.className = 'obs-tally-compact';
  tab.replaceChildren(fullTally, compactTally);
  const badges = window.LastraNavigationBadges;
  badges?.attach(tab, 'timers');
  const panel = byId('obs-panel');
  const volume = byId('obs-volume');
  const previewToggle = byId('obs-preview-toggle');
  const previewFrame = byId('obs-scene-preview');
  const previewCaption = byId('obs-preview-caption');
  const previewImage = byId('obs-preview-image');
  const previewStatus = byId('obs-preview-status');
  const timersToggle = byId('obs-timers-toggle');
  const timersLabel = document.createElement('span');
  timersToggle.replaceChildren(timersLabel);
  badges?.attach(timersToggle, 'timers');
  const production = byId('obs-production');
  const syncProduction = window.LastraObsProduction.createProductionView(production, api);
  const modesToggle = byId('obs-modes-toggle');
  const modes = byId('obs-modes');
  const syncModes = api.productionModes && api.onProductionModes ? window.LastraObsModes.mount(modes, api) : undefined;
  modesToggle.hidden = !syncModes;
  const pageSize = 4;
  const pages = { scenes: 0, items: 0, filters: 0 };
  const listCache = new Map();
  const statusText = {
    disabled: 'Set up OBS in obs.json',
    invalid: 'Check the format of obs.json',
    connecting: 'Connecting to OBS…',
    syncing: 'Reading OBS state…',
    disconnected: 'OBS is disconnected. Waiting to reconnect…',
    authentication: 'OBS authentication failed. Check the password in obs.json.',
    unsupported: 'Incompatible OBS protocol. OBS Studio 28 or later is required.',
    revoked: 'OBS ended this session.',
  };
  const pendingText = { starting: 'Starting…', stopping: 'Stopping…', reconnecting: 'Reconnecting…' };
  let state = { status: 'disabled' };
  const configured = () => !['disabled', 'invalid'].includes(state.status);
  let receivedState = false;
  let openOnFirstState = false;
  let confirmation = null;
  let busy = null;
  let error = '';
  let dragging = false;
  let previewEnabled = false;
  let previewKey;
  let previewTimer;
  let previewEpoch = 0;
  let timersOpen = false;
  let modesOpen = false;

  function clearPreview(message) {
    previewImage.hidden = true;
    previewImage.removeAttribute('src');
    previewStatus.textContent = message;
  }

  function syncPreview() {
    const enabled = previewEnabled && !timersOpen && !modesOpen && !panel.hidden && state.status === 'connected';
    previewFrame.hidden = !enabled;
    byId('obs-detail').hidden = enabled;
    previewToggle.setAttribute('aria-pressed', String(enabled));
    previewToggle.disabled = !api.previewObs;
    const isPreview = Boolean(state.studio && state.preview);
    const scene = isPreview ? state.preview : state.program;
    const bus = isPreview ? 'Preview' : 'Program';
    const key = enabled && !document.hidden ? JSON.stringify([state.generation, bus, scene]) : null;
    if (previewKey === key) return;
    previewKey = key;
    const epoch = ++previewEpoch;
    clearTimeout(previewTimer);
    previewCaption.textContent = scene && enabled ? `${bus} · ${scene}` : window.LastraI18n.t('Scene preview');
    clearPreview(enabled ? scene ? 'Waiting for OBS preview…' : 'No active scene' : '');
    if (!key || !scene) return;
    const generation = state.generation;
    async function poll() {
      const reading = await api.previewObs(generation).catch(() => null);
      if (epoch !== previewEpoch) return;
      if (reading?.ok && reading.scene === scene && reading.bus === bus) {
        previewImage.src = reading.image;
        previewImage.hidden = false;
        previewStatus.textContent = '';
      } else if (!reading?.busy) {
        clearPreview(reading?.message ?? 'OBS scene preview unavailable.');
      }
      previewTimer = setTimeout(poll, 1_000);
    }
    void poll();
  }

  function setOpen(open) {
    tab.setAttribute('aria-expanded', String(open));
    window.LastraDeckViews.setPanel(panel, open);
    confirmation = null;
    dragging = false;
    if (!open) {
      previewEnabled = false;
      modesOpen = false;
    }
    render();
  }

  // Every OBS control is locked while a command or a confirmation is pending.
  function button(label, handle, pressed) {
    return window.LastraDom.button(label, handle, { disabled: busy || Boolean(confirmation), pressed });
  }

  function renderList(id, entries, renderEntry) {
    const size = id === 'filters' ? 2 : pageSize;
    const last = Math.max(0, Math.ceil(entries.length / size) - 1);
    pages[id] = Math.min(pages[id], last);
    const signature = JSON.stringify([entries, pages[id], busy, Boolean(confirmation), state.generation, state.sourceScene, state.studio]);
    if (listCache.get(id) === signature) return;
    listCache.set(id, signature);

    const start = pages[id] * size;
    const entriesEl = byId('obs-' + id);
    entriesEl.replaceChildren(...entries.slice(start, start + size).map(renderEntry));
    if (entries.length === 0 && id !== 'filters') {
      const empty = document.createElement('p');
      empty.textContent = id === 'scenes' ? 'No scenes' : 'No sources in this scene';
      entriesEl.append(empty);
    }

    const nav = byId('obs-' + id + '-nav');
    nav.replaceChildren();
    if (last === 0) return;
    const previous = button('‹', () => { pages[id]--; render(); });
    const next = button('›', () => { pages[id]++; render(); });
    previous.disabled ||= pages[id] === 0;
    next.disabled ||= pages[id] === last;
    previous.setAttribute('aria-label', window.LastraI18n.t('Previous page'));
    next.setAttribute('aria-label', window.LastraI18n.t('Next page'));
    const count = document.createElement('span');
    count.textContent = (pages[id] + 1) + ' / ' + (last + 1);
    nav.append(previous, count, next);
  }

  function updateOutput(id, output, enable, disable) {
    const el = byId(id);
    el.textContent = output.phase ? pendingText[output.phase] : output.active ? disable : enable;
    el.disabled = busy || Boolean(output.phase) || Boolean(confirmation);
    el.setAttribute('aria-pressed', String(output.active));
  }

  function render() {
    const tally = [];
    if (state.recording?.active) tally.push(state.recording.paused ? 'REC paused' : 'REC');
    if (state.streaming?.active) tally.push(state.streaming.phase === 'reconnecting' ? 'LIVE · reconnecting' : 'LIVE');
    fullTally.textContent = ['OBS', ...tally].join(' · ');
    const shortStates = [state.recording?.active ? 'REC' : '', state.streaming?.active ? 'LIVE' : ''].filter(Boolean);
    compactTally.textContent = shortStates.length ? 'OBS · ' + shortStates.join('+') : 'OBS';
    tab.setAttribute('aria-label', fullTally.textContent);
    tab.classList.toggle('obs-tally', tally.length > 0);
    syncPreview();
    production.hidden = !timersOpen || panel.hidden;
    timersToggle.setAttribute('aria-expanded', String(timersOpen));
    timersLabel.textContent = timersOpen ? 'OBS controls' : 'Timers';
    timersToggle.disabled = Boolean(confirmation);
    syncProduction(!production.hidden && !document.hidden, state);
    modes.hidden = !modesOpen || panel.hidden;
    modesToggle.setAttribute('aria-expanded', String(modesOpen));
    modesToggle.textContent = modesOpen ? 'OBS controls' : window.LastraI18n.t('Modes');
    modesToggle.disabled = Boolean(confirmation);
    syncModes?.(!modes.hidden && !document.hidden, state);
    if (panel.hidden) return;

    const connected = state.status === 'connected';
    byId('obs-content').hidden = !connected || timersOpen || modesOpen;
    byId('obs-recovery').hidden = connected || timersOpen || modesOpen;
    byId('obs-unavailable').textContent = connected ? '' : statusText[state.status];
    byId('obs-reconnect').hidden = !state.canReconnect;
    byId('obs-reconnect').disabled = Boolean(busy);
    const status = byId('obs-status');
    const replay = state.replay;
    const clip = replay?.lastSaved;
    status.textContent = error || (busy?.type === 'save-replay' ? 'Verifying replay file…' : busy ? 'Waiting for OBS…'
      : connected ? clip ? `Replay saved · ${clip.name}` : 'Connected' : '');
    status.classList.toggle('obs-error', Boolean(error));
    if (!connected || timersOpen || modesOpen) return;

    updateOutput('obs-record', state.recording, 'Start recording', 'Stop recording');
    updateOutput('obs-stream', state.streaming, 'Start streaming', 'Stop streaming');
    const replayState = byId('obs-replay-state');
    replayState.textContent = replay?.phase ? `Replay · ${pendingText[replay.phase]}` : replay?.active ? window.LastraI18n.t('Replay active')
      : replay ? window.LastraI18n.t('Replay stopped') : window.LastraI18n.t('Replay unavailable');
    replayState.toggleAttribute('data-active', replay?.active === true);
    const saveReplay = byId('obs-save-replay');
    saveReplay.hidden = !replay;
    saveReplay.disabled = Boolean(busy || confirmation || !replay?.active || replay.phase);
    const pause = byId('obs-pause');
    pause.hidden = !state.recording.active;
    pause.textContent = state.recording.paused ? 'Resume' : window.LastraI18n.t('Pause');
    pause.disabled = busy || Boolean(state.recording.phase) || Boolean(confirmation);
    pause.setAttribute('aria-pressed', String(state.recording.paused));
    const transition = byId('obs-transition');
    transition.hidden = !state.studio;
    transition.disabled = busy || !state.preview || state.preview === state.program || Boolean(confirmation);
    byId('obs-confirm').hidden = !confirmation;
    byId('obs-confirm-text').textContent = confirmation?.text ?? '';

    byId('obs-current-scenes').replaceChildren();
    function sceneLine(label, name) {
      const line = document.createElement('span');
      line.textContent = label + ' · ' + (name ?? '—');
      return line;
    }
    const current = byId('obs-current-scenes');
    current.append(sceneLine('Program', state.program));
    if (state.studio) current.append(sceneLine('Preview', state.preview));
    const studio = state.studio;
    renderList('scenes', state.scenes.map((name) => ({ name, current: name === (studio ? state.preview : state.program) })),
      ({ name, current }) => button(name, () => send({ type: 'scene', value: name, studio }), current));

    const scene = state.sourceScene;
    byId('obs-source-scene').textContent = scene ?? '—';
    const detail = state.detail;
    renderList('items', state.items.map((item) => ({ ...item, selected: detail?.id === item.id })), (item) => {
      const label = item.visible === null ? item.name + ' · global' : item.name + (item.visible ? '' : ' · hidden');
      return button(label, () => send({ type: 'select-source', scene, item: item.id }), item.selected);
    });

    byId('obs-source-name').textContent = detail?.name ?? window.LastraI18n.t('Source');
    byId('obs-select-item').hidden = Boolean(detail);
    byId('obs-source-actions').hidden = !detail;
    const selected = state.items.find((item) => item.id === detail?.id);
    const visibility = byId('obs-visibility');
    visibility.hidden = selected?.visible == null;
    visibility.textContent = selected?.visible ? window.LastraI18n.t('Hide source') : window.LastraI18n.t('Show source');
    visibility.disabled = busy || Boolean(confirmation);
    visibility.setAttribute('aria-pressed', String(Boolean(selected?.visible)));

    const mute = byId('obs-mute');
    mute.hidden = detail?.muted == null;
    mute.disabled = busy || Boolean(confirmation);
    mute.textContent = detail?.muted ? window.LastraI18n.t('Unmute source') : window.LastraI18n.t('Mute source');
    mute.setAttribute('aria-pressed', String(Boolean(detail?.muted)));
    const hasVolume = detail?.volume != null;
    byId('obs-volume-label').hidden = !hasVolume;
    volume.disabled = busy || Boolean(confirmation);
    if (!dragging && hasVolume) {
      const percent = Math.round(detail.volume * 100);
      volume.value = percent;
      byId('obs-volume-value').textContent = percent + '%';
    }

    const filters = detail?.filters ?? [];
    byId('obs-filters-header').hidden = filters.length === 0;
    renderList('filters', filters, (filter) => button(filter.name, () => sourceCommand('filter', !filter.enabled, filter.name), filter.enabled));
  }

  async function send(command) {
    if (busy || (command.type === 'reconnect' ? !state.canReconnect : state.status !== 'connected')) return;
    const request = { ...command, generation: state.generation };
    busy = request;
    error = '';
    render();
    try {
      const result = await api.changeObs(request);
      if (busy === request && !result.ok) error = result.message;
    } catch {
      if (busy === request) error = 'Could not communicate with OBS';
    } finally {
      if (busy === request) {
        busy = null;
        render();
      }
    }
  }

  function sourceCommand(type, value, filter) {
    const detail = state.detail;
    if (detail) send({ type, value, filter, item: detail.id, source: detail.name, scene: state.sourceScene });
  }

  function ask(text, command) {
    if (busy || state.status !== 'connected') return;
    confirmation = { text, command };
    render();
  }

  tab.addEventListener('click', () => {
    if (!receivedState) openOnFirstState = true;
    else if (configured()) setOpen(panel.hidden);
  });
  panel.addEventListener('lastra:close-view', () => setOpen(false));
  document.addEventListener('lastra:view-only', ({ detail }) => {
    if (detail && confirmation) {
      confirmation = null;
    }
    render();
  });
  document.addEventListener('lastra:session-blocked', ({ detail }) => {
    if (!detail) return;
    confirmation = null;
    previewEnabled = false;
    modesOpen = false;
    render();
  });
  timersToggle.addEventListener('click', () => {
    modesOpen = false;
    timersOpen = !timersOpen;
    render();
  });
  modesToggle.addEventListener('click', () => {
    timersOpen = false;
    modesOpen = !modesOpen;
    render();
  });
  byId('obs-reconnect').addEventListener('click', () => send({ type: 'reconnect' }));
  byId('obs-record').addEventListener('click', () => {
    const value = !state.recording.active;
    ask(value ? 'Start recording?' : 'Stop recording?', { type: 'record', value });
  });
  byId('obs-stream').addEventListener('click', () => {
    const value = !state.streaming.active;
    ask(value ? 'Start streaming?' : 'Stop streaming?', { type: 'stream', value });
  });
  byId('obs-pause').addEventListener('click', () => send({ type: 'pause', value: !state.recording.paused }));
  byId('obs-save-replay').addEventListener('click', () => send({ type: 'save-replay' }));
  previewToggle.addEventListener('click', () => {
    previewEnabled = !previewEnabled;
    syncPreview();
  });
  document.addEventListener('visibilitychange', render);
  byId('obs-transition').addEventListener('click', () =>
    ask('Take “' + state.preview + '” to program?', { type: 'transition', preview: state.preview }));
  byId('obs-confirm-cancel').addEventListener('click', () => {
    confirmation = null;
    render();
  });
  byId('obs-confirm-apply').addEventListener('click', () => {
    const command = confirmation?.command;
    confirmation = null;
    if (command) send(command);
  });
  byId('obs-visibility').addEventListener('click', () => {
    const item = state.items.find(({ id }) => id === state.detail?.id);
    if (item) send({ type: 'visibility', value: !item.visible, item: item.id, scene: state.sourceScene });
  });
  byId('obs-mute').addEventListener('click', () => sourceCommand('mute', !state.detail?.muted));
  let dragTarget = null;
  volume.addEventListener('pointerdown', () => {
    dragging = true;
    dragTarget = { item: state.detail?.id, source: state.detail?.name, scene: state.sourceScene, generation: state.generation };
  });
  volume.addEventListener('input', () => { byId('obs-volume-value').textContent = volume.value + '%'; });
  volume.addEventListener('change', () => {
    const target = dragTarget;
    const value = Number(volume.value);
    dragging = false;
    dragTarget = null;
    if (target) {
      if (target.generation === state.generation) send({ ...target, type: 'volume', value });
    } else {
      sourceCommand('volume', value);
    }
  });
  function stopDrag() {
    dragging = false;
    dragTarget = null;
    render();
  }
  volume.addEventListener('pointercancel', stopDrag);
  volume.addEventListener('pointerup', () => setTimeout(() => { if (dragging) stopDrag(); }, 0));

  api.onObs((view) => {
    if (state.generation !== view.generation) {
      busy = null;
      confirmation = null;
      error = '';
      dragging = false;
      previewEnabled = false;
    }
    if (state.sourceScene !== view.sourceScene) pages.items = 0;
    if (state.detail?.id !== view.detail?.id || state.sourceScene !== view.sourceScene) pages.filters = 0;
    state = view;
    receivedState = true;
    tab.hidden = !configured();
    if (openOnFirstState && !tab.hidden && !window.LastraDeckViews.active) setOpen(true);
    openOnFirstState = false;
    if (tab.hidden && !panel.hidden) setOpen(false);
    render();
  });
})();
