// @ts-check
'use strict';

const { shortcutGroup: group, usKey } = require('./shortcut-pack-data');

const slackSource = 'https://slack.com/help/articles/201374536-Slack-keyboard-shortcuts-and-commands/';
const discordSource = 'https://support.discord.com/hc/en-us/articles/31232432266647-Discord-Commands-Shortcuts-and-Navigation-Guide';
const signalSource = 'https://support.signal.org/hc/en-us/articles/360036517511-Signal-Desktop-Keyboard-Shortcuts';
const telegramSource = 'https://github.com/telegramdesktop/tdesktop/blob/dev/Telegram/SourceFiles/core/shortcuts.cpp';

module.exports = {
  slack: [
    ...group('Views and conversations', [
      ['slack-home', 'Home', 'house', 'Ctrl+Shift+1'],
      ['slack-dms', 'Browse direct messages', 'messages-square', 'Ctrl+Shift+2'],
      ['slack-activity', 'Open Activity', 'activity', 'Ctrl+Shift+M'],
      ['slack-unreads', 'Open Unreads', 'inbox', 'Ctrl+Shift+A'],
      ['slack-threads', 'Open Threads', 'message-square', 'Ctrl+Shift+T'],
      ['slack-channels', 'Browse channels', 'hash', 'Ctrl+Shift+L'],
      ['slack-details', 'Conversation details', 'info', 'Ctrl+Shift+I'],
      ['recent-unread', 'Jump to latest unread', 'arrow-down', 'Ctrl+J'],
      ['next-unread', 'Next unread', 'chevron-down', 'Alt+Shift+Down'],
      ['prev-channel', 'Previous conversation', 'chevron-up', 'Alt+Up'],
      ['next-channel', 'Next conversation', 'chevron-down', 'Alt+Down'],
      ['previous-history', 'Go back', 'arrow-left', 'Alt+Left'],
      ['next-history', 'Go forward', 'arrow-right', 'Alt+Right'],
    ], { source: slackSource }),
    ...group('Workspace and composer', [
      ['slack-next-section', 'Focus next section', 'arrow-right', 'F6'],
      ['slack-previous-section', 'Focus previous section', 'arrow-left', 'Shift+F6'],
      ['previous-tab', 'Previous Slack tab', 'chevron-left', 'Ctrl+PageUp'],
      ['next-tab', 'Next Slack tab', 'chevron-right', 'Ctrl+PageDown'],
      ['strikethrough', 'Strikethrough', 'strikethrough', 'Ctrl+Shift+X', { context: 'With text selected in the message composer' }],
      usKey('preferences', 'Preferences', 'settings', 'Ctrl+char:,'),
    ], { source: slackSource }),
  ],
  discord: [
    ...group('Servers and channels', [
      ['previous-server', 'Previous server', 'chevron-up', 'Ctrl+Alt+Up'],
      ['next-server', 'Next server', 'chevron-down', 'Ctrl+Alt+Down'],
      ['previous-channel', 'Previous channel', 'chevron-up', 'Alt+Up'],
      ['next-channel', 'Next channel', 'chevron-down', 'Alt+Down'],
      ['previous-unread', 'Previous unread channel', 'arrow-up', 'Alt+Shift+Up'],
      ['next-unread', 'Next unread channel', 'arrow-down', 'Alt+Shift+Down'],
      ['toggle-pins', 'Toggle pins', 'pin', 'Ctrl+P'],
      ['toggle-members', 'Toggle member list', 'users', 'Ctrl+U'],
      ['jump-unread', 'Jump to oldest unread', 'arrow-up', 'Shift+PageUp'],
    ], { source: discordSource }),
    ...group('Messages', [
      ['upload', 'Open attachment picker', 'paperclip', 'Ctrl+Shift+U'],
      ['create-server', 'Add or join server', 'server', 'Ctrl+Shift+N'],
      ['toggle-inbox', 'Toggle Inbox', 'inbox', 'Ctrl+I'],
      ['return-to-chat', 'Focus message composer', 'message-square', 'Esc', { context: 'While navigating Discord messages with the keyboard' }],
      usKey('shortcut-help', 'Keyboard shortcuts', 'keyboard', 'Ctrl+/'),
    ], { source: discordSource }),
  ],
  whatsapp: [
    ...group('Chats and search', [
      ['search-all', 'Search WhatsApp', 'search', 'Ctrl+Alt+Slash', { usLayout: true, notation: 'Ctrl+Alt+/' }],
      ['new-group', 'New group', 'users', 'Ctrl+Shift+N'],
      ['mark-unread', 'Mark chat unread', 'mail', 'Ctrl+Shift+U'],
      ['archive-chat', 'Archive chat', 'archive', 'Ctrl+Shift+A'],
      ['mute-chat', 'Mute chat', 'bell-off', 'Ctrl+Shift+M'],
      ['pin-chat', 'Pin chat', 'pin', 'Ctrl+Alt+Shift+P'],
      ['chat-info', 'Open chat info', 'info', 'Alt+I'],
      ['settings', 'Settings', 'settings', 'Alt+S'],
      usKey('previous-chat', 'Previous chat', 'chevron-up', 'Ctrl+char:['),
      usKey('next-chat', 'Next chat', 'chevron-down', 'Ctrl+char:]'),
    ]),
    ...group('Message composer', [
      ['attach', 'Open attachment menu', 'paperclip', 'Alt+A'],
      ['gifs', 'Open GIF panel', 'images', 'Ctrl+Alt+G'],
      ['stickers', 'Open sticker panel', 'sticker', 'Ctrl+Alt+S'],
      ['reply', 'Reply to message', 'reply', 'Alt+R', { context: 'With a message selected' }],
      ['reply-privately', 'Reply privately', 'reply', 'Ctrl+Alt+R', { context: 'With a group message selected' }],
    ]),
  ],
  telegram: [
    ...group('Find and switch chats', [
      ['first-chat', 'First chat', 'arrow-up-to-line', 'Ctrl+Alt+Home'],
      ['last-chat', 'Last chat', 'arrow-down-to-line', 'Ctrl+Alt+End'],
      ['saved-messages', 'Saved Messages', 'bookmark', 'Ctrl+0'],
      ['previous-folder', 'Previous chat folder', 'folder', 'Ctrl+Shift+Up'],
      ['next-folder', 'Next chat folder', 'folder', 'Ctrl+Shift+Down'],
      ['reopen-window', 'Reopen closed window', 'rotate-ccw', 'Ctrl+Shift+T'],
    ], { source: telegramSource }),
    ...group('Format a draft', [
      ['bold', 'Bold text', 'bold', 'Ctrl+B'],
      ['italic', 'Italic text', 'italic', 'Ctrl+I'],
      ['link', 'Create or edit link', 'link', 'Ctrl+K'],
      ['monospace', 'Monospace text', 'code', 'Ctrl+Shift+M'],
      ['clear-formatting', 'Clear draft formatting', 'remove-formatting', 'Ctrl+Shift+N'],
    ], { context: 'With text selected in the Telegram composer', source: 'https://github.com/telegramdesktop/tdesktop/blob/dev/changelog.txt' }),
  ],
  signal: [
    ...group('Conversation navigation', [
      ['previous-chat', 'Previous conversation', 'chevron-up', 'Alt+Up'],
      ['next-chat', 'Next conversation', 'chevron-down', 'Alt+Down'],
      ['jump-composer', 'Focus composer', 'message-square', 'Ctrl+Shift+T'],
      ['previous-unread', 'Previous unread chat', 'arrow-up', 'Alt+Shift+Up'],
      ['next-unread', 'Next unread chat', 'arrow-down', 'Alt+Shift+Down'],
      ['all-media', 'Open All Media', 'images', 'Ctrl+Shift+M'],
      usKey('preferences', 'Preferences', 'settings', 'Ctrl+char:,'),
      usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+/'),
    ], { source: signalSource }),
  ],
  thunderbird: [
    ...group('Mail and navigation', [
      ['forward', 'Forward message', 'forward', 'Ctrl+L'],
      ['mark-read', 'Toggle read status', 'mail-open', 'M', { context: 'With a message selected' }],
      ['archive', 'Archive message', 'archive', 'A', { context: 'With a message selected' }],
      ['next-unread', 'Next unread message', 'chevron-down', 'N'],
      ['previous-unread', 'Previous unread', 'chevron-up', 'P'],
      ['quick-filter', 'Quick Filter', 'list-filter', 'Ctrl+Shift+K'],
      ['find-in-message', 'Find in message', 'search', 'Ctrl+F'],
      ['get-mail', 'Get messages', 'download', 'F5'],
      ['address-book', 'Address Book', 'contact', 'Ctrl+Shift+B'],
      ['print', 'Print message', 'printer', 'Ctrl+P'],
    ]),
    ...group('Compose', [
      ['save-draft', 'Save draft', 'save', 'Ctrl+S'],
      ['attach', 'Attach file', 'paperclip', 'Ctrl+Shift+A'],
      ['check-spelling', 'Check spelling', 'spell-check', 'Ctrl+Shift+P'],
    ], { context: 'While composing an email' }),
  ],
  teams: [
    ...group('Navigation and chat', [
      ['first-app', 'Open first app', 'activity', 'Ctrl+1'],
      ['second-app', 'Open second app', 'messages-square', 'Ctrl+2'],
      ['show-shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+Period', { usLayout: true, notation: 'Ctrl+.' }],
      ['open-settings', 'Open settings', 'settings', 'Ctrl+Comma', { usLayout: true, notation: 'Ctrl+,' }],
      ['go-to', 'Go to chat or channel', 'arrow-right', 'Ctrl+G'],
      ['find-in-chat', 'Find in chat', 'search', 'Ctrl+F'],
      ['next-section', 'Focus next section', 'chevron-right', 'Ctrl+F6'],
      ['previous-section', 'Focus previous section', 'chevron-left', 'Ctrl+Shift+F6'],
      ['scheduled-meeting', 'Open meeting scheduler', 'calendar-plus', 'Alt+N', { context: 'In the Teams calendar' }],
    ]),
    ...group('Meeting and call', [
      ['toggle-speaker', 'Toggle speaker', 'volume-2', 'Ctrl+Shift+U'],
      ['sharing-toolbar', 'Focus sharing toolbar', 'screen-share', 'Ctrl+Shift+Space'],
    ], { mode: 'a Teams meeting' }),
  ],
  zoom: [
    ...group('Meeting panels', [
      ['open-chat', 'Toggle meeting chat', 'message-square', 'Alt+H'],
      ['participants', 'Toggle Participants', 'users', 'Alt+U'],
      ['invite', 'Open invitation dialog', 'user-round-plus', 'Alt+I'],
      ['fullscreen', 'Toggle full screen', 'maximize', 'Alt+F'],
      ['captions', 'Toggle captions', 'captions', 'Alt+C'],
      ['speaker', 'Speaker view', 'user-round', 'Alt+F1'],
      ['gallery', 'Gallery view', 'layout-grid', 'Alt+F2'],
      ['previous-gallery', 'Previous gallery page', 'chevron-left', 'PageUp'],
      ['next-gallery', 'Next gallery page', 'chevron-right', 'PageDown'],
      ['leave-meeting', 'Leave meeting dialog', 'phone-off', 'Alt+Q'],
    ], { mode: 'a Zoom meeting' }),
  ],
  'outlook-classic': [
    ...group('Mail and calendar', [
      ['mail-view', 'Open Mail', 'mail', 'Ctrl+1'],
      ['calendar-view', 'Open Calendar', 'calendar-days', 'Ctrl+2'],
      ['people-view', 'Open People', 'users', 'Ctrl+3'],
      ['tasks-view', 'Open Tasks', 'list-todo', 'Ctrl+4'],
      ['new-appointment', 'New appointment', 'calendar-plus', 'Ctrl+Shift+A'],
      ['new-meeting', 'New meeting request', 'calendar-plus', 'Ctrl+Shift+Q'],
      ['new-contact', 'New contact', 'user-round-plus', 'Ctrl+Shift+C'],
      ['search', 'Search Outlook', 'search', 'Ctrl+E'],
      ['move-folder', 'Move to folder dialog', 'folder-output', 'Ctrl+Shift+V'],
      ['mark-read', 'Mark as read', 'mail-open', 'Ctrl+Q'],
      ['mark-unread', 'Mark as unread', 'mail', 'Ctrl+U'],
      ['next-item', 'Next item', 'chevron-down', 'Ctrl+Period', { usLayout: true, notation: 'Ctrl+.' }],
      ['previous-item', 'Previous item', 'chevron-up', 'Ctrl+Comma', { usLayout: true, notation: 'Ctrl+,' }],
    ]),
  ],
  'outlook-new': [
    ...group('Mail and calendar', [
      ['mail-view', 'Open Mail', 'mail', 'Ctrl+1'],
      ['calendar-view', 'Open Calendar', 'calendar-days', 'Ctrl+2'],
      ['people-view', 'Open People', 'users', 'Ctrl+3'],
      ['search', 'Search Outlook', 'search', 'Ctrl+E'],
      ['mark-read', 'Mark as read', 'mail-open', 'Ctrl+Q'],
      ['mark-unread', 'Mark as unread', 'mail', 'Ctrl+U'],
      ['flag', 'Flag for follow-up', 'flag', 'Insert'],
      ['archive', 'Archive message', 'archive', 'E', { context: 'With a message selected using the Outlook keymap' }],
    ]),
  ],
};
