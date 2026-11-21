'use strict';

const { shortcutGroup: group } = require('./shortcut-pack-data');
const communication = require('./shortcut-pack-communication');

const shared = {
  dbeaver: [
    ...group('SQL editor', [
      ['new-script', 'New SQL script', 'file-plus', 'Ctrl+char:]'],
      ['open-script', 'Open SQL script', 'folder-open', 'F3'],
      ['toggle-line-comment', 'Toggle line comment', 'message-square', 'Ctrl+char:slash'],
      ['show-results', 'Toggle results', 'table', 'Ctrl+T'],
      ['maximize-results', 'Maximize results panel', 'maximize', 'Ctrl+Shift+T'],
      ['execution-plan', 'Explain execution plan', 'list-tree', 'Ctrl+Shift+E'],
      ['format', 'Format SQL', 'align-left', 'Ctrl+Shift+F'],
    ], { context: 'SQL editor' }),
    ['new-connection', 'Connect to a database', 'database', 'Ctrl+Shift+N'],
    ['search-workspace', 'Search workspace', 'search', 'Ctrl+H'],
    ['active-schema', 'Select active schema', 'list-tree', 'Ctrl+0'],
    ['select-connection', 'Select editor connection', 'plug', 'Ctrl+9'],
    ['close-editor', 'Close active editor', 'x', 'Ctrl+F4'],
    ['save-all', 'Save all open files', 'save-all', 'Ctrl+Shift+S'],
  ],
  keepassxc: [
    ['save-as', 'Save database as', 'save-all', 'Ctrl+Shift+S'],
    ['lock-all', 'Lock all databases', 'lock', 'Ctrl+Shift+L'],
    ['database-reports', 'Database reports', 'clipboard-list', 'Ctrl+Shift+R'],
    ['copy-username', 'Copy username', 'user', 'Ctrl+B'],
    ['copy-url', 'Copy entry URL', 'link', 'Ctrl+U'],
    ['open-url', 'Open entry URL', 'external-link', 'Ctrl+Shift+U'],
    ['clone-entry', 'Clone entry', 'copy-plus', 'Ctrl+D'],
    ['next-database', 'Next database tab', 'chevron-right', 'Ctrl+Tab'],
    ['previous-database', 'Previous database tab', 'chevron-left', 'Ctrl+Shift+Tab'],
    ['preferences', 'Preferences', 'settings', 'Ctrl+comma'],
  ],
  filezilla: [
    ['search-remote', 'Search remote files', 'search', 'F3'],
    ['quick-search', 'Quick search in pane', 'text-search', 'Ctrl+F'],
    ['rename', 'Rename file', 'pencil', 'F2'],
    ['refresh', 'Refresh file lists', 'refresh-cw', 'F5'],
    ['new-directory', 'Create directory', 'folder-plus', 'Ctrl+Shift+N'],
    ['comparison', 'Compare directories', 'columns-2', 'Ctrl+O'],
    ['synchronized', 'Sync browsing', 'link', 'Ctrl+Y'],
    ['filters', 'Directory filters', 'list-filter', 'Ctrl+I'],
    ['bookmarks', 'Manage bookmarks', 'bookmark', 'Ctrl+Shift+B'],
    ['add-bookmark', 'Add bookmark', 'bookmark-plus', 'Ctrl+B'],
    ['editing-files', 'View files being edited', 'file-pen-line', 'Ctrl+E'],
    ['parent-directory', 'Go to parent folder', 'folder-up', 'Alt+Up', { context: 'File list' }],
    ['new-tab', 'New connection tab', 'square-plus', 'Ctrl+T'],
    ['close-tab', 'Close connection tab', 'x', 'Ctrl+W'],
  ],
  qgis: [
    ['zoom-full', 'Zoom to full map extent', 'maximize', 'Ctrl+Shift+F'],
    ['measure-area', 'Measure area', 'ruler', 'Ctrl+Shift+J'],
    ['hide-all-layers', 'Hide all layers', 'layers', 'Ctrl+Shift+H'],
    ['spatial-bookmarks', 'Show spatial bookmarks', 'bookmark', 'Ctrl+Shift+B'],
    ['visible-attributes', 'Visible feature table', 'table', 'Ctrl+F6'],
    ['data-source', 'Data Source Manager', 'database', 'Ctrl+L'],
    ['map-only', 'Toggle map only', 'map', 'Ctrl+Shift+Tab'],
    ['attributes', 'Open attribute table', 'table', 'F6'],
    ['selected-attributes', 'Selected feature table', 'table', 'Shift+F6'],
    ['refresh', 'Refresh map', 'refresh-cw', 'F5'],
  ],
  shotcut: [
    ['export-video', 'Export video', 'file-output', 'Ctrl+E'],
    ['proxy', 'Toggle proxy editing', 'files', 'F4'],
    ...group('Timeline', [
      ['split', 'Split at playhead', 'scissors', 'S'],
      ['split-all', 'Split all tracks', 'scissors', 'Shift+S'],
      ['add-audio-track', 'Add audio track', 'audio-lines', 'Ctrl+U'],
      ['add-video-track', 'Add video track', 'video', 'Ctrl+I'],
      ['add-marker', 'Add or edit marker', 'bookmark-plus', 'M'],
      ['snapping', 'Toggle snapping', 'magnet', 'Ctrl+P'],
      ['ripple', 'Toggle ripple editing', 'move-horizontal', 'Ctrl+R'],
      ['center-playhead', 'Center playhead', 'scan', 'Ctrl+Shift+P'],
      ['timeline-fit', 'Fit timeline', 'maximize', '0'],
    ], { context: 'Timeline' }),
    ['previous-edit', 'Seek previous edit', 'skip-back', 'Alt+Left'],
    ['next-edit', 'Seek next edit', 'skip-forward', 'Alt+Right'],
  ],
  'sublime-text': [
    ['palette', 'Command palette', 'command', 'Ctrl+Shift+P', { source: 'https://www.sublimetext.com/docs/command_palette.html' }],
    ...group('Symbols', [
      ['project-symbol', 'Go to symbol in project', 'search-code', 'Ctrl+Shift+R'],
      ['definition', 'Go to definition', 'signpost', 'F12'],
      ['reference', 'Go to reference', 'link', 'Shift+F12'],
    ], { source: 'https://www.sublimetext.com/docs/indexing.html' }),
    ...group('Multiple selections', [
      ['select-next', 'Select next match', 'scan-text', 'Ctrl+D'],
      ['split-selection', 'Split into lines', 'text-select', 'Ctrl+Shift+L'],
    ], { source: 'https://www.sublimetext.com/docs/multiple_selection_with_the_keyboard.html' }),
  ],
  wireshark: [
    ['next-conversation-packet', 'Next conversation packet', 'chevron-down', 'Ctrl+period'],
    ['previous-conversation-packet', 'Prev conversation packet', 'chevron-up', 'Ctrl+comma'],
    ['collapse-details', 'Collapse packet details', 'list-tree', 'Ctrl+Left', { context: 'Packet details pane' }],
    ...group('Capture', [
      ['capture-options', 'Capture options', 'settings', 'Ctrl+K'],
      ['capture-toggle', 'Start or stop capture', 'circle-dot', 'Ctrl+E'],
      ['capture-restart', 'Restart capture', 'rotate-cw', 'Ctrl+R'],
    ], { source: 'https://www.wireshark.org/docs/wsug_html_chunked/ChUseCaptureMenuSection.html' }),
  ],
};

const windowsWorkflows = {
  ...shared,
  'autodesk-fusion': [
    ['new', 'New design', 'file-plus', 'Ctrl+N'],
    ['recompute', 'Compute all', 'refresh-cw', 'Ctrl+B'],
    ['cycle-tabs', 'Cycle document tabs', 'panels-top-left', 'Ctrl+Tab'],
    ['redo', 'Redo', 'redo-2', 'Ctrl+Y'],
    ...group('Modeling', [
      ['extrude', 'Extrude', 'box', 'E'], ['hole', 'Hole', 'circle-dot', 'H'],
      ['press-pull', 'Press Pull', 'move-vertical', 'Q'], ['fillet', 'Fillet', 'corner-up-right', 'F'],
      ['move', 'Move', 'move', 'M'], ['visibility', 'Toggle visibility', 'eye', 'V'],
      ['appearance', 'Appearance', 'palette', 'A'], ['joint', 'Joint', 'link', 'J'],
      ['measure', 'Measure', 'ruler', 'I'],
    ], { context: 'Design workspace' }),
    ...group('Sketch', [
      ['line', 'Draw line', 'minus', 'L'], ['rectangle', 'Two-point rectangle', 'square', 'R'],
      ['circle', 'Center diameter circle', 'circle', 'C'], ['trim', 'Trim', 'scissors', 'T'],
      ['offset', 'Offset', 'copy-plus', 'O'], ['project', 'Project geometry', 'scan', 'P'],
      ['construction', 'Construction geometry', 'pen-tool', 'X'],
      ['dimension', 'Sketch dimension', 'ruler', 'D'],
    ], { context: 'Editing a sketch' }),
  ],
};

const linuxWorkflows = Object.fromEntries(Object.entries({
  ...shared,
  telegram: communication.telegram,
  signal: communication.signal.filter(([id]) => id !== 'shortcuts'),
  'libreoffice-calc': [
    ['paste-special', 'Paste special', 'clipboard-list', 'Ctrl+Shift+V'],
    ['function-wizard', 'Function wizard', 'function-square', 'Ctrl+F2'],
    ['first-cell', 'Go to first cell', 'arrow-up-to-line', 'Ctrl+Home'],
    ['last-cell', 'Go to last used cell', 'arrow-down-to-line', 'Ctrl+End'],
    ['select-column', 'Select column', 'columns-2', 'Ctrl+Space'],
    ['select-row', 'Select row', 'rows-2', 'Shift+Space'],
    ['recalculate', 'Recalculate formulas', 'refresh-cw', 'F9'],
  ],
}).map(([id, keys]) => [`linux-${id}`, keys]));

module.exports = { linuxWorkflows, windowsWorkflows };
