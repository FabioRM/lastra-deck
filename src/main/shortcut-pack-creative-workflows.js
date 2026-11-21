// @ts-check
'use strict';

const { shortcutGroup: group, usKey } = require('./shortcut-pack-data');

const acrobatKeys = [
  ...group('PDF view', [
    ['go-to-page', 'Jump to page', 'files', 'Ctrl+Shift+N'],
    ['actual-size', 'Actual size', 'scan-eye', 'Ctrl+1'],
    ['fit-page', 'Fit page', 'maximize', 'Ctrl+0'],
    ['fit-width', 'Fit width', 'move-horizontal', 'Ctrl+2'],
    ['fit-visible', 'Fit visible area', 'scan', 'Ctrl+3'],
    ['full-screen', 'Toggle full screen', 'maximize', 'Ctrl+L'],
    ['previous-view', 'Previous view', 'arrow-left', 'Alt+Left'],
    ['next-view', 'Next view', 'arrow-right', 'Alt+Right'],
  ]),
];

const afterEffectsKeys = [
  ...group('Composition and project', [
    ['new-composition', 'New composition', 'file-plus', 'Ctrl+N'],
    ['comp-settings', 'Composition settings', 'sliders-horizontal', 'Ctrl+K'],
    ['save-as', 'Save project as', 'save-all', 'Ctrl+Shift+S'],
    ['increment-save', 'Increment and save', 'save-all', 'Ctrl+Alt+Shift+S'],
    ['queue-media-encoder', 'Queue in Media Encoder', 'list-video', 'Ctrl+Alt+M'],
    ['queue-current-frame', 'Queue current frame', 'image-up', 'Ctrl+Alt+S'],
  ]),
  ...group('Timeline navigation', [
    ['go-to-time', 'Go to time', 'timer', 'Alt+Shift+J'],
    ['previous-frame', 'Previous frame', 'step-back', 'PageUp'],
    ['next-frame', 'Next frame', 'step-forward', 'PageDown'],
    ['back-ten-frames', 'Back ten frames', 'rewind', 'Shift+PageUp'],
    ['forward-ten-frames', 'Forward ten frames', 'fast-forward', 'Shift+PageDown'],
    ['work-start', 'Go to work area start', 'skip-back', 'Shift+Home'],
    ['work-end', 'Go to work area end', 'skip-forward', 'Shift+End'],
    ['fit-work-area', 'Fit work area', 'maximize', 'Ctrl+Alt+B'],
  ], { context: 'While a composition or Timeline has focus' }),
];

const premiereKeys = [
  ...group('Projects and export', [
    ['new-project', 'New project', 'file-plus', 'Ctrl+Alt+N'],
    ['new-sequence', 'New sequence', 'list-plus', 'Ctrl+N'],
    ['open-project', 'Open project', 'folder-open', 'Ctrl+O'],
    ['save-as', 'Save project as', 'save-all', 'Ctrl+Shift+S'],
    ['save-copy', 'Save project copy', 'copy', 'Ctrl+Alt+S'],
    ['export-media', 'Open Media Export', 'file-output', 'Ctrl+M', { context: 'With a sequence or media selected' }],
    ['media-properties', 'Media file properties', 'info', 'Ctrl+Shift+H'],
    ['close-document', 'Close project', 'x', 'Ctrl+Shift+W'],
  ]),
  ...group('Timeline and clips', [
    ['clip-speed', 'Clip speed and duration', 'timer', 'Ctrl+R'],
    ['subclip', 'Make subclip', 'scissors', 'Ctrl+U'],
    ['clip-gain', 'Adjust audio gain', 'volume-2', 'G'],
    ['link-clips', 'Link clips', 'link', 'Ctrl+L'],
    ['group-clips', 'Group clips', 'group', 'Ctrl+G'],
    ['ungroup-clips', 'Ungroup clips', 'ungroup', 'Ctrl+Shift+G'],
    ['nudge-left', 'Nudge clip left', 'arrow-left', 'Alt+Left'],
    ['nudge-right', 'Nudge clip right', 'arrow-right', 'Alt+Right'],
    ['previous-screen', 'Previous timeline screen', 'chevron-left', 'PageUp'],
    ['next-screen', 'Next timeline screen', 'chevron-right', 'PageDown'],
  ], { context: 'With the intended Timeline or clip selected' }),
];

const resolveKeys = [
  ...group('Media and timelines', [
    ['import-media', 'Import media', 'file-input', 'Ctrl+I'],
    ['new-timeline', 'New timeline', 'list-plus', 'Ctrl+N'],
    ['new-bin', 'New media bin', 'folder-plus', 'Ctrl+Shift+N'],
    ['import-timeline', 'Import timeline', 'file-input', 'Ctrl+Shift+I'],
    ['export-timeline', 'Export timeline', 'file-output', 'Ctrl+Shift+O'],
    ['cinema-viewer', 'Cinema Viewer', 'monitor', 'Ctrl+F'],
  ], { context: 'On the Media or Cut page, as applicable' }),
  ...group('Cut playback and marks', [
    ['play-pause', 'Play or pause', 'circle-play', 'Space'],
    ['previous-cut', 'Go to previous cut', 'skip-back', 'Up'],
    ['next-cut', 'Go to next cut', 'skip-forward', 'Down'],
    ['enhanced-viewer', 'Enhanced Viewer', 'maximize', 'Alt+F'],
    ['mark-in', 'Mark source in', 'log-in', 'I'],
    ['mark-out', 'Mark source out', 'log-out', 'O'],
    ['clear-marks', 'Clear in and out marks', 'eraser', 'Alt+X'],
  ], { context: 'While the Cut page and intended viewer have focus' }),
];

const lightroomKeys = [
  ...group('Catalog and photos', [
    ['import-photos', 'Import photos', 'file-input', 'Ctrl+Shift+I'],
    ['open-catalog', 'Open catalog', 'folder-open', 'Ctrl+O'],
    ['reveal', 'Reveal in File Explorer', 'files', 'Ctrl+R'],
    ['edit-photoshop', 'Edit in Photoshop', 'external-link', 'Ctrl+E'],
    ['rename-photo', 'Rename photo', 'pencil', 'F2', { context: 'With a Library photo selected' }],
    ['merge-hdr', 'Open HDR Merge', 'images', 'Ctrl+H', { context: 'With bracketed photos selected' }],
    ['merge-panorama', 'Open Panorama Merge', 'images', 'Ctrl+M', { context: 'With panorama photos selected' }],
  ]),
  ...group('Library and viewing', [
    ['grid', 'Library Grid', 'layout-grid', 'G'],
    ['compare', 'Library Compare', 'columns-2', 'C'],
    ['survey', 'Library Survey', 'gallery-horizontal', 'N'],
    ['next-image', 'Next image', 'chevron-right', 'Ctrl+Right'],
    ['previous-image', 'Previous image', 'chevron-left', 'Ctrl+Left'],
    ['toggle-info-overlay', 'Toggle info overlay', 'info', 'Ctrl+I'],
    ['normal-screen', 'Return to normal screen', 'minimize', 'Ctrl+Alt+F'],
    ['full-screen', 'Full screen, hide panels', 'maximize', 'Ctrl+Shift+F'],
  ], { context: 'While viewing photos outside a text field' }),
];

const blenderKeys = [
  ...group('Workspace and render', [
    ['area-maximize', 'Toggle maximized area', 'maximize', 'Ctrl+Space'],
    ['area-full-screen', 'Toggle full-screen area', 'maximize', 'Ctrl+Alt+Space'],
    ['next-workspace', 'Next workspace', 'chevron-right', 'Ctrl+PageDown'],
    ['previous-workspace', 'Previous workspace', 'chevron-left', 'Ctrl+PageUp'],
    ['render-image', 'Render image', 'image', 'F12'],
    ['render-animation', 'Render animation', 'film', 'Ctrl+F12'],
    ['render-view', 'Show render result', 'panels-top-left', 'F11'],
  ]),
];

const figmaKeys = [
  ...group('Canvas and navigation', [
    ['zoom-fit', 'Zoom to fit', 'maximize', 'Shift+1', { source: 'https://help.figma.com/hc/en-us/articles/360041065034-Adjust-your-zoom-and-view-options' }],
    ['zoom-selection', 'Zoom to selection', 'scan', 'Shift+2', { source: 'https://help.figma.com/hc/en-us/articles/360041065034-Adjust-your-zoom-and-view-options' }],
    ['next-area', 'Focus next area', 'arrow-right', 'Ctrl+F6'],
    ['previous-area', 'Focus previous area', 'arrow-left', 'Ctrl+Shift+F6'],
    ['pan-left', 'Pan canvas left', 'arrow-left', 'Left', { context: 'While the canvas has focus and nothing is selected' }],
    ['pan-right', 'Pan canvas right', 'arrow-right', 'Right', { context: 'While the canvas has focus and nothing is selected' }],
    ['pan-up', 'Pan canvas up', 'arrow-up', 'Up', { context: 'While the canvas has focus and nothing is selected' }],
    ['pan-down', 'Pan canvas down', 'arrow-down', 'Down', { context: 'While the canvas has focus and nothing is selected' }],
    usKey('keyboard-shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+Shift+char:?'),
  ], { source: 'https://help.figma.com/hc/en-us/articles/360040328653-Use-Figma-products-with-a-keyboard' }),
];

module.exports = { acrobatKeys, afterEffectsKeys, premiereKeys, resolveKeys, lightroomKeys, blenderKeys, figmaKeys };
