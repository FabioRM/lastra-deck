// @ts-check
'use strict';

const { desktopPack: pack, shortcutGroup: group } = require('./shortcut-pack-data');

const media = { editing: false };

module.exports = [
  pack('avidemux', 'Avidemux', ['avidemux.exe', 'avidemux_portable.exe', 'avidemux_qt5.exe', 'avidemux_qt6.exe'],
    'https://www.avidemux.org/admWiki/doku.php?id=using%3Aquickstart', [
      ['open-video', 'Open video', 'folder-open', 'Ctrl+O'],
      ['previous-frame', 'Previous frame', 'step-back', 'Left'],
      ['next-frame', 'Next frame', 'step-forward', 'Right'],
      ['previous-keyframe', 'Previous keyframe', 'skip-back', 'Up'],
      ['next-keyframe', 'Next keyframe', 'skip-forward', 'Down'],
      ['back-one-second', 'Back one second', 'rewind', 'Shift+Left'],
      ['forward-one-second', 'Forward one second', 'fast-forward', 'Shift+Right'],
    ], media),
  pack('fontforge', 'FontForge', ['fontforge.exe'], 'https://fontforge.org/docs/ui/misc/HotKeys.html', [
    ['open-font', 'Open font', 'folder-open', 'Ctrl+O'],
    ['save-font', 'Save source font', 'save', 'Ctrl+S'],
    ['generate-font', 'Generate Fonts dialog', 'file-output', 'Ctrl+Shift+G'],
    ['select-all', 'Select all', 'scan', 'Ctrl+A'],
    ['glyph-info', 'Glyph info', 'info', 'Ctrl+Alt+Shift+I'],
    ['font-info', 'Font info', 'file-text', 'Ctrl+Shift+F'],
  ]),
  pack('texstudio', 'TeXstudio', ['texstudio.exe'], 'https://texstudio-org.github.io/compiling.html', [
    ['build-view', 'Build and view', 'play', 'F5'],
    ['compile', 'Compile', 'hammer', 'F6'],
    ['view', 'View output', 'file-text', 'F7'],
    ['previous-error', 'Previous error', 'chevron-up', 'Ctrl+Shift+Up'],
    ['next-error', 'Next error', 'chevron-down', 'Ctrl+Shift+Down'],
    ['find', 'Find in source', 'search', 'Ctrl+F'],
    ['save', 'Save source file', 'save', 'Ctrl+S'],
  ]),
  pack('texworks', 'TeXworks', ['texworks.exe'], 'https://github.com/TeXworks/texworks/blob/main/src/TeXDocumentWindow.ui', [
    ['new-source', 'New source file', 'file-plus', 'Ctrl+N'],
    ['open-source', 'Open source file', 'folder-open', 'Ctrl+O'],
    ['typeset', 'Typeset document', 'play', 'Ctrl+T'],
    ['find', 'Find in source', 'search', 'Ctrl+F'],
    ['save', 'Save source file', 'save', 'Ctrl+S'],
    ['save-as', 'Save source as', 'save-all', 'Ctrl+Shift+S'],
  ]),
  pack('lyx', 'LyX', ['lyx.exe'], 'https://github.com/cburschka/lyx/blob/master/lib/bind/cua.bind', [
    ['view-output', 'View output', 'file-text', 'Ctrl+R'],
    ['update-output', 'Update output', 'refresh-cw', 'Ctrl+Shift+R'],
    ['open-document', 'Open document', 'folder-open', 'Ctrl+O'],
    ['save-document', 'Save document', 'save', 'Ctrl+S'],
    ['save-as', 'Save document as', 'save-all', 'Ctrl+Shift+S'],
    ['new-document', 'New document', 'file-plus', 'Ctrl+N'],
  ]),
  pack('cherrytree', 'CherryTree', ['cherrytree.exe'], 'https://giuspen.net/cherrytreemanual/', [
    ['save-note', 'Save notebook', 'save', 'Ctrl+S'],
    ['open-notebook', 'Open notebook', 'folder-open', 'Ctrl+O'],
    ['child-node', 'Add child node', 'list-tree', 'Ctrl+Shift+N'],
    ...group('Search the notebook', [
      ['find-page', 'Find in current node', 'search', 'Ctrl+F'],
      ['find-tree', 'Find in all nodes', 'folder-search', 'Ctrl+Shift+F'],
      ['find-next', 'Next search result', 'chevron-down', 'F3'],
    ]),
  ]),
  pack('zim-wiki', 'Zim Desktop Wiki', ['zim.exe', 'zim-desktop-wiki.exe'],
    'https://www.zim-wiki.org/manual/Help/Key_Bindings.html', [
      ['previous-page', 'Previous page in history', 'arrow-left', 'Alt+Left'],
      ['next-page', 'Next page in history', 'arrow-right', 'Alt+Right'],
      ['show-panes', 'Show all side panes', 'panels-top-left', 'Ctrl+F9'],
      ['move-focus', 'Focus editor or tree', 'arrow-left-right', 'Ctrl+Space'],
      ['toggle-task', 'Toggle task completion', 'square-check', 'F12', { context: 'On a checkbox item' }],
    ]),
  pack('jpegview', 'JPEGView', ['jpegview.exe', 'jpegview64.exe'],
    'https://github.com/sylikc/jpegview/blob/master/src/JPEGView/Config/KeyMap.txt.default', [
      ['open-file', 'Open image', 'folder-open', 'Ctrl+O'],
      ['previous-image', 'Previous image', 'chevron-left', 'Left'],
      ['next-image', 'Next image', 'chevron-right', 'Right'],
      ['file-info', 'Show file info', 'info', 'F2'],
      ['fit-image', 'Fit image to screen', 'maximize', 'Enter'],
      ['fullscreen', 'Toggle full screen', 'scan', 'F11'],
      ['rotate-right', 'Rotate image right', 'rotate-cw', 'Down'],
    ], media),
  pack('qview', 'qView', ['qview.exe'], 'https://github.com/jurplel/qView/wiki/Keyboard-Shortcuts', [
    ['open-file', 'Open image', 'folder-open', 'Ctrl+O'],
    ['previous-image', 'Previous image', 'chevron-left', 'Left'],
    ['next-image', 'Next image', 'chevron-right', 'Right'],
    ['first-image', 'First image', 'arrow-left-to-line', 'Home'],
    ['last-image', 'Last image', 'arrow-right-to-line', 'End'],
    ['fullscreen', 'Toggle full screen', 'maximize', 'F11'],
    ['file-info', 'Show file info', 'info', 'I'],
  ], media),
  pack('geogebra-classic', 'GeoGebra Classic', ['geogebra.exe', 'geogebra classic.exe', 'geogebra5.exe'],
    'https://geogebra.github.io/docs/manual/en/Keyboard_Shortcuts/', [
      ['open-file', 'Open construction', 'folder-open', 'Ctrl+O'],
      ['save-file', 'Save construction', 'save', 'Ctrl+S'],
      ['algebra-view', 'Toggle Algebra view', 'panel-left', 'Ctrl+Shift+A'],
      ['cas-view', 'Toggle CAS view', 'calculator', 'Ctrl+Shift+K'],
      ['spreadsheet', 'Toggle spreadsheet', 'table-2', 'Ctrl+Shift+S'],
      ['object-properties', 'Open object properties', 'settings', 'Ctrl+E'],
      ['toggle-object', 'Show or hide objects', 'eye', 'Ctrl+G'],
    ]),
  pack('mathematica', 'Wolfram Mathematica', ['mathematica.exe', 'wolframnb.exe'],
    'https://reference.wolfram.com/language/tutorial/KeyboardShortcutListing.html', [
      ['new-notebook', 'New notebook', 'file-plus', 'Ctrl+N'],
      ['open-notebook', 'Open notebook', 'folder-open', 'Ctrl+O'],
      ['save-notebook', 'Save notebook', 'save', 'Ctrl+S'],
      ...group('Evaluate and edit', [
        ['evaluate', 'Evaluate cells', 'play', 'Shift+Enter', { confirm: true }],
        ['evaluate-selection', 'Evaluate in place', 'calculator', 'Ctrl+Shift+Enter', { confirm: true }],
        ['complete', 'Complete command name', 'list-plus', 'Ctrl+K'],
      ], { context: 'With the intended notebook cell focused' }),
    ]),
  pack('maple', 'Maple', ['maplew.exe'], 'https://www.maplesoft.com/support/help/Maple/view.aspx?path=worksheet/reference/hotwin', [
    ['open-worksheet', 'Open worksheet', 'folder-open', 'Ctrl+O'],
    ['save-worksheet', 'Save worksheet', 'save', 'Ctrl+S'],
    ['find', 'Find and replace', 'search', 'Ctrl+F'],
    ...group('Math and execution groups', [
      ['math-mode', 'Switch text and math', 'calculator', 'F5'],
      ['new-group-before', 'Insert group before', 'arrow-up-to-line', 'Ctrl+K'],
      ['new-group-after', 'Insert group after', 'arrow-down-to-line', 'Ctrl+J'],
      ['evaluate-worksheet', 'Execute worksheet', 'play', 'Ctrl+Shift+Enter', { confirm: true }],
    ], { context: 'With the intended worksheet focused' }),
  ]),
];
