// @ts-check
'use strict';

const { shortcutGroup: group, usKey } = require('./shortcut-pack-data');

const docs = { mode: 'the Google Docs document editor' };
const sheets = { mode: 'the Google Sheets spreadsheet editor' };
const slides = { mode: 'the Google Slides presentation editor' };
const mailbox = { context: 'In Gmail with keyboard shortcuts enabled, outside a text field' };
const canva = { mode: 'a Canva design', context: 'Outside text editing' };
const miro = { mode: 'a Miro board', context: 'Outside text editing' };

module.exports = {
  gdocs: [
    ...group('Review and document tools', [
      ['comment', 'Add comment draft', 'message-square-plus', 'Ctrl+Alt+M'],
      ['open-discussion', 'Open discussion thread', 'messages-square', 'Ctrl+Alt+Shift+A'],
      ['word-count', 'Word count', 'list-ordered', 'Ctrl+Shift+C'],
      ['version-history', 'Open version history', 'history', 'Ctrl+Alt+Shift+H'],
      ['link', 'Insert link', 'link', 'Ctrl+K'],
      ['page-break', 'Insert page break', 'files', 'Ctrl+Enter'],
      ['paste-plain', 'Paste without formatting', 'clipboard-paste', 'Ctrl+Shift+V'],
    ], docs),
    ...group('Text and lists', [
      ['bold', 'Bold text', 'bold', 'Ctrl+B'],
      ['italic', 'Italic text', 'italic', 'Ctrl+I'],
      ['underline', 'Underline text', 'underline', 'Ctrl+U'],
      ['strikethrough', 'Strikethrough text', 'strikethrough', 'Alt+Shift+5'],
      ['numbered-list', 'Numbered list', 'list-ordered', 'Ctrl+Shift+7'],
      ['bulleted-list', 'Bulleted list', 'list', 'Ctrl+Shift+8'],
      ['checklist', 'Checklist', 'list-checks', 'Ctrl+Shift+9'],
      ['align-left', 'Align left', 'align-left', 'Ctrl+Shift+L'],
      ['align-center', 'Center align', 'align-center', 'Ctrl+Shift+E'],
      ['align-right', 'Align right', 'align-right', 'Ctrl+Shift+R'],
    ], docs),
  ],
  gsheets: [
    ...group('Cells and selection', [
      ['select-column', 'Select column', 'columns-3', 'Ctrl+Space'],
      ['select-row', 'Select row', 'rows-3', 'Shift+Space'],
      ['fill-down', 'Fill down', 'arrow-down', 'Ctrl+D'],
      ['fill-right', 'Fill right', 'arrow-right', 'Ctrl+R'],
      ['paste-values', 'Paste values only', 'clipboard-paste', 'Ctrl+Shift+V'],
      ['insert-link', 'Insert link', 'link', 'Ctrl+K'],
      usKey('current-date', 'Insert current date', 'calendar-days', 'Ctrl+;'),
      usKey('current-time', 'Insert current time', 'clock', 'Ctrl+Shift+;'),
    ], sheets),
    ...group('Sheet formatting', [
      ['bold', 'Bold text', 'bold', 'Ctrl+B'],
      ['italic', 'Italic text', 'italic', 'Ctrl+I'],
      ['underline', 'Underline text', 'underline', 'Ctrl+U'],
      ['strikethrough', 'Strikethrough text', 'strikethrough', 'Alt+Shift+5'],
      ['format-decimal', 'Format as number', 'hash', 'Ctrl+Shift+1'],
      ['format-time', 'Format as time', 'clock', 'Ctrl+Shift+2'],
      ['format-date', 'Format as date', 'calendar-days', 'Ctrl+Shift+3'],
      ['format-currency', 'Format as currency', 'coins', 'Ctrl+Shift+4'],
      ['format-percent', 'Format as percent', 'percent', 'Ctrl+Shift+5'],
    ], sheets),
  ],
  'google-slides': [
    ...group('Slides and objects', [
      ['duplicate-slide', 'Duplicate slide', 'copy', 'Ctrl+D', { context: 'While the slide thumbnail has focus' }],
      ['group-objects', 'Group selected objects', 'group', 'Ctrl+Alt+G'],
      ['ungroup-objects', 'Ungroup objects', 'ungroup', 'Ctrl+Alt+Shift+G'],
      ['previous-slide', 'Focus previous slide', 'chevron-up', 'Alt+Up'],
      ['next-slide', 'Focus next slide', 'chevron-down', 'Alt+Down'],
      ['find', 'Find in presentation', 'search', 'Ctrl+F'],
      ['paste-plain', 'Paste without formatting', 'clipboard-paste', 'Ctrl+Shift+V'],
      ['new-comment', 'Add comment draft', 'message-square-plus', 'Ctrl+Alt+M'],
    ], slides),
    ...group('Slide text', [
      ['bold', 'Bold text', 'bold', 'Ctrl+B'],
      ['italic', 'Italic text', 'italic', 'Ctrl+I'],
      ['underline', 'Underline text', 'underline', 'Ctrl+U'],
      ['insert-link', 'Insert link', 'link', 'Ctrl+K'],
      ['numbered-list', 'Numbered list', 'list-ordered', 'Ctrl+Shift+7'],
      ['bulleted-list', 'Bulleted list', 'list', 'Ctrl+Shift+8'],
    ], slides),
  ],
  gmail: [
    ...group('Inbox and conversations', [
      ['compose', 'Compose a message', 'mail-plus', 'C'],
      ['previous-conversation', 'Newer conversation', 'chevron-up', 'K'],
      ['next-conversation', 'Older conversation', 'chevron-down', 'J'],
      ['previous-message', 'Previous thread message', 'arrow-up', 'P'],
      ['next-message', 'Next thread message', 'arrow-down', 'N'],
      ['back-list', 'Return to message list', 'arrow-left', 'U'],
      ['select-conversation', 'Select conversation', 'square-check', 'X'],
      ['archive', 'Archive conversation', 'archive', 'E'],
      ['move-to', 'Open Move to menu', 'folder-output', 'V'],
      ['label', 'Open Label menu', 'tag', 'L'],
      ['snooze', 'Snooze menu', 'clock', 'B'],
    ], mailbox),
    ...group('Reply and formatting', [
      ['reply', 'Reply to message', 'reply', 'R'],
      ['reply-all', 'Reply all', 'reply-all', 'A'],
      ['forward', 'Forward message', 'forward', 'F'],
      ['bold', 'Bold in composer', 'bold', 'Ctrl+B', { context: 'While composing mail' }],
      ['italic', 'Italic in composer', 'italic', 'Ctrl+I', { context: 'While composing mail' }],
      ['insert-link', 'Insert link', 'link', 'Ctrl+K', { context: 'While composing mail' }],
    ], mailbox),
  ],
  canva: [
    ...group('Design tools', [
      ['text', 'Add text box', 'type', 'T'],
      ['rectangle', 'Add rectangle', 'square', 'R'],
      ['circle', 'Add circle', 'circle', 'C'],
      ['line', 'Add line', 'minus', 'L'],
      ['group', 'Group elements', 'group', 'Ctrl+G'],
      ['ungroup', 'Ungroup elements', 'ungroup', 'Ctrl+Shift+G'],
      ['select-all', 'Select all elements', 'square-dashed', 'Ctrl+A'],
      ['deselect', 'Deselect elements', 'square-x', 'Esc'],
    ], canva),
  ],
  miro: [
    ...group('Board tools and objects', [
      ['selection', 'Selection tool', 'mouse-pointer-2', 'V'],
      ['hand', 'Hand tool', 'hand', 'H'],
      ['sticky-note', 'Sticky note tool', 'sticky-note', 'N'],
      ['text', 'Text tool', 'type', 'T'],
      ['pen', 'Pen tool', 'pen-line', 'P'],
      ['duplicate', 'Duplicate selection', 'copy', 'Ctrl+D'],
      ['group', 'Group objects', 'group', 'Ctrl+G'],
      ['ungroup', 'Ungroup objects', 'ungroup', 'Ctrl+Shift+G'],
    ], miro),
  ],
  trello: [
    ...group('Board and cards', [
      ['next-card', 'Next card', 'chevron-down', 'J'],
      ['previous-card', 'Previous card', 'chevron-up', 'K'],
      ['filter', 'Open board filters', 'list-filter', 'F'],
      ['my-cards', 'Toggle my cards', 'user-round', 'Q'],
      ['open-labels', 'Open card labels', 'tags', 'L'],
      ['open-members', 'Open card members', 'users', 'M'],
      ['watch-card', 'Toggle watch card', 'eye', 'S'],
    ], { context: 'While a Trello board and the intended card have focus' }),
  ],
};
