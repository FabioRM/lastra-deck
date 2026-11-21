'use strict';

const { shortcutGroup } = require('./shortcut-pack-data');

const pack = (id, name, appIds, source, keys, editing = false) => ({ id: `linux-${id}`, name, appIds, source, keys, editing });
const clipboard = [
  ['copy', 'Copy terminal selection', 'copy', 'Ctrl+Shift+C'], ['paste', 'Paste into terminal', 'clipboard', 'Ctrl+Shift+V'],
];
const kicadView = [
  ['save', 'Save document', 'save', 'Ctrl+S'], ['fit', 'Fit drawing', 'maximize', 'Home'],
  ['zoom-in', 'Zoom in', 'zoom-in', 'F1'], ['zoom-out', 'Zoom out', 'zoom-out', 'F2'],
  ['redraw', 'Redraw view', 'refresh-cw', 'F3'], ['center', 'Center on cursor', 'crosshair', 'F4'],
  ['undo', 'Undo', 'undo-2', 'Ctrl+Z'], ['redo', 'Redo', 'redo-2', 'Ctrl+Y'],
];

module.exports = [
  pack('kitty', 'kitty', ['kitty', 'net.kovidgoyal.kitty'], 'https://sw.kovidgoyal.net/kitty/overview/#keyboard-controls', [
    ...clipboard, ['new-tab', 'New tab', 'square-plus', 'Ctrl+Shift+T'], ['close-tab', 'Close current tab', 'x', 'Ctrl+Shift+Q'],
    ['next-tab', 'Next tab', 'chevron-right', 'Ctrl+Shift+Right'], ['previous-tab', 'Previous tab', 'chevron-left', 'Ctrl+Shift+Left'],
    ['scrollback', 'Browse scrollback', 'terminal', 'Ctrl+Shift+H'], ['scroll-up', 'Scroll one line up', 'arrow-up', 'Ctrl+Shift+Up'],
    ['scroll-down', 'Scroll one line down', 'arrow-down', 'Ctrl+Shift+Down'],
    ['new-pane', 'New terminal pane', 'panels-top-left', 'Ctrl+Shift+Enter'], ['next-pane', 'Next pane', 'columns-2', 'Ctrl+Shift+bracketright'],
  ]),
  pack('gwenview', 'Gwenview', ['gwenview', 'org.kde.gwenview'], 'https://docs.kde.org/stable_kf6/en/gwenview/gwenview/gwenview.pdf', [
    ['open', 'Open image', 'folder-open', 'Ctrl+O'], ['save', 'Save image', 'save', 'Ctrl+S'], ['save-as', 'Save as', 'save-all', 'Ctrl+Shift+S'],
    ['next', 'Next image', 'chevron-right', 'Space'], ['previous', 'Previous image', 'chevron-left', 'Backspace'],
    ['browse', 'Browse mode', 'images', 'Ctrl+1'], ['view', 'View mode', 'image', 'Ctrl+2'],
    ['fullscreen', 'Toggle full screen', 'maximize', 'Ctrl+Shift+F'], ['fit', 'Fit image to window', 'scaling', 'F'],
    ['actual-size', 'Actual size', 'scan-eye', 'Ctrl+0'],
  ]),
  pack('kicad-pcb', 'KiCad PCB Editor', ['pcbnew', 'kicad-pcbnew', 'org.kicad.kicad.pcbnew'], 'https://docs.kicad.org/9.0/en/pcbnew/pcbnew.html#hotkeys', [
    ...kicadView, ['3d-viewer', 'Open 3D viewer', 'box', 'Alt+3'], ['footprint', 'Place footprint', 'component', 'A'],
    ...shortcutGroup('Board editor', [
      ['route', 'Route track', 'route', 'X'], ['properties', 'Edit item properties', 'sliders-horizontal', 'E'],
      ['move', 'Move item', 'move', 'M'], ['rotate', 'Rotate item', 'rotate-cw', 'R'], ['flip', 'Flip to other side', 'flip-horizontal', 'F'],
    ], { context: 'PCB canvas' }),
  ], true),
  pack('kicad-schematic', 'KiCad Schematic Editor', ['eeschema', 'kicad-eeschema', 'org.kicad.kicad.eeschema'],
    'https://docs.kicad.org/9.0/en/eeschema/eeschema.html#hotkeys', [
      ...kicadView, ['add-symbol', 'Place symbol', 'component', 'A'], ['power', 'Place power symbol', 'zap', 'P'],
      ['wire', 'Draw wire', 'cable', 'W'], ['bus', 'Draw bus', 'route', 'B'], ['label', 'Place net label', 'tag', 'L'],
      ['no-connect', 'Place no-connect marker', 'x', 'Q'], ['properties', 'Edit item properties', 'sliders-horizontal', 'E'],
      ['rotate', 'Rotate item', 'rotate-cw', 'R'], ['open-pcb', 'Open PCB editor', 'external-link', 'F8'],
    ], true),
  pack('anki', 'Anki', ['anki', 'anki-bin', 'net.ankiweb.anki'], 'https://docs.ankiweb.net/studying.html', [
    ['decks', 'Open decks', 'layers', 'D'], ['add', 'Add note', 'file-plus', 'A'], ['browse', 'Browse cards', 'search', 'B'],
    ['stats', 'Review statistics', 'chart-column', 'T'],
    ...shortcutGroup('Review cards', [
      ['answer', 'Show answer / rate Good', 'scan-eye', 'Space'], ['again', 'Rate Again', 'rotate-ccw', '1'],
      ['hard', 'Rate Hard', 'chevron-down', '2'], ['good', 'Rate Good', 'check', '3'], ['easy', 'Rate Easy', 'zap', '4'],
      ['undo', 'Undo review', 'undo-2', 'Ctrl+Z'],
    ], { context: 'Review screen with answer displayed for numeric ratings' }),
  ]),
  pack('zotero', 'Zotero', ['zotero', 'org.zotero.zotero'], 'https://www.zotero.org/support/kb/keyboard_shortcuts', [
    ['quick-search', 'Quick search', 'search', 'Ctrl+F'], ['focus-library', 'Focus libraries', 'library', 'Ctrl+Shift+L'],
    ['new-item', 'New item', 'file-plus', 'Ctrl+Shift+N'], ['new-note', 'New note', 'notebook', 'Ctrl+Shift+O'],
    ['import', 'Import references', 'file-input', 'Ctrl+Shift+I'], ['tags', 'Toggle tag selector', 'tags', 'Ctrl+Shift+T'],
    ['quick-copy', 'Quick copy citations', 'copy', 'Ctrl+Shift+A'], ['quick-copy-bibliography', 'Quick copy bibliography', 'book-copy', 'Ctrl+Shift+C'],
    ['next-tab', 'Next tab', 'chevron-right', 'Ctrl+Tab'], ['previous-tab', 'Previous tab', 'chevron-left', 'Ctrl+Shift+Tab'],
    ...shortcutGroup('PDF reader', [
      ['highlight', 'Highlight tool', 'highlighter', 'Alt+1'], ['underline', 'Underline tool', 'underline', 'Alt+2'],
      ['annotation', 'Note tool', 'sticky-note', 'Alt+3'], ['go-to-page', 'Focus page number', 'navigation', 'Ctrl+Alt+G'],
      ['redo', 'Redo annotation change', 'redo-2', 'Ctrl+Shift+Z'],
    ], { context: 'Zotero PDF reader' }),
  ], true),
  pack('openshot', 'OpenShot', ['openshot', 'openshot-qt', 'org.openshot.openshot'], 'https://www.openshot.org/files/user-guide/keyboard.html', [
    ['new', 'New project', 'file-plus', 'Ctrl+N'], ['open', 'Open project', 'folder-open', 'Ctrl+O'], ['save', 'Save project', 'save', 'Ctrl+S'],
    ['save-as', 'Save project as', 'save-all', 'Ctrl+Shift+S'], ['import', 'Import files', 'file-input', 'Ctrl+I'],
    ['export', 'Export video', 'file-output', 'Ctrl+E'], ['play', 'Play or pause', 'circle-play', 'Space'],
    ['reverse', 'Rewind', 'rewind', 'J'], ['stop', 'Stop playback', 'circle-stop', 'K'], ['forward', 'Fast forward', 'fast-forward', 'L'],
    ['previous-frame', 'Previous frame', 'step-back', 'Left'], ['next-frame', 'Next frame', 'step-forward', 'Right'],
    ['start', 'Jump to timeline start', 'skip-back', 'Home'], ['end', 'Jump to timeline end', 'skip-forward', 'End'],
    ['redo', 'Redo', 'redo-2', 'Ctrl+Shift+Z'], ['razor', 'Toggle razor tool', 'scissors', 'C'], ['snapping', 'Toggle snapping', 'magnet', 'S'],
  ], true),
];
