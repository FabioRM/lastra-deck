// @ts-check
'use strict';

const { desktopPack: pack, usKey } = require('./shortcut-pack-data');
const windows = 'https://support.microsoft.com/en-us/topic/139014e7-177b-d1f3-eb2e-7298b2599a34';
const libre = 'https://help.libreoffice.org/latest/en-US/text';

module.exports = [
  pack('whatsapp', 'WhatsApp', ['whatsapp.exe'], 'https://faq.whatsapp.com/6204576529560565/?cms_platform=windows-desktop', [
    ['new-chat', 'New chat', 'message-square-plus', 'Ctrl+Alt+N'],
    ['search-chat', 'Find in chat', 'search', 'Ctrl+Shift+F'],
    ['profile', 'Profile and About', 'user-round', 'Ctrl+Alt+P'],
    ['emoji', 'Emoji panel', 'smile', 'Ctrl+Alt+E'],
  ], { appIds: ['5319275a.whatsappdesktop_cv1g1gvanyjgm!app'] }),
  pack('telegram', 'Telegram Desktop', ['telegram.exe'], 'https://github.com/telegramdesktop/tdesktop/wiki/Keyboard-Shortcuts', [
    ['search-chat', 'Find in chat', 'search', 'Ctrl+F'],
    ['previous-chat', 'Previous chat', 'chevron-up', 'Ctrl+PageUp'],
    ['next-chat', 'Next chat', 'chevron-down', 'Ctrl+PageDown'],
    ['close-window', 'Close window', 'x', 'Ctrl+W'],
  ]),
  pack('signal', 'Signal Desktop', ['signal.exe', 'signal beta.exe'], 'https://support.signal.org/hc/en-us/articles/360056055952-Keyboard-Shortcuts', [
    ['new-chat', 'New chat', 'message-square-plus', 'Ctrl+N'],
    ['search', 'Search conversations', 'search', 'Ctrl+F'],
    ['search-chat', 'Find in conversation', 'text-search', 'Ctrl+Shift+F'],
  ]),
  pack('thunderbird', 'Mozilla Thunderbird', ['thunderbird.exe'], 'https://support.mozilla.org/en-US/kb/keyboard-shortcuts-thunderbird', [
    ['new-message', 'Compose message', 'mail-plus', 'Ctrl+N'],
    ['reply', 'Reply', 'reply', 'Ctrl+R'],
    ['reply-all', 'Reply all', 'reply-all', 'Ctrl+Shift+R'],
    ['search', 'Global search', 'search', 'Ctrl+K'],
  ]),
  pack('em-client', 'eM Client', ['mailclient.exe'], 'https://www.emclient.com/blog/em-client-keyboard-shortcuts-559', [
    ['new-message', 'Compose message', 'mail-plus', 'Ctrl+N'],
    ['reply', 'Reply', 'reply', 'Ctrl+R'],
    ['reply-all', 'Reply all', 'reply-all', 'Ctrl+Shift+R'],
  ]),
  pack('libreoffice', 'LibreOffice', ['soffice.bin', 'soffice.exe'], libre + '/shared/04/01010000.html', [
    ['open-file', 'Open document', 'folder-open', 'Ctrl+O'],
    ['save', 'Save document', 'save', 'Ctrl+S'],
    ['save-as', 'Save as', 'file-plus', 'Ctrl+Shift+S'],
    ['replace', 'Find and replace', 'replace', 'Ctrl+H'],
    ['print', 'Print', 'printer', 'Ctrl+P'],
  ]),
  pack('wps-writer', 'WPS Writer', ['wps.exe'], 'https://www.wps.com/academy/keyboard-shortcuts-in-wps-office-quick-tutorials-1861818/', [
    ['save', 'Save document', 'save', 'Ctrl+S'],
    ['find', 'Find in document', 'search', 'Ctrl+F'],
    ['print', 'Print', 'printer', 'Ctrl+P'],
  ]),
  pack('wps-spreadsheets', 'WPS Spreadsheets', ['et.exe'], 'https://www.wps.com/academy/keyboard-shortcuts-in-wps-office-quick-tutorials-1861818/', [
    ['save', 'Save workbook', 'save', 'Ctrl+S'],
    ['find', 'Find in workbook', 'search', 'Ctrl+F'],
    ['format-cells', 'Format cells', 'table-2', 'Ctrl+1'],
  ]),
  pack('wps-presentation', 'WPS Presentation', ['wpp.exe'], 'https://www.wps.com/academy/keyboard-shortcuts-in-wps-office-quick-tutorials-1861818/', [
    ['save', 'Save presentation', 'save', 'Ctrl+S'],
    ['new-slide', 'New slide', 'square-plus', 'Ctrl+M'],
    ['start-show', 'Start slide show', 'presentation', 'F5'],
  ]),
  pack('onlyoffice', 'ONLYOFFICE Desktop Editors', ['desktopeditors.exe'], 'https://helpcenter.onlyoffice.com/docs/userguides/document_editor/keyboardshortcuts.aspx', [
    ['save', 'Save file', 'save', 'Ctrl+S'],
    ['find', 'Find in file', 'search', 'Ctrl+F'],
    ['print', 'Print', 'printer', 'Ctrl+P'],
  ]),
  pack('access', 'Microsoft Access', ['msaccess.exe'], 'https://support.microsoft.com/en-us/accessibility/access/keyboard-shortcuts-for-access', [
    ['open-file', 'Open database', 'folder-open', 'Ctrl+O'],
    ['save', 'Save object', 'save', 'Ctrl+S'],
    ['navigation-pane', 'Toggle navigation pane', 'panels-top-left', 'F11'],
  ]),
  pack('visio', 'Microsoft Visio', ['visio.exe'], 'https://support.microsoft.com/en-us/accessibility/visio/keyboard-shortcuts-for-visio', [
    ['save', 'Save drawing', 'save', 'Ctrl+S'],
    ['pointer', 'Pointer tool', 'mouse-pointer-2', 'Ctrl+1'],
    ['text-tool', 'Text tool', 'type', 'Ctrl+2'],
    ['connector', 'Connector tool', 'workflow', 'Ctrl+3'],
  ]),
  pack('project', 'Microsoft Project', ['winproj.exe'], 'https://support.microsoft.com/en-us/accessibility/project/keyboard-shortcuts-for-project', [
    ['save', 'Save project', 'save', 'Ctrl+S'],
    ['find', 'Find task', 'search', 'Ctrl+F'],
    ['link-tasks', 'Link tasks', 'link', 'Ctrl+F2'],
  ]),
  pack('power-bi', 'Microsoft Power BI Desktop', ['pbidesktop.exe'], 'https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-accessibility-keyboard-shortcuts', [
    ['save', 'Save report', 'save', 'Ctrl+S'],
    ['open-file', 'Open report', 'folder-open', 'Ctrl+O'],
    ['switch-area', 'Switch report area', 'panels-top-left', 'Ctrl+F6'],
  ]),
  pack('foxit-pdf', 'Foxit PDF Reader', ['foxitpdfreader.exe', 'foxitreader.exe'], 'https://www.foxit.com/resource-hub/user-guide/foxit-pdf-reader-for-windows/keyboard-shortcuts/', [
    ['find', 'Find in PDF', 'search', 'Ctrl+F'],
    ['advanced-search', 'Advanced search', 'file-search', 'Ctrl+Shift+F'],
    ['go-to-page', 'Go to page', 'files', 'Ctrl+G'],
    ['full-screen', 'Full screen', 'maximize', 'Ctrl+L'],
  ], { editing: false }),
  pack('pdf-xchange', 'PDF-XChange Editor', ['pdfxedit.exe'], 'https://help.pdf-xchange.com/pdfxe10/keyboard-shortcuts_ed.html', [
    ['find', 'Find in PDF', 'search', 'Ctrl+F'],
    ['search', 'Search PDFs', 'file-search', 'Ctrl+Shift+F'],
    ['save', 'Save PDF', 'save', 'Ctrl+S'],
  ]),
  pack('drawio', 'draw.io Desktop', ['draw.io.exe'], 'https://www.drawio.com/docs/reference/shortcuts/', [
    ['save', 'Save diagram', 'save', 'Ctrl+S'],
    ['duplicate', 'Duplicate selection', 'copy', 'Ctrl+D'],
    ['group', 'Group selection', 'group', 'Ctrl+G'],
    ['ungroup', 'Ungroup selection', 'ungroup', 'Ctrl+Shift+U'],
  ]),
  pack('evernote', 'Evernote', ['evernote.exe'], 'https://help.evernote.com/hc/en-us/articles/34296687388307-Keyboard-shortcuts', [
    ['new-note', 'New note', 'file-plus', 'Ctrl+N'],
    ['find', 'Find in note', 'search', 'Ctrl+F', { source: 'https://help.evernote.com/hc/en-us/articles/54772066056339-Find-in-Note-search-for-text-inside-a-single-note' }],
    usKey('shortcuts', 'Keyboard shortcuts', 'keyboard', 'Ctrl+/'),
  ]),
  pack('todoist', 'Todoist', ['todoist.exe'], 'https://www.todoist.com/help/todoist/features/use-keyboard-shortcuts-in-todoist-Wyovn2', [
    ['search', 'Search or run a command', 'search', 'Ctrl+K'],
    ['quick-add', 'Quick Add', 'square-plus', 'Q'],
    ['new-project', 'New project', 'folder-plus', 'Alt+P'],
  ], { editing: false }),
  pack('joplin', 'Joplin', ['joplin.exe'], 'https://joplinapp.org/help/apps/desktop/', [
    ['new-note', 'New note', 'file-plus', 'Ctrl+N'],
    ['new-todo', 'New to-do', 'list-todo', 'Ctrl+T'],
    usKey('preferences', 'Preferences', 'settings', 'Ctrl+char:,'),
  ]),
  pack('obs-studio', 'OBS Studio', ['obs64.exe', 'obs32.exe'], 'https://obsproject.com/kb/keyboard-shortcuts', [
    ['fit-source', 'Fit source to canvas', 'maximize', 'Ctrl+F'],
    ['center-source', 'Center source', 'move', 'Ctrl+D'],
    ['reset-transform', 'Reset source transform', 'rotate-ccw', 'Ctrl+R'],
    ['properties', 'Source properties', 'sliders-horizontal', 'Ctrl+Enter'],
  ], { editing: false }),
  pack('snipping-tool', 'Windows Snipping Tool', ['snippingtool.exe'], 'https://support.microsoft.com/en-us/windows/apps/use-snipping-tool-to-capture-screenshots', [
    ['new-capture', 'New capture', 'scissors', 'Alt+N'],
    ['save', 'Save capture', 'save', 'Ctrl+S'],
    ['copy', 'Copy capture', 'copy', 'Ctrl+C'],
  ], { appIds: ['microsoft.screensketch_8wekyb3d8bbwe!app'], editing: false }),
  pack('calculator', 'Windows Calculator', ['calculatorapp.exe'], windows, [
    ['standard', 'Standard mode', 'calculator', 'Alt+1'],
    ['scientific', 'Scientific mode', 'sigma', 'Alt+2'],
    ['clear', 'Clear calculation', 'rotate-ccw', 'Esc'],
  ], { appIds: ['microsoft.windowscalculator_8wekyb3d8bbwe!app'], editing: false }),
  pack('photos', 'Microsoft Photos', ['microsoft.photos.exe', 'photosapp.exe'], windows, [
    ['previous-photo', 'Previous photo', 'chevron-left', 'Left'],
    ['next-photo', 'Next photo', 'chevron-right', 'Right'],
    ['rotate', 'Rotate photo', 'rotate-cw', 'Ctrl+R'],
    ['print', 'Print photo', 'printer', 'Ctrl+P'],
  ], { appIds: ['microsoft.windows.photos_8wekyb3d8bbwe!app'], editing: false }),
  pack('task-manager', 'Windows Task Manager', ['taskmgr.exe'], 'https://support.microsoft.com/en-us/windows/keyboard-shortcuts-in-windows-dcc61a57-8ff0-cffe-9796-cb9706c75eec', [
    ['run-task', 'Run new task', 'square-plus', 'Alt+N'],
    ['search', 'Filter processes', 'search', 'Ctrl+F'],
    ['properties', 'Process properties', 'info', 'Alt+Enter'],
  ], { editing: false }),
  pack('magnifier', 'Windows Magnifier', ['magnify.exe'], 'https://support.microsoft.com/en-us/accessibility/windows/magnifier/keyboard-shortcuts-for-magnifier', [
    usKey('zoom-in', 'Zoom in', 'zoom-in', 'Win++'),
    usKey('zoom-out', 'Zoom out', 'zoom-out', 'Win+minus'),
    ['invert-colors', 'Invert colors', 'contrast', 'Ctrl+Alt+I'],
  ], { editing: false }),
  pack('media-player', 'Windows Media Player Legacy', ['wmplayer.exe'], windows, [
    ['play-pause', 'Play or pause', 'circle-play', 'Ctrl+P'],
    ['stop', 'Stop playback', 'square', 'Ctrl+S'],
    ['next-track', 'Next track', 'skip-forward', 'Ctrl+F'],
    ['previous-track', 'Previous track', 'skip-back', 'Ctrl+B'],
  ], { editing: false }),
  pack('microsoft-remote-desktop', 'Remote Desktop Connection', ['mstsc.exe'], 'https://learn.microsoft.com/en-us/windows/win32/termserv/terminal-services-shortcut-keys', [
    ['full-screen', 'Toggle full screen', 'maximize', 'Ctrl+Alt+Pause'],
    ['switch-programs', 'Switch remote apps', 'panels-top-left', 'Alt+PageUp'],
    ['reverse-programs', 'Previous remote app', 'panels-top-left', 'Alt+PageDown'],
  ], { editing: false }),
  pack('bitwarden', 'Bitwarden', ['bitwarden.exe'], 'https://bitwarden.com/help/keyboard-shortcuts/', [
    ['search', 'Search vault', 'search', 'Ctrl+F'],
    ['new-item', 'New vault item', 'square-plus', 'Ctrl+N'],
    ['lock', 'Lock vault', 'lock', 'Ctrl+L'],
  ], { editing: false }),
  pack('1password', '1Password', ['1password.exe'], 'https://support.1password.com/keyboard-shortcuts/', [
    ['search', 'Search vaults', 'search', 'Ctrl+F'],
    ['new-item', 'New item', 'square-plus', 'Ctrl+N'],
    ['edit-item', 'Edit current item', 'pencil', 'Ctrl+E'],
    ['lock', 'Lock 1Password', 'lock', 'Ctrl+Shift+L'],
  ], { editing: false }),
  pack('keepass', 'KeePass', ['keepass.exe'], 'https://keepass.info/help/base/keys.html', [
    ['find', 'Find entries', 'search', 'Ctrl+F'],
    ['new-entry', 'Add entry', 'square-plus', 'Ctrl+I'],
    ['edit-entry', 'Edit entry', 'pencil', 'Ctrl+E'],
    ['lock', 'Lock workspace', 'lock', 'Ctrl+L'],
  ], { editing: false }),
  pack('keepassxc', 'KeePassXC', ['keepassxc.exe'], 'https://keepassxc.org/docs/KeePassXC_UserGuide#_keyboard_shortcuts', [
    ['find', 'Search database', 'search', 'Ctrl+F'],
    ['new-entry', 'Add entry', 'square-plus', 'Ctrl+N'],
    ['edit-entry', 'Edit entry', 'pencil', 'Ctrl+E'],
    ['lock', 'Lock databases', 'lock', 'Ctrl+L'],
  ], { editing: false }),
];
