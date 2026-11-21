// @ts-check
'use strict';

const { desktopPack: pack, usKey } = require('./shortcut-pack-data');

module.exports = [
  pack('windows-settings', 'Windows Settings', ['systemsettings.exe'], 'https://support.microsoft.com/en-us/accessibility/windows/keyboard-shortcuts-in-windows#bkmk-settings', [
    ['next-control', 'Focus next control', 'arrow-right', 'Tab'],
    ['previous-control', 'Focus previous control', 'arrow-left', 'Shift+Tab'],
    ['back', 'Previous Settings page', 'chevron-left', 'Backspace'],
  ], { editing: false }),
  pack('phone-link', 'Phone Link', ['phonelink.exe', 'yourphone.exe'], 'https://support.microsoft.com/en-us/windows/apps/phonelink/keyboard-shortcuts-for-phone-link', [
    ['next-control', 'Focus next control', 'arrow-right', 'Tab'],
    ['previous-control', 'Focus previous control', 'arrow-left', 'Shift+Tab'],
    ['copy', 'Copy selected text', 'copy', 'Ctrl+C'],
    ['paste', 'Paste into text field', 'clipboard-paste', 'Ctrl+V'],
  ], { appIds: ['microsoft.yourphone_8wekyb3d8bbwe!app'], editing: false }),
  pack('sticky-notes', 'Windows Sticky Notes', ['microsoft.notes.exe'],
    'https://support.microsoft.com/en-us/accessibility/windows/stickynotes/keyboard-shortcuts-for-sticky-notes', [
      ['new-note', 'New note', 'sticky-note', 'Ctrl+N'],
      ['close-window', 'Close current note', 'x', 'Ctrl+W'],
      ['next-note', 'Next note or notes list', 'chevron-right', 'Ctrl+Tab'],
      ['previous-note', 'Previous note', 'chevron-left', 'Ctrl+Shift+Tab'],
      ['bold', 'Bold text', 'bold', 'Ctrl+B'],
      ['italic', 'Italic text', 'italic', 'Ctrl+I'],
      ['bullets', 'Toggle bullet list', 'list', 'Ctrl+Shift+L'],
    ], { appIds: ['microsoft.microsoftstickynotes_8wekyb3d8bbwe!app'] }),
  pack('publisher', 'Microsoft Publisher', ['mspub.exe'], 'https://support.microsoft.com/en-us/publisher/keyboard-shortcuts-in-publisher', [
    ['new-publication', 'New publication', 'file-plus', 'Ctrl+N'],
    ['open-file', 'Open publication', 'folder-open', 'Ctrl+O'],
    ['save', 'Save publication', 'save', 'Ctrl+S'],
    ['print', 'Print publication', 'printer', 'Ctrl+P'],
    ['group', 'Group selected objects', 'group', 'Ctrl+Shift+G'],
    ['ungroup', 'Ungroup objects', 'ungroup', 'Ctrl+Shift+U'],
  ]),
  pack('powertoys', 'Microsoft PowerToys', ['powertoys.settings.exe'], 'https://learn.microsoft.com/en-us/windows/powertoys/', [
    ['command-palette', 'Open Command Palette', 'command', 'Win+Alt+Space',
      { context: 'With Command Palette enabled and its default key assigned', source: 'https://learn.microsoft.com/en-us/windows/powertoys/command-palette/overview' }],
    ['color-picker', 'Open Color Picker', 'pipette', 'Win+Shift+C',
      { context: 'With Color Picker enabled', source: 'https://learn.microsoft.com/en-us/windows/powertoys/color-picker' }],
    ['always-on-top', 'Pin foreground window', 'pin', 'Win+Ctrl+T',
      { context: 'Pins the current PowerToys window with Always On Top enabled', source: 'https://learn.microsoft.com/en-us/windows/powertoys/always-on-top' }],
    usKey('shortcut-guide', 'Open Shortcut Guide', 'keyboard', 'Win+Shift+/'),
  ], { editing: false }),
  pack('screentogif', 'ScreenToGif', ['screentogif.exe'], 'https://www.screentogif.com/how-to-use', [
    ['record-pause', 'Record or pause', 'circle-play', 'F7', { context: 'With the ScreenToGif recorder open' }],
    ['stop', 'Stop recording', 'square', 'F8', { context: 'While the recorder is active' }],
    ['save', 'Open Save As', 'save', 'Ctrl+S', { context: 'While editing frames' }],
    ['undo', 'Undo frame edit', 'undo-2', 'Ctrl+Z', { context: 'While editing frames' }],
    ['redo', 'Redo frame edit', 'redo-2', 'Ctrl+Y', { context: 'While editing frames' }],
  ], { editing: false }),
  pack('greenshot', 'Greenshot', ['greenshot.exe'], 'https://getgreenshot.org/help/', [
    ['capture-region', 'Capture region', 'scan', 'PrintScreen', { context: 'With Greenshot capture hotkeys enabled' }],
    ['capture-screen', 'Capture full screen', 'monitor', 'Ctrl+PrintScreen', { context: 'With Greenshot capture hotkeys enabled' }],
    ['capture-window', 'Capture active window', 'panel-top', 'Alt+PrintScreen', { context: 'With Greenshot capture hotkeys enabled' }],
    ['save', 'Save screenshot', 'save', 'Ctrl+S', { context: 'While in the image editor' }],
    ['copy', 'Copy edited screenshot', 'copy', 'Ctrl+Shift+C', { context: 'While in the image editor' }],
  ], { editing: false }),
  pack('files-community', 'Files (Windows file manager)', ['files.exe'], 'https://files.community/docs/customize-settings/actions', [
    ['palette', 'Command palette', 'command', 'Ctrl+Shift+P'],
    ['new-tab', 'New tab', 'square-plus', 'Ctrl+T'],
    ['close-tab', 'Close tab', 'x', 'Ctrl+W'],
    ['rename', 'Rename selection', 'pencil', 'F2'],
    ['search', 'Search folder', 'search', 'Ctrl+F'],
    ['new-folder', 'New folder', 'folder-plus', 'Ctrl+Shift+N'],
  ], { editing: false }),
  pack('onecommander', 'OneCommander', ['onecommander.exe'], 'https://onecommander.com/help/4._Shortcut_Keys.html', [
    ['new-tab', 'New tab', 'square-plus', 'Ctrl+T'],
    ['rename', 'Rename item', 'pencil', 'F2'],
    ['close-tab', 'Close tab', 'x', 'Ctrl+W'],
    ['refresh', 'Refresh folder', 'refresh-cw', 'F5'],
    ['properties', 'Show properties', 'info', 'Alt+Enter'],
  ], { editing: false }),
  pack('multi-commander', 'Multi Commander', ['multicommander.exe'], 'https://multicommander.com/docs/keyboard-shortcuts/CommanderStyle', [
    ['view', 'View file', 'scan-eye', 'F3'],
    ['edit', 'Edit file', 'pencil', 'F4'],
    ['copy-to', 'Copy to other pane', 'copy', 'F5'],
    ['move-to', 'Move to other pane', 'folder-output', 'F6'],
    ['new-folder', 'Create folder', 'folder-plus', 'F7'],
  ], { editing: false }),
  pack('peazip', 'PeaZip', ['peazip.exe'], 'https://peazip.github.io/peazip-help.html', [
    ['add-archive', 'Add to archive', 'archive', 'Ctrl+N'],
    ['open-archive', 'Open archive', 'folder-open', 'Ctrl+O'],
    ['rename', 'Rename selection', 'pencil', 'F2'],
    ['refresh', 'Refresh file list', 'refresh-cw', 'F5'],
  ], { editing: false }),
  pack('winzip', 'WinZip', ['winzip32.exe', 'winzip64.exe'], 'https://kb.winzip.com/en/130601', [
    ['new-archive', 'New Zip file', 'archive', 'Ctrl+N'],
    ['open-archive', 'Open Zip file', 'folder-open', 'Ctrl+O'],
    ['extract', 'Extract files dialog', 'folder-output', 'Shift+E'],
    ['select-all', 'Select all files', 'square-dashed', 'Ctrl+A'],
  ], { editing: false }),
  pack('freefilesync', 'FreeFileSync', ['freefilesync.exe', 'freefilesync_x64.exe', 'freefilesync_win32.exe'],
    'https://freefilesync.org/manual.php', [
      ['compare', 'Compare folders', 'git-compare', 'F5'],
      ['open', 'Open configuration', 'folder-open', 'Ctrl+O'],
      ['save', 'Save configuration', 'save', 'Ctrl+S'],
    ], { editing: false }),
];
