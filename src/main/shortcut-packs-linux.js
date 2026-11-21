'use strict';

const additionalPacks = require('./shortcut-packs-linux-apps');
const { extendShortcutPacks, linuxPortablePacks } = require('./shortcut-packs-portable');
const { linuxWorkflows } = require('./shortcut-pack-platform-workflows');
const tools = require('./shortcut-packs-linux-tools');

const LINUX_TERMINALS = new Set(['alacritty', 'com.mitchellh.ghostty', 'com.raggesilver.blackbox', 'com.system76.cosmicterm',
  'foot', 'footclient', 'gnome-terminal', 'gnome-terminal-server', 'kitty', 'konsole', 'org.gnome.console', 'org.gnome.terminal',
  'org.kde.konsole', 'org.wezfurlong.wezterm', 'terminator', 'tilix', 'xterm', 'xfce4-terminal', 'yakuake']);

function linuxShortcutPacks(browserKeys) {
  const chromeSource = 'https://support.google.com/chrome/answer/157179?hl=en';
  const navigation = [
    ['back', 'Go back', 'arrow-left', 'Alt+Left'],
    ['forward', 'Go forward', 'arrow-right', 'Alt+Right'],
    ['history', 'History', 'history', 'Ctrl+H'],
    ['new-window', 'New window', 'panels-top-left', 'Ctrl+N'],
    ['zoom-in', 'Zoom in', 'zoom-in', 'Ctrl+char:plus'],
    ['zoom-out', 'Zoom out', 'zoom-out', 'Ctrl+minus'],
    ['reset-zoom', 'Reset zoom', 'maximize', 'Ctrl+0'],
  ];
  const browser = (id, name, appIds, source, extra) => ({ id: 'linux-' + id, name, appIds, source,
    keys: [...browserKeys('Ctrl+PageUp', 'Ctrl+PageDown'), ...navigation, ...extra] });
  const chromium = [['private-window', 'Incognito window', 'eye-off', 'Ctrl+Shift+N'],
    ['bookmarks', 'Bookmarks manager', 'bookmark', 'Ctrl+Shift+O']];
  const privateWindow = (label) => [[chromium[0][0], label, ...chromium[0].slice(2)], chromium[1]];
  return extendShortcutPacks([
    browser('chrome', 'Google Chrome', ['google-chrome', 'google-chrome-stable', 'google-chrome-beta', 'com.google.chrome'], chromeSource, chromium),
    browser('chromium', 'Chromium', ['chromium', 'chromium-browser', 'org.chromium.chromium'], chromeSource, chromium),
    browser('brave', 'Brave', ['brave', 'brave-browser', 'com.brave.browser'],
      'https://support.brave.app/hc/en-us/articles/360032272171-What-keyboard-shortcuts-can-I-use-in-Brave', privateWindow('Private window')),
    browser('edge', 'Microsoft Edge', ['microsoft-edge', 'microsoft-edge-stable', 'microsoft-edge-beta', 'com.microsoft.edge'],
      'https://support.microsoft.com/en-us/edge/keyboard-shortcuts-in-microsoft-edge', privateWindow('InPrivate window')),
    browser('firefox', 'Mozilla Firefox', ['firefox', 'firefox-esr', 'org.mozilla.firefox'],
      'https://support.mozilla.org/en-US/kb/keyboard-shortcuts-perform-firefox-tasks-quickly', [
        ['private-window', 'Private window', 'eye-off', 'Ctrl+Shift+P'],
        ['bookmarks', 'Bookmarks sidebar', 'bookmark', 'Ctrl+B'],
      ]),
    { id: 'linux-vscode', name: 'Visual Studio Code', appIds: ['code', 'code-oss', 'code-insiders',
      'com.visualstudio.code', 'com.visualstudio.code-oss', 'vscodium', 'com.vscodium.codium'],
    source: 'https://code.visualstudio.com/shortcuts/keyboard-shortcuts-linux.pdf', keys: [
      ['palette', 'Command palette', 'command', 'Ctrl+Shift+P'],
      ['quick-open', 'Quick open', 'file-search', 'Ctrl+P'],
      ['find-files', 'Find in files', 'search', 'Ctrl+Shift+F'],
      ['explorer', 'Explorer', 'files', 'Ctrl+Shift+E'],
      ['source-control', 'Source control', 'git-branch', 'Ctrl+Shift+G'],
      ['terminal', 'Terminal', 'square-terminal', 'Ctrl+char:backquote'],
      ['save', 'Save', 'save', 'Ctrl+S'],
      ['debug', 'Debug view', 'bug', 'Ctrl+Shift+D'],
      ['problems', 'Problems', 'triangle-alert', 'Ctrl+Shift+M'],
      ['settings', 'Settings', 'settings', 'Ctrl+comma'],
      ['extensions', 'Extensions', 'blocks', 'Ctrl+Shift+X'],
      ['format-document', 'Format document', 'align-left', 'Ctrl+Shift+I'],
      ['go-to-line', 'Go to line', 'list-ordered', 'Ctrl+G'],
      ['definition', 'Go to definition', 'signpost', 'F12'],
      ['rename-symbol', 'Rename symbol', 'pencil', 'F2'],
      ['redo', 'Redo', 'redo-2', 'Ctrl+Shift+Z'],
    ] },
    ...additionalPacks,
    ...linuxPortablePacks,
    ...tools,
  ], linuxWorkflows).map((pack) => ({ ...pack, platform: /** @type {const} */ ('linux'), executables: [] }));
}

module.exports = { linuxShortcutPacks, LINUX_TERMINALS };
