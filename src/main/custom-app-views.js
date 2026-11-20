// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { expandEnv } = require('./actions');
const { parseCombo } = require('./actions/keys');
const { normalizeWidgetInstances } = require('./widgets');
const { VIEW_GRID } = require('../shared/widget-layout');

const MAX_CONFIG_BYTES = 256 * 1024;
const ID = /^[a-z0-9_-]{1,48}$/;

function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + ' needs an object');
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new Error(label + ' has an unsupported field "' + key + '"');
  }
  return value;
}

function string(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(label + ' needs text of 1–' + max + ' characters');
  }
  return value.trim();
}

function id(value, used, label) {
  if (typeof value !== 'string' || !ID.test(value) || used.has(value)) {
    throw new Error(label + ' needs a unique lowercase ID using letters, numbers, hyphens or underscores');
  }
  used.add(value);
  return value;
}

function normalizeMatch(value, label) {
  const match = object(value, ['executable', 'appId', 'titleContains'], label);
  const rule = {};
  if (match.executable !== undefined) {
    const executable = string(match.executable, 1024, label + ' executable');
    const expanded = expandEnv(executable);
    if (!/\.exe$/i.test(expanded) || /["<>|?*\u0000-\u001f]/.test(expanded)
      || (/[\\/:]/.test(expanded) && !/^(?:[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+\\)/i.test(expanded))) {
      throw new Error(label + ' executable needs an .exe name or an absolute Windows path');
    }
    rule.executable = path.win32.normalize(expanded).toLowerCase();
    rule.launchExecutable = executable;
  }
  if (match.appId !== undefined) {
    const appId = string(match.appId, 128, label + ' Windows app ID');
    if (!/^[\w.!-]+$/.test(appId)) throw new Error(label + ' contains an invalid Windows app ID');
    rule.appId = appId.toLowerCase();
    rule.launchAppId = appId;
  }
  if (!rule.executable && !rule.appId) throw new Error(label + ' needs an executable or Windows app ID');
  if (match.titleContains !== undefined) rule.title = string(match.titleContains, 256, label + ' title contains').toLowerCase();
  return rule;
}

function matchesCustomApp(rule, window) {
  return Boolean(window && (!rule.executable || rule.executable === (rule.executable.includes('\\') ? window.path : window.executable))
    && (!rule.appId || rule.appId === window.appId)
    && (!rule.title || window.title?.toLowerCase().includes(rule.title)));
}

function fallbackCommand(entry, match, label) {
  if (entry.url !== undefined) {
    const target = string(entry.url, 2048, label + ' URL');
    let url;
    try {
      url = new URL(target);
    } catch {
      throw new Error(label + ' URL needs a valid HTTP or HTTPS address');
    }
    if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error(label + ' URL needs an HTTP or HTTPS address without credentials');
    }
    return { id: 'open', label: 'Open app', action: { type: 'open', target: url.href } };
  }
  if (match.title) return null;
  if (match.launchAppId) return {
    id: 'open', label: 'Open app',
    action: { type: 'launch', target: '%WINDIR%\\explorer.exe', args: ['shell:AppsFolder\\' + match.launchAppId] },
  };
  return { id: 'open', label: 'Open app', action: { type: 'launch', target: match.launchExecutable } };
}

function normalizeCustomViews(raw, reserved = []) {
  object(raw, ['version', 'views'], 'Custom app views');
  if (raw.version !== 1 || !Array.isArray(raw.views) || raw.views.length > 32) {
    throw new Error('Custom app views need version 1 and a list of up to 32 views');
  }
  const used = new Set(reserved);
  return raw.views.map((entry, index) => {
    const label = 'Custom app view ' + (index + 1);
    object(entry, ['id', 'name', 'category', 'summary', 'icon', 'match', 'url', 'shortcuts', 'widgets'], label);
    const name = string(entry.name, 60, label + ' name');
    const match = normalizeMatch(entry.match, label + ' match');
    const icon = entry.icon === undefined ? 'app-window' : string(entry.icon, 60, label + ' icon');
    if (!/^[a-z0-9-]+$/.test(icon)) throw new Error(label + ' icon needs a Lucide icon name');
    const commands = [];
    const fallback = fallbackCommand(entry, match, label);
    if (fallback) commands.push(fallback);
    const shortcuts = entry.shortcuts ?? [];
    if (!Array.isArray(shortcuts) || shortcuts.length > 12) throw new Error(label + ' needs up to 12 shortcuts');
    const commandIds = new Set(['open']);
    for (const [i, shortcut] of shortcuts.entries()) {
      const shortcutLabel = label + ', shortcut ' + (i + 1);
      object(shortcut, ['id', 'label', 'keys'], shortcutLabel);
      const keys = string(shortcut.keys, 120, shortcutLabel + ' keys');
      try {
        parseCombo(keys);
      } catch (err) {
        throw new Error(shortcutLabel + ' has an invalid key combination. ' + err.message);
      }
      commands.push({
        id: id(shortcut.id, commandIds, shortcutLabel),
        label: string(shortcut.label, 40, shortcutLabel + ' name'),
        action: { type: 'hotkey', keys },
      });
    }
    return {
      id: id(entry.id, used, label), name, icon, match, commands, capabilities: [],
      category: entry.category === undefined ? 'Custom' : string(entry.category, 32, label + ' category'),
      summary: entry.summary === undefined ? '' : string(entry.summary, 160, label + ' summary'),
      widgets: normalizeWidgetInstances(entry.widgets, { grid: VIEW_GRID, label: label + ' widgets' }),
      custom: true,
    };
  });
}

function loadCustomViews(file, reserved) {
  try {
    if (fs.statSync(file).size > MAX_CONFIG_BYTES) throw new Error('Custom app views file exceeds 256 KB');
    return normalizeCustomViews(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')), reserved);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

module.exports = { loadCustomViews, matchesCustomApp, normalizeCustomViews };
