// @ts-check
'use strict';

const { desktopPack: pack, usKey } = require('./shortcut-pack-data');

const player = { editing: false };
const mailSource = 'https://support.mozilla.org/en-US/kb/keyboard-shortcuts-thunderbird';

module.exports = [
  pack('winamp', 'Winamp', ['winamp.exe'], 'https://help.winamp.com/hc/en-us/articles/8104087665556-Keyboard-Shortcuts', [
    ['play', 'Play', 'play', 'X'],
    ['pause', 'Pause or resume', 'pause', 'C'],
    ['stop', 'Stop playback', 'square', 'V'],
    ['previous', 'Previous track', 'skip-back', 'Z'],
    ['next', 'Next track', 'skip-forward', 'B'],
    ['jump', 'Jump to file', 'file-search', 'J'],
    ['open-file', 'Open file', 'folder-open', 'L'],
  ], player),
  pack('kodi', 'Kodi', ['kodi.exe'], 'https://kodi.wiki/view/Keyboard_controls', [
    ['play-pause', 'Play or pause', 'circle-play', 'Space'],
    ['stop', 'Stop playback', 'square', 'X'],
    ['rewind', 'Rewind', 'rewind', 'R'],
    ['fast-forward', 'Fast forward', 'fast-forward', 'F'],
    ['subtitles', 'Toggle subtitles', 'captions', 'T'],
    ['return-video', 'Toggle full-screen video', 'maximize', 'Tab'],
  ], player),
  pack('ffplay', 'FFplay', ['ffplay.exe'], 'https://ffmpeg.org/ffplay.html#While-playing', [
    ['play-pause', 'Play or pause', 'circle-play', 'Space'],
    ['mute', 'Toggle mute', 'volume-x', 'M'],
    ['full-screen', 'Toggle full screen', 'maximize', 'F'],
    ['seek-back', 'Seek backward 10 s', 'rewind', 'Left'],
    ['seek-forward', 'Seek forward 10 s', 'fast-forward', 'Right'],
    ['step-frame', 'Step one frame', 'step-forward', 'S'],
  ], player),
  pack('smplayer', 'SMPlayer', ['smplayer.exe'], 'https://github.com/smplayer-dev/smplayer/blob/master/src/basegui.cpp', [
    ['open-file', 'Open file', 'folder-open', 'Ctrl+F'],
    ['play-pause', 'Play or pause', 'circle-play', 'Space'],
    ['full-screen', 'Toggle full screen', 'maximize', 'F'],
    ['seek-back', 'Seek backward', 'rewind', 'Left'],
    ['seek-forward', 'Seek forward', 'fast-forward', 'Right'],
  ], player),
  pack('mpc-be', 'MPC-BE', ['mpc-be.exe', 'mpc-be64.exe'], 'https://github.com/Aleksoid1978/MPC-BE/blob/master/src/apps/mplayerc/AppSettings.cpp', [
    ['play-pause', 'Play or pause', 'circle-play', 'Space'],
    ['open-file', 'Quick open file', 'folder-open', 'Ctrl+Q'],
    ['full-screen', 'Toggle full screen', 'maximize', 'Alt+Enter'],
    ['mute', 'Toggle mute', 'volume-x', 'Ctrl+M'],
  ], player),
  pack('mediamonkey', 'MediaMonkey', ['mediamonkey.exe', 'mediamonkey64.exe'], 'https://www.mediamonkey.com/wiki/WebHelp%3AKeyboard_Shortcuts', [
    ['search', 'Search media library', 'search', 'Ctrl+F'],
    ['edit-properties', 'Edit track properties', 'tags', 'Shift+Enter'],
    ['play-pause', 'Play or pause', 'circle-play', 'Ctrl+P'],
    ['next-track', 'Next track', 'skip-forward', 'Ctrl+N'],
  ], player),
  pack('okular', 'Okular', ['okular.exe'], 'https://docs.kde.org/stable_kf6/en/okular/okular/okular.pdf', [
    ['open-file', 'Open document', 'folder-open', 'Ctrl+O'],
    ['find', 'Find in document', 'search', 'Ctrl+F'],
    ['presentation', 'Presentation mode', 'presentation', 'Ctrl+Shift+P'],
    ['first-page', 'First page', 'arrow-up-to-line', 'Ctrl+Home'],
    ['last-page', 'Last page', 'arrow-down-to-line', 'Ctrl+End'],
    ['print', 'Print document', 'printer', 'Ctrl+P'],
  ], player),
  pack('xournalpp', 'Xournal++', ['xournalpp.exe'], 'https://xournalpp.github.io/guide/pdfs/', [
    ['open-file', 'Open notebook', 'folder-open', 'Ctrl+O'],
    ['save', 'Save notebook', 'save', 'Ctrl+S'],
    ['new-notebook', 'New notebook', 'notebook', 'Ctrl+N'],
    ['find', 'Find PDF text', 'search', 'Ctrl+F'],
    ['undo', 'Undo stroke', 'undo-2', 'Ctrl+Z'],
  ]),
  pack('anki', 'Anki', ['anki.exe'], 'https://docs.ankiweb.net/studying.html', [
    ['decks', 'Decks', 'layers', 'D'],
    ['add', 'Add note', 'file-plus', 'A'],
    ['browse', 'Browse cards', 'search', 'B'],
    ['stats', 'Statistics', 'chart-column', 'T'],
    ['undo-review', 'Undo last review', 'undo-2', 'Ctrl+Z', { context: 'While reviewing a deck' }],
  ], player),
  pack('zotero', 'Zotero', ['zotero.exe'], 'https://www.zotero.org/support/kb/keyboard_shortcuts', [
    ['find', 'Search current library', 'search', 'Ctrl+F'],
    ['new-item', 'New item', 'file-plus', 'Ctrl+Shift+N'],
    ['copy-citation', 'Copy citation', 'clipboard-copy', 'Ctrl+Shift+A'],
    ['copy-bibliography', 'Copy bibliography', 'copy', 'Ctrl+Shift+C'],
  ]),
  pack('jabref', 'JabRef', ['jabref.exe'], 'https://docs.jabref.org/setup/customkeybindings', [
    ['new-entry', 'New reference', 'file-plus', 'Ctrl+N', { source: 'https://docs.jabref.org/collect/add-entry-manually' }],
    ['open-library', 'Open library', 'folder-open', 'Ctrl+O'],
    ['save-library', 'Save library', 'save', 'Ctrl+S'],
    ['close-library', 'Close library tab', 'x', 'Ctrl+W'],
  ]),
  pack('logseq', 'Logseq', ['logseq.exe'], 'https://github.com/logseq/logseq/blob/master/src/main/frontend/modules/shortcut/config.cljs', [
    ['search', 'Search graph', 'search', 'Ctrl+K'],
    ['undo', 'Undo edit', 'undo-2', 'Ctrl+Z'],
    ['indent', 'Indent block', 'indent-increase', 'Tab', { context: 'While editing a Logseq block' }],
    ['outdent', 'Outdent block', 'indent-decrease', 'Shift+Tab', { context: 'While editing a Logseq block' }],
  ]),
  pack('mattermost', 'Mattermost', ['mattermost.exe'], 'https://docs.mattermost.com/help/messaging/keyboard-shortcuts', [
    ['switcher', 'Switch channel', 'search', 'Ctrl+K'],
    ['search', 'Search messages', 'message-square', 'Ctrl+Shift+F'],
    ['mark-unread', 'Previous unread', 'chevron-up', 'Alt+Shift+Up'],
    ['next-unread', 'Next unread', 'chevron-down', 'Alt+Shift+Down'],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+/'),
  ]),
  pack('rocket-chat', 'Rocket.Chat', ['rocketchat.exe', 'rocket.chat.exe'], 'https://docs.rocket.chat/v1/docs/your-rocketchat-account', [
    ['search', 'Find channels or users', 'search', 'Ctrl+K'],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+/'),
  ]),
  pack('viber', 'Rakuten Viber', ['viber.exe'], 'https://help.viber.com/hc/en-us/articles/8820723236253-Keyboard-shortcuts-for-Viber-on-desktop', [
    ['search', 'Search Viber', 'search', 'Ctrl+F'],
    ['stickers', 'Toggle stickers', 'sticker', 'Ctrl+S'],
    ['dialer', 'Show dialer', 'phone', 'Ctrl+D'],
    ['full-screen-video', 'Full-screen video', 'maximize', 'Ctrl+Shift+F'],
  ]),
  pack('element', 'Element', ['element.exe'], 'https://docs.element.io/latest/element-support/element-webdesktop-client-settings/keyboard-settings/', [
    ['switch-room', 'Switch room', 'search', 'Ctrl+K'],
    ['previous-room', 'Previous room', 'chevron-up', 'Alt+Up'],
    ['next-room', 'Next room', 'chevron-down', 'Alt+Down'],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+/'),
  ]),
  pack('mailspring', 'Mailspring', ['mailspring.exe'], 'https://github.com/Foundry376/Mailspring/blob/master/app/keymaps/base.json', [
    ['compose', 'Compose mail', 'mail-plus', 'Ctrl+N'],
    ['quick-search', 'Search mail', 'search', 'Ctrl+F'],
    ['reply', 'Reply to message', 'reply', 'Ctrl+R'],
  ]),
  pack('betterbird', 'Betterbird', ['betterbird.exe'], mailSource, [
    ['compose', 'Compose mail', 'mail-plus', 'Ctrl+N'],
    ['quick-search', 'Global search', 'search', 'Ctrl+K'],
    ['quick-filter', 'Quick Filter', 'list-filter', 'Ctrl+Shift+K'],
    ['reply', 'Reply to message', 'reply', 'Ctrl+R'],
  ]),
  pack('upnote', 'UpNote', ['upnote.exe'], 'https://help.getupnote.com/more/keyboard-shortcuts', [
    ['new-note', 'New note', 'file-plus', 'Ctrl+N'],
    ['search', 'Search notes', 'search', 'Ctrl+Shift+F'],
    ['find', 'Find in current note', 'text-search', 'Ctrl+F'],
    ['insert-link', 'Insert link', 'link', 'Ctrl+K'],
  ]),
  pack('pdf-arranger', 'PDF Arranger', ['pdfarranger.exe'], 'https://github.com/pdfarranger/pdfarranger/blob/main/pdfarranger/config.py', [
    ['open', 'Import PDF', 'folder-open', 'Ctrl+O'],
    ['save', 'Save rearranged PDF', 'save', 'Ctrl+S'],
    ['save-as', 'Save as', 'save-all', 'Ctrl+Shift+S'],
    ['undo', 'Undo page edit', 'undo-2', 'Ctrl+Z'],
    ['rotate-left', 'Rotate pages left', 'rotate-ccw', 'Ctrl+Left'],
    ['rotate-right', 'Rotate pages right', 'rotate-cw', 'Ctrl+Right'],
  ], player),
];
