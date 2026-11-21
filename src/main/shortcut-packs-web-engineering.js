// @ts-check
'use strict';

const { webPack, shortcutGroup } = require('./shortcut-pack-data');

module.exports = [
  webPack('easyeda-pro', 'EasyEDA Pro', ['https://pro.easyeda.com/editor'],
    'https://prodocs.easyeda.com/en/introduction/hotkeys/', [
      ['save-all', 'Save all', 'save', 'Ctrl+S'],
      ['fit-all', 'Fit all', 'maximize', 'K'],
      ['net-highlight', 'Highlight net', 'highlighter', 'H'],
      ['bottom-panel', 'Toggle bottom panel', 'panel-bottom', 'S'],
      ...shortcutGroup('Canvas and editing', [
        ['new-project', 'New project', 'file-plus', 'Shift+N'],
        ['redo', 'Redo', 'redo-2', 'Ctrl+Y'],
        ['undo', 'Undo', 'undo-2', 'Ctrl+Z'],
        ['copy', 'Copy', 'copy', 'Ctrl+C'],
        ['cut', 'Cut', 'scissors', 'Ctrl+X'],
        ['paste', 'Paste', 'clipboard-paste', 'Ctrl+V'],
        ['units', 'Switch units', 'ruler', 'Q'],
        ['move-center', 'Move by center', 'move', 'M'],
        ['rotate', 'Rotate left', 'rotate-ccw', 'Space'],
        ['clear-net', 'Clear net highlighting', 'eye-off', 'Shift+H'],
        ['snap-grid', 'Snap to grid', 'magnet', 'Ctrl+Shift+G'],
        ['repeat-to-cursor', 'Repeat to cursor', 'copy', 'Ctrl+D'],
        ['group', 'Group selection', 'group', 'Ctrl+G'],
        ['ungroup', 'Ungroup', 'ungroup', 'Shift+G'],
      ], { context: 'With the design canvas focused' }),
    ], { pathScoped: true }),
];
