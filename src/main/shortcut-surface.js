// @ts-check
'use strict';

const DIALOG_FLAGS = 0x1e; // Move/size, menu, system menu, and popup menu.
const PHOTOSHOP_EXECUTABLES = ['photoshop.exe', 'adobe photoshop.exe'];
const CURSOR_AGENTS_MODE = 'the Cursor Agents window';

function cursorSurface(executable, title) {
  if (executable === 'cursor.exe' && /^cursor agents$/i.test(title ?? '')) return CURSOR_AGENTS_MODE;
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

module.exports = { PHOTOSHOP_EXECUTABLES, CURSOR_AGENTS_MODE, cursorSurface, photoshopSurface, observeShortcutMode };
