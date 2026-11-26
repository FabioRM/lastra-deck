'use strict';

window.bindLastraAppearance = function bindLastraAppearance(api, applyPreview) {
  const { t } = window.LastraI18n;
  const { element } = window.LastraDom;
  const { DEFAULT_APPEARANCE, THEMES, plainLook, LOOK_CHOICES, LOOK_PRESETS, ACCENT_PRESETS, TEXT_SCALES, IDLE_SCREEN_TIMES, DIM_LEVELS, TELEMETRY_READOUTS,
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

  // Deck look: every choice is a card with a small sample drawn by the same styles as the deck.
  const SAMPLE_ICONS = {
    app: ['M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z'],
    media: ['M6 3l14 9-14 9V3z'],
    system: ['M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', 'M8 21h8', 'M12 17v4'],
    meeting: ['M16 13l5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11', 'M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z'],
  };
  function sampleKey(category, attributes = {}) {
    const key = element('span', { className: 'look-key', dataset: { cat: category, ...attributes } });
    const glyph = element('span', 'look-glyph');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    for (const [name, value] of Object.entries({ fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) {
      svg.setAttribute(name, value);
    }
    for (const data of SAMPLE_ICONS[category]) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', data);
      svg.append(path);
    }
    glyph.append(svg);
    key.append(glyph);
    return key;
  }
  const lookSamples = {
    keyStyle: (value) => ['app', 'media', 'system'].map((category) => sampleKey(category, { look: value })),
    backdrop: (value) => {
      const scene = element('span', { className: 'look-scene', dataset: { lookBackdrop: value } });
      scene.append(sampleKey('app'), sampleKey('meeting'));
      return [scene];
    },
    keyShape: (value) => [sampleKey('app', { lookShape: value })],
    iconWeight: (value) => [sampleKey('system', { lookWeight: value })],
  };
  const lookHosts = { keyStyle: 'key-style-options', backdrop: 'backdrop-options', keyShape: 'key-shape-options', iconWeight: 'icon-weight-options' };
  for (const [setting, id] of Object.entries(lookHosts)) {
    const host = document.getElementById(id);
    for (const [value, name] of Object.entries(LOOK_CHOICES[setting])) {
      const label = element('label', { className: 'look-option', dataset: { lookSetting: setting } });
      const radio = Object.assign(element('input'), { type: 'radio', name: setting, value });
      const sampleBox = element('span', { className: 'look-sample', attrs: { 'aria-hidden': 'true' } });
      sampleBox.append(...lookSamples[setting](value));
      label.append(radio, sampleBox, element('span', { text: t(name), dataset: { lookCaption: name } }));
      host.append(label);
    }
  }
  const lookPresets = document.getElementById('look-presets');
  for (const [id, { name, keyStyle, backdrop, keyShape, iconWeight }] of Object.entries(LOOK_PRESETS)) {
    const preset = element('button', { className: 'look-option look-preset', attrs: { type: 'button' }, dataset: { lookPreset: id } });
    const scene = element('span', { className: 'look-scene', dataset: { lookBackdrop: backdrop }, attrs: { 'aria-hidden': 'true' } });
    scene.append(...['app', 'media'].map((category) => sampleKey(category, { look: keyStyle, lookShape: keyShape, lookWeight: iconWeight })));
    preset.append(scene, element('span', { text: t(name), dataset: { lookCaption: name } }));
    lookPresets.append(preset);
  }
  const lookPreview = document.getElementById('look-preview');
  lookPreview.append(...['app', 'app', 'media', 'media', 'system', 'system', 'meeting', 'app'].map((category) => sampleKey(category)));
  const accentPresets = document.getElementById('accent-presets');
  for (const color of ACCENT_PRESETS) {
    const preset = element('button', { className: 'accent-preset', label: color, title: color, attrs: { type: 'button' }, dataset: { accent: color } });
    preset.style.setProperty('--swatch', color);
    accentPresets.append(preset);
  }

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
    for (const preset of accentPresets.children) preset.setAttribute('aria-pressed', String(preset.dataset.accent === current.accent.toLowerCase()));
    const plain = plainLook(current);
    lookPreview.dataset.lookBackdrop = plain ? 'plain' : current.backdrop;
    document.getElementById('look-plain-note').hidden = !plain;
    for (const id of ['look-presets', 'key-style-options', 'backdrop-options']) document.getElementById(id).closest('.look-palette').inert = plain;
    for (const preset of lookPresets.children) {
      const { name, ...look } = LOOK_PRESETS[preset.dataset.lookPreset];
      preset.setAttribute('aria-pressed', String(Object.entries(look).every(([setting, value]) => current[setting] === value)));
    }
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
    for (const caption of form.querySelectorAll('[data-look-caption]')) caption.textContent = t(caption.dataset.lookCaption);
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
      if (document.activeElement === document.body) {
        (target.disabled && target === resetAccent ? accent : target).focus({ preventScroll: true });
      }
    }
  }
  // A quick look sets its four choices one after the other, so each one is validated and saved like a single change.
  async function applyLook(id, target) {
    if (form.inert) return;
    const { name, ...look } = LOOK_PRESETS[id];
    form.inert = true;
    status.textContent = '';
    status.classList.remove('error');
    try {
      let saved = current;
      for (const [setting, value] of Object.entries(look)) {
        if (saved[setting] !== value) saved = await api.setAppearance(setting, value);
      }
      render(saved);
      status.textContent = window.LastraI18n.t('Deck settings saved.');
    } catch {
      api.getAppearance().then(render).catch(() => render(current));
      status.textContent = window.LastraI18n.t('Could not save appearance settings.');
      status.classList.add('error');
    } finally {
      form.inert = false;
      target.focus({ preventScroll: true });
    }
  }
  lookPresets.addEventListener('click', ({ target }) => {
    const preset = target.closest('.look-preset');
    if (preset) void applyLook(preset.dataset.lookPreset, preset);
  });
  form.addEventListener('change', ({ target }) => {
    const { name } = target;
    if (!Object.hasOwn(DEFAULT_APPEARANCE, name)) return;
    const type = typeof DEFAULT_APPEARANCE[name];
    const value = type === 'boolean' ? target.checked : type === 'number' ? Number(target.value) : target.value;
    void save(name, value, target);
  });
  resetAccent.addEventListener('click', () => void save('accent', '', resetAccent));
  accentPresets.addEventListener('click', ({ target }) => {
    const preset = target.closest('.accent-preset');
    if (preset) void save('accent', preset.dataset.accent, preset);
  });
};
