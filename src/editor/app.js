'use strict';

const { element: node, button } = window.LastraDom;
const api = window.lastraEditor;
const { t } = window.LastraI18n;
const workspace = document.getElementById('workspace');
const profileFields = document.getElementById('profile-fields');
const pageFields = document.getElementById('page-fields');
const pageSettings = document.getElementById('page-settings');
const pageHeading = document.getElementById('editor-page-name');
const pageSize = document.getElementById('editor-page-size');
const pageActions = document.getElementById('page-actions');
const profileHeading = document.getElementById('editor-profile-name');
const pages = document.getElementById('pages');
const slots = document.getElementById('slots');
const selectGroup = document.getElementById('select-key-group');
const pasteGroup = document.getElementById('paste-key-group');
const inspector = document.getElementById('inspector');
const status = document.getElementById('status');
const agentDraftOffer = document.getElementById('agent-draft-offer');
const agentDraftOpen = document.getElementById('agent-draft-open');
const editorMenu = document.querySelector('.editor-menu');
const save = document.getElementById('save');
const reload = document.getElementById('reload');
const undo = document.getElementById('undo');
const redo = document.getElementById('redo');
const addPage = document.getElementById('add-page');
const templateButton = document.getElementById('profile-templates-open');
const backups = document.getElementById('backups');
const importExchange = document.getElementById('import-exchange');
const exportExchange = document.getElementById('export-exchange');
const liveVariables = document.getElementById('open-live-variables');
const inspectLiveVariables = window.createLastraLiveVariables(document.getElementById('live-variables'), () => api.previewLive('draft'));
const exchange = window.createProfileExchange(document.getElementById('profile-exchange'), api, planExchangeImport);
const backupsDialog = document.getElementById('profile-backups');
const backupVersions = document.getElementById('backup-versions');
const backupStatus = document.getElementById('backup-status');
const closeBackups = document.getElementById('close-backups');
const editHistory = new window.EditorHistory();
const fieldRegions = [profileFields, pageFields, inspector];
const fieldSelector = 'input, textarea, select';

const paletteDialog = document.getElementById('action-palette');
const { actionNames: actionTypes, createActionPalette } = window.lastraActionPalette;
const openActionPalette = createActionPalette(paletteDialog);
const openKeyTest = window.createLastraKeyTest(document.getElementById('key-test'), api.testAction);
const openImageLibrary = window.createImageLibrary(document.getElementById('image-library'), api);
const openTemplates = window.createTemplatePicker(document.getElementById('profile-templates'), api.profileTemplates, addTemplatePages);
const widgetDialog = document.getElementById('widget-picker');
const { BAR_GRID, catalog: widgetCatalog, cells: widgetCells, occupiedCells, canPlace, keyLayout, remapKeys, findPosition,
  sameWidgetLayout, groupWidgetPlacements, widgetTabLabel } = window.LastraWidgetLayout;
const { captureKeyGroup, placeKeyGroup, findKeyGroupPosition, keyGroupMoves, applyKeyAppearance } = window.LastraKeyGroups;
const { FIXED_EDITING_KEYS, duplicateEditingKey, projectEditingPage } = window.LastraEditingKeys;
const { planGridResize } = window.LastraGridResize;
const { shortcutRows, filterShortcutRows, withShortcutOverride, captureShortcut, shortcutGuardForAction,
  MAX_WEB_APP_MANIFESTS } = window.LastraShortcutLibrary;
const { MAX_CONTROLS, linkedControl, controlFromKey, linkKey, detachKey,
  clipboardControls, countPlacements, canRepeatTap } = window.LastraLinkedControls;
const { createMacroResolver, actionValueType } = window.LastraParameterizedMacros;
const { createExpressionScope, isExpression } = window.LastraValueExpressions;
const { createProfileKeys } = window.LastraProfileKeys;
const openMacroLibrary = window.createLastraMacroLibrary(document.getElementById('macro-library'));
const openExpressionEditor = window.createLastraExpressionEditor(document.getElementById('expression-editor'));
const BAR_PAGE_ID = 'bar:';
const openWidgetEditor = window.createLastraWidgetEditor(widgetDialog);
const packDialog = document.getElementById('shortcut-packs');
const packChoice = document.getElementById('shortcut-pack-choice');
const shortcutSearch = document.getElementById('shortcut-search');
const shortcutPlatform = document.getElementById('shortcut-platform');
const shortcutContext = document.getElementById('shortcut-context');
const shortcutDetail = document.getElementById('shortcut-detail');
const packKeys = document.getElementById('shortcut-pack-keys');
const packStatus = document.getElementById('shortcut-pack-status');
const packCopy = document.getElementById('copy-shortcut-pack');
const packWebApp = document.getElementById('shortcut-web-app');
const packManifest = document.getElementById('shortcut-manifest');
const packAttach = document.getElementById('attach-shortcut-web-app');
const packWebApps = document.getElementById('shortcut-web-apps');
const shortcutPageEditor = window.createShortcutPageEditor(document.getElementById('shortcut-page-config'), {
  read: (pack) => draft?.shortcutLayouts?.[pack],
  write(pack, layout) {
    const next = window.LastraShortcutLayouts.validateShortcutLayouts({ ...draft.shortcutLayouts, [pack]: layout });
    edit(() => { draft.shortcutLayouts = next; });
  },
  updated() {
    const row = catalogRows.find((item) => shortcutIdentity(item) === selectedShortcut);
    if (!shortcutDetail.hidden && row) renderShortcutDetail({ ...row, key: withShortcutOverride(row.key, draft.shortcutOverrides) });
  },
});
let availablePacks = [];
let catalogRows = [];
let selectedShortcut;
let packIcons = {};
const livePreview = window.createLastraEditorPreview(document.getElementById('live-preview'), {
  readAsset: api.previewAsset, readLive: api.previewLive, applyLayout: applyPreviewLayout,
});
let largeKeys = false;
window.bindLastraAppearance(api, (settings) => {
  livePreview.setAppearance(settings);
  if (largeKeys === settings.largeKeys) return;
  largeKeys = settings.largeKeys;
  refreshProfileGrid?.();
  refreshPageGrid?.();
});
const mediaKeys = {
  playpause: 'Play / pause', next: 'Next', prev: 'Previous', stop: 'Stop',
  mute: 'Mute', volup: 'Volume up', voldown: 'Volume down',
};
const categories = { app: 'App', media: 'Media', system: 'System', meeting: 'Meetings' };
let draft;
let profileActivity;
let draftText = '';
let token;
let pageId;
let selected = 0;
let groupSelection = null;
let dirty = false;
let busy = false;
let pendingAgentDraft;
let diskWarning = null;
let dragSource = null;
let gestureOptions = {};
let refreshProfileGrid;
let refreshPageGrid;
let inspectorTab = 'actions';
const slotIcons = new Map();

function field(label, control) {
  const wrapper = node('label', 'field', label);
  wrapper.append(control);
  return wrapper;
}

function input(value, change, { type = 'text', maxLength, min, max, placeholder, multiline = false } = {}) {
  const el = node(multiline ? 'textarea' : 'input');
  if (!multiline) el.type = type;
  el.value = value ?? '';
  if (maxLength) el.maxLength = maxLength;
  if (min !== undefined) el.min = min;
  if (max !== undefined) el.max = max;
  if (placeholder) el.placeholder = placeholder;
  if (change) {
    let beforeInput;
    el.addEventListener('input', () => {
      if (el.isConnected) edit(() => change(el.value), el, beforeInput);
      beforeInput = undefined;
    });
    el.addEventListener('blur', () => editHistory.endGroup());
    el.addEventListener('beforeinput', (event) => {
      if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
        event.preventDefault();
        stepHistory(event.inputType === 'historyRedo');
      } else {
        beforeInput = editorState();
      }
    });
  } else {
    el.dataset.pendingEdit = '';
  }
  return el;
}

function select(options, value, change) {
  const el = node('select');
  for (const [id, text] of Object.entries(options)) {
    const option = node('option', '', text);
    option.value = id;
    el.append(option);
  }
  el.value = value;
  if (change) el.addEventListener('change', () => edit(() => change(el.value)));
  return el;
}

function notice(message, kind = '') {
  status.textContent = message;
  status.className = kind;
}

function updateControls() {
  dirty = Boolean(draft && editHistory.isDirty(draftText));
  workspace.toggleAttribute('data-dirty', dirty);
  workspace.inert = busy || !draft;
  reload.disabled = busy;
  save.disabled = busy || (!dirty && !diskWarning);
  backups.disabled = busy || !draft;
  importExchange.disabled = exportExchange.disabled = busy || !draft;
  liveVariables.disabled = busy || !draft;
  closeBackups.disabled = busy;
  backupVersions.inert = busy;
  undo.disabled = busy || !editHistory.canUndo;
  redo.disabled = busy || !editHistory.canRedo;
  agentDraftOffer.hidden = !pendingAgentDraft;
  agentDraftOpen.disabled = busy;
  if (!busy && !dirty && pendingAgentDraft && !document.querySelector('dialog[open]')) queueMicrotask(() => void acceptAgentDraft());
  livePreview.update(draft, pageId === BAR_PAGE_ID ? draft?.pages[0]?.id : pageId, pageId !== BAR_PAGE_ID);
  refreshProfileGrid?.();
  refreshPageGrid?.();
}

function showDraftStatus() {
  if (dirty) notice(t('Unsaved changes'));
  else if (diskWarning) notice(t('{warning}. The editor is showing the last valid profile.', { warning: diskWarning }), 'error');
  else notice(t('Saved'));
}

function editorState() {
  const input = document.activeElement;
  const region = fieldRegions.find((element) => element.contains(input));
  const fields = region ? [...region.querySelectorAll(fieldSelector)] : [];
  const index = fields.indexOf(input);
  const focus = index === -1 ? null : { region: region.id, index, start: input.selectionStart, end: input.selectionEnd };
  return { text: draftText, pageId, selected, group: groupSelection ? [...groupSelection] : null, focus };
}

function edit(change, group = null, before = editorState()) {
  if (!draft || busy) return;
  change();
  draftText = JSON.stringify(draft);
  if (editHistory.record(before, editorState(), group)) {
    updateControls();
    showDraftStatus();
  }
}

function stepHistory(forward) {
  if (!draft || busy) return;
  const state = forward ? editHistory.redo() : editHistory.undo();
  if (!state) return;
  const restoreFocus = !document.activeElement.closest('.toolbar-actions');
  draftText = state.text;
  draft = JSON.parse(draftText);
  pageId = state.pageId;
  selected = state.selected;
  groupSelection = state.group ? new Set(state.group) : null;
  dragSource = null;
  renderProfileSettings();
  renderPage();
  if (packDialog.open) renderShortcutPack();
  if (restoreFocus && state.focus) {
    const { region, index, start, end } = state.focus;
    const input = document.getElementById(region).querySelectorAll(fieldSelector)[index];
    if (input) {
      const panel = input.closest('[data-inspector-panel]');
      if (panel?.hidden) inspector.querySelector(`[data-inspector-tab="${panel.dataset.inspectorPanel}"]`).click();
      for (let parent = input.parentElement; parent && parent !== workspace; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS') parent.open = true;
      }
      input.focus();
      if (typeof start === 'number') input.setSelectionRange(start, end);
    }
  }
  updateControls();
  showDraftStatus();
}

function currentPage() {
  if (pageId === BAR_PAGE_ID) return draft.bar;
  return draft.pages.find((page) => page.id === pageId);
}

liveVariables.addEventListener('click', () => {
  editHistory.endGroup();
  if (groupSelection) return inspectLiveVariables();
  try {
    const bar = pageId === BAR_PAGE_ID;
    const model = window.LastraDeckView.toView(draft, { page: bar ? draft.pages[0] : currentPage(), deduplicateEditing: false });
    inspectLiveVariables({ key: (bar ? model.bar.keys : model.slots)[selected], widget: widgetAt(selected) });
  } catch (error) {
    notice(error.message, 'error');
    inspectLiveVariables();
  }
});

function currentGrid() {
  return pageId === BAR_PAGE_ID ? BAR_GRID : currentPage().grid ?? draft.grid;
}

function showWidgets(surface, widgetId) {
  const bar = surface === 'bar';
  const target = bar ? draft.bar : currentPage();
  editHistory.endGroup();
  openWidgetEditor({
    title: bar ? t('Persistent bar widgets') : `${target.name} widgets`,
    compact: bar,
    grid: bar ? BAR_GRID : currentGrid(),
    keys: target.keys,
    widgets: target.widgets ?? [],
    presets: draft.widgetPresets,
    readIcon: (name) => api.previewAsset('icon', name),
    readSensorChoices: api.sensorChoices,
    readSensors: async () => (await api.previewLive('draft')).readings.sensors,
    onPresetsChange(presets) {
      edit(() => { draft.widgetPresets = presets; });
    },
    onChange(widgets) {
      edit(() => {
        target.widgets = widgets;
        if (target === currentPage()) {
          renderSlots();
          renderInspector();
        }
      });
    },
    restoreFocus() {
      document.getElementById(`${surface}-widgets`)?.focus();
    },
  }, widgetId);
}

function placementFits(grid, keys, widgets = []) {
  if (!remapKeys(keys, grid, grid)) return false;
  const occupied = occupiedCells(grid, keys);
  return groupWidgetPlacements(widgets).every(({ layout, members }) => {
    if (!members.every((widget) => sameWidgetLayout(layout, widget.layout)) || !canPlace(layout, grid, occupied)) return false;
    for (const cell of widgetCells(layout, grid.cols)) occupied.add(cell);
    return true;
  });
}

function applyPreviewLayout(page, { keys, widgets, layout }) {
  const grid = currentGrid();
  if (currentPage() !== page || !placementFits(grid, keys, widgets)) return;
  edit(() => {
    page.keys = keys;
    page.widgets = widgets;
    selected = layout.row * grid.cols + layout.column;
    groupSelection = null;
    renderSlots();
    renderInspector();
  });
}

function selectedInGrid(before, after) {
  const column = Math.min(selected % before.cols, after.cols - 1);
  const row = Math.min(Math.floor(selected / before.cols), after.rows - 1);
  return row * after.cols + column;
}

function widgetAt(index) {
  return currentPage().widgets?.find(({ layout }) => widgetCells(layout, currentGrid().cols).includes(index));
}

function coveringKey(index) {
  const grid = currentGrid();
  return currentPage().keys.findIndex((key, origin) => key?.span && origin !== index
    && widgetCells(keyLayout(key, origin, grid), grid.cols).includes(index));
}

function switchPage(id) {
  pageId = id;
  selected = 0;
  groupSelection = null;
  renderPage();
}

function gridResizePreview(grid, plan) {
  const keys = plan.keys.map((key) => duplicateEditingKey(key, FIXED_EDITING_KEYS) ? null : key);
  const { cols, rows, sheets, editing } = projectEditingPage(grid, keys, plan.widgets, false, largeKeys);
  const preview = node('div', 'grid-resize-preview');
  preview.setAttribute('aria-hidden', 'true');
  preview.style.setProperty('--preview-cols', cols);
  preview.style.setProperty('--preview-rows', rows);
  function tile(layout, label, kind) {
    const cell = node('div', 'grid-resize-cell', label);
    if (kind) cell.dataset.kind = kind;
    cell.style.gridColumn = `${layout.column + 1} / span ${layout.cols}`;
    cell.style.gridRow = `${layout.row + 1} / span ${layout.rows}`;
    if (label) cell.title = label;
    return cell;
  }
  const first = sheets[0];
  preview.append(
    ...first.keys.map(({ index, layout }) => tile(layout, keys[index]?.label, keys[index] && 'key')),
    ...groupWidgetPlacements(first.widgets).map(({ members, layout }) => tile(layout,
      members.length > 1 ? `${members.length} widget tabs` : widgetCatalog[members[0].type].name, 'widget')),
    ...editing.map(({ layout }, index) => tile(layout, FIXED_EDITING_KEYS[index].label, 'fixed')),
  );
  return { preview, screens: sheets.length };
}

function pageScreenUsage(page) {
  const usage = node('section', 'page-screen-usage');
  usage.setAttribute('aria-label', t('Screen usage'));
  const cards = [['Landscape', false], ['Portrait', true]].map(([label, portrait]) => {
    const card = node('div', 'page-screen-card');
    const heading = node('div', 'page-screen-heading');
    const count = node('strong');
    const capacity = node('p', 'muted');
    const meter = node('meter');
    meter.setAttribute('aria-label', label + ' positions used on the first screen');
    heading.append(node('span', '', label), count);
    card.append(heading, meter, capacity);
    usage.append(card);
    return { portrait, card, count, capacity, meter };
  });
  return {
    usage,
    refresh() {
      const view = window.LastraDeckView.toView(draft, { page });
      for (const { portrait, card, count, capacity, meter } of cards) {
        const { normal, sheets } = projectEditingPage(view.grid, view.slots, view.widgets, portrait, largeKeys);
        const used = normal - sheets[0].keys.filter(({ index }) => index === null).length;
        card.toggleAttribute('data-overflow', sheets.length > 1);
        count.textContent = sheets.length === 1 ? '1 screen' : sheets.length + ' screens';
        capacity.textContent = `${used} of ${normal} positions on the first screen`;
        meter.max = normal;
        meter.value = used;
      }
    },
  };
}

function gridResizeControls({ getGrid, getPages, preferredPage, applyLabel, onApply, getInheritedGrid, hasOverride }) {
  const original = getGrid();
  const columns = input(original.cols, null, { type: 'number', min: 1, max: 12 });
  const rows = input(original.rows, null, { type: 'number', min: 1, max: 6 });
  const dimensions = node('div', 'row grid-resize-dimensions');
  const details = node('div', 'grid-resize-details');
  const summary = node('p');
  summary.setAttribute('role', 'status');
  const visual = node('div');
  const issues = node('ul', 'grid-resize-issues');
  details.append(summary, visual, issues);
  let requested = false;
  let inherit = false;
  function proposal() {
    if (!columns.value || !rows.value || !columns.validity.valid || !rows.validity.valid) return null;
    const next = { cols: columns.valueAsNumber, rows: rows.valueAsNumber };
    const current = getGrid();
    const plans = getPages().map((page) => ({ page, ...planGridResize(page, current, next) }));
    return { current, next, plans, blocked: plans.some((plan) => plan.blocked.length) };
  }
  function refresh() {
    const planned = requested ? proposal() : null;
    const unchanged = !planned || planned.current.cols === planned.next.cols && planned.current.rows === planned.next.rows;
    apply.disabled = !requested || !planned || planned.blocked || (unchanged && !inherit && (!hasOverride || hasOverride()));
    apply.textContent = inherit ? t('Use profile grid') : applyLabel;
    details.hidden = !requested;
    if (!requested) return;
    visual.replaceChildren();
    issues.replaceChildren();
    issues.hidden = true;
    if (!planned) {
      summary.textContent = t('Enter 1–12 columns and 1–6 rows.');
      return;
    }
    const current = planned.plans.find(({ page }) => page.id === preferredPage()) ?? planned.plans[0];
    const view = current && gridResizePreview(planned.next, current);
    const n = planned.plans.reduce((count, { blocked }) => count + blocked.length, 0);
    const heading = `${planned.next.cols} columns × ${planned.next.rows} rows`;
    const preview = current ? ` · ${current.page.name}${view.screens > 1 ? ` · Screen 1 of ${view.screens}` : ''}`
      : ' · Applies to new pages';
    summary.textContent = [heading + preview, n ? `Move or resize ${n} ${n === 1 ? 'item' : 'items'} to apply.` : ''].filter(Boolean).join('. ');
    if (view) visual.append(view.preview);
    issues.hidden = n === 0;
    for (const { page, blocked } of planned.plans) {
      for (const { label, kind, layout, reason } of blocked) {
        const item = `${page.name} · ${label} (${kind}, column ${layout.column + 1}, row ${layout.row + 1}) ${reason}.`;
        issues.append(node('li', '', item));
      }
    }
  }
  const apply = button(applyLabel, () => {
    const planned = proposal();
    if (!planned || planned.blocked) return refresh();
    const useDefault = inherit;
    requested = inherit = false;
    onApply(planned, useDefault);
    refresh();
  }, { className: 'quiet' });
  dimensions.append(field('Columns', columns), field('Rows', rows), apply);
  if (getInheritedGrid && hasOverride()) {
    dimensions.append(button(t('Preview profile grid'), () => {
      const base = getInheritedGrid();
      columns.value = base.cols;
      rows.value = base.rows;
      requested = inherit = true;
      refresh();
    }, { className: 'quiet' }));
  }
  for (const field of [columns, rows]) field.addEventListener('input', () => {
    requested = true;
    inherit = false;
    refresh();
  });
  refresh();
  return { dimensions, details, refresh };
}

function manageMacros() {
  editHistory.endGroup();
  openMacroLibrary(draft, (macros) => edit(() => {
    draft.macros = macros;
    renderInspector();
  }));
}

function manageVariables(kind, owner, property = 'variables') {
  editHistory.endGroup();
  const names = { profile: 'Profile variables', page: 'Page variables', run: 'Run variables' };
  const descriptions = {
    profile: 'Available to keys on every page and in the persistent bar.',
    page: 'Available to keys on this page. Page variables can read profile variables.',
    run: pageId === BAR_PAGE_ID ? 'Calculated once for each use of this key. Run variables can read profile variables.'
      : 'Calculated once for each use of this key. Run variables can read profile variables and variables from this page.',
  };
  const inspect = (value) => {
    if (!Array.isArray(value)) throw new Error(t('Enter a list of typed variable definitions.'));
    const resolver = createProfileKeys(draft);
    const parent = kind === 'profile' ? undefined : kind === 'page' ? resolver.profileScope : resolver.pageScope(currentPage());
    const scope = createExpressionScope(kind, value, parent);
    scope.check();
    return scope.definitions.map(({ id }) => `${id} = ${sampleText(scope.value(id))}`).join(' · ') || 'No variables in this scope.';
  };
  openExpressionEditor({ title: names[kind], value: owner[property]?.length ? owner[property] : undefined,
    example: [{ id: 'delay', type: 'integer', value: 150 }],
    instructions: `${descriptions[kind]} Types are string, integer and boolean. Each definition needs id, type and value.`,
    inspect, apply: (value) => edit(() => {
      if (value.length) owner[property] = value;
      else delete owner[property];
      renderSlots();
      renderInspector();
    }) });
}

function sampleText(value) {
  const text = JSON.stringify(value);
  return text.length > 140 ? `${text.slice(0, 137)}…` : text;
}

function keyExpressionScope(visual = false) {
  const resolver = createProfileKeys(draft);
  const key = currentPage().keys[selected];
  return key?.controlId && !visual ? resolver.profileScope : resolver.runScope(key, currentPage());
}

function calculatedField({ label, type, value, control, update, visual = false }) {
  const bound = isExpression(value);
  const result = (expression) => keyExpressionScope(visual).resolve(expression, type);
  let display;
  if (bound) {
    try { display = node('output', 'expression-value', sampleText(result(value))); }
    catch (error) { display = node('output', 'status error expression-value', error.message); }
  }
  const commit = (next) => edit(() => {
    update(next);
    if (visual) renderSlots();
    renderInspector();
  });
  const trigger = button(t('Expression'), () => {
    editHistory.endGroup();
    openExpressionEditor({ title: `${label} expression`, value: bound ? value : undefined,
      example: { expression: { integer: 150, string: '', boolean: true }[type] },
      instructions: `The result must be ${type}. Use a literal, a scoped variable such as {"scope":"profile","var":"name"}, or an operator with op and args.`,
      inspect: (next) => sampleText(result(next)), apply: commit, clear: bound ? () => commit(undefined) : undefined });
  }, { className: 'quiet expression-button' });
  trigger.setAttribute('aria-label', `${label} expression`);
  const row = node('div', 'action-type');
  row.append(field(label, display ?? control()), trigger);
  return row;
}

function renderProfileSettings() {
  profileHeading.textContent = profileActivity ? t(profileActivity) : draft.name;
  const name = input(draft.name, (value) => { draft.name = value; }, { maxLength: 40 });
  const resize = gridResizeControls({
    getGrid: () => draft.grid,
    getPages: () => draft.pages.filter((page) => !page.grid),
    preferredPage: () => pageId,
    applyLabel: 'Resize grid',
    onApply: ({ current, next, plans }) => edit(() => {
      draft.grid = next;
      for (const { page, keys } of plans) page.keys = keys;
      if (pageId !== BAR_PAGE_ID && !currentPage().grid) {
        selected = selectedInGrid(current, next);
        groupSelection = null;
      }
      renderPage();
    }),
  });
  refreshProfileGrid = resize.refresh;
  const gestures = Object.entries(gestureOptions).map(([key, option]) => ({
    key,
    label: option.label,
    control: input(draft.gestures?.[key] ?? option.value, null, { type: 'number', min: option.min, max: option.max }),
  }));
  const controls = [field(t('Profile name'), name), resize.dimensions, resize.details, button(t('Shared macros'), manageMacros, { className: 'quiet' }),
    button(t('Profile variables'), () => manageVariables('profile', draft), { className: 'quiet' })];
  controls.push(field(t('Office shortcut language'), select({ '': t('Unspecified'), 'en-US': t('English (United States)'), 'it-IT': t('Italian') },
    draft.shortcutLanguage ?? '', (value) => {
      if (value) draft.shortcutLanguage = value;
      else delete draft.shortcutLanguage;
    })));
  if (gestures.length) {
    const row = node('div', 'gesture-settings');
    const applyGestures = button(t('Apply gesture settings'), () => {
      if (gestures.some(({ control }) => !control.value || !control.reportValidity())) return;
      edit(() => {
        draft.gestures = Object.fromEntries(gestures.map(({ key, control }) => [key, Number(control.value)]));
      });
    });
    row.append(...gestures.map(({ label, control }) => field(label, control)), applyGestures);
    controls.push(row);
  }
  profileFields.replaceChildren(...controls);
}

function renderTabs() {
  pages.replaceChildren(...[...draft.pages, { id: BAR_PAGE_ID, name: t('Persistent bar') }].map((page, index) => {
    const tab = button('', () => {
      switchPage(page.id);
      pages.children[index]?.focus();
    }, { className: 'page-link', dataset: { surface: page.id === BAR_PAGE_ID ? 'bar' : 'page' } });
    const copy = node('span', 'page-link-copy');
    copy.append(node('span', 'page-link-name', page.name || page.id));
    if (page.folder?.length) copy.append(node('small', '', page.folder.join(' / ')));
    tab.append(node('span', 'page-link-icon'), copy);
    tab.firstElementChild.setAttribute('aria-hidden', 'true');
    tab.title = [...(page.folder ?? []), page.name || page.id].join(' / ');
    tab.setAttribute('aria-pressed', String(page.id === pageId));
    return tab;
  }));
  addPage.disabled = draft.pages.length >= 16;
}

async function copyToClipboard(kind, item) {
  try {
    const target = clipboardControls(draft, kind, item);
    await api.copy(kind, createProfileKeys(draft).materialize(kind, target, currentPage()));
    notice({ page: 'Page copied', key: 'Key copied', group: 'Key group copied' }[kind], 'ok');
  } catch (err) {
    notice(err.message, 'error');
  }
}

async function pasteFromClipboard(kind, insert) {
  const targetDraft = draft;
  try {
    const item = await api.paste(kind);
    if (draft === targetDraft && !busy) insert(item);
  } catch (err) {
    notice(err.message, 'error');
  }
}

function insertPage(source, { linkAvailable = false } = {}) {
  if (draft.pages.length >= 16) throw new Error(t('This profile already has 16 pages'));
  const page = structuredClone(source);
  const grid = page.grid ?? draft.grid;
  const size = grid.cols * grid.rows;
  if (!placementFits(grid, page.keys, page.widgets)) throw new Error('Expand the grid to fit the page keys and widgets');
  page.id = crypto.randomUUID();
  if (linkAvailable) {
    const takenApps = new Set(draft.pages.flatMap(({ apps }) => apps.map((value) => value.toLowerCase())));
    const takenIds = new Set(draft.pages.flatMap(({ appIds }) => (appIds ?? []).map((value) => value.toLowerCase())));
    page.apps = page.apps.filter((value) => !takenApps.has(value));
    page.appIds = page.appIds.filter((value) => !takenIds.has(value));
  } else {
    page.apps = [];
    delete page.appIds;
    delete page.windowTitle;
    delete page.priority;
  }
  page.keys = page.keys.slice(0, size);
  const names = new Set(draft.pages.map(({ name }) => name));
  for (let copy = 1; names.has(page.name); copy++) {
    const suffix = copy === 1 ? ' · copy' : ` · copy ${copy}`;
    page.name = source.name.slice(0, 40 - suffix.length) + suffix;
  }
  edit(() => {
    draft.pages.push(page);
    switchPage(page.id);
  });
}

function addTemplatePages(owner, { pages }) {
  if (owner !== draft || busy) return false;
  edit(() => {
    draft.pages.push(...pages);
    switchPage(pages[0].id);
  });
  return true;
}

function planExchangeImport(bundle, owner) {
  if (bundle.kind === 'stream-deck-pages') {
    const plan = window.LastraProfileTemplateImport.prepareTemplatePages(owner, bundle.item);
    return { collisions: plan.collisions, apply: () => addTemplatePages(owner, plan) };
  }
  if (bundle.kind === 'page') {
    const page = bundle.item;
    const plan = window.LastraProfileTemplateImport.prepareTemplatePages(owner, { grid: page.grid, pages: [page] });
    return { collisions: plan.collisions, apply: () => addTemplatePages(owner, plan) };
  }
  return {
    apply() {
      if (draft !== owner || busy) return false;
      edit(() => {
        draft = makeDraft(bundle.item);
        pageId = draft.pages[0].id;
        selected = 0;
        groupSelection = null;
        dragSource = null;
        renderProfileSettings();
        renderPage();
      });
      return true;
    },
  };
}

importExchange.addEventListener('click', () => {
  editHistory.endGroup();
  void exchange.open(draft);
});
exportExchange.addEventListener('click', () => {
  editHistory.endGroup();
  void exchange.export(draft);
});

templateButton.addEventListener('click', () => {
  if (!draft || busy) return;
  editHistory.endGroup();
  void openTemplates(draft);
});

const shortcutPlatforms = { windows: 'Windows', web: 'Web', macos: 'macOS', linux: 'Linux',
  chromeos: 'ChromeOS', ipados: 'iPadOS', reference: 'Reference' };

function shortcutIdentity({ pack, key }) {
  return pack.id + '/' + key.id;
}

function copyableShortcut(key, id = key.id) {
  const binding = key.binding;
  if (!shortcutGuardForAction(key.action) || (binding && (binding.appVersion || binding.verification.status !== 'documented'
      || (binding.layout && binding.layout !== 'US')))) return null;
  const { label, icon, category, action, confirm, shortcut } = key;
  return { id, label, icon, category, action, ...(confirm ? { confirm } : {}), ...(shortcut ? { shortcut } : {}) };
}

function copyShortcutToPage(key) {
  const page = currentPage();
  const grid = currentGrid();
  const position = findPosition(grid, occupiedCells(grid, page.keys, page.widgets), { cols: 1, rows: 1 });
  if (!position) throw new Error(t('This page has no free key slot.'));
  edit(() => {
    selected = position.row * grid.cols + position.column;
    groupSelection = null;
    putKey(selected, copyableShortcut(key, crypto.randomUUID()));
    renderSlots();
    renderInspector();
  });
  packDialog.close();
}

function shortcutLabel(key) {
  return key.notation ?? key.action?.keys ?? (key.action?.type === 'spotify-playback' ? 'Spotify session' : 'No verified chord');
}

function renderShortcutDetail(row) {
  shortcutDetail.replaceChildren();
  shortcutDetail.hidden = !row;
  if (!row) return;
  const { key, pack, platform, contexts } = row;
  const binding = key.binding;
  const guard = shortcutGuardForAction(key.action);
  const details = node('dl', 'shortcut-variant');
  const value = (label, content) => {
    if (content) details.append(node('dt', '', label), node('dd', '', content));
  };
  value('App', pack.name);
  value('Shortcut', shortcutLabel(key));
  value('Input sequence', binding?.orderedChords ? 'Ordered chords · release keys between steps' : undefined);
  value('Command', binding?.command);
  if (binding?.args !== undefined) value('Arguments', JSON.stringify(binding.args));
  value('Reviewed default', key.reviewedNotation);
  value('Platform', [shortcutPlatforms[platform] ?? platform,
    platform === 'web' && binding?.hostPlatform ? shortcutPlatforms[binding.hostPlatform] + ' host' : null].filter(Boolean).join(' · '));
  value('Context', contexts[0]);
  value('Requires', binding?.requirement);
  value('When', binding?.when);
  value('Trigger', binding?.trigger);
  value('Mode', binding?.mode?.replaceAll('-', ' ') ?? guard?.mode);
  value('Edition', binding?.edition);
  value('Version', binding?.appVersion);
  value('Language', binding?.language ?? guard?.language);
  value('Layout', binding?.layout ?? (guard?.layout ? 'US' : undefined));
  value('Windows build', binding?.windowsBuild ?? guard?.minBuild);
  const review = binding?.verification.status === 'installed-manifest' ? 'Installed manifest' : binding?.verification.status;
  value('Review', binding ? [review, binding.verification.date].filter(Boolean).join(' · ')
    : guard ? 'Built-in pack' : undefined);
  value('Variant ID', binding?.bindingId);
  const source = binding?.source ?? key.source ?? pack.source;
  const controls = node('div', 'shortcut-detail-actions');
  if (source) {
    const label = 'Source · ' + new URL(source).hostname.replace(/^www\./, '');
    const open = button(label, () => api.shortcutSource(source).catch((error) => { packStatus.textContent = error.message; }), { className: 'quiet' });
    open.title = source;
    controls.append(open);
  }
  if (copyableShortcut(key)) {
    if (pack.defaultShortcutIds) {
      const reason = packChoice.value === pack.id ? shortcutPageEditor.addStatus(key.id) : undefined;
      const add = button(t('Add to shortcut page'), () => {
        if (packChoice.value !== pack.id) {
          packChoice.value = pack.id;
          renderShortcutPack();
        }
        shortcutPageEditor.add(key.id);
      }, { className: 'primary', disabled: Boolean(reason), title: reason && t(reason) });
      controls.append(add);
      if (reason) controls.append(node('span', 'muted', t(reason)));
    }
    controls.append(button(t('Copy to this page'), () => {
      try {
        copyShortcutToPage(key);
      } catch (error) {
        packStatus.textContent = error.message;
      }
    }, { className: 'quiet' }));
  }
  shortcutDetail.append(node('h3', '', key.label), details);
  if (key.unavailable) shortcutDetail.append(node('p', 'shortcut-detail-reason', key.unavailable));
  shortcutDetail.append(controls);
  if (key.overrideId) shortcutDetail.append(shortcutOverrideForm(key));
}

function shortcutOverrideForm(key) {
  const form = node('form', 'shortcut-override-form');
  const chord = input(key.shortcutOverride ? key.action.keys : '', null, { maxLength: 120, placeholder: 'Ctrl+Shift+F' });
  chord.autocomplete = 'off';
  const feedback = node('p', 'muted');
  feedback.setAttribute('role', 'status');
  let capturing = false;
  const capture = button('Capture', () => {
    capturing = true;
    feedback.textContent = t('Press the shortcut. Press Escape to cancel.');
    chord.focus();
  }, { className: 'quiet' });
  chord.addEventListener('blur', () => { capturing = false; });
  chord.addEventListener('keydown', (event) => {
    if (!capturing || (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      capturing = false;
      feedback.textContent = t('Capture canceled.');
      return;
    }
    const captured = captureShortcut(event);
    if (!captured) return;
    chord.value = captured;
    capturing = false;
    feedback.textContent = t('Shortcut captured.');
  });
  const actions = node('div', 'shortcut-detail-actions');
  const apply = node('button', '', t('Set local override'));
  apply.type = 'submit';
  actions.append(capture, apply);
  function refreshAfterEdit() {
    renderShortcutPack();
    (shortcutDetail.querySelector('.shortcut-override-form input') ?? shortcutSearch).focus();
  }
  if (key.shortcutOverride) {
    actions.append(button(t('Reset to reviewed default'), () => {
      edit(() => { delete draft.shortcutOverrides[key.overrideId]; });
      refreshAfterEdit();
    }, { className: 'quiet' }));
  }
  form.append(field(t('Local shortcut'), chord), actions, feedback);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (apply.disabled) return;
    apply.disabled = true;
    const profile = draft;
    try {
      const keys = await api.shortcutOverride(chord.value);
      if (!form.isConnected || !packDialog.open || draft !== profile) return;
      edit(() => { draft.shortcutOverrides[key.overrideId] = keys; });
      refreshAfterEdit();
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      apply.disabled = false;
    }
  });
  return form;
}

function fillShortcutFilter(control, first, options) {
  control.replaceChildren(...[['', first], ...options].map(([id, label]) => {
    const option = node('option', '', label);
    option.value = id;
    return option;
  }));
}

function selectShortcutRow(row, control) {
  selectedShortcut = shortcutIdentity(row);
  packKeys.querySelector('[aria-pressed=true]')?.setAttribute('aria-pressed', 'false');
  control.setAttribute('aria-pressed', 'true');
  renderShortcutDetail(row);
  const heading = shortcutDetail.querySelector('h3');
  heading.tabIndex = -1;
  heading.focus();
}

function renderShortcutPack() {
  const pack = availablePacks.find(({ id }) => id === packChoice.value);
  shortcutPageEditor.render(pack);
  const visible = filterShortcutRows(catalogRows, {
    app: packChoice.value, platform: shortcutPlatform.value, context: shortcutContext.value,
    query: shortcutSearch.value, overrides: draft.shortcutOverrides,
  });
  const shown = visible.find((row) => shortcutIdentity(row) === selectedShortcut);
  renderShortcutDetail(shown);
  packKeys.replaceChildren(...visible.map((row) => {
    const { key, pack: owner } = row;
    const item = node('li');
    const open = button('', () => selectShortcutRow(row, open), { className: 'shortcut-entry' });
    open.setAttribute('aria-pressed', String(row === shown));
    const glyph = node('span', 'shortcut-pack-icon');
    glyph.setAttribute('aria-hidden', 'true');
    if (packIcons[key.icon]) glyph.style.setProperty('--shortcut-icon', `url("${packIcons[key.icon]}")`);
    open.append(glyph, node('strong', '', key.label), node('code', '', shortcutLabel(key)));
    if (!pack) open.append(node('span', 'muted', owner.name));
    if (key.shortcutOverride) open.append(node('span', 'muted', t('Local override')));
    item.append(open);
    return item;
  }));
  const size = draft.grid.cols * draft.grid.rows;
  packCopy.hidden = !pack || Boolean(pack.referenceOnly);
  packCopy.disabled = !pack || draft.pages.length >= 16 || !pack.keys.slice(0, size).some((key) => copyableShortcut(key));
  packWebApp.hidden = !pack?.installedWebApp;
  if (pack?.installedWebApp) {
    packManifest.placeholder = pack.manifestExample;
    const attached = (draft.webApps ?? []).filter((entry) => entry.pack === pack.id);
    packWebApps.replaceChildren(...attached.map(({ manifestId }) => {
      const row = node('li');
      row.append(node('code', '', manifestId), button('Remove', () => {
        edit(() => { draft.webApps = draft.webApps.filter((entry) => entry.manifestId !== manifestId); });
        renderShortcutPack();
        packManifest.focus();
      }, { className: 'quiet' }));
      return row;
    }));
  }
  const count = visible.length ? `${visible.length} ${visible.length === 1 ? 'shortcut' : 'shortcuts'}` : 'No matching shortcuts.';
  packStatus.textContent = [count, pack?.availability].filter(Boolean).join(' · ');
}

async function showShortcutPacks() {
  if (busy || packDialog.open) return;
  editHistory.endGroup();
  packCopy.disabled = packChoice.disabled = shortcutPlatform.disabled = shortcutContext.disabled = true;
  packCopy.hidden = packWebApp.hidden = true;
  shortcutSearch.value = '';
  selectedShortcut = undefined;
  catalogRows = [];
  shortcutPageEditor.render();
  renderShortcutDetail();
  packWebApp.reset();
  packChoice.replaceChildren();
  packKeys.replaceChildren();
  packStatus.textContent = t('Loading shortcut packs…');
  packDialog.showModal();
  try {
    ({ packs: availablePacks, icons: packIcons } = await api.shortcutPacks(draft.shortcutLanguage));
    if (!packDialog.open) return;
    catalogRows = shortcutRows(availablePacks);
    const apps = [...availablePacks].sort((a, b) => a.name.localeCompare(b.name));
    fillShortcutFilter(packChoice, 'All apps', apps.map(({ id, name }) => [id, name]));
    fillShortcutFilter(shortcutPlatform, 'All platforms', [...new Set(catalogRows.map(({ platform }) => platform))]
      .sort().map((platform) => [platform, shortcutPlatforms[platform] ?? platform]));
    fillShortcutFilter(shortcutContext, 'All contexts', [...new Set(catalogRows.flatMap(({ contexts }) => contexts))]
      .sort((a, b) => a.localeCompare(b)).map((context) => [context, context]));
    packChoice.disabled = shortcutPlatform.disabled = shortcutContext.disabled = false;
    renderShortcutPack();
  } catch (error) {
    packStatus.textContent = error.message;
  }
}

packChoice.addEventListener('change', () => {
  packWebApp.reset();
  renderShortcutPack();
});
shortcutSearch.addEventListener('input', renderShortcutPack);
shortcutPlatform.addEventListener('change', renderShortcutPack);
shortcutContext.addEventListener('change', renderShortcutPack);
packWebApp.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (packAttach.disabled || packWebApp.hidden || busy) return;
  const pack = packChoice.value;
  const profile = draft;
  packAttach.disabled = true;
  try {
    const match = await api.shortcutWebApp({ pack, manifestId: packManifest.value });
    if (!packDialog.open || packChoice.value !== pack || draft !== profile) return;
    const entries = draft.webApps ?? [];
    if (entries.some((entry) => entry.manifestId === match.manifestId)) throw new Error(t('This manifest ID is already attached.'));
    if (entries.length >= MAX_WEB_APP_MANIFESTS) {
      throw new Error(t('The profile can attach up to {number} manifest IDs.', { number: MAX_WEB_APP_MANIFESTS }));
    }
    edit(() => { draft.webApps = [...entries, match]; });
    packWebApp.reset();
    renderShortcutPack();
    packManifest.focus();
    packStatus.textContent = t('Web app attached. Save the profile to apply this match.');
  } catch (error) {
    if (packDialog.open && packChoice.value === pack && draft === profile) packStatus.textContent = error.message;
  } finally {
    packAttach.disabled = false;
  }
});
document.getElementById('close-shortcut-packs').addEventListener('click', () => packDialog.close());
packCopy.addEventListener('click', () => {
  const pack = availablePacks.find(({ id }) => id === packChoice.value);
  if (!pack || packCopy.disabled) return;
  try {
    const { name, apps, appIds, keys } = pack;
    const size = draft.grid.cols * draft.grid.rows;
    const selectedKeys = keys.slice(0, size).map((key) => copyableShortcut(withShortcutOverride(key, draft.shortcutOverrides)));
    insertPage({ name, apps, appIds, keys: selectedKeys }, { linkAvailable: true });
    packDialog.close();
  } catch (error) {
    packStatus.textContent = error.message;
  }
});

function renderPage() {
  const page = currentPage();
  const bar = pageId === BAR_PAGE_ID;
  const grid = currentGrid();
  pageHeading.textContent = bar ? t('Persistent bar') : page.name || t('Untitled page');
  pageSize.textContent = `${grid.cols} × ${grid.rows}`;
  pageSettings.hidden = bar;
  refreshPageGrid = undefined;
  livePreview.update(draft, pageId === BAR_PAGE_ID ? draft.pages[0].id : pageId, pageId !== BAR_PAGE_ID);
  refreshProfileGrid?.();
  renderTabs();
  const barWidgets = button('Widgets', () => showWidgets('bar'));
  barWidgets.id = 'bar-widgets';
  if (bar) {
    pageActions.replaceChildren(barWidgets);
    pageFields.replaceChildren();
    renderSlots();
    renderInspector();
    return;
  }
  const name = input(page.name, (value) => {
    page.name = value;
    pageHeading.textContent = value || t('Untitled page');
    renderTabs();
  }, { maxLength: 40 });
  const folder = input(page.folder?.join(' / '), (value) => {
    if (value.trim()) page.folder = value.split('/').map((part) => part.trim());
    else delete page.folder;
    renderTabs();
  }, { maxLength: 137, placeholder: 'Work / Editing' });
  const apps = input(page.apps.join(', '), (value) => {
    page.apps = value.split(',').map((part) => part.trim()).filter(Boolean);
  }, { placeholder: 'Code.exe, devenv.exe' });
  const appIds = input(page.appIds?.join(', '), (value) => {
    page.appIds = value.split(',').map((part) => part.trim()).filter(Boolean);
  }, { placeholder: 'Microsoft.VisualStudioCode' });
  const titleRule = node('details', 'page-grid-settings');
  titleRule.open = Boolean(page.windowTitle || page.priority);
  const titleRuleFields = node('div', 'row');
  const title = input(page.windowTitle?.value, () => updateTitleRule(), { maxLength: 120, placeholder: 'Project name' });
  const titleMode = select({ contains: t('Contains'), 'starts-with': t('Starts with'), exact: t('Exact title') },
    page.windowTitle?.mode ?? 'contains', () => updateTitleRule());
  function updateTitleRule() {
    const value = title.value.trim();
    if (value) page.windowTitle = { mode: titleMode.value, value };
    else delete page.windowTitle;
  }
  const priority = input(page.priority ?? 0, (value) => {
    if (value && Number(value)) page.priority = Number(value);
    else delete page.priority;
  }, { type: 'number', min: -100, max: 100 });
  titleRuleFields.append(field(t('Match'), titleMode), field(t('Window title'), title), field(t('Rule priority'), priority));
  titleRule.append(node('summary', '', t('Context rules')), titleRuleFields);
  const remove = button(t('Delete page'), () => {
    if (!window.confirm(t('Delete “{page}” and its keys and widgets?', { page: page.name }))) return;
    edit(() => {
      draft.pages = draft.pages.filter(({ id }) => id !== pageId);
      switchPage(draft.pages[0].id);
    });
  }, { className: 'danger' });
  remove.disabled = draft.pages.length === 1;
  const row = node('div', 'row');
  row.append(field(t('Page name'), name), field(t('Foreground executables'), apps), field(t('Windows app IDs'), appIds), field(t('Folder path'), folder), remove);
  const tools = node('div', 'clipboard-tools');
  const duplicate = button(t('Duplicate page'), () => insertPage(page), { className: 'quiet' });
  const paste = button(t('Paste page'), () => pasteFromClipboard('page', insertPage), { className: 'quiet' });
  const pageWidgets = button('Widgets', () => showWidgets('page'));
  pageWidgets.id = 'page-widgets';
  const shortcutPacks = button(t('App shortcuts'), showShortcutPacks, { className: 'quiet' });
  pageActions.replaceChildren(shortcutPacks, pageWidgets);
  duplicate.disabled = paste.disabled = draft.pages.length >= 16;
  tools.append(button(t('Copy page'), () => copyToClipboard('page', { ...page, grid: currentGrid() }), { className: 'quiet' }),
    paste, duplicate, button(t('Export page'), () => {
      editHistory.endGroup();
      void exchange.export(draft, page.id);
    }, { className: 'quiet' }),
    button(t('Page variables'), () => manageVariables('page', page), { className: 'quiet' }));
  const gridSettings = node('details', 'page-grid-settings grid-resize-settings');
  const resize = gridResizeControls({
    getGrid: () => page.grid ?? draft.grid,
    getPages: () => [page],
    preferredPage: () => pageId,
    applyLabel: 'Apply page grid',
    getInheritedGrid: () => draft.grid,
    hasOverride: () => Boolean(page.grid),
    onApply: ({ current, next, plans }, inherit) => edit(() => {
      page.keys = plans[0].keys;
      if (inherit) delete page.grid;
      else page.grid = next;
      selected = selectedInGrid(current, next);
      groupSelection = null;
      renderPage();
      const updated = pageFields.querySelector('.grid-resize-settings');
      updated.open = true;
      updated.querySelector('summary').focus();
    }),
  });
  const screenUsage = pageScreenUsage(page);
  refreshPageGrid = () => {
    resize.refresh();
    screenUsage.refresh();
  };
  gridSettings.append(node('summary', '', t('Page grid')), resize.dimensions, resize.details);
  pageFields.replaceChildren(row, titleRule, gridSettings, screenUsage.usage, tools);
  screenUsage.refresh();
  renderSlots();
  renderInspector();
}

function putKey(index, key) {
  const keys = currentPage().keys;
  while (keys.length <= index) keys.push(null);
  keys[index] = key;
}

function insertKey(source, position) {
  const page = currentPage();
  const trial = page.keys.slice();
  trial[position] = source;
  if (!placementFits(currentGrid(), trial, page.widgets)) throw new Error(t('The key does not fit in this slot'));
  edit(() => {
    putKey(position, { ...structuredClone(source), id: crypto.randomUUID() });
    selected = position;
    renderSlots();
    renderInspector();
  });
}

function clipboardKeyTools(key) {
  const tools = node('div', 'clipboard-tools');
  const { keys } = currentPage();
  if (key) tools.append(button(t('Copy'), () => copyToClipboard('key', key), { className: 'quiet' }));
  const paste = button(t('Paste'), () => {
    const targetPage = currentPage();
    const position = selected;
    pasteFromClipboard('key', (copied) => {
      if (currentPage() !== targetPage) return;
      if (targetPage.keys[position] && !window.confirm(t('Replace the key in this slot?'))) return;
      insertKey(copied, position);
    });
  }, { className: 'quiet' });
  tools.append(paste);
  if (key) {
    const grid = currentGrid();
    const size = grid.cols * grid.rows;
    const reserved = occupiedCells(grid, keys, currentPage().widgets);
    const empty = Array.from({ length: size }, (_, i) => (selected + i + 1) % size)
      .find((index) => canPlace(keyLayout(key, index, grid), grid, reserved));
    const duplicate = button(t('Duplicate'), () => insertKey(key, empty), { className: 'quiet' });
    duplicate.disabled = empty === undefined;
    tools.append(duplicate);
  }
  return tools;
}

function insertKeyGroup(positions) {
  const copies = positions.map(({ index, key }) => ({ index, key: { ...structuredClone(key), id: crypto.randomUUID() } }));
  edit(() => {
    for (const { index, key } of copies) putKey(index, key);
    selected = copies[0].index;
    if (groupSelection) groupSelection = new Set(copies.map(({ index }) => index));
    renderSlots();
    renderInspector();
    slots.children[selected].focus();
  });
}

function renderGroupInspector() {
  const page = currentPage();
  const grid = currentGrid();
  const group = captureKeyGroup(page.keys, grid, groupSelection);
  const copies = group && findKeyGroupPosition(group, grid, occupiedCells(grid, page.keys, page.widgets));
  const copy = button(t('Copy group'), () => copyToClipboard('group', group), { className: 'quiet' });
  const duplicate = button(t('Duplicate group'), () => insertKeyGroup(copies), { className: 'quiet' });
  copy.disabled = !group;
  duplicate.disabled = !copies;
  const tools = node('div', 'clipboard-tools');
  tools.append(copy, duplicate);
  const count = groupSelection.size;
  inspector.replaceChildren(node('h2', '', t('Key group')),
    node('p', 'muted', count ? `${count} ${count === 1 ? 'key' : 'keys'} selected` : t('Choose keys in the grid.')), tools);
  if (group && !copies) inspector.append(node('p', 'muted', 'There is no free space to duplicate this group on this layout.'));
  if (!group) return;

  const entries = [...groupSelection].filter((index) => page.keys[index]).map((index) => ({ index, key: page.keys[index] }));
  const stillSelected = () => !busy && currentPage() === page && groupSelection?.size === entries.length
    && entries.every(({ index, key }) => groupSelection.has(index) && page.keys[index] === key);
  const moving = node('section', 'key-group-editor');
  moving.append(node('h3', '', t('Move selected keys')));
  const moves = keyGroupMoves(page.keys, grid, page.widgets, groupSelection, group);
  if (!moves.size) {
    moving.append(node('p', 'muted', 'There is no other position where the selected keys fit.'));
  } else {
    const options = { '': 'Choose a slot' };
    for (const [index] of moves) options[index] = `Row ${Math.floor(index / grid.cols) + 1} · Column ${index % grid.cols + 1}`;
    const target = select(options, '');
    const move = button(t('Move group'), () => {
      const positions = target.value && moves.get(Number(target.value));
      if (!positions || !stillSelected()) return;
      edit(() => {
        for (const { index } of entries) putKey(index, null);
        for (const { index, key } of positions) putKey(index, key);
        selected = positions[0].index;
        groupSelection = new Set(positions.map(({ index }) => index));
        renderSlots();
        renderInspector();
        slots.children[selected].focus();
      });
    }, { className: 'quiet' });
    target.id = 'key-group-destination';
    move.id = 'key-group-move';
    move.disabled = true;
    target.addEventListener('change', () => { move.disabled = !target.value; });
    moving.append(field(t('Upper-left slot'), target), move);
  }

  const style = node('section', 'key-group-editor');
  style.append(node('h3', '', t('Style and category')));
  const category = select({ '': t('Keep current categories'), ...categories }, '');
  category.id = 'key-group-category';
  const appliedStyle = node('p', 'muted', t('Keep current icons and images'));
  appliedStyle.setAttribute('role', 'status');
  let asset;
  const apply = button(t('Apply to selected keys'), () => {
    if ((!category.value && !asset) || !stillSelected()) return;
    edit(() => {
      for (const { key } of entries) applyKeyAppearance(key, { category: category.value, asset });
      renderSlots();
      renderInspector();
      inspector.querySelector('#key-group-category').focus();
    });
  }, { className: 'quiet' });
  apply.id = 'key-group-apply-style';
  const resetAsset = button(t('Keep current style'), () => stageAsset(undefined), { className: 'quiet' });
  function stageAsset(value) {
    asset = value;
    appliedStyle.textContent = value?.kind === 'icon' ? `Icon · ${value.value}` : value?.kind === 'image' ? t('Embedded image')
      : value?.kind === 'clear' ? t('Remove icons and images') : t('Keep current icons and images');
    apply.disabled = !category.value && !asset;
    resetAsset.disabled = !asset;
  }
  const choose = button(t('Choose icon or image'), () => {
    editHistory.endGroup();
    openImageLibrary({}, (value) => {
      if (!stillSelected()) return false;
      stageAsset(value);
      return true;
    });
  }, { className: 'quiet' });
  const clear = button(t('Remove icons and images'), () => stageAsset({ kind: 'clear' }), { className: 'quiet' });
  const styleTools = node('div', 'clipboard-tools');
  styleTools.append(choose, clear, resetAsset);
  category.addEventListener('change', () => { apply.disabled = !category.value && !asset; });
  stageAsset(undefined);
  style.append(field(t('Category'), category), appliedStyle, styleTools, apply);
  inspector.append(moving, style);
}

selectGroup.addEventListener('click', () => {
  editHistory.endGroup();
  groupSelection = groupSelection ? null : new Set();
  dragSource = null;
  renderSlots();
  renderInspector();
});

pasteGroup.addEventListener('click', () => {
  const page = currentPage();
  const grid = currentGrid();
  const position = selected;
  pasteFromClipboard('group', (group) => {
    if (currentPage() !== page || currentGrid() !== grid || groupSelection) return;
    const positions = placeKeyGroup(group, grid, occupiedCells(grid, page.keys, page.widgets), position);
    if (!positions) throw new Error(t('Choose an upper-left slot where the group fits without overlapping a key or widget.'));
    insertKeyGroup(positions);
  });
});

function moveLayout(from, to) {
  const page = currentPage();
  if (!page.keys[from]) return null;
  const next = page.keys.slice();
  [next[from], next[to]] = [next[to] ?? null, next[from]];
  return placementFits(currentGrid(), next, page.widgets) ? Array.from(next, (key) => key ?? null) : null;
}

function moveKey(from, to) {
  if (from === to) return;
  const layout = moveLayout(from, to);
  if (!layout) {
    notice(t('The keys do not fit in those slots.'), 'error');
    return;
  }
  currentPage().keys = layout;
  selected = to;
  renderSlots();
  renderInspector();
}

function activateSlot(index) {
  if (groupSelection) {
    if (!currentPage().keys[index]) return;
    if (groupSelection.has(index)) groupSelection.delete(index);
    else groupSelection.add(index);
  }
  selected = index;
  renderSlots();
  renderInspector();
  slots.children[selected].focus();
}

slots.addEventListener('keydown', (event) => {
  if (!event.target.matches('.slot') || event.altKey || event.ctrlKey || event.metaKey) return;
  const { cols, rows } = currentGrid();
  const current = Array.prototype.indexOf.call(slots.children, event.target);
  const shifts = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols };
  const step = shifts[event.key] ?? (event.key === 'Home' ? 1 : event.key === 'End' ? -1 : 0);
  if (!step) return;
  event.preventDefault();
  let next = event.key === 'Home' ? 0 : event.key === 'End' ? cols * rows - 1 : current + step;
  while (slots.children[next]?.matches(':disabled, .slot-key-span')) next += step;
  if (next < 0 || next >= slots.children.length) return;
  if (groupSelection) {
    event.target.tabIndex = -1;
    slots.children[next].tabIndex = 0;
    slots.children[next].focus();
  } else {
    activateSlot(next);
  }
});

function addSlotIcon(control, name) {
  if (!name) return;
  if (slotIcons.size >= 128) slotIcons.clear();
  if (!slotIcons.has(name)) slotIcons.set(name, api.previewAsset('icon', name).catch(() => null));
  void slotIcons.get(name).then((svg) => {
    if (!svg || !control.isConnected) return;
    const icon = node('span', 'slot-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.style.setProperty('--slot-icon', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
    control.prepend(icon);
  });
}

function renderSlots() {
  const { cols, rows } = currentGrid();
  const page = currentPage();
  const resolver = createProfileKeys(draft);
  const keyLabel = (key) => {
    if (key?.labelExpression) {
      try { return resolver.runScope(key, page).resolve(key.labelExpression, 'string'); }
      catch { /* Keep the fallback label visible while editing. */ }
    }
    return key?.label || key?.id;
  };
  const origin = coveringKey(selected);
  if (origin >= 0) selected = origin;
  selectGroup.setAttribute('aria-pressed', String(Boolean(groupSelection)));
  pasteGroup.hidden = Boolean(groupSelection);
  slots.style.setProperty('--cols', cols);
  const buttons = Array.from({ length: cols * rows }, (_, index) => {
    const owner = coveringKey(index);
    if (owner >= 0) {
      const label = keyLabel(page.keys[owner]);
      const control = button('↖', () => activateSlot(owner), { className: 'slot slot-key-span' });
      control.setAttribute('aria-label', t('Slot {number}, covered by {label}', { number: index + 1, label }));
      if (groupSelection) control.setAttribute('aria-pressed', String(groupSelection.has(owner)));
      control.title = label;
      control.tabIndex = -1;
      return control;
    }
    const widget = widgetAt(index);
    if (widget) {
      const count = widget.stackId ? page.widgets.filter(({ stackId }) => stackId === widget.stackId).length : 0;
      const name = count > 1 ? `${widgetTabLabel(widget)} · ${count} tabs`
        : widget.settings?.composition?.name ?? t(widgetCatalog[widget.type].name);
      const origin = widget.layout.row * cols + widget.layout.column;
      const control = button(index === origin ? name : '·', () => activateSlot(index), { className: 'slot slot-widget' });
      control.setAttribute('aria-label', t('Slot {number}, {label} widget', { number: index + 1, label: name }));
      control.setAttribute('aria-pressed', String(!groupSelection && index === selected));
      control.disabled = Boolean(groupSelection);
      control.tabIndex = -1;
      return control;
    }
    const key = page.keys[index];
    const label = keyLabel(key);
    const el = button('', () => activateSlot(index), { className: key ? 'slot' : 'slot empty' });
    el.append(node('span', 'slot-label', label ?? '+'));
    if (key?.icon) addSlotIcon(el, key.icon);
    el.dataset.category = key?.category ?? '';
    el.disabled = Boolean(groupSelection && !key);
    el.draggable = Boolean(key && !groupSelection);
    el.setAttribute('aria-label', t(label ? 'Slot {number}, {label}' : 'Slot {number}, empty', { number: index + 1, label }));
    el.setAttribute('aria-pressed', String(groupSelection ? groupSelection.has(index) : index === selected));
    if (label) el.title = label;
    el.tabIndex = -1;
    el.addEventListener('dragstart', (event) => {
      dragSource = index;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
    });
    el.addEventListener('dragend', () => { dragSource = null; });
    el.addEventListener('dragover', (event) => {
      if (dragSource === null) return;
      event.preventDefault();
      el.classList.add('drop');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop'));
    el.addEventListener('drop', (event) => {
      event.preventDefault();
      el.classList.remove('drop');
      if (dragSource !== null) edit(() => moveKey(dragSource, index));
      dragSource = null;
    });
    return el;
  });
  const entry = buttons[selected]?.disabled ? buttons.find((control) => !control.disabled && !control.matches('.slot-key-span'))
    : buttons[selected];
  if (entry) entry.tabIndex = 0;
  slots.replaceChildren(...buttons);
}

function newAction(type) {
  switch (type) {
    case 'launch':
    case 'open': return { type, target: '' };
    case 'workspace': return { type, workspace: '' };
    case 'hotkey': return { type, keys: '' };
    case 'media': return { type, key: 'playpause' };
    case 'spotify-playback': return { type };
    case 'obs-scene': return { type, scene: '', bus: 'program' };
    case 'text': return { type, text: '' };
    case 'delay': return { type, ms: 150 };
    case 'wait-for': return { type, condition: 'foreground', expected: '', timeoutMs: window.LastraActionFlow.WAIT_TIMEOUT.value };
    case 'if': return { type, condition: 'microphones-muted', expected: true, then: newAction('hotkey') };
    case 'sequence': return { type, steps: [newAction('hotkey')] };
    case 'repeat': return { type, count: window.LastraActionFlow.REPEAT_COUNT.value, steps: [newAction('delay')] };
    case 'choose': return { type, id: crypto.randomUUID(), prompt: t('Choose the next step'),
      choices: [newChoice(t('Option 1')), newChoice(t('Option 2'))] };
    case 'random': return { type, id: crypto.randomUUID(), pool: [newAction('hotkey'), newAction('hotkey')] };
    case 'audio': return { type, device: 'microphone' };
    case 'timer': return { type, id: crypto.randomUUID(), label: t('Timer'), durationMs: window.LastraTimers.TIMER_DURATION.value };
    case 'sound': return { type, id: crypto.randomUUID(), file: '' };
    case 'macro': return { type, macro: draft.macros?.[0]?.id ?? '' };
  }
}

function newChoice(label) {
  return { id: crypto.randomUUID(), label, action: newAction('delay') };
}

function localizedOptions(options) {
  return Object.fromEntries(Object.entries(options).map(([id, label]) => [id, t(label)]));
}

function effectiveActionType(action) {
  if (action.type !== 'macro') return action.type;
  try {
    const macros = createMacroResolver(draft.macros);
    const definition = macros.definitions.find(({ id }) => id === action.macro);
    return definition ? macros.sample(definition).type : 'macro';
  }
  catch { return 'macro'; }
}

function actionForm(title, action, replace, depth = 0, sequenceStep = false, insideRepeat = false) {
  const box = node('fieldset');
  const body = node('div', 'action');
  const types = localizedOptions(actionTypes);
  const { WAIT_TIMEOUT, WAIT_CONDITIONS, REPEAT_COUNT, REPEAT_TIMEOUT, CHOICE_LIMIT, CHOICE_TIMEOUT, RANDOM_LIMIT, FAILURE_MODES,
    canRetry } = window.LastraActionFlow;
  if (depth >= 3) {
    delete types.sequence;
    delete types.if;
    delete types.choose;
    delete types.random;
  }
  if (depth >= 3 || insideRepeat) delete types.repeat;
  const update = (key, value) => { action[key] = value; };
  function useValue(key, label, control, fallback = newAction(action.type)[key]) {
    return calculatedField({ label, type: actionValueType(action, key), value: action[key], control,
      update: (value) => {
        const next = value ?? fallback;
        if (next === undefined) delete action[key];
        else update(key, next);
      } });
  }
  const actionField = (key, label, options) => useValue(key, label, () => input(action[key], (value) => update(key, value), options));
  const setType = (type) => {
    if (type === action.type || !typeSelect.isConnected) return;
    const index = [...inspector.querySelectorAll('[data-action-type]')].indexOf(typeSelect);
    const next = newAction(type);
    if (sequenceStep && action.onError === 'continue') next.onError = 'continue';
    if (sequenceStep && action.onError === 'retry' && canRetry(effectiveActionType(next))) {
      next.onError = 'retry';
      next.attempts = action.attempts;
    }
    replace(next);
    renderInspector();
    inspector.querySelectorAll('[data-action-type]')[index]?.focus();
  };
  const typeSelect = select(types, action.type, setType);
  typeSelect.dataset.actionType = '';
  const typeRow = node('div', 'action-type');
  typeRow.append(field(t('Type'), typeSelect), button(t('Browse actions'), () => {
    openActionPalette(Object.keys(types), action.type, (type) => edit(() => setType(type)));
  }, { className: 'quiet' }));
  body.append(typeRow);

  function addConditionFields() {
    const condition = WAIT_CONDITIONS[action.condition];
    const choices = Object.fromEntries(Object.entries(WAIT_CONDITIONS).map(([key, { label }]) => [key, t(label)]));
    body.append(field(t('Condition'), select(choices, action.condition, (value) => {
      update('condition', value);
      update('expected', WAIT_CONDITIONS[value].value);
      renderInspector();
    })));
    body.append(useValue('expected', t(condition.field ?? 'Expected state'), () => condition.field
      ? input(action.expected, (value) => update('expected', value))
      : select({ true: t('Yes'), false: t('No') }, String(action.expected), (value) => update('expected', value === 'true')), condition.value));
  }

  switch (action.type) {
    case 'launch': {
      const reuse = node('input');
      reuse.type = 'checkbox';
      reuse.checked = action.reuseWindow === true;
      reuse.addEventListener('change', () => edit(() => {
        if (reuse.checked) update('reuseWindow', true);
        else delete action.reuseWindow;
      }));
      const args = Array.isArray(action.args) ? action.args : [];
      const resolveArguments = (values) => {
        if (!Array.isArray(values) || values.length > 64) throw new Error('Enter a JSON list of up to 64 arguments.');
        const scope = keyExpressionScope();
        return values.map((value) => {
          if (isExpression(value)) return scope.resolve(value, 'string');
          if (typeof value !== 'string') throw new Error('Each argument needs a string or an expression.');
          return value;
        });
      };
      let argsInput;
      if (args.some(isExpression)) {
        try { argsInput = node('output', 'expression-value', sampleText(resolveArguments(args))); }
        catch (error) { argsInput = node('output', 'status error expression-value', error.message); }
      } else argsInput = input(args.join('\n'), (value) => update('args', value ? value.split('\n') : []), { multiline: true });
      body.append(actionField('target', t('Executable')), field(t('Arguments, one per line'), argsInput), button(t('Argument expressions'), () => {
        editHistory.endGroup();
        openExpressionEditor({ title: t('Argument values'), value: args,
          instructions: 'Enter a JSON list. Each argument can be a string or an expression that returns a string.',
          inspect: (value) => sampleText(resolveArguments(value)), apply: (value) => edit(() => {
            update('args', value);
            renderInspector();
          }) });
      }, { className: 'quiet expression-button' }), actionField('cwd', t('Working directory (optional)')),
      useValue('reuseWindow', t('Switch to an existing window first'), () => reuse));
      break;
    }
    case 'open': body.append(actionField('target', 'URL or path')); break;
    case 'workspace':
      body.append(actionField('workspace', t('Workspace ID'), { placeholder: 'work' }),
        node('p', 'muted', t('Find the workspace ID in Apps → Workspaces.')));
      break;
    case 'hotkey':
      body.append(actionField('keys', t('Shortcut'), { placeholder: 'Ctrl+Shift+M or Ctrl+char:slash' }));
      if (action.notation) body.append(node('p', 'muted', `Source shortcut ${action.notation}`));
      if (action.requiresPhotoshopWorkspace && !action.shortcutGuard) body.append(node('p', 'muted', t('Requires the Photoshop workspace.')));
      break;
    case 'media': body.append(useValue('key', t('Key'), () => select(localizedOptions(mediaKeys), action.key, (value) => update('key', value)))); break;
    case 'spotify-playback': body.append(node('p', 'muted', 'Uses the Spotify desktop media session.')); break;
    case 'obs-scene':
      body.append(actionField('scene', 'OBS scene name', { maxLength: 200 }),
        useValue('bus', t('Scene bus'), () => select({ program: 'Program (Studio Mode off)', preview: 'Preview (Studio Mode on)' },
          action.bus ?? 'program', (value) => update('bus', value))));
      break;
    case 'text': body.append(actionField('text', 'Text', { multiline: true })); break;
    case 'delay':
      body.append(useValue('ms', t('Delay in milliseconds'), () => input(action.ms,
        (value) => update('ms', value === '' ? '' : Number(value)), { type: 'number', min: 0, max: 10000 })));
      break;
    case 'wait-for': {
      addConditionFields();
      const { min, max, value } = WAIT_TIMEOUT;
      body.append(useValue('timeoutMs', t('Timeout in milliseconds'), () => input(action.timeoutMs ?? value,
        (next) => update('timeoutMs', Number(next)), { type: 'number', min, max })));
      break;
    }
    case 'if': {
      addConditionFields();
      body.append(actionForm('If matched', action.then, (value) => update('then', value), depth + 1, false, insideRepeat));
      if (action.else) body.append(actionForm('Otherwise', action.else, (value) => update('else', value), depth + 1, false, insideRepeat));
      body.append(button(action.else ? t('Remove otherwise action') : t('Add otherwise action'), () => edit(() => {
        if (action.else) delete action.else;
        else update('else', newAction('hotkey'));
        renderInspector();
      }), { className: 'quiet' }));
      break;
    }
    case 'choose': {
      body.append(field('Prompt', input(action.prompt, (value) => update('prompt', value), { maxLength: 140 })));
      body.append(useValue('timeoutMs', t('Choice timeout in milliseconds'), () => input(action.timeoutMs ?? CHOICE_TIMEOUT.value,
        (value) => update('timeoutMs', Number(value)), { type: 'number', min: CHOICE_TIMEOUT.min, max: CHOICE_TIMEOUT.max })));
      const choices = node('div', 'steps');
      action.choices.forEach((choice, index) => {
        const item = node('fieldset');
        item.append(node('legend', '', `Option ${index + 1}`), field(t('Button label'), input(choice.label, (value) => { choice.label = value; }, { maxLength: 48 })),
          actionForm(t('Chosen action'), choice.action, (value) => { choice.action = value; }, depth + 1, false, insideRepeat));
        const remove = button(t('Remove option'), () => edit(() => { action.choices.splice(index, 1); renderInspector(); }), { className: 'danger' });
        remove.disabled = action.choices.length <= 2;
        item.append(remove);
        choices.append(item);
      });
      const add = button(t('Add option'), () => edit(() => { action.choices.push(newChoice('New option')); renderInspector(); }));
      add.disabled = action.choices.length >= CHOICE_LIMIT;
      body.append(choices, add);
      break;
    }
    case 'random': {
      const avoid = node('input');
      avoid.type = 'checkbox';
      avoid.checked = action.avoidRepeat === true;
      avoid.addEventListener('change', () => edit(() => {
        if (avoid.checked) update('avoidRepeat', true);
        else delete action.avoidRepeat;
      }));
      body.append(field(t('Never run the same option twice in a row'), avoid));
      const pool = node('div', 'steps');
      action.pool.forEach((option, index) => {
        const item = actionForm(`Option ${index + 1}`, option, (value) => { action.pool[index] = value; }, depth + 1, false, insideRepeat);
        const remove = button(t('Remove option'), () => edit(() => { action.pool.splice(index, 1); renderInspector(); }), { className: 'danger' });
        remove.disabled = action.pool.length <= 2;
        item.append(remove);
        pool.append(item);
      });
      const add = button(t('Add option'), () => edit(() => { action.pool.push(newAction('hotkey')); renderInspector(); }));
      add.disabled = action.pool.length >= RANDOM_LIMIT;
      body.append(pool, add);
      break;
    }
    case 'sound': {
      const { SOUND_COMMANDS, SOUND_AGAIN, SOUND_VOLUME } = window.LastraSounds;
      const stopAll = action.command === 'stop-all';
      body.append(field('Command', select(SOUND_COMMANDS, action.command ?? 'play', (command) => {
        if (command === 'stop-all') replace({ type: 'sound', command });
        else replace(newAction('sound'));
        renderInspector();
      })));
      if (stopAll) break;
      const file = input(action.file, (value) => update('file', value), { placeholder: 'C:\\Sounds\\applause.mp3', maxLength: 260 });
      body.append(field(t('Audio file'), file), button(t('Choose audio file'), async () => {
        const chosen = await window.lastraEditor.chooseSound();
        if (!chosen || !file.isConnected) return;
        edit(() => update('file', chosen));
        renderInspector();
      }, { className: 'quiet' }));
      body.append(field(t('Volume (%)'), input(action.volume ?? SOUND_VOLUME.value, (value) => {
        const volume = Math.round(Number(value));
        if (volume === SOUND_VOLUME.value) delete action.volume;
        else update('volume', volume);
      }, { type: 'number', min: SOUND_VOLUME.min, max: SOUND_VOLUME.max })));
      body.append(field(t('When pressed while playing'), select(SOUND_AGAIN, action.again ?? 'restart', (again) => {
        if (again === 'restart') delete action.again;
        else update('again', again);
      })));
      const outputs = { '': 'Default Windows output', ...(action.output ? { [action.output]: action.output } : {}) };
      const output = select(outputs, action.output ?? '', (value) => {
        if (value) update('output', value);
        else delete action.output;
      });
      body.append(field(t('Play on'), output));
      void window.lastraEditor.soundOutputs().then((labels) => {
        if (!output.isConnected || !Array.isArray(labels)) return;
        for (const label of labels) {
          if (label === action.output) continue;
          const option = document.createElement('option');
          option.value = option.textContent = label;
          output.append(option);
        }
      }).catch(() => {});
      break;
    }
    case 'timer': {
      const { TIMER_KINDS, TIMER_COMMANDS, TIMER_DURATION } = window.LastraTimers;
      const countdown = (action.kind ?? 'countdown') === 'countdown';
      body.append(actionField('label', t('Timer name'), { maxLength: 40 }));
      body.append(field('Kind', select(TIMER_KINDS, action.kind ?? 'countdown', (kind) => {
        if (kind === 'stopwatch') {
          action.kind = kind;
          delete action.durationMs;
        } else {
          delete action.kind;
          action.durationMs ??= TIMER_DURATION.value;
        }
        renderInspector();
      })));
      if (countdown) {
        const total = Math.round((action.durationMs ?? 0) / 1000);
        const set = (minutes, seconds) => update('durationMs', (minutes * 60 + seconds) * 1000);
        const minutes = input(Math.floor(total / 60), (value) => set(Math.max(0, Math.floor(Number(value)) || 0), total % 60),
          { type: 'number', min: 0, max: TIMER_DURATION.max / 60_000 });
        const seconds = input(total % 60, (value) => set(Math.floor(total / 60), Math.max(0, Math.min(59, Math.floor(Number(value)) || 0))),
          { type: 'number', min: 0, max: 59 });
        const row = node('div', 'row');
        row.append(field('Minutes', minutes), field('Seconds', seconds));
        body.append(row);
      }
      body.append(field(t('When pressed'), select(TIMER_COMMANDS, action.command ?? 'toggle', (command) => {
        if (command === 'toggle') delete action.command;
        else action.command = command;
      })));
      break;
    }
    case 'audio':
      body.append(useValue('device', t('Device'), () => select({ output: t('Speakers'), microphone: t('Microphone') },
        action.device, (value) => update('device', value))));
      break;
    case 'macro': {
      const library = draft.macros ?? [];
      const selectedMacro = library.find(({ id }) => id === action.macro);
      const choose = select({ '': t('Choose a shared macro'), ...Object.fromEntries(library.map(({ id, label }) => [id, label])) },
        selectedMacro?.id ?? '', (id) => {
          action.macro = id;
          delete action.args;
          if (!canRetry(effectiveActionType(action)) && action.onError === 'retry') {
            delete action.onError;
            delete action.attempts;
          }
          renderInspector();
        });
      choose.options[0].disabled = true;
      choose.disabled = !library.length;
      body.append(field(t('Shared macro'), choose), button(t('Manage shared macros'), manageMacros, { className: 'quiet' }));
      for (const parameter of selectedMacro?.parameters ?? []) {
        const { id, type, default: fallback } = parameter;
        const current = Object.hasOwn(action.args ?? {}, id) ? action.args[id] : undefined;
        const change = (value) => {
          if (value === '') {
            if (action.args) delete action.args[id];
            return;
          }
          const typed = type === 'integer' ? Number(value) : type === 'boolean' ? value === 'true' : value;
          action.args = { ...action.args, [id]: typed };
        };
        const empty = fallback === undefined ? 'Required' : 'Default ' + String(fallback);
        const control = type === 'boolean' ? select({ '': empty, true: t('Yes'), false: t('No') }, current === undefined ? '' : String(current), change)
          : input(current, change, { type: type === 'integer' ? 'number' : 'text', placeholder: empty });
        body.append(calculatedField({ label: `${id} (${type})`, type, value: current, control: () => control, update: (value) => {
          if (value === undefined) {
            if (action.args) delete action.args[id];
          } else action.args = { ...action.args, [id]: value };
        } }));
      }
      break;
    }
    case 'repeat':
    case 'sequence': {
      if (action.type === 'repeat') {
        body.append(useValue('count', t('Maximum iterations'), () => input(action.count,
          (next) => update('count', Number(next)), { type: 'number', min: REPEAT_COUNT.min, max: REPEAT_COUNT.max })));
        body.append(useValue('timeoutMs', t('Repeat timeout in milliseconds'), () => input(action.timeoutMs ?? REPEAT_TIMEOUT.value,
          (next) => update('timeoutMs', Number(next)), { type: 'number', min: REPEAT_TIMEOUT.min, max: REPEAT_TIMEOUT.max })));
        body.append(field(t('Repeat mode'), select({ fixed: t('Fixed count'), while: t('While condition matches') }, action.condition ? 'while' : 'fixed', (mode) => {
          if (mode === 'while') {
            action.condition = 'foreground';
            action.expected = '';
          } else {
            delete action.condition;
            delete action.expected;
          }
          renderInspector();
        })));
        if (action.condition) addConditionFields();
      }
      const steps = node('div', 'steps');
      action.steps.forEach((step, index) => {
        const item = actionForm(`Step ${index + 1}`, step, (value) => { action.steps[index] = value; }, depth + 1, true,
          insideRepeat || action.type === 'repeat');
        const row = node('div', 'row');
        for (const [offset, text] of [[-1, 'Up'], [1, 'Down']]) {
          const to = index + offset;
          const move = button(text, () => edit(() => {
            [action.steps[index], action.steps[to]] = [action.steps[to], action.steps[index]];
            renderInspector();
          }), { className: 'quiet' });
          move.disabled = to < 0 || to >= action.steps.length;
          row.append(move);
        }
        const remove = button(t('Remove step'), () => edit(() => {
          action.steps.splice(index, 1);
          renderInspector();
        }), { className: 'danger' });
        remove.disabled = action.steps.length <= 1;
        row.append(remove);
        item.append(row);
        steps.append(item);
      });
      const add = button(t('Add step'), () => edit(() => {
        action.steps.push(newAction('hotkey'));
        renderInspector();
      }));
      add.disabled = action.steps.length >= 20;
      body.append(steps, add);
      break;
    }
  }
  if (action.shortcutGuard) {
    const { application, platform, mode, layout, language, minBuild, confirm } = action.shortcutGuard;
    const details = [platform === 'web' ? `${application} installed web app` : `${application} on Windows`,
      language && `Office language ${language}`, layout === 0x04090409 ? 'US keyboard layout' : layout && 'Verified keyboard layout',
      mode, minBuild && `Windows build ${minBuild} or later`, confirm && 'Confirmation required'];
    body.append(node('p', 'muted', details.filter(Boolean).join(' · ')));
  }
  if (action.type === 'hotkey' || action.type === 'text') {
    const targets = input(action.targetApps?.join(', '), (value) => {
      const apps = value.split(',').map((app) => app.trim()).filter(Boolean);
      if (apps.length) update('targetApps', apps);
      else delete action.targetApps;
    }, { placeholder: 'Code.exe, firefox.exe' });
    body.append(field(t('Allowed foreground apps (optional)'), targets));
  }
  if (sequenceStep) {
    const modes = { ...FAILURE_MODES };
    if (!canRetry(effectiveActionType(action))) delete modes.retry;
    body.append(field('If this step fails', select(modes, action.onError ?? 'stop', (value) => {
      if (value === 'stop') delete action.onError;
      else update('onError', value);
      if (value !== 'retry') delete action.attempts;
      renderInspector();
    })));
    if (action.onError === 'retry') body.append(field('Attempts', select({ 2: '2', 3: '3' },
      String(action.attempts ?? 2), (value) => update('attempts', Number(value)))));
  }
  box.append(node('legend', '', title), body);
  return box;
}

function linkedKeyTools(key) {
  const bindings = draft.controlBindings;
  const current = linkedControl(draft, key);
  const box = node('fieldset');
  box.append(node('legend', '', t('Linked control')));
  const refresh = () => { renderSlots(); renderInspector(); };
  if (bindings.length) {
    const choices = { '': 'Choose a linked control', ...Object.fromEntries(bindings.map(({ id, label }) => [id, label])) };
    const picker = select(choices, current?.id ?? '', (id) => {
      if (!id) return;
      const target = bindings.find((entry) => entry.id === id);
      const placement = key ?? { id: crypto.randomUUID(), label: target.label, category: 'app' };
      putKey(selected, linkKey(placement, id));
      refresh();
    });
    picker.options[0].disabled = true;
    box.append(field(key ? t('Use shared actions') : t('Place shared control'), picker));
  }
  if (current) {
    const count = countPlacements(draft, current.id);
    box.append(field(t('Control name'), input(current.label, (value) => { current.label = value; }, { maxLength: 40 })),
      node('p', 'muted', `${count} ${count === 1 ? 'placement uses' : 'placements use'} these actions.`),
      button(t('Make independent'), () => edit(() => {
        putKey(selected, detachKey(draft, key));
        refresh();
      }), { className: 'quiet' }));
  } else if (key) {
    const create = button(t('Create linked control'), () => {
      const binding = controlFromKey(crypto.randomUUID(), key);
      try { createProfileKeys(draft).resolve(binding); }
      catch (error) { notice(error.message, 'error'); return; }
      edit(() => {
        bindings.push(binding);
        putKey(selected, linkKey(key, binding.id));
        refresh();
      });
    }, { className: 'quiet' });
    create.disabled = bindings.length >= MAX_CONTROLS;
    box.append(create);
  }
  return box.childElementCount > 1 ? box : null;
}

function renderInspector() {
  const showAdvanced = inspector.querySelector('.inspector-advanced')?.open;
  const openGestures = new Set([...inspector.querySelectorAll('details[data-gesture][open]')].map(({ dataset }) => dataset.gesture));
  if (groupSelection) {
    renderGroupInspector();
    return;
  }
  const widget = widgetAt(selected);
  if (widget) {
    inspector.replaceChildren(node('h2', '', t(widgetCatalog[widget.type].name)),
      button(t('Edit widget'), () => showWidgets(pageId === BAR_PAGE_ID ? 'bar' : 'page', widget.id), { className: 'primary' }));
    return;
  }
  const key = currentPage().keys[selected];
  const heading = node('div', 'inspector-heading');
  heading.append(node('p', 'muted', t('Slot {number}', { number: selected + 1 })),
    node('h2', '', key ? key.label || t('Untitled key') : t('Empty slot')));
  inspector.replaceChildren(heading);
  const linked = linkedKeyTools(key);
  if (!key) {
    inspector.append(button(t('Add key'), () => edit(() => {
      putKey(selected, { id: crypto.randomUUID(), label: t('New key'), category: 'app', action: newAction('hotkey') });
      inspectorTab = 'actions';
      renderSlots();
      renderInspector();
      inspector.querySelector('[data-inspector-panel="actions"] input')?.focus();
    }), { className: 'primary' }), clipboardKeyTools(key));
    if (linked) inspector.append(linked);
    return;
  }
  const sections = [
    ['actions', 'Actions'], ['appearance', 'Style'], ['layout', 'Placement'],
  ].map(([id, title]) => ({
    id, title: t(title), pane: node('section', { className: 'inspector-panel', dataset: { inspectorPanel: id } }),
  }));
  const [actions, appearance, layoutPanel] = sections.map(({ pane }) => pane);
  const tabs = node('div', { className: 'inspector-tabs', attrs: { role: 'group', 'aria-label': 'Key settings' } });
  function showInspectorTab(id) {
    inspectorTab = id;
    for (const section of sections) {
      section.pane.hidden = section.id !== id;
      section.tab.setAttribute('aria-pressed', String(section.id === id));
    }
  }
  for (const section of sections) {
    section.pane.id = 'inspector-' + section.id;
    section.tab = button(section.title, () => showInspectorTab(section.id), {
      dataset: { inspectorTab: section.id }, attrs: { 'aria-controls': section.pane.id },
    });
    tabs.append(section.tab);
  }
  const tools = clipboardKeyTools(key);
  inspector.append(tools, tabs, actions, appearance, layoutPanel);
  showInspectorTab(inspectorTab);
  const behavior = linkedControl(draft, key) ?? key;
  tools.append(button(t('Test key'), () => {
    editHistory.endGroup();
    try {
      const resolved = createProfileKeys(draft).resolve(key, currentPage());
      openKeyTest(resolved, currentPage().apps ?? [], draft.shortcutLanguage);
    } catch (error) { notice(error.message, 'error'); }
  }, { className: 'quiet' }));
  const textControl = (property, options) => input(key[property], (value) => {
    if (value || property === 'label') key[property] = value;
    else delete key[property];
    if (property === 'label') {
      heading.querySelector('h2').textContent = value || t('Untitled key');
      renderSlots();
    }
  }, options);
  const textField = (property, label, options) => field(label, textControl(property, options));
  const visualField = (property, label, options) => {
    const expression = `${property}Expression`;
    return calculatedField({ label, type: 'string', value: key[expression], visual: true,
      control: () => textControl(property, options), update: (value) => {
        if (value === undefined) delete key[expression];
        else key[expression] = value;
      } });
  };
  const assets = node('div', 'clipboard-tools');
  const chooseImage = button(t('Choose icon or image'), () => {
    editHistory.endGroup();
    openImageLibrary(key, ({ kind, value }) => {
      if (currentPage().keys[selected] !== key) return false;
      edit(() => {
        applyKeyAppearance(key, { asset: { kind, value } });
        renderSlots();
        renderInspector();
      });
      return true;
    });
  }, { className: 'quiet' });
  chooseImage.id = 'choose-key-image';
  assets.append(chooseImage);
  const embedded = typeof key.image === 'string' && key.image.startsWith('data:image/png;base64,');
  if (embedded) assets.append(button(t('Remove embedded image'), () => edit(() => {
    delete key.image;
    renderSlots();
    renderInspector();
  }), { className: 'quiet' }));
  appearance.append(
    visualField('label', 'Label', { maxLength: 40 }),
    field(t('Category'), select(localizedOptions(categories), key.category, (value) => { key.category = value; renderSlots(); })),
    visualField('icon', t('Lucide icon name'), { maxLength: 60, placeholder: 'folder' }),
    ...(embedded ? [] : [textField('image', t('Custom image path'))]), assets,
    field(t('Key value'), select(localizedOptions(window.LastraKeyReadouts.READOUTS), key.readout ?? 'auto', (value) => {
      if (value === 'auto') delete key.readout;
      else key.readout = value;
    })),
  );
  const advanced = node('details', 'inspector-advanced');
  advanced.open = Boolean(showAdvanced);
  advanced.append(node('summary', '', t('Advanced actions')),
    button(t('Run variables'), () => manageVariables('run', key, 'runVariables'), { className: 'quiet' }));
  if (linked) advanced.append(linked);
  const repeat = select({ auto: t('Automatic'), true: t('Repeat the tap'), false: t('One tap only') },
    String(behavior.repeatOnHold ?? 'auto'), (mode) => {
      if (mode === 'auto') delete behavior.repeatOnHold;
      else behavior.repeatOnHold = mode === 'true';
    });
  const repeatField = field(t('Hold repeat'), repeat);
  function syncRepeat(edited = false) {
    const supported = canRepeatTap(behavior);
    if (edited && !supported && behavior.repeatOnHold === true) delete behavior.repeatOnHold;
    repeat.value = String(behavior.repeatOnHold ?? 'auto');
    repeatField.hidden = !supported;
  }
  advanced.append(field(t('While running'), select({ ignore: t('Ignore extra presses'), 'queue-one': t('Queue one press') }, behavior.onBusy ?? 'ignore', (value) => {
    if (value === 'ignore') delete behavior.onBusy;
    else behavior.onBusy = value;
    syncRepeat(true);
  })));
  const confirmation = behavior.confirm === true ? 'hold' : behavior.confirm?.mode ?? 'none';
  const confirmModes = { ...(!behavior.action.shortcutGuard?.confirm ? { none: 'None' } : {}),
    hold: 'Hold to confirm', prompt: 'Ask before running' };
  const confirm = select(localizedOptions(confirmModes), confirmation, (mode) => {
    if (mode === 'none') delete behavior.confirm;
    else behavior.confirm = { mode };
    syncRepeat(true);
    renderInspector();
  });
  confirm.disabled = Boolean(behavior.hold || behavior.double);
  advanced.append(field(t('Confirmation'), confirm));
  if (confirm.disabled) advanced.append(node('p', 'muted', t('Remove long press and double tap to use confirmation.')));
  if (confirmation === 'hold') {
    const options = gestureOptions.confirmMs ?? { min: 250, max: 3000, value: 650 };
    const ms = input(behavior.confirm?.holdMs, (value) => {
      behavior.confirm = value === '' ? { mode: 'hold' } : { mode: 'hold', holdMs: Number(value) };
    }, { type: 'number', min: options.min, max: options.max,
      placeholder: String(draft.gestures?.confirmMs ?? options.value) });
    advanced.append(field(t('Hold duration (ms, optional)'), ms));
  }
  const tapForm = actionForm(behavior.confirm ? t('Confirmed action') : t('Tap'), behavior.action, (value) => {
    behavior.action = value;
    syncRepeat(true);
  });
  tapForm.addEventListener('input', () => syncRepeat());
  tapForm.addEventListener('change', () => syncRepeat(true));
  syncRepeat();
  advanced.append(repeatField);
  actions.append(tapForm);

  for (const [property, title] of [['hold', 'Long press'], ['double', 'Double tap']]) {
    if (behavior.confirm) break;
    if (behavior[property]) {
      const form = actionForm(t(title), behavior[property], (value) => { behavior[property] = value; });
      form.append(button(t('Remove gesture'), () => edit(() => {
        delete behavior[property];
        renderInspector();
      }), { className: 'quiet' }));
      const gesture = node('details', 'inspector-advanced');
      gesture.dataset.gesture = property;
      gesture.open = openGestures.has(property);
      gesture.append(node('summary', '', t(title)), form);
      actions.append(gesture);
    } else {
      actions.append(button(t(property === 'hold' ? 'Add long press' : 'Add double tap'), () => edit(() => {
        behavior[property] = newAction('hotkey');
        syncRepeat(true);
        renderInspector();
        const gesture = inspector.querySelector(`[data-gesture="${property}"]`);
        gesture.open = true;
        gesture.querySelector('select')?.focus();
      }), { className: 'quiet' }));
    }
  }
  actions.append(advanced);

  const grid = currentGrid();
  const placement = keyLayout(key, selected, grid);
  const width = input(placement.cols, null, { type: 'number', min: 1, max: grid.cols - placement.column });
  const height = input(placement.rows, null, { type: 'number', min: 1, max: grid.rows - placement.row });
  const size = node('div', 'row');
  const applySize = button(t('Apply key size'), () => {
    if (!width.value || !height.value || !width.reportValidity() || !height.reportValidity()) return;
    const cols = Number(width.value);
    const rows = Number(height.value);
    const page = currentPage();
    const proposal = page.keys.slice();
    proposal[selected] = { ...key, span: { cols, rows } };
    if (!placementFits(grid, proposal, page.widgets)) {
      notice(t('The key size overlaps another key or widget.'), 'error');
      return;
    }
    edit(() => {
      if (cols === 1 && rows === 1) delete key.span;
      else key.span = { cols, rows };
      renderSlots();
      renderInspector();
    });
  }, { className: 'quiet' });
  size.append(field(t('Width in cells'), width), field(t('Height in cells'), height), applySize);
  layoutPanel.append(size);
  const positions = Object.fromEntries(Array.from({ length: grid.cols * grid.rows }, (_, i) => [i, i + 1])
    .filter(([index]) => index === selected || moveLayout(selected, index)));
  const move = select(positions, selected, (value) => moveKey(selected, Number(value)));
  layoutPanel.append(field(t('Move to slot'), move), button(t('Remove key'), () => edit(() => {
    putKey(selected, null);
    renderSlots();
    renderInspector();
  }), { className: 'danger' }));
}

function makeDraft(profile) {
  const { name, locale, shortcutLanguage, grid, gestures, pages, bar, webApps, shortcutOverrides, shortcutLayouts, widgetPresets } = profile;
  return { name, locale, shortcutLanguage, grid, gestures, pages, bar: { keys: [], widgets: [], ...bar },
    controlBindings: profile.controlBindings ?? [],
    macros: profile.macros ?? [],
    ...(profile.variables?.length ? { variables: profile.variables } : {}),
    webApps: webApps ?? [], shortcutOverrides: shortcutOverrides ?? {}, shortcutLayouts: shortcutLayouts ?? {}, widgetPresets: widgetPresets ?? [] };
}

function readSnapshot(snapshot, savedFrom = null) {
  draft = makeDraft(snapshot.profile);
  profileActivity = snapshot.activity;
  gestureOptions = snapshot.gestureOptions ?? {};
  draftText = JSON.stringify(draft);
  token = snapshot.token;
  diskWarning = snapshot.warning;
  if (savedFrom) editHistory.markSaved(savedFrom, editorState());
  else {
    groupSelection = null;
    editHistory.reset(draftText);
  }
  if (pageId !== BAR_PAGE_ID && !draft.pages.some(({ id }) => id === pageId)) pageId = draft.pages[0].id;
  const activeGrid = currentGrid();
  selected = Math.min(selected, activeGrid.cols * activeGrid.rows - 1);
  renderProfileSettings();
  renderPage();
  updateControls();
  showDraftStatus();
}

async function load() {
  if (busy) return;
  editHistory.endGroup();
  busy = true;
  updateControls();
  try {
    readSnapshot(await api.load());
  } catch (err) {
    notice(err.message, 'error');
  } finally {
    busy = false;
    updateControls();
  }
}

async function acceptAgentDraft(explicit = false) {
  if (!pendingAgentDraft || busy || (dirty && !explicit) || document.querySelector('dialog[open]')) return;
  const proposal = pendingAgentDraft;
  pendingAgentDraft = null;
  busy = true;
  updateControls();
  try {
    const saved = await api.load();
    if (saved.active === false || saved.warning || saved.token !== proposal.baseVersion || (dirty && token !== saved.token)) {
      throw new Error(t('The saved profile changed. Request a fresh agent draft.'));
    }
    if (!draft || token !== saved.token) readSnapshot(saved);
  } catch (error) {
    notice(error.message, 'error');
    return;
  } finally {
    busy = false;
    updateControls();
  }
  editHistory.endGroup();
  edit(() => {
    draft = makeDraft(proposal.profile);
    pageId = proposal.page;
    selected = 0;
    groupSelection = null;
    dragSource = null;
    renderProfileSettings();
    renderPage();
  });
  notice(t(dirty ? 'Agent draft opened with unsaved changes.' : 'Agent draft page opened.'));
}

function actionProblem(action) {
  if (action.type === 'choose') {
    try { window.LastraActionFlow.choiceFields(action); }
    catch (error) { return error.message; }
    return action.choices.map((choice) => actionProblem(choice.action)).find(Boolean) ?? null;
  }
  if (action.type === 'random') {
    try { window.LastraActionFlow.randomFields(action); }
    catch (error) { return error.message; }
    const errors = action.pool.map(actionProblem);
    const i = errors.findIndex(Boolean);
    return i < 0 ? null : `option ${i + 1}, ${errors[i]}`;
  }
  if (action.type === 'sequence' || action.type === 'repeat') {
    if (action.type === 'repeat') {
      try { window.LastraActionFlow.repeatFields(action); }
      catch (error) { return error.message; }
    }
    const errors = action.steps.map(actionProblem);
    const i = errors.findIndex(Boolean);
    return i < 0 ? null : `step ${i + 1}, ${errors[i]}`;
  }
  if (action.type === 'if') return actionProblem(action.then) ?? (action.else ? actionProblem(action.else) : null);
  if (action.type === 'sound') {
    try { window.LastraSounds.soundFields(action); }
    catch (error) { return error.message.charAt(0).toLowerCase() + error.message.slice(1); }
    return null;
  }
  if (action.type === 'timer') {
    try { window.LastraTimers.timerFields(action); }
    catch (error) { return error.message.charAt(0).toLowerCase() + error.message.slice(1); }
    return null;
  }
  const required = { launch: 'target', open: 'target', workspace: 'workspace', hotkey: 'keys', text: 'text' }[action.type];
  if (required && (typeof action[required] !== 'string' || !action[required].trim())) {
    return `complete the field for “${actionTypes[action.type]}”`;
  }
  const ms = Number(action.ms);
  if (action.type === 'delay' && (action.ms === '' || !Number.isFinite(ms) || ms < 0 || ms > 10000)) {
    return 'enter a delay from 0 to 10,000 ms';
  }
  return null;
}

async function saveProfile() {
  if (!draft || save.disabled) return;
  const resolver = createProfileKeys(draft);
  for (const page of [...draft.pages, { ...draft.bar, id: BAR_PAGE_ID, name: 'Persistent bar' }]) {
    for (const placement of page.keys.filter(Boolean)) {
      try {
        const key = resolver.resolve(placement, page);
        const error = [key.action, key.hold, key.double].filter(Boolean).map(actionProblem).find(Boolean);
        if (!error) continue;
        notice(`${page.name} / ${key.label || key.id}: ${error}`, 'error');
        return;
      } catch (error) {
        notice(`${page.name} / ${placement.label || placement.id}: ${error.message}`, 'error');
        return;
      }
    }
  }
  const savedFrom = editorState();
  editHistory.endGroup();
  busy = true;
  updateControls();
  try {
    const snapshot = await api.save(draft, token);
    readSnapshot(snapshot, savedFrom);
    notice(snapshot.active === false ? t('Profile saved') : t('Profile saved and applied to the deck'), 'ok');
  } catch (err) {
    notice(err.message, 'error');
  } finally {
    busy = false;
    updateControls();
  }
}

function listBackupVersions({ versions, warning }) {
  const backupDate = new Intl.DateTimeFormat(document.documentElement.lang, { dateStyle: 'medium', timeStyle: 'short' });
  backupVersions.replaceChildren(...versions.map((version) => {
    const entry = node('div', 'backup-version');
    const meta = node('div', 'backup-meta');
    const date = node('time', 'muted', backupDate.format(version.savedAt));
    date.dateTime = new Date(version.savedAt).toISOString();
    meta.append(node('strong', '', version.name), date);
    if (version.source === 'before-english') meta.append(node('span', 'muted', t('Before English upgrade')));
    else if (version.source === 'before-compact-home') meta.append(node('span', 'muted', t('Before Home compaction')));
    else if (version.source === 'legacy') meta.append(node('span', 'muted', t('Previous save')));
    const restore = button('Restore', () => restoreBackup(version));
    restore.setAttribute('aria-label', `Restore ${version.name}, ${date.textContent}`);
    entry.append(meta, restore);
    return entry;
  }));
  backupStatus.textContent = warning || (versions.length ? '' : 'No saved backups are available.');
}

async function showBackups() {
  if (busy || backupsDialog.open) return;
  editHistory.endGroup();
  backupVersions.replaceChildren();
  backupStatus.textContent = t('Loading backups…');
  backupsDialog.showModal();
  busy = true;
  updateControls();
  try {
    listBackupVersions(await api.listBackups());
  } catch (err) {
    backupStatus.textContent = err.message;
  } finally {
    busy = false;
    updateControls();
    if (backupsDialog.open) closeBackups.focus();
  }
}

async function restoreBackup(version) {
  if (busy) return;
  const confirm = t(dirty ? 'Restore this backup and discard unsaved changes?' : 'Restore this backup for this profile?');
  if (!window.confirm(confirm)) return;
  editHistory.endGroup();
  backupStatus.textContent = t('Restoring backup…');
  busy = true;
  updateControls();
  try {
    const snapshot = await api.restoreBackup(version.id, token);
    readSnapshot(snapshot);
    backupsDialog.close();
    notice(snapshot.active === false ? t('Backup restored') : t('Backup restored and applied to the deck'), 'ok');
  } catch (err) {
    backupStatus.textContent = err.message;
  } finally {
    busy = false;
    updateControls();
  }
}

save.addEventListener('click', saveProfile);
editorMenu.addEventListener('click', (event) => {
  if (event.target.closest('button:not(:disabled)')) editorMenu.open = false;
});
document.addEventListener('pointerdown', (event) => {
  if (editorMenu.open && !editorMenu.contains(event.target)) editorMenu.open = false;
});
editorMenu.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !editorMenu.open) return;
  editorMenu.open = false;
  editorMenu.querySelector('summary').focus();
});
undo.addEventListener('click', () => stepHistory(false));
redo.addEventListener('click', () => stepHistory(true));
reload.addEventListener('click', () => {
  if (!dirty || window.confirm(t('Discard your changes and reload the file?'))) load();
});
backups.addEventListener('click', showBackups);
closeBackups.addEventListener('click', () => backupsDialog.close());
backupsDialog.addEventListener('cancel', (event) => {
  if (busy) event.preventDefault();
});
addPage.addEventListener('click', () => edit(() => {
  const id = crypto.randomUUID();
  draft.pages.push({ id, name: t('Page {number}', { number: draft.pages.length + 1 }), apps: [], keys: [] });
  switchPage(id);
  pageSettings.open = true;
  pageFields.querySelector('input')?.select();
}));
document.addEventListener('lastra-language', () => {
  if (!draft) return;
  renderProfileSettings();
  renderPage();
  showDraftStatus();
});
window.addEventListener('keydown', (e) => {
  if (workspace.hidden || !e.ctrlKey || e.altKey || e.metaKey || e.isComposing || document.querySelector('dialog[open]')) return;
  const key = e.key.toLowerCase();
  if (key === 's') {
    e.preventDefault();
    saveProfile();
  }
  if ((key === 'z' || key === 'y') && !e.target.matches?.('[data-pending-edit]')) {
    e.preventDefault();
    stepHistory(key === 'y' || e.shiftKey);
  }
});
agentDraftOpen.addEventListener('click', () => void acceptAgentDraft(true));
document.addEventListener('close', () => { if (pendingAgentDraft) updateControls(); }, true);
api.onAgentDraft((proposal) => {
  pendingAgentDraft = proposal;
  updateControls();
});
window.addEventListener('beforeunload', (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = false;
  }
});

load();
