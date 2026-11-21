// @ts-check
'use strict';

const DIALOG_FLAGS = 0x1e; // Move/size, menu, system menu, and popup menu.
const PHOTOSHOP_EXECUTABLES = ['photoshop.exe', 'adobe photoshop.exe'];
const CURSOR_AGENTS_MODE = 'the Cursor Agents window';
const KICAD_PCB_MODE = 'the KiCad PCB Editor';
const KICAD_SCHEMATIC_MODE = 'the KiCad Schematic Editor';
const KICAD_FOOTPRINT_MODE = 'the KiCad Footprint Editor';
const KICAD_SYMBOL_MODE = 'the KiCad Symbol Editor';
const KICAD_GERBVIEW_MODE = 'the KiCad Gerber Viewer';
const KICAD_TITLE_EXECUTABLES = ['kicad.exe', 'pcbnew.exe', 'eeschema.exe'];
const MATLAB_DESKTOP_MODE = 'the MATLAB desktop';
const SIMULINK_MODE = 'a Simulink model';
const MATHWORKS_TITLE_EXECUTABLES = ['matlab.exe', 'matlabwindow.exe'];

function cursorSurface(executable, title) {
  if (executable === 'cursor.exe' && /^cursor agents$/i.test(title ?? '')) return CURSOR_AGENTS_MODE;
}

function usesShortcutWindowTitle(executable) {
  return executable === 'cursor.exe' || KICAD_TITLE_EXECUTABLES.includes(executable) || MATHWORKS_TITLE_EXECUTABLES.includes(executable);
}

function shortcutTitleMode(executable, title = '') {
  if (executable === 'cursor.exe') return cursorSurface(executable, title);
  if (MATHWORKS_TITLE_EXECUTABLES.includes(executable)) {
    if (/^.+ - Simulink(?:\s*\*)?$/.test(title)) return SIMULINK_MODE;
    if (/^MATLAB R20\d{2}[ab](?: Update \d+)?$/.test(title)) return MATLAB_DESKTOP_MODE;
    return;
  }
  if (!KICAD_TITLE_EXECUTABLES.includes(executable)) return;
  // KiCad appends the translated editor caption to the document name.
  const editor = title.split(' \u2014 ').at(-1);
  if (executable === 'kicad.exe' && (editor === 'Gerber Viewer' || editor === 'Visualizzatore Gerber')) return KICAD_GERBVIEW_MODE;
  if (executable !== 'eeschema.exe') {
    if (editor === 'PCB Editor' || editor === 'Editor C.S.') return KICAD_PCB_MODE;
    if (editor === 'Footprint Editor' || editor === 'Editor impronte') return KICAD_FOOTPRINT_MODE;
  }
  if (executable !== 'pcbnew.exe') {
    if (editor === 'Schematic Editor' || editor === 'Editor schemi') return KICAD_SCHEMATIC_MODE;
    if (editor === 'Symbol Editor' || editor === 'Editor simboli') return KICAD_SYMBOL_MODE;
  }
}

/**
 * @param {{ windowClass?: string, focusClass?: string, focusInWindow?: boolean, hasOwner?: boolean,
 *   caretId?: unknown, flags?: number }} [focus]
 */
function photoshopSurface({ windowClass, focusClass, focusInWindow, hasOwner, caretId, flags } = {}) {
  if (hasOwner || windowClass === '#32770' || (flags & DIALOG_FLAGS)) return 'a Photoshop dialog';
  if (!focusInWindow || !focusClass) return undefined;
  if (caretId != null || /^(?:edit|richedit|textbox)/i.test(focusClass)) return 'a Photoshop text field';
  if (/^photoshop$/i.test(windowClass)) return 'the Photoshop workspace';
  return undefined;
}

function sameSurface(a, b) {
  return Boolean(a && b && a.focusId === b.focusId && a.caretId === b.caretId && a.focusInWindow === b.focusInWindow &&
    a.windowClass === b.windowClass && a.focusClass === b.focusClass && a.flags === b.flags && a.hasOwner === b.hasOwner);
}

function observeShortcutMode(executable, target, readActive, readSurface) {
  // App identity and web app installation alone never attest a mode.
  if (!PHOTOSHOP_EXECUTABLES.includes(executable)) return { active: target, mode: undefined };
  const first = readSurface(target);
  const middle = readActive();
  if (middle?.id !== target.id) return null;
  const second = readSurface(middle);
  const active = readActive();
  if (active?.id !== target.id) return null;
  if (target.keyboardHandle !== middle.keyboardHandle || middle.keyboardHandle !== active.keyboardHandle || !sameSurface(first, second)) {
    return { active, mode: undefined };
  }
  return { active, mode: photoshopSurface(second) };
}

module.exports = { PHOTOSHOP_EXECUTABLES, CURSOR_AGENTS_MODE, cursorSurface, photoshopSurface, observeShortcutMode,
  KICAD_PCB_MODE, KICAD_SCHEMATIC_MODE, KICAD_FOOTPRINT_MODE, KICAD_SYMBOL_MODE, KICAD_GERBVIEW_MODE,
  MATLAB_DESKTOP_MODE, SIMULINK_MODE, MATHWORKS_TITLE_EXECUTABLES, usesShortcutWindowTitle, shortcutTitleMode };
