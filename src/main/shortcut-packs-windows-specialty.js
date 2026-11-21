// @ts-check
'use strict';

const { desktopPack: pack, shortcutGroup: group } = require('./shortcut-pack-data');

const remote = { context: 'With an active remote session focused and the default client hotkeys enabled' };
const manage = { context: 'In Manage mode with the folder list focused' };

module.exports = [
  pack('reason', 'Reason', ['reason.exe'], 'https://docs.reasonstudios.com/reason12/key-commands', [
    ['mixer', 'Main Mixer', 'sliders-horizontal', 'F5'],
    ['rack', 'Rack', 'server', 'F6'],
    ['sequencer', 'Sequencer', 'list-music', 'F7'],
    ['all-in-one', 'Show all in one window', 'panels-top-left', 'Ctrl+F7'],
    ['import-audio', 'Import audio file', 'file-input', 'Ctrl+Shift+I'],
    ['save', 'Save song', 'save', 'Ctrl+S'],
  ]),
  pack('vegas-pro', 'VEGAS Pro', ['vegas.exe'], 'https://help.magix-hub.com/video/vegas/en/content/topics/shortcutkeys.htm', [
    ['save', 'Save project', 'save', 'Ctrl+S'],
    ['open', 'Open project', 'folder-open', 'Ctrl+O'],
    ['play', 'Play or pause', 'circle-play', 'Space'],
    ...group('Timeline events', [
      ['split', 'Split events at cursor', 'scissors', 'S'],
      ['smart-split', 'Smart Split event', 'scissors', 'Alt+S'],
      ['rename-event', 'Rename selected event', 'pencil', 'F2'],
      ['paste-insert', 'Paste insert', 'clipboard-paste', 'Ctrl+Shift+V'],
      ['paste-repeat', 'Paste repeat', 'repeat', 'Ctrl+B'],
    ], { context: 'With the timeline and intended events focused' }),
  ], { executablePattern: /^vegas\d+\.exe$/i }),
  pack('kobo-desktop', 'Kobo Desktop', ['kobo.exe'], 'https://help.kobo.com/hc/en-us/articles/360041963833-Read-on-the-Kobo-Desktop-app', [
    ['previous-page', 'Previous book page', 'chevron-left', 'Left', { context: 'While reading an open book' }],
    ['next-page', 'Next book page', 'chevron-right', 'Right', { context: 'While reading an open book' }],
  ], { editing: false }),
  pack('logos', 'Logos', ['logos.exe'], 'https://support.logos.com/hc/en-us/articles/360016370932-Keyboard-Shortcuts', [
    ['library', 'Open Library', 'library-big', 'Ctrl+L'],
    ['history', 'Open History', 'history', 'Ctrl+H'],
    ['favorite', 'Add to Favorites', 'bookmark-plus', 'Ctrl+D'],
    ['find', 'Find in current panel', 'search', 'Ctrl+F'],
    ['jump', 'Focus navigation box', 'navigation', 'Ctrl+G'],
    ['read-aloud', 'Read aloud', 'audio-lines', 'Ctrl+R'],
    ['close-panel', 'Close current panel', 'x', 'Ctrl+W', { confirm: true }],
  ]),
  pack('parsec', 'Parsec', ['parsecd.exe', 'parsec.exe'], 'https://support.parsec.app/hc/en-us/articles/32381778420372-Configure-Hotkeys', [
    ['menu', 'Open session menu', 'menu', 'Ctrl+Shift+M', remote],
    ['chat', 'Open session chat', 'message-square', 'Ctrl+Shift+C', remote],
    ['switch-display', 'Switch remote display', 'monitor', 'Ctrl+Shift+D', remote],
    ['window-mode', 'Toggle window mode', 'maximize', 'Ctrl+Shift+W', remote],
  ], { editing: false }),
  pack('anydesk', 'AnyDesk', ['anydesk.exe'], 'https://support.anydesk.com/docs/keyboard-hotkeys', [
    ['previous-display', 'Previous remote display', 'chevron-left', 'Ctrl+Alt+Shift+Left', remote],
    ['next-display', 'Next remote display', 'chevron-right', 'Ctrl+Alt+Shift+Right', remote],
    ['fullscreen', 'Toggle full screen', 'maximize', 'Ctrl+Alt+Shift+Enter', remote],
    ['size-native', 'View at native size', 'monitor', 'Ctrl+Alt+Shift+F2', remote],
    ['size-shrink', 'Shrink to fit', 'minimize', 'Ctrl+Alt+Shift+F3', remote],
    ['size-stretch', 'Stretch to fit', 'maximize', 'Ctrl+Alt+Shift+F4', remote],
  ], { editing: false }),
  pack('solvespace', 'SolveSpace', ['solvespace.exe'], 'https://solvespace.com/forum.pl?action=attachment&id=5', [
    ['new-sketch', 'New sketch document', 'file-plus', 'Ctrl+N'],
    ['open', 'Open sketch document', 'folder-open', 'Ctrl+O'],
    ['save', 'Save sketch document', 'save', 'Ctrl+S'],
  ]),
  pack('acdsee-photo-studio', 'ACDSee Photo Studio', ['acdseehome29.exe', 'acdseepro18.exe'],
    'https://help.acdsystems.com/en/acdsee-home-29/acdsee29.pdf', [
      ['manage-mode', 'Switch to Manage mode', 'layout-grid', 'Ctrl+F1'],
      ['new-tab', 'New folder tab', 'square-plus', 'Ctrl+T', manage],
      ['open-item', 'Open item in View mode', 'image', 'Enter', { context: 'With an image selected in Manage mode',
        source: 'https://help.acdsystems.com/en/acdsee-home-23/Content/1Topics/9_Shortcuts/Browser_keyboard_shortcuts.htm' }],
      ['fullscreen', 'Toggle full screen', 'maximize', 'F', { context: 'In View mode',
        source: 'https://help.acdsystems.com/en/acdsee-19/Content/1Topics/1_Getting_started/Using_the_Viewer.htm' }],
    ], { executablePattern: /^acdsee(?:home|pro|ultimate)\d+\.exe$/i }),
];
