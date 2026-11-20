// @ts-check
'use strict';

const { toView } = require('../shared/deck-view');
const { normalizeAppearance, THEMES: APPEARANCE_THEMES, TEXT_SCALES } = require('../shared/appearance');
const { embeddedImageDataUrl, lucideIcon } = require('./icons');
const { describeLayoutView } = require('./mcp-layout');
const { comparePreviewLayout, comparisonOutput } = require('./mcp-preview-diff');
const { appViewPreview } = require('./mcp-app-view-drafts');
const { VIEW_GRID } = require('../shared/widget-layout');

const MAX_IMAGE_BASE64 = 176 * 1024;
const MAX_RESULT_BYTES = 232 * 1024;
const MAX_EMBEDDED_BYTES = 512 * 1024;
const MAX_TILES = 112;
const THEMES = Object.keys(APPEARANCE_THEMES).filter((theme) => theme !== 'system');
const VIEWS = ['keys', 'dashboard', 'stats', 'apps'];
const LIVE_READINGS = ['audio', 'telemetry'];
const liveReadingSelection = { type: 'array', items: { enum: LIVE_READINGS }, uniqueItems: true, maxItems: LIVE_READINGS.length };
const DRAFT_PATTERN = '^[a-f0-9]{24}$';
const PAGE_PATTERN = '^[a-zA-Z0-9_-]{1,40}$';
const viewport = { width: 2560, height: 720 };

const visualPreviewInput = {
  type: 'object', required: ['draft', 'revision'], additionalProperties: false,
  properties: {
    draft: { type: 'string', pattern: DRAFT_PATTERN }, revision: { type: 'integer', minimum: 1 },
    view: { enum: VIEWS },
    page: { type: 'string', pattern: PAGE_PATTERN }, portrait: { type: 'boolean' },
    sheet: { type: 'integer', minimum: 0 }, theme: { enum: THEMES },
    textScale: { enum: TEXT_SCALES }, highContrast: { type: 'boolean' }, compareCurrent: { type: 'boolean' },
    liveReadings: liveReadingSelection,
  },
};
const number = { type: 'number' };
const count = { type: 'integer', minimum: 0 };
const flag = { type: 'boolean' };
const dimensions = { width: count, height: count };
const tile = {
  id: { type: 'string' }, kind: { enum: ['key', 'widget', 'stack', 'panel'] },
  surface: { enum: ['deck', 'bar', 'dashboard', 'stats', 'apps'] }, fixed: flag,
  x: number, y: number, width: number, height: number, clipped: flag, textOverflow: flag, smallTargets: count,
  unnamedControls: count, contrast: { type: ['number', 'null'] },
};
const object = (required, optional) => ({ type: 'object', properties: { ...required, ...optional }, required: Object.keys(required), additionalProperties: false });
const visualPreviewOutput = object({
  draft: { type: 'string' }, revision: count, page: { type: 'string' }, sheet: count, sheets: count,
  readings: { enum: ['fixture', 'live'] }, orientation: { enum: ['landscape', 'portrait'] }, redacted: flag,
  appearance: object({ theme: { enum: THEMES }, textScale: { enum: TEXT_SCALES }, highContrast: flag }),
  viewport: object(dimensions), grid: object({ cols: count, rows: count }),
  tiles: { type: 'array', items: object(tile), maxItems: MAX_TILES },
  checks: object({ viewportOverflow: flag, clippedTiles: count, overflowingTiles: count, smallTargets: count,
    unnamedControls: count, lowContrastTiles: count, unmeasuredContrastTiles: count, omittedTiles: count }),
  image: object({ ...dimensions, mimeType: { const: 'image/jpeg' } }),
}, { comparison: comparisonOutput, view: { enum: VIEWS.slice(1) }, liveReadings: liveReadingSelection });

class VisualPreviewError extends Error {}

function visualPreviewParams(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some((key) => !Object.hasOwn(visualPreviewInput.properties, key))) {
    throw new VisualPreviewError('Choose only supported visual preview options.');
  }
  const { draft, revision, view = 'keys', page, sheet = 0, portrait = false, theme = 'dark', textScale = 100,
    highContrast = false, compareCurrent = false, liveReadings = [] } = value;
  if (typeof draft !== 'string' || !new RegExp(DRAFT_PATTERN).test(draft)
      || !Number.isSafeInteger(revision) || revision < 1
      || (page !== undefined && (typeof page !== 'string' || !new RegExp(PAGE_PATTERN).test(page)))
      || !Number.isSafeInteger(sheet) || sheet < 0 || typeof portrait !== 'boolean'
      || !VIEWS.includes(view) || !THEMES.includes(theme) || !TEXT_SCALES.includes(textScale)
      || typeof highContrast !== 'boolean' || typeof compareCurrent !== 'boolean') {
    throw new VisualPreviewError('Choose a draft revision, view, page, sheet and appearance supported by the visual preview.');
  }
  if (view !== 'keys' && (sheet !== 0 || compareCurrent)) {
    throw new VisualPreviewError('Choose Deck Keys to select a different sheet or compare the saved layout.');
  }
  if (view === 'apps' && page !== undefined) throw new VisualPreviewError('Choose the app-view draft itself without a page.');
  if (!Array.isArray(liveReadings) || liveReadings.some((source) => !LIVE_READINGS.includes(source))
      || new Set(liveReadings).size !== liveReadings.length) {
    throw new VisualPreviewError('Choose each supported live reading source at most once.');
  }
  return { draft, revision, view, page, sheet, portrait, theme, textScale, highContrast, compareCurrent, liveReadings };
}

function redactView(view) {
  const groups = new Map();
  const safeKey = (key, index, prefix = '') => {
    if (!key) return null;
    const { id, label, image, shortcut, unavailable, controlId, sceneTarget, group, ...visual } = key;
    if (group && !groups.has(group)) groups.set(group, `Group ${groups.size + 1}`);
    return { ...visual, id: `${prefix}key-${index + 1}`, label: `Key ${index + 1}`,
      ...(group ? { group: groups.get(group) } : {}), ...(unavailable ? { unavailable: 'Unavailable' } : {}) };
  };
  const safeWidgets = (widgets) => {
    const stacks = new Map();
    return widgets.map((widget, index) => {
      const { id, settings, stackId, tabLabel, ...placement } = widget;
      if (stackId && !stacks.has(stackId)) stacks.set(stackId, `stack-${stacks.size + 1}`);
      const configuration = settings.composition;
      return { ...placement, id: `widget-${index + 1}`, ...(stackId ? { stackId: stacks.get(stackId) } : {}),
        ...(tabLabel ? { tabLabel: `Tab ${index + 1}` } : {}),
        settings: configuration ? { composition: { ...configuration, name: 'Composition',
          parts: configuration.parts.map((part, pos) => part.type === 'text'
            ? { ...part, id: `part-${pos + 1}`, text: 'Sample text' } : { ...part, id: `part-${pos + 1}` }),
        } } : widget.type === 'decision' ? {} : settings.sensorId ? { ...settings, sensorId: 'lhm:/fixture/0/temperature/0' } : settings };
    });
  };
  return { ...view, name: 'Draft', slots: view.slots.map((key, index) => safeKey(key, index)), widgets: safeWidgets(view.widgets),
    bar: { keys: view.bar.keys.map((key, index) => safeKey(key, index, 'bar:')), widgets: safeWidgets(view.bar.widgets) } };
}

function buildVisualPreview(draft, options) {
  const appView = options.view === 'apps' ? appViewPreview(draft.view) : null;
  const profile = appView ? {
    name: appView.name, grid: VIEW_GRID, pages: [{ id: appView.id, name: appView.name, keys: [], widgets: [] }],
  } : draft.profile;
  const { page, portrait, sheet, theme, textScale, highContrast } = options;
  const panel = options.view === 'keys' ? null : options.view;
  const selected = page === undefined ? profile.pages[0] : profile.pages.find(({ id }) => id === page);
  if (!selected) throw new VisualPreviewError('The requested draft page is unavailable.');
  const redacted = draft.baseToken !== undefined;
  let assetBudget = MAX_EMBEDDED_BYTES;
  const approvedAssets = new Set();
  const image = (value) => {
    if (redacted || typeof value !== 'string' || value.length > MAX_EMBEDDED_BYTES) return null;
    if (approvedAssets.has(value)) return value;
    const source = embeddedImageDataUrl(value);
    if (!source || source.length > assetBudget) return null;
    assetBudget -= source.length;
    approvedAssets.add(source);
    return source;
  };
  const sourceView = toView(profile, { page: panel ? { ...selected, keys: [], widgets: [], generated: false } : selected,
    image, icon: lucideIcon, ...(panel ? { editingKeys: [] } : {}) });
  const pages = profile.pages.map(({ id, name }, index) => redacted ? { id: `page-${index + 1}`, name: `Page ${index + 1}` } : { id, name });
  const pageId = pages[profile.pages.indexOf(selected)].id;
  const view = { ...(redacted ? redactView(sourceView) : sourceView), page: pageId, pages,
    revision: draft.revision, editorActive: true, editorLayout: false, deckSheet: sheet,
    ...(panel ? { deckView: panel, locale: 'en-GB' } : {}), ...(appView ? { appView } : {}) };
  const layout = describeLayoutView(view, pageId, portrait);
  if (!layout.sheets[sheet]) throw new VisualPreviewError('The requested sheet is unavailable in this orientation.');
  for (const widget of [...view.widgets, ...view.bar.widgets]) {
    for (const svg of Object.values(widget.icons ?? {}).filter(Boolean)) {
      approvedAssets.add(`data:image/svg+xml,${encodeURIComponent(svg)}`);
    }
  }
  if (appView) layout.grid = VIEW_GRID;
  return { view, panel, assets: [...approvedAssets], layout, redacted, width: portrait ? viewport.height : viewport.width,
    height: portrait ? viewport.width : viewport.height, appearance: normalizeAppearance({ theme, textScale, highContrast }) };
}

function previewImageContent(value) {
  const { imageData, ...summary } = value;
  return { summary, image: { type: 'image', mimeType: summary.image.mimeType, data: imageData } };
}

class AgentVisualPreview {
  constructor({ drafts, render, readCurrent, readLive }) {
    this.drafts = drafts;
    this.render = render;
    this.readCurrent = readCurrent;
    this.readLive = readLive;
    this.busy = false;
  }

  async preview(owner, activity, input, authorized = () => true, hasScope = (_scope) => false) {
    const options = visualPreviewParams(input);
    const { draft, revision, sheet, theme, textScale, highContrast, compareCurrent, view, liveReadings } = options;
    const kind = view === 'apps' ? 'app-view' : 'profile';
    const record = this.drafts.resolve(owner, activity, draft, revision, kind);
    if (!authorized()) throw new VisualPreviewError('Visual preview access expired.');
    if (compareCurrent && !hasScope('layout')) throw new VisualPreviewError('Comparing the saved layout requires the Deck layout grant.');
    if (!liveReadings.every(hasScope)) throw new VisualPreviewError('Live preview requires the read grant for each selected source.');
    if (liveReadings.length && !this.readLive) throw new VisualPreviewError('Live preview readings are unavailable.');
    if (this.busy) throw new VisualPreviewError('A visual preview is already rendering. Try again shortly.');
    this.busy = true;
    try {
      const plan = buildVisualPreview(record, options);
      const saved = compareCurrent ? this.savedLayout() : null;
      const comparison = saved && comparePreviewLayout(record, plan, options, saved);
      if (liveReadings.length) plan.readings = this.readLive(liveReadings, view);
      const { inspection, image, imageData } = await this.render(plan);
      if (!authorized()) throw new VisualPreviewError('Visual preview access expired.');
      if (!liveReadings.every(hasScope)) throw new VisualPreviewError('Live preview reading access expired.');
      this.drafts.resolve(owner, activity, draft, revision, kind);
      if (saved) {
        if (!hasScope('layout')) throw new VisualPreviewError('Saved layout access expired.');
        if (saved.token !== this.savedLayout().token) throw new VisualPreviewError('The saved layout changed during this preview. Try again.');
      }
      const result = { draft, revision, page: plan.view.page, sheet, sheets: plan.layout.sheets.length,
        readings: liveReadings.length ? 'live' : 'fixture',
        ...(liveReadings.length ? { liveReadings } : {}),
        orientation: plan.layout.orientation, redacted: plan.redacted, appearance: { theme, textScale, highContrast },
        viewport: { width: plan.width, height: plan.height }, grid: plan.layout.grid, ...inspection, image, imageData,
        ...(comparison ? { comparison } : {}), ...(plan.panel ? { view: plan.panel } : {}) };
      if (imageData.length > MAX_IMAGE_BASE64 || Buffer.byteLength(JSON.stringify(result)) > MAX_RESULT_BYTES) {
        throw new VisualPreviewError('The preview exceeds the local response size limit.');
      }
      return result;
    } finally {
      this.busy = false;
    }
  }

  savedLayout() {
    const saved = this.readCurrent?.();
    if (!saved?.profile || saved.warning || typeof saved.token !== 'string') {
      throw new VisualPreviewError('The saved layout is unavailable.');
    }
    return saved;
  }
}

module.exports = { AgentVisualPreview, VisualPreviewError, visualPreviewInput, visualPreviewOutput, visualPreviewParams,
  previewImageContent, buildVisualPreview, MAX_IMAGE_BASE64, MAX_RESULT_BYTES, MAX_TILES };
