// @ts-check
'use strict';

const { catalog, catalogActionId, mergeVerifiedKeys, catalogEntries } = require('./shortcut-catalog');
const desktopPacks = require('./shortcut-packs-desktop');
const { webPacks, installedWebPack, isInstalledWebApp } = require('./shortcut-packs-web');
const { PHOTOSHOP_EXECUTABLES } = require('./shortcut-surface');
const { US_LAYOUT, shortcutRequirements, needsShortcutConfirmation } = require('./shortcut-guards');
const { annotateShortcut } = require('./shortcut-overrides');
const { withShortcutOverride, shortcutGuardForAction } = require('../shared/shortcut-library');

const MANIFEST_REVISION = '6b3db15615e3e549b89790e0bd83c82d262c22e0';
const MANIFEST_PACKS = new Set(['chrome', 'edge', 'firefox', 'brave', 'explorer', 'vscode', 'terminal',
  'outlook-classic', 'outlook-new', 'excel', 'word', 'powerpoint', 'teams', 'discord']);
const terminal = 'microsoft.windowsterminal_8wekyb3d8bbwe!app';
const newOutlook = 'microsoft.outlookforwindows_8wekyb3d8bbwe!microsoft.outlookforwindows';
const outlookSource = 'https://support.microsoft.com/en-us/accessibility/outlook/keyboard-shortcuts-for-outlook';
const slideshowSource = 'https://support.microsoft.com/en-us/accessibility/powerpoint/use-keyboard-shortcuts-to-deliver-powerpoint-presentations';
const photoshop = { mode: 'the Photoshop workspace', requiresPhotoshopWorkspace: true };
const browserKeys = (previous, next) => [
  ['new-tab', 'New tab', 'square-plus', 'Ctrl+T'],
  ['restore-tab', 'Restore closed', 'rotate-ccw', 'Ctrl+Shift+T'],
  ['previous-tab', 'Previous tab', 'chevron-left', previous],
  ['next-tab', 'Next tab', 'chevron-right', next],
  ['address', 'Address', 'link', 'Ctrl+L'],
  ['find', 'Find', 'search', 'Ctrl+F'],
  ['reload', 'Reload', 'refresh-cw', 'Ctrl+R'],
  ['downloads', 'Downloads', 'download', 'Ctrl+J'],
  ['close-tab', 'Close tab', 'x', 'Ctrl+W', { confirm: true }],
];

const packs = [
  { id: 'photoshop', name: 'Adobe Photoshop', executables: PHOTOSHOP_EXECUTABLES, previewMode: photoshop.mode,
    source: 'https://helpx.adobe.com/content/dam/help/en/photoshop/using/default-keyboard-shortcuts/photoshop-keyboard-shortcuts.pdf', keys: [
    ['layer-copy', 'Layer via copy', 'layers-2', 'Ctrl+J', photoshop],
    ['transform', 'Free transform', 'scaling', 'Ctrl+T', photoshop],
    ['select-all', 'Select all', 'square-dashed', 'Ctrl+A', photoshop],
    ['deselect', 'Deselect', 'square-x', 'Ctrl+D', photoshop],
    ['invert-selection', 'Invert selection', 'contrast', 'Ctrl+Shift+I', photoshop],
    ['new-layer', 'New layer', 'layers', 'Ctrl+Shift+N', photoshop],
    ['brush-settings', 'Brushes panel', 'paintbrush', 'F5', photoshop],
    ['fit-on-screen', 'Fit on screen', 'maximize', 'Ctrl+0', photoshop],
    ['actual-pixels', 'View at 100%', 'scan-eye', 'Ctrl+1', photoshop],
    ['save-for-web', 'Save for web', 'image-down', 'Ctrl+Alt+Shift+S', photoshop],
    ['shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+Alt+Shift+K', photoshop],
    ['layer-cut', 'Cut to new layer', 'scissors', 'Ctrl+Shift+J', photoshop],
    ['group-layers', 'Group layers', 'group', 'Ctrl+G', photoshop],
    ['ungroup-layers', 'Ungroup layers', 'ungroup', 'Ctrl+Shift+G', photoshop],
    ['curves', 'Open Curves', 'chart-spline', 'Ctrl+M', photoshop],
    ['layers-panel', 'Layers panel', 'layers', 'F7', photoshop],
    ['color-panel', 'Color panel', 'palette', 'F6', photoshop],
    ['info-panel', 'Info panel', 'info', 'F8', photoshop],
    ['actions-panel', 'Actions panel', 'list-video', 'F9', photoshop],
  ] },
  { id: 'chrome', name: 'Google Chrome', executables: ['chrome.exe'],
    source: 'https://support.google.com/chrome/answer/157179?hl=en', keys: browserKeys('Ctrl+PageUp', 'Ctrl+PageDown') },
  { id: 'edge', name: 'Microsoft Edge', executables: ['msedge.exe'],
    source: 'https://support.microsoft.com/en-us/edge/keyboard-shortcuts-in-microsoft-edge', keys: browserKeys('Ctrl+Shift+Tab', 'Ctrl+Tab') },
  { id: 'firefox', name: 'Mozilla Firefox', executables: ['firefox.exe'],
    source: 'https://support.mozilla.org/en-US/kb/keyboard-shortcuts-perform-firefox-tasks-quickly', keys: browserKeys('Ctrl+PageUp', 'Ctrl+PageDown') },
  { id: 'brave', name: 'Brave', executables: ['brave.exe'],
    source: 'https://support.brave.app/hc/en-us/articles/360032272171-What-keyboard-shortcuts-can-I-use-in-Brave', keys: browserKeys('Ctrl+PageUp', 'Ctrl+PageDown') },
  { id: 'explorer', name: 'File Explorer', executables: ['explorer.exe'],
    source: 'https://support.microsoft.com/en-us/accessibility/windows/keyboard-shortcuts-in-windows', keys: [
    ['new-tab', 'New tab', 'square-plus', 'Ctrl+T', { minWindowsBuild: 22621 }],
    ['parent-folder', 'Parent folder', 'folder-up', 'Alt+Up'],
    ['new-folder', 'New folder', 'folder-plus', 'Ctrl+Shift+N'],
    ['rename', 'Rename', 'pencil', 'F2'],
    ['address', 'Address', 'link', 'Alt+D'],
    ['search', 'Search folder', 'search', 'Ctrl+E'],
    ['refresh', 'Refresh', 'refresh-cw', 'F5'],
  ] },
  { id: 'vscode', name: 'Visual Studio Code', executables: ['code.exe', 'code - insiders.exe'],
    source: 'https://code.visualstudio.com/shortcuts/keyboard-shortcuts-windows.pdf',
    appIds: ['microsoft.visualstudiocode'], keys: [
      ['palette', 'Command palette', 'command', 'Ctrl+Shift+P'],
      ['quick-open', 'Quick open', 'file-search', 'Ctrl+P'],
      ['find-files', 'Find in files', 'search', 'Ctrl+Shift+F'],
      ['explorer', 'Explorer', 'files', 'Ctrl+Shift+E'],
      ['source-control', 'Source control', 'git-branch', 'Ctrl+Shift+G'],
      ['terminal', 'Terminal', 'square-terminal', 'Ctrl+`', { usLayout: true, notation: 'Ctrl+`' }],
      ['save', 'Save', 'save', 'Ctrl+S'],
      ['debug', 'Debug view', 'bug', 'Ctrl+Shift+D'],
    ] },
  { id: 'terminal', name: 'Windows Terminal', executables: ['windowsterminal.exe', 'windowsterminalpreview.exe'],
    source: 'https://learn.microsoft.com/en-us/windows/terminal/customize-settings/actions',
    appIds: [terminal, 'microsoft.windowsterminalpreview_8wekyb3d8bbwe!app'], keys: [
      ['new-tab', 'New tab', 'square-plus', 'Ctrl+Shift+T'],
      ['find', 'Find', 'search', 'Ctrl+Shift+F'],
      ['palette', 'Command palette', 'command', 'Ctrl+Shift+P'],
      ['copy-selection', 'Copy selection', 'copy', 'Ctrl+Shift+C'],
      ['paste', 'Paste', 'clipboard-paste', 'Ctrl+Shift+V'],
      ['tab-profiles', 'Tab profiles', 'list-plus', 'Ctrl+Shift+Space',
        { source: 'https://github.com/microsoft/terminal/blob/main/src/cascadia/TerminalSettingsModel/defaults.json' }],
    ] },
  { id: 'outlook-classic', name: 'Outlook (classic)', executables: ['outlook.exe'],
    source: outlookSource, appIds: ['microsoft.office.outlook.exe.15'], keys: [
      ['new-message', 'New message', 'mail-plus', 'Ctrl+Shift+M'],
      ['reply', 'Reply', 'reply', 'Ctrl+R'],
      ['reply-all', 'Reply all', 'reply-all', 'Ctrl+Shift+R'],
      ['forward', 'Forward', 'forward', 'Ctrl+F'],
    ] },
  { id: 'outlook-new', name: 'Outlook', executables: ['olk.exe'], source: outlookSource, appIds: [newOutlook], keys: [
    ['new-message', 'New message', 'mail-plus', 'Ctrl+N', { mode: 'Mail' }],
    ['reply', 'Reply', 'reply', 'Ctrl+R'],
    ['reply-all', 'Reply all', 'reply-all', 'Ctrl+Shift+R'],
    ['forward', 'Forward', 'forward', 'Ctrl+F'],
  ] },
  { id: 'excel', name: 'Microsoft Excel', executables: ['excel.exe'],
    source: 'https://support.microsoft.com/en-us/accessibility/excel/keyboard-shortcuts-in-excel', keys: [
    ['filter', 'Filter', 'list-filter', 'Ctrl+Shift+L'],
    ['format-cells', 'Format cells', 'table-2', 'Ctrl+1'],
    ['paste-special', 'Paste special', 'clipboard-paste', 'Ctrl+Alt+V'],
    ['edit-cell', 'Edit cell', 'pencil', 'F2'],
    ['autosum', 'AutoSum', 'sigma', 'Alt+=', { usLayout: true, notation: 'Alt+=' }],
    ['next-sheet', 'Next sheet', 'chevron-right', 'Ctrl+PageDown'],
    ['previous-sheet', 'Previous sheet', 'chevron-left', 'Ctrl+PageUp'],
  ] },
  { id: 'word', name: 'Microsoft Word', executables: ['winword.exe'],
    source: 'https://support.microsoft.com/en-us/accessibility/word/keyboard-shortcuts-in-word',
    localizedSources: { 'it-IT': 'https://support.microsoft.com/it-it/accessibility/word/keyboard-shortcuts-in-word' }, keys: [
    ['save', 'Save', 'save', { 'en-US': 'Ctrl+S', 'it-IT': 'Ctrl+B' }],
    ['find', 'Find', 'search', { 'en-US': 'Ctrl+F', 'it-IT': 'Ctrl+Shift+T' }],
    ['bold', 'Bold', 'bold', { 'en-US': 'Ctrl+B', 'it-IT': 'Ctrl+G' }],
    ['insert-link', 'Insert link', 'link', { 'en-US': 'Ctrl+K', 'it-IT': 'Ctrl+Alt+K' }],
    ['track-changes', 'Track changes', 'file-pen-line', { 'en-US': 'Ctrl+Shift+E' }],
    ['spelling', 'Spelling and grammar', 'spell-check', 'F7'],
  ] },
  { id: 'powerpoint', name: 'Microsoft PowerPoint', executables: ['powerpnt.exe'],
    source: 'https://support.microsoft.com/en-us/accessibility/powerpoint/use-keyboard-shortcuts-to-create-powerpoint-presentations', keys: [
    ['new-slide', 'New slide', 'square-plus', 'Ctrl+M'],
    ['start-show', 'Start show', 'play', 'F5', { source: slideshowSource }],
    ['present-here', 'Present from here', 'presentation', 'Shift+F5', { source: slideshowSource }],
    ['save', 'Save', 'save', { 'en-US': 'Ctrl+S' }],
  ] },
  { id: 'teams', name: 'Microsoft Teams', executables: ['ms-teams.exe'], appIds: ['msteams_8wekyb3d8bbwe!msteams'],
    source: 'https://support.microsoft.com/en-us/accessibility/teams/keyboard-shortcuts-for-microsoft-teams', keys: [
    ['mic', 'Toggle mic', 'mic', 'Ctrl+Shift+M', { mode: 'a Teams meeting' }],
    ['camera', 'Toggle camera', 'video', 'Ctrl+Shift+O', { mode: 'a Teams meeting' }],
    ['hand', 'Raise or lower hand', 'hand', 'Ctrl+Shift+K', { mode: 'a Teams meeting' }],
    ['share', 'Share tray', 'screen-share', 'Ctrl+Shift+E', { mode: 'a Teams meeting' }],
    ['search', 'Search', 'search', 'Ctrl+E'],
    ['new-chat', 'New chat', 'message-square-plus', 'Ctrl+N'],
  ] },
  { id: 'discord', name: 'Discord', executables: ['discord.exe'],
    source: 'https://support.discord.com/hc/en-us/articles/31232432266647-Discord-Commands-Shortcuts-and-Navigation-Guide', keys: [
    ['switcher', 'Quick switcher', 'search', 'Ctrl+K', { source: 'https://support.discord.com/hc/en-us/articles/115000070311-Quick-Switcher' }],
    ['mic', 'Toggle mic', 'mic', 'Ctrl+Shift+M'],
    ['deafen', 'Toggle deafen', 'headphones', 'Ctrl+Shift+D'],
    ['search', 'Search channel', 'message-square', 'Ctrl+F'],
    ['emoji', 'Emoji picker', 'smile', 'Ctrl+E'],
  ] },
  { id: 'spotify', name: 'Spotify', executables: ['spotify.exe'], appIds: ['spotifyab.spotifymusic_zpdnekdrzrea0!spotify'],
    source: 'https://support.spotify.com/us/article/keyboard-shortcuts/', keys: [
    ['search', 'Search', 'search', 'Ctrl+L'],
    ['queue', 'Queue', 'list-music', 'Alt+Shift+Q'],
    ['library', 'Library', 'library', 'Alt+Shift+0'],
    ['play-pause', 'Play or pause', 'circle-play', null, { spotify: true,
      source: 'https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssession' }],
    ['shuffle', 'Shuffle', 'shuffle', 'Ctrl+S'],
    ['repeat', 'Repeat', 'repeat', 'Ctrl+R'],
  ] },
  ...desktopPacks,
];

const byExecutable = new Map(packs.filter(({ windowMode }) => !windowMode).flatMap((pack) => pack.executables.map((exe) => [exe, pack])));
const byAppId = new Map(packs.flatMap((pack) => (pack.appIds ?? []).map((id) => [id, pack])));
const windowPacks = packs.filter(({ windowMode }) => windowMode);

function packFor(context, webApps) {
  if (!context || context.shell) return null;
  context = { executable: context.executable?.toLowerCase(), appId: context.appId?.toLowerCase(), path: context.path?.toLowerCase(), mode: context.mode };
  if (isInstalledWebApp(context)) return installedWebPack(context, webApps);
  const windowPack = windowPacks.find(({ executables, windowMode }) => windowMode === context.mode && executables.includes(context.executable));
  if (windowPack) return windowPack;
  const pack = byAppId.get(context.appId) ?? byExecutable.get(context.executable);
  if (!pack || (pack.pathContains && !context.path?.includes(pack.pathContains))) return null;
  return pack;
}

function packIdentity(pack) {
  return { pack: pack.id, application: pack.name, platform: pack.sites ? 'web' : 'windows' };
}

/**
 * @param {any} pack
 * @param {{ build?: number, keyboardLayout?: number, mode?: string, shortcutLanguage?: string }} [system]
 */
function starterPackKeys(pack, { build, keyboardLayout, mode, shortcutLanguage } = {}) {
  return pack.keys.map(([id, label, icon, chord, requirements]) => {
    const language = chord && typeof chord === 'object'
      ? (Object.hasOwn(chord, shortcutLanguage) ? shortcutLanguage : Object.keys(chord)[0]) : undefined;
    const keys = language ? chord[language] : chord;
    const confirm = requirements?.confirm || needsShortcutConfirmation(id, keys);
    const shortcutGuard = { ...packIdentity(pack),
      ...(language ? { language } : {}),
      ...(requirements?.minWindowsBuild ? { minBuild: requirements.minWindowsBuild } : {}),
      ...(requirements?.usLayout ? { layout: US_LAYOUT } : {}),
      ...((requirements?.mode || pack.windowMode) ? { mode: requirements?.mode ?? pack.windowMode } : {}),
      ...(confirm ? { confirm: true } : {}),
    };
    const unavailable = shortcutRequirements(shortcutGuard, { build, keyboardLayout, mode, shortcutLanguage });
    const source = requirements?.source ?? pack.localizedSources?.[language];
    return {
      id, label, icon, category: requirements?.spotify ? 'media' : 'app',
      ...(source ? { source } : {}),
      ...(requirements?.notation ? { notation: requirements.notation } : {}),
      action: requirements?.spotify ? { type: 'spotify-playback', shortcutGuard } : {
        type: 'hotkey', keys, shortcutGuard,
        ...(requirements?.notation ? { notation: requirements.notation } : {}),
        ...(requirements?.requiresPhotoshopWorkspace ? { requiresPhotoshopWorkspace: true } : {}),
      },
      ...(confirm ? { confirm: true } : {}),
      ...(unavailable ? { unavailable } : {}),
    };
  });
}

function catalogOwner(pack) {
  const { id } = pack;
  return id === 'terminal' ? 'windows-terminal' : id.startsWith('outlook-') ? 'outlook' : id;
}

function packKeys(pack, context = {}) {
  const starter = starterPackKeys(pack, context);
  if (!context.shortcutOverrides || !Object.keys(context.shortcutOverrides).length) return starter;
  const reviewed = reviewedPackKeys(pack, catalogOwner(pack), starter.map((key) => ({ ...key })), context.shortcutLanguage);
  const annotated = reviewed.map((key) => annotateShortcut(pack, key));
  const byKey = new Map(annotated.map((key) => [key.id, key]));
  return starter.map((key) => {
    const candidate = byKey.get(key.id) ?? key;
    const overridden = withShortcutOverride(candidate, context.shortcutOverrides);
    if (candidate !== overridden) return { ...overridden, unavailable: shortcutRequirements(overridden.action.shortcutGuard, context) };
    // A new catalog revision can change the reviewed chord while the starter key retains its older default.
    const actionId = catalogActionId(key.id);
    const compatible = annotated.filter((item) => item.binding?.id === actionId && item.overrideId
      && context.shortcutOverrides[item.overrideId] && !shortcutRequirements(item.action.shortcutGuard, context));
    const scopes = new Set(compatible.map(({ overrideId }) => overrideId));
    if (scopes.size !== 1) return key;
    const current = withShortcutOverride(compatible[0], context.shortcutOverrides);
    return { ...key, action: current.action, notation: current.notation, confirm: current.confirm, unavailable: undefined };
  });
}

function reviewedPackKeys(pack, owner, starter, shortcutLanguage) {
  const identity = packIdentity(pack);
  return mergeVerifiedKeys(owner, starter, shortcutLanguage, identity.platform).map((key) => {
    const binding = key.binding;
    const existing = key.action?.shortcutGuard;
    if (!key.action || !binding || binding.verification.status !== 'documented'
        || binding.platform !== identity.platform || binding.hostPlatform !== 'windows') return key;
    if (binding.appVersion) return { ...key, unavailable: 'Requires a verified app version.' };
    const { language } = binding;
    if (language && !['en-US', 'it-IT'].includes(language)) return { ...key, unavailable: 'Requires an unsupported shortcut language.' };
    const modeLabels = { worksheet: 'an Excel worksheet', 'document-editor': `the ${pack.name} document editor`,
      editor: 'the VS Code editor', call: 'a Teams meeting' };
    const waitingForCall = pack.id === 'teams' && binding.mode === 'call' && binding.edition === 'work-or-school desktop';
    const onlyLanguage = !binding.unavailable && key.unavailable === `Requires the ${language} shortcut language.`;
    if (key.unavailable && !onlyLanguage && !waitingForCall && !existing) return key;
    const mode = binding.mode && (modeLabels[binding.mode] ?? binding.mode);
    const sequence = key.action.type === 'sequence';
    const steps = sequence ? key.action.steps : [key.action];
    const confirm = key.confirm || steps.some(({ keys }) => needsShortcutConfirmation(binding.id, keys));
    if (binding.layout && binding.layout !== 'US') return { ...key, unavailable: 'Requires keyboard layout verification.' };
    const punctuation = /(?:^|\+)(?:slash|backquote|equals|semicolon|bracketleft|bracketright|backslash|quote|comma|period|minus|plus)(?:$|\+)/i;
    const layout = binding.layout === 'US' || steps.some(({ keys }) => punctuation.test(keys)) ? US_LAYOUT : undefined;
    const shortcutGuard = { ...(existing ?? identity),
      ...(mode ? { mode } : {}), ...(language ? { language } : {}), ...(layout ? { layout } : {}),
      ...(binding.windowsBuild ? { minBuild: binding.windowsBuild } : {}),
      ...(confirm ? { confirm: true } : {}),
    };
    const unavailable = shortcutRequirements(shortcutGuard, { shortcutLanguage });
    const guarded = (step, notation) => ({ ...step, shortcutGuard, ...(notation ? { notation } : {}) });
    const action = sequence ? { ...key.action, steps: steps.map((step) => guarded(step, step.keys)) } : guarded(key.action, binding.notation);
    return { ...key, action, ...(sequence ? { shortcut: binding.notation } : {}),
      ...(confirm ? { confirm: true } : {}),
      ...(unavailable ? { unavailable } : {}) };
  });
}

function previewPacks(shortcutLanguage) {
  const covered = new Set();
  const builtIn = packs.map((pack) => {
    const { id, name } = pack;
    const owner = catalogOwner(pack);
    covered.add(owner);
    const starter = starterPackKeys(pack, { shortcutLanguage, mode: pack.previewMode });
    return { id, name, apps: pack.pathContains || pack.windowMode ? [] : pack.executables, appIds: pack.appIds ?? [],
      keys: reviewedPackKeys(pack, owner, starter, shortcutLanguage).map((key) => annotateShortcut(pack, key)), catalogVersion: catalog.version,
      source: pack.source, ...(MANIFEST_PACKS.has(id) ? { revision: MANIFEST_REVISION } : id === 'spotify' ? { revision: null } : {}) };
  });
  const web = webPacks.map((pack) => {
    covered.add(pack.id);
    const keys = reviewedPackKeys(pack, pack.id, starterPackKeys(pack, { shortcutLanguage }), shortcutLanguage);
    return { id: pack.id, name: pack.name, apps: [], appIds: [], installedWebApp: true, manifestExample: pack.manifestExample ?? pack.manifests[0],
      source: pack.source, catalogVersion: catalog.version, keys: keys.map((key) => ({
        ...annotateShortcut(pack, key), unavailable: key.unavailable ?? 'Available in the matching installed web app.',
      })) };
  });
  return [...builtIn, ...web, ...catalogEntries(covered)];
}

function groupedPackKeys(pack, context) {
  const quick = packKeys(pack, context);
  const extras = reviewedPackKeys(pack, catalogOwner(pack), starterPackKeys(pack, context), context.shortcutLanguage)
    .slice(quick.length)
    .filter((key) => shortcutGuardForAction(key.action))
    .map((key) => {
      const candidate = withShortcutOverride(annotateShortcut(pack, key), context.shortcutOverrides);
      return { ...candidate, unavailable: shortcutRequirements(shortcutGuardForAction(candidate.action), context) };
    });
  return [...quick, ...extras];
}

module.exports = { packs, packFor, packKeys, groupedPackKeys, isInstalledWebApp, previewPacks };
