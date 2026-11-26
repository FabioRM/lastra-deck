'use strict';

{
  const THEMES = Object.freeze({ system: 'System', light: 'Light', dark: 'Dark',
    midnight: 'Midnight', forest: 'Forest', ember: 'Ember',
    graphite: 'Graphite', ocean: 'Ocean', plum: 'Plum', sand: 'Sand',
    'minimal-dark': 'Minimal dark', 'minimal-light': 'Minimal light',
    'contrast-dark': 'Contrast dark', 'contrast-light': 'Contrast light' });
  // Themes that are plain on purpose. They keep outline keys on a flat background whatever the deck look says.
  const CONTRAST_THEMES = Object.freeze(['contrast-dark', 'contrast-light']);
  const PLAIN_THEMES = Object.freeze(['minimal-dark', 'minimal-light', ...CONTRAST_THEMES]);
  const plainLook = ({ theme, highContrast }) => highContrast === true || PLAIN_THEMES.includes(theme);
  const KEY_STYLES = Object.freeze({ outline: 'Outline', tinted: 'Tinted', solid: 'Solid', glass: 'Glass' });
  const BACKDROPS = Object.freeze({ plain: 'Plain', glow: 'Glow', aurora: 'Aurora', grid: 'Dot grid' });
  const KEY_SHAPES = Object.freeze({ square: 'Square', rounded: 'Rounded', soft: 'Soft' });
  const ICON_WEIGHTS = Object.freeze({ thin: 'Thin', regular: 'Regular', bold: 'Bold' });
  // Choices that set the look of the deck. Each one maps to a data attribute read by look.css.
  const LOOK_CHOICES = Object.freeze({ keyStyle: KEY_STYLES, backdrop: BACKDROPS, keyShape: KEY_SHAPES, iconWeight: ICON_WEIGHTS });
  // Ready-made combinations of the four look choices. A quick look leaves the theme and accent alone.
  const LOOK_PRESETS = Object.freeze({
    classic: { name: 'Classic', keyStyle: 'outline', backdrop: 'plain', keyShape: 'rounded', iconWeight: 'regular' },
    glow: { name: 'Soft glow', keyStyle: 'tinted', backdrop: 'glow', keyShape: 'rounded', iconWeight: 'regular' },
    glass: { name: 'Glass', keyStyle: 'glass', backdrop: 'aurora', keyShape: 'soft', iconWeight: 'regular' },
    bold: { name: 'Bold tiles', keyStyle: 'solid', backdrop: 'plain', keyShape: 'rounded', iconWeight: 'bold' },
    blueprint: { name: 'Blueprint', keyStyle: 'outline', backdrop: 'grid', keyShape: 'square', iconWeight: 'thin' },
  });
  const ACCENT_PRESETS = Object.freeze(['#4db6ac', '#5b9df9', '#a78bfa', '#f472b6', '#fb7185', '#fb923c', '#facc15', '#4ade80']);
  const TEXT_SCALES = Object.freeze([100, 115, 125]);
  const IDLE_SCREEN_TIMES = Object.freeze({ 0: 'Off', 60: '1 minute', 180: '3 minutes', 300: '5 minutes', 600: '10 minutes' });
  const DIM_LEVELS = Object.freeze({ 35: '35%', 55: '55%', 80: '80%', 100: 'Off' });
  const TELEMETRY_READOUTS = Object.freeze({ cpuReadout: 'CPU', ramReadout: 'RAM', gpuReadout: 'GPU' });
  const READOUT_FORMATS = Object.freeze({ number: 'Number', gauge: 'Gauge' });
  const DEFAULT_APPEARANCE = Object.freeze({
    showPercentSigns: true,
    cpuReadout: 'number',
    ramReadout: 'number',
    gpuReadout: 'number',
    showClockSeconds: false,
    theme: 'system',
    accent: '',
    keyStyle: 'tinted',
    backdrop: 'glow',
    keyShape: 'rounded',
    iconWeight: 'regular',
    hideKeyLabels: false,
    highContrast: false,
    textScale: 100,
    largeKeys: false,
    idleScreenSeconds: 0,
    screenDim: 100,
  });

  function validAppearanceSetting(setting, value) {
    if (setting === 'theme') return typeof value === 'string' && Object.hasOwn(THEMES, value);
    if (setting === 'accent') return typeof value === 'string' && (value === '' || /^#[0-9a-f]{6}$/i.test(value));
    if (Object.hasOwn(LOOK_CHOICES, setting)) return typeof value === 'string' && Object.hasOwn(LOOK_CHOICES[setting], value);
    if (setting === 'textScale') return TEXT_SCALES.includes(value);
    if (setting === 'idleScreenSeconds') return Number.isInteger(value) && Object.hasOwn(IDLE_SCREEN_TIMES, value);
    if (setting === 'screenDim') return Number.isInteger(value) && Object.hasOwn(DIM_LEVELS, value);
    if (Object.hasOwn(TELEMETRY_READOUTS, setting)) return typeof value === 'string' && Object.hasOwn(READOUT_FORMATS, value);
    return Object.hasOwn(DEFAULT_APPEARANCE, setting) && typeof value === 'boolean';
  }

  function normalizeAppearance(value) {
    return Object.fromEntries(Object.entries(DEFAULT_APPEARANCE).map(([key, fallback]) =>
      [key, validAppearanceSetting(key, value?.[key]) ? value[key] : fallback]));
  }

  function applyAppearance(root, settings) {
    const { theme, accent, highContrast, textScale, screenDim, keyStyle, backdrop, keyShape, iconWeight, hideKeyLabels } = normalizeAppearance(settings);
    root.dataset.theme = theme;
    root.dataset.plainLook = String(plainLook({ theme, highContrast }));
    root.dataset.keyStyle = keyStyle;
    root.dataset.backdrop = backdrop;
    root.dataset.keyShape = keyShape;
    root.dataset.iconWeight = iconWeight;
    root.dataset.keyLabels = hideKeyLabels ? 'hidden' : 'shown';
    root.dataset.highContrast = String(highContrast || CONTRAST_THEMES.includes(theme));
    root.dataset.textScale = String(textScale);
    root.dataset.screenDim = String(screenDim);
    if (accent) {
      root.dataset.accent = 'custom';
      root.style.setProperty('--custom-accent', accent);
    } else {
      delete root.dataset.accent;
      root.style.removeProperty('--custom-accent');
    }
  }

  const api = { THEMES, PLAIN_THEMES, plainLook, KEY_STYLES, BACKDROPS, KEY_SHAPES, ICON_WEIGHTS, LOOK_CHOICES, LOOK_PRESETS, ACCENT_PRESETS, TEXT_SCALES, IDLE_SCREEN_TIMES, DIM_LEVELS, TELEMETRY_READOUTS, READOUT_FORMATS,
    DEFAULT_APPEARANCE, validAppearanceSetting, normalizeAppearance, applyAppearance };
  if (typeof module === 'object') module.exports = api;
  else window.LastraAppearance = api;
}
