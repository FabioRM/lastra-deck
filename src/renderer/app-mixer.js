'use strict';

(() => {
  const api = window.lastra;
  if (!api) return;

  const toggle = document.getElementById('app-mixer-toggle');
  const panel = document.getElementById('panel');
  const mixer = document.getElementById('app-mixer');
  const close = document.getElementById('app-mixer-close');
  const channels = document.getElementById('app-mixer-channels');
  const status = document.getElementById('app-mixer-status');
  const controls = document.getElementById('app-mixer-pages');
  const pageLabel = document.getElementById('app-mixer-position');
  const previous = document.getElementById('app-mixer-prev');
  const next = document.getElementById('app-mixer-next');

  let apps = [];
  let page = 0;
  let pageSize = 1;
  let timer;
  let openGeneration = 0;
  let request = 0;
  let loaded = false;
  let loadError = '';
  let actionError = '';
  const rows = new Map();

  function availablePageSize() {
    const style = getComputedStyle(mixer);
    const gap = Number.parseFloat(style.rowGap);
    const pager = Number.parseFloat(style.getPropertyValue('--app-mixer-pager-size'));
    const rowHeight = Number.parseFloat(style.getPropertyValue('--app-mixer-row-size'));
    const rowGap = Number.parseFloat(getComputedStyle(channels).rowGap);
    const withoutPager = channels.clientHeight + (controls.hidden ? 0 : controls.offsetHeight + gap);
    const rowsThatFit = (height) => Math.max(1, Math.floor((height + rowGap) / (rowHeight + rowGap)));
    const capacity = rowsThatFit(withoutPager);
    return apps.length <= capacity ? capacity : rowsThatFit(withoutPager - pager - gap);
  }

  function render() {
    const error = actionError || loadError;
    status.classList.toggle('error', Boolean(error));
    status.textContent = error || (!loaded ? 'Reading audio sessions…'
      : apps.length ? '' : 'Start audio in an app to see it here.');

    // Retain a slider until its gesture is finished, even if another app appears.
    if ([...rows.values()].some((row) => row.dragging || row.pending)) return;
    const capacity = availablePageSize();
    page = Math.floor(page * pageSize / capacity);
    pageSize = capacity;
    const count = Math.max(1, Math.ceil(apps.length / pageSize));
    page = Math.min(page, count - 1);
    const visible = apps.slice(page * pageSize, (page + 1) * pageSize);
    const ids = new Set(visible.map(({ id }) => id));
    for (const [id, row] of rows) {
      if (ids.has(id)) continue;
      rows.delete(id);
      row.element.remove();
    }
    for (const [index, app] of visible.entries()) {
      if (!rows.has(app.id)) rows.set(app.id, createChannel(app.id));
      const row = rows.get(app.id);
      row.update(app);
      if (channels.children[index] !== row.element) {
        channels.insertBefore(row.element, channels.children[index] ?? null);
      }
    }
    controls.hidden = count === 1;
    previous.disabled = page === 0;
    next.disabled = page === count - 1;
    pageLabel.textContent = (page + 1) + ' / ' + count;
  }

  function createChannel(id) {
    const element = document.createElement('div');
    element.className = 'audio-channel app-mixer-channel';
    const name = document.createElement('span');
    name.className = 'app-mixer-name';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    const value = document.createElement('output');
    const mute = document.createElement('button');
    mute.type = 'button';
    element.append(name, slider, value, mute);

    const row = {
      element,
      dragging: false,
      pending: false,
      app: null,
      update(app) {
        row.app = app;
        name.textContent = app.name;
        name.title = app.name;
        element.classList.toggle('playing', app.active);
        element.classList.toggle('muted', Boolean(app.muted));
        element.classList.toggle('offline', !app.online);
        slider.setAttribute('aria-label', app.name + ' volume');
        slider.value = app.online ? app.level : 0;
        slider.disabled = mute.disabled = !app.online;
        value.textContent = app.online ? (app.mixedLevel ? '≈' : '') + app.level + '%' : 'Offline';
        value.title = app.mixedLevel ? window.LastraI18n.t('Sessions have different volume levels') : '';
        mute.setAttribute('aria-pressed', app.mixedMute ? 'mixed' : String(Boolean(app.muted)));
        mute.setAttribute('aria-label', (app.muted ? 'Unmute ' : 'Mute ') + app.name);
        mute.textContent = app.muted ? window.LastraI18n.t('Unmute') : window.LastraI18n.t('Mute');
      },
    };

    async function apply(operation) {
      if (row.pending || mixer.hidden) return;
      row.pending = true;
      slider.disabled = mute.disabled = true;
      actionError = '';
      const generation = openGeneration;
      try {
        const result = await operation();
        if (openGeneration !== generation || mixer.hidden) return;
        if (!result.ok) actionError = result.message;
        await refresh();
      } catch (err) {
        if (openGeneration === generation && !mixer.hidden) actionError = err.message;
      } finally {
        row.pending = false;
        if (!mixer.hidden) render();
      }
    }

    function change(level) {
      if (row.app?.online) apply(() => api.changeAudioApp(id, level));
    }

    slider.addEventListener('pointerdown', () => { row.dragging = true; });
    slider.addEventListener('pointerup', () => { row.dragging = false; });
    slider.addEventListener('pointercancel', () => { row.dragging = false; render(); });
    slider.addEventListener('lostpointercapture', () => { row.dragging = false; });
    slider.addEventListener('input', () => { value.textContent = slider.value + '%'; });
    slider.addEventListener('change', () => {
      row.dragging = false;
      change(Number(slider.value));
    });
    mute.addEventListener('click', () => change());
    return row;
  }

  async function refresh() {
    const generation = openGeneration;
    const revision = ++request;
    try {
      const result = await api.getAudioApps();
      if (mixer.hidden || generation !== openGeneration || revision !== request) return;
      apps = result.apps ?? [];
      loaded = true;
      loadError = result.ok ? '' : result.message;
    } catch (err) {
      if (mixer.hidden || generation !== openGeneration || revision !== request) return;
      loadError = err.message;
      apps = [];
    }
    render();
  }

  async function poll(generation) {
    await refresh();
    if (generation === openGeneration && !mixer.hidden) {
      timer = setTimeout(() => poll(generation), 1000);
    }
  }

  function setOpen(open) {
    if (open === !mixer.hidden) return;
    if (open) panel.dispatchEvent(new Event('lastra:close-view'));
    clearTimeout(timer);
    openGeneration++;
    mixer.hidden = !open;
    panel.classList.toggle('app-mixer-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      apps = [];
      page = 0;
      loaded = false;
      loadError = actionError = '';
      rows.clear();
      channels.replaceChildren();
      render();
      poll(openGeneration);
    }
  }

  function closeAndFocus() {
    setOpen(false);
    toggle.focus({ preventScroll: true });
  }

  toggle.addEventListener('click', () => {
    const keyboardFocused = document.activeElement === toggle;
    setOpen(mixer.hidden);
    if (keyboardFocused && !mixer.hidden) close.focus({ preventScroll: true });
  });
  panel.addEventListener('lastra:close-view', () => setOpen(false));
  close.addEventListener('click', closeAndFocus);
  mixer.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAndFocus();
  });
  previous.addEventListener('click', () => { page = Math.max(0, page - 1); render(); });
  next.addEventListener('click', () => { page++; render(); });

  const resize = new ResizeObserver(() => { if (!mixer.hidden) render(); });
  resize.observe(mixer);
  window.addEventListener('pagehide', () => {
    resize.disconnect();
    setOpen(false);
  }, { once: true });
})();
