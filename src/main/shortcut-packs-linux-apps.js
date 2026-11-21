'use strict';

const pack = (id, name, appIds, source, keys, options) => ({ id: 'linux-' + id, name, appIds, source, keys, ...options });
const open = ['open', 'Open file', 'folder-open', 'Ctrl+O'];
const save = ['save', 'Save', 'save', 'Ctrl+S'];
const saveAs = ['save-as', 'Save as', 'save-all', 'Ctrl+Shift+S'];
const newFile = ['new', 'New file', 'file-plus', 'Ctrl+N'];
const find = ['find', 'Find', 'search', 'Ctrl+F'];
const print = ['print', 'Print', 'printer', 'Ctrl+P'];
const selectAll = ['select-all', 'Select all', 'square-dashed', 'Ctrl+A'];
const fileManager = [
  ['new-tab', 'New tab', 'square-plus', 'Ctrl+T'], ['new-window', 'New window', 'panels-top-left', 'Ctrl+N'],
  ['new-folder', 'New folder', 'folder-plus', 'Ctrl+Shift+N'], ['location', 'Enter location', 'link', 'Ctrl+L'],
  ['parent', 'Parent folder', 'folder-up', 'Alt+Up'], ['back', 'Back', 'arrow-left', 'Alt+Left'],
  ['forward', 'Forward', 'arrow-right', 'Alt+Right'], ['hidden', 'Show hidden files', 'eye', 'Ctrl+H'],
  ['rename', 'Rename selection', 'pencil', 'F2'], ['refresh', 'Refresh view', 'refresh-cw', 'F5'],
  ['close-tab', 'Close tab', 'x', 'Ctrl+W'], selectAll,
];
const terminal = [
  ['new-tab', 'New tab', 'square-plus', 'Ctrl+Shift+T'], ['new-window', 'New window', 'panels-top-left', 'Ctrl+Shift+N'],
  ['close-tab', 'Close tab', 'x', 'Ctrl+Shift+W'], ['find', 'Find in output', 'search', 'Ctrl+Shift+F'],
  ['copy', 'Copy selection', 'copy', 'Ctrl+Shift+C'], ['paste', 'Paste into terminal', 'clipboard', 'Ctrl+Shift+V'],
  ['full-screen', 'Toggle full screen', 'maximize', 'F11'],
];
const playback = [
  ['play-pause', 'Play or pause', 'circle-play', 'Space'], ['rewind', 'Play backward', 'rewind', 'J'],
  ['stop', 'Stop shuttle', 'circle-stop', 'K'], ['forward', 'Play forward', 'fast-forward', 'L'],
  ['mark-in', 'Set in point', 'brackets', 'I'], ['mark-out', 'Set out point', 'brackets', 'O'],
];
const jetbrains = [
  ['palette', 'Find action', 'command', 'Ctrl+Shift+A'], ['go-to-class', 'Go to class', 'braces', 'Ctrl+N'],
  ['go-to-file', 'Go to file', 'file-search', 'Ctrl+Shift+N'], ['recent-files', 'Recent files', 'history', 'Ctrl+E'],
  ['project', 'Project tool window', 'folder', 'Alt+1'], ['find-in-files', 'Find in files', 'search', 'Ctrl+Shift+F'],
  ['replace-in-files', 'Replace in files', 'replace', 'Ctrl+Shift+R'], ['go-to-declaration', 'Go to declaration', 'signpost', 'Ctrl+B'],
  ['find-usages', 'Find usages', 'scan-search', 'Alt+F7'], ['rename', 'Rename symbol', 'pencil', 'Shift+F6'],
  ['reformat', 'Reformat code', 'align-left', 'Ctrl+Alt+L'], ['quick-fix', 'Show intentions', 'lightbulb', 'Alt+Enter'],
  ['terminal', 'Terminal tool window', 'square-terminal', 'Alt+F12'], ['run', 'Run configuration', 'circle-play', 'Shift+F10'],
  ['debug', 'Debug configuration', 'bug', 'Shift+F9'], ['breakpoint', 'Toggle breakpoint', 'circle-dot', 'Ctrl+F8'],
  ['undo', 'Undo', 'undo-2', 'Ctrl+Z'], ['redo', 'Redo', 'redo-2', 'Ctrl+Shift+Z'],
];

module.exports = [
  pack('nautilus', 'GNOME Files', ['nautilus', 'org.gnome.nautilus'], 'https://gitlab.gnome.org/GNOME/nautilus/-/blob/main/src/nautilus-window.c', [
    ...fileManager, find, ['home', 'Home folder', 'house', 'Alt+Home'], ['properties', 'Properties', 'info', 'Alt+Enter'],
  ]),
  pack('dolphin', 'Dolphin', ['dolphin', 'org.kde.dolphin'], 'https://docs.kde.org/stable_kf6/en/dolphin/dolphin/command-reference.html', [
    ...fileManager, ['split', 'Split view', 'columns-2', 'F3'], ['terminal', 'Terminal panel', 'square-terminal', 'F4'],
    ['filter', 'Filter files', 'list-filter', 'Ctrl+I'], ['places', 'Places panel', 'map-pin', 'F9'],
    ['details', 'Details view', 'list', 'Ctrl+3'], ['icons', 'Icons view', 'grid-2x2', 'Ctrl+1'],
  ]),
  pack('thunar', 'Thunar', ['thunar', 'org.xfce.thunar'], 'https://gitlab.xfce.org/xfce/thunar/-/blob/master/thunar/thunar-window.c', [
    ...fileManager, ['home', 'Home folder', 'house', 'Alt+Home'], ['properties', 'Properties', 'info', 'Alt+Enter'],
    ['compact', 'Compact view', 'columns-2', 'Ctrl+3'], ['details', 'Detailed list', 'list', 'Ctrl+2'],
  ]),
  pack('gnome-terminal', 'GNOME Terminal', ['gnome-terminal', 'gnome-terminal-server', 'org.gnome.terminal'],
    'https://help.gnome.org/gnome-terminal/adv-keyboard-shortcuts.html', [
      ...terminal, ['next-tab', 'Next tab', 'chevron-right', 'Ctrl+PageDown'],
      ['previous-tab', 'Previous tab', 'chevron-left', 'Ctrl+PageUp'], ['reset-zoom', 'Normal text size', 'type', 'Ctrl+0'],
      ['zoom-out', 'Smaller text', 'zoom-out', 'Ctrl+minus'],
    ], { editing: false }),
  pack('konsole', 'Konsole', ['konsole', 'org.kde.konsole'], 'https://docs.kde.org/stable_kf6/en/konsole/konsole/konsole.pdf', [
    ...terminal, ['next-tab', 'Next tab', 'chevron-right', 'Shift+Right'], ['previous-tab', 'Previous tab', 'chevron-left', 'Shift+Left'],
    ['split-left-right', 'Split left and right', 'columns-2', 'Ctrl+char:('],
  ], { editing: false }),
  pack('gimp', 'GIMP', ['gimp', 'gimp-2.10', 'gimp-3.0', 'org.gimp.gimp'], 'https://docs.gimp.org/3.0/pdf/gimp-keys-en.pdf', [
    open, save, saveAs, ['export-as', 'Export as', 'file-output', 'Ctrl+Shift+E'], ['export', 'Export again', 'download', 'Ctrl+E'],
    ['open-layers', 'Open as layers', 'layers', 'Ctrl+Alt+O'], ['new-layer', 'New layer', 'layers-2', 'Ctrl+Shift+N'],
    ['search-actions', 'Search actions', 'search', 'char:slash'], ['paintbrush', 'Paintbrush tool', 'paintbrush', 'P'],
    ['move', 'Move tool', 'move', 'M'], ['rect-select', 'Rectangle select', 'square-dashed', 'R'],
    ['deselect', 'Deselect', 'x', 'Ctrl+Shift+A'], ['redo', 'Redo', 'redo-2', 'Ctrl+Y'],
  ]),
  pack('krita', 'Krita', ['krita', 'org.kde.krita'], 'https://docs.krita.org/en/user_manual/getting_started/navigation.html', [
    newFile, open, save, saveAs, ['brush', 'Freehand brush', 'paintbrush', 'B'], ['erase', 'Eraser mode', 'eraser', 'E'],
    ['swap-colors', 'Swap colors', 'repeat', 'X'], ['default-colors', 'Default colors', 'palette', 'D'],
    ['mirror', 'Mirror canvas', 'flip-horizontal', 'M'], ['canvas-only', 'Canvas only', 'maximize', 'Tab'],
    ['transform', 'Transform selection', 'scaling', 'Ctrl+T'], ['deselect', 'Deselect', 'square-dashed', 'Ctrl+Shift+A'],
    ['redo', 'Redo', 'redo-2', 'Ctrl+Shift+Z'],
  ]),
  pack('inkscape', 'Inkscape', ['inkscape', 'org.inkscape.inkscape'], 'https://inkscape.org/doc/keys.html', [
    open, save, saveAs, ['duplicate', 'Duplicate selection', 'copy', 'Ctrl+D'], ['group', 'Group selection', 'group', 'Ctrl+G'],
    ['ungroup', 'Ungroup selection', 'ungroup', 'Ctrl+Shift+G'], ['object-path', 'Object to path', 'spline', 'Ctrl+Shift+C'],
    ['export', 'Export panel', 'file-output', 'Ctrl+Shift+E'], ['fill-stroke', 'Fill and stroke', 'paint-bucket', 'Ctrl+Shift+F'],
    ['document-properties', 'Document properties', 'settings', 'Ctrl+Shift+D'], ['zoom-page', 'Zoom to page', 'maximize', '5'],
    ['zoom-selection', 'Zoom to selection', 'scan-eye', '3'], ['redo', 'Redo', 'redo-2', 'Ctrl+Shift+Z'],
  ]),
  pack('blender', 'Blender', ['blender', 'org.blender.blender'], 'https://docs.blender.org/manual/en/latest/interface/keymap/blender_default.html', [
    open, save, saveAs, ['search', 'Search actions', 'search', 'F3'], ['render', 'Render frame', 'image', 'F12'],
    ['show-render', 'Show render', 'scan-eye', 'F11'], ['maximize-area', 'Maximize area', 'maximize', 'Ctrl+Space'],
    ['play-pause', 'Play or pause animation', 'circle-play', 'Space'],
    ['hide-side', 'Sidebar', 'panel-right', 'N', { context: '3D viewport' }],
    ['frame-selected', 'Frame selection', 'scan-eye', 'decimal', { context: '3D viewport' }],
    ['redo', 'Redo', 'redo-2', 'Ctrl+Shift+Z'], ['undo', 'Undo', 'undo-2', 'Ctrl+Z'],
  ], { editing: false }),
  pack('shotcut', 'Shotcut', ['shotcut', 'org.shotcut.shotcut'], 'https://shotcut.org/howtos/keyboard-shortcuts/', [
    open, save, saveAs, ...playback, ['split', 'Split at playhead', 'scissors', 'S', { context: 'Timeline' }],
    ['split-all', 'Split all tracks', 'scissors', 'Shift+S', { context: 'Timeline' }],
    ['previous-frame', 'Previous frame', 'step-back', 'Left'], ['next-frame', 'Next frame', 'step-forward', 'Right'],
    ['redo', 'Redo', 'redo-2', 'Ctrl+Shift+Z'],
  ]),
  pack('kdenlive', 'Kdenlive', ['kdenlive', 'org.kde.kdenlive'], 'https://docs.kdenlive.org/en/user_interface/shortcuts.html', [
    open, save, saveAs, ...playback, ['select-tool', 'Selection tool', 'mouse-pointer', 'S'],
    ['razor-tool', 'Razor tool', 'scissors', 'X'], ['cut-at-playhead', 'Cut at playhead', 'scissors', 'Shift+R', { context: 'Timeline' }],
    ['redo', 'Redo', 'redo-2', 'Ctrl+Shift+Z'],
  ]),
  pack('vlc', 'VLC media player', ['vlc', 'org.videolan.vlc'], 'https://docs.videolan.me/vlc-user/desktop/3.0/en/basic/hotkeys.html', [
    open, ['play-pause', 'Play or pause', 'circle-play', 'Space'], ['previous', 'Previous item', 'skip-back', 'P'],
    ['next', 'Next item', 'skip-forward', 'N'], ['short-back', 'Short jump back', 'rewind', 'Shift+Left'],
    ['short-forward', 'Short jump forward', 'fast-forward', 'Shift+Right'], ['mute', 'Mute VLC', 'volume-x', 'M'],
    ['volume-down', 'VLC volume down', 'volume-1', 'Ctrl+Down'], ['volume-up', 'VLC volume up', 'volume-2', 'Ctrl+Up'],
    ['full-screen', 'Toggle full screen', 'maximize', 'F'], ['playlist', 'Playlist', 'list-music', 'Ctrl+L'],
    ['subtitles', 'Cycle subtitles', 'captions', 'V'],
  ], { editing: false }),
  pack('qgis', 'QGIS', ['qgis', 'qgis-bin', 'org.qgis.qgis'], 'https://docs.qgis.org/testing/en/docs/user_manual/introduction/qgis_gui.html', [
    newFile, open, save, saveAs, ['attributes', 'Attribute table', 'table', 'F6'],
    ['selected-attributes', 'Selected feature table', 'table', 'Shift+F6'], ['measure', 'Measure line', 'ruler', 'Ctrl+Shift+M'],
    ['refresh', 'Refresh map', 'refresh-cw', 'F5'], ['show-all-layers', 'Show all layers', 'layers', 'Ctrl+Shift+U'],
  ], { editing: false }),
  pack('libreoffice-writer', 'LibreOffice Writer', ['libreoffice-writer', 'org.libreoffice.libreoffice.writer'], 'https://help.libreoffice.org/latest/en-US/text/swriter/04/01020000.html?System=UNIX', [
    newFile, open, save, saveAs, find, print, ['bold', 'Bold', 'bold', 'Ctrl+B'], ['italic', 'Italic', 'italic', 'Ctrl+I'],
    ['align-left', 'Align left', 'align-left', 'Ctrl+L'], ['align-center', 'Center', 'align-center', 'Ctrl+E'],
    ['justify', 'Justify', 'align-justify', 'Ctrl+J'], ['page-break', 'Page break', 'file-minus', 'Ctrl+Enter'],
    ['navigator', 'Navigator', 'compass', 'F5'], ['spellcheck', 'Spelling', 'spell-check', 'F7'],
  ]),
  pack('libreoffice-calc', 'LibreOffice Calc', ['libreoffice-calc', 'org.libreoffice.libreoffice.calc'], 'https://help.libreoffice.org/latest/en-US/text/scalc/04/01020000.html?System=UNIX', [
    newFile, open, save, saveAs, find, print, ['edit-cell', 'Edit cell', 'pencil', 'F2'],
    ['format-cells', 'Format cells', 'settings', 'Ctrl+1'], ['fill-down', 'Fill down', 'arrow-down', 'Ctrl+D'],
    ['next-sheet', 'Next sheet', 'chevron-right', 'Ctrl+PageDown'], ['previous-sheet', 'Previous sheet', 'chevron-left', 'Ctrl+PageUp'],
  ]),
  pack('libreoffice-impress', 'LibreOffice Impress', ['libreoffice-impress', 'org.libreoffice.libreoffice.impress'], 'https://help.libreoffice.org/latest/en-US/text/simpress/04/01020000.html?System=UNIX', [
    newFile, open, save, saveAs, find, print, ['slideshow', 'Start slideshow', 'presentation', 'F5'],
    ['slideshow-here', 'Present from current slide', 'play', 'Shift+F5'], ['new-slide', 'New slide', 'square-plus', 'Ctrl+M'],
    ['group', 'Group objects', 'group', 'Ctrl+Shift+G'], ['ungroup', 'Ungroup objects', 'ungroup', 'Ctrl+Alt+Shift+G'],
  ]),
  pack('sublime-text', 'Sublime Text', ['sublime_text', 'sublime-text', 'com.sublimetext.three', 'com.sublimetext.four'],
    'https://www.sublimetext.com/docs/command_palette.html', [
      open, save, saveAs, find, ['goto', 'Go to anything', 'file-search', 'Ctrl+P'],
      ['palette', 'Command palette', 'command', 'Ctrl+Shift+P'], ['find-files', 'Find in files', 'search', 'Ctrl+Shift+F'],
      ['select-next', 'Select next match', 'scan-text', 'Ctrl+D'], ['comment', 'Toggle comment', 'message-square', 'Ctrl+char:slash'],
      ['line', 'Select line', 'text-select', 'Ctrl+L'], ['full-screen', 'Full screen', 'maximize', 'F11'],
    ]),
  pack('thunderbird', 'Mozilla Thunderbird', ['thunderbird', 'thunderbird-esr', 'org.mozilla.thunderbird'],
    'https://support.mozilla.org/en-US/kb/keyboard-shortcuts-thunderbird', [
      ['compose', 'New message', 'mail-plus', 'Ctrl+N'], ['reply', 'Reply', 'reply', 'Ctrl+R'],
      ['reply-all', 'Reply to all', 'reply-all', 'Ctrl+Shift+R'], ['forward', 'Forward message', 'forward', 'Ctrl+L'],
      ['addresses', 'Address book', 'book-user', 'Ctrl+Shift+B'], ['get-mail', 'Get new mail', 'download', 'F5'],
      ['get-all-mail', 'Check all accounts', 'inbox', 'Shift+F5'], ['global-search', 'Search all messages', 'search', 'Ctrl+K'],
      ['archive', 'Archive message', 'archive', 'A'], ['next-unread', 'Next unread message', 'chevron-down', 'N'],
      ['previous-unread', 'Previous unread message', 'chevron-up', 'P'], find,
    ]),
  pack('audacity', 'Audacity', ['audacity', 'org.audacityteam.audacity'], 'https://manual.audacityteam.org/man/keyboard_shortcut_reference.html', [
    newFile, open, save, ['import-audio', 'Import audio', 'file-input', 'Ctrl+Shift+I'],
    ['play-pause', 'Play or stop', 'circle-play', 'Space'], ['pause', 'Pause', 'pause', 'P'],
    ['record', 'Record', 'mic', 'R', { confirm: true }], ['selection-tool', 'Selection tool', 'mouse-pointer', 'F1'],
    ['envelope', 'Envelope tool', 'activity', 'F2'], ['split', 'Split clip', 'scissors', 'Ctrl+I'],
    ['trim', 'Trim to selection', 'scissors', 'Ctrl+T'], ['fit-project', 'Fit project', 'maximize', 'Ctrl+F'],
    ['fit-selection', 'Fit selection', 'scan-eye', 'Ctrl+E'], ['fit-tracks', 'Fit vertically', 'move-vertical', 'Ctrl+Shift+F'],
    ['redo', 'Redo', 'redo-2', 'Ctrl+Y'],
  ]),
  pack('okular', 'Okular', ['okular', 'org.kde.okular'], 'https://docs.kde.org/stable_kf6/en/okular/okular/okular.pdf', [
    open, find, print, ['go-to-page', 'Go to page', 'file-search', 'Ctrl+G'],
    ['next-page', 'Next page', 'chevron-right', 'PageDown'], ['previous-page', 'Previous page', 'chevron-left', 'PageUp'],
    ['browse', 'Browse mode', 'mouse-pointer', 'Ctrl+1'], ['zoom', 'Zoom tool', 'zoom-in', 'Ctrl+2'],
    ['fit-window', 'Fit window to page', 'maximize', 'Ctrl+J'], ['bookmark', 'Toggle bookmark', 'bookmark', 'Ctrl+B'],
    ['presentation', 'Presentation mode', 'presentation', 'Ctrl+Shift+P'], ['copy', 'Copy selection', 'copy', 'Ctrl+C'],
  ], { editing: false }),
  pack('evince', 'Evince', ['evince', 'org.gnome.evince'], 'https://help.gnome.org/evince/shortcuts.html', [
    open, find, print, ['next-page', 'Next page', 'chevron-right', 'Ctrl+PageDown'],
    ['previous-page', 'Previous page', 'chevron-left', 'Ctrl+PageUp'], ['first-page', 'First page', 'chevrons-left', 'Ctrl+Home'],
    ['last-page', 'Last page', 'chevrons-right', 'Ctrl+End'], ['fullscreen', 'Toggle full screen', 'maximize', 'F11'],
    ['presentation', 'Presentation mode', 'presentation', 'F5'], ['zoom-in', 'Zoom in', 'zoom-in', 'Ctrl+char:plus'],
    ['zoom-out', 'Zoom out', 'zoom-out', 'Ctrl+minus'], ['copy', 'Copy selection', 'copy', 'Ctrl+C'],
  ], { editing: false }),
  pack('kate', 'Kate', ['kate', 'org.kde.kate'], 'https://docs.kde.org/stable_kf6/en/kate/kate/edit-menu.html', [
    newFile, open, save, saveAs, find, print, ['replace', 'Replace', 'replace', 'Ctrl+R'],
    ['find-next', 'Find next', 'chevron-down', 'F3'], ['find-previous', 'Find previous', 'chevron-up', 'Shift+F3'],
    ['go-to-line', 'Go to line', 'list-ordered', 'Ctrl+G'], ['comment', 'Comment selection', 'message-square', 'Ctrl+D'],
    ['uncomment', 'Uncomment selection', 'message-square-off', 'Ctrl+Shift+D'], ['redo', 'Redo', 'redo-2', 'Ctrl+Shift+Z'],
  ]),
  pack('obsidian', 'Obsidian', ['obsidian', 'md.obsidian.obsidian'], 'https://obsidian.md/help/hotkeys', [
    ['new-note', 'New note', 'file-plus', 'Ctrl+N'], ['quick-switcher', 'Quick switcher', 'file-search', 'Ctrl+O'],
    ['palette', 'Command palette', 'command', 'Ctrl+P'], ['search-vault', 'Search vault', 'search', 'Ctrl+Shift+F'],
    ['reading-view', 'Toggle reading view', 'book-open', 'Ctrl+E'], ['new-tab', 'New tab', 'square-plus', 'Ctrl+T'],
    ['close-tab', 'Close tab', 'x', 'Ctrl+W'], find, ['bold', 'Bold', 'bold', 'Ctrl+B'], ['italic', 'Italic', 'italic', 'Ctrl+I'],
    ['redo', 'Redo', 'redo-2', 'Ctrl+Shift+Z'],
  ]),
  pack('keepassxc', 'KeePassXC', ['keepassxc', 'org.keepassxc.keepassxc'], 'https://keepassxc.org/docs/KeePassXC_UserGuide#_keyboard_shortcuts', [
    ['open', 'Open database', 'folder-open', 'Ctrl+O'], ['save', 'Save database', 'save', 'Ctrl+S'],
    ['new-database', 'New database', 'database', 'Ctrl+Shift+N'], ['new-entry', 'New entry', 'square-plus', 'Ctrl+N'],
    ['edit-entry', 'Edit selected entry', 'pencil', 'Ctrl+E'], ['search', 'Search entries', 'search', 'Ctrl+F'],
    ['lock', 'Lock databases', 'lock', 'Ctrl+L'],
  ], { editing: false }),
  pack('zed', 'Zed', ['zed', 'dev.zed.zed'], 'https://github.com/zed-industries/zed/blob/main/assets/keymaps/default-linux.json', [
    open, save, find, ['palette', 'Command palette', 'command', 'Ctrl+Shift+P'], ['go-to-file', 'Go to file', 'file-search', 'Ctrl+P'],
    ['find-in-project', 'Find in project', 'search', 'Ctrl+Shift+F'], ['definition', 'Go to definition', 'signpost', 'F12'],
    ['go-to-line', 'Go to line', 'list-ordered', 'Ctrl+G'], ['comment', 'Toggle comment', 'message-square', 'Ctrl+char:slash'],
    ['rename', 'Rename symbol', 'pencil', 'F2'], ['redo', 'Redo', 'redo-2', 'Ctrl+Shift+Z'],
  ]),
  pack('slack', 'Slack', ['slack', 'com.slack.slack'], 'https://slack.com/help/articles/201374536-Slack-keyboard-shortcuts', [
    ['switcher', 'Jump to conversation', 'search', 'Ctrl+K'], ['compose', 'New message', 'message-square-plus', 'Ctrl+N'],
    ['direct-messages', 'Direct messages', 'messages-square', 'Ctrl+Shift+2'], ['unreads', 'All unreads', 'inbox', 'Ctrl+Shift+A'],
    ['previous', 'Previous conversation', 'arrow-left', 'Alt+Left'], ['next', 'Next conversation', 'arrow-right', 'Alt+Right'],
    ['previous-unread', 'Previous unread', 'chevron-up', 'Alt+Shift+Up'], ['next-unread', 'Next unread', 'chevron-down', 'Alt+Shift+Down'],
    ['search', 'Search', 'search', 'Ctrl+G'], ['shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+char:slash'],
    ['settings', 'Preferences', 'settings', 'Ctrl+comma'],
  ]),
  pack('signal', 'Signal Desktop', ['signal', 'signal-desktop', 'org.signal.signal'],
    'https://support.signal.org/hc/en-us/articles/360036517511-Signal-Desktop-Keyboard-Shortcuts', [
      ['compose', 'New chat', 'message-square-plus', 'Ctrl+N'], ['search', 'Search chats', 'search', 'Ctrl+F'],
      ['search-chat', 'Find in chat', 'text-search', 'Ctrl+Shift+F'], ['archive', 'Archive chat', 'archive', 'Ctrl+Shift+A'],
      ['bold', 'Bold text', 'bold', 'Ctrl+B'], ['italic', 'Italic text', 'italic', 'Ctrl+I'],
      ['attach', 'Attach file', 'paperclip', 'Ctrl+U'], ['shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+char:slash'],
    ]),
  pack('discord', 'Discord', ['discord', 'discordcanary', 'discordptb', 'com.discordapp.discord'],
    'https://support.discord.com/hc/en-us/articles/31232432266647-Discord-Commands-Shortcuts-and-Navigation-Guide', [
      ['switcher', 'Quick switcher', 'search', 'Ctrl+K'], ['search', 'Search messages', 'text-search', 'Ctrl+F'],
      ['emoji', 'Emoji picker', 'smile', 'Ctrl+E'], ['previous-channel', 'Previous channel', 'chevron-up', 'Alt+Up'],
      ['next-channel', 'Next channel', 'chevron-down', 'Alt+Down'], ['previous-guild', 'Previous server', 'chevrons-up', 'Ctrl+Alt+Up'],
      ['next-guild', 'Next server', 'chevrons-down', 'Ctrl+Alt+Down'], ['mute', 'Toggle microphone', 'mic', 'Ctrl+Shift+M'],
      ['deafen', 'Toggle deafen', 'headphones', 'Ctrl+Shift+D'], ['shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+char:slash'],
    ]),
  pack('telegram', 'Telegram Desktop', ['telegram', 'telegram-desktop', 'telegramdesktop', 'org.telegram.desktop'],
    'https://github.com/telegramdesktop/tdesktop/wiki/Keyboard-Shortcuts', [
      ['search-chat', 'Find in chat', 'search', 'Ctrl+F'], ['previous-chat', 'Previous chat', 'chevron-up', 'Ctrl+PageUp'],
      ['next-chat', 'Next chat', 'chevron-down', 'Ctrl+PageDown'], ['attach', 'Attach file', 'paperclip', 'Ctrl+O'],
      ['close-window', 'Close window', 'x', 'Ctrl+W'],
    ]),
  pack('mpv', 'mpv', ['mpv', 'io.mpv.mpv'], 'https://mpv.io/manual/stable/#interactive-control', [
    ['play-pause', 'Play or pause', 'circle-play', 'Space'], ['seek-back', 'Seek backward', 'rewind', 'Left'],
    ['seek-forward', 'Seek forward', 'fast-forward', 'Right'], ['frame-next', 'Next frame', 'step-forward', 'period'],
    ['frame-back', 'Previous frame', 'step-back', 'comma'], ['slower', 'Slow down', 'minus', 'char:['],
    ['faster', 'Speed up', 'plus', 'char:]'], ['normal-speed', 'Normal speed', 'timer-reset', 'Backspace'],
    ['show-subtitles', 'Show or hide subtitles', 'captions', 'V'], ['cycle-subtitles', 'Next subtitle track', 'captions', 'J'],
    ['mute', 'Mute', 'volume-x', 'M'], ['volume-down', 'Volume down', 'volume-1', '9'],
    ['volume-up', 'Volume up', 'volume-2', '0'], ['full-screen', 'Full screen', 'maximize', 'F'],
  ], { editing: false }),
  pack('filezilla', 'FileZilla Client', ['filezilla', 'org.filezillaproject.filezilla'], 'https://wiki.filezilla-project.org/Keyboard_shortcuts', [
    ['site-manager', 'Site Manager', 'server', 'Ctrl+S'], ['reconnect', 'Reconnect', 'plug', 'Ctrl+R'],
    ['new-tab', 'New connection tab', 'square-plus', 'Ctrl+T'], ['close-tab', 'Close tab', 'x', 'Ctrl+W'],
    ['refresh', 'Refresh file lists', 'refresh-cw', 'F5'], ['rename', 'Rename file', 'pencil', 'F2'],
    ['search-remote', 'Search remote files', 'search', 'F3'], ['bookmarks', 'Manage bookmarks', 'bookmark', 'Ctrl+Shift+B'],
  ], { editing: false }),
  pack('geany', 'Geany', ['geany', 'org.geany.geany'], 'https://github.com/geany/geany/blob/master/src/keybindings.c', [
    newFile, open, save, saveAs, find, ['find-files', 'Find in files', 'file-search', 'Ctrl+Shift+F'],
    ['replace', 'Replace text', 'replace', 'Ctrl+H'], ['go-to-line', 'Go to line', 'list-ordered', 'Ctrl+L'],
    ['compile', 'Compile', 'hammer', 'F8'], ['build', 'Build', 'boxes', 'F9'], ['run', 'Run', 'circle-play', 'F5'],
  ]),
  pack('dbeaver', 'DBeaver', ['dbeaver', 'dbeaver-ce', 'dbeaver-ee', 'io.dbeaver.dbeavercommunity'], 'https://dbeaver.com/docs/dbeaver/Shortcuts/', [
    ['shortcuts', 'Show shortcut list', 'keyboard', 'Ctrl+Shift+L'], ['sql-editor', 'Open SQL console', 'square-terminal', 'Ctrl+Alt+Enter'],
    ['format', 'Format SQL', 'align-left', 'Ctrl+Shift+F', { context: 'SQL editor' }],
    ['completion', 'SQL completion', 'list-plus', 'Ctrl+Space', { context: 'SQL editor' }],
    ['find', 'Find in editor', 'search', 'Ctrl+F'], ['properties', 'View selected object', 'database', 'F4'], save,
  ]),
  pack('wireshark', 'Wireshark', ['wireshark', 'org.wireshark.wireshark'], 'https://www.wireshark.org/docs/wsug_html_chunked/ChUseMainWindowSection.html', [
    open, saveAs, ['go-to-packet', 'Go to packet', 'navigation', 'Ctrl+G'], ['find-packet', 'Find packet', 'search', 'Ctrl+F'],
    ['next-packet', 'Next packet', 'chevron-down', 'F8'], ['previous-packet', 'Previous packet', 'chevron-up', 'F7'],
    ['expand-details', 'Expand details', 'list-tree', 'Ctrl+Right', { context: 'Packet details pane' }],
    ['preferences', 'Preferences', 'settings', 'Ctrl+Shift+P'],
  ], { editing: false }),
  ...[
    ['intellij', 'IntelliJ IDEA', ['jetbrains-idea', 'jetbrains-idea-ce', 'com.jetbrains.intellij-idea-community', 'com.jetbrains.intellij-idea-ultimate'], 'idea'],
    ['pycharm', 'PyCharm', ['jetbrains-pycharm', 'jetbrains-pycharm-ce', 'com.jetbrains.pycharm-community', 'com.jetbrains.pycharm-professional'], 'pycharm'],
    ['webstorm', 'WebStorm', ['jetbrains-webstorm', 'com.jetbrains.webstorm'], 'webstorm'],
    ['clion', 'CLion', ['jetbrains-clion', 'com.jetbrains.clion'], 'clion'],
    ['goland', 'GoLand', ['jetbrains-goland', 'com.jetbrains.goland'], 'go'],
    ['phpstorm', 'PhpStorm', ['jetbrains-phpstorm', 'com.jetbrains.phpstorm'], 'phpstorm'],
  ].map(([id, name, appIds, help]) => pack(id, name, appIds, `https://www.jetbrains.com/help/${help}/reference-keymap-win-default.html`, jetbrains)),
];
