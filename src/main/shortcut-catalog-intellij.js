// @ts-check
'use strict';

const review = require('../../profiles/intellij-idea-keymaps.json');
const { createReferenceApplication } = require('./shortcut-catalog-reference');

const MODIFIERS = { control: 'Ctrl', ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Meta' };
const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'];
const KEY_NAMES = {
  ADD: 'NumAdd', SUBTRACT: 'NumSubtract', MULTIPLY: 'NumMultiply', DIVIDE: 'NumDivide',
  BACK_QUOTE: '`', BACK_SLASH: '\\', BACK_SPACE: 'Backspace',
  CLOSE_BRACKET: ']', OPEN_BRACKET: '[', COMMA: ',',
  CONTEXT_MENU: 'Apps', EQUALS: '=', ESCAPE: 'Esc', MINUS: '-',
  PAGE_DOWN: 'PageDown', PAGE_UP: 'PageUp', PERIOD: '.', QUOTE: "'", SEMICOLON: ';', SLASH: '/',
};
const POINTER_BUTTONS = {
  button1: ['Primary click', 'Primary drag'],
  button2: ['Middle click', 'Middle drag'],
  button4: ['Mouse button 4'],
  button5: ['Mouse button 5'],
};
/** @type {[RegExp, string][]} */
const CONTEXTS = [
  [/codefloatingtoolbar/i, 'Code floating toolbar'], [/lookup|completion|parameterinfo/i, 'Code completion'],
  [/diff|merge/i, 'Diff and merge'], [/debug|breakpoint|evaluat|stepline|stepout|stepinto|stepover|runtocursor|resume/i, 'Debugger'],
  [/refactor|rename|introduce|extract|safedelete|inlinemethod/i, 'Refactoring'],
  [/terminal/i, 'Terminal'], [/vcs|git|commit|versioncontrol|localhistory/i, 'Version control'],
  [/editortemplate|livetemplate|expandtemplate/i, 'Live templates'],
  [/toolwindow|projectview/i, 'Tool windows'], [/run|compile|coverage|build/i, 'Run and build'],
  [/project|file|save/i, 'Project and files'], [/search|find|goto|navigation|bookmark/i, 'Search and navigation'],
  [/editor|caret|selection/i, 'Editor'], [/popup|switcher|quicklist/i, 'Popups and switchers'],
];

function displayStroke(raw) {
  const parts = raw.trim().split(/\s+/);
  const key = parts.at(-1).toUpperCase();
  const normalized = KEY_NAMES[key] ?? (key.startsWith('NUMPAD') ? 'Num' + key.slice(6)
    : /^[A-Z]$|^F\d+$|^\d$/.test(key) ? key : key[0] + key.slice(1).toLowerCase());
  const modifiers = new Set(parts.slice(0, -1).map((part) => MODIFIERS[part.toLowerCase()]));
  return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), normalized].join('+');
}

function titleFromId(id) {
  const tail = id.split(/[.$/]/).at(-1).replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return (tail ? tail[0].toUpperCase() + tail.slice(1) : id).slice(0, 40);
}

function contextFor(id) {
  return CONTEXTS.find(([predicate]) => predicate.test(id))?.[1] ?? 'Application';
}

function referenceVariant(id, [kind, raw, second]) {
  if (kind === 'keyboard') {
    const notation = second ? displayStroke(raw) + ' then ' + displayStroke(second) : displayStroke(raw);
    return { notation };
  }
  if (kind === 'double-press') {
    const key = MODIFIERS[raw.split(/\s+/).at(-1).toLowerCase()];
    return { notation: key + ' twice', kind: 'gesture', trigger: 'Press and release ' + key + ' twice.' };
  }
  const parts = raw.toLowerCase().split(/\s+/);
  const button = POINTER_BUTTONS[parts.find((part) => part in POINTER_BUTTONS)];
  const double = parts.includes('doubleclick');
  const drag = id.endsWith('OnMouseDrag');
  const input = [...parts.map((part) => MODIFIERS[part]).filter(Boolean), drag ? button[1] : button[0]].join('+');
  return { notation: input + (double ? ' twice' : ''), kind: 'gesture',
    trigger: drag ? 'Drag with the indicated mouse button and modifiers.' : double ? 'Double-click with the indicated modifiers.'
      : 'Press the indicated mouse button and modifiers.' };
}

function presetRows(preset) {
  const effective = new Map(review.windows.map((row) => [row[0], [row, 'windows']]));
  if (preset !== 'windows') for (const row of review[preset]) effective.set(row[0], [row, preset]);
  const entries = Array.from(effective.values(), (/** @type {[[string, string, any[]], string]} */ [[id, name, variants], source]) => ({
    id, label: name?.slice(0, 40) ?? titleFromId(id), source, context: contextFor(id),
    variants: variants.map((entry) => referenceVariant(id, entry)),
  }));
  const byNotation = new Map();
  for (const { id, variants } of entries) {
    for (const { notation } of variants) {
      if (!byNotation.has(notation)) byNotation.set(notation, new Set());
      byNotation.get(notation).add(id);
    }
  }
  return entries.flatMap(({ id, label, source, context, variants }) => {
    const intro = preset !== 'windows' && source === 'windows' ? 'Inherited from the Windows default descriptor.' : '';
    if (!variants.length) return [[context, id, label, [], { source,
      requirement: 'This descriptor declares no key or pointer input for the action. Check the installed action and active preset.' }]];
    return variants.map(({ notation, kind, trigger }) => {
      const x11 = id === 'EditorPasteFromX11';
      const conflict = byNotation.get(notation).size > 1 ? 'Other actions share this input in this preset. Inspect the active component.' : '';
      const requirement = x11 ? 'X11 middle-button paste appears in the shared base descriptor. It refers to X11 rather than the Windows editor.'
        : [intro, conflict].filter(Boolean).join(' ');
      return [context, id, label, [notation], { source, ...(kind ? { kind } : {}), ...(trigger ? { trigger } : {}),
        ...(requirement ? { requirement } : {}), ...(x11 ? { kind: 'reference', mode: 'X11' } : {}) }];
    });
  });
}

const classic = ['Preset references', 'IntelliJIDEAClassicKeymap', 'IntelliJ IDEA Classic Keymap',
  ['Choose the installed keymap'], { source: 'help', kind: 'reference',
    requirement: 'JetBrains documents Classic as a separate legacy preset. Inspect Settings → Keymap before using a Classic assignment.' }];

const intellijApplications = [
  ['windows', 'intellij-windows-reference', 'Windows default'],
  ['emacs', 'intellij-emacs-reference', 'Emacs for Windows'],
  ['sublime', 'intellij-sublime-reference', 'Sublime Text for Windows'],
].map(([preset, id, name]) => createReferenceApplication({
  ...review, effective: [...presetRows(preset), ...(preset === 'windows' ? [classic] : [])],
}, {
  id, name: 'IntelliJ IDEA · ' + name + ' (reference)', edition: 'IntelliJ Platform · ' + name,
  availability: 'Requires verification of the installed IDEA product, plugins, selected keymap, keyboard layout and active component.',
  groups: [{ rows: 'effective', source: preset, commands: 'case-sensitive-identifiers' }],
}));

module.exports = { intellijApplications };
