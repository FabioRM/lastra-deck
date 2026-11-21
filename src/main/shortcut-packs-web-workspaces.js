// @ts-check
'use strict';

const { webPack: pack, shortcutGroup: group, usKey } = require('./shortcut-pack-data');

const canvas = { context: 'With the canvas focused outside text editing' };
const editor = { editing: true };
const findings = { context: 'With Log Explorer and the findings panel focused' };
const calendar = { context: 'On the calendar grid with shortcuts enabled' };

module.exports = [
  pack('google-forms', 'Google Forms', ['https://docs.google.com/forms/'], 'https://support.google.com/docs/answer/6026976', [
    ['preview', 'Preview form', 'scan-eye', 'Ctrl+Shift+P'],
    ['settings', 'Form settings', 'settings', 'Ctrl+E'],
    ['previous-field', 'Move cursor up', 'chevron-up', 'Ctrl+K'],
    ['next-field', 'Move cursor down', 'chevron-down', 'Ctrl+J'],
    ['find', 'Find in form', 'search', 'Ctrl+F'],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+/'),
  ], { ...editor, pathScoped: true }),
  pack('microsoft-loop', 'Microsoft Loop', ['https://loop.cloud.microsoft/', 'https://loop.microsoft.com/'],
    'https://support.microsoft.com/en-us/accessibility/loop/keyboard-shortcuts-for-microsoft-loop', [
      ['next-region', 'Next app region', 'panels-top-left', 'Ctrl+F6'],
      ['paste-plain', 'Paste as plain text', 'clipboard-paste', 'Ctrl+Shift+V'],
      ['paragraph-up', 'Previous paragraph', 'arrow-up', 'Ctrl+Up'],
      ['paragraph-down', 'Next paragraph', 'arrow-down', 'Ctrl+Down'],
      ['text-ltr', 'Left-to-right text', 'align-left', 'Ctrl+Alt+Shift+L'],
      ['text-rtl', 'Right-to-left text', 'align-right', 'Ctrl+Alt+Shift+R'],
    ], editor),
  pack('smartsheet', 'Smartsheet', ['https://app.smartsheet.com/', 'https://app.smartsheet.eu/'],
    'https://help.smartsheet.com/articles/522200-keyboard-shortcuts', [
      ['save', 'Save sheet', 'save', 'Ctrl+S'],
      ['search', 'Advanced search', 'search', 'Ctrl+Shift+F'],
      ['duplicate-sheet', 'Duplicate sheet', 'copy', 'Ctrl+Shift+D'],
      ['print', 'Print setup', 'printer', 'Ctrl+P'],
      ...group('Grid cells', [
        ['edit-cell', 'Edit selected cell', 'square-pen', 'F2'],
        ['fill-down', 'Fill down', 'arrow-down', 'Ctrl+D'],
        ['hyperlink', 'Hyperlink dialog', 'link', 'Ctrl+K'],
        ['line-break', 'Insert cell line break', 'corner-down-left', 'Alt+Enter'],
      ], { context: 'With the intended grid cell or selection focused' }),
    ], editor),
  pack('wrike', 'Wrike', ['https://www.wrike.com/workspace.htm', 'https://app.wrike.com/'],
    'https://help.wrike.com/hc/en-us/articles/210322725-Keyboard-Shortcuts', [
      ['new-task', 'New task', 'square-plus', 'Alt+Shift+N'],
      ['search', 'Focus workspace search', 'search', 'Alt+Shift+S'],
      ['recent-tasks', 'Recent tasks', 'history', 'Ctrl+Shift+E'],
      ['task-fullscreen', 'Toggle task full screen', 'maximize', 'Alt+Shift+F'],
      ...group('Table view', [
        ['collapse-all', 'Collapse all items', 'fold-vertical', 'Alt+Shift+Left'],
        ['expand-all', 'Expand all items', 'unfold-vertical', 'Alt+Shift+Right'],
        ['cell-controls', 'Focus cell controls', 'square-mouse-pointer', 'F2'],
      ], { context: 'In Wrike Table view' }),
    ], { ...editor, pathScoped: true }),
  pack('coda', 'Coda', ['https://coda.io/'], 'https://help.coda.io/hc/en-us/articles/39555894316173-Keyboard-shortcuts', [
    ['search', 'Search in Coda', 'search', 'Ctrl+Shift+F'],
    ['previous-page', 'Previous page', 'chevron-up', 'Ctrl+Alt+Up'],
    ['next-page', 'Next page', 'chevron-down', 'Ctrl+Alt+Down'],
    ['word-count', 'Word count', 'list-ordered', 'Ctrl+Shift+C'],
    ['present', 'Present document', 'presentation', 'Ctrl+Shift+P'],
    ['comment', 'Add comment draft', 'message-square-plus', 'Ctrl+Shift+M'],
    ['expand-cell', 'Expand table cell', 'maximize', 'Ctrl+Shift+E'],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+Shift+/'),
  ], editor),
  pack('pitch', 'Pitch', ['https://app.pitch.com/'], 'https://help.pitch.com/en/articles/4287519-navigate-pitch-faster-using-the-quick-menu', [
    ['quick-menu', 'Quick menu', 'command', 'Ctrl+K'],
    ...group('Slide quick menu', [
      ['new-slide', 'New slide', 'file-plus', 'N'],
      ['headline', 'Insert headline', 'heading', 'H'],
      ['text', 'Insert text block', 'type', 'T'],
      ['shapes', 'Shapes submenu', 'shapes', 'S'],
      ['lists', 'Lists submenu', 'list', 'L'],
    ], { context: 'With the quick menu open in a presentation' }),
  ], editor),
  pack('penpot', 'Penpot', ['https://design.penpot.app/'], 'https://help.penpot.app/user-guide/first-steps/shortcuts/', [
    ['board', 'Board tool', 'layout-grid', 'B', canvas],
    ['rectangle', 'Rectangle tool', 'square', 'R', canvas],
    ['ellipse', 'Ellipse tool', 'circle', 'E', canvas],
    ['path', 'Path tool', 'pen-tool', 'P', canvas],
    ['text', 'Text tool', 'type', 'T', canvas],
    ...group('Layers and shapes', [
      ['board-selection', 'Board from selection', 'group', 'Ctrl+Alt+G'],
      ['lock-selected', 'Lock selected layers', 'lock-keyhole', 'Ctrl+Shift+L'],
      ['toggle-visibility', 'Toggle layer visibility', 'eye', 'Ctrl+Shift+H'],
      ['union', 'Union selected shapes', 'combine', 'Ctrl+Alt+U'],
    ], canvas),
  ], editor),
  pack('lucidchart', 'Lucidchart', ['https://lucid.app/lucidchart/'],
    'https://help.lucid.co/hc/en-us/articles/18956546325140-Make-Lucid-documents-more-accessible', [
      ['toggle-panels', 'Toggle canvas panels', 'panels-top-left', 'Ctrl+Shift+F'],
      ['duplicate', 'Duplicate object', 'copy', 'Ctrl+D'],
      ['group', 'Group selection', 'group', 'Ctrl+G'],
      ['ungroup', 'Ungroup selection', 'ungroup', 'Ctrl+Shift+G'],
      ['save-copy', 'Save document as copy', 'save-all', 'Ctrl+Shift+S'],
      usKey('canvas-menu', 'Canvas menu', 'menu', 'Ctrl+/'),
    ], { ...editor, pathScoped: true }),
  pack('excalidraw', 'Excalidraw', ['https://excalidraw.com/'], 'https://plus.excalidraw.com/how-to-start', [
    ['rectangle', 'Rectangle tool', 'square', 'R', canvas],
    ['arrow', 'Arrow tool', 'move-up-right', 'A', canvas],
    ['line', 'Line tool', 'minus', 'L', { ...canvas, source: 'https://plus.excalidraw.com/use-cases/game-design' }],
    ['fit', 'Fit all elements', 'maximize', 'Shift+1', canvas],
    ['find', 'Find text in the scene', 'search', 'Ctrl+F'],
    usKey('palette', 'Command palette', 'command', 'Ctrl+/'),
  ], editor),
  pack('tldraw', 'tldraw', ['https://www.tldraw.com/', 'https://tldraw.com/'], 'https://tldraw.dev/examples/hide-ui', [
    ['draw', 'Draw tool', 'pencil', 'D', canvas],
    ['rectangle', 'Rectangle tool', 'square', 'R', canvas],
    ['select', 'Selection tool', 'mouse-pointer-2', 'V', canvas],
    ['text', 'Text tool', 'type', 'T', canvas],
    ['eraser', 'Eraser tool', 'eraser', 'E', canvas],
  ], editor),
  pack('webflow-designer', 'Webflow Designer', ['https://your-site.design.webflow.com/'],
    'https://help.webflow.com/hc/en-us/articles/33961359609875-Keyboard-shortcuts-in-Webflow', [
      ['quick-find', 'Quick Find', 'search', 'Ctrl+E'],
      ['preview', 'Toggle preview mode', 'scan-eye', 'Ctrl+Shift+P'],
      ['guides', 'Toggle guides', 'ruler', 'Ctrl+Shift+G'],
      ['edges', 'Toggle element edges', 'square-dashed', 'Ctrl+Shift+E'],
      ['xray', 'Toggle X-ray mode', 'scan', 'Ctrl+Shift+X'],
      ['duplicate', 'Duplicate element', 'copy', 'Ctrl+D'],
      usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?'),
    ], { ...editor, tenant: 'design.webflow.com' }),
  pack('datadog', 'Datadog', ['https://app.datadoghq.com/', 'https://app.datadoghq.eu/', 'https://us3.datadoghq.com/', 'https://us5.datadoghq.com/'],
    'https://docs.datadoghq.com/logs/explorer/findings/', [
      ['add-finding', 'Add log finding', 'bookmark-plus', 'Ctrl+S', findings],
      ['select-findings', 'Select all findings', 'list-checks', 'Ctrl+A', findings],
      ['organize-findings', 'Organize by query', 'list-tree', 'Ctrl+O', findings],
      ['undo', 'Undo finding change', 'undo-2', 'Ctrl+Z', findings],
      ['redo', 'Redo finding change', 'redo-2', 'Ctrl+Shift+Z', findings],
    ]),
  pack('basecamp', 'Basecamp', ['https://3.basecamp.com/'], 'https://basecamp.com/keyboard', [
    ['jump', 'Go, jump, or search', 'search', 'Shift+J'],
    ['back-to-project', 'Back to the project', 'arrow-left', 'Shift+G'],
    ['create-item', 'Create item in tool', 'square-plus', 'Shift+M', { context: 'In a project tool' }],
    ['focus-filter', 'Focus quick filter', 'list-filter', 'Shift+F'],
    ['focus-comment', 'Focus comment form', 'message-square', 'Shift+C', { context: 'Inside an item with comments' }],
  ], editor),
  pack('milanote', 'Milanote', ['https://app.milanote.com/'], 'https://help.milanote.com/en/articles/111393-keyboard-shortcuts', [
    ['add-similar', 'Add note, board, column', 'files', 'Ctrl+Enter', { context: 'With an existing note, board or column selected' }],
    ['front', 'Send forward', 'bring-to-front', 'Ctrl+Shift+Up', canvas],
    ['back', 'Send back', 'send-to-back', 'Ctrl+Shift+Down', canvas],
    ['deselect', 'Deselect or stop editing', 'square-x', 'Esc'],
    ['link', 'Add text link', 'link', 'Ctrl+K', { context: 'With text selected in a note' }],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:/'),
  ], editor),
  pack('balsamiq', 'Balsamiq Cloud', ['https://balsamiq.cloud/'], 'https://balsamiq.com/support/creating-and-editing/shortcuts/', [
    ['group', 'Group selected elements', 'group', 'Ctrl+G', canvas],
    ['deselect', 'Deselect all elements', 'square-x', 'Ctrl+Shift+A', canvas],
    ['bring-to-front', 'Bring selection to front', 'bring-to-front', 'Ctrl+Shift+Up', canvas],
    ['send-to-back', 'Send selection to back', 'send-to-back', 'Ctrl+Shift+Down', canvas],
    ['fit-content', 'Auto-size selection', 'maximize', 'Ctrl+Alt+0', canvas],
    ['paste-in-place', 'Paste in place', 'clipboard-paste', 'Ctrl+Shift+V', canvas],
  ], editor),
  pack('proton-calendar', 'Proton Calendar', ['https://calendar.proton.me/'], 'https://proton.me/support/proton-calendar-keyboard-shortcuts', [
    ['quick-actions', 'Quick actions menu', 'command', 'Ctrl+K'],
    ['new-event', 'New event draft', 'calendar-plus', 'N', calendar],
    ['today', 'Jump to today', 'calendar-days', 'T', calendar],
    ['previous-period', 'Previous period', 'chevron-left', 'Left', calendar],
    ['next-period', 'Next period', 'chevron-right', 'Right', calendar],
    ['day-view', 'Day view', 'calendar', '1', calendar],
    ['week-view', 'Week view', 'calendar-range', '2', calendar],
    ['month-view', 'Month view', 'calendar-days', '3', calendar],
    usKey('search', 'Search events', 'search', 'char:/'),
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'char:?'),
  ]),
];
