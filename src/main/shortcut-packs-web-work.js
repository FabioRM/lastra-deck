// @ts-check
'use strict';

const { webPack: pack, usKey } = require('./shortcut-pack-data');

const figjam = { context: 'While a FigJam board has focus', source: 'https://help.figma.com/hc/en-us/articles/1500004292221-Select-move-and-order-objects-in-FigJam' };
const vimeo = { context: 'While the Vimeo player has focus' };

module.exports = [
  pack('google-chat', 'Google Chat', ['https://chat.google.com/'], 'https://support.google.com/chat/answer/7649271', [
    ['new-chat', 'New chat', 'message-square-plus', 'Ctrl+Shift+K'],
    ['browse-spaces', 'Browse Spaces', 'panels-top-left', 'Ctrl+O'],
    ['open-reply', 'Focus reply box', 'reply', 'Ctrl+S'],
    ['last-message', 'Jump to last message', 'arrow-down', 'Ctrl+J'],
    usKey('search', 'Search Chat', 'search', '/'),
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?'),
  ]),
  pack('google-keep', 'Google Keep', ['https://keep.google.com/'], 'https://support.google.com/keep/answer/12862970', [
    ['new-note', 'New note', 'file-plus', 'C'],
    ['new-list', 'New list', 'list-plus', 'L'],
    ['next-note', 'Next note', 'chevron-down', 'J'],
    ['previous-note', 'Previous note', 'chevron-up', 'K'],
    usKey('search', 'Search notes', 'search', '/'),
  ]),
  pack('fastmail', 'Fastmail', ['https://app.fastmail.com/'], 'https://www.fastmail.help/hc/en-us/articles/360058753534-Keyboard-shortcuts', [
    ['compose', 'Compose message', 'mail-plus', 'C'],
    ['compose-window', 'Compose in new window', 'panels-top-left', 'Alt+Shift+C'],
    ['sidebar', 'Toggle sidebar', 'panel-left', 'Ctrl+Shift+I'],
    ['save-draft', 'Save draft', 'save', 'Ctrl+S', { context: 'While composing a message' }],
    usKey('search', 'Search mail', 'search', '/'),
  ]),
  pack('kagi', 'Kagi Search', ['https://kagi.com/'], 'https://help.kagi.com/kagi/features/search-operators.html', [
    ['next-result', 'Next result', 'chevron-down', 'J'],
    ['previous-result', 'Previous result', 'chevron-up', 'K'],
    usKey('help', 'Show search shortcuts', 'keyboard', 'char:?'),
  ]),
  pack('bitbucket', 'Bitbucket Cloud', ['https://bitbucket.org/'], 'https://support.atlassian.com/bitbucket-cloud/docs/keyboard-shortcuts/', [
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?'),
    ['search-code', 'Search code', 'search', 'C', { context: 'In Bitbucket Cloud Search' }],
    ['next-control', 'Focus next control', 'arrow-right', 'Tab'],
  ]),
  pack('azure-devops', 'Azure DevOps', ['https://dev.azure.com/'], 'https://learn.microsoft.com/en-us/azure/devops/project/navigation/keyboard-shortcuts?view=azure-devops', [
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?'),
    usKey('search', 'Focus Search', 'search', '/'),
    ['filter-work-items', 'Filter work items', 'list-filter', 'Ctrl+Shift+F', { context: 'On the Azure Boards work items page' }],
  ]),
  pack('azure-portal', 'Azure Portal', ['https://portal.azure.com/'], 'https://learn.microsoft.com/en-us/azure/azure-portal/azure-portal-keyboard-shortcuts', [
    usKey('search-resource-menu', 'Search resource menu', 'search', 'Ctrl+/'),
    ['next-control', 'Focus next control', 'arrow-right', 'Tab'],
    ['previous-control', 'Focus previous control', 'arrow-left', 'Shift+Tab'],
  ]),
  pack('gcp-console', 'Google Cloud Console', ['https://console.cloud.google.com/'], 'https://docs.cloud.google.com/docs/shortcuts', [
    usKey('search', 'Search Cloud Console', 'search', '/'),
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+Shift+/'),
    ['project-navigator', 'Open project navigator', 'folder-open', 'Ctrl+O'],
  ]),
  pack('google-colab', 'Google Colab', ['https://colab.research.google.com/'], 'https://colab.research.google.com/notebooks/basic_features_overview.ipynb', [
    ['run-cell', 'Run current cell', 'play', 'Ctrl+Enter', { context: 'While a notebook has focus' }],
    ['run-and-next', 'Run cell and move next', 'skip-forward', 'Shift+Enter', { context: 'While a notebook has focus' }],
    ['save', 'Save notebook', 'save', 'Ctrl+S'],
  ]),
  pack('github-codespaces', 'GitHub Codespaces', ['https://your-codespace.github.dev/'], 'https://docs.github.com/en/codespaces/customizing-your-codespace/changing-the-shell-in-a-codespace', [
    ['palette', 'Command palette', 'command', 'Ctrl+Shift+P'],
    ['quick-open', 'Quick Open', 'file-search', 'Ctrl+P', { source: 'https://code.visualstudio.com/docs/reference/default-keybindings' }],
    ['find-files', 'Find in files', 'search', 'Ctrl+Shift+F', { source: 'https://code.visualstudio.com/docs/reference/default-keybindings' }],
  ], { tenant: 'github.dev', editing: true }),
  pack('make', 'Make', ['https://eu1.make.com/', 'https://eu2.make.com/', 'https://us1.make.com/', 'https://us2.make.com/'], 'https://help.make.com/keyboard-shortcuts', [
    ['save-version', 'Save scenario version', 'save', 'Ctrl+Shift+S'],
    ['undo-scenario', 'Undo scenario change', 'undo-2', 'Ctrl+Z'],
    ['redo-scenario', 'Redo scenario change', 'redo-2', 'Ctrl+Shift+Z'],
  ]),
  pack('sway', 'Microsoft Sway', ['https://sway.cloud.microsoft/', 'https://sway.office.com/'],
    'https://support.microsoft.com/en-us/accessibility/sway/keyboard-shortcuts-for-sway', [
      ['next-area', 'Focus next Sway area', 'arrow-right', 'Ctrl+F6'],
      ['previous-area', 'Focus previous area', 'arrow-left', 'Ctrl+Shift+F6'],
      ['next-control', 'Focus next control', 'chevron-right', 'Tab'],
    ]),
  pack('framer', 'Framer', ['https://www.framer.com/projects/'], 'https://www.framer.com/shortcuts', [
    ['quick-actions', 'Quick Actions', 'command', 'Ctrl+K'],
    ['duplicate', 'Duplicate selection', 'copy', 'Ctrl+D'],
    ['group', 'Group selection', 'group', 'Ctrl+G'],
  ], { pathScoped: true }),
  pack('vimeo', 'Vimeo', ['https://vimeo.com/'], 'https://help.vimeo.com/hc/en-us/articles/12425998125073-What-are-player-keyboard-shortcuts', [
    ['play-pause', 'Play or pause', 'circle-play', 'Space', vimeo],
    ['seek-back', 'Seek backward', 'rewind', 'Left', vimeo],
    ['seek-forward', 'Seek forward', 'fast-forward', 'Right', vimeo],
    ['fullscreen', 'Toggle full screen', 'maximize', 'F', vimeo],
    usKey('shortcuts', 'Player shortcuts', 'keyboard', 'char:?'),
  ]),
  pack('codepen', 'CodePen', ['https://codepen.io/'], 'https://blog.codepen.io/documentation/key-bindings/', [
    ['save', 'Save Pen', 'save', 'Ctrl+S'],
    ['find', 'Find text in editor', 'search', 'Ctrl+F', { context: 'While the code editor has focus' }],
    ['indent', 'Indent selection', 'indent-increase', 'Tab', { context: 'With a code selection in the editor' }],
  ], { editing: true }),
  pack('figjam', 'FigJam', ['https://www.figma.com/board/'], figjam.source, [
    ['select', 'Select tool', 'mouse-pointer-2', 'V', figjam],
    ['duplicate', 'Duplicate selection', 'copy', 'Ctrl+D', figjam],
    ['select-all', 'Select canvas objects', 'square-dashed', 'Ctrl+A', figjam],
  ], { pathScoped: true, editing: true }),
  pack('inoreader', 'Inoreader', ['https://www.inoreader.com/'], 'https://www.inoreader.com/help/basic/navigation-shortcuts/which-keyboard-shortcuts-does-inoreader-have', [
    ['next-article', 'Next article', 'chevron-down', 'J'],
    ['previous-article', 'Previous article', 'chevron-up', 'K'],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?'),
  ]),
  pack('n8n', 'n8n Cloud', ['https://your-team.app.n8n.cloud/'], 'https://docs.n8n.io/keyboard-shortcuts/', [
    ['add-node', 'Open node picker', 'square-plus', 'Tab'],
    ['save', 'Save workflow', 'save', 'Ctrl+S'],
    ['undo-workflow', 'Undo canvas change', 'undo-2', 'Ctrl+Z'],
  ], { tenant: 'app.n8n.cloud' }),
  pack('hubspot', 'HubSpot', ['https://app.hubspot.com/'], 'https://knowledge.hubspot.com/account-management/search-within-your-hubspot-account', [
    ['search', 'Search HubSpot account', 'search', 'Ctrl+K'],
    ['next-control', 'Focus next control', 'arrow-right', 'Tab'],
    ['previous-control', 'Focus previous control', 'arrow-left', 'Shift+Tab'],
  ]),
];
