'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createActionRunner } = require('../src/main/actions');
const { simulateAction } = require('../src/main/action-test');
const { parseCombo, resolveCombo } = require('../src/main/actions/keys');
const { chordEvents, KEYEVENTF_SCANCODE, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP } = require('../src/main/actions/input-win32');
const { layouts, mapSampleCharacter } = require('../src/main/actions/keyboard-samples');

const punctuation = ['/', '`', '=', '+', ';', ':'];
const matrix = {
  us: [[0xbf], [0xc0], [0xbb], [0x10, 0xbb], [0xba], [0x10, 0xba]],
  it: [[0x10, 0x37], null, [0x10, 0x30], [0xbb], [0x10, 0xbc], [0x10, 0xbe]],
  it142: [[0x10, 0x37], null, [0x10, 0x30], [0xbb], [0x10, 0xbc], [0x10, 0xbe]],
};

test('character chords use the active layout and report an unmapped or AltGr character', () => {
  for (const [name, expected] of Object.entries(matrix)) {
    const layout = layouts[name];
    punctuation.forEach((character, index) => {
      const chord = parseCombo('Ctrl+' + character);
      const resolve = () => resolveCombo(chord, layout.id, (value) => mapSampleCharacter(value, layout));
      if (!expected[index]) assert.throws(resolve, name === 'it142' ? /AltGr/ : /cannot type/);
      else assert.deepEqual(resolve().map(({ vk }) => vk), [0x11, ...expected[index]], `${name} ${character}`);
    });
  }
  assert.throws(() => resolveCombo(parseCombo('Ctrl+/'), undefined, () => 0xbf), /keyboard layout is unavailable/);
  assert.throws(() => parseCombo('Ctrl+'), /Invalid key combination/);
  assert.deepEqual(parseCombo('Ctrl++'), parseCombo('Ctrl+char:plus'));
  assert.deepEqual(parseCombo('Ctrl+char:+'), parseCombo('Ctrl++'));
});

test('virtual keys, physical scan codes and characters retain distinct event modes', () => {
  const virtual = parseCombo('slash');
  assert.equal(virtual[0].vk, 0xbf);
  assert.equal(parseCombo('vk:BF')[0].vk, virtual[0].vk);
  assert.equal(parseCombo('/')[0].character, '/');
  const physical = chordEvents(parseCombo('scan:E04D'), () => assert.fail('physical keys have their own scan code'));
  assert.deepEqual(physical.map(({ u: { ki } }) => [ki.wVk, ki.wScan, ki.dwFlags]), [
    [0, 0x4d, KEYEVENTF_SCANCODE | KEYEVENTF_EXTENDEDKEY],
    [0, 0x4d, KEYEVENTF_SCANCODE | KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP],
  ]);
  const shifted = resolveCombo(parseCombo('Ctrl+Shift+char:colon'), layouts.us.id, (character) => layouts.us.map[character]);
  assert.deepEqual(shifted.map(({ vk }) => vk), [0x11, 0x10, 0xba]);
});

test('a manual character shortcut checks the full target layout before and after resolving the chord', async () => {
  const us = { id: '8:27', windowId: 27n, executable: 'notepad.exe', keyboardLayout: layouts.us.id, keyboardHandle: 0x04090409n };
  const changed = { ...us, keyboardHandle: 0x100000000n + us.keyboardHandle };
  const action = { type: 'hotkey', keys: 'Ctrl+/' };
  let current = us;
  let duringLookup = false;
  const sent = [];
  const foreground = Object.assign(() => current.executable, { context: () => current, windowId: () => current.windowId });
  const runner = createActionRunner({ readForeground: foreground, input: {
    mapCharacter(character) {
      if (duringLookup) current = changed;
      return layouts.us.map[character];
    },
    sendChord(keys, layout) { sent.push([keys.map(({ vk }) => vk), layout]); },
  } });
  current = changed;
  const before = await runner.run(action, [], { trace: true, shortcutTarget: us });
  assert.equal(before.unavailable, true);
  assert.match(before.message, /keyboard layout changed/);
  current = us;
  duringLookup = true;
  const after = await runner.run(action, [], { trace: true, shortcutTarget: us });
  assert.equal(after.unavailable, true);
  assert.match(after.message, /keyboard layout changed/);
  assert.deepEqual(sent, []);
  current = us;
  duringLookup = false;
  assert.equal((await runner.run(action)).ok, true);
  assert.deepEqual(sent, [[[0x11, 0xbf], us.keyboardHandle]]);
  assert.match(runner.hotkeyProblem({ type: 'hotkey', keys: 'Ctrl+char:backquote' }, { ...us, keyboardHandle: null, keyboardLayout: null }),
    /keyboard layout is unavailable/);
});

test('the editor simulation separates Italian missing backquote from Italian 142 AltGr', async () => {
  const options = { action: { type: 'hotkey', keys: 'Ctrl+char:backquote' }, values: { foreground: 'Notepad.exe' } };
  assert.equal((await simulateAction({ ...options, keyboardLayout: 'us' })).ok, true);
  assert.match((await simulateAction({ ...options, keyboardLayout: 'it' })).message, /cannot type/);
  assert.match((await simulateAction({ ...options, keyboardLayout: 'it142' })).message, /AltGr/);
});
