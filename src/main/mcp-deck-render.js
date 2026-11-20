// @ts-check
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { previewAssetPath, servePreviewAssets } = require('./preview-protocol');
const { MAX_IMAGE_BASE64, MAX_TILES, VisualPreviewError } = require('./mcp-visual-preview');

const FRAME_URL = 'lastra-preview://deck/src/renderer/index.html?editor-preview=1';
const DEADLINE_MS = 3_200;

function previewRequestAllowed(url, root, shell, assets) {
  return url === shell || assets.has(url) || Boolean(previewAssetPath(url, root));
}

function waitForPaint(panel, liveAudio) {
  function ready() {
    if (panel === 'dashboard') {
      const meters = [.../** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#dashboard-signal [data-peak]'))];
      return document.getElementById('dashboard-track').textContent === 'Sample track'
        && meters.length > 0 && meters.every((meter) => liveAudio ? meter.dataset.signalState : meter.dataset.signalState === 'active');
    }
    if (panel === 'stats') return document.querySelectorAll('#stats-readings .stats-card').length === 7;
    if (panel === 'apps') return Boolean(document.querySelector('#app-views-panel:not([hidden]) #app-view-detail:not([hidden]) #app-view-title')?.textContent);
    return true;
  }
  return document.fonts.ready.then(() => new Promise((resolve) => {
    function frame() {
      if (ready()) requestAnimationFrame(() => resolve(true));
      else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }));
}

// This runs inside the bundled preview frame, independently of the live renderer bridge.
function inspectDeck(limit, panel) {
  if (!panel && !document.getElementById('keys')?.style.getPropertyValue('--key')) return null;
  if (panel === 'apps' && (document.getElementById('app-views-panel').hidden || document.getElementById('app-view-detail').hidden)) return null;
  if (panel && panel !== 'apps' && (document.getElementById(panel + '-panel')?.hidden
    || !document.getElementById(panel + '-time')?.textContent)) return null;
  const viewportWidth = innerWidth;
  const viewportHeight = innerHeight;
  const round = (value) => Math.round(value * 10) / 10;
  const rgba = (color) => {
    const components = color.match(/^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)$/);
    return components && Number(components[4] ?? 1) === 1 ? components.slice(1, 4).map(Number) : null;
  };
  const luminance = (color) => color.map((value) => value / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
  const ratio = (color, background) => (Math.max(color, background) + 0.05) / (Math.min(color, background) + 0.05);
  function contrast(label, tile) {
    if (!label || tile.matches('[aria-disabled="true"]') || getComputedStyle(tile).opacity !== '1') return null;
    const text = rgba(getComputedStyle(label).color);
    if (!text) return null;
    const color = luminance(text);
    for (let ancestor = label; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (style.backgroundImage !== 'none') {
        if (!style.backgroundImage.startsWith('linear-gradient(')) return null;
        const stops = Array.from(style.backgroundImage.matchAll(/rgba?\([^)]*\)/g), ([stop]) => rgba(stop));
        if (stops.length < 2 || stops.some((stop) => !stop)) return null;
        const values = stops.map(luminance);
        // Intermediate gradient colors can cross the foreground luminance.
        if (Math.min(...values) < color && color < Math.max(...values)) return 1;
        return Math.min(...values.map((value) => ratio(color, value)));
      }
      const solid = rgba(style.backgroundColor);
      if (solid) return ratio(color, luminance(solid));
      if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') return null;
    }
    return null;
  }
  const visible = (node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  const named = (node) => Boolean(node.getAttribute('aria-label')?.trim()
    || node.getAttribute('aria-labelledby')?.trim().split(/\s+/).some((id) => document.getElementById(id)?.textContent.trim())
    || (node.labels && Array.from(node.labels).some((label) => label.textContent.trim()))
    || node.textContent.trim() || node.getAttribute('title')?.trim());
  const entries = [];
  function inspectNode(node, { id, kind, surface, fixed, labels: labelSelector, controls }) {
    const bounds = node.getBoundingClientRect();
    const scrollBounds = surface === 'apps' ? node.closest('#app-view-detail')?.getBoundingClientRect() : null;
    const labels = [node, ...node.querySelectorAll(labelSelector)].filter((label) => label.matches(labelSelector))
      .filter((label) => visible(label) && (kind !== 'panel' || label.textContent.trim()));
    const textContrast = labels.map((label) => contrast(label, node)).filter((value) => value !== null);
    const textOverflow = labels.some((label) => {
      const wide = label.scrollWidth > label.clientWidth + 1;
      const tall = label.scrollHeight > label.clientHeight + 1;
      if (kind !== 'panel') return wide || tall;
      const { overflowX, overflowY } = getComputedStyle(label);
      return (wide && overflowX !== 'visible') || (tall && overflowY !== 'visible');
    });
    entries.push({ id, kind, surface, fixed, x: round(bounds.x), y: round(bounds.y),
      width: round(bounds.width), height: round(bounds.height),
      clipped: bounds.left < -0.5 || bounds.top < -0.5 || bounds.right > viewportWidth + 0.5 || bounds.bottom > viewportHeight + 0.5
        || Boolean(scrollBounds && (bounds.top < scrollBounds.top - 0.5 || bounds.bottom > scrollBounds.bottom + 0.5)),
      textOverflow,
      smallTargets: controls.filter((control) => {
        const { width, height } = control.getBoundingClientRect();
        return width < 44 || height < 44;
      }).length,
      unnamedControls: controls.filter((control) => !named(control)).length,
      contrast: textContrast.length ? Math.round(Math.min(...textContrast) * 100) / 100 : null,
    });
  }
  const widgetSurfaces = [['bar', '#widget-bar']];
  if (panel === 'apps') widgetSurfaces.push(['apps', '#app-view-widgets']);
  else if (!panel) widgetSurfaces.unshift(['deck', '#keys']);
  for (const [surface, selector] of widgetSurfaces) {
    for (const node of /** @type {NodeListOf<HTMLElement>} */ (
      document.querySelectorAll(`${selector} .key[data-id], ${selector} [data-widget-id], ${selector} [data-widget-stack]`))) {
      if (!visible(node)) continue;
      const { id, widgetId, widgetStack } = node.dataset;
      const controls = id ? [node] : Array.from(node.querySelectorAll('button, input, [role="button"], [role="slider"]'))
        .filter((control) => visible(control) && control.closest('[data-widget-id], [data-widget-stack]') === node);
      inspectNode(node, { id: id ?? widgetId ?? widgetStack, kind: id ? 'key' : widgetId ? 'widget' : 'stack', surface,
        fixed: Boolean(node.closest('[data-fixed-editing]')), controls,
        labels: '.label, .widget-title, .widget-source, .widget-stack-active, .composition-part[data-kind="text"]' });
    }
  }
  if (panel === 'apps') {
    const header = document.querySelector('.app-views-header');
    const title = document.getElementById('app-view-title');
    const summary = document.getElementById('app-view-summary');
    const parts = [['app-header', header], ['app-title', title], ['app-summary', summary],
      ...Array.from(/** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('[data-app-command]')),
        (node) => ['command-' + node.dataset.appCommand, node])];
    for (const [id, node] of /** @type {[string, Element][]} */ (parts)) {
      if (!visible(node) || !node.textContent.trim()) continue;
      const controls = node.matches('button') ? [node] : Array.from(node.querySelectorAll('button')).filter(visible);
      inspectNode(node, { id, kind: 'panel', surface: 'apps', fixed: false, labels: 'h2, h3, p, button', controls });
    }
  } else if (panel) {
    const dashboard = panel === 'dashboard';
    const common = [['deck-audio', '#deck-audio-controls'], ['change-view', '#dashboard-switch'], ['home', '#home-page']];
    const sections = dashboard
      ? [['dashboard-header', '.dashboard-header'], ['calendar', '#dashboard-calendar-card'], ['now-playing', '.dashboard-media'], ...common]
      : [['stats-header', '.stats-header'], ['stats-layout', '#stats-layout-control'], ['stats-history', '#stats-history-control'], ...common];
    if (dashboard && document.getElementById('dashboard-track').textContent !== 'Sample track') return null;
    const parts = /** @type {[string, Element][]} */ (sections.map(([id, selector]) => [id, document.querySelector(selector)]));
    if (!dashboard) {
      const readings = Array.from(document.querySelectorAll('.stats-card'));
      if (readings.length !== 7) return null;
      readings.forEach((node, index) => parts.push(['stat-' + (index + 1), node]));
    }
    const labels = dashboard
      ? '.dashboard-clock time, #dashboard-track, #dashboard-artist, #dashboard-album, #dashboard-source, #dashboard-playback, .dashboard-calendar-title, .dashboard-calendar-weekday, .dashboard-calendar-day, .audio-signal span'
      : '.stats-clock time, .stats-group, .stats-label, .stats-device, .stats-value, .stats-unit, .stats-source, .stats-scale, .stats-freshness summary';
    for (const [id, node] of parts) {
      if (!node || !visible(node)) continue;
      const targets = 'button, input, select, summary, [role="button"], [role="slider"]';
      const controls = node.matches(targets) ? [node] : Array.from(node.querySelectorAll(targets)).filter(visible);
      inspectNode(node, { id, kind: 'panel', surface: panel, fixed: false, labels, controls });
    }
  }
  return { width: viewportWidth, height: viewportHeight, tiles: entries.slice(0, limit), checks: {
    viewportOverflow: document.documentElement.scrollWidth > viewportWidth || document.documentElement.scrollHeight > viewportHeight,
    clippedTiles: entries.filter((tile) => tile.clipped).length, overflowingTiles: entries.filter((tile) => tile.textOverflow).length,
    smallTargets: entries.reduce((sum, tile) => sum + tile.smallTargets, 0),
    unnamedControls: entries.reduce((sum, tile) => sum + tile.unnamedControls, 0),
    lowContrastTiles: entries.filter((tile) => tile.contrast !== null && tile.contrast < 4.5).length,
    unmeasuredContrastTiles: entries.filter((tile) => tile.contrast === null).length, omittedTiles: Math.max(entries.length - limit, 0),
  } };
}

async function renderLayout(web, debuggerApi, nativeImage, plan, frameUrl) {
  const { width, height, appearance, view, layout, panel, readings } = plan;
  await debuggerApi.sendCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await web.executeJavaScript(`new Promise((resolve) => {
    const frame = document.querySelector('iframe');
    frame.addEventListener('load', () => resolve(true), { once: true });
    frame.src = ${JSON.stringify(frameUrl)};
  })`);
  const frame = web.mainFrame.frames.find((entry) => entry.url === frameUrl);
  if (!frame) throw new VisualPreviewError('The bundled deck preview did not open.');
  const message = JSON.stringify({ type: 'lastra:editor-preview', appearance, view, readings });
  await web.executeJavaScript(`document.querySelector('iframe').contentWindow.postMessage(${message}, '*')`);
  await frame.executeJavaScript(`(${waitForPaint.toString()})(${JSON.stringify(panel)}, ${Boolean(readings?.audio)})`);
  const observed = await frame.executeJavaScript(`(${inspectDeck.toString()})(${MAX_TILES}, ${JSON.stringify(panel)})`);
  const selected = layout.sheets[view.deckSheet];
  const expected = panel ? [[layout.bar, 'bar']] : [[selected, 'deck'], [layout.bar, 'bar']];
  if (!observed || observed.width !== width || observed.height !== height
      || expected.some(([surface, type]) => surface.keys.some(({ id }) =>
        !observed.tiles.some((tile) => tile.kind === 'key' && tile.surface === type && tile.id === id)))) {
    throw new VisualPreviewError('The bundled deck did not render the requested view, orientation or sheet.');
  }
  const { tiles, checks } = observed;
  for (const [scale, quality] of [[0.5, 80], [0.375, 68], [0.25, 58]]) {
    const { data } = await debuggerApi.sendCommand('Page.captureScreenshot', {
      format: 'jpeg', quality, fromSurface: true, clip: { x: 0, y: 0, width, height, scale },
    });
    if (data.length > MAX_IMAGE_BASE64) continue;
    const decoded = nativeImage.createFromBuffer(Buffer.from(data, 'base64'));
    const size = decoded.getSize();
    if (size.width !== width * scale || size.height !== height * scale) {
      throw new VisualPreviewError('The captured preview has unexpected dimensions.');
    }
    return { inspection: { tiles, checks }, image: { ...size, mimeType: 'image/jpeg' }, imageData: data };
  }
  throw new VisualPreviewError('The preview image exceeds the local response size limit.');
}

function createAgentDeckRenderer({ BrowserWindow, session, net, nativeImage, root }) {
  const shell = pathToFileURL(path.join(root, 'src', 'agent-preview', 'index.html')).href;
  let previewSession;
  let approvedAssets = new Set();

  return async function render(plan) {
    if (!previewSession) {
      previewSession = session.fromPartition('lastra-agent-visual-preview', { cache: false });
      servePreviewAssets(previewSession.protocol, net, root);
      previewSession.webRequest.onBeforeRequest(({ url, method }, callback) => {
        let allowed = false;
        try { allowed = method === 'GET' && previewRequestAllowed(url, root, shell, approvedAssets); }
        catch { /* Invalid URLs get no access to the static preview partition. */ }
        callback({ cancel: !allowed });
      });
      previewSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      previewSession.setPermissionCheckHandler(() => false);
      previewSession.on('will-download', (event) => event.preventDefault());
    }
    approvedAssets = new Set(plan.assets);
    const window = new BrowserWindow({ show: false, width: plan.width, height: plan.height, useContentSize: true,
      webPreferences: { session: previewSession, offscreen: true, backgroundThrottling: false, sandbox: true,
        contextIsolation: true, nodeIntegration: false, spellcheck: false } });
    const web = window.webContents;
    const frameUrl = plan.panel ? `${FRAME_URL}&panel-preview=${plan.panel}` : FRAME_URL;
    web.setWindowOpenHandler(() => ({ action: 'deny' }));
    web.on('will-navigate', (event) => event.preventDefault());
    web.on('will-frame-navigate', (event) => {
      if (event.url !== frameUrl) event.preventDefault();
    });
    // See the CLI preview: resize the actual renderer before applying virtual screen metrics.
    window.setContentSize(plan.width + 1, plan.height + 1);
    let timer;
    try {
      web.debugger.attach('1.3');
      const capture = async () => {
        await window.loadURL(shell);
        return renderLayout(web, web.debugger, nativeImage, plan, frameUrl);
      };
      return await Promise.race([capture(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new VisualPreviewError('The offscreen deck preview timed out.')), DEADLINE_MS);
      })]);
    } catch (error) {
      if (error instanceof VisualPreviewError) throw error;
      throw new VisualPreviewError('The offscreen deck preview is unavailable.', { cause: error });
    } finally {
      clearTimeout(timer);
      approvedAssets = new Set();
      if (!window.isDestroyed()) window.destroy();
    }
  };
}

module.exports = { createAgentDeckRenderer, previewRequestAllowed };
