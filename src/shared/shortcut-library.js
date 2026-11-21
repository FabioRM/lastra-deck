'use strict';

{
  const ACTION_ALIASES = {
    'reopen-closed-tab': ['restore tab', 'reopen tab', 'reopen last tab'],
    'restore-tab': ['restore tab', 'reopen tab', 'reopen closed tab'],
    'focus-address-bar': ['URL bar', 'omnibox', 'address'],
    address: ['URL bar', 'omnibox', 'focus address bar'],
    'quick-open-file': ['go to file', 'open by name', 'quick open'],
    'quick-open': ['go to file', 'open by name', 'quick open file'],
    'reload-page': ['refresh', 'reload'],
    reload: ['refresh', 'reload page'],
    'find': ['search text', 'find in document'],
    'copy': ['copy selection', 'clipboard', 'copia'],
    'cut': ['clipboard', 'taglia'],
    'paste': ['clipboard', 'incolla'],
    'undo': ['history', 'annulla'],
    'redo': ['history', 'ripeti'],
    'mic': ['microphone', 'mute', 'unmute'],
    'toggle-mute': ['microphone', 'mute', 'unmute'],
  };
  const SPECIAL_CAPTURE_KEYS = {
    ' ': 'Space', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up',
    ContextMenu: 'Apps', Escape: 'Esc',
  };
  const NAMED_CAPTURE_KEYS = /^(?:Backspace|Tab|Enter|Pause|CapsLock|PageUp|PageDown|End|Home|PrintScreen|Insert|Delete|F(?:[1-9]|1\d|2[0-4]))$/;

  function fold(value) {
    return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  }

  function chordSearchText(value) {
    return fold(value).replace(/\bcontrol\b/g, 'ctrl').replace(/\barrow(?!\s)/g, '')
      .replace(/\bpage\s+(up|down)\b/g, 'page$1').replace(/\s*\+\s*/g, '+');
  }

  function variantContexts(key) {
    const contexts = [...new Set([key.binding?.context, ...(key.contexts ?? []), key.binding?.mode,
      key.action?.shortcutGuard?.mode].filter(Boolean).map((context) => context.split(':').at(-1).replaceAll('-', ' ')))];
    return contexts.length ? contexts : ['General'];
  }

  function shortcutRows(packs) {
    return packs.flatMap((pack) => pack.keys.map((key, index) => ({
      pack, key, index,
      platform: key.binding?.platform ?? key.action?.shortcutGuard?.platform
        ?? (pack.installedWebApp ? 'web' : pack.availability ? 'reference' : 'windows'),
      contexts: variantContexts(key),
    })));
  }

  function withShortcutOverride(key, overrides) {
    const keys = key.overrideId && overrides?.[key.overrideId];
    if (!keys || key.action?.type !== 'hotkey' || !key.action.shortcutGuard) return key;
    const tokens = keys.toLowerCase().split('+').map((token) => token.trim());
    const destructive = tokens.some((token) => ['shift', 'vk:10', 'vk:a0', 'vk:a1', 'scan:2a', 'scan:36'].includes(token))
      && tokens.some((token) => ['delete', 'del', 'vk:2e', 'scan:e053'].includes(token));
    const confirm = key.confirm || key.action.shortcutGuard.confirm || destructive;
    return {
      ...key, notation: keys, shortcutOverride: true, reviewedNotation: key.notation ?? key.action.keys,
      action: {
        ...key.action, keys, notation: keys,
        shortcutGuard: { ...key.action.shortcutGuard, ...(confirm ? { confirm: true } : {}) },
      },
      ...(confirm ? { confirm: true } : {}),
    };
  }

  function filterShortcutRows(rows, { app, platform, context, query, overrides } = {}) {
    const terms = chordSearchText(query).split(/\s+/).filter(Boolean);
    return rows.flatMap((row) => {
      const { key, pack } = row;
      if ((app && app !== pack.id) || (platform && platform !== row.platform) || (context && !row.contexts.includes(context))) return [];
      const actionId = key.binding?.id ?? key.id;
      const match = withShortcutOverride(key, overrides);
      const searchable = chordSearchText([pack.name, pack.id, key.label, key.id.replaceAll('-', ' '),
        actionId.replaceAll('-', ' '), ...(ACTION_ALIASES[actionId] ?? []), ...(key.aliases ?? []),
        match.notation, match.action?.keys, key.notation, key.action?.keys, ...row.contexts].join(' '));
      if (!terms.every((term) => searchable.includes(term))) return [];
      return [{ ...row, key: match }];
    });
  }

  function captureShortcut(event) {
    const { key, code } = event;
    if (!key || event.repeat || event.isComposing || event.getModifierState?.('AltGraph')) return null;
    let token = SPECIAL_CAPTURE_KEYS[key];
    if (/^Numpad[0-9]$/.test(code)) token = 'Num' + code.at(-1);
    else if (/^Numpad(?:Add|Subtract|Multiply|Divide|Decimal)$/.test(code)) token = code.slice('Numpad'.length);
    if (!token) {
      if (NAMED_CAPTURE_KEYS.test(key)) token = key;
      else if (/^[a-z\d]$/i.test(key)) token = key.toUpperCase();
      else if (key === '+') token = 'char:plus';
      else if (/^\P{C}$/u.test(key) && key.length === 1) token = 'char:' + key;
    }
    if (!token) return null;
    return [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Win', token]
      .filter(Boolean).join('+');
  }

  function shortcutGuardForAction(action) {
    if (action?.shortcutGuard) return action.shortcutGuard;
    if (action?.type !== 'sequence' || !Array.isArray(action.steps) || action.steps.length < 2) return undefined;
    const guard = action.steps[0]?.shortcutGuard;
    if (!guard) return undefined;
    const fields = Object.keys(guard);
    if (action.steps.every((step) => step?.type === 'hotkey' && step.shortcutGuard
      && Object.keys(step.shortcutGuard).length === fields.length && fields.every((field) => step.shortcutGuard[field] === guard[field]))) return guard;
  }

  const api = { shortcutRows, filterShortcutRows, withShortcutOverride, captureShortcut, shortcutGuardForAction, MAX_WEB_APP_MANIFESTS: 96 };
  if (typeof module === 'object') module.exports = api;
  else window.LastraShortcutLibrary = api;
}
