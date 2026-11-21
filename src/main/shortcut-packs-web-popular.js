// @ts-check
'use strict';

const { webPack: pack, usKey } = require('./shortcut-pack-data');

const browserSource = 'https://support.google.com/chrome/answer/157179?hl=en';
/** @type {import('./shortcut-pack-data').StarterKey[]} */
const browserNavigation = [
  ['find-on-page', 'Browser find on page', 'search', 'Ctrl+F', { source: browserSource }],
  ['back', 'Browser back', 'arrow-left', 'Alt+Left', { source: browserSource }],
  ['refresh', 'Reload page', 'refresh-cw', 'Ctrl+R', { source: browserSource }],
];
/** @type {import('./shortcut-pack-data').StarterKey[]} */
const browserAccessibility = [
  ['next-control', 'Focus next control', 'arrow-right', 'Tab'],
  ['previous-control', 'Focus previous control', 'arrow-left', 'Shift+Tab'],
  ...browserNavigation,
];

/** @type {import('./shortcut-pack-data').StarterKey[]} */
const videoPlayback = [
  ['play-pause', 'Play or pause', 'circle-play', 'Space', { context: 'While the video player has focus' }],
  ['seek-back', 'Seek backward', 'rewind', 'Left', { context: 'While the video player has focus' }],
  ['seek-forward', 'Seek forward', 'fast-forward', 'Right', { context: 'While the video player has focus' }],
];

module.exports = [
  pack('facebook', 'Facebook', ['https://www.facebook.com/'], 'https://www.facebook.com/help/156151771119453/', [
    ['next-post', 'Next feed post', 'chevron-down', 'J', { context: 'In the feed with shortcuts enabled' }],
    ['previous-post', 'Previous feed post', 'chevron-up', 'K', { context: 'In the feed with shortcuts enabled' }],
    ...browserNavigation,
  ]),
  pack('instagram', 'Instagram', ['https://www.instagram.com/'], browserSource, browserAccessibility),
  pack('linkedin', 'LinkedIn', ['https://www.linkedin.com/'], browserSource, browserAccessibility),
  pack('reddit', 'Reddit', ['https://www.reddit.com/'], 'https://support.reddithelp.com/hc/en-us/articles/38744650091412-How-to-use-keyboard-shortcuts-hotkeys', [
    ['next-post', 'Next post or comment', 'chevron-down', 'J', { context: 'In the feed with shortcuts enabled' }],
    ['previous-post', 'Previous post or comment', 'chevron-up', 'K', { context: 'In the feed with shortcuts enabled' }],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?'),
  ]),
  pack('x-social', 'X', ['https://x.com/', 'https://twitter.com/'], 'https://help.x.com/en/using-x/accessibility-features', [
    ['next-post', 'Next post', 'chevron-down', 'J', { context: 'In the timeline' }],
    ['previous-post', 'Previous post', 'chevron-up', 'K', { context: 'In the timeline' }],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?'),
  ]),
  pack('netflix', 'Netflix', ['https://www.netflix.com/'], 'https://help.netflix.com/en/node/24855', [
    ...videoPlayback,
    ['mute', 'Toggle mute', 'volume-x', 'M', { context: 'While the video player has focus' }],
    ['fullscreen', 'Full screen', 'maximize', 'F', { context: 'While the video player has focus' }],
  ]),
  pack('prime-video', 'Prime Video', ['https://www.primevideo.com/'], 'https://www.primevideo.com/help?nodeId=GE4VW9VWJD7FM6DR', [
    ...videoPlayback,
    ['mute', 'Toggle mute', 'volume-x', 'M', { context: 'While the video player has focus' }],
    ['fullscreen', 'Full screen', 'maximize', 'F', { context: 'While the video player has focus' }],
  ]),
  pack('disney-plus', 'Disney+', ['https://www.disneyplus.com/'], 'https://help.disneyplus.com/en-GB/article/disneyplus-en-tr-accessibility', [
    ...videoPlayback,
    ['volume-up', 'Raise player volume', 'volume-2', 'Up', { context: 'While the video player has focus' }],
    ['volume-down', 'Lower player volume', 'volume-1', 'Down', { context: 'While the video player has focus' }],
  ]),
  pack('twitch', 'Twitch', ['https://www.twitch.tv/'], 'https://www.twitch.tv/', [
    ['play-pause', 'Play or pause', 'circle-play', 'Space', { context: 'While the video player has focus' }],
    ['fullscreen', 'Full screen', 'maximize', 'F', { context: 'While the video player has focus' }],
    ['mute', 'Toggle mute', 'volume-x', 'M', { context: 'While the video player has focus' }],
  ]),
  pack('google-drive', 'Google Drive', ['https://drive.google.com/', 'https://drive.google.com/drive/'], 'https://support.google.com/drive/answer/2563044', [
    ['find', 'Find in Drive', 'search', 'Ctrl+F'],
    ['preview', 'Preview selected item', 'scan-eye', 'Ctrl+Alt+P'],
    ['create-menu', 'Open New menu', 'square-plus', 'Alt+N'],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+/'),
  ]),
  pack('google-calendar', 'Google Calendar', ['https://calendar.google.com/', 'https://calendar.google.com/calendar/'], 'https://support.google.com/calendar/answer/37034', [
    ['today', 'Go to today', 'calendar-days', 'T', { context: 'Calendar keyboard shortcuts enabled' }],
    ['previous-period', 'Previous date range', 'chevron-left', 'K', { context: 'Calendar keyboard shortcuts enabled' }],
    ['next-period', 'Next date range', 'chevron-right', 'J', { context: 'Calendar keyboard shortcuts enabled' }],
    ['new-event', 'Create event draft', 'calendar-plus', 'C', { context: 'Calendar keyboard shortcuts enabled' }],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?'),
  ]),
  pack('google-maps', 'Google Maps', ['https://www.google.com/maps/', 'https://maps.google.com/'], 'https://support.google.com/maps/answer/6396990', [
    ['pan-left', 'Pan map left', 'arrow-left', 'Left', { context: 'While the map has focus' }],
    ['pan-right', 'Pan map right', 'arrow-right', 'Right', { context: 'While the map has focus' }],
    ['pan-up', 'Pan map up', 'arrow-up', 'Up', { context: 'While the map has focus' }],
    ['pan-down', 'Pan map down', 'arrow-down', 'Down', { context: 'While the map has focus' }],
  ], { pathScoped: true }),
  pack('github-web', 'GitHub', ['https://github.com/'], 'https://docs.github.com/en/get-started/accessibility/keyboard-shortcuts', [
    usKey('search', 'Focus GitHub search', 'search', '/'),
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?'),
    ['find-file', 'Find file in repository', 'file-search', 'T', { context: 'On a repository code page' }],
  ]),
  pack('gitlab', 'GitLab', ['https://gitlab.com/'], 'https://docs.gitlab.com/user/shortcuts/', [
    ['projects', 'Projects', 'folder-open', 'Shift+P'],
    ['issues', 'Issues', 'list-todo', 'Shift+I'],
    ['merge-requests', 'Merge requests', 'git-pull-request', 'Shift+M'],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?'),
  ]),
  pack('confluence', 'Confluence Cloud', ['https://your-team.atlassian.net/wiki/'], 'https://support.atlassian.com/confluence-cloud/docs/keyboard-shortcuts-markdown-and-autocomplete/', [
    ['edit', 'Edit current page', 'pencil', 'E', { context: 'While viewing a Confluence page' }],
    ['comments', 'Open page comments', 'message-square', 'Ctrl+Alt+C'],
    ['present', 'Enter presenter mode', 'presentation', 'Ctrl+Alt+P'],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+char:?'),
  ], { tenant: 'atlassian.net', pathScoped: true }),
  pack('clickup', 'ClickUp', ['https://app.clickup.com/'], 'https://help.clickup.com/hc/en-us/articles/6309030550167-Use-keyboard-shortcuts', [
    ['search', 'Open Command Bar', 'search', 'Ctrl+K', { source: 'https://help.clickup.com/hc/en-us/articles/6311563319063-Core-ClickUp-features' }],
    ['find-tasks', 'Find tasks in view', 'filter', 'Ctrl+F', { source: 'https://help.clickup.com/hc/en-us/articles/6308875427223-Use-filters-to-search-tasks' }],
  ]),
  pack('monday', 'monday.com', ['https://your-team.monday.com/'], 'https://support.monday.com/hc/en-us/articles/115005339905-monday-com-Shortcuts', [
    ['search', 'Quick Search', 'search', 'Ctrl+B'],
    ['find-on-board', 'Search board', 'text-search', 'Ctrl+F'],
    ['activity', 'Open Activity Log', 'activity', 'Ctrl+Shift+L'],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?'),
  ], { tenant: 'monday.com' }),
  pack('airtable', 'Airtable', ['https://airtable.com/'], 'https://support.airtable.com/articles/7980233311-airtable-keyboard-shortcuts', [
    ['switch-base', 'Quick base switcher', 'panel-top', 'Ctrl+K'],
    ['switch-view', 'Switch view', 'panels-top-left', 'Ctrl+Shift+K', { context: 'While a base is open' }],
    ['filter', 'Filter current view', 'list-filter', 'Ctrl+Shift+F', { context: 'While a base is open' }],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+/'),
  ]),
  pack('salesforce', 'Salesforce Lightning', ['https://your-team.lightning.force.com/lightning/'],
    'https://help.salesforce.com/s/articleView?id=sf.accessibility_keyboard_shortcuts.htm&language=en_US&type=5', [
      ['edit-record', 'Edit record', 'pencil', 'E', { context: 'While viewing a Lightning record' }],
      ['notes', 'Toggle Notes utility', 'notebook', 'N', { context: 'After opening Notes in the utility bar' }],
      usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+/'),
    ], { tenant: 'lightning.force.com', pathScoped: true }),
  pack('tiktok', 'TikTok', ['https://www.tiktok.com/'], browserSource, browserAccessibility),
  pack('dropbox', 'Dropbox', ['https://www.dropbox.com/', 'https://www.dropbox.com/home'], 'https://help.dropbox.com/organize/keyboard-shortcuts', [
    usKey('search', 'Search files and folders', 'search', '/'),
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?'),
    ['next-item', 'Next file or folder', 'chevron-down', 'Down', { context: 'In the Files tab' }],
    ['previous-item', 'Previous file or folder', 'chevron-up', 'Up', { context: 'In the Files tab' }],
  ]),
  pack('shopify', 'Shopify Admin', ['https://admin.shopify.com/store/'], 'https://help.shopify.com/en/manual/shopify-admin/admin-search', [
    ['search', 'Search Shopify admin', 'search', 'Ctrl+K'],
    ...browserNavigation,
  ], { pathScoped: true }),
  pack('wordpress', 'WordPress.com', ['https://wordpress.com/'], 'https://wordpress.com/support/wordpress-editor/keyboard-shortcuts/', [
    ['shortcuts', 'Editor shortcuts', 'keyboard', 'Shift+Alt+H', { context: 'In the block editor' }],
    ['outline', 'Block list view', 'list-tree', 'Shift+Alt+O', { context: 'In the block editor' }],
    ['fullscreen', 'Editor full screen', 'maximize', 'Ctrl+Shift+Alt+F', { context: 'In the block editor' }],
    ['palette', 'Editor Command Palette', 'command', 'Ctrl+K', { context: 'In the block editor',
      source: 'https://wordpress.com/support/site-editor/command-palette/' }],
  ]),
];
