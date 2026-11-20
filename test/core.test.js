'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');

const { parseCombo, mediaKey } = require('../src/main/actions/keys');
const { createActionRunner, expandEnv, expandPathEnv, expandLocalPath, isUrlLike } = require('../src/main/actions');
const { defineTypes, chordEvents, textEvents, sendKeyboardEvents, KEYEVENTF_KEYUP, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_UNICODE } = require('../src/main/actions/input-win32');
const { validateProfile, toView, ProfileStore } = require('../src/main/profile');
const { Pages } = require('../src/main/pages');
const { findEdgeDisplay, edgeOrientation } = require('../src/main/display');
const { SensorPoller, parseLhm, parseLhmValue } = require('../src/main/sensors');
const { iconExists, lucideIcon } = require('../src/main/icons');
const { tempDir } = require('./helpers/temp-dir');

const DEFAULT_PROFILE = path.join(__dirname, '..', 'profiles', 'default.json');

// ------------------------------------------------------------ keys

test('parseCombo recognises modifiers, letters and extended keys', () => {
  const keys = parseCombo('Ctrl+Win+Left');
  assert.deepEqual(keys.map((k) => k.vk), [0x11, 0x5b, 0x25]);
  assert.deepEqual(keys.map((k) => k.extended), [false, true, true]);
  assert.equal(parseCombo('ctrl+shift+m')[2].vk, 0x4d);
  assert.equal(parseCombo('f12')[0].vk, 0x7b);
});

test('parseCombo reports unknown keys', () => {
  assert.throws(() => parseCombo('ctrl+boh'), /Unknown key: "boh"/);
  assert.throws(() => parseCombo(''), /Empty key combination/);
});

test('mediaKey maps media keys', () => {
  assert.equal(mediaKey('playpause').vk, 0xb3);
  assert.throws(() => mediaKey('rewind'), /Unknown media key/);
});

// ------------------------------------------------------------ SendInput

test('INPUT matches the Win32 layout (40 bytes on 64-bit Windows)', () => {
  const koffi = require('koffi');
  const { INPUT } = defineTypes(koffi);
  assert.equal(koffi.sizeof(INPUT), process.arch === 'x64' || process.arch === 'arm64' ? 40 : 28);
});

test('chordEvents presses in order and releases in reverse order with extended flags', () => {
  const ev = chordEvents(parseCombo('ctrl+win+right'), () => 0);
  const seq = ev.map((e) => [e.u.ki.wVk, e.u.ki.dwFlags]);
  assert.deepEqual(seq, [
    [0x11, 0],
    [0x5b, KEYEVENTF_EXTENDEDKEY],
    [0x27, KEYEVENTF_EXTENDEDKEY],
    [0x27, KEYEVENTF_KEYUP | KEYEVENTF_EXTENDEDKEY],
    [0x5b, KEYEVENTF_KEYUP | KEYEVENTF_EXTENDEDKEY],
    [0x11, KEYEVENTF_KEYUP],
  ]);
});

test('partial keyboard delivery releases accepted keys without repeating the shortcut', () => {
  const events = chordEvents(parseCombo('Ctrl+Shift+K'), () => 0);
  const sent = [];
  assert.throws(() => sendKeyboardEvents(events, (batch) => {
    sent.push(batch);
    return sent.length === 1 ? 2 : 1;
  }), /Windows blocked keyboard input/);
  const keyUps = sent.slice(1).map((batch) => batch.map(({ u: { ki } }) => [ki.wVk, ki.dwFlags]));
  assert.deepEqual(keyUps, [[[0x10, KEYEVENTF_KEYUP], [0x11, KEYEVENTF_KEYUP]], [[0x11, KEYEVENTF_KEYUP]]]);
});

test('textEvents uses Unicode and handles surrogate pairs', () => {
  const ev = textEvents('è😀');
  assert.equal(ev.length, 6); // One code unit for the letter and two for the emoji, each pressed and released.
  assert.ok(ev.every((e) => e.u.ki.dwFlags & KEYEVENTF_UNICODE));
  assert.equal(ev[0].u.ki.wScan, 'è'.charCodeAt(0));
});

// ------------------------------------------------------------ actions

function fakeDeps() {
  const calls = [];
  const shell = {
    openExternal: async (url) => calls.push(['external', url]),
    openPath: async (p) => (calls.push(['path', p]), p.includes('missing') ? 'Path not found' : ''),
  };
  const spawn = (cmd, args) => {
    calls.push(['spawn', cmd, args]);
    const child = new EventEmitter();
    child.unref = () => {};
    setImmediate(() => (cmd === 'missing.exe'
      ? child.emit('error', Object.assign(new Error('x'), { code: 'ENOENT' }))
      : child.emit('spawn')));
    return child;
  };
  const input = {
    sendChord: (keys) => calls.push(['chord', keys.map((k) => k.name).join('+')]),
    sendText: (t) => calls.push(['text', t]),
  };
  return { calls, deps: { shell, spawn, input, env: { USERPROFILE: 'C:\\Users\\fabio' }, sleep: async () => {} } };
}

test('launch expands variables and reports missing programs', async () => {
  const { calls, deps } = fakeDeps();
  const runner = createActionRunner(deps);
  assert.deepEqual(await runner.run({ type: 'launch', target: '%userprofile%\\app.exe', args: ['-x'] }), { ok: true, message: null });
  assert.deepEqual(calls[0], ['spawn', 'C:\\Users\\fabio\\app.exe', ['-x']]);
  const res = await runner.run({ type: 'launch', target: 'missing.exe' });
  assert.equal(res.ok, false);
  assert.match(res.message, /Program not found/);
});

test('launch rejects .cmd and .bat files', async () => {
  const { deps } = fakeDeps();
  const res = await createActionRunner(deps).run({ type: 'launch', target: 'code.cmd' });
  assert.equal(res.ok, false);
  assert.match(res.message, /\.exe/);
});

test('open distinguishes URLs, Windows protocols and file paths', async () => {
  const { calls, deps } = fakeDeps();
  const runner = createActionRunner(deps);
  await runner.run({ type: 'open', target: 'https://claude.ai' });
  await runner.run({ type: 'open', target: 'ms-settings:' });
  await runner.run({ type: 'open', target: '%USERPROFILE%\\Downloads' });
  assert.deepEqual(calls, [
    ['external', 'https://claude.ai'],
    ['external', 'ms-settings:'],
    ['path', 'C:\\Users\\fabio\\Downloads'],
  ]);
  const res = await runner.run({ type: 'open', target: 'C:\\missing' });
  assert.deepEqual(res, { ok: false, message: 'Path not found' });
  assert.equal(isUrlLike('C:\\Windows'), false);
});

test('sequence runs steps in order and reports the failing step', async () => {
  const { calls, deps } = fakeDeps();
  const runner = createActionRunner(deps);
  const ok = await runner.run({
    type: 'sequence',
    steps: [{ type: 'media', key: 'stop' }, { type: 'delay', ms: 100 }, { type: 'hotkey', keys: 'win+d' }, { type: 'text', text: 'hello' }],
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(calls, [['chord', 'stop'], ['chord', 'win+d'], ['text', 'hello']]);
  const bad = await runner.run({ type: 'sequence', steps: [{ type: 'hotkey', keys: 'win+d' }, { type: 'hotkey', keys: 'ctrl+boh' }] });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /^Step 2: Unknown key/);
});

test('keyboard steps recheck focus after a delay, and explicit targets override the page', async () => {
  const { calls, deps } = fakeDeps();
  let active = 'code.exe';
  const runner = createActionRunner({
    ...deps, readForeground: () => active, sleep: async () => { active = 'chrome.exe'; },
  });
  const codeAction = { type: 'hotkey', keys: 'ctrl+a' };
  const result = await runner.run({ type: 'sequence', steps: [
    codeAction, { type: 'delay', ms: 100 }, codeAction,
  ] }, ['Code.exe']);
  assert.equal(result.ok, false);
  assert.match(result.message, /Step 3: Switch to Code\.exe/);
  assert.deepEqual(calls, [['chord', 'ctrl+a']]);

  const override = await runner.run({ type: 'text', text: 'Ready', targetApps: ['Chrome.exe'] }, ['Code.exe']);
  assert.equal(override.ok, true);
  assert.deepEqual(calls.at(-1), ['text', 'Ready']);
  assert.throws(() => validateProfile({ keys: [{ id: 'test', action: {
    ...codeAction, targetApps: ['C:\\Code.exe'],
  } }] }), /targetApps/);
});

test('the runner returns errors without throwing', async () => {
  const { deps } = fakeDeps();
  const runner = createActionRunner(deps);
  assert.equal((await runner.run(null)).ok, false);
  assert.equal((await runner.run({ type: 'rm -rf' })).ok, false);
  assert.equal((await runner.run({ type: 'delay', ms: 999999 })).ok, false);
});

test('expandEnv preserves unknown variables', () => {
  assert.equal(expandEnv('%UNKNOWN%\\x', {}), '%UNKNOWN%\\x');
});

// ------------------------------------------------------------ profile

test('the default profile and its icons are valid', () => {
  const profile = validateProfile(JSON.parse(fs.readFileSync(DEFAULT_PROFILE, 'utf8')));
  assert.deepEqual(profile.grid, { cols: 8, rows: 3 });
  assert.equal(profile.locale, 'en-GB');
  for (const page of profile.pages) {
    for (const k of page.keys.filter(Boolean)) {
      assert.ok(iconExists(k.icon), `missing icon: ${k.icon}`);
      for (const action of [k.action, k.hold, k.double]) {
        if (action?.type === 'hotkey') parseCombo(action.keys);
      }
    }
  }
});

test('icons keep the dimensions of their child elements', () => {
  const svg = lucideIcon('layout-grid');
  assert.match(svg, /^<svg (?![^>]*\swidth=)/);
  assert.match(svg, /<rect [^>]*width="7"/);
});

test('validateProfile explains which fields to fix', () => {
  const base = { grid: { cols: 2, rows: 1 }, keys: [] };
  assert.throws(() => validateProfile({ ...base, keys: [{ id: 'a', action: { type: 'x' } }] }), /key 1: unknown action type "x"/);
  assert.throws(() => validateProfile({ ...base, keys: [{ id: 'a', action: { type: 'open' } }, { id: 'a', action: { type: 'open' } }] }), /duplicate ID/);
  assert.throws(() => validateProfile({ ...base, keys: [null, null, null] }), /do not fit/);
  assert.throws(() => validateProfile({ ...base, grid: { cols: 40, rows: 1 } }), /grid.cols/);
});

test('the renderer view contains no commands', () => {
  const profile = validateProfile(JSON.parse(fs.readFileSync(DEFAULT_PROFILE, 'utf8')));
  const view = toView(profile, { icon: () => '<svg/>' });
  assert.equal(view.slots.length, 24);
  const json = JSON.stringify(view);
  assert.ok(!json.includes('wt.exe') && !json.includes('"action"') && !json.includes('ctrl+'));
  assert.equal(view.slots.find((s) => s && s.id === 'play').hasHold, true);
});

test('legacy profiles keep their keys and positions on a Home page', () => {
  const keys = [null, { id: 'a', action: { type: 'text', text: 'hello' } }];
  const profile = validateProfile({ grid: { cols: 2, rows: 1 }, keys });
  assert.equal(profile.version, 1);
  assert.equal(profile.pages[0].id, 'home');
  assert.equal(profile.pages[0].keys[0], null);
  assert.deepEqual(profile.pages[0].keys[1].action, keys[1].action);
});

test('pages follow the executable, respect the page lock and restore the manual selection', () => {
  const profile = validateProfile(JSON.parse(fs.readFileSync(DEFAULT_PROFILE, 'utf8')));
  const pages = new Pages();
  assert.equal(pages.current(profile).id, 'home');
  pages.observe('code.exe');
  assert.equal(pages.current(profile).pack, 'vscode');
  pages.toggleLock(profile);
  pages.observe('chrome.exe');
  assert.equal(pages.current(profile).pack, 'vscode');
  pages.toggleLock(profile);
  assert.equal(pages.current(profile).pack, 'chrome');
  pages.select(profile, 'home');
  pages.observe(null);
  assert.equal(pages.current(profile).id, 'home');
  pages.observe('notepad.exe');
  pages.observe('chrome.exe');
  assert.equal(pages.current(profile).pack, 'chrome');
  pages.observe('notepad.exe');
  assert.equal(pages.current(profile).name, 'Notepad');
  assert.equal(pages.current(profile).generated, true);
});

test('profiles reject incompatible gestures and duplicate executable rules', () => {
  const action = { type: 'hotkey', keys: 'ctrl+t' };
  const home = { id: 'home', apps: ['chrome.exe'], keys: [{ id: 'a', action }] };
  assert.throws(() => validateProfile({ pages: [home, { id: 'browser', apps: ['CHROME.EXE'], keys: [] }] }), /already assigned/);
  assert.throws(() => validateProfile({ keys: [{ id: 'a', action, confirm: true, double: action }] }), /single gesture/);
  const view = toView(validateProfile({ keys: [{ id: 'a', action, double: action }] }));
  assert.equal(view.slots[0].hasDouble, true);
  assert.equal(JSON.stringify(view).includes('ctrl+t'), false);
});

test('hold repeat is automatic for volume and opt-in for supported navigation and zoom keys', () => {
  const up = { id: 'volume', action: { type: 'media', key: 'volup' } };
  const move = { id: 'nav', action: { type: 'hotkey', keys: 'Right' } };
  const zoom = { id: 'zoom', action: { type: 'hotkey', keys: 'Ctrl++' }, repeatOnHold: true };
  const view = toView(validateProfile({ keys: [up, { ...move, repeatOnHold: true }, zoom] }));
  assert.deepEqual(view.slots.slice(0, 3).map((key) => key.repeatOnHold), [true, true, true]);
  assert.equal(toView(validateProfile({ keys: [{ ...up, repeatOnHold: false }, move] })).slots[0].repeatOnHold, undefined);
  for (const overrides of [{ action: { type: 'launch', target: 'notepad.exe' } }, { confirm: true },
    { hold: move.action }, { double: move.action }, { onBusy: 'queue-one' }]) {
    assert.throws(() => validateProfile({ keys: [{ ...zoom, ...overrides }] }), /hold repeat requires/);
  }
  assert.throws(() => validateProfile({ keys: [{ ...up, repeatOnHold: 'yes' }] }), /must be true or false/);
});

test('gesture settings keep defaults for missing values and reject unsafe timings and distances', () => {
  const raw = { keys: [], gestures: { holdMs: 250, cancelDistance: 35 } };
  const view = toView(validateProfile(raw));
  assert.deepEqual(view.gestures, { holdMs: 250, doubleTapMs: 320, confirmMs: 650, cancelDistance: 35 });
  assert.throws(() => validateProfile({ ...raw, gestures: { cancelDistance: 72 } }), /gestures\.cancelDistance/);
  assert.throws(() => validateProfile({ ...raw, gestures: { confirmMs: '200' } }), /gestures\.confirmMs/);
});

test('the editor detects external changes and preserves the last valid and malformed profiles', (t) => {
  const directory = tempDir(t, 'lastra-test-');
  const file = path.join(directory, 'profile.json');
  const store = new ProfileStore({ file, defaultFile: DEFAULT_PROFILE });
  store.load();
  const original = store.editorSnapshot();
  const edited = { ...original.profile, name: 'Edited' };
  const saved = store.save(edited, original.token);
  assert.equal(store.current.name, 'Edited');
  assert.equal(store.load({ upgradeStock: true }).name, 'Edited');
  assert.equal(JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')).name, original.profile.name);

  fs.writeFileSync(file, '{');
  assert.throws(() => store.save(edited, saved.token), /changed on disk/);
  const broken = store.editorSnapshot();
  assert.match(broken.warning, /malformed JSON/);
  store.save(edited, broken.token);
  assert.equal(fs.readFileSync(`${file}.invalid`, 'utf8'), '{');
  assert.equal(store.current.name, 'Edited');
});

// ------------------------------------------------------------ display

const disp = (id, w, h, scale, label = '') => ({ id, label, scaleFactor: scale, size: { width: w, height: h }, bounds: { x: 0, y: 0, width: w, height: h } });

test('finds the XENEON EDGE with Windows display scaling', () => {
  const main = disp(1, 2560, 1600, 1.5);
  const edge = disp(2, 1707, 480, 1.5, 'XENEON EDGE'); // 2560×720 at 150% scaling.
  assert.equal(findEdgeDisplay([main, edge]).id, 2);
  assert.equal(edgeOrientation(disp(3, 720, 2560, 1)), 'portrait');
  assert.equal(findEdgeDisplay([main]), null);
  assert.equal(findEdgeDisplay([main, edge], '1').id, 1);
  assert.equal(findEdgeDisplay([main, disp(3, 2560, 720, 1)], '1'), null);
});

// ------------------------------------------------------------ sensors

test('parseLhmValue accepts a decimal comma', () => {
  assert.equal(parseLhmValue('62,5 °C'), 62.5);
  assert.equal(parseLhmValue('45.0 %'), 45);
  assert.equal(parseLhmValue('-'), null);
});

test('the managed monitor supplies readings without an HTTP request', async () => {
  const hardware = { latest: { gpu: 0.21, gpuTemp: 45, cpuTemp: null } };
  let requests = 0;
  const sensors = new SensorPoller({ hardware, fetchImpl: async () => { requests++; } });
  let sample;
  sensors.once('data', (data) => { sample = data; });
  await sensors.tick();
  assert.equal(requests, 0);
  assert.equal(sample.gpu, 0.21);
  assert.equal(sample.gpuTemp, 45);
  assert.equal(sample.lhmReady, true);
});

test('parseLhm reads GPU and temperature data with or without SensorId', () => {
  const withIds = { Text: 'Sensor', Children: [{ Text: 'PC', Children: [
    { Text: 'AMD Ryzen 7', Children: [{ Text: 'Temperatures', Children: [
      { Text: 'Core (Tctl/Tdie)', Value: '58,0 °C', SensorId: '/amdcpu/0/temperature/2', Children: [] }] }] },
    { Text: 'NVIDIA GeForce RTX 4070', Children: [
      { Text: 'Load', Children: [{ Text: 'GPU Core', Value: '37,0 %', SensorId: '/gpu-nvidia/0/load/0', Children: [] }] },
      { Text: 'Temperatures', Children: [{ Text: 'GPU Core', Value: '51,0 °C', SensorId: '/gpu-nvidia/0/temperature/0', Children: [] }] }] },
  ] }] };

  assert.deepEqual(parseLhm(withIds), { gpu: 0.37, gpuDevice: '/gpu-nvidia/0', cpuTemp: 58, gpuTemp: 51 });
  const noIds = JSON.parse(JSON.stringify(withIds), (k, v) => (k === 'SensorId' ? undefined : v));
  noIds.Children[0].Children[0].Children[0].Children[0].Text = 'CPU Package';
  assert.deepEqual(parseLhm(noIds), { gpu: 0.37, cpuTemp: 58, gpuTemp: 51 });
});

test('launch and open expand only Windows folder variables, so secrets cannot leak into URLs or arguments', async () => {
  const { calls, deps } = fakeDeps();
  const runner = createActionRunner({ ...deps, env: { USERPROFILE: String.raw`C:\Users\fabio`, LASTRA_OBS_PASSWORD: 'secret' } });
  await runner.run({ type: 'open', target: 'https://example.com/?d=%LASTRA_OBS_PASSWORD%&p=%USERPROFILE%' });
  await runner.run({ type: 'launch', target: String.raw`%USERPROFILE%\app.exe`, args: ['--token=%LASTRA_OBS_PASSWORD%', String.raw`%USERPROFILE%\x`] });
  assert.deepEqual(calls, [
    ['external', 'https://example.com/?d=%LASTRA_OBS_PASSWORD%&p=%USERPROFILE%'],
    ['spawn', String.raw`C:\Users\fabio\app.exe`, ['--token=%LASTRA_OBS_PASSWORD%', String.raw`C:\Users\fabio\x`]],
  ]);
  assert.equal(expandPathEnv(String.raw`%TEMP%\%SECRET%`, { TEMP: String.raw`C:\Temp`, SECRET: 'x' }), String.raw`C:\Temp\%SECRET%`);
});

test('open refuses script handlers and script files but keeps app protocols, folders and shortcuts', async () => {
  const { calls, deps } = fakeDeps();
  const runner = createActionRunner(deps);
  for (const target of [String.raw`search-ms:query=x&crumb=location:\\host\share`, 'ms-msdt:/id', 'javascript:alert(1)', 'file:///C:/x.exe',
    String.raw`C:\Users\Public\run.vbs`, String.raw`\\host\share\payload.bat`, String.raw`C:\x\installer.msi`]) {
    const result = await runner.run({ type: 'open', target });
    assert.equal(result.ok, false, target);
  }
  assert.deepEqual(calls, []);
  await runner.run({ type: 'open', target: 'steam://open/main' });
  await runner.run({ type: 'open', target: String.raw`C:\Users\fabio\Start Menu\Claude.lnk` });
  assert.deepEqual(calls.map(([kind]) => kind), ['external', 'path']);
});

test('a custom variable may build a local program path but not a network one', () => {
  const env = { Apps: String.raw`D:\Apps`, Share: String.raw`\\attacker.invalid\secret-value`, USERPROFILE: String.raw`C:\Users\fabio` };
  assert.equal(expandLocalPath(String.raw`%Apps%\tool.exe`, env), String.raw`D:\Apps\tool.exe`);
  assert.equal(expandLocalPath(String.raw`%Share%\tool.exe`, env), String.raw`%Share%\tool.exe`);
  assert.equal(expandLocalPath(String.raw`\\nas\%Apps%\tool.exe`, env), String.raw`\\nas\%Apps%\tool.exe`);
  assert.equal(expandLocalPath(String.raw`\\nas\%USERPROFILE%`, env), String.raw`\\nas\C:\Users\fabio`);
});
