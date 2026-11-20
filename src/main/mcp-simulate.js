// @ts-check
'use strict';

const { validateProfile } = require('./profile');
const { simulateAction } = require('./action-test');
const { createProfileKeys } = require('../shared/profile-keys');
const { layouts } = require('./actions/keyboard-samples');
const { hasShortcutRule } = require('./shortcut-guards');

const GESTURES = ['tap', 'hold', 'double'];
const TYPE = { type: 'string' };
const BOOL = { type: 'boolean' };
const WINDOW = { type: 'integer', minimum: 1 };
const KEYBOARD = { enum: Object.keys(layouts) };
const DISCONNECTED = { type: 'array', maxItems: 3, items: { enum: ['audio', 'spotify', 'obs'] } };
const TITLE = { type: ['string', 'null'], maxLength: 512 };
const STATES = { type: 'object' };
const scenarioInput = {
  type: 'object', additionalProperties: false, required: ['profile', 'key'],
  properties: {
    profile: { type: 'object' }, page: TYPE, key: TYPE, gesture: { enum: GESTURES }, confirmed: BOOL,
    values: STATES, answers: { type: 'object', maxProperties: 32, additionalProperties: { ...TYPE, pattern: '^[a-zA-Z0-9_-]{1,40}$' } },
    photoshopWorkspace: BOOL, keyboardLayout: KEYBOARD, requireStableWindow: BOOL, windowId: WINDOW, appId: TYPE,
    windowTitle: TITLE, seed: { type: 'integer', minimum: 0, maximum: 0xFFFF_FFFF },
    disconnected: DISCONNECTED, timeline: {
      type: 'array', maxItems: 32, items: { type: 'object', required: ['atMs'], additionalProperties: false, properties: {
        atMs: { type: 'integer', minimum: 0, maximum: 600_000 }, windowId: WINDOW, appId: { type: ['string', 'null'] }, keyboardLayout: KEYBOARD,
        photoshopWorkspace: BOOL, cancel: BOOL, disconnected: DISCONNECTED, values: STATES, windowTitle: TITLE,
      } },
    },
  },
};
const scenarioOutput = {
  type: 'object', required: ['status', 'gesture', 'elapsedMs', 'effects'],
  properties: {
    status: { enum: ['success', 'failed', 'unavailable', 'cancelled', 'confirmation-required'] }, gesture: { enum: GESTURES },
    elapsedMs: { type: 'number' }, effects: { type: 'array', items: { type: 'object' } },
    steps: { type: 'array', items: { type: 'object' } }, message: { type: ['string', 'null'] },
  },
};

async function simulateGesture(args = {}) {
  const { profile: raw, page, key: id, gesture = 'tap', confirmed, values, answers, photoshopWorkspace, keyboardLayout,
    windowId, appId, windowTitle, requireStableWindow, disconnected, timeline, seed } = args;
  if (typeof id !== 'string' || id.length > 48 || (page !== undefined && (typeof page !== 'string' || page.length > 48))
      || !GESTURES.includes(gesture) || (confirmed !== undefined && typeof confirmed !== 'boolean')
      || (photoshopWorkspace !== undefined && typeof photoshopWorkspace !== 'boolean')
      || (keyboardLayout !== undefined && (typeof keyboardLayout !== 'string' || !Object.hasOwn(layouts, keyboardLayout)))
      || (values !== undefined && (!values || typeof values !== 'object' || Array.isArray(values)))) {
    throw new Error('Choose a key, gesture, and valid fixture states.');
  }
  const profile = validateProfile(raw);
  const target = page === 'bar:' ? profile.bar : page === undefined ? profile.pages[0] : profile.pages.find(({ id }) => id === page);
  const key = createProfileKeys(profile).resolve(target?.keys.find((item) => item?.id === id), target);
  if (!key) return { status: 'unavailable', gesture, elapsedMs: 0, effects: [], message: 'The supplied profile does not contain this key.' };
  const base = { gesture, elapsedMs: 0, effects: [] };
  if (key.confirm && confirmed !== true) {
    return { ...base, status: 'confirmation-required', message: 'The key requires confirmation in this fixture.' };
  }
  const contextual = Boolean(target.apps?.length || target.appIds?.length);
  const foreground = typeof values?.foreground === 'string' ? values.foreground.trim().toLowerCase() : '';
  const app = typeof appId === 'string' ? appId.toLowerCase() : '';
  if (contextual && !target.apps?.includes(foreground) && !target.appIds?.includes(app)) {
    return { ...base, status: 'unavailable', message: 'The supplied app does not match the target page.' };
  }
  if (target.windowTitle) {
    const { mode, value } = target.windowTitle;
    const title = typeof windowTitle === 'string' ? windowTitle.toLowerCase() : '';
    const expected = value.toLowerCase();
    const match = mode === 'exact' ? title === expected : mode === 'starts-with' ? title.startsWith(expected) : title.includes(expected);
    if (!match) return { ...base, status: 'unavailable', message: 'The supplied window title does not match the target page.' };
  }
  const action = key.confirm || gesture === 'tap' ? key.action : key[gesture];
  if (!action) return { ...base, status: 'unavailable', message: 'No action is assigned to this gesture.' };
  const { ok, unavailable, cancelled, ...result } = await simulateAction({
    action, values, answers, photoshopWorkspace, keyboardLayout, shortcutLanguage: profile.shortcutLanguage, webApps: profile.webApps, seed,
    scenario: { windowId, appId, windowTitle,
      requireStableWindow: contextual || requireStableWindow === true || hasShortcutRule(action, (_, step) => step.type === 'repeat' || step.type === 'choose'),
      disconnected, timeline },
  });
  return { ...base, ...result, status: cancelled ? 'cancelled' : ok ? 'success' : unavailable ? 'unavailable' : 'failed' };
}

module.exports = { scenarioInput, scenarioOutput, simulateGesture };
