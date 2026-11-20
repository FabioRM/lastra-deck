// @ts-check
'use strict';

const { EventEmitter } = require('node:events');
const { createActionRunner } = require('./actions');
const { validateProfile } = require('./profile');
const { WAIT_CONDITIONS, conditionFields, seededRandom } = require('../shared/action-flow');
const { shortcutNeedsConfirmation, sameShortcutWindow } = require('./shortcut-guards');
const { layouts, mapSampleCharacter } = require('./actions/keyboard-samples');

const PROVIDERS = ['audio', 'spotify', 'obs'];
const SCENARIO_FIELDS = ['windowId', 'appId', 'windowTitle', 'requireStableWindow', 'disconnected', 'timeline'];
const EVENT_FIELDS = ['atMs', 'values', 'windowId', 'appId', 'windowTitle', 'keyboardLayout', 'photoshopWorkspace', 'cancel', 'disconnected'];

function normalizeScenario(scenario) {
  if (scenario === undefined) return undefined;
  const unavailable = (list) => list === undefined || (Array.isArray(list) && list.length <= PROVIDERS.length
    && list.every((value) => PROVIDERS.includes(value)));
  const window = (id) => id === undefined || (Number.isSafeInteger(id) && id > 0);
  const application = (id) => id === undefined || id === null || (typeof id === 'string' && /^[a-z0-9][a-z0-9._!{}-]{0,190}$/i.test(id));
  const title = (value) => value === undefined || value === null || (typeof value === 'string' && value.length <= 512);
  const boolean = (value) => value === undefined || typeof value === 'boolean';
  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)
      || Object.keys(scenario).some((name) => !SCENARIO_FIELDS.includes(name))
      || !window(scenario.windowId) || !application(scenario.appId) || !title(scenario.windowTitle)
      || !boolean(scenario.requireStableWindow) || !unavailable(scenario.disconnected)) {
    throw new Error('Choose a valid gesture scenario.');
  }
  const timeline = scenario.timeline ?? [];
  if (!Array.isArray(timeline) || timeline.length > 32) throw new Error('A gesture scenario accepts up to 32 events.');
  let previous = 0;
  for (const event of timeline) {
    if (!event || typeof event !== 'object' || Array.isArray(event) || Object.keys(event).some((name) => !EVENT_FIELDS.includes(name))
        || !Number.isSafeInteger(event.atMs) || event.atMs < previous || event.atMs > 600_000 || !window(event.windowId)
        || !application(event.appId) || !title(event.windowTitle)
        || !boolean(event.photoshopWorkspace) || !boolean(event.cancel) || !unavailable(event.disconnected)
        || (event.keyboardLayout !== undefined && !Object.hasOwn(layouts, event.keyboardLayout))
        || (event.values !== undefined && (!event.values || typeof event.values !== 'object' || Array.isArray(event.values)
          || Object.keys(event.values).some((name) => !Object.hasOwn(WAIT_CONDITIONS, name))))) {
      throw new Error('Supply ordered simulation events with known states and layouts.');
    }
    previous = event.atMs;
  }
  return { ...scenario, timeline };
}

/**
 * @param {{ action?: any, apps?: any, values?: Record<string, any>, answers?: Record<string, any>, photoshopWorkspace?: boolean,
 *   keyboardLayout?: string, shortcutLanguage?: string, webApps?: any, scenario?: any, seed?: number }} [options]
 */
async function simulateAction({ action, apps, values, answers, photoshopWorkspace, keyboardLayout, shortcutLanguage, webApps, scenario, seed } = {}) {
  const phrase = /^[a-z0-9_-]{1,40}$/i;
  if (seed !== undefined && (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xFFFF_FFFF)) {
    throw new Error('Choose a simulation seed between 0 and 4294967295.');
  }
  if (answers !== undefined && (!answers || typeof answers !== 'object' || Array.isArray(answers)
      || Object.keys(answers).length > 32 || Object.entries(answers).some(([id, choice]) =>
        !phrase.test(id) || typeof choice !== 'string' || !phrase.test(choice)))) throw new Error('Choose known prompt and option IDs for the simulation.');
  scenario = normalizeScenario(scenario);
  const { pages: [page] } = validateProfile({ grid: { cols: 1, rows: 1 }, shortcutLanguage, pages: [
    { id: 'test', name: 'Test', apps, keys: [{ id: 'test', action, confirm: shortcutNeedsConfirmation(action) }] },
  ] });
  const state = new Map();
  function updateValues(values) {
    for (const key of Object.keys(WAIT_CONDITIONS)) {
      if (!Object.hasOwn(values ?? {}, key)) continue;
      const expected = values[key];
      if (expected == null || expected === '') state.delete(key);
      else state.set(key, conditionFields({ condition: key, expected }).expected);
    }
  }
  updateValues(values);
  const readForeground = () => state.get('foreground');
  let layout = Object.hasOwn(layouts, keyboardLayout) ? layouts[keyboardLayout] : undefined;
  let windowId = scenario?.windowId ?? 1;
  let appId = scenario?.appId;
  let title = scenario?.windowTitle;
  readForeground.context = () => readForeground() ? { executable: readForeground(), windowId, appId, title,
    mode: photoshopWorkspace === true && readForeground() === 'photoshop.exe' ? 'the Photoshop workspace' : undefined,
    keyboardLayout: layout?.id } : null;
  readForeground.windowId = () => readForeground.context()?.windowId;
  let time = 0;
  let cancelled = false;
  let disconnected = new Set(scenario?.disconnected ?? []);
  let eventIndex = 0;
  const effects = [];
  const effect = (item) => { if (scenario) effects.push({ atMs: time, ...item }); };
  const timeline = scenario?.timeline ?? [];
  function advance(ms) {
    time += ms;
    while (eventIndex < timeline.length && timeline[eventIndex].atMs <= time) {
      const event = timeline[eventIndex++];
      updateValues(event.values);
      if (event.windowId !== undefined) windowId = event.windowId;
      if (event.appId !== undefined) appId = event.appId;
      if (event.windowTitle !== undefined) title = event.windowTitle;
      if (event.keyboardLayout !== undefined) layout = layouts[event.keyboardLayout];
      if (event.photoshopWorkspace !== undefined) photoshopWorkspace = event.photoshopWorkspace;
      if (event.cancel === true) cancelled = true;
      if (event.disconnected !== undefined) disconnected = new Set(event.disconnected);
    }
  }
  const initial = readForeground.context();
  const initialWindowId = windowId;
  advance(0);
  // These dependencies only model effects. The runner still validates and branches normally.
  const runner = createActionRunner({
    readForeground,
    readShortcutSettings: () => ({ shortcutLanguage, platform: 'win32', webApps }),
    readState: (key) => state.get(key),
    async chooseAction({ id, timeoutMs }, verifyTarget) {
      if (Object.hasOwn(answers ?? {}, id)) return { id: answers[id] };
      for (let remaining = timeoutMs; remaining > 0;) {
        const interval = Math.min(remaining, 150);
        advance(interval);
        verifyTarget();
        remaining -= interval;
      }
      return { message: 'The choice timed out.' };
    },
    shell: {
      async openExternal() { effect({ type: 'open', target: 'URL or protocol' }); },
      async openPath() { effect({ type: 'open', target: 'path' }); return ''; },
    },
    spawn() {
      effect({ type: 'launch' });
      const child = /** @type {EventEmitter & { unref?: () => void }} */ (new EventEmitter());
      child.unref = () => {};
      queueMicrotask(() => child.emit('spawn'));
      return child;
    },
    focusApp: () => 'missing',
    restoreWorkspace: async (id) => {
      effect({ type: 'workspace' });
      return { ok: true, message: `Would restore workspace ${id}` };
    },
    selectObsScene: async ({ scene, bus = 'program' }) => {
      if (disconnected.has('obs') || (scenario && state.get('obs-connected') === false)) {
        return { ok: false, unavailable: true, message: 'The simulated OBS connection is unavailable.' };
      }
      effect({ type: 'obs-scene', bus });
      if (bus === 'program') state.set('obs-scene', scene);
      return { ok: true, message: `Would select the OBS ${bus} scene.` };
    },
    input: {
      sendChord() { effect({ type: 'chord' }); },
      sendText(text) { effect({ type: 'text', characters: Array.from(text).length }); },
      mapCharacter: (character) => mapSampleCharacter(character, layout),
    },
    audio: { change(device) {
      if (disconnected.has('audio')) throw new Error('The simulated audio endpoint is unavailable.');
      effect({ type: 'audio', device });
      const key = device === 'output' ? 'speaker-muted' : 'microphones-muted';
      if (state.has(key)) state.set(key, !state.get(key));
      return null;
    } },
    changeTimer: ({ label, command }) => {
      effect({ type: 'timer' });
      return `Would ${command === 'toggle' ? 'start, pause or resume' : command} ${label}`;
    },
    playSound: ({ command, file }) => {
      effect({ type: 'sound' });
      return command === 'stop-all' ? 'Would stop every clip' : `Would play ${file.replace(/^.*[\\/]/, '')}`;
    },
    toggleSpotify: (verifyTarget) => {
      verifyTarget();
      if (disconnected.has('spotify')) throw new Error('The simulated Spotify session is unavailable.');
      effect({ type: 'spotify-playback' });
      return null;
    },
    env: {},
    sleep: async (ms) => advance(ms),
    now: () => time,
    // A seed replays the same random picks. Without one the simulation picks as the deck would.
    ...(seed !== undefined ? { random: seededRandom(seed) } : {}),
  });
  const guard = scenario ? () => {
    if (cancelled) return 'The simulated gesture was cancelled.';
    if (!scenario.requireStableWindow) return undefined;
    const active = readForeground.context();
    if (!initial && !active && windowId === initialWindowId) return undefined;
    if (!sameShortcutWindow(initial, active)) return 'The simulated target window changed.';
    if (initial?.keyboardLayout !== active?.keyboardLayout) return 'The simulated keyboard layout changed.';
    if (scenario.windowTitle != null && initial?.title !== active?.title) return 'The simulated window title changed.';
    if (initial?.mode !== active?.mode) return 'The simulated app surface changed.';
  } : undefined;
  const result = await runner.run(page.keys[0].action, page.apps, { trace: true, guard });
  return { ...result, elapsedMs: time, ...(scenario ? { effects, cancelled } : {}) };
}

module.exports = { simulateAction };
