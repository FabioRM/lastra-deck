// @ts-check
'use strict';

const { shortcutGroup } = require('./shortcut-pack-data');

const matlabEditor = 'https://www.mathworks.com/help/matlab/matlab_prog/editor-keyboard-shortcuts.html';
const editor = { source: matlabEditor, context: 'With the MATLAB Editor focused' };

module.exports = {
  solidworks: [
    ...shortcutGroup('Documents and workspace', [
      ['new-file', 'New document', 'file-plus', 'Ctrl+N'],
      ['open-file', 'Open document', 'folder-open', 'Ctrl+O'],
      ['save', 'Save document', 'save', 'Ctrl+S'],
      ['next-document', 'Next open document', 'files', 'Ctrl+Tab'],
      ['feature-manager', 'Toggle FeatureManager', 'panel-left', 'F9'],
      ['toolbars', 'Toggle toolbars', 'panels-top-left', 'F10'],
      ['fullscreen', 'Toggle full screen', 'maximize', 'F11'],
      ['filter-toolbar', 'Selection filter bar', 'list-filter', 'F5'],
      ['filter-enable', 'Toggle selection filter', 'filter', 'F6'],
      ['command-search', 'Search commands', 'search', 'W'],
    ]),
    ...shortcutGroup('Standard views', [
      ['orientation', 'View orientation', 'compass', 'Space'],
      ['front', 'Front view', 'square', 'Ctrl+1'],
      ['back', 'Back view', 'square', 'Ctrl+2'],
      ['left', 'Left view', 'square', 'Ctrl+3'],
      ['right', 'Right view', 'square', 'Ctrl+4'],
      ['top', 'Top view', 'square', 'Ctrl+5'],
      ['bottom', 'Bottom view', 'square', 'Ctrl+6'],
      ['isometric', 'Isometric view', 'box', 'Ctrl+7'],
      ['normal-to', 'Normal to', 'scan-eye', 'Ctrl+8'],
      ['previous-view', 'Previous view', 'history', 'Ctrl+Shift+Z'],
      ['zoom-out', 'Zoom out', 'zoom-out', 'Z'],
      ['zoom-in', 'Zoom in', 'zoom-in', 'Shift+Z'],
    ], { context: 'With the graphics area focused' }),
    ...shortcutGroup('Assemblies and parts', [
      ['hide-component', 'Hide under pointer', 'eye-off', 'Tab'],
      ['show-component', 'Show under pointer', 'eye', 'Shift+Tab'],
      ['hidden-components', 'Show hidden temporarily', 'eye', 'Ctrl+Shift+Tab'],
    ], { context: 'Point at a component or body in the graphics area' }),
  ],
  matlab: [
    ...shortcutGroup('Editor navigation', [
      ['focus-editor', 'Focus Editor', 'panel-left', 'Ctrl+Shift+0'],
      ['save', 'Save active file', 'save', 'Ctrl+S'],
      ['reopen', 'Reopen closed file', 'history', 'Ctrl+Shift+T'],
      ['go-to-line', 'Go to line', 'list-ordered', 'Ctrl+G'],
      ['set-bookmark', 'Toggle bookmark', 'bookmark', 'Ctrl+F2'],
      ['next-bookmark', 'Next bookmark', 'chevron-right', 'F2'],
      ['previous-bookmark', 'Previous bookmark', 'chevron-left', 'Shift+F2'],
      ['previous-variable', 'Previous variable use', 'arrow-up', 'Alt+Up'],
      ['next-variable', 'Next variable use', 'arrow-down', 'Alt+Down'],
      ['find', 'Find in file', 'search', 'Ctrl+F'],
      ['replace', 'Find and replace', 'replace', 'Ctrl+H'],
    ], editor),
    ...shortcutGroup('Edit code', [
      ['comment', 'Comment lines', 'message-square', 'Ctrl+R'],
      ['uncomment', 'Uncomment lines', 'message-square-off', 'Ctrl+Shift+R'],
      ['wrap-comments', 'Wrap comments', 'wrap-text', 'Ctrl+J'],
      ['smart-indent', 'Smart indent', 'indent-increase', 'Ctrl+I'],
      ['duplicate-line', 'Duplicate line', 'copy', 'Ctrl+Shift+C'],
      ['insert-section', 'Insert section break', 'list-plus', 'Ctrl+Alt+Enter'],
      ['previous-section', 'Previous code section', 'arrow-up', 'Ctrl+Up'],
      ['next-section', 'Next code section', 'arrow-down', 'Ctrl+Down'],
    ], editor),
    ...shortcutGroup('Run and debug', [
      ['run', 'Run file or continue', 'play', 'F5', { confirm: true }],
      ['run-section', 'Run section', 'play', 'Ctrl+Enter', { confirm: true }],
      ['run-next-section', 'Run section and advance', 'skip-forward', 'Ctrl+Shift+Enter', { confirm: true }],
      ['pause', 'Pause execution', 'pause', 'Ctrl+F5'],
      ['breakpoint', 'Toggle breakpoint', 'circle-dot', 'F12'],
      ['step', 'Step over', 'arrow-right', 'F10'],
      ['step-in', 'Step in', 'arrow-down', 'F11'],
      ['step-out', 'Step out', 'arrow-up', 'Shift+F11'],
      ['stop', 'Quit execution', 'square', 'Shift+F5', { confirm: true }],
    ], editor),
  ],
};
