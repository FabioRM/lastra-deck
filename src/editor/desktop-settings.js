'use strict';

{
  const api = window.lastraEditor;
  const { t, set: setLanguage } = window.LastraI18n;
  const byId = (id) => document.getElementById(id);
  const settings = byId('desktop-settings');
  const tabs = [...document.querySelectorAll('[data-desktop-tab]')];
  const sections = [...settings.querySelectorAll('[data-settings-section]')];
  const grafana = byId('grafana-settings-form');
  const calendarPick = byId('settings-calendar-pick');
  const calendarClear = byId('settings-calendar-clear');
  const calendarStatus = byId('settings-calendar-status');
  let calendarSelected = false;
  let calendarBusy = false;
  const productionModes = window.LastraObsModes.mount(byId('desktop-production-modes'), api, { settingsOnly: true });
  const productionTimers = window.LastraObsProduction.createProductionView(byId('desktop-production-timers'), api, { settingsOnly: true });
  let productionRequest = 0;
  const obsToggle = byId('settings-obs-enabled');
  const obsStatus = byId('settings-obs-status');
  const language = byId('interface-language');
  const languageStatus = byId('language-status');
  let savedLanguage;

  function updateLanguage(settings) {
    savedLanguage = settings.preference;
    language.value = savedLanguage;
    setLanguage(settings.language);
  }
  api.getLanguage().then((settings) => {
    updateLanguage(settings);
    language.disabled = false;
  }).catch(() => { languageStatus.textContent = t('Could not read the interface language.'); });
  language.addEventListener('change', async () => {
    language.disabled = true;
    languageStatus.textContent = '';
    try {
      updateLanguage(await api.setLanguage(language.value));
      languageStatus.textContent = t('Interface language saved.');
    } catch {
      language.value = savedLanguage;
      languageStatus.textContent = t('Could not save the interface language.');
    } finally {
      language.disabled = false;
      language.focus({ preventScroll: true });
    }
  });

  async function updateObsAvailability(enabled) {
    obsToggle.disabled = true;
    obsStatus.textContent = '';
    try {
      const saved = await api.obsAvailability(enabled);
      obsToggle.checked = saved.enabled;
    } catch (error) {
      obsToggle.checked = (await api.obsAvailability().catch(() => ({ enabled: false }))).enabled;
      obsStatus.textContent = error.message;
    } finally {
      obsToggle.disabled = false;
    }
  }
  obsToggle.addEventListener('change', () => void updateObsAvailability(obsToggle.checked));

  async function showProduction(open) {
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
    calendarBusy = calendarPick.disabled = calendarClear.disabled = true;
    try {
      const result = await api.calendarSettings(type);
      if (!result.ok) throw new Error(result.message);
      calendarSelected = result.selected;
      calendarStatus.textContent = result.message || (calendarSelected ? 'Calendar file selected.' : 'No calendar file selected.');
    } catch (error) {
      calendarStatus.textContent = error.message || t('Could not update the calendar file.');
    } finally {
      calendarBusy = calendarPick.disabled = false;
      calendarClear.disabled = !calendarSelected;
    }
  }

  let grafanaLoaded = false;
  async function loadGrafana() {
    if (grafanaLoaded) return;
    try {
      grafana.elements.url.value = await api.getGrafanaSettings();
      grafanaLoaded = true;
      grafana.inert = false;
    } catch {
      byId('grafana-settings-status').textContent = t('Could not read the Grafana link.');
    }
  }

  function showSection(id) {
    for (const control of sections) control.setAttribute('aria-pressed', String(control.dataset.settingsSection === id));
    for (const panel of settings.querySelectorAll('[data-settings-panel]')) {
      panel.hidden = panel.id !== id;
      if (!panel.hidden) panel.open = true;
    }
    byId('desktop-menu-status').textContent = '';
    if (id === 'appearance-settings') void calendar('read');
    if (id === 'stats-settings') void loadGrafana();
    void showProduction(id === 'production-settings');
  }

  function showTab(name) {
    const profile = name === 'profile';
    byId('workspace').hidden = byId('profile-toolbar').hidden = byId('status').hidden = !profile;
    settings.hidden = profile;
    void showProduction(!profile && !byId('production-settings').hidden);
    for (const tab of tabs) tab.setAttribute('aria-pressed', String(tab.dataset.desktopTab === name));
  }

  for (const tab of tabs) tab.addEventListener('click', () => showTab(tab.dataset.desktopTab));
  for (const control of sections) control.addEventListener('click', () => showSection(control.dataset.settingsSection));
  for (const control of settings.querySelectorAll('[data-desktop-menu]')) {
    control.addEventListener('click', async () => {
      const status = byId('desktop-menu-status');
      status.textContent = '';
      try {
        if (!await api.openDesktopMenu(control.dataset.desktopMenu)) status.textContent = t('This group is currently unavailable.');
      } catch {
        status.textContent = t('Could not open these options.');
      }
    });
  }
  byId('settings-integrations').addEventListener('click', () => byId('integration-setup-open').click());
  calendarPick.addEventListener('click', () => void calendar('pick'));
  calendarClear.addEventListener('click', () => void calendar('clear'));
  grafana.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (grafana.inert) return;
    const status = byId('grafana-settings-status');
    grafana.inert = true;
    try {
      const result = await api.setGrafanaSettings(grafana.elements.url.value);
      if (!result.ok) throw new Error(result.message);
      status.textContent = t('Grafana link saved.');
    } catch (error) {
      status.textContent = error.message || t('Could not save the Grafana link.');
    } finally {
      grafana.inert = false;
    }
  });
  api.onDesktopSection((name) => showTab(name === 'profile' ? 'profile' : 'settings'));
  showTab('settings');
  showSection('appearance-settings');
}
