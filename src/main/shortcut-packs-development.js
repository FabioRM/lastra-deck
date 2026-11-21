// @ts-check
'use strict';

const { desktopPack: pack } = require('./shortcut-pack-data');
const { MATLAB_DESKTOP_MODE } = require('./shortcut-surface');

/** @type {import('./shortcut-pack-data').StarterKey[]} */
const jetBrains = [
  ['find-action', 'Find action', 'command', 'Ctrl+Shift+A'],
  ['go-to-file', 'Go to file', 'file-search', 'Ctrl+Shift+N'],
  ['rename', 'Rename symbol or file', 'pencil', 'Shift+F6'],
  ['next-problem', 'Next problem', 'arrow-down', 'F2'],
];
/** @type {import('./shortcut-pack-data').StarterKey[]} */
const vsCodeKeymap = [
  ['palette', 'Command palette', 'command', 'Ctrl+Shift+P'],
  ['quick-open', 'Quick open', 'file-search', 'Ctrl+P'],
  ['find-files', 'Find in files', 'search', 'Ctrl+Shift+F'],
  ['explorer', 'Explorer', 'files', 'Ctrl+Shift+E'],
];

module.exports = [
  pack('android-studio', 'Android Studio', ['studio64.exe', 'studio.exe'], 'https://developer.android.com/studio/intro/keyboard-shortcuts', [
    ['find-action', 'Find action', 'command', 'Ctrl+Shift+A'],
    ['go-to-file', 'Go to file', 'file-search', 'Ctrl+Shift+N'],
    ['build', 'Build project', 'hammer', 'Ctrl+F9'],
    ['run', 'Run app', 'play', 'Shift+F10'],
  ]),
  pack('pycharm', 'PyCharm', ['pycharm64.exe', 'pycharm.exe'], 'https://www.jetbrains.com/help/pycharm/mastering-keyboard-shortcuts.html', jetBrains),
  pack('webstorm', 'WebStorm', ['webstorm64.exe', 'webstorm.exe'], 'https://www.jetbrains.com/help/webstorm/mastering-keyboard-shortcuts.html', jetBrains),
  pack('phpstorm', 'PhpStorm', ['phpstorm64.exe', 'phpstorm.exe'], 'https://www.jetbrains.com/help/phpstorm/mastering-keyboard-shortcuts.html', jetBrains),
  pack('rider', 'JetBrains Rider', ['rider64.exe', 'rider.exe'],
    'https://resources.jetbrains.com/storage/products/rider/docs/Rider_default_win_shortcuts.pdf', jetBrains),
  pack('goland', 'GoLand', ['goland64.exe', 'goland.exe'], 'https://www.jetbrains.com/help/go/mastering-keyboard-shortcuts.html', jetBrains),
  pack('clion', 'CLion', ['clion64.exe', 'clion.exe'], 'https://www.jetbrains.com/help/clion/mastering-keyboard-shortcuts.html', jetBrains),
  pack('datagrip', 'DataGrip', ['datagrip64.exe', 'datagrip.exe'], 'https://www.jetbrains.com/help/datagrip/mastering-keyboard-shortcuts.html', jetBrains),
  pack('rubymine', 'RubyMine', ['rubymine64.exe', 'rubymine.exe'], 'https://www.jetbrains.com/help/ruby/mastering-keyboard-shortcuts.html', jetBrains),
  pack('rustrover', 'RustRover', ['rustrover64.exe', 'rustrover.exe'], 'https://www.jetbrains.com/help/rust/mastering-keyboard-shortcuts.html', jetBrains),
  pack('vscodium', 'VSCodium', ['vscodium.exe'], 'https://code.visualstudio.com/docs/reference/default-keybindings', vsCodeKeymap),
  pack('windsurf', 'Windsurf', ['windsurf.exe'], 'https://docs.windsurf.com/windsurf/getting-started', vsCodeKeymap),
  pack('zed', 'Zed', ['zed.exe'], 'https://zed.dev/docs/key-bindings', [
    ['palette', 'Command palette', 'command', 'Ctrl+Shift+P'],
    ['quick-open', 'Open file by name', 'file-search', 'Ctrl+P'],
    ['find-files', 'Search project', 'search', 'Ctrl+Shift+F'],
  ]),
  pack('eclipse', 'Eclipse IDE', ['eclipse.exe'], 'https://help.eclipse.org/latest/topic/org.eclipse.platform.doc.user/reference/ref-keybindings.htm', [
    ['quick-access', 'Quick access', 'command', 'Ctrl+3'],
    ['open-resource', 'Open resource', 'file-search', 'Ctrl+Shift+R'],
    ['open-type', 'Open Java type', 'search', 'Ctrl+Shift+T'],
    ['shortcuts', 'Show key assist', 'keyboard', 'Ctrl+Shift+L'],
  ]),
  pack('netbeans', 'Apache NetBeans', ['netbeans64.exe', 'netbeans.exe'], 'https://netbeans.apache.org/tutorial/main/kb/docs/java/editor-codereference/', [
    ['save', 'Save file', 'save', 'Ctrl+S'],
    ['find-files', 'Find in projects', 'file-search', 'Ctrl+Shift+F'],
    ['run', 'Run main project', 'play', 'F6'],
    ['debug', 'Debug main project', 'bug', 'Ctrl+F5'],
  ]),
  pack('rstudio', 'RStudio', ['rstudio.exe'], 'https://docs.posit.co/ide/user/ide/reference/shortcuts.html', [
    ['save', 'Save document', 'save', 'Ctrl+S'],
    ['source-editor', 'Focus source editor', 'file-code', 'Ctrl+1'],
    ['console', 'Focus console', 'square-terminal', 'Ctrl+2'],
    ['find-files', 'Find in files', 'file-search', 'Ctrl+Shift+F'],
  ]),
  pack('matlab', 'MATLAB', ['matlab.exe'], 'https://www.mathworks.com/help/matlab/matlab_env/keyboard-shortcuts.html', [
    ['new-script', 'New script', 'file-plus', 'Ctrl+N'],
    ['open-file', 'Open file', 'folder-open', 'Ctrl+O'],
    ['find-files', 'Find files', 'file-search', 'Ctrl+Shift+F'],
  ], { hostedWindows: { executables: ['matlabwindow.exe'], mode: MATLAB_DESKTOP_MODE } }),
  pack('spyder', 'Spyder', ['spyder.exe'], 'https://docs.spyder-ide.org/current/panes/editor.html', [
    ['save', 'Save script', 'save', 'Ctrl+S'],
    ['run', 'Run current file', 'play', 'F5'],
    ['run-cell', 'Run current cell', 'play', 'Ctrl+Enter'],
  ]),
  pack('postman', 'Postman', ['postman.exe'], 'https://learning.postman.com/docs/getting-started/installation/settings/shortcut-settings/', [
    ['new-tab', 'New tab', 'square-plus', 'Ctrl+T'],
    ['save', 'Save request', 'save', 'Ctrl+S'],
    ['close-tab', 'Close tab', 'x', 'Ctrl+W'],
  ]),
  pack('insomnia', 'Insomnia', ['insomnia.exe'], 'https://developer.konghq.com/insomnia/keyboard-shortcuts/', [
    ['search', 'Search requests', 'search', 'Ctrl+P'],
    ['preferences', 'Preferences', 'settings', 'Ctrl+Comma', { usLayout: true, notation: 'Ctrl+,' }],
    ['new-request', 'New request', 'square-plus', 'Ctrl+N'],
  ]),
  pack('dbeaver', 'DBeaver', ['dbeaver.exe'], 'https://dbeaver.com/docs/dbeaver/Shortcuts/', [
    ['shortcuts', 'Show keyboard shortcuts', 'keyboard', 'Ctrl+Shift+L'],
    ['open-editor', 'Open SQL console', 'square-terminal', 'Ctrl+Alt+L'],
    ['find', 'Find in editor', 'text-search', 'Ctrl+F'],
  ]),
  pack('ssms', 'SQL Server Management Studio', ['ssms.exe'], 'https://learn.microsoft.com/en-us/ssms/sql-server-management-studio-keyboard-shortcuts', [
    ['new-query', 'New query', 'file-plus', 'Ctrl+N'],
    ['object-explorer', 'Object Explorer', 'database', 'F8'],
    ['estimated-plan', 'Display estimated plan', 'workflow', 'Ctrl+L'],
    ['find', 'Find in query', 'search', 'Ctrl+F'],
  ]),
  pack('mysql-workbench', 'MySQL Workbench', ['mysqlworkbench.exe'], 'https://dev.mysql.com/doc/workbench/en/wb-keys.html', [
    ['new-query', 'New SQL tab', 'square-plus', 'Ctrl+T'],
    ['open-script', 'Open SQL script', 'folder-open', 'Ctrl+O'],
    ['save', 'Save SQL script', 'save', 'Ctrl+S'],
  ]),
  pack('mongodb-compass', 'MongoDB Compass', ['mongodbcompass.exe'], 'https://www.mongodb.com/docs/compass/keyboard-shortcuts/', [
    ['new-connection', 'New connection window', 'plug', 'Ctrl+N'],
    ['new-tab', 'New tab', 'square-plus', 'Ctrl+T'],
    ['close-tab', 'Close tab', 'x', 'Ctrl+W'],
  ], { editing: false }),
  pack('sourcetree', 'Sourcetree', ['sourcetree.exe'], 'https://support.atlassian.com/sourcetree/', [
    ['refresh', 'Refresh repository', 'refresh-cw', 'F5'],
    ['open-repository', 'Open repository', 'folder-open', 'Ctrl+O'],
  ], { editing: false }),
  pack('gitkraken', 'GitKraken Desktop', ['gitkraken.exe'], 'https://help.gitkraken.com/gitkraken-desktop/keyboard-shortcuts/', [
    ['fuzzy-finder', 'Fuzzy finder', 'search', 'Ctrl+P'],
    ['new-tab', 'New tab', 'square-plus', 'Ctrl+T'],
    ['close-tab', 'Close tab', 'x', 'Ctrl+W'],
  ], { editing: false }),
  pack('oracle-virtualbox', 'Oracle VirtualBox', ['virtualbox.exe'], 'https://www.virtualbox.org/manual/ch01.html', [
    ['new-vm', 'New virtual machine', 'square-plus', 'Ctrl+N'],
    ['add-vm', 'Add virtual machine', 'folder-open', 'Ctrl+A'],
    ['settings', 'Virtual machine settings', 'settings', 'Ctrl+S'],
  ], { editing: false }),
  pack('vmware-workstation', 'VMware Workstation', ['vmware.exe', 'vmplayer.exe'],
    'https://techdocs.broadcom.com/us/en/vmware-cis/desktop-hypervisors/workstation-pro/17-0/using-vmware-workstation-pro.html', [
    ['new-vm', 'New virtual machine', 'square-plus', 'Ctrl+N'],
    ['open-vm', 'Open virtual machine', 'folder-open', 'Ctrl+O'],
    ['full-screen', 'Toggle full screen', 'maximize', 'Ctrl+Alt+Enter'],
  ], { editing: false }),
  pack('arduino-ide', 'Arduino IDE', ['arduino ide.exe'], 'https://github.com/arduino/arduino-ide/blob/main/docs/advanced-usage.md', [
    ['verify-sketch', 'Verify sketch', 'check', 'Ctrl+R'],
    ['save', 'Save sketch', 'save', 'Ctrl+S'],
    ['serial-monitor', 'Serial monitor', 'square-terminal', 'Ctrl+Shift+M'],
    ['palette', 'Command palette', 'command', 'Ctrl+Shift+P'],
  ]),
];
