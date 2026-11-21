// @ts-check
'use strict';

const { webPack: pack, shortcutGroup: group, usKey } = require('./shortcut-pack-data');

const player = { context: 'While the player has focus' };
const editor = { context: 'While the document editor has focus' };

module.exports = [
  pack('workflowy', 'Workflowy', ['https://workflowy.com/'], 'https://community.workflowy.com/t/keyboard-shortcuts/1686', [
    ['indent', 'Indent item', 'indent-increase', 'Tab', editor],
    ['outdent', 'Outdent item', 'indent-decrease', 'Shift+Tab', editor],
    ['complete', 'Toggle completion', 'square-check', 'Ctrl+Enter', editor],
    ['move-up', 'Move item up', 'arrow-up', 'Alt+Shift+Up', editor],
    ['move-down', 'Move item down', 'arrow-down', 'Alt+Shift+Down', editor],
  ], { editing: true }),
  pack('dynalist', 'Dynalist', ['https://dynalist.io/'], 'https://help.dynalist.io/article/91-keyboard-shortcut-reference', [
    ['indent', 'Indent item', 'indent-increase', 'Tab', editor],
    ['outdent', 'Outdent item', 'indent-decrease', 'Shift+Tab', editor],
    ['complete', 'Check or uncheck item', 'square-check', 'Ctrl+Enter', editor],
    ['zoom-in', 'Zoom into item', 'zoom-in', 'Alt+Right', editor],
    ['zoom-out', 'Zoom out one level', 'zoom-out', 'Alt+Left', editor],
  ], { editing: true }),
  pack('pocket-casts', 'Pocket Casts', ['https://play.pocketcasts.com/'], 'https://support.pocketcasts.com/knowledge-base/do-you-have-any-keyboard-shortcuts/', [
    ['play-pause', 'Play or pause', 'circle-play', 'Space', player],
    ['episode-popup', 'Playing episode popup', 'podcast', 'E'],
    ['close-full-screen', 'Close full-screen player', 'minimize', 'Esc'],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?'),
  ]),
  pack('tana', 'Tana', ['https://app.tana.inc/'], 'https://tana.inc/learn/features/keyboard-shortcuts', [
    ['palette', 'Command menu', 'command', 'Ctrl+K'],
    ['indent', 'Indent node', 'indent-increase', 'Tab', editor],
    ['outdent', 'Outdent node', 'indent-decrease', 'Shift+Tab', editor],
    ['move-up', 'Move node up', 'arrow-up', 'Ctrl+Shift+Up', editor],
    ['move-down', 'Move node down', 'arrow-down', 'Ctrl+Shift+Down', editor],
    ['bold', 'Bold text', 'bold', 'Ctrl+B', editor],
    ['italic', 'Italic text', 'italic', 'Ctrl+I', editor],
  ], { editing: true }),
  pack('zoho-writer', 'Zoho Writer', ['https://writer.zoho.com/', 'https://writer.zoho.eu/'],
    'https://help.zoho.com/portal/en/kb/writer/getting-started/overview/articles/shortcuts', [
      ['link', 'Insert link', 'link', 'Ctrl+K', editor],
      ['comment', 'Add comment draft', 'message-square-plus', 'Ctrl+Alt+M', editor],
      ['footnote', 'Insert footnote', 'footprints', 'Ctrl+Alt+F', editor],
      ['page-break', 'Insert page break', 'files', 'Ctrl+Enter', editor],
      ['bullets', 'Bulleted list', 'list', 'Ctrl+Shift+U', editor],
      ['history', 'View history', 'history', 'Ctrl+Alt+Shift+G', editor],
    ], { editing: true }),
  pack('zoho-sheet', 'Zoho Sheet', ['https://sheet.zoho.com/', 'https://sheet.zoho.eu/'],
    'https://help.zoho.com/portal/en/kb/sheet/getting-started-with-zoho-sheet/articles/view-all-the-keyboard-shortcuts-for-sheet-16-9-2019', [
      ['open-file', 'Open file', 'folder-open', 'Ctrl+O'],
      ['save-as', 'Save file as', 'save-all', 'Ctrl+Shift+S'],
      ['print', 'Print spreadsheet', 'printer', 'Ctrl+P'],
      ['repeat', 'Repeat last action', 'repeat', 'Alt+Enter', editor],
    ], { editing: true }),
  pack('home-assistant', 'Home Assistant Cloud', ['https://your-instance.ui.nabu.casa/'],
    'https://www.home-assistant.io/docs/tools/quick-search/', [
      ['command-palette', 'Command palette', 'command', 'C'],
      ['find-entities', 'Find entities', 'search', 'E'],
      ['find-devices', 'Find devices', 'scan', 'D'],
    ], { tenant: 'ui.nabu.casa' }),
  pack('grafana-cloud', 'Grafana Cloud', ['https://your-stack.grafana.net/'],
    'https://grafana.com/docs/grafana/latest/visualizations/dashboards/use-dashboards/', [
      ['palette', 'Command palette', 'command', 'Ctrl+K'],
      ['save-dashboard', 'Save current dashboard', 'save', 'Ctrl+S', { context: 'While editing a Grafana dashboard' }],
      usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?'),
    ], { tenant: 'grafana.net' }),
  pack('photopea', 'Photopea', ['https://www.photopea.com/'], 'https://www.photopea.com/learn/adjustments-filters', [
    ['levels', 'Levels dialog', 'sliders-horizontal', 'Ctrl+L', editor],
    ['curves', 'Curves dialog', 'chart-spline', 'Ctrl+M', editor],
    ['hue-saturation', 'Hue and saturation', 'palette', 'Ctrl+U', editor],
    ['undo', 'Undo edit', 'undo-2', 'Ctrl+Z', editor],
  ], { editing: true }),
  pack('figma-slides', 'Figma Slides', ['https://www.figma.com/slides/'],
    'https://help.figma.com/hc/en-us/articles/360040328653-Use-Figma-products-with-a-keyboard', [
      ['next-area', 'Focus next area', 'arrow-right', 'Ctrl+F6'],
      ['previous-area', 'Focus previous area', 'arrow-left', 'Ctrl+Shift+F6'],
      usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+Shift+char:?'),
    ], { editing: true, pathScoped: true }),
  pack('readwise-reader', 'Readwise Reader', ['https://read.readwise.io/'], 'https://docs.readwise.io/reader/docs/faqs', [
    ['palette', 'Command palette', 'command', 'Ctrl+K'],
    ['favorite', 'Tag document favorite', 'star', 'F',
      { context: 'With a document selected', source: 'https://docs.readwise.io/reader/guides/workflows/favorites' }],
    ['shortlist', 'Tag document shortlist', 'bookmark', 'S',
      { context: 'With a document selected', source: 'https://docs.readwise.io/reader/guides/workflows/library-configuration' }],
    ['metadata', 'Edit document metadata', 'pencil', 'Shift+M',
      { source: 'https://docs.readwise.io/reader/docs/faqs/pdfs' }],
  ]),
  pack('mastodon-social', 'Mastodon (mastodon.social)', ['https://mastodon.social/'],
    'https://github.com/mastodon/mastodon/blob/main/app/javascript/mastodon/features/keyboard_shortcuts/index.jsx', [
      ['next-post', 'Next post', 'chevron-down', 'J'],
      ['previous-post', 'Previous post', 'chevron-up', 'K'],
      ['open-post', 'Open focused post', 'arrow-right', 'O'],
      ['reply', 'Open reply draft', 'reply', 'R'],
    ]),
  pack('proton-mail', 'Proton Mail', ['https://mail.proton.me/'], 'https://proton.me/support/keyboard-shortcuts', [
    ['compose', 'Compose a message', 'mail-plus', 'N', { context: 'In Proton Mail with keyboard shortcuts enabled' }],
    usKey('search', 'Search mail', 'search', 'char:/'),
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?'),
    ...group('Messages and navigation', [
      ['reply', 'Reply to message', 'reply', 'R'],
      ['reply-all', 'Reply all', 'reply-all', 'Shift+R'],
      ['forward', 'Forward message', 'forward', 'Shift+F'],
      ['archive', 'Move to Archive', 'archive', 'A'],
      ['unread', 'Mark as unread', 'mail', 'U'],
      ['next-message', 'Next message', 'chevron-down', 'J'],
      ['previous-message', 'Previous message', 'chevron-up', 'K'],
    ], { context: 'With a message selected and Proton Mail shortcuts enabled' }),
    ...group('Composer', [
      ['save-draft', 'Save draft', 'save', 'Ctrl+S'],
      ['attach', 'Attach file', 'paperclip', 'Ctrl+Shift+A'],
      ['minimize', 'Minimize composer', 'minimize', 'Ctrl+M'],
      ['expand', 'Expand or shrink draft', 'maximize', 'Ctrl+Shift+M'],
      ['close-draft', 'Close draft', 'x', 'Esc'],
    ], { context: 'While composing a message' }),
  ]),
  pack('soundcloud', 'SoundCloud', ['https://soundcloud.com/'], 'https://help.soundcloud.com/hc/en-us/articles/115003449687-Shuffling-and-Repeating-tracks', [
    ['play-pause', 'Play or pause', 'circle-play', 'Space', player],
    ['repeat', 'Toggle track repeat', 'repeat', 'Shift+L', player],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?'),
  ]),
  pack('feedly', 'Feedly', ['https://feedly.com/'], 'https://docs.feedly.com/article/81-what-are-the-keyboard-shortcuts', [
    ['next-article', 'Next article', 'chevron-down', 'J'],
    ['previous-article', 'Previous article', 'chevron-up', 'K'],
    ['read-later', 'Save for later', 'bookmark', 'S'],
    ['open-article', 'Open original article', 'external-link', 'V'],
    ['select-next', 'Select next article', 'arrow-down', 'N'],
    ['select-previous', 'Select previous article', 'arrow-up', 'P'],
    ['go-to', 'Go to a feed or board', 'search', 'Ctrl+K'],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?'),
  ]),
  pack('desmos-graphing', 'Desmos Graphing Calculator', ['https://www.desmos.com/calculator'], 'https://www.desmos.com/shortcuts', [
    ['graph-settings', 'Toggle graph settings', 'settings', 'Ctrl+Alt+G'],
    ['help', 'Open help', 'circle-help', 'Ctrl+Alt+H'],
    ['keypad', 'Toggle keypad', 'keyboard', 'Alt+K'],
  ], { editing: true, pathScoped: true }),
  pack('overleaf', 'Overleaf', ['https://www.overleaf.com/'], 'https://docs.overleaf.com/navigating-in-the-editor/keyboard-shortcuts', [
    ['recompile', 'Recompile project', 'play', 'Ctrl+Enter', editor],
    ['find', 'Find in source file', 'search', 'Ctrl+F', editor],
    ['find-project', 'Search across project', 'folder-search', 'Ctrl+Shift+F', editor],
    usKey('comment', 'Toggle line comment', 'message-square', 'Ctrl+/'),
  ], { editing: true }),
];
