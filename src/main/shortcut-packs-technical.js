// @ts-check
'use strict';

const { desktopPack: pack } = require('./shortcut-pack-data');

module.exports = [
  pack('emacs', 'GNU Emacs', ['emacs.exe'], 'https://www.gnu.org/software/emacs/manual/html_node/emacs/Commands.html', [
    ['search', 'Incremental search', 'search', 'Ctrl+S', { source: 'https://www.gnu.org/software/emacs/manual/html_node/emacs/Incremental-Search.html' }],
    ['search-back', 'Search backward', 'arrow-left', 'Ctrl+R', { source: 'https://www.gnu.org/software/emacs/manual/html_node/emacs/Incremental-Search.html' }],
    ['command', 'Run named command', 'command', 'Alt+X'],
    ['cancel', 'Cancel current command', 'x', 'Ctrl+G'],
  ], { editing: false }),
  pack('neovide', 'Neovide', ['neovide.exe'], 'https://neovim.io/doc/user/intro.html', [
    ['normal-mode', 'Return to Normal mode', 'corner-up-left', 'Esc'],
    ['help', 'Open Neovim help', 'circle-help', 'F1'],
    ['tag-back', 'Back in tag stack', 'arrow-left', 'Ctrl+T', { context: 'In Normal mode', source: 'https://neovim.io/doc/user/tagsrch.html' }],
  ], { editing: false }),
  pack('kate', 'Kate', ['kate.exe'], 'https://kate-editor.org/post/2021/2021-01-10-kate-quick-open/', [
    ['quick-open', 'Quick Open', 'file-search', 'Ctrl+Alt+O', { source: 'https://kate-editor.org/post/2021/2021-01-10-kate-quick-open/' }],
    ['save', 'Save document', 'save', 'Ctrl+S'],
    ['find', 'Find in document', 'search', 'Ctrl+F'],
  ]),
  pack('geany', 'Geany', ['geany.exe'], 'https://www.geany.org/manual/current/index.html#keybindings', [
    ['save', 'Save document', 'save', 'Ctrl+S'],
    ['find-files', 'Find in files', 'file-search', 'Ctrl+Shift+F'],
    ['build', 'Build', 'hammer', 'F9'],
    ['run', 'Run', 'play', 'F5'],
  ]),
  pack('scite', 'SciTE', ['scite.exe'], 'https://www.scintilla.org/SciTEDoc.html', [
    ['replace', 'Replace text', 'replace', 'Ctrl+H'],
    ['compile', 'Compile', 'hammer', 'Ctrl+F7'],
    ['run', 'Run', 'play', 'F5'],
  ]),
  pack('ultraedit', 'UltraEdit', ['uedit64.exe', 'uedit32.exe'], 'https://www.ultraedit.com/support/tutorials-power-tips/ultraedit/keyboard-shortcuts/', [
    ['save', 'Save file', 'save', 'Ctrl+S'],
    ['find', 'Find text', 'search', 'Ctrl+F'],
    ['replace', 'Replace text', 'replace', 'Ctrl+R'],
  ]),
  pack('editpad', 'EditPad', ['editpadlite.exe', 'editpadpro.exe', 'editpadlite8.exe', 'editpadpro8.exe'], 'https://www.editpadpro.com/manual.html', [
    ['save', 'Save file', 'save', 'Ctrl+S'],
    ['find', 'Find text', 'search', 'Ctrl+F'],
    ['find-next', 'Find next match', 'chevron-down', 'F3'],
  ]),
  pack('cudatext', 'CudaText', ['cudatext.exe'], 'https://wiki.freepascal.org/CudaText#Hotkeys', [
    ['palette', 'Command palette', 'command', 'Ctrl+Shift+P'],
    ['find', 'Find text', 'search', 'Ctrl+F'],
    ['save', 'Save file', 'save', 'Ctrl+S'],
  ]),
  pack('sublime-merge', 'Sublime Merge', ['sublime_merge.exe'], 'https://www.sublimemerge.com/docs/command_palette', [
    ['palette', 'Command palette', 'command', 'Ctrl+Shift+P'],
    ['search', 'Search repository', 'search', 'Ctrl+F'],
    ['open-repository', 'Open repository', 'folder-open', 'Ctrl+O'],
  ], { editing: false }),
  pack('kiro', 'Kiro', ['kiro.exe'], 'https://kiro.dev/docs/editor/interface/', [
    ['palette', 'Command palette', 'command', 'Ctrl+Shift+P'],
    ['quick-open', 'Quick Open', 'file-search', 'Ctrl+P'],
    ['find-files', 'Search workspace', 'search', 'Ctrl+Shift+F'],
  ]),
  pack('codeblocks', 'Code::Blocks', ['codeblocks.exe'], 'https://www.codeblocks.org/user-manual/', [
    ['build', 'Build project', 'hammer', 'Ctrl+F9'],
    ['run', 'Run project', 'play', 'Ctrl+F10'],
    ['build-run', 'Build and run', 'play', 'F9'],
  ]),
  pack('lazarus', 'Lazarus IDE', ['lazarus.exe'], 'https://wiki.freepascal.org/Lazarus_IDE_Shortcuts', [
    ['run', 'Run project', 'play', 'F9'],
    ['build', 'Build project', 'hammer', 'Shift+F9'],
    ['switch-form', 'Switch form or unit', 'panels-top-left', 'F12'],
  ]),
  pack('rad-studio', 'RAD Studio', ['bds.exe'], 'https://docwiki.embarcadero.com/RADStudio/Florence/en/Default_Keyboard_Shortcuts', [
    ['run', 'Run with debugger', 'bug', 'F9'],
    ['compile', 'Compile project', 'hammer', 'Ctrl+F9'],
    ['switch-form', 'Switch form or unit', 'panels-top-left', 'F12'],
  ]),
  pack('thonny', 'Thonny', ['thonny.exe'], 'https://thonny.org/', [
    ['run', 'Run current script', 'play', 'F5'],
    ['debug', 'Debug current script', 'bug', 'Ctrl+F5'],
    ['save', 'Save script', 'save', 'Ctrl+S'],
  ]),
  pack('qt-creator', 'Qt Creator', ['qtcreator.exe'], 'https://doc.qt.io/qtcreator/creator-keyboard-shortcuts.html', [
    ['locator', 'Open Locator', 'search', 'Ctrl+K'],
    ['follow-symbol', 'Follow symbol', 'arrow-right', 'F2'],
    ['build', 'Build project', 'hammer', 'Ctrl+B'],
    ['run', 'Run project', 'play', 'Ctrl+R'],
  ]),
  pack('stm32cubeide', 'STM32CubeIDE', ['stm32cubeide.exe'], 'https://help.eclipse.org/latest/topic/org.eclipse.platform.doc.user/reference/ref-keybindings.htm', [
    ['quick-access', 'Quick Access', 'search', 'Ctrl+3'],
    ['open-resource', 'Open Resource', 'file-search', 'Ctrl+Shift+R'],
    ['shortcuts', 'Show Key Assist', 'keyboard', 'Ctrl+Shift+L'],
  ]),
  pack('keil-uvision', 'Keil µVision', ['uv4.exe'], 'https://www.keil.com/support/man/docs/uv4cl/uv4cl_ui_project.htm', [
    ['build', 'Build target', 'hammer', 'F7'],
    ['debug', 'Toggle debug session', 'bug', 'Ctrl+F5'],
    ['save', 'Save document', 'save', 'Ctrl+S'],
  ]),
  pack('powershell-ise', 'Windows PowerShell ISE', ['powershell_ise.exe'], 'https://learn.microsoft.com/en-us/powershell/scripting/windows-powershell/ise/keyboard-shortcuts-for-the-windows-powershell-ise', [
    ['run-script', 'Run script', 'play', 'F5'],
    ['run-selection', 'Run selection', 'text-select', 'F8'],
    ['snippets', 'Show snippets', 'braces', 'Ctrl+J'],
  ], { editing: false }),
  pack('jupyterlab-desktop', 'JupyterLab Desktop', ['jupyterlab.exe'], 'https://jupyterlab.readthedocs.io/en/stable/user/commands.html', [
    ['palette', 'Command palette', 'command', 'Ctrl+Shift+C'],
    ['find', 'Search current document', 'search', 'Ctrl+F'],
    ['save', 'Save notebook', 'save', 'Ctrl+S'],
    ['run-cell', 'Run cell and advance', 'play', 'Shift+Enter', { context: 'While a notebook has focus' }],
  ]),
  pack('windbg', 'WinDbg', ['windbg.exe', 'windbgx.exe'], 'https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/keyboard-shortcuts', [
    ['go', 'Continue debugging', 'play', 'F5'],
    ['step-over', 'Step over', 'step-forward', 'F10'],
    ['step-into', 'Step into', 'arrow-down', 'F11'],
    ['step-out', 'Step out', 'arrow-up', 'Shift+F11'],
  ], { editing: false }),
  pack('winmerge', 'WinMerge', ['winmergeu.exe'], 'https://manual.winmerge.org/en/Shortcut_keys.html', [
    ['open', 'Open comparison', 'folder-open', 'Ctrl+O'],
    ['next-diff', 'Next difference', 'chevron-down', 'Alt+Down'],
    ['previous-diff', 'Previous difference', 'chevron-up', 'Alt+Up'],
    ['refresh', 'Refresh comparison', 'refresh-cw', 'F5'],
  ]),
  pack('beyond-compare', 'Beyond Compare', ['bcompare.exe', 'bcompare64.exe'], 'https://www.scootersoftware.com/v5help/index.html', [
    ['next-diff', 'Next difference', 'chevron-down', 'Ctrl+N'],
    ['previous-diff', 'Previous difference', 'chevron-up', 'Ctrl+P'],
    ['refresh', 'Refresh comparison', 'refresh-cw', 'F5'],
  ]),
  pack('meld', 'Meld', ['meld.exe'], 'https://gnome.pages.gitlab.gnome.org/meld/help/', [
    ['next-change', 'Next change', 'chevron-down', 'Alt+Down'],
    ['previous-change', 'Previous change', 'chevron-up', 'Alt+Up'],
    ['refresh', 'Refresh comparison', 'refresh-cw', 'Ctrl+R'],
  ]),
  pack('kdiff3', 'KDiff3', ['kdiff3.exe'], 'https://docs.kde.org/trunk_kf6/en/kdiff3/kdiff3/kdiff3.pdf', [
    ['next-diff', 'Next difference', 'chevron-down', 'Ctrl+Down'],
    ['previous-diff', 'Previous difference', 'chevron-up', 'Ctrl+Up'],
    ['open', 'Open comparison', 'folder-open', 'Ctrl+O'],
  ]),
  pack('heidisql', 'HeidiSQL', ['heidisql.exe'], 'https://www.heidisql.com/help.php', [
    ['execute', 'Run query', 'play', 'F9', { context: 'While a query editor has focus' }],
    ['find', 'Find in editor', 'search', 'Ctrl+F'],
    ['save-sql', 'Save SQL file', 'save', 'Ctrl+S'],
  ]),
  pack('pgadmin', 'pgAdmin 4', ['pgadmin4.exe'], 'https://www.pgadmin.org/docs/pgadmin4/latest/keyboard_shortcuts.html', [
    ['execute', 'Run query', 'play', 'F5', { context: 'While the Query Tool has focus' }],
    ['save', 'Save SQL file', 'save', 'Ctrl+S'],
    ['open-file', 'Open SQL file', 'folder-open', 'Ctrl+O'],
  ]),
  pack('beekeeper-studio', 'Beekeeper Studio', ['beekeeper studio.exe'], 'https://docs.beekeeperstudio.io/user_guide/sql_editor/editor/', [
    ['new-tab', 'New query tab', 'square-plus', 'Ctrl+T'],
    ['execute', 'Run query', 'play', 'Ctrl+Enter', { context: 'While a query editor has focus' }],
    ['close-tab', 'Close query tab', 'x', 'Ctrl+W'],
  ]),
  pack('sqlite-browser', 'DB Browser for SQLite', ['db browser for sqlite.exe'], 'https://github.com/sqlitebrowser/sqlitebrowser/blob/master/src/MainWindow.ui', [
    ['open-db', 'Open database', 'folder-open', 'Ctrl+O'],
    ['new-db', 'New database dialog', 'database', 'Ctrl+N'],
    ['write-changes', 'Write database changes', 'save', 'Ctrl+S', { confirm: true }],
  ]),
  pack('sqlitestudio', 'SQLiteStudio', ['sqlitestudio.exe'], 'https://github.com/pawelsalawa/sqlitestudio/wiki/User_Manual', [
    ['sql-editor', 'Open SQL editor', 'square-terminal', 'Alt+E'],
    ['open-db', 'Add database', 'database', 'Ctrl+O'],
    ['refresh', 'Refresh database list', 'refresh-cw', 'F5'],
  ]),
  pack('dax-studio', 'DAX Studio', ['daxstudio.exe'], 'https://daxstudio.org/docs/features/options/options-window-key-bindings/', [
    ['execute', 'Run DAX query', 'play', 'F5', { context: 'With a model connected' }],
    ['open-file', 'Open query', 'folder-open', 'Ctrl+O'],
    ['save', 'Save query', 'save', 'Ctrl+S'],
  ]),
  pack('docker-desktop', 'Docker Desktop', ['docker desktop.exe'], 'https://docs.docker.com/desktop/use-desktop/', [
    ['search', 'Search Docker Desktop', 'search', 'Ctrl+K'],
    ['next-control', 'Focus next control', 'arrow-right', 'Tab'],
    ['previous-control', 'Focus previous control', 'arrow-left', 'Shift+Tab'],
  ], { editing: false }),
];
