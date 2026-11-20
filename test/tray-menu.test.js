'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createTrayMenu, grantDetail } = require('../src/main/tray-menu');

function fixture({ windowed = false, edge = null, agent = null, platform = 'linux', language = () => 'en' } = {}) {
  const calls = [];
  const tray = { tooltip: null, menu: null, setToolTip(text) { this.tooltip = text; }, setContextMenu(menu) { this.menu = menu; } };
  const state = {
    edge, store: { file: 'C:/profiles/main.json' }, activities: { current: { id: 'main' } }, viewOnly: { enabled: false },
    appearance: { current: {} }, navigation: { current: { contextReturn: 'previous', calendar: 'none', desktopRevealGesture: false } },
    pages: { setContextReturn: (mode) => calls.push(['pages.setContextReturn', mode]) },
    monitoring: { historyHours: 24 }, retainedTelemetry: {}, deckReveal: { active: false }, panelMeasurement: null,
    preferredDisplay: null, win: null, agent,
  };
  const actions = new Proxy({}, { get: (_, name) => (...args) => calls.push([name, ...args]) });
  const menu = createTrayMenu({
    tray, log() {}, startup: { isEnabled: () => false, setEnabled: (enabled) => calls.push(['startup', enabled]) },
    opts: { windowed, profile: null }, root: '/lastra', platform, language,
    electron: {
      Menu: { buildFromTemplate: (template) => Object.assign(template, {
        popup: ({ window }) => calls.push(['popup', window, template.map(({ label }) => label)]),
      }) },
      dialog: { showErrorBox: (...args) => calls.push(['showErrorBox', ...args]) },
      clipboard: {},
      screen: { getAllDisplays: () => [{ id: 7, label: 'XENEON EDGE', bounds: { width: 2560, height: 720 }, size: { width: 2560, height: 720 }, scaleFactor: 1 }] },
      shell: { openPath: (file) => calls.push(['openPath', file]), showItemInFolder: (file) => calls.push(['showItemInFolder', file]) },
    },
    state: () => state, actions,
  });
  return { menu, tray, state, calls };
}

const find = (items, label) => items.find((item) => item.label === label);

test('the tooltip names the deck display state', () => {
  const windowed = fixture({ windowed: true });
  windowed.menu.refresh();
  assert.equal(windowed.tray.tooltip, 'Lastra: Windowed mode');
  assert.equal(windowed.tray.menu[0].label, 'Lastra');
  assert.equal(find(windowed.menu.settingsItems('navigation'), 'Deck display').enabled, false);

  const missing = fixture();
  missing.menu.refresh();
  assert.equal(missing.tray.tooltip, 'Lastra: XENEON EDGE not found');
});

test('the Windows tray contains only Lastra, startup, Info and Quit', () => {
  const { menu, tray, calls } = fixture({ platform: 'win32' });
  menu.refresh();
  assert.deepEqual(tray.menu.map(({ label }) => label), ['Lastra', 'Start with Windows', 'About', 'Quit']);
  find(tray.menu, 'Lastra').click();
  find(tray.menu, 'Start with Windows').click({ checked: true });
  find(tray.menu, 'About').click();
  find(tray.menu, 'Quit').click();
  assert.deepEqual(calls, [['openEditor'], ['startup', true], ['showInfo', 'XENEON EDGE not found'], ['quit']]);
});

test('tray and advanced settings follow the chosen interface language', () => {
  let language = 'it';
  const { menu, tray, calls } = fixture({ platform: 'win32', language: () => language });
  menu.refresh();
  assert.equal(tray.menu.at(-1).label, 'Esci');
  assert.equal(tray.tooltip, 'Lastra: XENEON EDGE non trovato');
  menu.openSettings('files', 'window');
  assert.deepEqual(calls.at(-1), ['popup', 'window', ['Apri JSON del profilo', 'Mostra profilo nella cartella']]);
  language = 'en';
  menu.refresh();
  assert.equal(tray.menu.at(-1).label, 'Quit');
});

test('advanced options live under the desktop Settings window', () => {
  const { menu, state, calls } = fixture();
  const displays = find(menu.settingsItems('navigation'), 'Deck display').submenu;
  displays[0].click();
  displays[1].click();
  state.store = { file: 'C:/profiles/work.json' };
  find(menu.settingsItems('files'), 'Open profile JSON').click();
  assert.deepEqual(calls, [['selectDisplay', null], ['selectDisplay', '7'], ['openPath', 'C:/profiles/work.json']]);
  assert.equal(menu.settingsItems('agents').length, 0);
  assert.ok(find(menu.settingsItems('navigation'), 'Reveal desktop'));
  assert.equal(menu.openSettings('files', 'settings-window'), true);
  assert.deepEqual(calls.at(-1), ['popup', 'settings-window', ['Open profile JSON', 'Show profile in folder']]);
  assert.equal(menu.openSettings('invalid', 'settings-window'), false);
});

test('a desktop reveal offers to restore the deck', () => {
  const { menu, state } = fixture({ windowed: true });
  state.deckReveal.active = true;
  menu.refresh();
  assert.equal(find(menu.settingsItems('navigation'), 'Restore deck').enabled, true);
  assert.equal(find(menu.settingsItems('navigation'), 'Reveal desktop'), undefined);
});

test('the agent menu lists clients and grants', () => {
  const agent = {
    access: { state: { enabled: true, paused: false }, activeClients: () => [{ id: 'abcdef0123456789', scopes: ['layout'], profile: 'main' }] },
    service: { locked: false, connected: () => new Set(['abcdef0123456789']) },
    projects: { grantTargets: () => [] },
  };
  const { menu } = fixture({ agent });
  menu.refresh();
  const agentMenu = find(menu.settingsItems('agents'), 'Agent access').submenu;
  assert.equal(agentMenu[2].label, '1 connected');
  assert.equal(find(agentMenu, 'Grant access').enabled, true);
  assert.equal(find(agentMenu, 'Grant access to one project').enabled, false);
  assert.equal(find(agentMenu, 'Clients').submenu[0].label, 'Agent abcdef01 · Connected');
});

test('the grant text describes each scope and the activity', () => {
  const text = grantDetail(['layout', 'actions'], { profile: 'work', durationMs: 900_000 });
  assert.match(text, /^[^\n]+ and [^\n]+ · Work profile\n/);
  assert.match(text, /\nThis grant ends after 15 minutes\./);
  assert.match(text, /\nEach saved key action needs your approval on the deck\./);
  assert.ok(text.endsWith('\n\nLastra will copy the local MCP configuration for this Windows user.'));
  assert.match(grantDetail(['projects'], { profile: 'main', project: { name: 'Site' } }), /Only the configured project “Site” is available/);
});
