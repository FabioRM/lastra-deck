'use strict';

(() => {
  const api = window.lastra ?? window.LastraDeckPreview;
  if (!api?.getAppViews) return;
  const { t } = window.LastraI18n;
  const caption = (view, value) => view.custom === false ? t(value) : value;

  const byId = (id) => document.getElementById(id);
  const tab = byId('app-views-tab');
  const badges = window.LastraNavigationBadges;
  badges?.attach(tab, 'alerts');
  const panel = byId('app-views-panel');
  const search = byId('app-views-search');
  const keyboard = byId('app-views-keyboard');
  const results = byId('app-views-results');
  const status = byId('app-views-status');
  const detail = byId('app-view-detail');
  const catalog = byId('app-view-catalog');
  const widgets = byId('app-view-widgets');
  const live = byId('app-view-live');
  const detailTitle = byId('app-view-title');
  const pageSize = 6;
  let state = null;
  let page = 0;
  let selected = null;
  let automatic = false;
  let mounted = null;
  let widgetSignature = '';
  let provider = null;
  let providerViewId = null;
  let loadVersion = 0;
  const { element, button } = window.LastraDom;
  widgets.style.setProperty('--app-view-widget-cols', window.LastraWidgetLayout?.VIEW_GRID.cols ?? 4);

  async function change(command, silent = false) {
    if (!silent) status.textContent = '';
    try {
      const result = await api.changeAppView(command);
      if (!result.ok) throw new Error(result.message || window.LastraI18n.t('The command could not be completed'));
      if (result.state) {
        state = result.state;
        render();
      }
      return result;
    } catch (err) {
      if (!silent) status.textContent = err.message || window.LastraI18n.t('The command could not be completed');
      return false;
    }
  }

  function showKeyboard(visible) {
    keyboard.hidden = !visible;
    byId('app-views-type').setAttribute('aria-expanded', String(visible));
  }

  function setSearch(value) {
    search.value = value.slice(0, 80);
    page = 0;
    renderCatalog();
  }

  window.mountLastraTouchKeyboard(keyboard, {
    getValue: () => search.value, setValue: setSearch, done: () => showKeyboard(false),
  });

  function renderCatalog() {
    if (!state || selected) return;
    const terms = search.value.toLowerCase().trim().split(/\s+/);
    const matches = state.views.filter((view) => {
      const source = [view.name, view.category, view.summary];
      const text = [view.id, ...source, ...source.map((value) => caption(view, value))].join(' ').toLowerCase();
      return terms.every((term) => text.includes(term));
    });
    const pages = Math.ceil(matches.length / pageSize);
    page = Math.min(page, Math.max(0, pages - 1));
    const cards = matches.slice(page * pageSize, (page + 1) * pageSize).map((view) => {
      const card = button('', () => choose(view.id), { className: 'app-view-card' });
      if (view.icon) {
        const icon = element('span', 'app-view-icon');
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = view.icon;
        card.append(icon);
      }
      const text = element('span', 'app-view-card-copy');
      text.append(element('strong', '', caption(view, view.name)), element('span', '', caption(view, view.category)));
      card.append(text);
      if (view.id === 'alerts') badges?.attach(card, 'alerts');
      if (view.id === 'service-health') badges?.attach(card, 'services');
      if (state.pinned.includes(view.id)) {
        const badge = element('span', 'app-view-badge', t('Pinned'));
        card.append(badge);
      }
      return card;
    });
    results.replaceChildren(...cards);
    byId('app-views-empty').hidden = matches.length > 0;
    byId('app-views-pages').hidden = pages <= 1;
    byId('app-views-page-number').textContent = (page + 1) + ' / ' + pages;
    byId('app-views-previous').disabled = page === 0;
    byId('app-views-next').disabled = page >= pages - 1;
  }

  function clearWidgets() {
    mounted?.destroy();
    mounted = null;
    widgetSignature = '';
    widgets.replaceChildren();
    widgets.hidden = true;
  }

  function mountWidgets(view) {
    const signature = JSON.stringify(view.widgets);
    if (widgetSignature === signature) return;
    clearWidgets();
    widgetSignature = signature;
    if (!view.widgets.length) return;
    widgets.hidden = false;
    if (window.LastraWidgets) {
      mounted = window.LastraWidgets.mount(widgets, view.widgets, view.id);
      mounted.setVisible(!panel.hidden && !document.hidden);
    } else {
      widgets.append(element('p', 'app-view-secondary', window.LastraI18n.t('Widgets are unavailable in this build.')));
    }
  }

  function clearProvider() {
    provider?.destroy();
    provider = null;
    providerViewId = null;
    live.replaceChildren();
    live.hidden = true;
  }

  function openRelated(viewId, targetId) {
    if (!state?.views.some(({ id }) => id === viewId)) return;
    selected = viewId;
    automatic = false;
    render();
    provider?.focusItem?.(targetId);
  }

  function mountProvider(view) {
    if (providerViewId === view.id) return;
    clearProvider();
    const providers = {
      wsl: window.LastraWslView, docker: window.LastraDockerView,
      claude: window.LastraClaudeView,
      chatgpt: window.LastraChatGptView,
      vscode: window.LastraVscodeView,
      spotify: window.LastraSpotifyView,
      netflix: window.LastraNetflixView,
      'streaming-watchlist': window.LastraStreamingWatchlist,
      terminal: window.LastraTerminalView,
      projects: window.LastraProjectPalette,
      notes: window.LastraNotesView,
      'clipboard-pins': window.LastraClipboardPins,
      snippets: window.LastraSnippetLibrary,
      workspaces: window.LastraWorkspaces,
      'github-checks': window.LastraGitHubChecks,
      'service-health': window.LastraServiceHealth, alerts: window.LastraAlertInbox,
      syncthing: window.LastraSyncthing,
      prometheus: window.LastraPrometheus,
      kubernetes: window.LastraKubernetes,
      'hardware-thresholds': window.LastraHardwareThresholds,
      'audio-presets': window.LastraAudioPresets,
      resources: window.LastraResourceView,
      power: window.LastraPowerView,
      watchlist: window.LastraWatchlist,
      'action-history': window.LastraActionHistory,
      'agent-activity': window.LastraAgentActivity,
      'web-embeds': window.LastraWebEmbeds,
    };
    const integrated = view.custom ? window.LastraAppWindows : providers[view.provider];
    if (!integrated) return;
    providerViewId = view.id;
    live.hidden = false;
    provider = integrated.mount(live,
      () => api.getAppViewData(view.id),
      (command, silent) => change({ ...command, type: view.custom ? 'window' : 'provider', viewId: view.id }, silent),
      { openRelated });
    provider.setVisible(!panel.hidden && !document.hidden);
  }

  function renderDetail() {
    const view = state?.views.find(({ id }) => id === selected);
    if (!view) return;
    detail.classList.toggle('app-view-custom', view.custom);
    detailTitle.textContent = caption(view, view.name);
    byId('app-view-summary').textContent = caption(view, view.summary);
    byId('app-view-capabilities').replaceChildren(...view.capabilities.map((capability) => {
      const card = element('article', 'app-view-capability');
      const heading = element('div', 'app-view-card-copy');
      heading.append(element('strong', '', caption(view, capability.label)), element('span', 'app-view-badge', t(capability.status)));
      card.append(heading, element('p', 'app-view-secondary', caption(view, capability.detail)));
      return card;
    }));
    byId('app-view-commands').replaceChildren(...view.commands.map((command) => {
      const control = button(caption(view, command.label), () => change({ type: 'action', viewId: view.id, actionId: command.id }));
      control.dataset.appCommand = command.id;
      return control;
    }));
    mountProvider(view);
    mountWidgets(view);
  }

  function render() {
    if (panel.hidden) return;
    const item = state?.views.find(({ id }) => id === selected);
    if (!item) selected = null;
    detail.hidden = selected === null;
    catalog.hidden = selected !== null;
    byId('app-views-catalog-button').hidden = selected === null;
    const customError = byId('app-views-custom-error');
    customError.textContent = state?.customError ? 'Custom views could not be loaded. ' + state.customError : '';
    customError.hidden = !state?.customError;
    if (item) renderDetail();
    else {
      clearProvider();
      clearWidgets();
      renderCatalog();
    }
  }

  async function choose(id) {
    const success = await change({ type: 'select', viewId: id });
    if (success && !panel.hidden) {
      selected = id;
      automatic = false;
      showKeyboard(false);
      render();
    }
  }

  function open(id, fromContext) {
    const deckViews = window.LastraDeckViews;
    if (fromContext && deckViews.active && deckViews.active !== panel) return;
    selected = id;
    automatic = fromContext;
    status.textContent = '';
    deckViews.setPanel(panel, true, { remember: !fromContext });
    tab.setAttribute('aria-expanded', 'true');
    showKeyboard(false);
    render();
  }

  function close(remember = !automatic) {
    if (panel.hidden) return;
    loadVersion++;
    clearProvider();
    clearWidgets();
    automatic = false;
    window.LastraDeckViews.setPanel(panel, false, { remember });
    tab.setAttribute('aria-expanded', 'false');
  }

  window.LastraAppViews = {
    async open(id) {
      const version = ++loadVersion;
      open(null, false);
      if (await change({ type: 'select', viewId: id }) && version === loadVersion) open(id, false);
    },
  };

  tab.addEventListener('click', async () => {
    if (!panel.hidden) return close(true);
    const version = ++loadVersion;
    open(null, false);
    try {
      const snapshot = await api.getAppViews();
      if (version !== loadVersion) return;
      state = snapshot;
      open(state.selected, false);
    } catch {
      if (version === loadVersion) status.textContent = window.LastraI18n.t('App views are unavailable');
    }
  });
  panel.addEventListener('lastra:close-view', () => close());
  document.addEventListener('lastra-language', render);
  byId('app-views-return').addEventListener('click', () => {
    close();
    byId('quick-tools-open').focus({ preventScroll: true });
  });
  byId('app-views-catalog-button').addEventListener('click', async () => {
    if (await change({ type: 'select', viewId: null }) && !panel.hidden) {
      automatic = false;
      selected = null;
      render();
    }
  });
  byId('app-views-type').addEventListener('click', () => showKeyboard(keyboard.hidden));
  search.addEventListener('click', () => showKeyboard(true));
  search.addEventListener('input', () => setSearch(search.value));
  byId('app-views-previous').addEventListener('click', () => { page--; renderCatalog(); });
  byId('app-views-next').addEventListener('click', () => { page++; renderCatalog(); });
  document.addEventListener('visibilitychange', () => {
    const visible = !document.hidden && !panel.hidden;
    mounted?.setVisible(visible);
    provider?.setVisible(visible);
  });
  api.onAppViewFocus?.((snapshot) => {
    state = snapshot;
    if (snapshot.automatic) open(snapshot.automatic, true);
    else if (automatic) close();
    else render();
  });
  api.onAppViewsUpdated?.((snapshot) => {
    state = snapshot;
    render();
  });
})();
