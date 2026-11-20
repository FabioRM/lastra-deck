// @ts-check
'use strict';

// Offscreen preview for `--preview=<png>`: renders the deck with sample readings into a 2560×720
// (or portrait) virtual viewport, optionally runs a touch or layout check, saves a screenshot and quits.
// It never touches audio, input, or the user's profile files beyond reading them.

const fs = require('node:fs');
const path = require('node:path');
const { ProfileStore, validateProfile } = require('./profile');
const { DEFAULT_APPEARANCE } = require('./deck-appearance');
const { packs } = require('./shortcut-packs');
const { webPacks, chromiumWebAppId } = require('./shortcut-packs-web');
const { StatsMonitor } = require('./stats');

const RENDER_TIMEOUT_MS = 12000;

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
  ipcMain.handle('profile:get', () => deck.currentView());
  let previewPresses = 0;
  ipcMain.handle('key:press', () => {
    previewPresses++;
    return { ok: true, message: null };
  });
  ipcMain.handle('page:select', (_event, id) => {
    pages.select(store.current, id);
    deck.refreshPage();
  });
  ipcMain.handle('page:repaginate', (_event, sheet) => deck.repaginatePage(sheet));
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
  const stats = opts.stats ? previewStats({ sample, history, verify: opts.verifyStats }) : null;
  if (stats) {
    deck.setStats(stats);
    stats.snapshot();
    ipcMain.handle('stats:read', () => stats.snapshot());
    ipcMain.handle('stats:stop', () => stats.stop());
    ipcMain.handle('stats:tab', () => {});
    ipcMain.handle('stats:incidents', () => ({ ok: true, timeline: { events: [], dashboard: null } }));
    ipcMain.handle('view:set', () => {});
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
  const deadline = setTimeout(() => fail(new Error('Timed out rendering the preview')), RENDER_TIMEOUT_MS);

  ipcMain.once('renderer:ready', async () => {
    try {
      send('deck:appearance', { ...DEFAULT_APPEARANCE, largeKeys: opts.previewLargeKeys === true });
      win.setContentSize(width + 1, height + 1);
      devtools.attach();
      await devtools.sendCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      send('sensors', { ...sample, history: history.series });
      send('audio', previewAudio);
      await new Promise((r) => setTimeout(r, 1000));
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
      if (opts.verifyStats) {
        const { inspectStatsLayout, inspectCustomOverview } = require('./stats-preview');
        const check = await devtools.sendCommand('Runtime.evaluate', {
          expression: '(' + inspectStatsLayout.toString() + ')()', returnByValue: true,
        });
        if (check.exceptionDetails) throw new Error(check.exceptionDetails.exception?.description ?? 'Stats verification failed');
        log('Stats preview verified:', check.result.value);
        const { overview } = stats.snapshot({ refresh: false });
        const selected = ['gpu', 'cpu', 'ram'].map((id) => overview.find((item) => item.id === id));
        const preferences = { layout: 'cards', style: 'line' };
        send('stats:preferences', { ...preferences, revision: 1, selected, wide: ['gpu'] });
        const arranged = await devtools.sendCommand('Runtime.evaluate', {
          expression: '(' + inspectCustomOverview.toString() + ')()', returnByValue: true, awaitPromise: true,
        });
        if (arranged.result?.value !== true) throw new Error('Custom Stats card order or width did not match the preferences');
        send('stats:preferences', { ...preferences, revision: 2, selected: null, wide: null });
        log('Custom Stats card order and widths verified.');
      }
      const { data } = await devtools.sendCommand('Page.captureScreenshot', {
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height, scale: 1 },
      });
      const out = path.resolve(opts.preview);
      fs.writeFileSync(out, Buffer.from(data, 'base64'));
      log('Preview saved to', out);
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
