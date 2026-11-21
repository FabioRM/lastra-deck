// @ts-check
'use strict';

const { shortcutGroup: group, usKey } = require('./shortcut-pack-data');

const notionSource = 'https://www.notion.com/help/keyboard-shortcuts';
const obsidianHotkeys = 'https://obsidian.md/help/hotkeys';
const obsidianTabs = 'https://obsidian.md/help/tabs';
const notepadPlus = 'https://npp-user-manual.org/docs/keyboard-shortcuts/';

module.exports = {
  notion: [
    ...group('Pages and navigation', [
      ['find-in-page', 'Find in page', 'search', 'Ctrl+F'],
      ['copy-page-link', 'Copy page link', 'link', 'Ctrl+L'],
      ['new-page', 'New page', 'file-plus', 'Ctrl+N'],
      ['new-window', 'New Notion window', 'panels-top-left', 'Ctrl+Shift+N'],
      ['new-tab', 'New Notion tab', 'square-plus', 'Ctrl+T'],
      ['reopen-tab', 'Reopen closed tab', 'rotate-ccw', 'Ctrl+Shift+T'],
      usKey('history-back', 'Go back one page', 'arrow-left', 'Ctrl+char:['),
      usKey('history-forward', 'Go forward one page', 'arrow-right', 'Ctrl+char:]'),
    ], { source: notionSource }),
    ...group('Page editor and blocks', [
      ['bold', 'Bold text', 'bold', 'Ctrl+B'],
      ['italic', 'Italic text', 'italic', 'Ctrl+I'],
      ['underline', 'Underline text', 'underline', 'Ctrl+U'],
      ['strike', 'Strikethrough text', 'strikethrough', 'Ctrl+Shift+S'],
      ['link', 'Insert link', 'link', 'Ctrl+K', { context: 'With text selected in a Notion page' }],
      ['duplicate-block', 'Duplicate block', 'copy', 'Ctrl+D', { context: 'With one or more blocks selected' }],
      ['move-block-up', 'Move block up', 'arrow-up', 'Ctrl+Shift+Up'],
      ['move-block-down', 'Move block down', 'arrow-down', 'Ctrl+Shift+Down'],
      ['comment', 'Open comment draft', 'message-square-plus', 'Ctrl+Shift+M'],
    ], { source: notionSource, context: 'While editing a Notion page' }),
  ],
  obsidian: [
    ...group('Vault and tabs', [
      ['command-palette', 'Command palette', 'command', 'Ctrl+P', { source: 'https://obsidian.md/help/plugins/command-palette' }],
      ['new-note', 'New note', 'file-plus', 'Ctrl+N', { source: obsidianHotkeys }],
      ['new-tab', 'New tab', 'square-plus', 'Ctrl+T'],
      ['close-tab', 'Close tab', 'x', 'Ctrl+W'],
      ['reopen-tab', 'Reopen closed tab', 'rotate-ccw', 'Ctrl+Shift+T'],
      ['next-tab', 'Next tab', 'chevron-right', 'Ctrl+Tab'],
      ['previous-tab', 'Previous tab', 'chevron-left', 'Ctrl+Shift+Tab'],
    ], { source: obsidianTabs }),
    ...group('Note editor', [
      ['save', 'Save current note', 'save', 'Ctrl+S'],
      ['toggle-reading', 'Toggle reading view', 'book-open', 'Ctrl+E'],
      ['bold', 'Bold text', 'bold', 'Ctrl+B'],
      ['italic', 'Italic text', 'italic', 'Ctrl+I'],
      ['insert-link', 'Insert Markdown link', 'link', 'Ctrl+K'],
      ['toggle-task', 'Toggle checklist state', 'list-checks', 'Ctrl+Enter'],
    ], { source: obsidianHotkeys, context: 'While editing an Obsidian note' }),
  ],
  'notepad-plus': [
    ...group('Files and tabs', [
      ['new-file', 'New document', 'file-plus', 'Ctrl+N'],
      ['open-file', 'Open file', 'folder-open', 'Ctrl+O'],
      ['save', 'Save document', 'save', 'Ctrl+S'],
      ['save-as', 'Save as', 'save-all', 'Ctrl+Alt+S'],
      ['close-tab', 'Close document', 'x', 'Ctrl+W'],
      ['restore-tab', 'Restore closed document', 'rotate-ccw', 'Ctrl+Shift+T'],
      ['next-tab', 'Next document', 'chevron-right', 'Ctrl+PageDown'],
      ['previous-tab', 'Previous document', 'chevron-left', 'Ctrl+PageUp'],
    ], { source: notepadPlus }),
    ...group('Find and edit', [
      ['find-next', 'Next match', 'chevron-down', 'F3'],
      ['find-previous', 'Previous match', 'chevron-up', 'Shift+F3'],
      ['go-to-line', 'Go to line', 'list', 'Ctrl+G'],
      ['duplicate-line', 'Duplicate selection', 'copy', 'Ctrl+D'],
      ['move-line-up', 'Move line up', 'arrow-up', 'Ctrl+Shift+Up'],
      ['move-line-down', 'Move line down', 'arrow-down', 'Ctrl+Shift+Down'],
      ['fold-all', 'Collapse all folds', 'fold-vertical', 'Alt+0'],
      ['unfold-all', 'Expand all folds', 'unfold-vertical', 'Alt+Shift+0'],
    ], { source: notepadPlus }),
  ],
  explorer: [
    ...group('Windows and folders', [
      ['new-window', 'New Explorer window', 'panels-top-left', 'Ctrl+N'],
      ['close-tab', 'Close tab or window', 'x', 'Ctrl+W'],
      ['next-tab', 'Next Explorer tab', 'chevron-right', 'Ctrl+Tab', { minWindowsBuild: 22621 }],
      ['previous-tab', 'Previous Explorer tab', 'chevron-left', 'Ctrl+Shift+Tab', { minWindowsBuild: 22621 }],
      ['back', 'Previous folder', 'arrow-left', 'Alt+Left'],
      ['forward', 'Next folder', 'arrow-right', 'Alt+Right'],
      ['properties', 'Selection properties', 'info', 'Alt+Enter'],
    ]),
    ...group('View and selection', [
      ['preview', 'Toggle Preview pane', 'panel-right', 'Alt+P'],
      ['details', 'Toggle Details pane', 'panel-right', 'Alt+Shift+P'],
      ['next-pane', 'Move to next location', 'arrow-right', 'F6'],
      ['go-to-first', 'First item', 'arrow-up-to-line', 'Home'],
      ['go-to-last', 'Last item', 'arrow-down-to-line', 'End'],
      ['expand-current', 'Expand current folder', 'list-tree', 'Ctrl+Shift+E'],
    ], { context: 'While a File Explorer folder has focus' }),
  ],
  excel: [
    ...group('Workbook navigation', [
      ['go-to', 'Go To dialog', 'navigation', 'F5'],
      ['first-cell', 'Go to A1', 'arrow-up-left', 'Ctrl+Home'],
      ['last-used-cell', 'Last used cell', 'arrow-down-right', 'Ctrl+End'],
      ['data-left', 'Left edge of data', 'arrow-left', 'Ctrl+Left'],
      ['data-right', 'Right edge of data', 'arrow-right', 'Ctrl+Right'],
      ['data-up', 'Top edge of data', 'arrow-up', 'Ctrl+Up'],
      ['data-down', 'Bottom edge of data', 'arrow-down', 'Ctrl+Down'],
      ['next-region', 'Focus next region', 'arrow-right', 'F6'],
    ], { context: 'While an Excel worksheet has focus' }),
    ...group('Data and charts', [
      ['name-manager', 'Name Manager', 'tag', 'Ctrl+F3'],
      ['name-creation', 'Create names', 'tags', 'Ctrl+Shift+F3'],
      ['add-worksheet', 'Insert worksheet', 'table-2', 'Shift+F11'],
      ['embedded-chart', 'Create embedded chart', 'chart-column', 'Alt+F1'],
      ['chart-sheet', 'Create chart sheet', 'chart-column', 'F11'],
      ['cycle-references', 'Cycle cell references', 'repeat', 'F4', { context: 'While editing a cell reference in a formula' }],
      ['recalculate-all', 'Calculate all workbooks', 'calculator', 'F9'],
      ['recalculate-sheet', 'Calculate active sheet', 'calculator', 'Shift+F9'],
    ], { context: 'While an Excel workbook has focus' }),
  ],
  word: [
    ...group('Navigation and review', [
      ['document-start', 'Document start', 'arrow-up-to-line', 'Ctrl+Home'],
      ['document-end', 'Document end', 'arrow-down-to-line', 'Ctrl+End'],
      ['go-to', 'Go To dialog', 'navigation', 'F5'],
      ['ribbon', 'Toggle ribbon', 'panel-top', 'Ctrl+F1'],
      ['next-area', 'Focus next area', 'chevron-right', 'F6'],
      ['previous-area', 'Focus previous area', 'chevron-left', 'Shift+F6'],
      ['thesaurus', 'Thesaurus', 'book-open', 'Shift+F7'],
      ['repeat-action', 'Repeat last edit', 'repeat', 'F4'],
      ['save-as', 'Save as', 'save-all', 'F12'],
    ]),
    ...group('Document formatting', [
      ['paste-special', 'Paste Special', 'clipboard-paste', 'Ctrl+Alt+V'],
      ['page-break', 'Insert page break', 'files', 'Ctrl+Enter'],
      ['line-break', 'Insert line break', 'corner-down-left', 'Shift+Enter'],
      ['move-paragraph-up', 'Move paragraph up', 'arrow-up', 'Alt+Shift+Up'],
      ['move-paragraph-down', 'Move paragraph down', 'arrow-down', 'Alt+Shift+Down'],
    ], { context: 'While editing a Word document' }),
  ],
  powerpoint: [
    ...group('Edit slides', [
      ['duplicate-slide', 'Duplicate slide', 'copy', 'Ctrl+Shift+D'],
      ['duplicate-object', 'Duplicate object', 'copy', 'Ctrl+D'],
      ['group-selection', 'Group objects', 'group', 'Ctrl+G'],
      ['ungroup-selection', 'Ungroup objects', 'ungroup', 'Ctrl+Shift+G'],
      ['previous-slide', 'Previous slide', 'chevron-left', 'PageUp'],
      ['next-slide', 'Next slide', 'chevron-right', 'PageDown'],
      ['next-area', 'Focus next area', 'arrow-right', 'F6'],
      ['previous-area', 'Focus previous area', 'arrow-left', 'Shift+F6'],
      ['save-as', 'Save as', 'save-all', 'F12'],
    ], { context: 'While editing a PowerPoint presentation' }),
    ...group('Slide show', [
      ['show-next', 'Next animation or slide', 'chevron-right', 'Right'],
      ['show-previous', 'Previous animation', 'chevron-left', 'Left'],
      ['black-screen', 'Black screen or resume', 'square', 'B'],
      ['white-screen', 'White screen or resume', 'square', 'W'],
      ['pen', 'Show pen pointer', 'pen-line', 'Ctrl+P'],
      ['arrow', 'Show arrow pointer', 'mouse-pointer-2', 'Ctrl+A'],
      ['end-show', 'End slide show', 'square-x', 'Esc'],
    ], { context: 'While a slide show has focus',
      source: 'https://support.microsoft.com/en-us/accessibility/powerpoint/use-keyboard-shortcuts-to-deliver-powerpoint-presentations' }),
  ],
  libreoffice: [
    ...group('Documents', [
      ['new-document', 'New document', 'file-plus', 'Ctrl+N'],
      ['from-template', 'Open templates', 'files', 'Ctrl+Shift+N'],
      ['close-document', 'Close document', 'x', 'Ctrl+W'],
      ['find', 'Find in document', 'search', 'Ctrl+F'],
      ['find-next', 'Find next match', 'chevron-down', 'Ctrl+G'],
      ['paste-special', 'Paste Special', 'clipboard-paste', 'Ctrl+Shift+V'],
      ['full-screen', 'Toggle full screen', 'maximize', 'Ctrl+Shift+J'],
      ['next-window', 'Focus next area', 'chevron-right', 'F6'],
      ['previous-window', 'Focus previous area', 'chevron-left', 'Shift+F6'],
    ]),
  ],
  'obs-studio': [
    ...group('Source and preview', [
      ['left', 'Nudge source left', 'arrow-left', 'Left'],
      ['right', 'Nudge source right', 'arrow-right', 'Right'],
      ['up', 'Nudge source up', 'arrow-up', 'Up'],
      ['down', 'Nudge source down', 'arrow-down', 'Down'],
      ['stretch', 'Stretch source to screen', 'stretch-horizontal', 'Ctrl+S'],
      ['edit-transform', 'Edit source transform', 'move', 'Ctrl+E'],
      ['undo', 'Undo last edit', 'undo-2', 'Ctrl+Z'],
      ['redo', 'Redo last edit', 'redo-2', 'Ctrl+Shift+Z'],
      ['quit', 'Quit OBS Studio', 'log-out', 'Ctrl+Q'],
    ], { context: 'While the OBS preview and intended source have focus' }),
  ],
};
