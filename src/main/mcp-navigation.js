// @ts-check
'use strict';

const { VIEWS } = require('./deck-navigation');
const { GROUPS } = require('./stats');
const { DEFAULT_APPEARANCE, THEMES, TELEMETRY_READOUTS, READOUT_FORMATS, validAppearanceSetting } = require('../shared/appearance');

const SURFACE = 'deck';
const STATS_TABS = ['overview', ...Object.keys(GROUPS)];
const APPEARANCE_SETTINGS = Object.keys(DEFAULT_APPEARANCE).filter((setting) => !['idleScreenSeconds', 'screenDim'].includes(setting));
const FIELDS = Object.freeze({
  inspect: [], surface: [], view: ['view'], page: ['page'], home: [], stats: ['tab'], lock: ['enabled'],
  follow: ['enabled'], appearance: ['setting', 'value'],
});
const PAGE_ID = /^[a-zA-Z0-9_-]{1,40}$/;
const COMMAND_FIELDS = ['command', 'surface'];
const commandInput = {
  type: 'object', additionalProperties: false, required: ['command'],
  properties: {
    command: { enum: Object.keys(FIELDS) }, surface: { const: SURFACE },
    view: { enum: [...VIEWS] }, page: { type: 'string', pattern: PAGE_ID.source }, tab: { enum: STATS_TABS },
    enabled: { type: 'boolean' }, setting: { enum: APPEARANCE_SETTINGS },
    value: { type: ['boolean', 'integer', 'string'] },
  },
};
const dimensions = { type: 'object', required: ['width', 'height', 'units'], properties: {
  width: { type: 'number' }, height: { type: 'number' }, units: { enum: ['dip', 'px'] },
} };
const pageEntry = { type: 'object', required: ['id', 'name'], properties: { id: { type: 'string' }, name: { type: 'string' } } };
const navigationOutput = {
  type: 'object', required: ['surface', 'view', 'statsTab', 'page', 'pages', 'appearance'],
  properties: {
    surface: { type: 'object', required: ['id', 'available', 'orientation', 'rotation', 'logical', 'physical', 'controls'],
      properties: { id: { const: SURFACE }, available: { type: 'boolean' },
        orientation: { enum: ['landscape', 'portrait'] }, rotation: { type: 'number' }, logical: dimensions, physical: dimensions,
        controls: { type: 'object', required: ['appearance', 'show', 'brightness', 'orientation', 'wake'], properties: {
          appearance: { const: 'available' }, show: { const: 'available' }, brightness: { const: 'unavailable' },
          orientation: { const: 'read-only' }, wake: { const: 'unavailable' },
        } },
      } },
    view: { enum: [...VIEWS] }, statsTab: { enum: STATS_TABS }, revision: { type: 'integer' },
    page: { type: 'object', required: ['id', 'name', 'reason', 'sheet', 'locked', 'following', 'targetAvailable'],
      properties: { ...pageEntry.properties, reason: { type: 'string' }, sheet: { type: 'integer' }, locked: { type: 'boolean' },
        following: { type: 'boolean' }, targetAvailable: { type: 'boolean' },
      } },
    pages: { type: 'array', items: pageEntry },
    appearance: { type: 'object', properties: {
      theme: { enum: Object.keys(THEMES) }, accent: { type: 'string', pattern: '^(?:#[0-9a-fA-F]{6})?$' },
      textScale: { type: 'integer' }, highContrast: { type: 'boolean' },
      largeKeys: { type: 'boolean' },
      showClockSeconds: { type: 'boolean' }, showPercentSigns: { type: 'boolean' },
      ...Object.fromEntries(Object.keys(TELEMETRY_READOUTS).map((setting) => [setting, { enum: Object.keys(READOUT_FORMATS) }])),
      screenDim: { type: 'integer' },
    } },
  },
};

class NavigationRequestError extends Error {}

function navigationParams(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.command !== 'string'
      || !Object.hasOwn(FIELDS, value.command) || (value.surface !== undefined && value.surface !== SURFACE)) {
    throw new NavigationRequestError('Choose a valid command for the deck surface.');
  }
  const { command } = value;
  const fields = FIELDS[command];
  if (Object.keys(value).some((field) => !COMMAND_FIELDS.includes(field) && !fields.includes(field))) {
    throw new NavigationRequestError('Use only the parameters for the selected navigation command.');
  }
  if ((command === 'view' && !VIEWS.has(value.view))
      || (command === 'page' && (typeof value.page !== 'string' || !PAGE_ID.test(value.page)))
      || (command === 'stats' && !STATS_TABS.includes(value.tab))
      || (['lock', 'follow'].includes(command) && typeof value.enabled !== 'boolean')
      || (command === 'appearance' && (!APPEARANCE_SETTINGS.includes(value.setting) || !validAppearanceSetting(value.setting, value.value)))) {
    throw new NavigationRequestError('Choose a supported view, page, Stats tab, lock state, or appearance value.');
  }
  return value;
}

function navigationSurface({ available, logical, physical, rotation }) {
  return { id: SURFACE, available, logical, physical, rotation,
    orientation: logical.height > logical.width ? 'portrait' : 'landscape',
    controls: { appearance: 'available', show: 'available', brightness: 'unavailable', orientation: 'read-only', wake: 'unavailable' },
  };
}

module.exports = { NavigationRequestError, commandInput, navigationOutput, navigationParams, navigationSurface };
