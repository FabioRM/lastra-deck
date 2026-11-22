// @ts-check
'use strict';

const reviewedOn = '2026-11-19';
const google = 'https://policies.google.com/terms';
const microsoft = 'https://www.microsoft.com/en-us/legal/terms-of-use';

const apps = [
  [
    "chrome",
    "Google Chrome",
    "windows macos linux"
  ],
  [
    "excel",
    "Microsoft Excel",
    "windows macos"
  ],
  [
    "gdocs",
    "Google Docs",
    "web"
  ],
  [
    "teams",
    "Microsoft Teams",
    "windows macos web"
  ],
  [
    "vscode",
    "Visual Studio Code",
    "windows macos linux"
  ],
  [
    "word",
    "Microsoft Word",
    "windows macos"
  ]
].map(([id, name, platforms]) => ({ id, name, slug: id, platforms: platforms.split(' ') }));

const sources = {
  chrome: { owner: 'chrome', url: 'https://support.google.com/chrome/answer/157179?hl=en', terms: google },
  'excel-en': { owner: 'excel', url: 'https://support.microsoft.com/en-us/accessibility/excel/keyboard-shortcuts-in-excel', terms: microsoft },
  'excel-it': { owner: 'excel', url: 'https://support.microsoft.com/it-it/accessibility/excel/keyboard-shortcuts-in-excel', terms: microsoft },
  docs: { owner: 'gdocs', url: 'https://support.google.com/docs/answer/179738?hl=en&co=GENIE.Platform%3DDesktop', terms: google },
  'vscode-defaults': { owner: 'vscode', url: 'https://code.visualstudio.com/docs/reference/default-keybindings', terms: microsoft },
  'vscode-pdf': { owner: 'vscode', url: 'https://code.visualstudio.com/shortcuts/keyboard-shortcuts-windows.pdf', terms: microsoft },
  word: { owner: 'word', url: 'https://support.microsoft.com/en-us/accessibility/word/keyboard-shortcuts-in-word', terms: microsoft },
  teams: { owner: 'teams', url: 'https://support.microsoft.com/en-us/accessibility/teams/keyboard-shortcuts-for-microsoft-teams', terms: microsoft },
};

function review(app, source, conditions, rows) {
  return rows.map(([id, label, section, keys, details]) => ({
    app, source, id, label, context: app + ':' + section,
    strokes: keys === null ? null : (Array.isArray(keys) ? keys : [keys]).map((chord) => chord.split('+')),
    platform: 'windows', hostPlatform: 'windows', edition: null, appVersion: null, windowsBuild: null,
    language: null, layout: null, mode: null,
    verification: { status: 'documented', date: reviewedOn, method: 'vendor-documentation' },
    ...conditions, ...details,
  }));
}

const ambiguous = { status: 'ambiguous', date: reviewedOn, method: 'vendor-documentation' };
const saveUnderline = 'Microsoft’s Italian Windows guide assigns Ctrl+S to Save and Underline. Confirm the installed keymap first.';
const copyItalic = 'Microsoft’s Italian Windows guide assigns Ctrl+C to Copy and Italic. Confirm the installed keymap first.';
const requiresCall = 'Requires confirmation of a work or school Teams call in the Windows app.';
const requiresWebCall = 'Requires a verified Teams web window and an active call.';

const bindings = [
  ...review('chrome', 'chrome', { edition: 'desktop' }, [
    ['new-tab', 'New tab', 'tabs', 'Ctrl+T'],
    ['close-tab', 'Close tab', 'tabs', 'Ctrl+W'],
    ['reopen-closed-tab', 'Restore closed tab', 'tabs', 'Ctrl+Shift+T'],
    ['next-tab', 'Next tab', 'tabs', 'Ctrl+Tab'],
    ['previous-tab', 'Previous tab', 'tabs', 'Ctrl+Shift+Tab'],
    ['switch-to-last-tab', 'Last tab', 'tabs', 'Ctrl+9'],
    ['new-window', 'New window', 'tabs', 'Ctrl+N'],
    ['new-incognito-window', 'Incognito window', 'tabs', 'Ctrl+Shift+N'],
    ['close-window', 'Close window', 'tabs', 'Ctrl+Shift+W'],
    ['go-back', 'Back', 'navigation', 'Alt+Left'],
    ['go-forward', 'Forward', 'navigation', 'Alt+Right'],
    ['reload-page', 'Reload', 'navigation', 'Ctrl+R'],
    ['focus-address-bar', 'Address bar', 'address-bar', 'Ctrl+L'],
    ['new-tab', 'New tab', 'browser-controls', 'Ctrl+T'],
    ['close-tab', 'Close tab', 'browser-controls', 'Ctrl+W'],
    ['reopen-closed-tab', 'Restore closed tab', 'browser-controls', 'Ctrl+Shift+T'],
    ['new-window', 'New window', 'browser-controls', 'Ctrl+N'],
    ['new-incognito-window', 'Incognito window', 'browser-controls', 'Ctrl+Shift+N'],
    ['focus-address-bar', 'Address bar', 'browser-controls', 'Ctrl+L'],
    ['go-back', 'Back', 'browser-controls', 'Alt+Left'],
    ['go-forward', 'Forward', 'browser-controls', 'Alt+Right'],
  ]),
  ...review('excel', 'excel-en', { edition: 'Microsoft 365 desktop', language: 'en-US', layout: 'US', mode: 'worksheet' }, [
    ['go-to-beginning', 'First cell', 'navigation', 'Ctrl+Home'],
    ['go-to-last-used-cell', 'Last used cell', 'navigation', 'Ctrl+End'],
    ['next-sheet', 'Next sheet', 'navigation', 'Ctrl+PageDown'],
    ['previous-sheet', 'Previous sheet', 'navigation', 'Ctrl+PageUp'],
    ['select-entire-row', 'Select row', 'navigation', 'Shift+Space'],
    ['select-entire-column', 'Select column', 'navigation', 'Ctrl+Space'],
    ['select-all', 'Select all', 'navigation', 'Ctrl+A', { verification: ambiguous,
      unavailable: 'The first Ctrl+A can select the current data region. Review the worksheet selection before assigning.' }],
    ['format-cells-dialog', 'Format cells', 'formatting', 'Ctrl+1'],
    ['bold', 'Bold', 'formatting', 'Ctrl+B'],
    ['italic', 'Italic', 'formatting', 'Ctrl+I'],
    ['underline', 'Underline', 'formatting', 'Ctrl+U'],
  ]),
  ...review('excel', 'excel-it', { edition: 'Microsoft 365 desktop', language: 'it-IT', mode: 'worksheet', verification: ambiguous }, [
    ['save', 'Save workbook', 'file', 'Ctrl+S', { unavailable: saveUnderline }],
    ['underline', 'Underline', 'formatting', 'Ctrl+S', { unavailable: saveUnderline }],
    ['copy', 'Copy selection', 'navigation', 'Ctrl+C', { unavailable: copyItalic }],
    ['italic', 'Italic', 'formatting', 'Ctrl+C', { unavailable: copyItalic }],
  ]),
  ...review('gdocs', 'docs', { platform: 'web', edition: 'browser', mode: 'document-editor' }, [
    ['undo', 'Undo', 'editing', 'Ctrl+Z'],
    ['redo', 'Redo', 'editing', 'Ctrl+Shift+Z'],
    ['find', 'Find in document', 'editing', 'Ctrl+F'],
    ['select-all', 'Select all', 'editing', 'Ctrl+A'],
    ['copy', 'Copy', 'editing', 'Ctrl+C'],
    ['cut', 'Cut', 'editing', 'Ctrl+X'],
    ['paste', 'Paste', 'editing', 'Ctrl+V'],
    ['paste-without-formatting', 'Paste without formatting', 'editing', 'Ctrl+Shift+V'],
    ['print', 'Print', 'document', 'Ctrl+P'],
  ]),
  ...review('vscode', 'vscode-defaults', { edition: 'desktop' }, [
    ['quick-open-file', 'Quick open file', 'editing', 'Ctrl+P'],
    ['find', 'Find in editor', 'search', 'Ctrl+F', { mode: 'editor' }],
  ]),
  ...review('vscode', 'vscode-pdf', { edition: 'desktop', layout: 'US' }, [
    ['keyboard-shortcuts', 'Keyboard shortcuts', 'settings', ['Ctrl+K', 'Ctrl+S'], { execution: 'ordered-chords' }],
  ]),
  ...review('word', 'word', { edition: 'Microsoft 365 desktop', language: 'en-US', layout: 'US' }, [
    ['bold', 'Bold', 'formatting', 'Ctrl+B', { mode: 'document-editor' }],
    ['italic', 'Italic', 'formatting', 'Ctrl+I', { mode: 'document-editor' }],
    ['underline', 'Underline', 'formatting', 'Ctrl+U', { mode: 'document-editor' }],
    ['find', 'Find in document', 'navigation', 'Ctrl+F', { mode: 'document-editor' }],
    ['open-document', 'Open document', 'file', 'Ctrl+O'],
    ['save', 'Save', 'file', 'Ctrl+S'],
    ['print', 'Print', 'file', 'Ctrl+P'],
    ['undo', 'Undo', 'file', 'Ctrl+Z', { mode: 'document-editor' }],
    ['redo', 'Redo', 'file', 'Ctrl+Y', { mode: 'document-editor' }],
  ]),
  ...review('teams', 'teams', { edition: 'work-or-school desktop', layout: 'US', mode: 'call', unavailable: requiresCall }, [
    ['mic', 'Toggle mic', 'calls', 'Ctrl+Shift+M'],
    ['end-call', 'End call', 'calls', 'Ctrl+Shift+H'],
  ]),
  ...review('teams', 'teams', { platform: 'web', edition: 'web', layout: 'US', mode: 'call', unavailable: requiresWebCall }, [
    ['mic', 'Toggle mic', 'calls', 'Ctrl+Shift+M'],
    ['end-call', 'End call', 'calls', 'Ctrl+Shift+H'],
  ]),
  ...review('teams', 'teams', { edition: 'personal desktop', mode: 'call' }, [
    ['mic', 'Toggle mic', 'calls', null, {
      verification: { status: 'unknown', date: reviewedOn, method: 'vendor-documentation' },
      unavailable: 'The Personal edition keymap still needs verification.',
    }],
  ]),
];

module.exports = {
  version: 'lastra-public-2026-11-19',
  attribution: 'https://github.com/FabioRM/lastra',
  reviewedOn, apps, sources, bindings,
};
