'use strict';

{
  const api = window.lastraEditor;
  const { t } = window.LastraI18n;
  const { SPECIES, HABITATS, NAME_LIMIT } = window.LastraPet;
  const byId = (id) => document.getElementById(id);
  const form = byId('pet-preferences');
  const { habitat, species, petName, motion } = form.elements;
  const status = byId('pet-settings-status');
  const about = byId('about-settings');
  const aboutStatus = byId('about-status');
  let preferences;
  let petMessage = '';
  let aboutMessage = '';
  let metadata;

  function renderOptions() {
    for (const [select, entries] of [[species, Object.entries(SPECIES).map(([id, pet]) => [id, pet.label])],
      [habitat, Object.entries(HABITATS)]]) {
      const current = select.value;
      select.replaceChildren(...entries.map(([id, label]) => new Option(t(label), id)));
      if (current) select.value = current;
    }
  }

  function renderPreferences() {
    if (preferences) {
      species.value = preferences.species;
      habitat.value = preferences.habitat;
      petName.value = preferences.name;
      petName.placeholder = SPECIES[preferences.species].name;
      motion.checked = preferences.motion;
    }
    status.textContent = t(petMessage);
  }

  function renderAbout() {
    aboutStatus.textContent = t(aboutMessage);
    if (metadata) byId('about-version').textContent = t('Version {version}', { version: metadata.version });
  }

  petName.maxLength = NAME_LIMIT;
  renderOptions();
  api.getDeckPet().then((settings) => {
    preferences = settings;
    renderPreferences();
    form.inert = false;
  }).catch(() => {
    petMessage = 'Could not load pet settings.';
    status.classList.add('error');
    renderPreferences();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (document.activeElement === petName) petName.blur();
  });
  form.addEventListener('change', async ({ target }) => {
    if (form.inert) return;
    const focused = document.activeElement === target;
    form.inert = true;
    petMessage = status.textContent = '';
    try {
      preferences = await api.setDeckPet({ species: species.value, habitat: habitat.value, name: petName.value, motion: motion.checked });
      petMessage = 'Pet settings saved.';
      status.classList.remove('error');
    } catch {
      petMessage = 'Could not save pet settings.';
      status.classList.add('error');
    } finally {
      renderPreferences();
      form.inert = false;
      if (focused && document.activeElement === document.body) target.focus({ preventScroll: true });
    }
  });

  api.getAbout().then((data) => {
    metadata = data;
    byId('about-author').textContent = data.author;
    byId('about-license').textContent = data.license;
    for (const link of about.querySelectorAll('[data-about-link]')) link.href = data.links[link.dataset.aboutLink];
    renderAbout();
  }).catch(() => {
    aboutMessage = 'Could not load Lastra information.';
    renderAbout();
  });
  async function openLink(event) {
    const link = event.target.closest('a[data-about-link][href]');
    if (!link || event.button > 1) return;
    event.preventDefault();
    aboutMessage = aboutStatus.textContent = '';
    try { await api.openAboutLink(link.dataset.aboutLink); }
    catch {
      aboutMessage = 'Could not open the link.';
      aboutStatus.textContent = t(aboutMessage);
    }
  }
  about.addEventListener('click', openLink);
  about.addEventListener('auxclick', openLink);
  document.addEventListener('lastra-language', () => {
    renderOptions();
    status.textContent = t(petMessage);
    renderAbout();
  });
}
