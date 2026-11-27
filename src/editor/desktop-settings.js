'use strict';

{
  const api = window.lastraEditor;
  const { t, set: setLanguage } = window.LastraI18n;
  const byId = (id) => document.getElementById(id);
  const settings = byId('desktop-settings');
  const about = byId('about-settings');
  const content = byId('desktop-settings-content');
  const tabs = [...document.querySelectorAll('[data-desktop-tab]')];
  const sections = [...settings.querySelectorAll('[data-settings-section]')];
  const panels = [...settings.querySelectorAll('[data-settings-panel]')];
  const searchForm = byId('settings-search-form');
  const search = byId('settings-search');
  const jump = byId('settings-jump');
  const results = byId('settings-search-results');
  const matches = byId('settings-matches');
  const searchStatus = byId('settings-search-status');
  const categoryKey = 'lastra.settings.category';
  const scrollPositions = new Map();
  let selected = 'general-settings';
  try {
    const remembered = localStorage.getItem(categoryKey);
    if (panels.some((panel) => panel.id === remembered)) selected = remembered;
  } catch { /* The settings window can still navigate when storage is unavailable. */ }
  let waitingForHeading;
  const grafana = byId('grafana-settings-form');
  const calendarPick = byId('settings-calendar-pick');
  const calendarClear = byId('settings-calendar-clear');
  const calendarStatus = byId('settings-calendar-status');
  let calendarSelected = false;
  let calendarBusy = false;
  const productionModes = window.LastraObsModes.mount(byId('desktop-production-modes'), api, { settingsOnly: true });
  const productionTimers = window.LastraObsProduction.createProductionView(byId('desktop-production-timers'), api, { settingsOnly: true });
  let productionRequest = 0;
  let productionOpen = false;
  const obsToggle = byId('settings-obs-enabled');
  const obsStatus = byId('settings-obs-status');
  const language = byId('interface-language');
  const languageStatus = byId('language-status');
  const startup = byId('windows-startup');
  const startupStatus = byId('startup-status');
  const exportConfiguration = byId('settings-export-configuration');
  const exportStatus = byId('settings-export-status');
  let savedLanguage;
  let startupState;
  let startupPending = false;

  const options = {
    'general-settings': [
      ['Startup', 'startup-heading', 'windows login autostart avvio automatico accesso'],
      ['Interface language', 'language-heading', 'italian english italiano inglese lingua'],
      ['Configuration backup', 'configuration-heading', 'export json profiles esportazione profili'],
    ],
    'appearance-settings': [
      ['Deck display', 'deck-display-heading', 'monitor touch schermo'],
      ['Appearance', 'display-settings-heading', 'theme accent text size contrast tema colore caratteri contrasto'],
      ['Clock and idle', 'clock-settings-heading', 'time dim night orologio notte inattività luminosità'],
      ['Telemetry', 'telemetry-settings-heading', 'cpu ram gpu percent gauge percentuale indicatore'],
    ],
    'behavior-settings': [
      ['Activity profile', 'deck-activity-heading', 'main work meeting gaming streaming profilo attività'],
      ['Navigation and input', 'deck-navigation-heading', 'view only auto follow reveal desktop navigazione sola lettura app gesto'],
      ['Deck organization', 'deck-organization-heading', 'favorite pinned pages apps mixer preferiti pagine app fissate'],
    ],
    'deck-shortcut-settings': [['Global keyboard shortcuts', 'global-shortcuts-heading', 'hotkeys keybind ctrl tasti rapidi scorciatoie combinazioni']],
    'pet-settings': [['Deck pet', 'pet-settings-heading', 'tamagotchi animal habitat name motion animale ambiente nome animazioni']],
    'aquarium-settings': [
      ['Aquarium preview', 'aquarium-preview-heading', 'preview desktop simulate feeding xeneon anteprima simulazione mangime'],
      ['Habitat preset', 'aquarium-preset-heading', 'gallery images preset defaults galleria immagini predefiniti'],
      ['Aquascape', 'aquarium-layout-heading', 'aquarium reef kelp plants sand acqua acquario coralli piante sabbia'],
      ['Reef growth', 'aquarium-growth-heading', 'seaweed macroalgae coral sponges alghe coralli spugne densità'],
      ['Decorations', 'aquarium-decor-heading', 'tank props placement arch wreck arredi mappa relitto arco'],
      ['Inhabitants', 'aquarium-stock-heading', 'fish shrimp crab jellyfish turtles mussels pesci granchi meduse tartarughe mitili'],
      ['Circadian lighting', 'aquarium-light-heading', 'sunrise sunset solar day night alba tramonto circadiano luce'],
      ['Movement and detail', 'aquarium-motion-heading', 'quality bubbles performance touch qualità bolle prestazioni'],
      ['Feeding', 'aquarium-feeding-heading', 'food feed tap flakes pellets wafers cibo mangime fiocchi granuli'],
    ],
    'about-settings': [
      ['Project resources', 'about-resources-heading', 'website site documentation guide releases download changelog github sito guida aggiornamenti scaricare'],
      ['Support and licenses', 'about-support-heading', 'report issue creator author mit license support licenza assistenza segnalazione autore versione'],
    ],
    'dashboard-settings': [
      ['Dashboard calendar', 'deck-calendar-heading', 'google outlook microsoft calendar calendario tap'],
      ['Dashboard calendar file', 'calendar-file-heading', 'ics ical calendario file'],
    ],
    'stats-settings': [
      ['Stats layout', 'stats-overview-heading', 'charts readings sensors grafici sensori layout letture'],
      ['Local Stats history', 'stats-history-heading', 'retention cronologia conservazione'],
      ['Refresh intervals', 'stats-refresh-heading', 'polling refresh intervallo frequenza aggiornamento'],
      ['Watchlist readings', 'stats-watch-heading', 'monitoring letture osservate'],
      ['Grafana dashboard URL', 'grafana-heading', 'grafana link collegamento'],
    ],
    'feeds-settings-panel': [
      ['Visible views', 'feeds-views-heading', 'hide show dashboard stats feeds nascondi mostra viste'],
      ['Weather', 'feeds-weather-heading', 'openweather open meteo city location città posizione'],
      ['Quotes', 'feeds-quotes-heading', 'yahoo finnhub stooq stocks market azioni quotazioni borsa'],
      ['Currencies', 'feeds-currency-heading', 'forex eur usd rates valute cambi'],
    ],
    'tool-settings': [['Quick decision pick list', 'tool-settings-heading', 'quick decision choices elenco decisione rapida']],
    'production-settings': [['Show OBS controls on the deck', 'production-settings-heading', 'stream scene countdown rundown regia scene conto']],
    'system-settings': [
      ['Updates', 'desktop-updates-heading', 'version release download aggiornamenti versione scarica'],
      ['Integration setup', 'integrations-heading', 'services providers integrations integrazioni servizi'],
      ['Agent access', 'agent-access-heading', 'mcp grants permissions agenti autorizzazioni'],
      ['Diagnostics', 'diagnostics-heading', 'troubleshoot logs touch diagnostica problemi'],
      ['Profile files', 'profile-files-heading', 'profile json files profili file cartella'],
    ],
  };

  function setStatus(status, source, error = false) {
    status.textContent = t(source);
    status.classList.toggle('error', error);
  }

  async function readStartup(enabled) {
    if (startupPending) return;
    const restoreFocus = document.activeElement === startup;
    startupPending = startup.disabled = true;
    try {
      startupState = await api.windowsStartup(enabled);
      if (!startupState.available) setStatus(startupStatus, 'Startup is available on Windows.');
      else if (enabled !== undefined) setStatus(startupStatus, 'Startup preference saved.');
      else setStatus(startupStatus, '');
    } catch {
      startupState = enabled === undefined ? null : await api.windowsStartup().catch(() => null);
      setStatus(startupStatus, enabled === undefined ? 'Could not read the startup preference.' : 'Could not save the startup preference.', true);
    } finally {
      startup.checked = startupState?.enabled === true;
      startup.disabled = !startupState?.available;
      startupPending = false;
      if (restoreFocus && document.activeElement === document.body) startup.focus({ preventScroll: true });
    }
  }

  startup.addEventListener('change', () => void readStartup(startup.checked));
  exportConfiguration.addEventListener('click', async () => {
    exportConfiguration.disabled = true;
    setStatus(exportStatus, '');
    try {
      if (await api.exportConfiguration()) setStatus(exportStatus, 'Configuration exported.');
    } catch {
      setStatus(exportStatus, 'Could not export the configuration.', true);
    } finally {
      exportConfiguration.disabled = false;
      if (document.activeElement === document.body) exportConfiguration.focus({ preventScroll: true });
    }
  });

  function updateLanguage(settings) {
    savedLanguage = settings.preference;
    language.value = savedLanguage;
    setLanguage(settings.language);
  }
  api.getLanguage().then((settings) => {
    updateLanguage(settings);
    language.disabled = false;
  }).catch(() => setStatus(languageStatus, 'Could not read the interface language.', true));
  language.addEventListener('change', async () => {
    language.disabled = true;
    languageStatus.textContent = '';
    try {
      updateLanguage(await api.setLanguage(language.value));
      setStatus(languageStatus, 'Interface language saved.');
      void window.LastraMaintenance?.refresh();
    } catch {
      language.value = savedLanguage;
      setStatus(languageStatus, 'Could not save the interface language.', true);
    } finally {
      language.disabled = false;
      if (document.activeElement === document.body) language.focus({ preventScroll: true });
    }
  });

  async function updateObsAvailability(enabled) {
    obsToggle.disabled = true;
    obsStatus.textContent = '';
    try {
      const saved = await api.obsAvailability(enabled);
      obsToggle.checked = saved.enabled;
      if (enabled !== undefined) setStatus(obsStatus, 'Deck settings saved.');
    } catch (error) {
      obsToggle.checked = (await api.obsAvailability().catch(() => ({ enabled: false }))).enabled;
      obsStatus.textContent = error.message;
    } finally {
      obsToggle.disabled = false;
    }
  }
  obsToggle.addEventListener('change', () => void updateObsAvailability(obsToggle.checked));

  async function showProduction(open) {
    if (productionOpen === open) return;
    productionOpen = open;
    const request = ++productionRequest;
    const unavailable = { status: 'disabled', scenes: [] };
    if (!open) {
      productionTimers(false, unavailable);
      productionModes(false, unavailable);
      return;
    }
    void updateObsAvailability();
    const state = await api.getProductionObs().catch(() => unavailable);
    if (request !== productionRequest) return;
    productionTimers(true, state);
    productionModes(true, state);
  }

  async function calendar(type) {
    if (calendarBusy) return;
    const focused = document.activeElement;
    calendarBusy = calendarPick.disabled = calendarClear.disabled = true;
    try {
      const result = await api.calendarSettings(type);
      if (!result.ok) throw new Error(result.message);
      calendarSelected = result.selected;
      calendarStatus.textContent = t(result.message || (calendarSelected ? 'Calendar file selected.' : 'No calendar file selected.'));
    } catch (error) {
      calendarStatus.textContent = error.message || t('Could not update the calendar file.');
    } finally {
      calendarBusy = calendarPick.disabled = false;
      calendarClear.disabled = !calendarSelected;
      if (document.activeElement === document.body && (focused === calendarPick || focused === calendarClear)) {
        (focused.disabled ? calendarPick : focused).focus({ preventScroll: true });
      }
    }
  }

  let grafanaLoaded = false;
  let grafanaLoading = false;
  async function loadGrafana() {
    if (grafanaLoaded || grafanaLoading) return;
    grafanaLoading = true;
    try {
      grafana.elements.url.value = await api.getGrafanaSettings();
      grafanaLoaded = true;
      grafana.inert = false;
    } catch {
      setStatus(byId('grafana-settings-status'), 'Could not read the Grafana link.', true);
    } finally {
      grafanaLoading = false;
    }
  }

  function updateVisibility() {
    waitingForHeading?.disconnect();
    const searching = search.value.trim() !== '';
    results.hidden = !searching;
    for (const control of sections) {
      if (!searching && control.dataset.settingsSection === selected) control.setAttribute('aria-current', 'true');
      else control.removeAttribute('aria-current');
    }
    for (const panel of panels) panel.hidden = searching || panel.id !== selected;
    updateJump();
  }

  function panelEntries(panel) {
    const curated = (options[panel.id] ?? []).filter(([, target]) => !byId(target) || panel.contains(byId(target)));
    const targets = new Set(curated.map(([, target]) => target));
    const headings = [...panel.querySelectorAll('h3[id], h4[id]')].filter((heading) => !targets.has(heading.id)
      && heading.tabIndex === -1 && heading.hasAttribute('tabindex'));
    return [...curated, ...headings.map((heading) => [heading.textContent.trim(), heading.id, ''])];
  }

  function updateJump() {
    const entries = panelEntries(byId(selected)).filter(([, target]) => target !== byId(selected).getAttribute('aria-labelledby'));
    jump.replaceChildren(new Option(t('Jump to…'), ''), ...entries.map(([label, id]) => new Option(t(label), id)));
    jump.hidden = !results.hidden || entries.length < 2;
  }

  function scroller() {
    return byId(selected).querySelector('[data-settings-scroll]') ?? content;
  }

  function rememberPosition() {
    if (!settings.hidden && results.hidden) scrollPositions.set(selected, scroller().scrollTop);
  }

  function activateSection() {
    const id = selected;
    if (id === 'general-settings') void readStartup();
    if (id === 'dashboard-settings') void calendar('read');
    if (id === 'stats-settings') void loadGrafana();
    if (id === 'stats-settings' || id === 'system-settings') void window.LastraMaintenance?.refresh();
    void showProduction(id === 'production-settings');
    byId(id).dispatchEvent(new Event('settings:open'));
  }

  function showSection(id, target, focus = true, activate = true) {
    if (id === about.id) {
      showTab('about');
      search.value = '';
      updateVisibility();
      focusHeading(about, target);
      return;
    }
    rememberPosition();
    selected = id;
    try { localStorage.setItem(categoryKey, selected); } catch { /* Navigation is still available in this window. */ }
    search.value = '';
    updateVisibility();
    const previous = target ? 0 : scrollPositions.get(id) ?? 0;
    scroller().scrollTop = previous;
    if (activate) activateSection();
    updateJump();
    if (!focus) return;
    if (!target && previous > 0) sections.find((control) => control.dataset.settingsSection === id)?.focus();
    else focusHeading(byId(id), target);
  }

  function focusHeading(panel, target) {
    waitingForHeading?.disconnect();
    const found = panel.contains(byId(target)) ? byId(target) : null;
    const fallback = byId(panel.getAttribute('aria-labelledby'));
    const focus = (heading) => {
      for (let details = heading.closest('details:not([open])'); details; details = details.parentElement.closest('details:not([open])')) {
        details.open = true;
      }
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: 'nearest' });
    };
    focus(found ?? fallback);
    if (!target || found) return;
    // A search result can lead to a card populated asynchronously when its section opens.
    waitingForHeading = new MutationObserver(() => {
      if (document.activeElement !== fallback) { waitingForHeading.disconnect(); return; }
      const heading = byId(target);
      if (!heading || !panel.contains(heading)) return;
      waitingForHeading.disconnect();
      focus(heading);
    });
    waitingForHeading.observe(panel, { childList: true, subtree: true });
  }

  const normalize = (value) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  function showSearch() {
    const query = normalize(search.value.trim());
    const words = query.split(/\s+/);
    if (query) rememberPosition();
    updateVisibility();
    if (!query) {
      scroller().scrollTop = scrollPositions.get(selected) ?? 0;
      return;
    }
    void showProduction(false);
    const topics = sections.map((control) => [control.dataset.settingsSection, control.textContent.trim()]);
    topics.push([about.id, t('About Lastra')]);
    const hits = topics.flatMap(([id, section]) => {
      const panel = byId(id);
      const heading = panel.getAttribute('aria-labelledby');
      const entries = [[section, heading, ''], ...panelEntries(panel).filter(([, target]) => target !== heading)];
      return entries.flatMap(([source, target, keywords]) => {
        const title = t(source);
        const searchText = normalize(`${title} ${source} ${keywords} ${section}`);
        if (!words.every((word) => searchText.includes(word))) return [];
        const normalizedTitle = normalize(title);
        const rank = normalizedTitle === query ? 0 : normalizedTitle.startsWith(query) ? 1
          : words.every((word) => normalizedTitle.includes(word)) ? 2 : 3;
        return [{ id, section, target, title, rank }];
      });
    }).sort((a, b) => a.rank - b.rank);
    matches.replaceChildren(...hits.map(({ id, section, target, title }) => {
      const row = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      const label = document.createElement('strong');
      label.textContent = title;
      button.append(label);
      if (section !== title) {
        const location = document.createElement('span');
        location.textContent = section;
        button.append(location);
      }
      button.addEventListener('click', () => showSection(id, target));
      row.append(button);
      return row;
    }));
    searchStatus.textContent = hits.length === 0 ? t('No matching settings.')
      : t(hits.length === 1 ? '1 setting found' : '{count} settings found', { count: hits.length });
    content.scrollTop = 0;
  }

  function showTab(name, activate = true) {
    const wasSettings = !settings.hidden;
    if (name !== 'settings') rememberPosition();
    const profile = name === 'profile';
    byId('workspace').hidden = byId('profile-toolbar').hidden = byId('status').hidden = !profile;
    settings.hidden = name !== 'settings';
    about.hidden = name !== 'about';
    if (settings.hidden) {
      waitingForHeading?.disconnect();
      void showProduction(false);
    } else if (results.hidden) {
      if (!wasSettings) scroller().scrollTop = scrollPositions.get(selected) ?? 0;
      if (activate) {
        activateSection();
        updateJump();
      }
    }
    if (name === 'about') about.dispatchEvent(new Event('about:open'));
    for (const tab of tabs) tab.setAttribute('aria-pressed', String(tab.dataset.desktopTab === name));
  }

  for (const tab of tabs) tab.addEventListener('click', () => {
    const name = tab.dataset.desktopTab;
    showTab(name);
    if (name === 'about') focusHeading(about);
  });
  for (const control of sections) control.addEventListener('click', () => showSection(control.dataset.settingsSection));
  for (const button of about.querySelectorAll('[data-settings-destination]')) button.addEventListener('click', () => {
    showTab('settings', false);
    showSection(button.dataset.settingsDestination, button.dataset.settingsTarget);
  });
  jump.addEventListener('change', () => {
    const target = jump.value;
    jump.value = '';
    if (target) focusHeading(byId(selected), target);
  });
  search.addEventListener('input', () => {
    showSearch();
    if (results.hidden) activateSection();
  });
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !search.value) return;
    event.preventDefault();
    search.value = '';
    showSearch();
    activateSection();
  });
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!results.hidden) matches.querySelector('button')?.click();
  });
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || !event.ctrlKey || event.altKey || event.shiftKey || event.metaKey || event.isComposing
      || document.querySelector('dialog[open]')) return;
    if (event.key.toLowerCase() === 's' && !settings.hidden && results.hidden) {
      const save = byId(selected).querySelector('[data-settings-save]');
      if (save) {
        event.preventDefault();
        if (!save.disabled) save.click();
      }
      return;
    }
    if (event.key === ',') showTab('settings');
    else if (settings.hidden || event.key.toLowerCase() !== 'f') return;
    event.preventDefault();
    search.focus();
    search.select();
  });
  document.addEventListener('lastra-language', () => {
    if (!results.hidden) showSearch();
    else updateJump();
  });
  calendarPick.addEventListener('click', () => void calendar('pick'));
  calendarClear.addEventListener('click', () => void calendar('clear'));
  grafana.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (grafana.inert) return;
    const status = byId('grafana-settings-status');
    const focus = document.activeElement;
    setStatus(status, '');
    grafana.inert = true;
    try {
      const result = await api.setGrafanaSettings(grafana.elements.url.value);
      if (!result.ok) throw new Error(result.message);
      setStatus(status, 'Grafana link saved.');
    } catch (error) {
      setStatus(status, error.message || 'Could not save the Grafana link.', true);
    } finally {
      grafana.inert = false;
      if (document.activeElement === document.body) focus?.focus({ preventScroll: true });
    }
  });
  api.onDesktopSection((name) => {
    if (name === 'updates') showSection('system-settings', undefined, false, false);
    showTab(name === 'profile' || name === 'about' ? name : 'settings');
    if (name === 'about') focusHeading(about);
    if (name === 'updates') {
      byId('desktop-updates-heading').focus({ preventScroll: true });
      byId('desktop-updates').scrollIntoView({ block: 'nearest' });
    }
  });
  updateVisibility();
  showTab('settings');
}
