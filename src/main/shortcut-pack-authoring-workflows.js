// @ts-check
'use strict';

const { shortcutGroup: group } = require('./shortcut-pack-data');

module.exports = {
  kdenlive: [
    ...group('Playback and timeline', [
      ['rewind', 'Rewind', 'rewind', 'J'],
      ['pause', 'Pause playback', 'pause', 'K'],
      ['forward', 'Play forward', 'fast-forward', 'L'],
      ['previous-frame', 'Previous frame', 'step-back', 'Left'],
      ['next-frame', 'Next frame', 'step-forward', 'Right'],
      ['previous-snap', 'Previous snap point', 'chevron-left', 'Alt+Left'],
      ['next-snap', 'Next snap point', 'chevron-right', 'Alt+Right'],
    ], { context: 'With the project monitor or timeline focused as appropriate' }),
    ...group('Zones and project guides', [
      ['set-in', 'Mark zone start', 'brackets', 'I'],
      ['set-out', 'Mark zone end', 'brackets', 'O'],
      ['play-zone', 'Play zone', 'play', 'Ctrl+Space'],
      ['loop-zone', 'Loop zone', 'repeat', 'Ctrl+Shift+Space'],
      ['previous-guide', 'Previous guide', 'arrow-left', 'Ctrl+Left'],
      ['next-guide', 'Next guide', 'arrow-right', 'Ctrl+Right'],
    ], { context: 'With the timeline or clip monitor focused as appropriate' }),
  ],
  audacity: [
    ...group('Import and export', [
      ['open-audio', 'Open audio or project', 'folder-open', 'Ctrl+O'],
      ['import-audio', 'Import audio', 'file-input', 'Ctrl+Shift+I'],
      ['export-audio', 'Export audio dialog', 'file-output', 'Ctrl+Shift+E'],
      ['close-project', 'Close project window', 'x', 'Ctrl+W', { confirm: true }],
    ]),
    ...group('Edit clips and selection', [
      ['split', 'Split at cursor', 'scissors', 'Ctrl+I'],
      ['join', 'Join clips', 'combine', 'Ctrl+J'],
      ['trim', 'Trim to selection', 'crop', 'Ctrl+T', { confirm: true }],
      ['silence', 'Silence selection', 'volume-x', 'Ctrl+L', { confirm: true }],
      ['add-label', 'Label selection', 'tag', 'Ctrl+B'],
      ['undo', 'Undo last edit', 'undo-2', 'Ctrl+Z'],
      ['redo', 'Redo last edit', 'redo-2', 'Ctrl+Y'],
    ], { context: 'With the intended audio track or selection active' }),
  ],
  inkscape: [
    ...group('Drawing tools', [
      ['select-tool', 'Selection tool', 'mouse-pointer-2', 'S'],
      ['node-tool', 'Node tool', 'workflow', 'N'],
      ['rectangle-tool', 'Rectangle tool', 'square', 'R'],
      ['ellipse-tool', 'Ellipse tool', 'circle', 'E'],
      ['bezier-tool', 'Bezier pen', 'pen-tool', 'B'],
      ['text-tool', 'Text tool', 'type', 'T'],
    ], { context: 'With canvas focus outside text editing' }),
    ...group('View and object panels', [
      ['zoom-selection', 'Zoom to selection', 'scan', '3'],
      ['zoom-drawing', 'Zoom to drawing', 'maximize', '4'],
      ['zoom-page', 'Zoom to page', 'file', '5'],
      ['fill-stroke', 'Fill and Stroke panel', 'paintbrush', 'Ctrl+Shift+F'],
      ['transform', 'Transform panel', 'move', 'Ctrl+Shift+M'],
      ['xml-editor', 'XML Editor panel', 'code-xml', 'Ctrl+Shift+X'],
    ]),
  ],
  krita: [
    ...group('Canvas and brush', [
      ['brush', 'Freehand brush tool', 'paintbrush', 'B'],
      ['eraser', 'Toggle eraser mode', 'eraser', 'E'],
      ['mirror-canvas', 'Mirror canvas view', 'flip-horizontal-2', 'M'],
      ['canvas-only', 'Toggle canvas-only mode', 'maximize', 'Tab'],
      ['rotate-left', 'Rotate canvas left', 'rotate-ccw', '4'],
      ['reset-rotation', 'Reset canvas rotation', 'scan', '5'],
      ['rotate-right', 'Rotate canvas right', 'rotate-cw', '6'],
    ], { context: 'With canvas focus and the default Krita keymap',
      source: 'https://docs.krita.org/en/reference_manual/preferences/canvas_input_settings.html' }),
  ],
  godot: [
    ...group('Editor and running project', [
      ['command-palette', 'Command palette', 'command', 'Ctrl+Shift+P'],
      ['pause-scene', 'Pause running scene', 'pause', 'F7'],
      ['toggle-bottom-panel', 'Toggle last bottom panel', 'panel-bottom', 'Ctrl+J'],
      ['output-panel', 'Toggle Output panel', 'square-terminal', 'Alt+O'],
      ['debugger-panel', 'Toggle Debugger panel', 'bug', 'Alt+D'],
      ['fullscreen', 'Toggle full screen', 'maximize', 'Shift+F11'],
    ], { source: 'https://docs.godotengine.org/en/4.6/tutorials/editor/default_key_mapping.html' }),
    ...group('Scene tree', [
      ['add-child', 'Add child node', 'list-plus', 'Ctrl+A'],
      ['duplicate-node', 'Duplicate node', 'copy', 'Ctrl+D'],
      ['copy-path', 'Copy node path', 'copy', 'Ctrl+Shift+C'],
      ['batch-rename', 'Batch rename nodes', 'pencil', 'Ctrl+F2'],
      ['move-node-up', 'Move node up', 'arrow-up', 'Ctrl+Up'],
      ['move-node-down', 'Move node down', 'arrow-down', 'Ctrl+Down'],
    ], { context: 'With the scene tree focused', source: 'https://docs.godotengine.org/en/4.6/tutorials/editor/default_key_mapping.html' }),
  ],
  sumatrapdf: [
    ...group('Find, mark and print', [
      ['command-palette', 'Command palette', 'command', 'Ctrl+K'],
      ['find-next', 'Next match', 'search', 'F3'],
      ['find-previous', 'Previous match', 'search', 'Shift+F3'],
      ['favorite-page', 'Add page to favorites', 'bookmark-plus', 'Ctrl+B'],
      ['print', 'Print document', 'printer', 'Ctrl+P'],
      ['save-as', 'Save a copy', 'save-all', 'Ctrl+S'],
    ]),
    ...group('Documents and view', [
      ['previous-tab', 'Previous document tab', 'chevron-left', 'Ctrl+PageUp'],
      ['next-tab', 'Next document tab', 'chevron-right', 'Ctrl+PageDown'],
      ['new-window', 'Open in new window', 'panels-top-left', 'Ctrl+Shift+N'],
      ['toggle-menu', 'Show or hide menu', 'menu', 'F9'],
      ['cycle-zoom', 'Cycle zoom modes', 'scan', 'Z'],
    ]),
  ],
  calibre: [
    ...group('Library search and metadata', [
      ['search', 'Focus library search', 'search', 'Ctrl+F'],
      ['advanced-search', 'Advanced search dialog', 'list-filter', 'Ctrl+Shift+F'],
      ['next-virtual-library', 'Next virtual library', 'chevron-right', 'Ctrl+Tab'],
      ['previous-virtual-library', 'Previous virtual library', 'chevron-left', 'Ctrl+Shift+Tab'],
      ['download-metadata', 'Download metadata', 'download', 'Ctrl+D'],
      ['quick-view', 'Quick view for selection', 'scan-eye', 'Q'],
      ['edit-toc', 'Edit table of contents', 'list-tree', 'K'],
    ], { context: 'With the main calibre library focused' }),
  ],
  'double-commander': [
    ...group('Files and folder tabs', [
      ['rename', 'Rename selected file', 'pencil', 'F2'],
      ['edit', 'Edit selected file', 'file-pen-line', 'F4'],
      ['new-file', 'Create and edit file', 'file-plus', 'Shift+F4'],
      ['new-tab', 'New folder tab', 'square-plus', 'Ctrl+T'],
      ['close-tab', 'Close folder tab', 'x', 'Ctrl+W'],
      ['previous-tab', 'Previous folder tab', 'chevron-left', 'Ctrl+Shift+Tab'],
      ['next-tab', 'Next folder tab', 'chevron-right', 'Ctrl+Tab'],
    ], { source: 'https://doublecmd.github.io/doc/en/shortcuts.html' }),
  ],
};
