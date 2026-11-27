// @ts-check
/// <reference lib="dom" />
/* global document, getComputedStyle, innerHeight, innerWidth */
'use strict';

// Offscreen preview for `--preview=<png>`: renders the deck with sample readings into a 2560×720
// (or portrait) virtual viewport, optionally runs a touch or layout check, saves a screenshot and quits.
// It never touches audio, input, or the user's profile files beyond reading them.

const fs = require('node:fs');
const path = require('node:path');
const { ProfileStore, validateProfile } = require('./profile');
const { DEFAULT_APPEARANCE } = require('./deck-appearance');
const { normalizeAppearance } = require('../shared/appearance');
const { DEFAULTS: DEFAULT_PET, initialPetCare } = require('../shared/deck-pet');
const { packs } = require('./shortcut-packs');
const { webPacks, chromiumWebAppId } = require('./shortcut-packs-web');
const { StatsMonitor } = require('./stats');
const { setTimeout: pause } = require('node:timers/promises');

const RENDER_TIMEOUT_MS = 12000;

async function capturePreview(devtools, file, width, height, x = 0, y = 0) {
  const { data } = await devtools.sendCommand('Page.captureScreenshot', {
    captureBeyondViewport: true, clip: { x, y, width, height, scale: 1 },
  });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
}

function inspectToolbar() {
  const grid = document.getElementById('keys');
  const { gridTemplateColumns, columnGap } = getComputedStyle(grid);
  const tracks = gridTemplateColumns.split(' ').map((track) => parseFloat(track));
  const gridWidth = tracks.reduce((total, track) => total + track, 0) + (tracks.length - 1) * parseFloat(columnGap);
  const gridBounds = grid.getBoundingClientRect();
  const inset = (grid.offsetWidth - gridWidth) / 2 * (gridBounds.width / grid.offsetWidth);
  const nav = document.getElementById('page-nav').getBoundingClientRect();
  const home = document.getElementById('home-page').getBoundingClientRect();
  const buttons = ['quick-tools-open', 'emoji-tab', 'pet-tab', 'page-lock'].map((id) => document.getElementById(id));
  if (buttons.some((button) => {
    const { width, height } = button.getBoundingClientRect();
    return !width || Math.abs(width - home.width) > 1 || Math.abs(height - home.height) > 1
      || ![...button.querySelectorAll('svg')].some((icon) => icon.getBoundingClientRect().width > 0);
  })) throw new Error('Tools, Emoji, Pet and Lock must have visible icons and match the Home button size.');
  const [, , pet, lock] = buttons;
  if (pet.nextElementSibling !== lock) throw new Error('The Pet button must come immediately before Lock.');
  const geometry = () => JSON.stringify(['deck', 'page-nav', 'panel', 'widget-bar'].map((id) =>
    document.getElementById(id).getBoundingClientRect().toJSON()));
  const before = geometry();
  const heading = document.getElementById('page-name');
  const icon = document.getElementById('page-app-icon');
  const habitat = document.getElementById('pet-habitat');
  const expand = document.getElementById('pet-expand');
  const shortcutHeading = heading.textContent;
  const shortcutIcon = icon.getAttribute('src');
  pet.click();
  if (!grid.hidden || habitat.hidden || geometry() !== before) {
    throw new Error('The pet habitat must replace the keys without moving the deck layout.');
  }
  if (heading.textContent !== 'Sample foreground app' || icon.hidden || !icon.getBoundingClientRect().width) {
    throw new Error('The pet habitat must keep the foreground app name and icon visible in the toolbar.');
  }
  expand.click();
  const bounds = habitat.getBoundingClientRect();
  const exit = expand.getBoundingClientRect();
  if (Math.abs(bounds.left) > 1 || Math.abs(bounds.top) > 1 || Math.abs(bounds.right - innerWidth) > 1
    || Math.abs(bounds.bottom - innerHeight) > 1 || heading.getClientRects().length
    || getComputedStyle(habitat).borderRadius !== '0px') {
    throw new Error('The full-screen habitat must cover the display and hide the app heading.');
  }
  if (exit.top > 32 || innerWidth - exit.right > 32 || !expand.querySelector('.pet-exit-icon')?.getClientRects().length
    || document.getElementById('pet-environment').hidden) {
    throw new Error('The full-screen habitat must keep its exit control and weather visible.');
  }
  expand.click();
  if (habitat.hidden || habitat.hasAttribute('data-expanded') || geometry() !== before) {
    throw new Error('Exiting full screen must restore the compact habitat in place.');
  }
  pet.click();
  if (grid.hidden || geometry() !== before || heading.textContent !== shortcutHeading || icon.getAttribute('src') !== shortcutIcon) {
    throw new Error('Closing the pet habitat must restore the keys and shortcut heading in place.');
  }
  const actions = buttons[0].parentElement.getBoundingClientRect();
  const aligned = Number.isFinite(inset) && Math.abs(nav.left - (gridBounds.left + inset)) < 2
    && Math.abs(nav.right - (gridBounds.right - inset)) < 2 && Math.abs(actions.right - nav.right) < 2;
  if (!aligned) throw new Error('The Deck Keys toolbar does not align with the key grid.');
  const x = Math.max(0, Math.floor(actions.left) - 12);
  const y = Math.max(0, Math.floor(actions.top) - 12);
  return { x, y, width: Math.min(innerWidth, Math.ceil(actions.right) + 12) - x,
    height: Math.min(innerHeight, Math.ceil(actions.bottom) + 8) - y };
}

function previewControls(devtools) {
  const evaluate = async (/** @type {string} */ expression) => {
    const result = await devtools.sendCommand('Runtime.evaluate', { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'Demo view failed to render.');
    return result.result.value;
  };
  async function waitFor(ready, message) {
    for (let attempt = 0; attempt < 36; attempt++) {
      if (await evaluate(ready)) return;
      await pause(75);
    }
    throw new Error(message);
  }
  const click = (/** @type {string} */ id) => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
  return { evaluate, waitFor, click };
}

async function verifyPreviewHomeNotification(devtools, send, publishProfile) {
  const { evaluate, waitFor } = previewControls(devtools);
  const geometry = `JSON.stringify(['time', 'date', 'status', 'telemetry', 'mixer', 'keys'].map(id =>
    document.getElementById(id).getBoundingClientRect().toJSON()))`;
  const notice = `document.getElementById('home-notification')`;
  const baseline = await evaluate(geometry);
  const message = 'Profile reloaded';
  send('status', { ok: true, message });
  await waitFor(`${notice}.textContent.length > 0`, 'The Home notification did not appear.');
  if (await evaluate(geometry) !== baseline) throw new Error('The Home notification moved the layout.');

  publishProfile();
  await waitFor(`document.getElementById('status').textContent === ''`, 'The empty profile status did not render.');
  if (!await evaluate(`${notice}.textContent.length > 0`)) throw new Error('A profile refresh cleared the Home notification.');
  // Wait for the same success timeout that the live deck uses.
  for (let elapsed = 0; elapsed < 5000 && await evaluate(`${notice}.textContent.length`); elapsed += 100) await pause(100);
  if (await evaluate(`${notice}.textContent.length`) || await evaluate(geometry) !== baseline) {
    throw new Error('The Home notification did not expire without moving the layout.');
  }

  send('status', { ok: false, message: 'Could not reload the profile. '.repeat(20).trim() });
  await waitFor(`${notice}.classList.contains('err')`, 'The Home error notification did not appear.');
  const fits = await evaluate(`(() => {
    const bounds = ${notice}.getBoundingClientRect();
    const time = document.getElementById('time').getBoundingClientRect();
    const controls = document.getElementById('home-page').getBoundingClientRect();
    return bounds.width > 0 && bounds.bottom <= time.top && (bounds.top >= controls.bottom || bounds.right <= controls.left);
  })()`);
  if (!fits || await evaluate(geometry) !== baseline) throw new Error('The Home error must fit above the clock and clear the toolbar.');
}

async function openPreviewTools(devtools) {
  const { click, waitFor, evaluate } = previewControls(devtools);
  await click('quick-tools-open');
  await waitFor(`!document.getElementById('quick-tools').hidden
    && document.querySelector('#tools-timers .widget-timer-list li')
    && !document.getElementById('tools-pomodoro-primary')?.disabled`, 'The sample Tools and Pomodoro did not open.');
  const valid = await evaluate(`(() => {
    const tools = document.getElementById('quick-tools');
    const bounds = tools.getBoundingClientRect();
    const stage = document.getElementById('stage').getBoundingClientRect();
    const mode = document.getElementById('dashboard-switch').getBoundingClientRect();
    const close = document.getElementById('quick-tools-close').getBoundingClientRect();
    const same = (left, right) => ['x', 'y', 'width', 'height'].every(key => Math.abs(left[key] - right[key]) < 1);
    const gears = [...tools.querySelectorAll('.tools-options-toggle:not([hidden])')];
    const content = document.getElementById('tools-content');
    const cards = [...tools.querySelectorAll('.tools-configurable')];
    const dialog = document.getElementById('tools-options-dialog');
    const closeOptions = document.getElementById('tools-options-close');
    return !document.querySelector('dialog[open]') && same(bounds, stage) && same(mode, close)
      && !tools.querySelector('#page-directory-open, #quick-tools-feedback') && gears.length === 3 && gears.every(gear => {
        const form = document.getElementById('tools-' + gear.dataset.toolOptions + '-options');
        const sizes = cards.map(card => card.getBoundingClientRect());
        const { scrollTop, scrollHeight } = content;
        gear.click();
        const unchanged = () => content.scrollTop === scrollTop && content.scrollHeight === scrollHeight
          && cards.every((card, index) => same(card.getBoundingClientRect(), sizes[index]));
        const opened = dialog.matches(':modal') && !form.hidden && dialog.scrollHeight <= dialog.clientHeight + 1 && unchanged();
        closeOptions.click();
        return opened && !dialog.open && form.hidden && document.activeElement === gear && unchanged();
      });
  })()`);
  if (!valid) throw new Error('Tools must fill the stage, align its close button with the mode switch, and open settings without scrolling or resizing cards.');
}

async function startPreviewBreak(devtools) {
  const { click, waitFor } = previewControls(devtools);
  await click('tools-pomodoro-primary');
  await waitFor(`(() => {
    const dialog = document.getElementById('pomodoro-break');
    const { x, y, width, height } = dialog.getBoundingClientRect();
    return dialog.open && x === 0 && y === 0 && width === innerWidth && height === innerHeight;
  })()`, 'The sample Pomodoro break did not fill the viewport.');
}

async function captureDemo({ devtools, send, directory, width, height, shortcutPack, toolView }) {
  fs.mkdirSync(directory, { recursive: true });
  const frames = [];
  async function capture(seconds, name = `frame-${String(frames.length).padStart(3, '0')}`) {
    const file = name + '.png';
    await capturePreview(devtools, path.join(directory, file), width, height);
    frames.push({ file, seconds });
  }
  const { evaluate, waitFor, click } = previewControls(devtools);
  async function navigate(view, selector) {
    send('deck:navigation', { view });
    await waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().width)`, 'The preview did not open ' + view + '.');
    await pause(100);
  }
  if (shortcutPack) {
    const label = await evaluate(`document.getElementById('page-count').textContent`);
    // Pages change by swipe on the panel. The hidden paging buttons stand in for the swipe here.
    await capture(1.9);
    await evaluate(`document.getElementById('next').click()`);
    const before = JSON.stringify(label);
    await waitFor(`document.getElementById('page-count').textContent !== ${before}`, 'This shortcut preview needs at least two generated pages.');
    await capture(2.1);
    await evaluate(`document.getElementById('previous').click()`);
    await waitFor(`document.getElementById('page-count').textContent === ${before}`, 'The shortcut preview could not return to the first page.');
    await capture(0.84);
  } else if (toolView) {
    await capture(1.1);
    await openPreviewTools(devtools);
    await capture(2.4);
    await startPreviewBreak(devtools);
    for (const time of ['05:00', '04:59', '04:58']) {
      await waitFor(`document.getElementById('pomodoro-break-time').textContent === '${time}'`, 'The sample break did not count down.');
      await capture(1);
    }
    await click('pomodoro-break-close');
    await waitFor(`!document.getElementById('pomodoro-break').open && !document.getElementById('quick-tools').hidden`,
      'Closing the sample break did not return to Tools.');
    await capture(1.5);
    await click('quick-tools-close');
    await waitFor(`document.getElementById('quick-tools').hidden`, 'Closing the sample Tools did not return to Deck Keys.');
    await capture(0.75);
  } else {
    await capture(1.75);
    await navigate('emoji', '#emoji-panel .emoji-key');
    await capture(1.1);
    for (let step = 1; step <= 10; step++) {
      await evaluate(`document.getElementById('emoji-grid').scrollTop = ${step * 65}`);
      await pause(50);
      await capture(step === 10 ? 1 : 0.1);
    }
    await navigate('dashboard', '#dashboard-panel:not([hidden])');
    await capture(2, 'dashboard');
    await navigate('stats', '#stats-readings .stats-card');
    await capture(2.3);
    await navigate('feeds', '#feeds-panel:not([hidden]) #feeds-weather');
    await capture(2.4);
  }
  fs.writeFileSync(path.join(directory, 'frames.json'), JSON.stringify(frames));
}

async function verifyPreviewSwipe(devtools) {
  const read = async (expression) => (await devtools.sendCommand('Runtime.evaluate', {
    expression, returnByValue: true,
  })).result.value;
  const point = await read(`(() => {
    const key = document.querySelector('#keys .key');
    if (!key || Number(key.parentElement.style.gridColumn.split('span ').at(-1)) < 2) return null;
    const bounds = key.getBoundingClientRect();
    return { x: Math.floor(bounds.right - 18), y: Math.floor((bounds.top + bounds.bottom) / 2) };
  })()`);
  if (!point || point.x < 130) throw new Error('Swipe verification requires a wide first key.');
  const touch = (type, touchPoints) => devtools.sendCommand('Input.dispatchTouchEvent', { type, touchPoints });
  await touch('touchStart', [{ ...point, id: 1 }]);
  await touch('touchMove', [{ ...point, id: 1, x: point.x - 100 }]);
  await touch('touchEnd', []);
}

async function verifyPreviewFaders(devtools, audio, writes) {
  const evaluate = async (expression) => (await devtools.sendCommand('Runtime.evaluate', {
    expression, returnByValue: true,
  })).result.value;
  for (const [device, orientation] of [['output', 'horizontal'], ['microphone', 'vertical']]) {
    const selector = '#keys .widget-fader[data-orientation="' + orientation + '"]';
    const points = await evaluate(`(() => {
      const range = document.querySelector(${JSON.stringify(selector)} + ' input');
      if (!range || range.disabled) return null;
      const bounds = range.getBoundingClientRect();
      return [0.25, 0.75].map((fraction) => ({
        x: Math.round(bounds.left + bounds.width * (${orientation === 'horizontal'} ? fraction : 0.5)),
        y: Math.round(bounds.top + bounds.height * (${orientation === 'vertical'} ? fraction : 0.5)),
        id: 1,
      }));
    })()`);
    if (!points) throw new Error('Fader verification requires one horizontal and one vertical page widget.');
    const touch = (type, touchPoints) => devtools.sendCommand('Input.dispatchTouchEvent', { type, touchPoints });
    await touch('touchStart', [points[0]]);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await touch('touchMove', [points[1]]);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const levels = writes.filter((entry) => entry.device === device && entry.id === audio[device].id);
    if (levels.length < 2) throw new Error(orientation + ' fader did not update the endpoint during the drag.');
    await touch('touchEnd', []);
    const resetLevel = await evaluate(`(() => {
      const reset = document.querySelector(${JSON.stringify(selector)} + ' button');
      reset.click();
      return Number(reset.title.match(/[0-9]+/)[0]);
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (audio[device].level !== resetLevel) throw new Error(orientation + ' fader did not apply the configured reset level.');
  }
}

/**
 * Loads the profile to preview: `--profile=` (validated, never watched) or the stock default profile.
 * With `--preview-pack=`, the foreground is faked so the pack's generated page is selected.
 */
function loadPreviewProfile({ opts, defaultProfile, pages }) {
  const store = new ProfileStore({ file: defaultProfile, defaultFile: defaultProfile });
  if (opts.profile) store.current = validateProfile(JSON.parse(fs.readFileSync(opts.profile, 'utf8').replace(/^\uFEFF/, '')));
  else store.load();
  if (opts.previewPack) {
    const pack = [...packs, ...webPacks].find(({ id }) => id === opts.previewPack);
    if (!pack) throw new Error('Unknown shortcut pack ' + opts.previewPack);
    const manifest = store.current.webApps?.find(({ pack: id }) => id === pack.id)?.manifestId ?? pack.manifests?.[0];
    if (pack.sites && !manifest) throw new Error('This pack requires a configured manifest.');
    pages.observe({ executable: manifest ? 'chrome.exe' : pack.executables[0],
      appId: manifest ? 'chrome._crx_' + chromiumWebAppId(manifest) : pack.appIds?.[0], path: pack.pathContains,
      keyboardLayout: 0x04090409, mode: pack.previewMode, windowId: 1n });
  }
  return store;
}

/** One minute of plausible sensor history and a current sample. */
function previewTelemetry(now) {
  const { TelemetryHistory } = require('../renderer/telemetry-history');
  const history = new TelemetryHistory();
  for (let seconds = 60; seconds > 0; seconds--) {
    const sampledAt = now - seconds * 1000;
    history.record({
      sampledAt, hardwareAt: sampledAt,
      cpu: 0.32 + 0.14 * Math.sin(seconds * 0.3) + 0.07 * Math.cos(seconds * 2.1),
      ram: 0.69 + 0.02 * Math.sin(seconds * 0.19),
      gpu: 0.78 + 0.12 * Math.cos(seconds * 0.23),
      cpuTemp: 62 + 6 * Math.sin(seconds * 0.16), gpuTemp: 73 + 3 * Math.cos(seconds * 0.21),
    });
  }
  const sample = {
    cpu: 0.34, ram: 0.71, gpu: 0.88, cpuTemp: 61, gpuTemp: 74,
    sampledAt: now, hardwareAt: now, hardwareSource: 'preview',
  };
  return { history, sample };
}

function previewStats({ sample, history, verify }) {
  const { sampleStatsHardware } = require('./stats-preview');
  const hardware = sampleStatsHardware();
  for (const sensor of hardware.filter(({ kind }) => kind === 'Cpu')) {
    for (let offset = 58; offset > 0; offset--) {
      const at = sample.hardwareAt - offset * 1_000;
      history.recordPoint('lhm:' + sensor.id, at, sensor.value * (.9 + Math.sin(offset * .3) * .08), sample.hardwareAt);
    }
  }
  // The sample readers are synchronous; StatsMonitor awaits whatever they return.
  return new StatsMonitor(/** @type {any} */ ({
    sample: () => ({ sample, history: history.series, hardware }),
    display: () => ({ displays: [
      { id: 1, label: 'XENEON EDGE', displayFrequency: 60 }, { id: 2, label: 'Example monitor', displayFrequency: 144 },
    ], selected: 1 }),
    foreground: () => ({ id: 'preview', pid: 100, name: 'Example app' }),
    framesExecutable: 'preview',
    readFrames: () => {
      if (verify) throw Object.assign(new Error('Test error'), { stderr: 'access denied' });
      return { fps: 119.4, ms: 8.4, p95: 10.6, minFps: 84 };
    },
    readWindows: () => ({ memorySpeeds: [6000], volumes: [
      { id: 'C:', busy: 18, capacity: 1e12, free: 4e11 }, { id: 'D:', busy: 2, capacity: 2e12, free: 1e12 },
    ] }),
  }));
}

/**
 * @typedef {object} PreviewDeck The parts of the main process the preview drives.
 * @property {any} pages The shared `Pages` selection.
 * @property {(store: any) => void} setStore
 * @property {(stats: any) => void} setStats
 * @property {(win: any) => void} setWindow Makes `send` target the offscreen window.
 * @property {(channel: string, payload?: any) => void} send
 * @property {() => any} currentView
 * @property {() => void} refreshPage
 * @property {(sheet: number) => void} repaginatePage
 */

/**
 * The virtual viewport can exceed the host display's dimensions.
 *
 * @param {object} options
 * @param {import('./cli').LaunchOptions} options.opts
 * @param {any} options.ipcMain
 * @param {any} options.BrowserWindow
 * @param {() => void} options.quit
 * @param {(err: unknown) => void} options.fail
 * @param {(...args: any[]) => void} options.log
 * @param {string} options.renderer The deck renderer's index.html.
 * @param {string} options.defaultProfile
 * @param {string} options.background
 * @param {object} options.webPreferences
 * @param {PreviewDeck} options.deck
 */
async function startPreview({ opts, ipcMain, BrowserWindow, quit, fail, log, renderer, defaultProfile, background, webPreferences, deck }) {
  const { pages, send } = deck;
  const store = loadPreviewProfile({ opts, defaultProfile, pages });
  deck.setStore(store);
  let previewSheet = 0;
  const toolbarApp = opts.previewToolbar ? {
    name: 'Sample foreground app',
    icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="32" height="32"%3E%3Ccircle cx="16" cy="16" r="13" fill="%236daaf2"/%3E%3C/svg%3E',
  } : null;
  const previewView = () => ({ ...deck.currentView(), followsApps: true, deckSheet: previewSheet,
    ...(toolbarApp ? { foregroundApp: toolbarApp } : {}) });
  function publishPreview() {
    pages.revision++;
    send('profile', previewView());
  }
  ipcMain.handle('profile:get', previewView);
  ipcMain.handle('update:status', () => ({ state: 'disabled' }));
  ipcMain.handle('page:lock', () => {
    pages.toggleLock(store.current);
    publishPreview();
  });
  let previewPresses = 0;
  ipcMain.handle('key:press', () => {
    previewPresses++;
    return { ok: true, message: null };
  });
  ipcMain.handle('page:select', (_event, id) => {
    pages.select(store.current, id);
    previewSheet = 0;
    publishPreview();
  });
  ipcMain.handle('page:repaginate', (_event, sheet) => {
    if (!Number.isSafeInteger(sheet) || sheet < 0) throw new Error('Invalid deck screen.');
    previewSheet = sheet;
    publishPreview();
  });
  ipcMain.handle('deck:badges:read', () => ({}));
  /** @type {{ output: any, microphone: any, version: number, inputs?: any[] }} */
  const previewAudio = {
    output: { id: 'preview-output', level: 66, muted: false },
    microphone: { id: 'preview-microphone', level: 85, muted: true },
    version: 0,
  };
  previewAudio.inputs = [previewAudio.microphone];
  ipcMain.handle('audio:peaks', () => ({ output: 0.25, outputId: previewAudio.output.id,
    microphone: null, microphoneId: previewAudio.microphone.id }));
  const previewAudioWrites = [];
  ipcMain.handle('audio:change', (_event, device, level, id) => {
    const endpoint = ['output', 'microphone'].includes(device) ? previewAudio[device] : null;
    if (!endpoint || id !== endpoint.id || !Number.isInteger(level) || level < 0 || level > 100) return { ok: false };
    endpoint.level = level;
    previewAudio.version++;
    previewAudioWrites.push({ device, id, level });
    send('audio', previewAudio);
    return { ok: true, confirmed: { endpoint, version: previewAudio.version } };
  });
  // Sample timers, so a preview shows timer keys and the Timers widget with readings.
  const previewNow = Date.now();
  ipcMain.handle('timers:read', () => ({ ok: true, state: { revision: 1, warning: null, timers: [
    { id: 'tea', label: 'Tea', kind: 'countdown', durationMs: 180_000, status: 'running', valueMs: 161_000, anchorAt: previewNow, endedAt: null },
    { id: 'stopwatch', label: 'Stopwatch', kind: 'stopwatch', status: 'paused', valueMs: 725_000, anchorAt: null, endedAt: null },
  ] } }));
  const { history, sample } = previewTelemetry(Date.now());
  const demo = opts.previewFrames && !opts.previewPack && !opts.previewToolView;
  const stats = opts.stats || demo ? previewStats({ sample, history, verify: opts.verifyStats }) : null;
  if (stats) {
    deck.setStats(stats);
    stats.snapshot();
    ipcMain.handle('stats:read', () => stats.snapshot());
    ipcMain.handle('stats:stop', () => stats.stop());
    ipcMain.handle('stats:tab', () => {});
    ipcMain.handle('stats:incidents', () => ({ ok: true, timeline: { events: [], dashboard: null } }));
    ipcMain.handle('view:set', () => {});
  }
  if (demo) {
    const { EMOJI_GROUPS, EMOJI_KEYS } = require('../shared/emoji-catalog');
    ipcMain.handle('emoji:catalog', () => ({ groups: EMOJI_GROUPS, entries: EMOJI_KEYS, frequent: [], tones: {} }));
    ipcMain.handle('media:snapshot', () => ({ status: 'ready', sessionId: 'preview', trackId: 'warm-up',
      title: 'Warm-up', album: 'Studio Sessions', artist: 'Lastra Demo', source: 'Spotify',
      sampledAt: Date.now(), playback: 'playing', durationMs: 241_000, positionMs: 83_000,
      seekMinMs: 0, seekMaxMs: 241_000, canPause: true, canPrevious: true, canNext: true }));
    ipcMain.handle('dashboard:agenda', () => ({ ok: true, state: { status: 'ready', selected: true,
      event: { title: 'Studio review', startAt: Date.now() + 60 * 60 * 1_000 } } }));
    ipcMain.handle('dashboard:pomodoro:read', () => ({ ok: true, state: { phase: 'focus', status: 'idle', remainingMs: 25 * 60 * 1_000 } }));
    const noon = Date.now();
    ipcMain.handle('feeds:read', () => ({
      weather: {
        place: 'Rome, Italy', temperature: 18, label: 'Clear', low: 12, high: 21, latitude: 41.9,
        sun: { dawn: noon - 7 * 3_600_000, sunrise: noon - 6 * 3_600_000, sunset: noon + 6 * 3_600_000, dusk: noon + 7 * 3_600_000 },
      },
      quotes: {
        labels: { AAPL: 'Apple', MSFT: 'Microsoft' },
        rows: [
          { symbol: 'AAPL', price: 189.4, change: 1.2, marketCap: 2.86e12, marketCapCurrency: 'USD' },
          { symbol: 'MSFT', price: 421.15, change: -0.4, marketCap: 3.13e12, marketCapCurrency: 'USD' },
        ],
      },
      currencies: { rows: [{ pair: 'EURUSD', rate: 1.0864 }] },
    }));
  } else if (opts.previewToolbar) {
    ipcMain.handle('feeds:read', () => ({ weather: null }));
  }
  if (opts.previewToolView) {
    let breakStartedAt = null;
    const durationMs = 5 * 60_000;
    const snapshot = () => breakStartedAt === null
      ? { phase: 'focus', status: 'complete', durationMs: 25 * 60_000, remainingMs: 0, revision: 1 }
      : { phase: 'break', status: 'running', durationMs, remainingMs: durationMs - (Date.now() - breakStartedAt), revision: 2 };
    ipcMain.handle('dashboard:pomodoro:read', () => ({ ok: true, state: snapshot() }));
    ipcMain.handle('tools:pomodoro:change', (_event, command) => {
      if (command?.type !== 'start' || command.revision !== 1 || breakStartedAt !== null) return { ok: false };
      breakStartedAt = Date.now();
      const state = snapshot();
      send('pomodoro:changed', state);
      return { ok: true, state };
    });
    const { DEFAULT_CHOICES } = require('../shared/decisions');
    ipcMain.handle('tools:choices', () => DEFAULT_CHOICES);
    ipcMain.handle('sounds:read', () => ({ ok: true, state: { revision: 1, playing: [] } }));
  }

  const width = opts.portrait ? 720 : 2560;
  const height = opts.portrait ? 2560 : 720;
  const win = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    frame: false,
    show: false,
    backgroundColor: background,
    webPreferences: { ...webPreferences, offscreen: true },
  });
  deck.setWindow(win);
  const devtools = win.webContents.debugger;
  const deadline = setTimeout(() => fail(new Error('Timed out rendering the preview')), opts.previewFrames ? 60_000 : RENDER_TIMEOUT_MS);

  ipcMain.once('renderer:ready', async () => {
    try {
      const look = Object.fromEntries(Object.entries(opts.previewLook ?? {}).map(([name, value]) =>
        [name, value === 'true' ? true : value === 'false' ? false : /^\d+$/.test(value) ? Number(value) : value]));
      send('deck:appearance', normalizeAppearance({ ...DEFAULT_APPEARANCE, ...look, largeKeys: opts.previewLargeKeys === true }));
      send('deck:pet', { settings: DEFAULT_PET, care: initialPetCare() });
      win.setContentSize(width + 1, height + 1);
      devtools.attach();
      await devtools.sendCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      send('sensors', { ...sample, history: history.series });
      send('audio', previewAudio);
      await new Promise((r) => setTimeout(r, 1000));
      if (opts.previewToolbar) {
        const toolbar = await devtools.sendCommand('Runtime.evaluate', {
          expression: '(' + inspectToolbar.toString() + ')()', returnByValue: true,
        });
        if (toolbar.exceptionDetails) throw new Error(toolbar.exceptionDetails.exception?.description ?? 'Toolbar verification failed.');
        const { x, y, width, height } = toolbar.result.value;
        await capturePreview(devtools, path.resolve(opts.previewToolbar), width, height, x, y);
        log('Deck Keys toolbar icons and grid alignment verified.');
      }
      if (opts.verifySwipe) {
        const [, expected] = store.current.pages;
        if (!expected) throw new Error('Swipe verification requires a profile with at least two pages.');
        await verifyPreviewSwipe(devtools);
        await new Promise((resolve) => setTimeout(resolve, store.current.gestures.doubleTapMs + 80));
        if (pages.manual !== expected.id || previewPresses) throw new Error('Swipe did not change pages without invoking a key.');
        log('Deck swipe verified from a wide key.');
      }
      if (opts.verifyFaders) {
        await verifyPreviewFaders(devtools, previewAudio, previewAudioWrites);
        log('Horizontal and vertical audio faders verified.');
      }
      if (opts.verifyHomeNotification) {
        await verifyPreviewHomeNotification(devtools, send, () => send('profile', { ...previewView(), name: '' }));
        log('Home notifications verified without layout shifts.');
      }
      if (opts.verifyStats) {
        const { inspectStatsLayout, inspectCustomOverview, inspectChartSeries } = require('./stats-preview');
        const check = await devtools.sendCommand('Runtime.evaluate', {
          expression: '(' + inspectStatsLayout.toString() + ')()', returnByValue: true,
        });
        if (check.exceptionDetails) throw new Error(check.exceptionDetails.exception?.description ?? 'Stats verification failed');
        log('Stats preview verified:', check.result.value);
        const { overview, readings } = stats.snapshot({ refresh: false });
        const selected = ['gpu', 'cpu', 'ram'].map((id) => overview.find((item) => item.id === id));
        const preferences = { layout: 'cards', style: 'line' };
        send('stats:preferences', { ...preferences, revision: 1, selected, wide: ['gpu'] });
        const arranged = await devtools.sendCommand('Runtime.evaluate', {
          expression: '(' + inspectCustomOverview.toString() + ')()', returnByValue: true, awaitPromise: true,
        });
        if (arranged.result?.value !== true) throw new Error('Custom Stats card order or width did not match the preferences');
        log('Custom Stats card order and widths verified.');
        const core = readings.find(({ name }) => name === 'CPU Core Max');
        const extras = ['lhm:/intelcpu/0/power/0', 'lhm:/intelcpu/0/clock/0'].map((id) => readings.find((row) => row.id === id));
        extras.push({ id: 'lhm:/intelcpu/0/temperature/99', name: 'Disconnected CPU sensor', group: 'cpu', unit: '°C' });
        send('stats:preferences', { ...preferences, revision: 2, selected: [core, ...selected], wide: [core.id],
          series: [{ id: core.id, readings: extras }] });
        const series = await devtools.sendCommand('Runtime.evaluate', {
          expression: '(' + inspectChartSeries.toString() + ')()', returnByValue: true, awaitPromise: true,
        });
        if (series.result?.value !== true) throw new Error('Stats did not render the configured CPU chart series');
        send('stats:preferences', { ...preferences, revision: 3, selected: null, wide: null });
        log('CPU Core Max, CPU watts, clock, and an unavailable chart series verified.');
      }
      if (opts.previewFrames) {
        const directory = path.resolve(opts.previewFrames);
        await captureDemo({ devtools, send, directory, width, height, shortcutPack: opts.previewPack, toolView: opts.previewToolView });
        log('Preview frames saved to', directory);
      } else {
        if (opts.previewToolView) await openPreviewTools(devtools);
        if (opts.previewToolView === 'break') await startPreviewBreak(devtools);
        const out = path.resolve(opts.preview);
        await capturePreview(devtools, out, width, height);
        log('Preview saved to', out);
      }
      quit();
    } catch (err) {
      fail(err);
    } finally {
      clearTimeout(deadline);
    }
  });

  await win.loadFile(renderer, { query: opts.states ? { demo: 'states' } : {} });
}

module.exports = { startPreview, verifyPreviewSwipe, verifyPreviewFaders };
