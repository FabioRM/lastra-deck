// @ts-check
'use strict';

const { shortcutGroup: group } = require('./shortcut-pack-data');

const keys = [
  ...group('Find and navigate code', [
    ['find-in-files', 'Find in Files', 'search', 'Ctrl+Shift+F'],
    ['replace-in-files', 'Replace in Files', 'replace', 'Ctrl+Shift+R'],
    ['recent-files', 'Recent Files', 'history', 'Ctrl+E'],
    ['file-structure', 'File Structure', 'list-tree', 'Ctrl+F12'],
    ['project-window', 'Open Project window', 'panel-left', 'Alt+1'],
    ['definition', 'Go to declaration', 'arrow-right', 'Ctrl+B'],
  ], { context: 'With the default Windows keymap and the intended project open' }),
  ...group('Editor and refactoring', [
    ['reformat', 'Reformat code', 'align-left', 'Ctrl+Alt+L'],
    ['duplicate-line', 'Duplicate line', 'copy', 'Ctrl+D'],
    ['basic-completion', 'Basic completion', 'list-plus', 'Ctrl+Space'],
    ['surround-with', 'Surround with', 'group', 'Ctrl+Alt+T'],
    ['refactor-this', 'Refactor This', 'wand-sparkles', 'Ctrl+Alt+Shift+T'],
  ], { context: 'While the code editor has focus with the default Windows keymap' }),
];

const ids = ['intellij', 'pycharm', 'webstorm', 'phpstorm', 'goland', 'clion', 'rubymine', 'rustrover', 'android-studio'];

module.exports = Object.fromEntries(ids.map((id) => [id, keys]));
