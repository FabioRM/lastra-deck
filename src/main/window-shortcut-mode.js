// @ts-check
'use strict';

const path = require('node:path');
const { PowerShellWorker } = require('./powershell-worker');

const EDITORS = new Set(['gdocs', 'gsheets', 'google-slides', 'canva', 'miro', 'photoshop-web']);
const SOURCE = path.join(__dirname, 'window-shortcut-mode.cs');
const POLL_MS = 700;
const MAX_AGE_MS = 2400;
const SCRIPT = String.raw`
if (-not ('LastraWindowShortcutMode' -as [type])) {
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, Accessibility
  Add-Type -Path $env:LASTRA_SURFACE_SOURCE -ReferencedAssemblies @(
    [Windows.Automation.AutomationElement].Assembly.Location,
    [Windows.Automation.ControlType].Assembly.Location,
    [Accessibility.IAccessible].Assembly.Location
  )
}
[LastraWindowShortcutMode]::Matches([long]$env:LASTRA_SURFACE_HWND, $env:LASTRA_SURFACE_PACK)
`;

function packMode(pack) {
  if (pack?.id === 'teams') return 'a Teams meeting';
  if (pack?.id === 'zoom') return 'a Zoom meeting';
  if (EDITORS.has(pack?.id)) return pack.editingMode;
}

/**
 * UI Automation runs outside Electron. A stalled provider cannot block the Deck or send any input.
 * @param {{ findPack: (context: any) => any, worker?: Pick<PowerShellWorker, 'run' | 'dispose'>, now?: () => number }} options
 */
function createWindowShortcutMode({ findPack, worker = new PowerShellWorker({ mta: true, idleMs: 15_000 }), now = Date.now }) {
  /** @type {{ target: any, pack: string, mode: string, checked?: number, requested?: number, matched?: boolean }} */
  let current;
  let pending;
  let disposed = false;

  function select(target) {
    const pack = target?.windowId != null && findPack(target);
    const mode = packMode(pack);
    if (disposed || !mode) current = undefined;
    else if (current?.target.id !== target.id || current?.pack !== pack.id) current = { target, pack: pack.id, mode };
    return current;
  }

  function probe(state) {
    // Never queue polling work behind another window's slow accessibility provider.
    state.requested = now();
    pending = worker.run(SCRIPT, {
      env: { LASTRA_SURFACE_SOURCE: SOURCE, LASTRA_SURFACE_HWND: String(state.target.windowId), LASTRA_SURFACE_PACK: state.pack },
      timeout: 2200, maxBuffer: 64,
    }).then((out) => out.trim() === 'True', () => false).then((matched) => {
      if (current === state) {
        state.matched = matched;
        state.checked = now();
      }
    }).finally(() => { pending = undefined; });
    return pending;
  }

  return {
    read(target) {
      const state = select(target);
      if (!state) return undefined;
      const age = state.checked == null ? Infinity : now() - state.checked;
      const mode = state.matched && age < MAX_AGE_MS ? state.mode : undefined;
      if (!pending && (state.requested == null || now() - state.requested >= POLL_MS)) void probe(state);
      return mode;
    },
    refresh(target, mode) {
      const state = current;
      if (!state || state.target.id !== target?.id || state.mode !== mode) return undefined;
      return (async () => {
        await pending;
        if (current !== state) return false;
        await (pending ?? probe(state));
        return current === state && state.matched === true;
      })();
    },
    dispose() {
      disposed = true;
      current = undefined;
      worker.dispose();
    },
  };
}

module.exports = { createWindowShortcutMode };
