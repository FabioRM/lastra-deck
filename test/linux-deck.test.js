'use strict';

const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const { PassThrough } = require('node:stream');
const { test } = require('node:test');
const { createActionRunner } = require('../src/main/actions');
const { parseCombo } = require('../src/main/actions/keys');
const { createLinuxDesktop, createHyprlandDesktop, linuxForeground, linuxInput } = require('../src/main/desktop-linux');
const { createX11Desktop } = require('../src/main/desktop-x11');
const { createPortalDesktop } = require('../src/main/desktop-wayland');
const { parseArgs } = require('../src/main/cli');
const { findEdgeDisplay } = require('../src/main/display');
const { fixedEditingKeys } = require('../src/main/fixed-editing-keys');
const { Pages, runPageAction } = require('../src/main/pages');
const { validateProfile } = require('../src/main/profile');
const { packFor, previewPacks } = require('../src/main/shortcut-packs');

const chrome = { platform: 'linux', appId: 'google-chrome', executable: '', name: 'Google-chrome', title: 'A document',
  id: 42, windowId: 12, keyboardLayout: 1 };

test('Linux app IDs select documented Deck profiles and keep the fixed editing keys', async () => {
  const profile = validateProfile({ name: 'Linux', grid: { cols: 8, rows: 3 }, pages: [{ id: 'home', name: 'Home', keys: [] }] });
  const packs = previewPacks('en-US', 'linux');
  for (const pack of packs) validateProfile({ ...profile, pages: [{ id: pack.id, name: pack.name, appIds: pack.appIds,
    keys: pack.keys }] });
  const pages = new Pages();
  pages.observe(chrome);
  const page = pages.current(profile);
  assert.equal(page.pack, 'linux-chrome');
  const editing = fixedEditingKeys(profile, pages.foreground, { platform: 'linux' });
  assert.deepEqual(editing.map(({ id }) => id), ['edit:cut', 'edit:copy', 'edit:paste', 'edit:undo', 'edit:redo']);
  assert.ok(editing.every(({ action }) => action?.shortcutGuard?.platform === 'linux'));

  let active = chrome;
  const calls = [];
  const desktop = { context: () => active, checkChord() {}, sendChord(keys, target) { calls.push({ keys, target }); } };
  const foreground = linuxForeground(desktop);
  const runner = createActionRunner({ input: linuxInput(desktop), readForeground: foreground,
    readShortcutSettings: () => ({ platform: 'linux' }) });
  const { action } = page.keys.find(({ id }) => id === 'new-tab');
  const captured = pages.binding(page);
  assert.equal((await runPageAction(page, action, runner, foreground, captured)).ok, true);
  assert.deepEqual(calls[0], { keys: parseCombo('Ctrl+T'), target: chrome });
  active = { ...chrome, windowId: 13 };
  assert.equal((await runPageAction(page, action, runner, foreground, captured)).ok, false);
  assert.equal(calls.length, 1);
});

test('a Linux macro captures the original window across a delay even without a pack guard', async () => {
  let active = chrome;
  const desktop = { context: () => active, checkChord() {}, sendChord() { assert.fail('Changed targets must never receive the shortcut'); } };
  const runner = createActionRunner({ input: linuxInput(desktop), readForeground: linuxForeground(desktop),
    sleep: async () => { active = { ...chrome, windowId: 13 }; } });
  const result = await runner.run({ type: 'sequence', steps: [{ type: 'delay', ms: 5 }, { type: 'hotkey', keys: 'Ctrl+C' }] });
  assert.equal(result.ok, false);
  assert.match(result.message, /target window changed/i);
});

test('Linux terminal packs use clipboard shortcuts without exposing shell Ctrl+C as Copy', () => {
  const profile = { webApps: {} };
  for (const appId of ['org.gnome.terminal', 'org.kde.konsole']) {
    const context = { ...chrome, appId };
    assert.ok(packFor(context));
    const [cut, copy, paste, undo, redo] = fixedEditingKeys(profile, context, { platform: 'linux' });
    assert.equal(copy.action.keys, 'Ctrl+Shift+C');
    assert.equal(paste.action.keys, 'Ctrl+Shift+V');
    for (const key of [cut, undo, redo]) assert.equal(key.action, undefined);
  }
});

test('X11 verifies the keyboard focus while holding the server before sending a chord', () => {
  let focused = true;
  let grabbed = false;
  const calls = [];
  const desktop = createX11Desktop({ pid: 99, open: () => ({
    activeWindow: () => chrome.windowId, integer: () => chrome.id,
    property: (_, name) => name === 'WM_CLASS' ? Buffer.from('chrome\0Google-chrome\0') : Buffer.from(chrome.title),
    group: () => 0, canSend: true,
    keycode: (symbol) => ({ code: { Control_L: 37, t: 28 }[symbol] ?? 7 }),
    focusBelongsTo: () => { assert.equal(grabbed, true); return focused; },
    withServer(callback) { grabbed = true; try { callback(); } finally { grabbed = false; } },
    press(codes) { assert.equal(grabbed, true); calls.push(codes); },
  }) });
  assert.equal(packFor(desktop.context()).id, 'linux-chrome');
  const expected = desktop.context();
  desktop.sendChord(parseCombo('Ctrl+T'), expected);
  focused = false;
  assert.throws(() => desktop.sendChord(parseCombo('Ctrl+T'), expected), /target window or keyboard layout changed/);
  assert.deepEqual(calls, [[37, 28]]);
  assert.equal(grabbed, false);
});

test('Wayland chooses the Hyprland adapter even with DISPLAY set, and never falls back to XWayland', () => {
  const env = { XDG_SESSION_TYPE: 'wayland', DISPLAY: ':0' };
  const openX11 = () => assert.fail('XWayland cannot target native Wayland apps');
  const backend = createLinuxDesktop({ env, openX11 });
  assert.match(backend.reason, /require GNOME, KDE Plasma, or Hyprland/);
  assert.equal(linuxForeground(backend).windowId(), null);
  const hyprland = { kind: 'hyprland' };
  assert.equal(createLinuxDesktop({ env: { ...env, HYPRLAND_INSTANCE_SIGNATURE: 'test' }, openX11, openHyprland: () => hyprland }), hyprland);
});

test('GNOME and KDE use portal input alongside an XWayland Deck window', () => {
  const openX11 = () => assert.fail('Native Wayland windows must use Wayland input');
  for (const [desktop, kind] of [['ubuntu:GNOME', 'gnome'], ['KDE', 'kde']]) {
    const env = { XDG_CURRENT_DESKTOP: desktop, WAYLAND_DISPLAY: 'wayland-0' };
    const openPortal = (options) => ({ kind: options.kind, get reason() { return 'test'; } });
    assert.match(createLinuxDesktop({ env, openX11 }).reason, /requires XWayland/);
    const adapter = createLinuxDesktop({ env: { ...env, DISPLAY: ':1' }, openX11, openPortal });
    assert.equal(adapter.kind, kind);
    assert.equal(adapter.xwayland, true);
    assert.equal(typeof Object.getOwnPropertyDescriptor(adapter, 'reason').get, 'function');
  }
  assert.equal(parseArgs(['--enable-wayland-keyboard']).enableWaylandKeyboard, true);
});

test('the Wayland adapter exposes live permission and waits for the target-checked helper', async () => {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill() {} });
  const adapter = createPortalDesktop({ kind: 'gnome', log() {}, onChange() {}, env: {}, launch: () => child,
    lookup: (key) => ({ Control_L: 65507, t: 116 })[key], pid: 99 });
  const publish = (message) => child.stdout.write(JSON.stringify(message) + '\n');
  try {
    publish({ type: 'focus', window: { ...chrome, windowId: '88', appId: 'Google-chrome.desktop' } });
    const target = adapter.context();
    assert.equal(target.appId, chrome.appId);
    assert.throws(() => adapter.sendChord(parseCombo('Ctrl+T'), target), /authorize keyboard/);
    const sent = once(child.stdin, 'data');
    const enabled = adapter.enable();
    const request = JSON.parse((await sent)[0]);
    assert.equal(request.command, 'enable');
    publish({ type: 'keyboard', ready: true });
    publish({ type: 'reply', id: request.id });
    await enabled;
    assert.equal(adapter.reason, undefined);
    const sending = once(child.stdin, 'data');
    const result = adapter.sendChord(parseCombo('Ctrl+T'), target);
    const chord = JSON.parse((await sending)[0]);
    assert.deepEqual(chord.target, { id: 42, windowId: '88', appId: 'google-chrome' });
    assert.deepEqual(chord.keys, [65507, 116]);
    publish({ type: 'reply', id: chord.id, error: 'The shortcut target window changed.' });
    await assert.rejects(result, /target window changed/);
    publish({ type: 'focus', window: { ...chrome, windowId: '99', id: 99, appId: 'lastra' } });
    assert.equal(adapter.context(), null);
  } finally { adapter.close(); }
});

test('Hyprland checks the window in the compositor and targets only that window', () => {
  const command = [];
  let locked = false;
  let current = true;
  const hyprctl = (...args) => {
    command.push(args);
    if (args[0] === '-j') return JSON.stringify({ address: '0xafa', pid: 22, initialClass: 'firefox', title: 'A webpage' });
    if (args[0] === 'locked') return String(locked);
    return current ? 'ok' : 'Lastra target changed';
  };
  const backend = createHyprlandDesktop({ pid: 33, hyprctl });
  const target = backend.context();
  assert.equal(packFor(target).id, 'linux-firefox');
  backend.sendChord(parseCombo('Ctrl+Shift+T'), target);
  assert.match(command[3][1], /window\.address == "0xafa" and window\.pid == 22/);
  assert.match(command[3][1], /send_shortcut\(\{mods = "CTRL SHIFT", key = "t", window = window\}/);
  assert.doesNotMatch(command[3][1], /A webpage/);
  current = false;
  assert.throws(() => backend.sendChord(parseCombo('Ctrl+T'), target), /target window changed/);
  locked = true;
  assert.throws(() => backend.sendChord(parseCombo('Ctrl+T'), target), /session is locked/);
  assert.deepEqual(command.at(-1), ['locked']);
  assert.throws(() => backend.sendChord(parseCombo('vk:41'), target), /no Linux mapping/);
});

test('Linux selects an unlabelled Edge only when its resolution is unique or the display is explicitly selected', () => {
  const edge = { id: 3, label: 'DP-2', size: { width: 1707, height: 480 }, scaleFactor: 1.5 };
  assert.equal(findEdgeDisplay([edge], null, 'linux'), edge);
  assert.equal(findEdgeDisplay([edge, { ...edge, id: 4 }], null, 'linux'), null);
  assert.equal(findEdgeDisplay([edge], '3', 'linux'), edge);
  assert.equal(findEdgeDisplay([edge], '3'), null);
});
