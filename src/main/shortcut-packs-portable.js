'use strict';

const { shortcutGroup } = require('./shortcut-pack-data');

const open = ['open', 'Open', 'folder-open', 'Ctrl+O'];
const save = ['save', 'Save', 'save', 'Ctrl+S'];
const saveAs = ['save-as', 'Save as', 'save-all', 'Ctrl+Shift+S'];
const newFile = ['new', 'New', 'file-plus', 'Ctrl+N'];
const find = ['find', 'Find', 'search', 'Ctrl+F'];
const undo = ['undo', 'Undo', 'undo-2', 'Ctrl+Z'];
const redo = ['redo', 'Redo', 'redo-2', 'Ctrl+Shift+Z'];
const redoWithY = ['redo', 'Redo', 'redo-2', 'Ctrl+Y'];
const terminalClipboard = [
  ['copy', 'Copy terminal selection', 'copy', 'Ctrl+Shift+C'], ['paste', 'Paste into terminal', 'clipboard', 'Ctrl+Shift+V'],
];

const portable = [
  { id: 'freecad', name: 'FreeCAD', appIds: ['freecad', 'freecadapp', 'org.freecad.freecad'], source: 'https://wiki.freecad.org/Std_Base', keys: [
    newFile, open, save, saveAs, undo, redo, ['refresh', 'Recompute document', 'refresh-cw', 'F5'],
    ...shortcutGroup('Model view', [
      ['fit', 'Fit model to view', 'maximize', ['V', 'F']], ['axonometric', 'Axonometric view', 'box', '0'],
      ['front', 'Front view', 'square', '1'], ['top', 'Top view', 'panel-top', '2'], ['right', 'Right view', 'panel-right', '3'],
      ['rear', 'Rear view', 'square', '4'], ['bottom', 'Bottom view', 'panel-bottom', '5'], ['left', 'Left view', 'panel-left', '6'],
    ], { context: '3D viewport', source: 'https://github.com/FreeCAD/FreeCAD/blob/main/src/Gui/CommandView.cpp' }),
  ] },
  { id: 'darktable', name: 'darktable', appIds: ['darktable', 'org.darktable.darktable'], editing: false,
    source: 'https://docs.darktable.org/usermanual/5.8/en/lighttable/overview/', keys: [
      ['darkroom', 'Develop selected image', 'sliders-horizontal', 'D'], ['lighttable', 'Open lighttable', 'images', 'L'],
      ['panels', 'Toggle panels', 'panels-top-left', 'Tab'],
      ...shortcutGroup('Lighttable ratings', [
        ...[0, 1, 2, 3, 4, 5].map((value) => [
          `rating-${value}`, value === 0 ? 'Clear rating' : `Rate ${value} ${value === 1 ? 'star' : 'stars'}`, 'star', String(value),
        ]),
        ['reject', 'Reject image', 'flag-off', 'R'],
      ], { context: 'Selected or hovered image in lighttable' }),
    ] },
  { id: 'rawtherapee', name: 'RawTherapee', appIds: ['rawtherapee', 'com.rawtherapee.rawtherapee'], editing: false,
    source: 'https://rawpedia.rawtherapee.com/Keyboard_Shortcuts/it', keys: [
      ['browser', 'File browser', 'files', 'Ctrl+F2'], ['show-queue', 'Queue', 'list-ordered', 'Ctrl+F3'],
      ['editor', 'Editor', 'sliders-horizontal', 'Ctrl+F4'], ['save', 'Save processed image', 'save', 'Ctrl+S'],
      ['queue', 'Add image to queue', 'list-plus', 'Ctrl+Q'], ['copy-profile', 'Copy processing profile', 'copy', 'Ctrl+C', { context: 'File browser' }],
      ['paste-profile', 'Paste processing profile', 'clipboard-paste', 'Ctrl+V', { context: 'File browser' }],
      ['select-all', 'Select all images', 'square-dashed', 'Ctrl+A', { context: 'File browser' }],
      ['full-screen', 'Toggle full screen', 'maximize', 'F11'],
    ] },
  { id: 'calibre', name: 'calibre', appIds: ['calibre', 'com.calibre_ebook.calibre'], editing: false,
    source: 'https://manual.calibre-ebook.com/gui.html#keyboard-shortcuts', keys: [
      ['add-books', 'Add books', 'book-plus', 'A'], ['edit-metadata', 'Edit metadata', 'pencil', 'E'],
      ['convert-books', 'Convert books', 'file-output', 'C'], ['read', 'View book', 'book-open', 'V'],
      ['advanced-search', 'Advanced search', 'search', 'Alt+A'], ['search', 'Focus search box', 'search', 'Alt+S'],
      ['book-details', 'Book details', 'info', 'I'], ['save-books', 'Save books to disk', 'download', 'S'],
      ['help', 'Help', 'circle-help', 'F1'], ['preferences', 'Preferences', 'settings', 'Ctrl+P'],
    ] },
  { id: 'joplin', name: 'Joplin', appIds: ['joplin', 'joplin-desktop', 'net.cozic.joplin_desktop'],
    source: 'https://github.com/laurent22/joplin/blob/dev/packages/lib/services/KeymapService.ts', keys: [
      ['new-note', 'New note', 'file-plus', 'Ctrl+N'], ['new-todo', 'New to-do', 'list-todo', 'Ctrl+T'],
      ['note-title', 'Focus note title', 'notebook', 'Ctrl+Shift+N'], ['goto', 'Go to anything', 'file-search', 'Ctrl+P'],
      ['search-all', 'Search all notes', 'search', 'F6'], ['find', 'Find in note', 'text-search', 'Ctrl+F'],
      ['toggle-layout', 'Toggle editor layout', 'panels-top-left', 'Ctrl+L'],
      ['toggle-sidebar', 'Toggle sidebar', 'panel-left', 'F10'], ['toggle-note-list', 'Toggle note list', 'list', 'F11'],
      ['sync', 'Synchronise', 'refresh-cw', 'Ctrl+S'], ['preferences', 'Preferences', 'settings', 'Ctrl+comma'], redo,
      ['palette', 'Command palette', 'command', 'Ctrl+Shift+P'],
    ] },
  { id: 'qbittorrent', name: 'qBittorrent', appIds: ['qbittorrent', 'org.qbittorrent.qbittorrent'], editing: false,
    source: 'https://github.com/qbittorrent/qBittorrent/wiki/Frequently-Asked-Questions#hotkeys', keys: [
      ['add-torrent-file', 'Add torrent file', 'file-plus', 'Ctrl+O'], ['add-torrent-link', 'Add torrent link', 'link', 'Ctrl+Shift+O'],
      ['create-torrent', 'Create torrent', 'file-plus', 'Ctrl+N'], ['preferences', 'Options', 'settings', 'Alt+O'],
      ['transfers', 'Transfers tab', 'list-filter', 'Alt+1'], ['search', 'Search tab', 'search', 'Alt+2'],
      ['general', 'General information', 'info', 'Alt+G'], ['trackers', 'Trackers', 'list-tree', 'Alt+C'],
      ['peers', 'Peers', 'users', 'Alt+R'], ['content', 'Torrent content', 'files', 'Alt+Z'],
      ['resume', 'Resume selected torrents', 'play', 'Ctrl+S'], ['pause', 'Pause selected torrents', 'pause', 'Ctrl+P'],
    ] },
  { id: 'prusaslicer', name: 'PrusaSlicer', appIds: ['prusa-slicer', 'prusaslicer', 'com.prusa3d.prusaslicer'], editing: false,
    source: 'https://help.prusa3d.com/article/keyboard-shortcuts_1764', keys: [
      ['import', 'Import model', 'file-input', 'Ctrl+I'], save, saveAs,
      ['slice', 'Slice plate', 'layers', 'Ctrl+R'], ['export-gcode', 'Export G-code', 'file-output', 'Ctrl+G'],
      ['export-config', 'Export configuration', 'download', 'Ctrl+E'], ['select-all', 'Select all models', 'square-dashed', 'Ctrl+A'],
      ['plater', 'Plater tab', 'layout-grid', 'Ctrl+1'], ['print-settings', 'Print settings', 'settings', 'Ctrl+2'],
      ['filament-settings', 'Filament settings', 'settings', 'Ctrl+3'], ['printer-settings', 'Printer settings', 'printer', 'Ctrl+4'],
      ['view-3d', '3D view', 'box', 'Ctrl+5'], ['preview', 'Preview', 'scan-eye', 'Ctrl+6'],
      ['arrange', 'Arrange models', 'layout-grid', 'A'], ['move', 'Move tool', 'move', 'M'],
      ['rotate', 'Rotate tool', 'rotate-cw', 'R'], ['scale', 'Scale tool', 'scaling', 'S'],
      ['copy', 'Copy objects', 'copy', 'Ctrl+C'], ['paste', 'Paste objects', 'clipboard', 'Ctrl+V'], undo, redoWithY,
    ] },
  { id: 'godot', name: 'Godot Engine', appIds: ['godot', 'godot4', 'org.godotengine.godot'],
    source: 'https://docs.godotengine.org/en/4.6/tutorials/editor/default_key_mapping.html', keys: [
      ['save', 'Save scene', 'save', 'Ctrl+S'], ['save-all', 'Save all scenes', 'save-all', 'Ctrl+Shift+Alt+S'],
      ['play-project', 'Run project', 'circle-play', 'F5'], ['play-scene', 'Run current scene', 'play', 'F6'],
      ['stop', 'Stop project', 'square', 'F8'], ['quick-open', 'Quick open', 'file-search', 'Alt+Shift+O'],
      ['2d', '2D workspace', 'square', 'Ctrl+F1'], ['3d', '3D workspace', 'box', 'Ctrl+F2'],
      ['script', 'Script workspace', 'code', 'Ctrl+F3'], ['distraction-free', 'Distraction-free mode', 'maximize', 'Ctrl+Shift+F11'],
      ['search-help', 'Search documentation', 'circle-help', 'F1'], redo,
    ] },
  { id: 'obs-studio', name: 'OBS Studio', appIds: ['obs', 'obs-studio', 'com.obsproject.studio'], source: 'https://obsproject.com/kb/keyboard-shortcuts',
    keys: [undo, redo, ...shortcutGroup('Source transforms', [
      ['transform', 'Edit transform', 'scaling', 'Ctrl+E'], ['fit-source', 'Fit source to canvas', 'maximize', 'Ctrl+F'],
      ['stretch-source', 'Stretch source to canvas', 'move-horizontal', 'Ctrl+S'],
      ['center-source', 'Center source', 'scan', 'Ctrl+D'], ['reset-transform', 'Reset transform', 'rotate-ccw', 'Ctrl+R'],
      ['source-up', 'Raise source', 'arrow-up', 'Ctrl+Up'], ['source-down', 'Lower source', 'arrow-down', 'Ctrl+Down'],
      ['source-top', 'Move source to top', 'chevrons-up', 'Ctrl+Home'], ['source-bottom', 'Move source to bottom', 'chevrons-down', 'Ctrl+End'],
    ], { context: 'With a source selected' })] },
  { id: 'xournalpp', name: 'Xournal++', appIds: ['xournalpp', 'com.github.xournalpp.xournalpp'], source: 'https://xournalpp.github.io/guide/pdfs/', keys: [
    newFile, open, save, saveAs, find, undo, redo, ['export-pdf', 'Export as PDF', 'file-output', 'Ctrl+E'],
    ['previous-page', 'Previous page', 'chevron-up', 'PageUp'], ['next-page', 'Next page', 'chevron-down', 'PageDown'],
    ['full-screen', 'Toggle full screen', 'maximize', 'F11'],
  ] },
  { id: 'pdf-arranger', name: 'PDF Arranger', appIds: ['pdfarranger', 'com.github.jeromerobert.pdfarranger'],
    source: 'https://github.com/pdfarranger/pdfarranger/blob/main/pdfarranger/config.py', keys: [
      ['open', 'Open PDF', 'folder-open', 'Ctrl+O'], ['import', 'Import PDF', 'file-input', 'Ctrl+I'],
      ['save', 'Save PDF', 'save', 'Ctrl+S'], saveAs, undo, redoWithY,
      ['rotate-left', 'Rotate pages left', 'rotate-ccw', 'Ctrl+Left'], ['rotate-right', 'Rotate pages right', 'rotate-cw', 'Ctrl+Right'],
      ['select-all', 'Select all pages', 'square-dashed', 'Ctrl+A'], ['zoom-in', 'Zoom in', 'zoom-in', 'Ctrl+char:plus'],
      ['zoom-out', 'Zoom out', 'zoom-out', 'Ctrl+minus'], ['delete-selection', 'Remove selected pages', 'trash-2', 'Delete', { confirm: true }],
    ] },
  { id: 'double-commander', name: 'Double Commander', appIds: ['doublecmd', 'doublecmd-gtk', 'doublecmd-qt', 'org.doublecmd.doublecmd'],
    source: 'https://doublecmd.github.io/doc/en/shortcuts.html', editing: false, keys: [
      ['view', 'View file', 'eye', 'F3'], ['edit-file', 'Edit file', 'pencil', 'F4'], ['copy-selection', 'Copy to other panel', 'copy', 'F5', { confirm: true }],
      ['move-selection', 'Move to other panel', 'move', 'F6', { confirm: true }], ['new-folder', 'Create folder', 'folder-plus', 'F7'],
      ['refresh', 'Refresh panel', 'refresh-cw', 'Ctrl+R'], ['new-tab', 'New tab', 'square-plus', 'Ctrl+T'],
      ['close-tab', 'Close tab', 'x', 'Ctrl+W'], ['search-files', 'Search files', 'search', 'Alt+F7'],
      ['multi-rename', 'Multi-rename tool', 'pencil', 'Ctrl+M'], ['switch-panel', 'Switch panels', 'arrow-left-right', 'Tab'],
    ] },
  { id: 'yed', name: 'yEd Graph Editor', executables: ['yed.exe'], appIds: ['yed', 'com.yworks.yed'],
    source: 'https://yed.yworks.com/support/manual/keys_mouse.html', keys: [
      newFile, open, save, saveAs, undo, redoWithY,
      ['label', 'Edit graph label', 'type', 'F2'], ['select-all', 'Select graph elements', 'square-dashed', 'Ctrl+A'],
      ['exit-fullscreen', 'Exit full screen', 'minimize', 'Esc', { source: 'https://yed.yworks.com/support/manual/yedmenu.html' }],
      ['print', 'Print graph', 'printer', 'Ctrl+P'],
    ] },
  { id: 'natron', name: 'Natron', executables: ['natron.exe'], appIds: ['natron', 'fr.inria.natron'],
    source: 'https://natron.readthedocs.io/_/downloads/en/rb-2.5/pdf/', keys: [
      newFile, open, save, saveAs, undo, redoWithY,
      ['search-node', 'Search for node', 'search', 'Tab', { context: 'Node Graph' }],
      ['preferences', 'Preferences', 'settings', 'Shift+S'],
      ['previous-tab', 'Previous tab', 'chevron-left', 'Ctrl+Shift+T'], ['next-tab', 'Next tab', 'chevron-right', 'Ctrl+T'],
      ['new-project-version', 'Save new project version', 'history', 'Ctrl+Alt+Shift+S'],
    ] },
  { id: 'hydrogen', name: 'Hydrogen', executables: ['hydrogen.exe'], appIds: ['hydrogen', 'org.hydrogenmusic.hydrogen'],
    source: 'https://hydrogen-music.org/documentation/manual/manual_en_chunked/ch22.html', keys: [
      ['new', 'New song', 'file-plus', 'Ctrl+N'], ['open', 'Open song', 'folder-open', 'Ctrl+O'], ['save', 'Save song', 'save', 'Ctrl+S'], saveAs,
      ['play', 'Play or pause', 'circle-play', 'Space'], ['restart', 'Restart song or pattern', 'rewind', 'Backspace'],
      ['export-song', 'Export song', 'file-output', 'Ctrl+E'], ['export-midi', 'Export MIDI', 'music', 'Ctrl+M'],
      ['mixer', 'Show mixer', 'sliders-horizontal', 'Alt+M'], ['instrument-rack', 'Show instrument rack', 'layers', 'Alt+I'],
      ['previous-bar', 'Previous bar', 'skip-back', 'F9'], ['next-bar', 'Next bar', 'skip-forward', 'F10'],
      undo, redo,
    ] },
  { id: 'wezterm', name: 'WezTerm', executables: ['wezterm-gui.exe'], appIds: ['wezterm', 'wezterm-gui', 'org.wezfurlong.wezterm'],
    source: 'https://wezterm.org/config/default-keys.html', editing: false, keys: [
      ['new-window', 'New window', 'panels-top-left', 'Ctrl+Shift+N'], ['new-tab', 'New tab', 'square-plus', 'Ctrl+Shift+T'],
      ['close-tab', 'Close tab', 'x', 'Ctrl+Shift+W'], ['next-tab', 'Next tab', 'chevron-right', 'Ctrl+Tab'],
      ['previous-tab', 'Previous tab', 'chevron-left', 'Ctrl+Shift+Tab'], ['search', 'Search scrollback', 'search', 'Ctrl+Shift+F'],
      ['copy-mode', 'Copy mode', 'scan-text', 'Ctrl+Shift+X'], ['full-screen', 'Toggle full screen', 'maximize', 'Alt+Enter'], ...terminalClipboard,
    ] },
  { id: 'alacritty', name: 'Alacritty', executables: ['alacritty.exe'], appIds: ['alacritty', 'org.alacritty.alacritty'],
    source: 'https://alacritty.org/config-alacritty-bindings.html', editing: false, keys: [
      ['search-forward', 'Search forward', 'search', 'Ctrl+Shift+F'],
      ['search-back', 'Search backward', 'search', 'Ctrl+Shift+B'], ['vi-mode', 'Toggle Vi mode', 'keyboard', 'Ctrl+Shift+Space'],
      ['scroll-up', 'Scroll page up', 'chevrons-up', 'Shift+PageUp'], ['scroll-down', 'Scroll page down', 'chevrons-down', 'Shift+PageDown'],
      ['scroll-top', 'Scroll to top', 'arrow-up-to-line', 'Shift+Home'], ['scroll-bottom', 'Scroll to bottom', 'arrow-down-to-line', 'Shift+End'],
      ['reset-font', 'Reset font size', 'type', 'Ctrl+0'], ...terminalClipboard,
    ] },
];

// Keep saved action IDs and existing Windows bindings. Import only distinct defaults.
function extendShortcutPacks(packs, additions) {
  return packs.map((pack) => {
    if (!Object.hasOwn(additions, pack.id)) return pack;
    const chordId = (chord) => typeof chord === 'string' ? chord.replace(/\s+/g, '').toLowerCase() : JSON.stringify(chord);
    const ids = new Set(pack.keys.map(([id]) => id));
    const chords = new Set(pack.keys.map(([, , , chord]) => chordId(chord)));
    const extra = additions[pack.id].filter(([id, , , chord]) => {
      const normalized = chordId(chord);
      if (ids.has(id) || chords.has(normalized)) return false;
      ids.add(id);
      chords.add(normalized);
      return true;
    });
    return { ...pack, keys: [...pack.keys, ...extra] };
  });
}

const newWindowsPacks = portable.filter(({ executables }) => executables)
  .map(({ appIds: _linuxIds, ...pack }) => pack);
const windowsAdditions = Object.fromEntries(portable.filter(({ executables }) => !executables).map(({ id, keys, source }) => [id,
  keys.map(([key, label, icon, chord, options]) => [key, label, icon, chord, { source, ...options }]),
]));
const linuxPortablePacks = portable.map(({ executables: _windowsExecutables, id, ...pack }) => ({ ...pack, id: `linux-${id}` }));

module.exports = { extendShortcutPacks, linuxPortablePacks, newWindowsPacks, windowsAdditions };
