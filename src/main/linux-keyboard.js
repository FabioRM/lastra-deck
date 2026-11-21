'use strict';

// X11 and Hyprland both use XKB keysym names. Keep Windows VK and scan codes out of this path.
const SYMBOLS = {
  ctrl: 'Control_L', control: 'Control_L', shift: 'Shift_L', alt: 'Alt_L', win: 'Super_L',
  lwin: 'Super_L', rwin: 'Super_R', super: 'Super_L',
  backspace: 'BackSpace', tab: 'Tab', enter: 'Return', return: 'Return', pause: 'Pause', capslock: 'Caps_Lock',
  esc: 'Escape', escape: 'Escape', space: 'space', pageup: 'Page_Up', pagedown: 'Page_Down', end: 'End',
  home: 'Home', left: 'Left', up: 'Up', right: 'Right', down: 'Down', printscreen: 'Print',
  insert: 'Insert', delete: 'Delete', del: 'Delete', apps: 'Menu', menu: 'Menu',
  multiply: 'KP_Multiply', add: 'KP_Add', subtract: 'KP_Subtract', decimal: 'KP_Decimal', divide: 'KP_Divide',
  semicolon: 'semicolon', plus: 'plus', equals: 'equal', comma: 'comma', minus: 'minus', period: 'period', slash: 'slash',
  backquote: 'grave', bracketleft: 'bracketleft', backslash: 'backslash', bracketright: 'bracketright', quote: 'apostrophe',
};
const CHAR_SYMBOLS = {
  '!': 'exclam', '"': 'quotedbl', '#': 'numbersign', '$': 'dollar', '%': 'percent', '&': 'ampersand',
  "'": 'apostrophe', '(': 'parenleft', ')': 'parenright', '*': 'asterisk', '+': 'plus', ',': 'comma',
  '-': 'minus', '.': 'period', '/': 'slash', ':': 'colon', ';': 'semicolon', '<': 'less', '=': 'equal',
  '>': 'greater', '?': 'question', '@': 'at', '[': 'bracketleft', '\\': 'backslash', ']': 'bracketright', '^': 'asciicircum',
  '_': 'underscore', '`': 'grave', '{': 'braceleft', '|': 'bar', '}': 'braceright', '~': 'asciitilde',
};
const MODIFIERS = { Control_L: 'CTRL', Shift_L: 'SHIFT', Alt_L: 'ALT', Super_L: 'SUPER', Super_R: 'SUPER' };

function keySymbol({ name, character }) {
  if (character) {
    if (/^[a-z0-9]$/i.test(character)) return character;
    return CHAR_SYMBOLS[character] ?? 'U' + character.codePointAt(0).toString(16);
  }
  if (/^[a-z0-9]$/.test(name)) return name;
  if (/^f\d+$/.test(name)) return name.toUpperCase();
  if (/^num[0-9]$/.test(name)) return 'KP_' + name.at(-1);
  if (Object.hasOwn(SYMBOLS, name)) return SYMBOLS[name];
  throw new Error(`The key “${name}” has no Linux mapping.`);
}

function linuxChord(keys) {
  const symbols = keys.map(keySymbol);
  const key = symbols.at(-1);
  const modifiers = symbols.slice(0, -1).map((symbol) => MODIFIERS[symbol]);
  if (!key || MODIFIERS[key] || modifiers.includes(undefined) || new Set(modifiers).size !== modifiers.length) {
    throw new Error('Use one key after the shortcut modifiers.');
  }
  return { key, modifiers, modifierSymbols: symbols.slice(0, -1) };
}

module.exports = { linuxChord };
