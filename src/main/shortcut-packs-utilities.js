// @ts-check
'use strict';

const { desktopPack: pack } = require('./shortcut-pack-data');

module.exports = [
  pack('opera', 'Opera', ['opera.exe'], 'https://help.opera.com/en/latest/shortcuts/', [
    ['new-tab', 'New tab', 'square-plus', 'Ctrl+T'],
    ['restore-tab', 'Restore closed tab', 'rotate-ccw', 'Ctrl+Shift+T'],
    ['history', 'History', 'history', 'Ctrl+H'],
    ['downloads', 'Downloads', 'download', 'Ctrl+J'],
    ['close-tab', 'Close tab', 'x', 'Ctrl+W'],
  ]),
  pack('vivaldi', 'Vivaldi', ['vivaldi.exe'], 'https://help.vivaldi.com/desktop/shortcuts/keyboard-shortcuts/', [
    ['quick-commands', 'Quick Commands', 'command', 'F2'],
    ['panels', 'Toggle panels', 'panel-left', 'F4'],
    ['new-tab', 'New tab', 'square-plus', 'Ctrl+T'],
    ['close-tab', 'Close tab', 'x', 'Ctrl+W'],
  ]),
  pack('zen-browser', 'Zen Browser', ['zen.exe'], 'https://docs.zen-browser.app/user-manual/shortcuts', [
    ['new-tab', 'New tab', 'square-plus', 'Ctrl+T'],
    ['new-window', 'New window', 'panels-top-left', 'Ctrl+N'],
    ['address', 'Focus address bar', 'link', 'Ctrl+L'],
  ]),
  pack('7zip', '7-Zip File Manager', ['7zfm.exe'], 'https://7-zip.opensource.jp/chm/fm/menu.htm', [
    ['rename', 'Rename item', 'pencil', 'F2'],
    ['view', 'View item', 'scan-eye', 'F3'],
    ['copy-to', 'Copy item to folder', 'copy', 'F5'],
    ['move-to', 'Move item to folder', 'folder-output', 'F6'],
    ['new-folder', 'Create folder', 'folder-plus', 'F7'],
  ], { editing: false }),
  pack('winrar', 'WinRAR', ['winrar.exe'], 'https://documentation.help/WinRAR/HELPKeyboard.htm', [
    ['add', 'Add to archive', 'archive', 'Alt+A'],
    ['extract', 'Extract files to folder', 'folder-output', 'Alt+E'],
    ['test', 'Test archive', 'file-check', 'Alt+T'],
    ['view', 'View file', 'scan-eye', 'Alt+V'],
  ], { editing: false }),
  pack('everything', 'Everything', ['everything.exe', 'everything64.exe'], 'https://www.voidtools.com/support/everything/keyboard_shortcuts/', [
    ['find', 'Focus search', 'search', 'Ctrl+F'],
    ['new-window', 'New search window', 'panels-top-left', 'Ctrl+N'],
    ['copy-path', 'Copy full path', 'clipboard-copy', 'Ctrl+Shift+C'],
    ['rename', 'Rename selected item', 'pencil', 'F2'],
  ], { editing: false }),
  pack('total-commander', 'Total Commander', ['totalcmd64.exe', 'totalcmd.exe'], 'https://www.ghisler.com/screenshots/en/02.html', [
    ['view', 'View file', 'scan-eye', 'F3'],
    ['copy-to', 'Copy to other pane', 'copy', 'F5'],
    ['move-to', 'Move or rename', 'folder-output', 'F6'],
    ['new-folder', 'Create folder', 'folder-plus', 'F7'],
  ], { editing: false }),
  pack('double-commander', 'Double Commander', ['doublecmd.exe'], 'https://doublecmd.github.io/doc/en/shortcuts.html', [
    ['view', 'View file', 'scan-eye', 'F3'],
    ['copy-to', 'Copy to other pane', 'copy', 'F5'],
    ['move-to', 'Move or rename', 'folder-output', 'F6'],
    ['new-folder', 'Create folder', 'folder-plus', 'F7'],
  ], { editing: false }),
  pack('directory-opus', 'Directory Opus', ['dopus.exe'], 'https://docs.dopus.com/doku.php?id=reference:keyboard_shortcuts', [
    ['rename', 'Rename selected files', 'pencil', 'F2'],
    ['refresh', 'Refresh folder', 'refresh-cw', 'F5'],
    ['new-tab', 'New folder tab', 'square-plus', 'Ctrl+T'],
  ], { editing: false }),
  pack('freecommander', 'FreeCommander', ['freecommander.exe'], 'https://www.freecommander.com/fchelpxe/en/Keyboardshortcuts.html', [
    ['view', 'View file', 'scan-eye', 'F3'],
    ['copy-to', 'Copy to other pane', 'copy', 'F5'],
    ['move-to', 'Move to other pane', 'folder-output', 'F6'],
    ['new-folder', 'Create folder', 'folder-plus', 'F7'],
  ], { editing: false }),
  pack('filezilla', 'FileZilla Client', ['filezilla.exe'], 'https://wiki.filezilla-project.org/Keyboard_shortcuts', [
    ['site-manager', 'Site Manager', 'server', 'Ctrl+S'],
    ['reconnect', 'Reconnect to server', 'plug', 'Ctrl+R'],
    ['new-tab', 'New tab', 'square-plus', 'Ctrl+T'],
    ['refresh', 'Refresh file lists', 'refresh-cw', 'F5'],
  ], { editing: false }),
  pack('winscp', 'WinSCP', ['winscp.exe'], 'https://winscp.net/eng/docs/ui_explorer_menu', [
    ['new-session', 'New connection tab', 'plug', 'Ctrl+N'],
    ['rename', 'Rename file', 'pencil', 'F2'],
    ['refresh', 'Refresh', 'refresh-cw', 'Ctrl+R'],
  ], { editing: false }),
  pack('qbittorrent', 'qBittorrent', ['qbittorrent.exe'], 'https://github.com/qbittorrent/qBittorrent/wiki/Frequently-Asked-Questions#hotkeys', [
    ['add-torrent-file', 'Add torrent file', 'file-plus', 'Ctrl+O'],
    ['add-torrent-link', 'Add torrent link', 'link', 'Ctrl+Shift+O'],
    ['preferences', 'Preferences', 'settings', 'Alt+O'],
  ], { editing: false }),
  pack('calibre', 'calibre', ['calibre.exe'], 'https://manual.calibre-ebook.com/gui.html#keyboard-shortcuts', [
    ['add-books', 'Add books', 'book-plus', 'A'],
    ['edit-metadata', 'Edit metadata', 'pencil', 'E'],
    ['convert-books', 'Convert books dialog', 'file-output', 'C'],
    ['read', 'View book', 'book-open', 'V'],
  ], { editing: false }),
  pack('kindle', 'Kindle for PC', ['kindle.exe'], 'https://www.amazon.com/gp/help/customer/display.html?nodeId=G201246000', [
    ['previous-page', 'Previous page', 'chevron-left', 'Left'],
    ['next-page', 'Next page', 'chevron-right', 'Right'],
    ['find', 'Search in book', 'search', 'Ctrl+F'],
  ], { editing: false }),
  pack('sharex', 'ShareX', ['sharex.exe'], 'https://getsharex.com/changelog', [
    ['region', 'Capture region', 'scan', 'Ctrl+PrintScreen'],
    ['window', 'Capture active window', 'panel-top', 'Alt+PrintScreen'],
    ['screen', 'Capture screen', 'monitor', 'PrintScreen'],
  ], { editing: false }),
  pack('sysinternals-process-explorer', 'Sysinternals Process Explorer', ['procexp.exe', 'procexp64.exe', 'procexp64a.exe'],
    'https://learn.microsoft.com/en-us/sysinternals/downloads/process-explorer', [
      ['find', 'Find handle or DLL', 'search', 'Ctrl+F'],
      ['properties', 'Process properties', 'info', 'Enter'],
      ['lower-pane', 'Toggle lower pane', 'panel-bottom', 'Ctrl+L'],
    ], { editing: false }),
  pack('nvda', 'NVDA', ['nvda.exe'], 'https://download.nvaccess.org/documentation/userGuide.html', [
    ['menu', 'NVDA menu', 'menu', 'Insert+N'],
    ['settings', 'NVDA settings', 'settings', 'Insert+Ctrl+G'],
    ['input-help', 'Toggle input help', 'keyboard', 'Insert+1'],
  ], { editing: false }),
  pack('microsoft-to-do', 'Microsoft To Do', ['todo.exe'], 'https://support.microsoft.com/en-us/todo/using-keyboard-shortcuts-in-microsoft-to-do', [
    ['new-task', 'New task', 'list-plus', 'Ctrl+N'],
    ['new-list', 'New list', 'list-todo', 'Ctrl+L'],
    ['my-day', 'Add task to My Day', 'calendar-plus', 'Ctrl+T'],
    ['search', 'Search tasks', 'search', 'Ctrl+F'],
  ], { appIds: ['microsoft.todos_8wekyb3d8bbwe!app'] }),
  pack('apple-music', 'Apple Music', ['applemusic.exe'], 'https://support.apple.com/guide/music-windows/mus1019/windows', [
    ['play-pause', 'Play or pause', 'circle-play', 'Ctrl+Space'],
    ['previous-track', 'Previous song', 'skip-back', 'Ctrl+Left'],
    ['next-track', 'Next song', 'skip-forward', 'Ctrl+Right'],
    ['mini-player', 'Open MiniPlayer', 'panel-top', 'Ctrl+Shift+M'],
  ], { editing: false }),
];
