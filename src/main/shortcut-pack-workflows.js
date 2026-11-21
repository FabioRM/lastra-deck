// @ts-check
'use strict';

const { shortcutGroup: group, usKey } = require('./shortcut-pack-data');

const illustratorPanels = 'https://helpx.adobe.com/illustrator/using/default-keyboard-shortcuts.html';
const canvas = { context: 'Illustrator canvas outside text or panel editing' };
const selection = { context: 'With artwork selected on the canvas' };

const illustratorKeys = [
  ...group('Documents and export', [
    ['new-document', 'New document', 'file-plus', 'Ctrl+N'],
    ['new-from-template', 'New from template', 'files', 'Ctrl+Shift+N'],
    ['open-document', 'Open document', 'folder-open', 'Ctrl+O'],
    ['save', 'Save document', 'save', 'Ctrl+S'],
    ['save-as', 'Save as', 'save-all', 'Ctrl+Shift+S'],
    ['document-setup', 'Document Setup', 'settings', 'Ctrl+Alt+P'],
    ['file-info', 'File information', 'info', 'Ctrl+Alt+Shift+I'],
    ['bridge', 'Browse in Bridge', 'images', 'Ctrl+Alt+O'],
    ['export-screens', 'Export for Screens', 'file-output', 'Ctrl+Alt+E'],
    ['save-web', 'Save for Web', 'image-down', 'Ctrl+Alt+Shift+S'],
    ['package', 'Package document', 'package', 'Ctrl+Alt+Shift+P'],
    ['print', 'Print document', 'printer', 'Ctrl+P'],
    ['close-document', 'Close document', 'x', 'Ctrl+W'],
    ['quit-illustrator', 'Quit Illustrator', 'log-out', 'Ctrl+Q'],
  ]),
  ...group('View and artboards', [
    ['actual-size', 'Actual size', 'scan-eye', 'Ctrl+1'],
    ['fit-all-artboards', 'Fit all artboards', 'gallery-horizontal', 'Ctrl+Alt+0'],
    ['toggle-artboards', 'Toggle artboards', 'layout-grid', 'Ctrl+Shift+H'],
    ['rulers', 'Toggle rulers', 'ruler', 'Ctrl+R'],
    ['transparency-grid', 'Transparency grid', 'grid-2x2', 'Ctrl+Shift+D'],
    ['outline', 'Outline or Preview', 'scan', 'Ctrl+Y'],
    ['gpu-preview', 'GPU or CPU Preview', 'monitor', 'Ctrl+E'],
    ['overprint-preview', 'Overprint Preview', 'printer', 'Ctrl+Alt+Shift+Y'],
    ['pixel-preview', 'Pixel Preview', 'grid-2x2', 'Ctrl+Alt+Y'],
    ['smart-guides', 'Toggle Smart Guides', 'ruler', 'Ctrl+U'],
    ['perspective-grid', 'Perspective Grid', 'grid-3x3', 'Ctrl+Shift+I'],
    ['next-document', 'Next document', 'chevron-right', 'Ctrl+F6'],
    ['previous-document', 'Previous document', 'chevron-left', 'Ctrl+Shift+F6'],
    ['next-document-group', 'Next document group', 'chevrons-right', 'Ctrl+Alt+F6'],
    ['previous-doc-group', 'Previous document group', 'chevrons-left', 'Ctrl+Alt+Shift+F6'],
    usKey('zoom-in', 'Zoom in', 'zoom-in', 'Ctrl++'),
    usKey('zoom-out', 'Zoom out', 'zoom-out', 'Ctrl+char:-'),
    usKey('toggle-guides', 'Toggle guides', 'ruler', 'Ctrl+;'),
    usKey('toggle-grid', 'Toggle grid', 'grid-3x3', "Ctrl+char:'"),
  ]),
  ...group('Selection and objects', [
    ['select-artboard', 'Select artboard objects', 'square-dashed', 'Ctrl+Alt+A'],
    ['clear-selection', 'Clear selection', 'square-x', 'Ctrl+Shift+A'],
    ['repeat-selection', 'Repeat selection', 'rotate-ccw', 'Ctrl+6'],
    ['lock-selection', 'Lock selection', 'lock', 'Ctrl+2'],
    ['unlock-objects', 'Unlock all objects', 'unlock', 'Ctrl+Alt+2'],
    ['lock-others', 'Lock other objects', 'lock', 'Ctrl+Alt+Shift+2'],
    ['hide-selection', 'Hide selection', 'eye-off', 'Ctrl+3'],
    ['show-hidden', 'Show hidden objects', 'eye', 'Ctrl+Alt+3'],
    ['hide-others', 'Hide other objects', 'eye-off', 'Ctrl+Alt+Shift+3'],
    ['repeat-transform', 'Repeat last transform', 'repeat', 'Ctrl+D'],
    ['transform-each', 'Transform Each', 'scaling', 'Ctrl+Alt+Shift+D', { source: illustratorPanels }],
    ['release-mask', 'Release clipping mask', 'crop', 'Ctrl+Alt+7', { source: illustratorPanels }],
    ['paste-in-front', 'Paste in front', 'clipboard-paste', 'Ctrl+F'],
    ['paste-in-back', 'Paste in back', 'clipboard-paste', 'Ctrl+B'],
    ['paste-in-place', 'Paste in place', 'clipboard-paste', 'Ctrl+Shift+V'],
    ['paste-all-artboards', 'Paste on all artboards', 'clipboard-paste', 'Ctrl+Alt+Shift+V'],
  ], canvas),
  ...group('Paths and appearance', [
    ['join-paths', 'Join selected paths', 'link', 'Ctrl+J'],
    ['average-points', 'Average anchor points', 'move', 'Ctrl+Alt+J'],
    ['join-corner', 'Join corner or smooth', 'spline', 'Ctrl+Alt+Shift+J'],
    ['compound-path', 'Make compound path', 'combine', 'Ctrl+8'],
    ['release-compound-path', 'Release compound path', 'ungroup', 'Ctrl+Alt+Shift+8'],
    ['make-guides', 'Make guides', 'ruler', 'Ctrl+5'],
    ['release-guides', 'Release guides', 'ruler', 'Ctrl+Alt+5'],
    ['make-blend', 'Make blend', 'blend', 'Ctrl+Alt+B'],
    ['warp-envelope', 'Warp envelope', 'scaling', 'Ctrl+Alt+Shift+W'],
    ['mesh-envelope', 'Mesh envelope', 'grid-3x3', 'Ctrl+Alt+M'],
    ['object-envelope', 'Envelope from object', 'scaling', 'Ctrl+Alt+C'],
    ['repeat-effect', 'Repeat last effect', 'repeat', 'Ctrl+Shift+E', { source: illustratorPanels }],
    ['gradient-annotator', 'Gradient annotator', 'palette', 'Ctrl+Alt+G'],
  ], selection),
  ...group('Panels', [
    ['brushes-panel', 'Brushes panel', 'paintbrush', 'F5'],
    ['color-panel', 'Color panel', 'palette', 'F6'],
    ['layers-panel', 'Layers panel', 'layers', 'F7'],
    ['new-symbol', 'New symbol', 'square-plus', 'F8'],
    ['info-panel', 'Info panel', 'info', 'Ctrl+F8'],
    ['gradient-panel', 'Gradient panel', 'palette', 'Ctrl+F9'],
    ['stroke-panel', 'Stroke panel', 'pen-line', 'Ctrl+F10'],
    ['attributes-panel', 'Attributes panel', 'sliders-horizontal', 'Ctrl+F11'],
    ['color-guide-panel', 'Color Guide', 'swatch-book', 'Shift+F3'],
    ['styles-panel', 'Graphic Styles panel', 'shapes', 'Shift+F5'],
    ['appearance-panel', 'Appearance panel', 'layers-2', 'Shift+F6'],
    ['align-panel', 'Align panel', 'align-center', 'Shift+F7'],
    ['transform-panel', 'Transform panel', 'scaling', 'Shift+F8'],
    ['character-panel', 'Character panel', 'type', 'Ctrl+T'],
    ['paragraph-panel', 'Paragraph panel', 'pilcrow', 'Ctrl+Alt+T'],
    ['opentype-panel', 'OpenType panel', 'case-sensitive', 'Ctrl+Alt+Shift+T'],
  ], { source: illustratorPanels }),
  ...group('Selection and drawing tools', [
    ['selection-tool', 'Selection tool', 'mouse-pointer-2', 'V'],
    ['direct-selection-tool', 'Direct Selection tool', 'mouse-pointer', 'A'],
    ['magic-wand-tool', 'Magic Wand tool', 'wand-sparkles', 'Y'],
    ['lasso-tool', 'Lasso tool', 'lasso', 'Q'],
    ['pen-tool', 'Pen tool', 'pen-tool', 'P'],
    ['anchor-tool', 'Anchor Point tool', 'pen-line', 'Shift+C'],
    ['brush-tool', 'Paintbrush tool', 'paintbrush', 'B'],
    ['blob-brush-tool', 'Blob Brush tool', 'paintbrush', 'Shift+B'],
    ['pencil-tool', 'Pencil tool', 'pencil', 'N'],
    ['shaper-tool', 'Shaper tool', 'shapes', 'Shift+N'],
    ['rectangle-tool', 'Rectangle tool', 'square', 'M'],
    ['ellipse-tool', 'Ellipse tool', 'circle', 'L'],
    ['type-tool', 'Type tool', 'type', 'T'],
    ['touch-type-tool', 'Touch Type tool', 'type', 'Shift+T'],
    ['artboard-tool', 'Artboard tool', 'layout-grid', 'Shift+O'],
  ], canvas),
  ...group('Transform and color tools', [
    ['rotate-tool', 'Rotate tool', 'rotate-cw', 'R'],
    ['reflect-tool', 'Reflect tool', 'flip-horizontal', 'O'],
    ['scale-tool', 'Scale tool', 'scaling', 'S'],
    ['warp-tool', 'Warp tool', 'move', 'Shift+R'],
    ['width-tool', 'Width tool', 'move-horizontal', 'Shift+W'],
    ['transform-tool', 'Free Transform tool', 'scaling', 'E'],
    ['shape-builder-tool', 'Shape Builder tool', 'shapes', 'Shift+M'],
    ['perspective-grid-tool', 'Perspective Grid tool', 'grid-3x3', 'Shift+P'],
    ['perspective-select', 'Perspective Selection', 'mouse-pointer-2', 'Shift+V'],
    ['gradient-tool', 'Gradient tool', 'palette', 'G'],
    ['eyedropper-tool', 'Eyedropper tool', 'pipette', 'I'],
    ['blend-tool', 'Blend tool', 'blend', 'W'],
    ['mesh-tool', 'Mesh tool', 'grid-3x3', 'U'],
    ['live-paint-tool', 'Live Paint Bucket', 'paint-bucket', 'K'],
    ['live-paint-selection', 'Live Paint Selection', 'mouse-pointer', 'Shift+L'],
    ['eraser-tool', 'Eraser tool', 'eraser', 'Shift+E'],
    ['scissors-tool', 'Scissors tool', 'scissors', 'C'],
    ['hand-tool', 'Hand tool', 'hand', 'H'],
    ['zoom-tool', 'Zoom tool', 'zoom-in', 'Z'],
  ], canvas),
  ...group('Type and appearance', [
    ['outline-text', 'Create text outlines', 'scan-text', 'Ctrl+Shift+O', { source: illustratorPanels, context: 'With text selected' }],
    ['align-text-left', 'Align paragraph left', 'align-left', 'Ctrl+Shift+L'],
    ['align-text-center', 'Center paragraph', 'align-center', 'Ctrl+Shift+C'],
    ['align-text-right', 'Align paragraph right', 'align-right', 'Ctrl+Shift+R'],
    ['justify-text', 'Justify paragraph', 'align-justify', 'Ctrl+Shift+F'],
    ['hidden-characters', 'Show hidden characters', 'pilcrow', 'Ctrl+Alt+I', { source: illustratorPanels }],
  ], { context: 'While editing Illustrator text' }),
];

const codeTab = { context: 'Open the Code tab in Claude Desktop' };
const environment = { context: 'On the Code new-session screen with environments listed' };
const artifacts = { context: 'While a Claude artifact editor has focus',
  source: 'https://support.claude.com/en/articles/17457950-use-artifacts-with-a-keyboard-or-screen-reader' };
const docs = { context: 'While a Claude Docs document has focus',
  source: 'https://support.claude.com/en/articles/17458093-claude-docs-keyboard-shortcuts' };

/** @type {import('./shortcut-pack-data').StarterKey[]} */
const claudeCodeKeys = [
  ['new-code-session', 'New Code session', 'message-square-plus', 'Ctrl+N'],
  ['previous-code-session', 'Previous Code session', 'chevron-left', 'Ctrl+Shift+Tab'],
  ['next-code-session', 'Next Code session', 'chevron-right', 'Ctrl+Tab'],
  ['stop-response', 'Stop Claude response', 'square', 'Esc', { context: 'While Claude is responding in Code' }],
  ['model-menu', 'Model menu', 'list', 'Ctrl+Shift+I'],
  ['permission-menu', 'Permission mode menu', 'shield', 'Ctrl+Shift+M'],
  ['effort-menu', 'Effort menu', 'sliders-horizontal', 'Ctrl+Shift+E'],
  ['accept-suggestion', 'Accept suggestion', 'corner-down-right', 'Tab', { context: 'With an empty Code prompt showing a suggestion' }],
  ['toggle-diff', 'Toggle Changes pane', 'git-compare', 'Ctrl+Shift+D'],
  ['toggle-browser', 'Toggle Browser pane', 'globe', 'Ctrl+Shift+B'],
  ['pick-browser-element', 'Pick Browser element', 'mouse-pointer-2', 'Ctrl+Shift+S', { context: 'With the Code Browser pane open' }],
  usKey('toggle-terminal-pane', 'Toggle terminal pane', 'square-terminal', 'Ctrl+char:`'),
  usKey('side-chat', 'Open side chat', 'message-square-plus', 'Ctrl+;'),
  ['code-view-mode', 'Cycle transcript view', 'list', 'Ctrl+O'],
  ['unsplit-session', 'Exit session split', 'columns-2', 'Ctrl+Alt+W', { context: 'With a split Code session selected' }],
  ['close-code-pane', 'Close focused pane', 'panel-top-close', 'Ctrl+char:\\', { usLayout: true, notation: 'Ctrl+\\', confirm: true }],
  ['close-session', 'Close Code session', 'x', 'Ctrl+W', { confirm: true }],
  ['code-shortcuts', 'Code shortcuts', 'keyboard', 'Ctrl+/', { usLayout: true }],
  ['previous-session-bracket', 'Previous session alt.', 'chevron-left', 'Ctrl+Shift+char:[', { usLayout: true, notation: 'Ctrl+Shift+[', alternate: true }],
  ['next-session-bracket', 'Next session alternate', 'chevron-right', 'Ctrl+Shift+char:]', { usLayout: true, notation: 'Ctrl+Shift+]', alternate: true }],
];

const claudeKeys = [
  ...claudeCodeKeys.map(([id, label, icon, chord, options]) => [id, label, icon, chord, { ...codeTab, ...options }]),
  ...group('Code environments', [
    ['new-environment', 'New environment', 'folder-plus', 'Alt+0'],
    ...Array.from({ length: 9 }, (_, position) => {
      const number = position + 1;
      return /** @type {import('./shortcut-pack-data').StarterKey} */ (
        [`environment-${number}`, `Environment ${number}`, 'folder', `Alt+${number}`]
      );
    }),
  ], environment),
  ...group('Artifacts and Claude Docs', [
    ['artifact-next-area', 'Next artifact area', 'arrow-right', 'Ctrl+F6'],
    ['artifact-previous-area', 'Previous artifact area', 'arrow-left', 'Ctrl+Shift+F6'],
    ['artifact-duplicate', 'Duplicate slide object', 'copy', 'Ctrl+D', { context: 'With an object or thumbnail selected in Claude Slides',
      source: 'https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them' }],
    ['doc-formatting', 'Focus format toolbar', 'microscope', 'Alt+F10', docs],
    ['doc-add-comment', 'Add document comment', 'message-square-plus', 'Ctrl+Alt+M', docs],
    ['doc-inline-code', 'Format as inline code', 'code', 'Ctrl+E', docs],
    ['doc-link', 'Insert document link', 'link', 'Ctrl+K', docs],
  ], artifacts),
];

module.exports = { illustratorKeys, claudeKeys };
