// @ts-check
'use strict';

const catalog = require('../../profiles/shortcut-catalog.json');
const { codexApplications } = require('./shortcut-catalog-codex');
const { intellijApplications } = require('./shortcut-catalog-intellij');
const { windowsWorkflowApplications } = require('./shortcut-catalog-windows-workflows');

const ICONS = {
  'new-tab': 'square-plus', 'close-tab': 'x', 'reopen-closed-tab': 'rotate-ccw',
  'next-tab': 'chevron-right', 'previous-tab': 'chevron-left', 'switch-to-last-tab': 'skip-forward',
  'new-window': 'panels-top-left', 'new-incognito-window': 'venetian-mask', 'close-window': 'panel-top-close',
  'go-back': 'arrow-left', 'go-forward': 'arrow-right', 'reload-page': 'refresh-cw', 'focus-address-bar': 'link',
  'quick-open-file': 'file-search', find: 'search', bold: 'bold', italic: 'italic', underline: 'underline',
  'open-document': 'folder-open', save: 'save', print: 'printer', undo: 'undo-2', redo: 'redo-2',
  'go-to-beginning': 'arrow-up-left', 'go-to-last-used-cell': 'arrow-down-right',
  'next-sheet': 'chevron-right', 'previous-sheet': 'chevron-left', 'select-entire-row': 'rows-3',
  'select-entire-column': 'columns-3', 'select-all': 'square-dashed', 'format-cells-dialog': 'table-2',
  copy: 'copy', cut: 'scissors', paste: 'clipboard-paste', 'paste-without-formatting': 'clipboard-type',
};
/**
 * A reviewed catalog app or reference application. Bindings are reviewed JSON rows.
 * @typedef {{ id: string, name: string, platforms: string[], bindings: any[], availability?: string,
 *   referenceOnly?: boolean, catalogVersion?: any }} CatalogSource
 */
/** @type {Map<string, CatalogSource>} */
const SOURCES = new Map(catalog.apps.map((entry) => [entry.id, entry]));
const STARTER_ACTIONS = {
  'restore-tab': 'reopen-closed-tab', address: 'focus-address-bar', reload: 'reload-page',
  'quick-open': 'quick-open-file', 'format-cells': 'format-cells-dialog',
};

function catalogActionId(key) { return STARTER_ACTIONS[key] ?? key; }

function importedKey(binding, label, unavailable) {
  const suffix = binding.bindingId.slice(0, 8);
  const aliases = [binding.command, ...(binding.aliases ?? [])].filter(Boolean);
  const action = binding.chord ? { type: 'hotkey', keys: binding.chord }
    : binding.orderedChords ? { type: 'sequence', steps: binding.orderedChords.map((keys) => ({ type: 'hotkey', keys })) } : undefined;
  return {
    id: 'catalog-' + binding.id.slice(0, 22) + '-' + suffix,
    label: label.slice(0, 40), icon: ICONS[binding.id] ?? 'keyboard', category: 'app',
    action,
    notation: binding.notation, source: binding.source, group: binding.category, binding,
    contexts: binding.context ? [binding.context] : [],
    ...(aliases.length ? { aliases } : {}),
    ...(['close-window', 'close-tab', 'end-call'].includes(binding.id) ? { confirm: true } : {}),
    ...(unavailable ? { unavailable } : {}),
  };
}

function mergeVerifiedKeys(id, starter, shortcutLanguage, platform) {
  const entry = SOURCES.get(id);
  if (!entry?.bindings.length) return starter;
  const targetPlatform = platform ?? (entry.platforms.includes('windows') ? 'windows' : 'web');
  const keys = [...starter];
  const shown = new Map();
  for (const key of starter) {
    if (key.action?.keys) shown.set(catalogActionId(key.id) + ':' + key.action.keys.toLowerCase(), key);
  }
  for (const binding of entry.bindings) {
    const identity = binding.id + ':' + (binding.chord?.toLowerCase() ?? binding.notation);
    const needsPlatform = binding.platform !== targetPlatform || binding.hostPlatform !== 'windows';
    const needsLocale = binding.language && binding.language !== shortcutLanguage;
    const unsuitable = binding.unavailable ?? (needsPlatform ? 'Requires a verified match for this platform.'
      : needsLocale ? `Requires the ${binding.language} shortcut language.` : undefined);
    if (shown.has(identity) && !unsuitable) {
      const existing = shown.get(identity);
      existing.binding ??= binding;
      if (binding.context && !existing.contexts?.includes(binding.context)) {
        existing.contexts = [...existing.contexts ?? [], binding.context];
      }
      continue;
    }
    const sharedChord = binding.chord && keys.some((key) => key.action?.keys?.toLowerCase() === binding.chord.toLowerCase());
    const unavailable = unsuitable ?? (sharedChord ? 'Requires a distinct app context for this shortcut.' : undefined);
    const alternative = keys.some((key) => key.label.toLowerCase() === binding.label.toLowerCase());
    const item = importedKey(binding, alternative ? binding.label + ' (alternate)' : binding.label, unavailable);
    if (!unavailable) shown.set(identity, item);
    keys.push(item);
  }
  return keys;
}

function catalogEntries(covered) {
  const references = [...codexApplications, ...intellijApplications, ...windowsWorkflowApplications];
  return [...catalog.apps, ...references].filter(({ id }) => !covered.has(id)).map((/** @type {CatalogSource} */ entry) => {
    const web = entry.platforms.includes('web');
    const supported = web || entry.platforms.includes('windows');
    return {
      id: entry.id, name: entry.name, apps: [], appIds: [],
      availability: entry.availability ?? (web ? 'Requires a verified site or installed web app match.'
        : supported ? 'Desktop shortcuts are awaiting review.' : 'This app has no supported Windows target.'),
      ...(entry.referenceOnly ? { referenceOnly: true } : {}),
      keys: entry.bindings.map((binding) => importedKey(binding, binding.label,
        binding.unavailable ?? (binding.platform === 'web' ? 'Requires a verified site match.' : 'Requires a verified desktop match.'))),
      catalogVersion: entry.catalogVersion ?? catalog.version,
    };
  });
}

module.exports = { catalog, catalogActionId, mergeVerifiedKeys, catalogEntries };
