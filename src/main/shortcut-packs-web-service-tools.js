// @ts-check
'use strict';

const { webPack: pack, shortcutGroup: group, usKey } = require('./shortcut-pack-data');

const editor = { editing: true };
const canvas = { context: 'With the canvas focused outside text entry' };
const note = { context: 'With the intended note or text selection focused' };
const player = { context: 'With the Frame.io V4 viewer focused outside the comment editor' };

module.exports = [
  pack('rive', 'Rive', ['https://editor.rive.app/'], 'https://rive.app/docs/editor/keyboard-shortcuts', [
    ['select', 'Select tool', 'mouse-pointer-2', 'V', canvas],
    ['translate', 'Translate tool', 'move', 'Q', canvas],
    ['rotate', 'Rotate tool', 'rotate-cw', 'W', canvas],
    ['scale', 'Scale tool', 'scaling', 'E', canvas],
    ...group('Draw tools', [
      ['rectangle', 'Rectangle tool', 'square', 'R'],
      ['ellipse', 'Ellipse tool', 'circle', 'O'],
      ['pen', 'Pen tool', 'pen-tool', 'P'],
      ['text', 'Text tool', 'type', 'T'],
    ], canvas),
  ], editor),
  pack('spline', 'Spline', ['https://app.spline.design/'], 'https://docs.spline.design/basics/keyboard-shortcuts', [
    ['open', 'Open or import', 'folder-open', 'Ctrl+O'],
    ['save-local', 'Save file locally', 'download', 'Ctrl+Shift+S'],
    ['duplicate', 'Duplicate object', 'copy', 'Ctrl+D', canvas],
    ['paste-in-place', 'Paste in place', 'clipboard-paste', 'Ctrl+Shift+V', canvas],
    ['group', 'Group selection', 'group', 'Ctrl+G', canvas],
    ['fullscreen', 'Toggle full screen', 'maximize', 'Ctrl+Shift+F'],
  ], editor),
  pack('frame-io', 'Frame.io V4', ['https://next.frame.io/'], 'https://help.frame.io/en/articles/9105337-keyboard-shortcuts', [
    ['viewer-panel', 'Focus viewer panel', 'panel-top', 'Shift+3'],
    ['details-panel', 'Focus details panel', 'panel-right', 'Shift+4'],
    ['play-pause', 'Play or pause', 'circle-play', 'K', player],
    ['rewind', 'Play backward', 'rewind', 'J', player],
    ['fast-forward', 'Play forward', 'fast-forward', 'L', player],
    ...group('Frames and ranges', [
      ['previous-frame', 'Previous frame', 'step-back', 'Left'],
      ['next-frame', 'Next frame', 'step-forward', 'Right'],
      ['mark-in', 'Mark in point', 'brackets', 'I'],
      ['mark-out', 'Mark out point', 'brackets', 'O'],
    ], player),
  ]),
  pack('microsoft-whiteboard', 'Microsoft Whiteboard', ['https://whiteboard.cloud.microsoft/', 'https://whiteboard.microsoft.com/'],
    'https://support.microsoft.com/en-us/whiteboard/whiteboard-keyboard-shortcuts', [
      ['select', 'Select objects', 'mouse-pointer-2', 'Alt+S', canvas],
      ['pen', 'Open pen toolbar', 'pen-line', 'Alt+W', canvas],
      ['eraser', 'Eraser tool', 'eraser', 'Alt+X', canvas],
      ['lasso', 'Lasso tool', 'lasso', 'Alt+Q', canvas],
      ['highlighter', 'Highlighter tool', 'highlighter', 'Alt+H', canvas],
      ['laser', 'Laser pointer', 'pointer', 'Alt+L', canvas],
    ], editor),
  pack('microsoft-planner', 'Microsoft Planner', ['https://planner.cloud.microsoft/', 'https://planner.microsoft.com/'],
    'https://support.microsoft.com/en-us/planner/format-text-within-task-notes', [
      ['bold', 'Bold', 'bold', 'Ctrl+B', note],
      ['italic', 'Italic', 'italic', 'Ctrl+I', note],
      ['underline', 'Underline', 'underline', 'Ctrl+U', note],
      ['strikethrough', 'Strikethrough', 'strikethrough', 'Ctrl+Shift+X', note],
      ['code', 'Code formatting', 'code', 'Ctrl+Shift+M', note],
      ['bullets', 'Bulleted list', 'list', 'Ctrl+Shift+8', note],
      ['numbered-list', 'Numbered list', 'list-ordered', 'Ctrl+Shift+7', note],
      ['indent', 'Indent list item', 'indent-increase', 'Alt+Shift+Right', note],
      ['outdent', 'Outdent list item', 'indent-decrease', 'Alt+Shift+Left', note],
    ], editor),
  pack('cryptpad', 'CryptPad', ['https://cryptpad.fr/'], 'https://docs.cryptpad.org/en/user_guide/keyboard_shortcuts.html', [
    ['new-document', 'New document', 'file-plus', 'Ctrl+E'],
    ['drive-open', 'Open drive item', 'folder-open', 'Enter', { context: 'With a drive file or folder focused' }],
    ['next-control', 'Next control', 'arrow-right', 'Tab'],
    ['previous-control', 'Previous control', 'arrow-left', 'Shift+Tab'],
    ['close-menu', 'Close menu', 'x', 'Esc'],
  ], editor),
  pack('amplenote', 'Amplenote', ['https://www.amplenote.com/'], 'https://www.amplenote.com/help/keyboard_shortcuts_and_markdown_syntax_examples', [
    ['quick-open', 'Quick Open', 'search', 'Ctrl+O'],
    ['add-link', 'Add link or footnote', 'link', 'Ctrl+K', note],
    ['underline', 'Underline', 'underline', 'Ctrl+U', note],
    ['italic', 'Italic', 'italic', 'Ctrl+I', note],
    ['paste-plain', 'Paste as plain text', 'clipboard-paste', 'Ctrl+Shift+V', note],
  ], editor),
  pack('retool-classic', 'Retool Classic Apps', ['https://your-team.retool.com/'],
    'https://docs.retool.com/classic-apps/reference/keyboard-shortcuts', [
      ['palette', 'Command palette', 'command', 'Ctrl+K'],
      ['duplicate', 'Duplicate component', 'copy', 'Ctrl+D', canvas],
      ['fit-container', 'Fit container to content', 'scan', 'Ctrl+Alt+Shift+R', canvas],
      ['inspector-search', 'Search inspector', 'search', 'Ctrl+Shift+K'],
      ['pin-sidebar', 'Pin or unpin sidebar', 'panel-left', 'Ctrl+P'],
      ['save', 'Save app', 'save', 'Ctrl+S'],
    ], { ...editor, tenant: 'retool.com' }),
  pack('motion', 'Motion', ['https://app.usemotion.com/'],
    'https://www.usemotion.com/help/getting-started/navigation-basics/sidebar-navigation-guide/keyboard-and-accessibility', [
      ['search', 'Search Motion', 'search', 'Ctrl+K'],
      usKey('ai-chat', 'Open AI chat', 'messages-square', 'Ctrl+/'),
      ['developer-panel', 'Open developer panel', 'panel-right', 'Ctrl+Period', { usLayout: true, notation: 'Ctrl+.' }],
    ], editor),
  pack('openstreetmap-id', 'OpenStreetMap iD', ['https://www.openstreetmap.org/edit'], 'https://github.com/openstreetmap/iD/blob/develop/data/shortcuts.json', [
    ['point', 'Point drawing mode', 'map-pin', '1', canvas],
    ['line', 'Line drawing mode', 'minus', '2', canvas],
    ['area', 'Area drawing mode', 'pentagon', '3', canvas],
    ['search', 'Find map features', 'search', 'Ctrl+F'],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?'),
  ], { ...editor, pathScoped: true }),
];
