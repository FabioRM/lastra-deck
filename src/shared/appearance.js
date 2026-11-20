'use strict';

{
  const THEMES = Object.freeze({ system: 'System', light: 'Light', dark: 'Dark',
    midnight: 'Midnight', forest: 'Forest', ember: 'Ember' });
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
    highContrast: false,
    textScale: 100,
    largeKeys: false,
    idleScreenSeconds: 0,
    screenDim: 100,
  });

  function validAppearanceSetting(setting, value) {
    if (setting === 'theme') return typeof value === 'string' && Object.hasOwn(THEMES, value);
    if (setting === 'accent') return typeof value === 'string' && (value === '' || /^#[0-9a-f]{6}$/i.test(value));
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
    const { theme, accent, highContrast, textScale, screenDim } = normalizeAppearance(settings);
    root.dataset.theme = theme;
    root.dataset.highContrast = String(highContrast);
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

  const api = { THEMES, TEXT_SCALES, IDLE_SCREEN_TIMES, DIM_LEVELS, TELEMETRY_READOUTS, READOUT_FORMATS,
    DEFAULT_APPEARANCE, validAppearanceSetting, normalizeAppearance, applyAppearance };
  if (typeof module === 'object') module.exports = api;
  else window.LastraAppearance = api;
}
