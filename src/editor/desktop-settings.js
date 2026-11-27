'use strict';

{
  const api = window.lastraEditor;
  const { t, set: setLanguage } = window.LastraI18n;
  const byId = (id) => document.getElementById(id);
  const settings = byId('desktop-settings');
  const content = byId('desktop-settings-content');
  const tabs = [...document.querySelectorAll('[data-desktop-tab]')];
  const sections = [...settings.querySelectorAll('[data-settings-section]')];
  const panels = [...settings.querySelectorAll('[data-settings-panel]')];
  const searchForm = byId('settings-search-form');
  const search = byId('settings-search');
  const results = byId('settings-search-results');
  const matches = byId('settings-matches');
  const searchStatus = byId('settings-search-status');
  let selected = 'general-settings';
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
    'about-settings': [['About Lastra', 'about-settings-heading', 'creator author mit license github autore creatore licenza versione']],
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
    selected = id;
    search.value = '';
    updateVisibility();
    content.scrollTop = 0;
    if (activate) activateSection();
    if (!focus) return;
    const panel = byId(id);
    const found = byId(target);
    const fallback = byId(panel.getAttribute('aria-labelledby'));
    const focusHeading = (heading) => {
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: 'nearest' });
    };
    focusHeading(found ?? fallback);
    if (!target || found) return;
    // A search result can lead to a card populated asynchronously when its section opens.
    waitingForHeading = new MutationObserver(() => {
      if (document.activeElement !== fallback) { waitingForHeading.disconnect(); return; }
      const heading = byId(target);
      if (!heading) return;
      waitingForHeading.disconnect();
      focusHeading(heading);
    });
    waitingForHeading.observe(panel, { childList: true, subtree: true });
  }

  const normalize = (value) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  function showSearch() {
    const query = normalize(search.value.trim());
    const words = query.split(/\s+/);
    updateVisibility();
    if (!query) return;
    void showProduction(false);
    const hits = sections.flatMap((control) => {
      const id = control.dataset.settingsSection;
      const section = control.textContent.trim();
      const heading = byId(id).getAttribute('aria-labelledby');
      const entries = [[section, heading, ''], ...(options[id] ?? [])];
      return entries.flatMap(([source, target, keywords]) => {
        const title = t(source);
        const searchText = normalize(`${title} ${source} ${keywords}`);
        if (!words.every((word) => searchText.includes(word))) return [];
        const rank = normalize(title) === query ? 0 : normalize(title).startsWith(query) ? 1 : 2;
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

  function showTab(name) {
    const profile = name === 'profile';
    byId('workspace').hidden = byId('profile-toolbar').hidden = byId('status').hidden = !profile;
    settings.hidden = profile;
    if (profile) {
      waitingForHeading?.disconnect();
      void showProduction(false);
    }
    else if (results.hidden) activateSection();
    for (const tab of tabs) tab.setAttribute('aria-pressed', String(tab.dataset.desktopTab === name));
  }

  for (const tab of tabs) tab.addEventListener('click', () => showTab(tab.dataset.desktopTab));
  for (const control of sections) control.addEventListener('click', () => showSection(control.dataset.settingsSection));
  search.addEventListener('input', () => {
    showSearch();
    if (results.hidden) activateSection();
  });
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !search.value) return;
    event.preventDefault();
    showSection(selected, undefined, false);
  });
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!results.hidden) matches.querySelector('button')?.click();
  });
  document.addEventListener('keydown', (event) => {
    if (settings.hidden || event.defaultPrevented || !event.ctrlKey || event.altKey || event.shiftKey || event.metaKey
      || event.key.toLowerCase() !== 'f' || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    search.focus();
    search.select();
  });
  document.addEventListener('lastra-language', () => { if (!results.hidden) showSearch(); });
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
    showTab(name === 'profile' ? 'profile' : 'settings');
    if (name === 'updates') {
      byId('desktop-updates-heading').focus({ preventScroll: true });
      byId('desktop-updates').scrollIntoView({ block: 'nearest' });
    }
  });
  updateVisibility();
  showTab('settings');
}
