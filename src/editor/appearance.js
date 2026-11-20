'use strict';

window.bindLastraAppearance = function bindLastraAppearance(api, applyPreview) {
  const { t } = window.LastraI18n;
  const { element } = window.LastraDom;
  const { DEFAULT_APPEARANCE, THEMES, TEXT_SCALES, IDLE_SCREEN_TIMES, DIM_LEVELS, TELEMETRY_READOUTS,
    READOUT_FORMATS, normalizeAppearance, applyAppearance } = window.LastraAppearance;
  const form = document.getElementById('appearance-controls');
  const status = document.getElementById('appearance-status');
  const themeOptions = document.getElementById('theme-options');
  const resetAccent = document.getElementById('reset-accent');
  const accent = form.elements.accent;
  let current = DEFAULT_APPEARANCE;

  const options = {
    textScale: TEXT_SCALES.map((value) => [value, `${value}%`]),
    idleScreenSeconds: Object.entries(IDLE_SCREEN_TIMES),
    screenDim: Object.entries(DIM_LEVELS).reverse(),
  };
  function optionLabels() {
    for (const [name, entries] of Object.entries(options)) {
      const control = form.elements[name];
      control.replaceChildren(...entries.map(([value, label]) => new Option(t(label), value)));
      control.value = String(current[name]);
    }
    for (const caption of themeOptions.querySelectorAll('[data-theme-caption]')) {
      caption.textContent = t(THEMES[caption.dataset.themeCaption]);
    }
  }
  for (const [value, name] of Object.entries(THEMES)) {
    const label = element('label', 'theme-option');
    const radio = Object.assign(element('input'), { type: 'radio', name: 'theme', value });
    const sample = element('span', { className: 'theme-sample', dataset: { theme: value }, attrs: { 'aria-hidden': 'true' } });
    sample.append(element('i'), element('i'), element('i'));
    label.append(radio, sample, element('span', { text: t(name), dataset: { themeCaption: value } }));
    themeOptions.append(label);
  }
  optionLabels();

  const sample = { cpuReadout: 34, ramReadout: 71, gpuReadout: 88 };
  const readouts = document.getElementById('appearance-readouts');
  const previews = Object.entries(TELEMETRY_READOUTS).map(([name, label]) => {
    const card = document.createElement('fieldset');
    const title = document.createElement('legend');
    title.textContent = label;
    const preview = document.createElement('div');
    preview.className = 'readout-sample';
    preview.setAttribute('aria-hidden', 'true');
    preview.style.setProperty('--telemetry-angle', sample[name] * 1.8 + 'deg');
    const number = document.createElement('span');
    const unit = document.createElement('small');
    unit.textContent = '%';
    number.append(String(sample[name]), unit);
    preview.append(number);
    const choices = document.createElement('div');
    choices.className = 'readout-choices';
    for (const [value, caption] of Object.entries(READOUT_FORMATS)) {
      const choice = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = name;
      radio.value = value;
      const text = document.createElement('span');
      text.textContent = t(caption);
      choice.append(radio, text);
      choices.append(choice);
    }
    card.append(title, preview, choices);
    readouts.append(card);
    return { name, preview, unit };
  });

  function render(settings) {
    current = normalizeAppearance(settings);
    for (const [name, value] of Object.entries(current)) {
      const control = form.elements.namedItem(name);
      if (!control || name === 'accent') continue;
      if (typeof value === 'boolean') control.checked = value;
      else control.value = String(value);
    }
    const swatch = themeOptions.querySelector(`[data-theme="${current.theme}"] i:last-child`);
    const channels = getComputedStyle(swatch).backgroundColor.match(/\d+/g);
    const presetAccent = channels?.length === 3 ? '#' + channels.map((value) => Number(value).toString(16).padStart(2, '0')).join('') : '#619fd8';
    accent.value = current.accent || presetAccent;
    resetAccent.disabled = !current.accent;
    for (const { name, preview, unit } of previews) {
      preview.classList.toggle('telemetry-arc', current[name] === 'gauge');
      unit.hidden = !current.showPercentSigns;
    }
    applyAppearance(document.documentElement, current);
    applyPreview(current);
  }

  document.addEventListener('lastra-language', () => {
    optionLabels();
    for (const radio of readouts.querySelectorAll('input[type="radio"]')) {
      radio.nextElementSibling.textContent = t(READOUT_FORMATS[radio.value]);
    }
  });
  api.onAppearance(render);
  api.getAppearance().then((settings) => {
    render(settings);
    form.inert = false;
  }).catch(() => {
    status.textContent = window.LastraI18n.t('Could not read appearance settings.');
    status.classList.add('error');
  });

  form.addEventListener('submit', (event) => event.preventDefault());
  async function save(name, value, target) {
    if (form.inert) return;
    form.inert = true;
    status.textContent = '';
    status.classList.remove('error');
    try {
      render(await api.setAppearance(name, value));
      status.textContent = window.LastraI18n.t('Deck settings saved.');
    } catch {
      render(current);
      status.textContent = window.LastraI18n.t('Could not save appearance settings.');
      status.classList.add('error');
    } finally {
      form.inert = false;
      (target.disabled && target === resetAccent ? accent : target).focus({ preventScroll: true });
    }
  }
  form.addEventListener('change', ({ target }) => {
    const { name } = target;
    if (!Object.hasOwn(DEFAULT_APPEARANCE, name)) return;
    const type = typeof DEFAULT_APPEARANCE[name];
    const value = type === 'boolean' ? target.checked : type === 'number' ? Number(target.value) : target.value;
    void save(name, value, target);
  });
  resetAccent.addEventListener('click', () => void save('accent', '', resetAccent));
};
