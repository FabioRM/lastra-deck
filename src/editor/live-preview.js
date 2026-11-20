'use strict';

window.createLastraEditorPreview = function createLastraEditorPreview(details, { readAsset, readLive, applyLayout }) {
  const frame = details.querySelector('iframe');
  const viewport = details.querySelector('.preview-viewport');
  const orientation = details.querySelector('#preview-orientation');
  const source = details.querySelector('#preview-source');
  const live = details.querySelector('#preview-live-readings');
  const editLayout = details.querySelector('#preview-edit-layout');
  const liveStatus = details.querySelector('#preview-live-status');
  const layoutStatus = details.querySelector('#preview-layout-status');
  const controls = window.createPreviewLayoutControls(details.querySelector('#preview-layout-overlay'), layoutStatus, applyLayout);
  const assets = new Map();
  let profile;
  let page;
  let appearance;
  let revision = 0;
  let activeView;
  let activeRevision;
  let canEdit = true;
  let loaded = false;
  let drawTimer;
  let assetTimer;
  let liveTimer;
  let liveEpoch = 0;

  const assetKey = (kind, value) => `${kind}:${value}`;
  const lookup = (kind) => (value) => assets.get(assetKey(kind, value))?.data ?? null;
  const active = () => source.value === 'active';
  const editing = () => !active() && canEdit && editLayout.checked;
  const post = (data) => frame.contentWindow?.postMessage(data, '*');

  function draw() {
    if (!details.open || !loaded) return;
    if (active() && !activeView || !active() && !page) return;
    const view = active() ? activeView : {
      ...window.LastraDeckView.toView(profile, { page, icon: lookup('icon'), image: lookup('image'), deduplicateEditing: !editing() }),
      page: page.id, locked: false,
      followsApps: profile.pages.some((item) => item.apps.length || item.appIds?.length),
      pages: profile.pages.map((item) => ({ id: item.id, name: item.name || item.id })),
    };
    // Sandboxed documents have opaque origins. Only the frame receives this visual model.
    post({ type: 'lastra:editor-preview', appearance, language: window.LastraI18n.language, view: {
      ...view, revision: ++revision, editorLayout: editing(), editorActive: active(),
    } });
  }

  async function pollLive(epoch) {
    try {
      const widgets = active() ? activeView : page;
      const bar = active() ? activeView?.bar : profile?.bar;
      const sensors = window.LastraSensorBinding.sensorIds([...(widgets?.widgets ?? []), ...(bar?.widgets ?? [])]);
      const result = await readLive(source.value, activeRevision, sensors);
      if (epoch !== liveEpoch) return;
      liveStatus.textContent = '';
      if (result.view) {
        activeView = result.view;
        activeRevision = result.view.revision;
        draw();
      }
      post({ type: 'lastra:editor-readings', readings: result.readings });
    } catch {
      if (epoch === liveEpoch) liveStatus.textContent = window.LastraI18n.t('Live readings unavailable.');
    }
    if (epoch === liveEpoch) liveTimer = setTimeout(() => { void pollLive(epoch); }, 1_000);
  }

  function restartLive() {
    clearTimeout(liveTimer);
    const epoch = ++liveEpoch;
    if (!loaded || !details.open || document.hidden) return;
    if (active() || live.checked) void pollLive(epoch);
    else {
      liveStatus.textContent = '';
      post({ type: 'lastra:editor-readings', readings: null });
    }
  }

  async function loadAssets() {
    if (!details.open || active() || !page) return;
    const needed = new Map();
    const resolver = window.LastraProfileKeys.createProfileKeys(profile);
    for (const [placement, owningPage] of [...page.keys.map((key) => [key, page]), ...(profile.bar?.keys ?? []).map((key) => [key])]) {
      if (!placement) continue;
      let key = placement;
      try { key = resolver.resolve(placement, owningPage); } catch { /* The draft may be incomplete. */ }
      const kind = key.image ? 'image' : 'icon';
      const value = key.image || key.icon;
      if (value) needed.set(assetKey(kind, value), { kind, value });
      const stateIcons = window.LastraDeckView.liveIconNames(key);
      for (const name of Object.values(stateIcons)) {
        needed.set(assetKey('icon', name), { kind: 'icon', value: name });
      }
    }
    for (const { icon } of window.LastraEditingKeys.FIXED_EDITING_KEYS) needed.set(assetKey('icon', icon), { kind: 'icon', value: icon });
    for (const widget of [...page.widgets ?? [], ...profile.bar?.widgets ?? []]) {
      if (widget.type !== 'composition') continue;
      for (const value of window.LastraWidgetComposition.compositionIcons(widget.settings.composition)) {
        needed.set(assetKey('icon', value), { kind: 'icon', value });
      }
    }
    for (const id of assets.keys()) if (!needed.has(id)) assets.delete(id);
    const pending = [];
    for (const [id, { kind, value }] of needed) {
      if (assets.has(id)) continue;
      const entry = { data: null };
      assets.set(id, entry);
      pending.push(Promise.resolve().then(() => readAsset(kind, value)).then((data) => {
        if (typeof data === 'string' && assets.get(id) === entry) entry.data = data;
      }).catch(() => {}));
    }
    if (pending.length) {
      await Promise.all(pending);
      draw();
    }
  }

  function schedule() {
    if (!details.open || active()) return;
    clearTimeout(drawTimer);
    clearTimeout(assetTimer);
    drawTimer = setTimeout(draw, 50);
    assetTimer = setTimeout(loadAssets, 160);
  }

  function setLayoutMode() {
    editLayout.disabled = active() || !canEdit;
    live.disabled = active();
    layoutStatus.textContent = editing() ? window.LastraI18n.t('Drag a tile to move it or drag its corner to resize. Arrow keys also work.') : '';
    if (!editing()) controls.clear();
  }

  window.addEventListener('message', (event) => {
    if (!editing() || !details.open || event.source !== frame.contentWindow || event.origin !== 'null') return;
    const { type, revision: remoteRevision, geometry } = event.data ?? {};
    if (type !== 'lastra:editor-grid' || remoteRevision !== revision || !geometry || !page) return;
    const { x, y, width, height, stepX, stepY, cell } = geometry;
    if (![x, y, width, height, stepX, stepY, cell].every(Number.isFinite)
        || x < -1 || y < -1 || cell <= 0 || stepX < cell || stepY < cell
        || width < cell || height < cell || x + width > viewport.clientWidth + 1 || y + height > viewport.clientHeight + 1) return;
    controls.render(page, page.grid ?? profile.grid, geometry);
  });
  orientation.addEventListener('change', () => {
    controls.clear();
    viewport.classList.toggle('portrait', orientation.value === 'portrait');
    draw();
  });
  source.addEventListener('change', () => {
    activeView = activeRevision = undefined;
    setLayoutMode();
    if (!active()) schedule();
    restartLive();
  });
  editLayout.addEventListener('change', () => {
    setLayoutMode();
    draw();
  });
  live.addEventListener('change', restartLive);
  document.addEventListener('visibilitychange', restartLive);
  frame.addEventListener('load', () => {
    loaded = frame.hasAttribute('src');
    draw();
    restartLive();
  });
  details.addEventListener('toggle', () => {
    if (details.open) {
      frame.src = 'lastra-preview://deck/src/renderer/index.html?editor-preview=1';
      schedule();
    } else {
      clearTimeout(drawTimer);
      clearTimeout(assetTimer);
      controls.clear();
      assets.clear();
      activeView = activeRevision = undefined;
      loaded = false;
      restartLive();
      frame.removeAttribute('src');
    }
  });

  return {
    setAppearance(settings) {
      appearance = settings;
      draw();
    },
    update(current, pageId, allowEdit = true) {
      const previous = page;
      profile = current;
      page = profile?.pages.find(({ id }) => id === pageId);
      if (previous !== page) controls.clear();
      if (canEdit !== allowEdit) {
        canEdit = allowEdit;
        setLayoutMode();
      }
      schedule();
    },
  };
};
