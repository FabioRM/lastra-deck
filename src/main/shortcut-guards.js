// @ts-check
'use strict';

const { release } = require('node:os');
const { layoutTokens } = require('./actions/keys');

const US_LAYOUT = 0x04090409;
const WINDOWS_BUILD = process.platform === 'win32' ? Number(release().split('.')[2]) : 0;
const LANGUAGES = new Set(['en-US', 'it-IT']);
const FIELDS = new Set(['pack', 'application', 'platform', 'layout', 'mode', 'language', 'minBuild', 'confirm']);

function validShortcutGuard(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => FIELDS.has(key))
    && typeof value.pack === 'string' && /^[a-z0-9-]{1,48}$/.test(value.pack)
    && typeof value.application === 'string' && value.application.trim() === value.application
    && /^\P{Cc}{1,80}$/u.test(value.application)
    && ['windows', 'web'].includes(value.platform)
    && (value.layout === undefined || (Number.isSafeInteger(value.layout) && value.layout > 0 && value.layout <= 0xffffffff))
    && (value.mode === undefined || (typeof value.mode === 'string' && /^\P{Cc}{1,120}$/u.test(value.mode)))
    && (value.language === undefined || LANGUAGES.has(value.language))
    && (value.minBuild === undefined || (Number.isSafeInteger(value.minBuild) && value.minBuild > 0))
    && (value.confirm === undefined || typeof value.confirm === 'boolean'));
}

/**
 * @param {any} rule A validated shortcut guard.
 * @param {{ build?: number, keyboardLayout?: number, mode?: string, shortcutLanguage?: string }} [system]
 * @returns {string | undefined}
 */
function shortcutRequirements(rule, { build = WINDOWS_BUILD, keyboardLayout, mode, shortcutLanguage } = {}) {
  if (rule.minBuild && !(build >= rule.minBuild)) return `Requires Windows 11 build ${rule.minBuild} or later.`;
  if (rule.layout && rule.layout !== keyboardLayout) {
    return rule.layout === US_LAYOUT ? 'Requires the US keyboard layout.' : 'Requires a different keyboard layout.';
  }
  if (rule.mode && rule.mode !== mode) return 'Requires ' + rule.mode + '.';
  if (rule.language && rule.language !== shortcutLanguage) return `Requires Office shortcut language ${rule.language}.`;
}

/**
 * @param {any} rule A validated shortcut guard.
 * @param {{ platform?: string, activePack?: any, context?: any, shortcutLanguage?: string, build?: number, keys?: unknown }} [target]
 * @returns {string | undefined}
 */
function shortcutUnavailable(rule, { platform = process.platform, activePack, context, shortcutLanguage, build, keys } = {}) {
  if (platform !== 'win32') return 'Requires Windows.';
  if (context?.windowId == null || activePack?.id !== rule.pack || Boolean(activePack?.sites) !== (rule.platform === 'web')) {
    return rule.platform === 'web' ? `Bring the verified ${rule.application} web app to the foreground.`
      : `Bring ${rule.application} to the foreground.`;
  }
  // Copies made before an editor mode was added still use the original starter chord.
  const chord = typeof keys === 'string' ? keys.toLowerCase().replace(/\s/g, '') : '';
  const legacyMode = !rule.mode && chord && activePack.editingMode && activePack.keys.some(([, , , starter, requirements]) =>
    requirements?.mode === activePack.editingMode && typeof starter === 'string' && starter.toLowerCase() === chord)
    ? activePack.editingMode : undefined;
  return shortcutRequirements(legacyMode ? { ...rule, mode: legacyMode } : rule,
    { keyboardLayout: context.keyboardLayout, mode: context.mode, shortcutLanguage, build });
}

/**
 * @param {any} action
 * @param {(rule: any, step: any) => boolean} [match]
 * @param {number} [depth]
 * @returns {boolean}
 */
function hasShortcutRule(action, match = (rule) => Boolean(rule), depth = 0) {
  if (!action || depth > 3) return false;
  if (match(action.shortcutGuard, action)) return true;
  if (action.type === 'sequence' || action.type === 'repeat') {
    return Array.isArray(action.steps) && action.steps.some((step) => hasShortcutRule(step, match, depth + 1));
  }
  if (action.type === 'if') return hasShortcutRule(action.then, match, depth + 1) || hasShortcutRule(action.else, match, depth + 1);
  if (action.type === 'choose') return Array.isArray(action.choices) && action.choices.some((choice) => hasShortcutRule(choice?.action, match, depth + 1));
  if (action.type === 'random') return Array.isArray(action.pool) && action.pool.some((option) => hasShortcutRule(option, match, depth + 1));
  return false;
}

function shortcutNeedsConfirmation(action) {
  return hasShortcutRule(action, (rule, step) => Boolean(rule && (rule.confirm || needsShortcutConfirmation('', step.keys))));
}

function actionNeedsShortcutTarget(action) {
  return hasShortcutRule(action, (rule, step) => Boolean(rule || (step.type === 'hotkey' && layoutTokens(step.keys))));
}

function sameShortcutWindow(expected, active) {
  const source = (context) => [context?.path || context?.executable, context?.appId]
    .map((value) => value?.toLowerCase() ?? '').join('\n');
  return expected?.windowId != null && expected.windowId === active?.windowId && expected.id === active?.id
    && source(expected) === source(active);
}

function needsShortcutConfirmation(id, keys) {
  if (/^(?:close-(?:tab|window|file|document|application|app)|quit|exit|end-(?:call|meeting)|leave-(?:call|meeting)|hang-up|permanent(?:ly)?-delete|delete-permanently|send-(?:message|email|mail|invitation|invite))(?:-|$)/i.test(id)) return true;
  const chord = String(keys ?? '').toLowerCase().replace(/\s/g, '').split('+');
  return chord.includes('shift') && (chord.includes('delete') || chord.includes('del'));
}

module.exports = { US_LAYOUT, validShortcutGuard, shortcutRequirements, shortcutUnavailable, hasShortcutRule,
  needsShortcutConfirmation, shortcutNeedsConfirmation, actionNeedsShortcutTarget, sameShortcutWindow };
