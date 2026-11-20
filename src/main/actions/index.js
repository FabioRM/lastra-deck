// @ts-check
'use strict';

// The action runner accepts injected dependencies so it can be tested outside Electron and Windows.

const { parseCombo, layoutTokens, resolveCombo, mediaKey } = require('./keys');
const { win32 } = require('node:path');
const { WAIT_CONDITIONS, MAX_REPEAT_STEPS, CHOICE_LIMIT, RANDOM_LIMIT, conditionFields, waitFields, repeatFields, choiceFields, randomFields, delayMs,
  stepPolicy } = require('../../shared/action-flow');
const { timerFields } = require('../../shared/timers');
const { soundFields } = require('../../shared/sounds');
const { packFor } = require('../shortcut-packs');
const { actionNeedsShortcutTarget, shortcutUnavailable, sameShortcutWindow } = require('../shortcut-guards');

const MAX_DEPTH = 3;
const MAX_STEPS = 20;
const WINDOW_START_GRACE_MS = 8_000;
const MAX_REMEMBERED_PICKS = 256;

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

class ActionTargetChanged extends Error {}
class FlowInterrupted extends Error {}
class ActionCancelled extends FlowInterrupted {}

function interrupted(error) {
  return error instanceof ActionTargetChanged || error instanceof FlowInterrupted;
}

/** Expand Windows-style environment variables such as %USERPROFILE%\Downloads */
function expandEnv(str, env = process.env) {
  return String(str).replace(/%([^%]+)%/g, (match, name) => {
    const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
    return key !== undefined ? env[key] : match;
  });
}

/** Distinguish a URL or protocol (https:, ms-settings:) from a path (C:\...). */
function isUrlLike(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) && !/^[a-z]:[\\/]/i.test(target);
}

// Profiles can be imported or drafted by an agent, so arguments, open targets and network paths only expand
// variables that describe standard Windows folders. Others (tokens, passwords) stay literal and cannot leak.
const PATH_VARIABLES = new Set(['userprofile', 'appdata', 'localappdata', 'programdata', 'programfiles', 'programfiles(x86)',
  'programw6432', 'commonprogramfiles', 'commonprogramfiles(x86)', 'commonprogramw6432', 'windir', 'systemroot', 'systemdrive',
  'homedrive', 'homepath', 'public', 'allusersprofile', 'temp', 'tmp', 'onedrive', 'onedriveconsumer', 'onedrivecommercial']);

/** Expand only the standard Windows folder variables listed in PATH_VARIABLES. */
function expandPathEnv(str, env = process.env) {
  return String(str).replace(/%([^%]+)%/g, (match, name) => (PATH_VARIABLES.has(name.toLowerCase()) ? expandEnv(match, env) : match));
}

const REMOTE_PATH = /^(?:\\\\|\/\/)/;

/**
 * Expand a program path or working directory. Any variable may build a local path (for example %Apps%),
 * but a network path only gets folder variables, so the server name or share cannot carry a secret.
 */
function expandLocalPath(str, env = process.env) {
  const full = expandEnv(str, env);
  return REMOTE_PATH.test(full) ? expandPathEnv(str, env) : full;
}

// Schemes that Windows handlers have turned into code execution or that only make sense inside a page.
const BLOCKED_SCHEMES = new Set(['javascript:', 'vbscript:', 'data:', 'file:', 'search-ms:', 'search:', 'ms-msdt:', 'ms-officecmd:',
  'ms-appinstaller:', 'ms-its:', 'its:', 'mk:', 'mhtml:', 'hcp:', 'ms-cxh:', 'ms-cxh-full:', 'ms-help:']);
// Script and installer types that open would run rather than show. Use a launch action for programs.
const BLOCKED_OPEN_EXTENSIONS = /\.(bat|cmd|scr|pif|vbs|vbe|js|jse|wsf|wsh|ps1|psm1|hta|cpl|reg|msi|msp|application|appref-ms|jar)$/i;

function requireString(value, what) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing ${what}`);
  }
  return value;
}

function actionTrace(action, onStepResult) {
  const steps = new Map();
  function register(item, path = []) {
    if (!item?.type || path.length > MAX_DEPTH) return;
    steps.set(path.join('.'), { path, type: item.type, status: 'skipped', attempts: [] });
    if (item.type === 'sequence' && Array.isArray(item.steps)) {
      item.steps.slice(0, MAX_STEPS).forEach((step, index) => register(step, [...path, index + 1]));
    }
    if (item.type === 'if') {
      register(item.then, [...path, 'then']);
      register(item.else, [...path, 'else']);
    }
    if (item.type === 'choose' && Array.isArray(item.choices)) {
      item.choices.slice(0, CHOICE_LIMIT).forEach((option, index) => register(option?.action, [...path, `Choice ${index + 1}`]));
    }
    if (item.type === 'random' && Array.isArray(item.pool)) {
      item.pool.slice(0, RANDOM_LIMIT).forEach((option, index) => register(option, [...path, `Option ${index + 1}`]));
    }
  }
  register(action);
  return {
    register,
    steps: () => [...steps.values()],
    record(path, status, message) {
      const step = steps.get(path.join('.'));
      if (!step) return;
      step.status = status;
      step.attempts.push({ status, ...(message ? { message } : {}) });
      onStepResult?.({ path: step.path, type: step.type, status, attempts: step.attempts.length });
    },
  };
}

function createActionRunner({ shell, spawn, input, audio, toggleSpotify, selectObsScene, readForeground, readState, focusApp, restoreWorkspace, chooseAction,
  changeTimer, playSound,
  readShortcutSettings = () => ({}), env = process.env,
  sleep = defaultSleep, now = () => performance.now(), random = Math.random }) {
  const starting = new Map();
  const lastPicks = new Map();

  async function launch(action) {
    const target = expandLocalPath(requireString(action.target, '"target" in the launch action'), env);
    if (/\.(cmd|bat)$/i.test(target)) {
      throw new Error('Choose an .exe file to launch. Windows batch files require an explicit interpreter.');
    }
    const args = Array.isArray(action.args) ? action.args.map((a) => expandPathEnv(a, env)) : [];
    const cwd = action.cwd ? expandLocalPath(action.cwd, env) : undefined;

    if (!action.reuseWindow) return startProgram(target, args, cwd);
    const name = win32.extname(target) ? target : `${target}.exe`;
    const wanted = /[\\/:]/.test(name) ? { path: win32.resolve(cwd ?? process.cwd(), name).toLowerCase() }
      : { executable: name.toLowerCase() };
    const key = wanted.path ?? wanted.executable;
    const outcome = focusApp?.(wanted);
    if (outcome === 'focused') {
      starting.delete(key);
      return 'Switched to an existing window';
    }
    if (outcome === 'blocked') throw new Error('Windows could not bring the existing window to the foreground');
    if (outcome === 'ambiguous') throw new Error('More than one matching app is open. Use the full executable path.');
    if (outcome !== 'missing') throw new Error('Windows app window detection is unavailable');

    const time = now();
    for (const [id, entry] of starting) if (entry.retryAt <= time) starting.delete(id);
    if (starting.has(key)) return 'The app is starting';
    const entry = { retryAt: Infinity };
    starting.set(key, entry);
    try {
      const result = await startProgram(target, args, cwd);
      entry.retryAt = now() + WINDOW_START_GRACE_MS;
      return result;
    } catch (error) {
      if (starting.get(key) === entry) starting.delete(key);
      throw error;
    }
  }

  function startProgram(target, args, cwd) {
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(target, args, { cwd, detached: true, stdio: 'ignore', windowsHide: false });
      } catch (err) {
        reject(new Error(`Launch failed: ${err.message}`));
        return;
      }
      child.once('error', (err) => {
        reject(new Error(err.code === 'ENOENT' ? `Program not found: ${target}` : err.message));
      });
      child.once('spawn', () => {
        child.unref();
        resolve(null);
      });
    });
  }

  async function open(action) {
    const raw = requireString(action.target, '"target" in the open action').trim();
    if (isUrlLike(raw)) {
      const scheme = raw.slice(0, raw.indexOf(':') + 1).toLowerCase();
      if (BLOCKED_SCHEMES.has(scheme)) throw new Error(`Lastra does not open ${scheme} links. Use a file path or a launch action.`);
      await shell.openExternal(raw);
    } else {
      const target = expandPathEnv(raw, env);
      if (BLOCKED_OPEN_EXTENSIONS.test(target)) throw new Error('Use a launch action for programs and scripts.');
      const error = await shell.openPath(target);
      if (error) throw new Error(error);
    }
    return null;
  }

  function verifyForeground(action, pageApps) {
    const targets = action.targetApps ?? pageApps;
    if (!targets?.length) return;
    const active = readForeground?.();
    if (!targets.some((app) => app.trim().toLowerCase() === active)) {
      throw new Error(`Switch to ${targets.join(' or ')} before running this action`);
    }
  }

  function verifyShortcut(action, expected) {
    if (!action.shortcutGuard && !layoutTokens(action.keys)) return;
    const context = readForeground?.context?.({ fresh: true });
    if (action.shortcutGuard) {
      const { webApps, shortcutLanguage, platform, build } = readShortcutSettings();
      const activePack = packFor(context, webApps);
      const unavailable = shortcutUnavailable(action.shortcutGuard, { activePack, context, shortcutLanguage, platform, build, keys: action.keys });
      if (unavailable) throw new ActionTargetChanged(unavailable);
    }
    if (!sameShortcutWindow(expected, context) || readForeground?.windowId?.() !== context.windowId) {
      throw new ActionTargetChanged('The shortcut target window changed.');
    }
    if (targetLayout(expected) !== targetLayout(context)) throw new ActionTargetChanged('The foreground keyboard layout changed.');
    if (expected.mode !== context.mode) throw new ActionTargetChanged('The active app surface changed.');
    return context;
  }

  function targetLayout(context) {
    return context?.keyboardHandle ?? context?.keyboardLayout;
  }

  function hotkeyProblem(action, target) {
    if (action?.type !== 'hotkey' || !layoutTokens(action.keys)) return;
    if (target?.windowId == null) return 'Bring the target window to the foreground.';
    try { resolveCombo(parseCombo(action.keys), targetLayout(target), input?.mapCharacter); }
    catch (error) { return error.message; }
  }

  function conditionValue(key) {
    return key === 'foreground' ? readForeground?.() : readState?.(key);
  }

  async function waitForState(action, verifyTarget) {
    const { key, expected, timeoutMs } = waitFields(action);
    const deadline = now() + timeoutMs;
    for (;;) {
      verifyTarget();
      const remaining = deadline - now();
      if (remaining < 0) break;
      if (conditionValue(key) === expected) return null;
      if (remaining === 0) break;
      await sleep(Math.min(remaining, 150));
    }
    throw new Error(`Timed out waiting for ${WAIT_CONDITIONS[key].label} to match ${expected}`);
  }

  async function run(action, context, warnings, path = []) {
    context.checkCancellation?.();
    try {
      context.beginStep?.();
      context.onStepProgress?.({ path, type: action?.type, ...context.iteration, ...context.position });
      const warningCount = warnings.length;
      const result = await execute(action, context, warnings, path);
      if (context.beginStep) context.verifyTarget();
      context.trace?.record(path, warningCount === warnings.length ? 'succeeded' : 'warning', result);
      return result;
    } catch (error) {
      context.trace?.record(path, error instanceof ActionCancelled ? 'cancelled' : 'failed', error.message);
      throw error;
    }
  }

  async function runSteps(steps, context, warnings, stepPath) {
    for (const [index, step] of steps.entries()) {
      const [label, path] = stepPath(index + 1);
      const stepWarnings = [];
      try {
        const { mode, attempts } = stepPolicy(step);
        for (let attempt = 1; attempt <= attempts; attempt++) {
          try {
            const position = { step: index + 1, total: steps.length, attempt, attempts };
            await run(step, { ...context, position }, stepWarnings, path);
            break;
          } catch (error) {
            if (interrupted(error)) throw error;
            if (attempt < attempts) await (context.pause ?? sleep)(250);
            else if (mode === 'continue') stepWarnings.push(error.message);
            else throw error;
          }
        }
      } catch (error) {
        if (interrupted(error)) throw error;
        throw new Error(`${label}: ${error.message}`);
      }
      warnings.push(...stepWarnings.map((warning) => `${label}: ${warning}`));
    }
  }

  async function repeat(action, context, warnings, path) {
    if (context.beginStep) throw new Error('A repeat cannot contain another repeat');
    const { count, condition, timeoutMs } = repeatFields(action);
    const deadline = now() + timeoutMs;
    let attempted = 0;
    const verifyTarget = () => {
      context.verifyTarget();
      const stamp = now();
      if (stamp >= deadline) throw new FlowInterrupted('The repeat timed out');
      return stamp;
    };
    async function pause(ms) {
      const until = now() + ms;
      for (;;) {
        context.checkCancellation?.();
        const stamp = verifyTarget();
        if (stamp >= until) return;
        await sleep(Math.min(until - stamp, deadline - stamp, 150));
      }
    }
    const iterationContext = { ...context, verifyTarget, pause, beginStep() {
      if (++attempted > MAX_REPEAT_STEPS) throw new FlowInterrupted(`The repeat reached its limit of ${MAX_REPEAT_STEPS} step attempts`);
    } };
    let completed = 0;
    try {
      for (let iteration = 1; iteration <= count; iteration++) {
        context.checkCancellation?.();
        verifyTarget();
        if (condition) {
          const value = conditionValue(condition.key);
          if (value == null) throw new Error(`${WAIT_CONDITIONS[condition.key].label} is unavailable`);
          if (value !== condition.expected) break;
        }
        context.onProgress?.({ iteration, count });
        const stepPath = (step) => {
          const label = `Iteration ${iteration}, step ${step}`;
          return [label, [...path, label]];
        };
        action.steps.forEach((step, index) => context.trace?.register(step, stepPath(index + 1)[1]));
        await runSteps(action.steps, { ...iterationContext, iteration: { iteration, iterations: count } }, warnings, stepPath);
        completed++;
      }
    } finally { context.onProgress?.(null); }
    return `Completed ${completed} of ${count} iterations`;
  }

  async function execute(action, context, warnings, path) {
    const { pageApps, verifyTarget, shortcutTarget, checkCancellation } = context;
    verifyTarget();
    if (!action || typeof action !== 'object') throw new Error('No action assigned');

    switch (action.type) {
      case 'launch':
        return launch(action);

      case 'open':
        return open(action);

      case 'workspace': {
        if (!restoreWorkspace) throw new Error('Workspace restoration is unavailable');
        const result = await restoreWorkspace(requireString(action.workspace, 'workspace ID'));
        if (!result.ok) throw new Error(result.message);
        return result.message ?? null;
      }

      case 'hotkey': {
        verifyForeground(action, pageApps);
        const keys = parseCombo(action.keys);
        verifyTarget();
        const target = verifyShortcut(action, shortcutTarget);
        const layout = targetLayout(target);
        let resolved;
        try { resolved = resolveCombo(keys, layout, input?.mapCharacter); }
        catch (error) { throw new ActionTargetChanged(error.message); }
        if (action.requiresPhotoshopWorkspace && !action.shortcutGuard) {
          const target = readForeground?.context?.({ fresh: true });
          if (target?.mode !== 'the Photoshop workspace' || readForeground.windowId?.() !== target.windowId) {
            throw new Error('Bring the Photoshop workspace to the foreground.');
          }
        }
        if (resolved !== keys) {
          verifyTarget();
          verifyShortcut(action, shortcutTarget);
        }
        input.sendChord(resolved, layout);
        return null;
      }

      case 'media': {
        const key = mediaKey(action.key);
        verifyTarget();
        input.sendChord([key]);
        return null;
      }

      case 'audio':
        return audio.change(action.device);

      case 'spotify-playback':
        if (!toggleSpotify) throw new Error('Spotify playback is unavailable.');
        return toggleSpotify(() => { checkCancellation?.(); verifyTarget(); verifyShortcut(action, shortcutTarget); });

      case 'obs-scene': {
        verifyTarget();
        if (!selectObsScene) throw new ActionTargetChanged('OBS scenes are unavailable.');
        const result = await selectObsScene(action);
        if (result.unavailable) throw new ActionTargetChanged(result.message);
        if (!result.ok) throw new Error(result.message);
        return result.message ?? null;
      }

      case 'timer': {
        if (!changeTimer) throw new Error('Timers are unavailable.');
        const fields = timerFields(action);
        verifyTarget();
        return changeTimer(fields);
      }

      case 'sound': {
        if (!playSound) throw new Error('The soundboard is unavailable.');
        const fields = soundFields(action);
        verifyTarget();
        return playSound(fields);
      }

      case 'text': {
        verifyForeground(action, pageApps);
        const text = requireString(action.text, '"text" in the text action');
        verifyTarget();
        input.sendText(text);
        return null;
      }

      case 'delay': {
        await (context.pause ?? sleep)(delayMs(action));
        verifyTarget();
        return null;
      }

      case 'wait-for':
        return waitForState(action, () => { checkCancellation?.(); verifyTarget(); });

      case 'if': {
        if (path.length >= MAX_DEPTH) throw new Error('Too many nested conditions');
        const { key, expected } = conditionFields(action);
        const value = conditionValue(key);
        if (value == null) throw new Error(`${WAIT_CONDITIONS[key].label} is unavailable`);
        if (value === expected) return run(action.then, context, warnings, [...path, 'then']);
        return action.else ? run(action.else, context, warnings, [...path, 'else']) : null;
      }

      case 'choose': {
        if (path.length >= MAX_DEPTH) throw new Error('Too many nested choice prompts');
        if (!chooseAction) throw new FlowInterrupted('Macro choices are unavailable.');
        const choice = choiceFields(action);
        const response = await chooseAction(choice, () => { checkCancellation?.(); verifyTarget(); });
        checkCancellation?.();
        verifyTarget();
        if (response?.cancelled) throw new ActionCancelled(response.message ?? 'The choice was cancelled.');
        const index = choice.options.findIndex(({ id }) => id === response?.id);
        if (index < 0) throw new FlowInterrupted(response?.message ?? 'No valid choice was selected.');
        const { label, action: selected } = choice.options[index];
        const result = await run(selected, context, warnings, [...path, `Choice ${index + 1}`]);
        return result ?? `Chosen ${label}`;
      }

      case 'random': {
        if (path.length >= MAX_DEPTH) throw new Error('Too many nested random actions');
        const { id, pool, avoidRepeat } = randomFields(action);
        const previous = avoidRepeat ? lastPicks.get(id) : undefined;
        const candidates = pool.map((_, index) => index).filter((index) => index !== previous);
        const index = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
        if (lastPicks.size >= MAX_REMEMBERED_PICKS && !lastPicks.has(id)) lastPicks.clear();
        lastPicks.set(id, index);
        const picked = `Ran option ${index + 1} of ${pool.length}`;
        const result = await run(pool[index], context, warnings, [...path, `Option ${index + 1}`]);
        return result ? `${picked} · ${result}` : picked;
      }

      case 'repeat':
      case 'sequence': {
        if (path.length >= MAX_DEPTH) throw new Error(`Too many nested ${action.type} blocks`);
        const steps = action.steps;
        if (!Array.isArray(steps) || steps.length === 0 || steps.length > MAX_STEPS) {
          throw new Error(`A ${action.type} must contain 1 to ${MAX_STEPS} steps`);
        }
        if (action.type === 'repeat') return repeat(action, context, warnings, path);
        await runSteps(steps, context, warnings, (step) => [`Step ${step}`, [...path, step]]);
        return null;
      }

      default:
        throw new Error(`Unknown action type: "${action.type}"`);
    }
  }

  return {
    hotkeyProblem,
    /**
     * Return the outcome as { ok, message }.
     * @param {any} action
     * @param {any} pageApps
     * @param {{ guard?: () => string | undefined, trace?: boolean, shortcutTarget?: any,
     *   onProgress?: (progress: { iteration: number, count: number } | null) => void,
     *   onStepProgress?: (progress: Record<string, any> | null) => void,
     *   onStepResult?: (result: any) => void, signal?: AbortSignal }} [options]
     */
    async run(action, pageApps, { guard, trace: traced = false, shortcutTarget, onProgress, onStepProgress, onStepResult, signal } = {}) {
      const trace = traced ? actionTrace(action, onStepResult) : undefined;
      const tracedSteps = () => trace ? { steps: trace.steps() } : {};
      try {
        const warnings = [];
        const verifyTarget = () => {
          const reason = guard?.();
          if (reason) throw new ActionTargetChanged(reason);
        };
        const checkCancellation = signal && (() => {
          if (signal.aborted) throw new ActionCancelled('The macro was stopped. Completed steps are listed below.');
        });
        const pause = signal && (async (ms) => {
          const deadline = now() + ms;
          for (;;) {
            checkCancellation();
            const remaining = deadline - now();
            if (remaining <= 0) return;
            await sleep(Math.min(remaining, 150));
          }
        });
        if (shortcutTarget === undefined && actionNeedsShortcutTarget(action)) shortcutTarget = readForeground?.context?.({ fresh: true });
        const message = await run(action, { pageApps, verifyTarget, trace, shortcutTarget, onProgress, onStepProgress,
          checkCancellation, pause }, warnings);
        return { ok: true, message: warnings.length ? `Continued after ${warnings.join(' · ')}` : message, ...tracedSteps() };
      } catch (err) {
        return { ok: false, message: err.message, ...tracedSteps(),
          ...(err instanceof ActionCancelled ? { cancelled: true } : {}),
          ...(trace && err instanceof ActionTargetChanged ? { unavailable: true } : {}) };
      } finally {
        onStepProgress?.(null);
      }
    },
  };
}

module.exports = { createActionRunner, expandEnv, expandPathEnv, expandLocalPath, isUrlLike };
