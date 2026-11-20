// @ts-check
'use strict';

// Simulate keyboard input on Windows with SendInput (user32.dll) through Koffi.
// Other platforms can run the deck preview using an input stub.

const INPUT_KEYBOARD = 1;
const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_UNICODE = 0x0004;
const KEYEVENTF_SCANCODE = 0x0008;
const MAPVK_VK_TO_VSC_EX = 4;

/** Define the Win32 structures independently of the Windows runtime. */
function defineTypes(koffi) {
  const MOUSEINPUT = koffi.struct('LASTRA_MOUSEINPUT', {
    dx: 'int32_t',
    dy: 'int32_t',
    mouseData: 'uint32_t',
    dwFlags: 'uint32_t',
    time: 'uint32_t',
    dwExtraInfo: 'uintptr_t',
  });
  const KEYBDINPUT = koffi.struct('LASTRA_KEYBDINPUT', {
    wVk: 'uint16_t',
    wScan: 'uint16_t',
    dwFlags: 'uint32_t',
    time: 'uint32_t',
    dwExtraInfo: 'uintptr_t',
  });
  const HARDWAREINPUT = koffi.struct('LASTRA_HARDWAREINPUT', {
    uMsg: 'uint32_t',
    wParamL: 'uint16_t',
    wParamH: 'uint16_t',
  });
  const INPUT = koffi.struct('LASTRA_INPUT', {
    type: 'uint32_t',
    u: koffi.union({ mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT }),
  });
  return { INPUT, KEYBDINPUT };
}

function keyEvent(vk, scan, flags) {
  return {
    type: INPUT_KEYBOARD,
    u: { ki: { wVk: vk, wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
  };
}

/** Press keys in order and release them in reverse order. */
function chordEvents(keys, scanOf) {
  const down = keys.map((key) => {
    const physical = Number.isInteger(key.scan);
    const scan = physical ? key.scan : scanOf(key.vk);
    const extended = key.extended || (scan & 0xff00) === 0xe000;
    return keyEvent(physical ? 0 : key.vk, scan & 0xff,
      (physical ? KEYEVENTF_SCANCODE : 0) | (extended ? KEYEVENTF_EXTENDEDKEY : 0));
  });
  const up = [...down].reverse().map(({ u: { ki } }) => keyEvent(ki.wVk, ki.wScan, ki.dwFlags | KEYEVENTF_KEYUP));
  return [...down, ...up];
}

/** Send text as Unicode independently of the keyboard layout. */
function textEvents(text) {
  const events = [];
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i); // Windows expects surrogate pairs as two code units.
    events.push(keyEvent(0, unit, KEYEVENTF_UNICODE));
    events.push(keyEvent(0, unit, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP));
  }
  return events;
}

function sendKeyboardEvents(events, send) {
  if (!events.length) return;
  const sent = send(events);
  if (sent === events.length) return;

  const pressed = new Map();
  for (const { u: { ki } } of events.slice(0, sent)) {
    const flags = ki.dwFlags & ~KEYEVENTF_KEYUP;
    const key = `${ki.wVk}/${ki.wScan}/${flags}`;
    if (ki.dwFlags & KEYEVENTF_KEYUP) pressed.delete(key);
    else pressed.set(key, keyEvent(ki.wVk, ki.wScan, flags | KEYEVENTF_KEYUP));
  }
  let releases = [...pressed.values()].reverse();
  while (releases.length) {
    const released = send(releases);
    if (released === 0) break;
    releases = releases.slice(released);
  }
  throw new Error('Windows blocked keyboard input. Check whether the active app is running as administrator.');
}

function createWin32Input() {
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const { INPUT } = defineTypes(koffi);
  const SendInput = user32.func(
    'uint32_t __stdcall SendInput(uint32_t cInputs, LASTRA_INPUT *pInputs, int cbSize)');
  const MapVirtualKeyW = user32.func(
    'uint32_t __stdcall MapVirtualKeyW(uint32_t uCode, uint32_t uMapType)');
  const MapVirtualKeyExW = user32.func(
    'uint32_t __stdcall MapVirtualKeyExW(uint32_t uCode, uint32_t uMapType, uintptr_t hkl)');
  const VkKeyScanExW = user32.func('int16_t __stdcall VkKeyScanExW(uint16_t character, uintptr_t hkl)');
  const size = koffi.sizeof(INPUT);

  const send = (events) => sendKeyboardEvents(events, (batch) => SendInput(batch.length, batch, size));

  return {
    mapCharacter: (character, layout) => VkKeyScanExW(character.charCodeAt(0), layout),
    sendChord: (keys, layout) => send(chordEvents(keys, (vk) => layout
      ? MapVirtualKeyExW(vk, MAPVK_VK_TO_VSC_EX, layout) : MapVirtualKeyW(vk, MAPVK_VK_TO_VSC_EX))),
    sendText: (text) => send(textEvents(text)),
  };
}

function createUnsupportedInput() {
  const fail = () => {
    throw new Error('Simulated keyboard input is only available on Windows');
  };
  return { sendChord: fail, sendText: fail };
}

function createInput() {
  return process.platform === 'win32' ? createWin32Input() : createUnsupportedInput();
}

module.exports = { createInput, defineTypes, chordEvents, textEvents, sendKeyboardEvents, KEYEVENTF_KEYUP, KEYEVENTF_EXTENDEDKEY,
  KEYEVENTF_UNICODE, KEYEVENTF_SCANCODE };
