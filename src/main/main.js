// @ts-check
'use strict';

// Lastra's main process opens a non-activating window on the XENEON EDGE.
// It owns the profile and runs actions requested by key ID from the renderer.

const { app, BrowserWindow, clipboard, desktopCapturer, dialog, screen, ipcMain, Tray, Menu, nativeImage, powerMonitor, session, shell,
  WebContentsView, protocol, net, safeStorage, globalShortcut } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');

const { Feeds } = require('./feeds');
const { readSettings } = require('./configuration-backup');
const { findEdgeDisplay, describeDisplay } = require('./display');
const { DisplayBacklight } = require('./display-backlight');
const { DisplayBacklightWidgets } = require('./display-backlight-widgets');
const { restoreDeckWindow, watchDeckDisplay } = require('./display-lifecycle');
const { DeckAppearance } = require('./deck-appearance');
const { createWindowsStartup } = require('./windows-startup');
const { readTouchDevices } = require('./touch-win32');
const { buildDiagnostics, saveDiagnostics } = require('./diagnostics');
const { PanelMeasurements } = require('./panel-measurement');
const { createPanelPointerReader } = require('./panel-pointer-win32');
const { toView, confirmationMode } = require('./profile');
const { isRetiredStockPageId } = require('./retired-stock-pages');
const { profileTemplates } = require('./profile-templates');
const { declarePreviewScheme, servePreviewAssets } = require('./preview-protocol');
const { previewAudio, previewSensors, previewStats, previewObs, PreviewMedia } = require('./editor-preview-state');
const { decodeEditorClipboard, encodeEditorClipboard } = require('./editor-clipboard');
const { encodeExchange, prepareExchange, suggestedName, readExchangeFile, writeExchangeFile } = require('./profile-exchange');
const { readStreamDeckProfile } = require('./stream-deck-import');
const { Pages, runPageAction } = require('./pages');
const { packFor, previewPacks } = require('./shortcut-packs');
const { normalizeOverrideChord } = require('./shortcut-overrides');
const { actionNeedsShortcutTarget, hasShortcutRule, sameShortcutWindow, shortcutUnavailable } = require('./shortcut-guards');
const { shortcutGuardForAction } = require('../shared/shortcut-library');
const { normalizeWebApp } = require('./shortcut-packs-web');
const { DeckNavigation, CALENDARS, CONTEXT_RETURN_CHOICES } = require('./deck-navigation');
const { DeckShortcuts, VIEW_LABELS, stepDestination } = require('./deck-shortcuts');
const { Pomodoro } = require('./pomodoro');
const { Timers } = require('./timers');
const { DEFAULT_CHOICES, normalizeChoices } = require('../shared/decisions');
const { readJsonSettings, writeJsonSettings } = require('./json-settings-file');
const { InterfaceLanguage, matchesInterfaceUrl } = require('./interface-language');
const { translate } = require('../shared/i18n');
const { Soundboard } = require('./soundboard');
const { SOUND_TYPES } = require('../shared/sounds');
const { DashboardAgenda } = require('./dashboard-agenda');
const { DeckPageLists } = require('./deck-page-lists');
const { ChoicePrompts } = require('./choice-prompts');
const { DeckViewOnly, deckRequestAllowed, BLOCKED: VIEW_ONLY_BLOCKED } = require('./deck-view-only');
const { DeckSession, SESSION_BLOCKED } = require('./deck-session');
const { DeckReveal, BLOCKED: REVEAL_BLOCKED } = require('./deck-reveal');
const { EmojiUsage, insertEmoji } = require('./deck-emoji');
const { fixedEditingKeys } = require('./fixed-editing-keys');
const { ACTIVITIES, ActivityProfiles } = require('./activity-profiles');
const { KeyPresses, IGNORED } = require('./key-presses');
const { LinkedControlRuntime, changeObsScene } = require('./linked-control-runtime');
const { KeyConfirmation } = require('./key-confirmation');
const { lucideIcon, shortcutPackIcons, imageDataUrl } = require('./icons');
const { ImageLibrary } = require('./image-library');
const { SensorPoller } = require('./sensors');
const { StatsMonitor, GROUPS: STATS_GROUPS } = require('./stats');
const { ProcessTelemetry } = require('./process-telemetry');
const { StatsSelection, readingChoices } = require('./stats-selection');
const { SensorWidgetSamples, checkedSensorIds } = require('./sensor-widget-samples');
const { IncidentTimeline } = require('./incident-timeline');
const { HardwareMonitor } = require('./hardware-monitor');
const { createLogger, guarded } = require('./logger');
const { setSecretStorage } = require('./sealed-secret');
const { disposeSharedPowerShell } = require('./powershell-worker');
const { ResourceMonitor } = require('./resource-monitor');
const { PowerStatus, createPowerReader } = require('./power-status');
const { MonitoringWatchlist } = require('./monitoring-watchlist');
const { MonitoringSettings } = require('./monitoring-settings');
const { RetainedTelemetry } = require('./retained-telemetry');
const { createProcessReader } = require('./process-metrics-win32');
const { createActionRunner, expandPathEnv } = require('./actions');
const { createInput } = require('./actions/input-win32');
const { createAudio } = require('./audio-win32');
const { AudioPresets } = require('./audio-presets');
const { PushToTalk } = require('./push-to-talk');
const { startMicGuard } = require('./ptt-guard');
const { AppMixerPins } = require('./app-mixer-pins');
const { createForegroundReader } = require('./foreground-win32');
const { createLinuxDesktop, linuxForeground, linuxInput, DECK_WINDOW_TITLE } = require('./desktop-linux');
const { createWindowShortcutMode } = require('./window-shortcut-mode');
const { Obs } = require('./obs');
const { ProductionTimers } = require('./production-timers');
const { ProductionModes } = require('./production-modes');
const { NavigationBadges } = require('./navigation-badges');
const { WindowsMedia } = require('./windows-media');
const { seekVerified } = require('./verified-media-seek');
const { AppViews } = require('./app-views');
const { IntegrationSetup, integrationSetupActions, cachedSpotifySetup } = require('./integration-setup');
const { VscodeView } = require('./app-view-vscode');
const { ProjectPalette } = require('./app-view-projects');
const { createAppWindowReader } = require('./app-windows-win32');
const { Workspaces } = require('./workspaces');
const { GitHubChecksView } = require('./app-view-github');
const { createAppWindowIcons } = require('./app-window-icons');
const { WslProvider } = require('./app-view-wsl');
const { ServiceHealth } = require('./service-health');
const { watchMonitorConfig } = require('./monitoring-config');
const { SyncthingView } = require('./app-view-syncthing');
const { PrometheusView } = require('./app-view-prometheus');
const { KubernetesView } = require('./app-view-kubernetes');
const { SpotifyView } = require('./app-view-spotify');
const { SpotifyAccount } = require('./spotify-account');
const { ChatGptView } = require('./app-view-chatgpt');
const { ClaudeView } = require('./app-view-claude');
const { SnippetLibrary } = require('./snippet-library');
const { ClipboardPins } = require('./clipboard-pins');
const { NetflixView } = require('./app-view-netflix');
const { StreamingWatchlist } = require('./app-view-watchlist');
const { TerminalView } = require('./app-view-terminal');
const { NotesView } = require('./app-view-notes');
const { AlertInbox } = require('./alert-inbox');
const { ActionHistory, stepResults } = require('./action-history');
const { AgentAccess } = require('./mcp-access');
const { RunActivity } = require('./mcp-run-activity');
const { AgentService } = require('./mcp-service');
const { AgentEvents } = require('./mcp-events');
const { NavigationRequestError, navigationSurface } = require('./mcp-navigation');
const { describeLayoutView } = require('./mcp-layout');
const { profileSnapshot } = require('./mcp-snapshot');
const { providerStatus } = require('./mcp-catalog');
const { AgentDrafts, DraftRequestError } = require('./mcp-drafts');
const { AgentChoices } = require('./mcp-choices');
const { AgentAppViewDrafts } = require('./mcp-app-view-drafts');
const { AgentMonitoringDrafts } = require('./mcp-monitoring-drafts');
const { AgentGestureFixtures } = require('./mcp-gesture-fixtures');
const { AgentActions, AgentActionError, actionReviewDetails } = require('./mcp-actions');
const { readTelemetry } = require('./mcp-telemetry');
const { AgentAudioReader } = require('./mcp-audio');
const { AgentAudioActions } = require('./mcp-audio-actions');
const { AgentAudioRouting } = require('./mcp-audio-routing');
const { AgentAppAudio } = require('./mcp-app-audio');
const { AgentWindowsMediaActions } = require('./mcp-windows-media-actions');
const { AgentSpotifyActions } = require('./mcp-spotify-actions');
const { AgentMediaReader } = require('./mcp-media');
const { AgentObsActions } = require('./mcp-obs-actions');
const { AgentWorkspaceInventory } = require('./mcp-workspaces');
const { AgentProjects } = require('./mcp-projects');
const { AgentProjectActions } = require('./mcp-project-actions');
const { AgentWorkspaceApply } = require('./mcp-workspace-apply');
const { AgentAlertAck } = require('./mcp-alert-ack');
const { AgentVisualPreview } = require('./mcp-visual-preview');
const { createAgentDeckRenderer } = require('./mcp-deck-render');
const { AgentProfileApply } = require('./mcp-apply');
const { AgentActivitySwitch } = require('./mcp-activity-switch');
const { createAgentReview } = require('./mcp-review-window');
const { simulateAction } = require('./action-test');
const { DockerProvider } = require('./app-view-docker');
const { TelemetryThresholds } = require('./telemetry-thresholds');
const { WebEmbeds } = require('./app-view-web-embeds');
const { WebEmbedHost } = require('./web-embed-host');
const { parseArgs } = require('./cli');
const { createDisposables } = require('./disposables');
const { createPowerEvents } = require('./power-events');
const { startPreview } = require('./preview-harness');
const { createTrayMenu } = require('./tray-menu');
const { readMaintenance, runMaintenance } = require('./desktop-maintenance');
const { createUpdater } = require('./updater');

const ROOT = path.join(__dirname, '..', '..');
const RENDERER = path.join(ROOT, 'src', 'renderer', 'index.html');
const PRELOAD = path.join(ROOT, 'src', 'preload', 'preload.js');
const EDITOR = path.join(ROOT, 'src', 'editor', 'index.html');
const EDITOR_PRELOAD = path.join(ROOT, 'src', 'preload', 'editor.js');
const SOUND_HOST = path.join(ROOT, 'src', 'sound', 'index.html');
const SOUND_PRELOAD = path.join(ROOT, 'src', 'preload', 'sound-host.js');
const DEFAULT_PROFILE = path.join(ROOT, 'profiles', 'default.json');
const BACKGROUND = '#171c21';
const APP_ID = 'lastra.deck';

const opts = parseArgs(process.argv.slice(1));
const log = createLogger({ directory: () => app.getPath('logs') });
process.on('uncaughtException', (err) => log('Uncaught exception:', err?.stack ?? err));
process.on('unhandledRejection', (reason) => log('Unhandled rejection:', /** @type {any} */ (reason)?.stack ?? reason));
// Every exit path (quit, lost XENEON EDGE, failed startup) releases what start() registers here.
const disposables = createDisposables(log);
const startup = createWindowsStartup(app, { appId: APP_ID, executable: process.execPath, root: ROOT });

let win = null;
let editor = null;
let trayMenu = null;
let updater = null;
let store = null;
let sensors = null;
let stats = null;
let processTelemetry = null;
let statsSelection = null;
let sensorWidgets = null;
let incidentTimeline = null;
let monitoring = null;
let retainedTelemetry = null;
let hardware = null;
let runner = null;
let obs = null;
let productionTimers = null;
let productionModes = null;
let navigationBadges = null;
let nowPlaying = null;
let appViews = null;
let integrationSetup = null;
let terminalView = null;
let serviceHealth = null;
let kubernetesView = null;
let telemetryThresholds = null;
let webEmbedHost = null;
let edge = null;
let edgeExit = false;
let deckReady = false;
let displayWatcher = null;
let audio = null;
let pushToTalk = null;
let appMixerPins = null;
let readForeground = null;
let linuxDesktop;
let foregroundTimer = null;
let exportingDiagnostics = false;
let panelMeasurement = null;
let preferredDisplay = opts.display;
let liveAudio = null;
let audioVersion = 0;
let liveSensors = null;
let profileError = null;
let deckContext = {};
let deckSheet = 0;
/** @type {DeckShortcuts | undefined} */
let deckShortcuts;
/** @type {string[]} */
let recentDeckPages = [];
let deckStatsTab = 'overview';
let deckHeaderIcon;
let readWindowIcons;
let navigation = null;
let pomodoro = null;
let timers = null;
let soundboard = null;
let toolChoices = DEFAULT_CHOICES;
let dashboardAgenda = null;
let pageLists = null;
let viewOnly = null;
let deckReveal = null;
let emojiUsage = null;
let appearance = null;
let feeds = null;
let interfaceLanguage = null;
let activities = null;
let agentAccess = null;
let agentService = null;
let agentWorkspaceApply = null;
let agentAlertAck = null;
let agentObsActions = null;
let agentObsOutputs = null;
let agentAudioActions = null;
let agentAudioMuteActions = null;
let agentAudioRouting = null;
let agentAppAudio = null;
let agentProjects = null;
let agentWindowsMedia = null;
let agentSpotifyActions = null;
let agentEvents = null;
let agentPlaybackAt = 0;
let agentPlaybackPending = false;
let agentPlaybackArtwork;
let agentDrafts = null;
let agentGestureFixtures = null;
let agentActions = null;
let agentApply = null;
let agentChoices = null;
let agentActivitySwitch = null;
let agentRuns = null;
let editorProfile = null;
const pages = new Pages();
const keyPresses = new KeyPresses();
const FLOW_PROGRESS_TYPES = new Set(['sequence', 'repeat', 'if', 'choose', 'random', 'delay', 'wait-for']);
const runningFlows = new Map();
const choicePrompts = new ChoicePrompts((view) => send('key:choice', view));
let windowsSessionRevision = 0;
const deckSession = new DeckSession();
const displayBacklight = new DisplayBacklight({
  getWindow: backlightWindow, canWrite: () => !viewOnly.enabled,
  onWidgetUpdate: (reason) => send('display:backlight:widgets:update', reason),
});
const displayBacklightWidgets = new DisplayBacklightWidgets(displayBacklight);
const linkedControls = new LinkedControlRuntime((scope, pending) => {
  if (scope === store?.file) send('controls:pending', pending);
}, keyPresses);
const keyConfirmation = new KeyConfirmation();
const actionHistory = new ActionHistory({ onRecord(entry, activity) {
  if (activity && (entry.origin === 'deck' || entry.origin === 'agent')) {
    const { origin, outcome, gesture, stepCount } = entry;
    publishAgentEvent('action', { origin, outcome, gesture, stepCount }, activity);
  }
} });
const previewMedia = new PreviewMedia();

const webPreferences = {
  preload: PRELOAD,
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  spellcheck: false,
  backgroundThrottling: false,
};

function foregroundShortcutTarget() {
  return pages.foregroundPresent ? pages.foreground : null;
}

function shortcutUnavailableHere(action, context = foregroundShortcutTarget()) {
  const guard = shortcutGuardForAction(action);
  if (guard) {
    const { webApps, shortcutLanguage } = store.current;
    const activePack = packFor(context, webApps);
    for (const step of action.type === 'sequence' ? action.steps : [action]) {
      const unavailable = shortcutUnavailable(guard, { context, activePack, shortcutLanguage, keys: step.keys })
        ?? runner?.hotkeyProblem(step, context);
      if (unavailable) return unavailable;
    }
    return undefined;
  }
  return runner?.hotkeyProblem(action, context);
}

function currentView() {
  const { page, reason } = pages.selection(store.current);
  const { active } = pages.binding(page);
  const editingTarget = foregroundShortcutTarget();
  const view = toView(store.current, { icon: lucideIcon, image: imageDataUrl, page,
    unavailable: (key) => shortcutUnavailableHere(key.action),
    editingKeys: fixedEditingKeys(store.current, editingTarget, { pageActive: active }), foregroundExecutable: editingTarget?.executable });
  return {
    ...view,
    uiLanguage: interfaceLanguage?.language ?? 'en',
    linkedPending: linkedControls.snapshot(store.file),
    page: page.id,
    pageName: page.name,
    pageMatch: { reason, priority: page.priority ?? 0 },
    pageIcon: deckHeaderIcon?.revision === pages.revision ? deckHeaderIcon.source : null,
    generatedPage: Boolean(page.generated),
    targetUnavailable: !active,
    manualPage: pages.manualPage(store.current).id,
    activity: activities?.snapshot(),
    deckView: opts.preview && opts.stats ? 'stats'
      : navigation?.current.view === 'obs' && !obs?.enabled ? 'keys' : navigation?.current.view,
    deckStatsTab,
    viewOnly: viewOnly?.enabled === true,
    sessionBlocked: deckSession.blocked,
    desktopRevealGesture: navigation?.current.desktopRevealGesture === true,
    desktopRevealed: deckReveal?.active === true,
    pageShortcuts: pageLists?.snapshot(activities.current.id, store.current.pages),
    deckSheet,
    revision: pages.revision,
    locked: pages.locked,
    followsApps: Boolean(readForeground?.context) || store.current.pages.some((item) => item.apps.length || item.appIds?.length),
    pages: store.current.pages.map(({ id, name, folder }) => ({ id, name, folder })),
  };
}

function publishAgentEvent(type, data, activity = activities?.current?.id) {
  if (activity && agentAccess?.state.enabled && !agentAccess.state.paused && !agentService?.locked) {
    agentEvents?.publish(type, activity, data);
  }
}

function publishAgentPage({ page, reason } = pages.selection(store.current)) {
  publishAgentEvent('page', { id: page.id, reason, view: navigation.current.view, sheet: deckSheet,
    statsTab: deckStatsTab, locked: pages.locked });
}

function refreshPage(force = false) {
  const selection = pages.selection(store.current);
  const { page } = selection;
  const { target, active } = pages.binding(page);
  const next = { id: page.id, reason: selection.reason, activity: activities?.current?.id, active, window: pages.foregroundWindow, present: pages.foregroundPresent,
    app: pages.foreground?.identity, keyboardLayout: pages.foreground?.keyboardLayout,
    keyboardHandle: pages.foreground?.keyboardHandle, mode: pages.foreground?.mode,
    title: page.windowTitle ? pages.foreground?.title : undefined };
  const foregroundChanged = ['activity', 'active', 'window', 'present', 'app', 'keyboardLayout', 'keyboardHandle', 'mode', 'title']
    .some((key) => next[key] !== deckContext[key]);
  const changed = foregroundChanged || next.id !== deckContext.id || next.reason !== deckContext.reason;
  if (force || changed) {
    if (deckContext.id !== next.id || deckContext.activity !== next.activity) deckSheet = 0;
    if (!page.generated && recentDeckPages.at(-1) !== page.id) {
      recentDeckPages = [...recentDeckPages.filter((id) => id !== page.id).slice(-1), page.id];
    }
    if (force || deckContext.id !== next.id) void pushToTalk?.cancel();
    keyPresses.cancelPending();
    keyConfirmation.clear();
    deckContext = next;
    pages.revision++;
    choicePrompts.check();
    agentActions?.checkPending();
    send('profile', currentView());
    publishAgentPage(selection);
    if (foregroundChanged) publishAgentEvent('foreground', { present: Boolean(next.present), targetAvailable: active, revision: pages.revision });
    if (page.pack && target?.id && readWindowIcons) {
      const revision = pages.revision;
      void readWindowIcons([target]).then((icons) => {
        if (pages.revision !== revision) return;
        deckHeaderIcon = { revision, source: icons.get(target.id) ?? null };
        send('deck:page-icon', deckHeaderIcon);
      }).catch(() => {});
    }
  }
}

function repaginatePage(sheet = 0) {
  if (!Number.isSafeInteger(sheet) || sheet < 0) throw new Error('Invalid deck screen.');
  deckSheet = sheet;
  refreshPage(true);
}

function observeDeckForeground(foreground = readForeground.context?.()) {
  if (deckReveal?.active || deckSession.blocked) return;
  pages.observe(foreground);
  refreshPage();
}

function updateAudio() {
  liveAudio = { ...audio.read(), sampledAt: Date.now(), version: ++audioVersion };
  agentAudioActions?.checkPending(liveAudio);
  agentAudioMuteActions?.checkPending(liveAudio);
  agentAudioRouting?.checkPending();
  recordPanelProvider('audio', liveAudio.sampledAt);
  pushToTalk?.observeInputs(liveAudio.inputs);
  send('audio', liveAudio);
  publishAgentEvent('audio', { speakerAvailable: Boolean(liveAudio.output), speakerMuted: liveAudio.output?.muted ?? null,
    microphoneAvailable: Boolean(liveAudio.inputs?.length), microphoneMuted: readMacroState('microphones-muted') ?? null });
  return liveAudio;
}

function publishAgentPlayback(sample) {
  if (sample.status === 'busy') return;
  agentPlaybackAt = Date.now();
  agentPlaybackArtwork = sample.trackId;
  publishAgentEvent('playback', { status: sample.status, playback: sample.playback ?? null });
}

function readAgentProviders() {
  return providerStatus({ now: Date.now(), audio: Boolean(liveAudio?.output), media: Boolean(nowPlaying?.child),
    telemetry: liveSensors?.sampledAt, obs: obs?.view?.status === 'connected',
    freshnessMs: Math.max(5_000, monitoring.intervals.hardware * 2) });
}

function publishAgentProviders() {
  const { providers } = readAgentProviders();
  publishAgentEvent('providers', Object.fromEntries(Object.entries(providers).map(([id, { status }]) => [id, status])));
}

function pollAgentPlayback() {
  if (agentPlaybackPending || Date.now() - agentPlaybackAt < monitoring.intervals.media || !agentService?.interested('playback')) return;
  agentPlaybackPending = true;
  void nowPlaying.snapshot(agentPlaybackArtwork).then(publishAgentPlayback).catch(() => {
    publishAgentPlayback({ status: 'unavailable' });
  }).finally(() => { agentPlaybackPending = false; });
}

function recordPanelProvider(source, at = Date.now()) {
  panelMeasurement?.run?.provider(source, at);
}

function changeAudio(device, level, inputId) {
  if (device === 'microphone' && level === undefined) return pushToTalk.toggleMicrophones();
  return audio.change(device, level, inputId);
}

function readMacroState(key) {
  const obsState = obs?.view;
  switch (key) {
    case 'speaker-muted': return liveAudio?.output?.muted;
    case 'microphones-muted': {
      const inputs = liveAudio?.inputs ?? [];
      if (inputs.some(({ muted }) => muted === false)) return false;
      if (inputs.length && inputs.every(({ muted }) => muted === true)) return true;
      return undefined;
    }
    case 'obs-connected': return Boolean(obsState && obsState.status === 'connected');
    case 'obs-scene': return obsState?.program;
    case 'obs-recording': return obsState?.recording?.active;
    case 'obs-streaming': return obsState?.streaming?.active;
  }
}

function send(channel, payload) {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed() && !win.webContents.isCrashed()) {
    win.webContents.send(channel, payload);
  }
}

function lockDown(contents) {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (e) => e.preventDefault());
  contents.on('did-finish-load', () => contents.setVisualZoomLevelLimits(1, 1));
}

/**
 * Open the hidden page that plays soundboard clips. It gets its own session, which may list and
 * select audio outputs and nothing else; the default session keeps refusing every permission.
 */
function createSoundHost(onEvent, onClosed) {
  const sounds = session.fromPartition('lastra-sound');
  const outputAccess = (permission) => permission === 'media' || permission === 'speaker-selection';
  sounds.setPermissionCheckHandler((_contents, permission) => outputAccess(permission));
  sounds.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'speaker-selection'));
  const host = new BrowserWindow({ show: false, skipTaskbar: true, focusable: false, webPreferences: {
    session: sounds, preload: SOUND_PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false,
    backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required',
  } });
  const contents = host.webContents;
  lockDown(contents);
  const listener = (event, payload) => { if (event.sender === contents) onEvent(payload); };
  ipcMain.on('sound:event', listener);
  host.once('closed', () => {
    ipcMain.off('sound:event', listener);
    onClosed();
  });
  contents.on('render-process-gone', () => { if (!host.isDestroyed()) host.destroy(); });
  host.loadFile(SOUND_HOST).catch((error) => {
    log('The sound player failed to load:', error?.message ?? error);
    if (!host.isDestroyed()) host.destroy();
  });
  return {
    post: (message) => { if (!host.isDestroyed()) contents.send('sound:command', message); },
    close: () => { if (!host.isDestroyed()) host.destroy(); },
  };
}

// ---------------------------------------------------------------- window

function deckDisplay() {
  return opts.windowed ? null : findEdgeDisplay(screen.getAllDisplays(), preferredDisplay, process.platform);
}

function backlightWindow() {
  if (process.platform !== 'win32' || deckSession.blocked || deckReveal.active || !win || win.isDestroyed() || !win.isVisible()) return null;
  const display = deckDisplay();
  if (!display || !/\bxeneon\s+edge\b/i.test(display.label) || screen.getDisplayMatching(win.getBounds()).id !== display.id) return null;
  const handle = win.getNativeWindowHandle();
  return handle.length === 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE());
}

function quitWithoutEdge() {
  if (edgeExit) return;
  edgeExit = true;
  log('XENEON EDGE is not connected. Exiting Lastra.');
  if (win && !win.isDestroyed()) win.destroy();
  // Release everything now in case another window delays the quit. With a push-to-talk lease open,
  // will-quit first mutes the microphone and then releases everything, as on a normal quit.
  if (!pushToTalk?.lease) disposables.dispose();
  app.quit();
}

// Snapshot of the deck state an asynchronous step started under. The step should stop when view-only
// mode or a desktop reveal began since, the Windows session changed, or the deck window was replaced.
function captureDeckGuard() {
  const viewOnlyReason = viewOnly.guard();
  const revealReason = deckReveal.guard();
  const session = windowsSessionRevision;
  const owner = win;
  // The view-only or desktop reveal message, if either began since the snapshot.
  const blocked = () => viewOnlyReason() ?? revealReason();
  const sessionChanged = () => session !== windowsSessionRevision;
  return {
    owner, blocked, sessionChanged,
    sameOwner: () => owner === win,
    reason: () => blocked() ?? (sessionChanged() ? 'The Windows session changed.' : undefined),
  };
}

function createDeckWindow(display = deckDisplay()) {
  if (edgeExit) return;
  if (!opts.windowed && !display) {
    quitWithoutEdge();
    return;
  }
  edge = display;
  deckReady = false;
  deckStatsTab = 'overview';

  if (edge) {
    log('XENEON EDGE:', describeDisplay(edge));
    win = new BrowserWindow({
      ...edge.bounds,
      ...(linuxDesktop ? { title: DECK_WINDOW_TITLE } : {}),
      frame: false,
      focusable: false, // Touch keeps focus on the current app.
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      hasShadow: false,
      show: false,
      backgroundColor: BACKGROUND,
      webPreferences,
    });
    const deck = win;
    if (linuxDesktop) deck.on('page-title-updated', (event) => event.preventDefault());
    deck.once('ready-to-show', () => {
      if (win !== deck || edgeExit) return;
      deckReady = true;
      const latest = deckDisplay();
      if (latest) restoreDeck(latest, true);
      else displayWatcher?.schedule();
    });
  } else {
    win = new BrowserWindow({
      width: 1280,
      height: 360,
      // The --windowed development window accepts focus.
      focusable: true,
      useContentSize: true,
      title: 'Lastra',
      icon: path.join(ROOT, 'assets', 'icon.png'),
      backgroundColor: BACKGROUND,
      show: false,
      webPreferences,
    });
    const deck = win;
    deck.setMenuBarVisibility(false);
    deck.once('ready-to-show', () => deck.show());
  }

  lockDown(win.webContents);
  const deck = win;
  const contents = deck.webContents;
  const cancelDeckActions = () => {
    void pushToTalk?.cancel(contents);
    if (win === deck) {
      keyPresses.cancelPending();
      keyConfirmation.clear();
    }
  };
  // A reload or a crashed renderer drops everything the old page started.
  const resetDeckPage = () => {
    cancelDeckActions();
    if (win === deck) {
      stats?.stop();
      kubernetesView?.stop();
      agentActivitySwitch?.interrupt();
      agentAppAudio?.interrupt();
      agentSpotifyActions?.interrupt();
    }
  };
  contents.on('did-start-navigation', ({ isMainFrame, isSameDocument }) => {
    if (!isMainFrame || isSameDocument) return;
    resetDeckPage();
  });
  contents.on('render-process-gone', () => resetDeckPage());
  deck.on('blur', cancelDeckActions);
  deck.on('hide', cancelDeckActions);
  deck.on('hide', () => {
    processTelemetry?.stop();
    agentChoices?.checkPending();
    if (win === deck) kubernetesView?.stop();
    agentActivitySwitch?.checkPending();
    agentAppAudio?.checkPending();
    agentSpotifyActions?.checkPending();
  });
  deck.on('minimize', () => {
    if (win === deck) kubernetesView?.stop();
    agentChoices?.checkPending();
    agentActivitySwitch?.checkPending();
    agentAppAudio?.checkPending();
    agentSpotifyActions?.checkPending();
  });
  deck.on('show', () => { if (win === deck) send('display:backlight:widgets:update', 'visible'); });
  deck.on('query-session-end', cancelDeckActions);
  deck.on('session-end', cancelDeckActions);
  deck.on('closed', () => {
    cancelDeckActions();
    if (win === deck) {
      stats?.stop();
      processTelemetry?.stop();
      kubernetesView?.stop();
      sensorWidgets?.select([]);
      nowPlaying?.stop();
      win = null;
      agentChoices?.checkPending();
      agentActivitySwitch?.checkPending();
      agentAppAudio?.checkPending();
      agentSpotifyActions?.checkPending();
    }
  });
  win.loadFile(RENDERER, { query: { language: interfaceLanguage.language } });
  hardware?.start();
  refreshTray();
}

function restoreDeck(display = deckDisplay(), force = false) {
  if (edgeExit) return;
  if (deckReveal.active) {
    if (!opts.windowed) edge = display;
    deckReveal.update(opts.windowed ? revealDisplay() : display);
    refreshTray();
    return;
  }
  if (opts.windowed) {
    if (win && !win.isDestroyed()) win.showInactive();
    else createDeckWindow();
    return;
  }
  if (!display) {
    quitWithoutEdge();
    return;
  }
  if (!win || win.isDestroyed() || win.webContents.isCrashed()) {
    if (win && !win.isDestroyed()) win.destroy();
    createDeckWindow(display);
    return;
  }
  // A native Wayland toplevel is placed by the compositor. The Hyprland Deck rule also keeps it unfocusable.
  const wayland = linuxDesktop && !linuxDesktop.xwayland && !['x11', 'unavailable'].includes(linuxDesktop.kind);
  const moved = !wayland && restoreDeckWindow(win, display, { previous: force ? null : edge, ready: deckReady });
  if (wayland && deckReady && !win.isVisible()) win.show();
  edge = display;
  if (moved && !force) {
    void pushToTalk?.cancel(win.webContents);
    log('Display layout changed. Repositioned the deck.');
  }
  refreshTray();
}

function revealDisplay() {
  return opts.windowed ? screen.getDisplayMatching(win?.getBounds() ?? screen.getPrimaryDisplay().bounds) : deckDisplay();
}

function syncWebEmbedSuspension() {
  webEmbedHost?.setSuspended(viewOnly.enabled || deckReveal.active || deckSession.blocked);
}

function revealDesktop() {
  if (deckSession.blocked || !win || win.isDestroyed() || !deckReveal.begin(revealDisplay())) return false;
  agentChoices?.checkPending();
  agentActivitySwitch?.checkPending();
  agentAppAudio?.checkPending();
  displayBacklight.invalidate();
  productionModes?.interrupt();
  agentWorkspaceApply?.checkPending();
  agentAlertAck?.checkPending();
  agentObsActions?.checkPending();
  agentObsOutputs?.checkPending();
  agentAudioActions?.checkPending();
  agentAudioMuteActions?.checkPending();
  agentAudioRouting?.checkPending();
  agentWindowsMedia?.checkPending();
  agentSpotifyActions?.checkPending();
  choicePrompts.check();
  syncWebEmbedSuspension();
  refreshPage(true);
  win.hide();
  stats?.stop();
  refreshTray();
  return true;
}

function showDeck(display = deckDisplay()) {
  if (deckSession.blocked) return false;
  if (deckReveal.active) {
    if (!display && !opts.windowed) return false;
    deckReveal.end();
    syncWebEmbedSuspension();
    refreshPage(true);
  }
  restoreDeck(display, true);
  refreshTray();
  return true;
}

// ---------------------------------------------------------------- tray

function openEditor(section = 'settings') {
  if (edgeExit) return;
  if (editor && !editor.isDestroyed()) {
    if (editor.isMinimized()) editor.restore();
    editor.show();
    if (!editor.webContents.isLoading()) editor.webContents.send('editor:section', section);
    return;
  }
  const activity = opts.profile ? null : ACTIVITIES[activities.current.id];
  editor = new BrowserWindow({
    width: 1180, height: 780, minWidth: 820, minHeight: 560, show: false,
    title: activity ? `Lastra · ${activity}` : 'Lastra',
    icon: path.join(ROOT, 'assets', 'icon.png'),
    backgroundColor: BACKGROUND,
    webPreferences: { ...webPreferences, preload: EDITOR_PRELOAD },
  });
  const window = editor;
  editorProfile = activities.current;
  window.setMenuBarVisibility(false);
  lockDown(window.webContents);
  window.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'question',
      message: translate(interfaceLanguage.language, 'Discard changes to the profile?'),
      buttons: ['Keep editing', 'Discard'].map((label) => translate(interfaceLanguage.language, label)),
      defaultId: 0,
      cancelId: 0,
    });
    if (choice === 1) event.preventDefault();
    else window.removeListener('closed', installAfterClosingEditor);
  });
  window.once('ready-to-show', () => window.show());
  window.webContents.once('did-finish-load', () => window.webContents.send('editor:section', section));
  window.once('closed', () => { editor = editorProfile = null; });
  window.loadFile(EDITOR, { query: { language: interfaceLanguage.language } });
}

function installAfterClosingEditor() {
  updater?.restartToUpdate();
}

function restartToUpdate() {
  if (updater?.status().state !== 'downloaded') return false;
  const owner = editor;
  if (!owner || owner.isDestroyed()) return updater.restartToUpdate();
  // Electron starts the installer before quitting. Close the editor through its draft guard first.
  if (!owner.listeners('closed').includes(installAfterClosingEditor)) {
    owner.once('closed', installAfterClosingEditor);
    owner.close();
  }
  return true;
}

function updateStatus() {
  const status = updater?.status();
  return {
    state: status?.state ?? 'disabled', version: status?.version ?? null, percent: status?.percent ?? null,
    deferred: status?.deferred === true, downloadFailed: status?.downloadFailed === true,
    currentVersion: app.getVersion(),
  };
}

/** @param {unknown} action @param {unknown} version */
function updateCommand(action, version) {
  switch (action) {
    case 'download': return updater?.download(version) === true;
    case 'later': return updater?.defer(version) === true;
    case 'restart': return restartToUpdate();
    case 'check': return updater?.checkNow().then(() => true) ?? false;
    default: return false;
  }
}

function offerEditorDraft(approved) {
  if (edgeExit || deckSession.blocked || store !== approved.store || (editorProfile && editorProfile.store !== store)) return false;
  openEditor('profile');
  const owner = editor;
  const deliver = () => {
    if (owner !== editor || owner.isDestroyed() || deckSession.blocked || store !== approved.store
        || store.editorSnapshot().token !== approved.baseVersion) return;
    owner.webContents.send('editor:section', 'profile');
    owner.webContents.send('editor:agent-draft', { profile: approved.next, page: approved.page.id, baseVersion: approved.baseVersion });
  };
  if (owner.webContents.isLoadingMainFrame()) owner.webContents.once('did-finish-load', deliver);
  else deliver();
  return true;
}

function collectDiagnostics() {
  const displays = screen.getAllDisplays();
  let touchDevices = null;
  if (process.platform === 'win32') {
    try {
      touchDevices = readTouchDevices();
    } catch {
      // The report can still describe the display and audio state if touch enumeration fails.
    }
  }
  return buildDiagnostics({
    environment: {
      lastra: app.getVersion(), electron: process.versions.electron, system: process.platform,
      systemVersion: process.getSystemVersion(), architecture: process.arch,
    },
    display: {
      displays: displays.map((display) => ({
        ...display,
        physical: process.platform === 'win32' ? screen.dipToScreenRect(null, display.bounds) : null,
      })),
      primaryDisplayId: screen.getPrimaryDisplay().id,
      edgeDisplayId: findEdgeDisplay(displays)?.id,
      deckDisplayId: edge?.id,
      windowed: opts.windowed,
      touchDevices,
    },
    audio: liveAudio,
    phase: pushToTalk?.view.phase,
    sensors: liveSensors,
    obs: obs?.view.status,
    media: nowPlaying?.diagnosticStatus(),
    wsl: appViews?.providers.wsl?.cache?.status ?? 'idle',
    services: serviceHealth?.snapshot(),
    profileWarning: profileError,
    panelMeasurement: panelMeasurement?.snapshot(),
  });
}

async function exportDiagnostics() {
  if (exportingDiagnostics || edgeExit) return;
  exportingDiagnostics = true;
  try {
    await saveDiagnostics({ dialog, directory: app.getPath('documents'), collect: collectDiagnostics });
  } catch {
    dialog.showErrorBox('Lastra diagnostics', 'Could not save the diagnostics report.');
  } finally {
    exportingDiagnostics = false;
  }
}

function sendDashboardCalendar() {
  const calendar = CALENDARS[navigation.current.calendar];
  send('dashboard:calendar', calendar.url ? calendar.label : null);
}

function setAppearance(setting, value) {
  const previous = appearance.current;
  const current = appearance.set(setting, value);
  send('deck:appearance', current);
  if (current.largeKeys !== previous.largeKeys) repaginatePage();
  if (editor && !editor.isDestroyed() && !editor.webContents.isDestroyed() && !editor.webContents.isCrashed()) {
    editor.webContents.send('editor:appearance', current);
  }
  refreshTray();
  return current;
}

function activateActivity(id) {
  const selection = activities.activate(id);
  store = selection.store;
  recentDeckPages = [];
  profileError = selection.warning;
  if (profileError) log(profileError, 'Using the last available configuration.');
  log('Profile:', store.file);
  const saved = navigation.pageFor(id);
  pages.restore(store.current, saved, { contextOnly: id !== 'main', contextReturn: navigation.current.contextReturn });
  deckShortcuts?.sync();
  if (id === 'main' && !opts.profile && !selection.warning && isRetiredStockPageId(saved.page)
      && !store.current.pages.some(({ id }) => id === saved.page)) {
    saveDeckPage();
  }
}

function switchActivity(id) {
  if (activities.current.id !== id) {
    activateActivity(id);
    agentApply?.checkPending();
    agentChoices?.checkPending();
    agentActivitySwitch?.checkPending();
    navigation.setActivity(id);
    refreshPage(true);
    publishAgentEvent('profile', { revision: pages.revision });
    refreshTray();
    if (profileError) send('status', { ok: false, message: profileError });
  }
  return activities.snapshot();
}

function saveDeckPage() {
  navigation.setPage(pages.savedPage, pages.locked, activities.current.id, pages.manual);
}

function selectDeckPage(id, resetSheet = false) {
  pages.select(store.current, id);
  const visited = pageLists.visit(activities.current.id, id, store.current.pages);
  saveDeckPage();
  if (resetSheet && deckSheet) repaginatePage();
  else refreshPage(visited);
}

function setDeckPageLock(enabled = !pages.locked) {
  if (enabled === pages.locked) return;
  pages.toggleLock(store.current);
  deckShortcuts?.sync();
  saveDeckPage();
  refreshPage(true);
}

function setDeckView(view) {
  if (view === 'obs' && !obs.enabled) throw new Error('Enable OBS in Lastra Settings.');
  if (feeds && !feeds.allows(view)) throw new Error('That deck view is turned off.');
  const before = navigation.current.view;
  navigation.setView(view);
  if (before === 'stats' && navigation.current.view !== 'stats') processTelemetry?.stop();
  if (before === 'apps' && navigation.current.view !== 'apps') kubernetesView?.stop();
  if (before !== navigation.current.view) productionModes?.interrupt();
  choicePrompts.check();
  agentActions?.checkPending();
  publishAgentPage();
}

function selectStatsTab(id) {
  if (typeof id !== 'string' || (id !== 'overview' && !Object.hasOwn(STATS_GROUPS, id))) return;
  deckStatsTab = id;
  publishAgentPage();
}

/** @param {{ command: string, view?: string, page?: string, tab?: string, enabled?: boolean, setting?: string, value?: unknown }} request */
function navigateDeck({ command, view, page: requestedPage, tab, enabled, setting, value }) {
  if (viewOnly.enabled && ['lock', 'follow', 'appearance'].includes(command)) {
    throw new NavigationRequestError(VIEW_ONLY_BLOCKED.message);
  }
  switch (command) {
    case 'surface': {
      const display = deckDisplay();
      if (!display && !opts.windowed) throw new NavigationRequestError('The deck display is unavailable.');
      showDeck(display);
      break;
    }
    case 'view': setDeckView(view); break;
    case 'page':
      if (!store.current.pages.some(({ id }) => id === requestedPage)) throw new NavigationRequestError('That saved page is unavailable.');
      selectDeckPage(requestedPage, true);
      setDeckView('keys');
      break;
    case 'home':
      selectDeckPage(store.current.pages[0].id, true);
      setDeckView('keys');
      break;
    case 'stats':
      selectStatsTab(tab);
      setDeckView('stats');
      break;
    case 'lock': setDeckPageLock(enabled); break;
    case 'follow':
      if (!enabled) setDeckPageLock(true);
      else if (!pages.following) {
        pages.follow(store.current);
        deckShortcuts?.sync();
        saveDeckPage();
        refreshPage(true);
      }
      break;
    case 'appearance': setAppearance(setting, value); break;
  }
  if (['surface', 'view', 'page', 'home', 'stats'].includes(command)) {
    send('deck:navigation', { view: navigation.current.view, statsTab: deckStatsTab, sheet: deckSheet,
      views: feeds?.cycle() ?? ['keys', 'dashboard', 'stats', 'feeds'] });
  }
}

function shortcutUnavailableOnDeck(command, binding) {
  if (deckSession.blocked) return 'Paused while Windows is locked or asleep';
  if (viewOnly.enabled) return 'Paused in view-only mode';
  if (pages.locked && ['next', 'previous', 'page', 'back'].includes(command)) return 'Paused while the page is locked';
  if (command === 'page' && (binding.activity !== activities.current.id
      || !store.current.pages.some(({ id }) => id === binding.target))) return 'Page unavailable in this activity';
}

function runDeckShortcut(command, binding) {
  if (command === 'reveal') {
    if (deckReveal.active || !win || win.isDestroyed() || !win.isVisible()) showDeck();
    else revealDesktop();
    return;
  }
  if (deckReveal.active || !win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) return;
  if (command === 'view') {
    navigateDeck({ command: 'view', view: binding.target });
    return;
  }
  const profile = store.current;
  const page = pages.current(profile);
  let destination = binding.target;
  if (command === 'back') {
    destination = recentDeckPages.findLast((id) => id !== page.id && profile.pages.some((saved) => saved.id === id))
      ?? (page.generated ? pages.manualPage(profile).id : undefined);
  }
  if (command === 'next' || command === 'previous') {
    const [width, height] = win.getContentSize();
    const screens = describeLayoutView(currentView(), page.id, height > width, appearance.current.largeKeys).sheets.length;
    const next = stepDestination(profile.pages, page.id, pages.manualPage(profile).id, Math.min(deckSheet, screens - 1),
      screens, command === 'next' ? 1 : -1);
    if (next.sheet !== undefined) {
      repaginatePage(next.sheet);
      navigateDeck({ command: 'view', view: 'keys' });
      return;
    }
    destination = next.page;
  }
  if (destination) navigateDeck({ command: 'page', page: destination });
}

function setViewOnly(enabled) {
  const before = viewOnly.enabled;
  viewOnly.set(enabled);
  if (before !== viewOnly.enabled) {
    deckShortcuts?.sync();
    displayBacklight.invalidate();
    productionModes?.interrupt();
  }
  choicePrompts.check();
  agentChoices?.checkPending();
  agentActivitySwitch?.checkPending();
  agentAppAudio?.checkPending();
  agentWorkspaceApply?.checkPending();
  agentAlertAck?.checkPending();
  agentObsActions?.checkPending();
  agentObsOutputs?.checkPending();
  agentAudioActions?.checkPending();
  agentAudioMuteActions?.checkPending();
  agentAudioRouting?.checkPending();
  agentWindowsMedia?.checkPending();
  agentSpotifyActions?.checkPending();
  syncWebEmbedSuspension();
  refreshPage(true);
}

function deckBehavior() {
  const activity = activities.current.id;
  const favorites = pageLists.snapshot(activity, store.current.pages).favorites;
  const appState = appViews.snapshot();
  let mixer = [];
  try { mixer = appMixerPins.withStatus(audio.listApps()).filter(({ pinned, canPin }) => pinned || canPin); }
  catch { /* Mixer pins stay listed when Windows audio is quiet. */ }
  return {
    activity,
    activities: ACTIVITIES,
    viewOnly: viewOnly.enabled,
    contextReturn: navigation.current.contextReturn,
    contextReturns: CONTEXT_RETURN_CHOICES,
    calendar: navigation.current.calendar,
    calendars: Object.fromEntries(Object.entries(CALENDARS).map(([id, item]) => [id, item.label])),
    display: preferredDisplay == null ? '' : String(preferredDisplay),
    displays: screen.getAllDisplays().map((display) => ({ id: String(display.id), label: describeDisplay(display) })),
    revealGesture: navigation.current.desktopRevealGesture,
    revealed: deckReveal.active,
    activityLocked: Boolean(opts.profile),
    windowed: Boolean(opts.windowed),
    pages: store.current.pages.map(({ id, name }) => ({ id, name, favorite: favorites.includes(id) })),
    appViews: appState.views.map(({ id, name }) => ({ id, name, pinned: appState.pinned.includes(id) })),
    followApps: appState.follow,
    mixer: mixer.map(({ id, name, pinned }) => ({ id, name, pinned })),
  };
}

function refreshTray() {
  trayMenu?.refresh();
}

function deckOrganizationItems() {
  const activity = activities.current.id;
  const { pages: configuredPages } = store.current;
  const pagePins = pageLists.snapshot(activity, configuredPages).favorites;
  const appState = appViews.snapshot();
  let mixerApps = [];
  try { mixerApps = audio.listApps(); } catch { /* Offline saved mixer pins are still available. */ }
  const apply = (action) => async ({ checked }) => {
    try { await action(checked); }
    catch (error) { dialog.showErrorBox('Deck organization', error.message); }
  };
  const changeViews = async (command) => {
    const result = await appViews.change(command);
    if (result.state) send('app-views:focus', result.state);
  };
  const mixer = appMixerPins.withStatus(mixerApps).filter(({ pinned, canPin }) => pinned || canPin);
  return [
    { label: 'Favorite pages', submenu: configuredPages.map(({ id, name }) => ({
      label: name, type: 'checkbox', checked: pagePins.includes(id),
      click: apply((checked) => {
        if (activity !== activities.current.id) throw new Error('The activity profile changed.');
        pageLists.favorite(activity, id, checked, store.current.pages);
        send('profile', currentView());
      }),
    })) },
    { label: 'Pinned app views', submenu: appState.views.map(({ id, name }) => ({
      label: name, type: 'checkbox', checked: appState.pinned.includes(id),
      click: apply((pinned) => changeViews({ type: 'pin', viewId: id, pinned })),
    })) },
    { label: 'Follow foreground apps in Apps', type: 'checkbox', checked: appState.follow,
      click: apply((enabled) => changeViews({ type: 'follow', enabled })) },
    { label: 'Edit custom app views', click: apply(() => appViews.editCustom()) },
    { label: 'Pinned mixer apps', enabled: Boolean(mixer.length), submenu: mixer.map(({ id, name, pinned }) => ({
      label: name, type: 'checkbox', checked: pinned, click: apply((checked) => appMixerPins.set(id, checked, () => audio.listApps())),
    })) },
  ];
}

// ---------------------------------------------------------------- IPC

function fromWindow(event, window, file) {
  return Boolean(window) && event.sender === window.webContents
    && event.senderFrame === event.sender.mainFrame && matchesInterfaceUrl(pathToFileURL(file).href, event.senderFrame?.url);
}

function keyContext(id) {
  if (id.startsWith('bar:')) return { id: 'bar:', name: 'Persistent bar', apps: [], keys: store.current.bar.keys };
  return pages.current(store.current);
}

function keyId(id) {
  return id.startsWith('bar:') ? id.slice(4) : id;
}

function resolveDeckPress(id, kind, revision) {
  const unavailable = (message) => ({ ok: false, unavailable: true, message });
  if (typeof id !== 'string' || !['tap', 'hold', 'double', 'confirm', 'press', 'release'].includes(kind)) return { ok: false, message: 'Invalid request' };
  observeDeckForeground();
  if (revision !== pages.revision) return unavailable('The deck page or target window changed.');
  const page = keyContext(id);
  const binding = pages.binding(page);
  if (!binding.active) return unavailable('The target window is unavailable.');
  const editing = id.startsWith('edit:');
  const editingTarget = editing ? foregroundShortcutTarget() : null;
  const key = editing ? fixedEditingKeys(store.current, editingTarget).find((item) => item.id === id) : store.findKey(keyId(id), page);
  if (!key) return { ok: false, message: 'Key not found in the profile' };
  if (key.unavailable) return unavailable(key.unavailable);
  const actions = key.confirm ? { confirm: key.action } : { tap: key.action, hold: key.hold, double: key.double,
    press: key.action, release: key.release };
  const action = actions[kind];
  if (!action) return { ok: false, message: 'No action assigned to this gesture' };
  const reason = shortcutUnavailableHere(action);
  if (reason) return unavailable(reason);
  return { ok: true, id, kind, revision, page, key, action, binding, editing, editingTarget };
}

function queueDeckPress(press, { deckPress = false, trace = undefined, allowed = () => true, onStepProgress = undefined,
  onStepResult = undefined, signal = undefined } = {}) {
  const { id, kind, revision, page, key, action, binding, editing, editingTarget } = press;
  const deck = captureDeckGuard();
  const foregroundId = key.onBusy === 'queue-one' ? readForeground.windowId?.() : undefined;
  const guardedFlow = hasShortcutRule(action, (_, step) => step.type === 'repeat' || step.type === 'choose');
  const trackFlow = deckPress && FLOW_PROGRESS_TYPES.has(action.type);
  const flowWindow = guardedFlow ? readForeground.windowId?.() : undefined;
  const flowView = navigation.current.view;
  const flowKey = `${revision}/${id}`;
  const queueKey = `${page.id}/${id}`;
  const scope = store.file;
  const shortcutTarget = actionNeedsShortcutTarget(action) || (linuxDesktop && hasShortcutRule(action, (_, step) => step.type === 'hotkey'))
    ? foregroundShortcutTarget() : undefined;
  const actionPage = editing ? { ...page, generated: true, pack: page.pack ?? 'editing-keys' } : page;
  const actionBinding = editing ? { active: true, target: editingTarget } : binding;
  const at = Date.now();
  const current = () => deck.sameOwner() && revision === pages.revision;
  const execute = async () => {
    if (!current() || !allowed()
        || (key.onBusy === 'queue-one' && readForeground.windowId?.() !== foregroundId)) return IGNORED;
    const controller = trackFlow ? new AbortController() : undefined;
    let activeStep;
    const publishStep = () => send('key:flow-progress', { id, revision, progress: activeStep ? {
      ...activeStep, stopping: controller.signal.aborted,
    } : null });
    const dropPending = () => {
      if (key.controlId) linkedControls.cancelPending(key.controlId, scope);
      else keyPresses.cancelPending(queueKey);
    };
    if (controller) runningFlows.set(flowKey, () => {
      if (controller.signal.aborted) return false;
      controller.abort();
      dropPending();
      publishStep();
      if (activeStep?.type === 'choose') choicePrompts.check();
      return true;
    });
    const stopReason = () => {
      if (!current() || navigation.current.view !== flowView) return 'The deck view or page changed.';
      if (deck.sessionChanged()) return 'The Windows session changed.';
      if (readForeground.windowId?.() !== flowWindow) return 'The target window changed.';
    };
    const guard = () => deck.blocked() ?? (allowed() ? undefined : 'The agent grant or target changed.')
      ?? (guardedFlow ? stopReason() : undefined);
    const progress = controller ? (value) => { activeStep = value; publishStep(); } : onStepProgress;
    const perform = () => runPageAction(actionPage, action, runner, readForeground, actionBinding, current,
      { trace: true, shortcutTarget, guard, onStepProgress: progress, onStepResult, signal: controller?.signal ?? signal });
    try {
      let result;
      if (deckPress) {
        panelMeasurement?.run?.command(trace, 'execution');
        result = await actionHistory.run({ label: key.label, origin: 'deck', context: page.name, gesture: kind, at,
          activity: activities.current.id }, perform);
        if (!result.ok) log(`${key.id} (${kind}): ${result.message}`);
      } else result = await perform();
      if (result.cancelled) controller?.abort();
      updateAudio();
      return result;
    } finally {
      if (controller) {
        if (controller.signal.aborted) dropPending();
        runningFlows.delete(flowKey);
      }
    }
  };
  return key.controlId ? linkedControls.run(key.controlId, key.onBusy, execute, scope)
    : keyPresses.run(queueKey, key.onBusy, execute);
}

function prepareAgentPress({ id, page: expectedPage, gesture, revision }) {
  if (deckReveal.active) throw new AgentActionError(REVEAL_BLOCKED.message);
  if (viewOnly.enabled) throw new AgentActionError(VIEW_ONLY_BLOCKED.message);
  const press = resolveDeckPress(id, gesture, revision);
  if (!press.ok) throw new AgentActionError(press.unavailable ? 'The saved key or its target is unavailable on this revision.' : 'Choose a saved key and its configured gesture.');
  const displayed = pages.current(store.current);
  const view = navigation.current.view;
  if (displayed.id !== expectedPage || press.page.generated || (press.page.id !== 'bar:' && view !== 'keys')) {
    throw new AgentActionError('Open the saved Deck Keys page or use a key from the persistent bar.');
  }
  const details = actionReviewDetails(press.action);
  const usesInput = hasShortcutRule(press.action, (_, { type }) => type === 'hotkey' || type === 'text');
  const target = usesInput ? readForeground.context?.({ fresh: true }) : press.binding.target;
  if (usesInput && target?.windowId == null) throw new AgentActionError('Bring the intended target window to the foreground.');
  const owner = win;
  const size = owner?.getContentSize().join(',');
  const isCurrent = () => {
    if (!owner || owner !== win || owner.isDestroyed() || owner.getContentSize().join(',') !== size
        || viewOnly.enabled || pages.revision !== revision || navigation.current.view !== view) return false;
    if (!usesInput) return true;
    const active = readForeground.context?.({ fresh: true });
    return sameShortcutWindow(target, active) && readForeground.windowId?.() === target.windowId && active.mode === target.mode
      && (active.keyboardHandle ?? active.keyboardLayout) === (target.keyboardHandle ?? target.keyboardLayout);
  };
  if (!isCurrent()) throw new AgentActionError('The deck or foreground target changed.');
  const destination = [target?.executable, target?.title].filter(Boolean).join(' · ');
  return {
    target: [press.key.label, press.page.name, ACTIVITIES[activities.current.id]].join(' · '),
    activity: activities.current.id,
    auditTarget: `${expectedPage}/${id}`,
    details: [{ field: 'Gesture', value: gesture }, ...(destination ? [{ field: 'Target window', value: destination }] : []), ...details],
    isCurrent, execute: (allowed, progress) => queueDeckPress(press, { allowed, ...progress }),
  };
}

function registerIpc() {
  function handle(channel, window, file, callback) {
    ipcMain.handle(channel, (event, ...args) => {
      if (!fromWindow(event, window(), file)) throw new Error('Unauthorized sender');
      return callback(...args);
    });
  }
  const deck = (channel, callback) => handle(channel, () => win, RENDERER, (...args) => {
    if (!deckSession.allows(channel)) return channel === 'dashboard:calendar:open' ? false : SESSION_BLOCKED;
    if (deckReveal.active && !deckRequestAllowed(channel, args[0])) {
      return channel === 'dashboard:calendar:open' ? false : REVEAL_BLOCKED;
    }
    if (viewOnly.enabled && !deckRequestAllowed(channel, args[0])) {
      return channel === 'dashboard:calendar:open' ? false : VIEW_ONLY_BLOCKED;
    }
    return callback(...args);
  });
  const edit = (channel, callback) => handle(channel, () => editor, EDITOR, callback);
  deck('profile:get', () => {
    send('monitoring', monitoring.intervals);
    return currentView();
  });
  const requireCurrentActivity = (activity) => {
    if (activity !== (opts.profile ? null : activities.current.id)) throw new Error('The activity profile changed.');
  };
  deck('page:select', (id, activity) => {
    if (activity !== undefined) requireCurrentActivity(activity);
    selectDeckPage(id, activity !== undefined);
  });
  deck('page:repaginate', repaginatePage);
  deck('key:flow-stop', (id, revision) => {
    if (typeof id !== 'string' || !Number.isSafeInteger(revision) || revision !== pages.revision) return false;
    return runningFlows.get(`${revision}/${id}`)?.() === true;
  });
  deck('key:choice:reply', (token, answer) => choicePrompts.answer(token, answer));
  deck('page:lock', () => setDeckPageLock());
  deck('activity:select', (id) => switchActivity(id));
  deck('view:set', setDeckView);
  deck('desktop-reveal:begin', () => navigation.current.desktopRevealGesture && revealDesktop());
  deck('emoji:catalog', () => emojiUsage.catalog());
  deck('emoji:insert', (id) => {
    const viewGuard = viewOnly.guard();
    const guard = () => viewGuard() ?? (navigation.current.view !== 'emoji' ? 'Open the Emoji view to insert an emoji.' : undefined);
    return insertEmoji(id, { readTarget: () => readForeground.textTarget?.(), run: runner.run, usage: emojiUsage, guard });
  });
  deck('stats:read', (range) => {
    const preferences = statsSelection.read();
    const chartIds = new Set(preferences.series.flatMap(({ id, readings }) => [id, ...readings.map((row) => row.id)]));
    return { ...stats.snapshot({ range, chartIds }), preferences };
  });
  deck('stats:processes', (command) => {
    if (command?.type === 'stop') return processTelemetry.stop();
    if (command?.type !== 'read' || navigation.current.view !== 'stats' || deckReveal.active
        || !win?.isVisible() || win.isMinimized()) return { status: 'unavailable', rows: [] };
    return processTelemetry.read(command.metric);
  });
  deck('sensors:widgets', (ids) => sensorWidgets.select(ids));
  deck('stats:incidents', (command) => command?.type === 'read' || (['mark', 'open'].includes(command?.type)
      && navigation.current.view === 'stats' && !deckReveal.active)
    ? incidentTimeline.request(command, (url) => shell.openExternal(url))
    : { ok: false, message: 'Open Stats to use the incident timeline.' });
  deck('stats:stop', () => {
    processTelemetry.stop();
    stats.stop();
  });
  deck('stats:tab', selectStatsTab);
  deck('dashboard:calendar:open', async () => {
    const { url } = CALENDARS[navigation.current.calendar];
    if (!url) return false;
    await shell.openExternal(url);
    return true;
  });
  deck('dashboard:pomodoro:read', () => ({ ok: true, state: pomodoro.snapshot() }));
  deck('timers:read', () => ({ ok: true, state: timers.snapshot() }));
  deck('sounds:read', () => ({ ok: true, state: soundboard.snapshot() }));
  deck('sounds:stop', () => ({ ok: true, message: soundboard.stopAll() }));
  deck('tools:choices', () => toolChoices);
  const setToolChoices = (input) => {
    const choices = normalizeChoices(input);
    if (!choices) return { ok: false, message: 'Enter 2–8 distinct choices of up to 32 characters each.' };
    writeJsonSettings(path.join(app.getPath('userData'), 'tool-choices.json'), { version: 1, choices });
    toolChoices = choices;
    send('tools:choices', toolChoices);
    return { ok: true, choices };
  };
  deck('tools:choices:set', setToolChoices);
  deck('timers:change', (command) => {
    try { return { ok: true, ...timers.change(command) }; }
    catch (error) { return { ok: false, message: error.message }; }
  });
  const changePomodoro = (view, command) => {
    if (navigation.current.view !== view) return { ok: false, message: 'Open Tools or the Dashboard to control the Pomodoro.' };
    try { return { ok: true, state: pomodoro.change(command) }; }
    catch (error) { return { ok: false, message: error.message }; }
  };
  deck('dashboard:pomodoro:change', (command) => changePomodoro('dashboard', command));
  deck('tools:pomodoro:change', (command) => changePomodoro('keys', command));
  deck('dashboard:agenda', (command) => {
    if (!['read', 'join'].includes(command?.type)) return { ok: false, message: 'Change the calendar in Lastra Settings.' };
    const selected = navigation.current;
    const deck = captureDeckGuard();
    return dashboardAgenda.request(command, () => deck.sameOwner() && navigation.current === selected && selected.view === 'dashboard'
      && !deckSession.blocked && !deck.sessionChanged() && !deck.blocked());
  });
  const inEditor = (snapshot) => ({ ...snapshot, active: editorProfile.store === store,
    activity: opts.profile ? null : ACTIVITIES[editorProfile.id] });
  edit('editor:load', () => inEditor(editorProfile.store.editorSnapshot()));
  edit('editor:language:get', () => interfaceLanguage.snapshot());
  edit('editor:language:set', (preference) => {
    const next = interfaceLanguage.set(preference);
    send('ui-language', next.language);
    refreshTray();
    return next;
  });
  edit('editor:integration-setup:read', () => integrationSetup.read());
  edit('editor:integration-setup:open', (choice) => integrationSetup.open(choice));
  edit('editor:profile-templates', (language) => profileTemplates(typeof language === 'string' ? language : undefined));
  edit('editor:appearance:get', () => appearance.current);
  edit('editor:appearance:set', (setting, value) => setAppearance(setting, value));
  edit('editor:feeds:get', () => feeds?.settings() ?? null);
  edit('editor:feeds:set', async (value) => {
    feeds.setSettings(value ?? {});
    if (!feeds.allows(navigation.current.view)) setDeckView('keys');
    return feeds.refresh();
  });
  edit('editor:feeds:places', (query) => feeds.searchPlaces(query));
  edit('editor:feeds:locate', () => feeds.locate());
  edit('editor:feeds:symbols', (query) => feeds.searchSymbols(query));
  deck('feeds:read', () => feeds?.snapshot() ?? null);
  deck('update:status', updateStatus);
  deck('update:command', (action, version) => action !== 'check' && updateCommand(action, version));
  edit('editor:update:status', updateStatus);
  edit('editor:update:command', updateCommand);
  edit('editor:configuration:export', async () => {
    const owner = editor;
    const bundle = readSettings(app.getPath('userData'));
    const choice = await dialog.showSaveDialog(owner, { title: 'Export Lastra configuration',
      defaultPath: 'lastra-configuration.json', filters: [{ name: 'Lastra JSON', extensions: ['json'] }] });
    if (choice.canceled || !choice.filePath || editor !== owner || owner.isDestroyed()) return false;
    writeExchangeFile(choice.filePath, JSON.stringify(bundle, null, 2), []);
    return true;
  });
  edit('editor:deck-behavior:get', () => deckBehavior());
  edit('editor:deck-behavior:set', async (command) => {
    if (!command || typeof command !== 'object') throw new Error('Invalid deck option.');
    if (command.type === 'activity') switchActivity(command.id);
    else if (command.type === 'viewOnly') setViewOnly(command.enabled === true);
    else if (command.type === 'contextReturn') {
      navigation.setContextReturn(command.mode);
      pages.setContextReturn(command.mode);
      refreshPage();
    } else if (command.type === 'calendar') {
      navigation.setCalendar(command.id);
      sendDashboardCalendar();
    } else if (command.type === 'display') {
      preferredDisplay = command.id == null || command.id === '' ? null : String(command.id);
      restoreDeck();
    } else if (command.type === 'revealGesture') {
      navigation.setDesktopRevealGesture(command.enabled === true);
      refreshPage(true);
    } else if (command.type === 'reveal') revealDesktop();
    else if (command.type === 'show') showDeck();
    else if (command.type === 'favorite') {
      pageLists.favorite(activities.current.id, command.id, command.enabled === true, store.current.pages);
      send('profile', currentView());
    } else if (command.type === 'pinView') {
      const result = await appViews.change({ type: 'pin', viewId: command.id, pinned: command.enabled === true });
      if (result.state) send('app-views:focus', result.state);
    } else if (command.type === 'follow') {
      const result = await appViews.change({ type: 'follow', enabled: command.enabled === true });
      if (result.state) send('app-views:focus', result.state);
    } else if (command.type === 'mixer') appMixerPins.set(command.id, command.enabled === true, () => audio.listApps());
    else if (command.type === 'editViews') await appViews.editCustom();
    else throw new Error('Unknown deck option.');
    refreshTray();
    return deckBehavior();
  });
  edit('editor:agenda:settings', async (type) => {
    if (!['read', 'pick', 'clear'].includes(type)) return { ok: false, message: 'Choose a calendar setting.' };
    const owner = editor;
    const result = await dashboardAgenda.request({ type }, () => editor === owner && !owner.isDestroyed());
    return result.ok ? { ok: true, selected: result.state?.selected === true, message: result.state?.message } : result;
  });
  edit('editor:grafana:get', () => incidentTimeline.snapshot().dashboard ?? '');
  edit('editor:grafana:set', (url) => incidentTimeline.request({ type: 'configure', url }, (target) => shell.openExternal(target)));
  edit('editor:production:obs', () => ({ status: obs.view.status, scenes: obs.view.scenes, generation: obs.view.generation }));
  edit('editor:obs:availability', (enabled) => enabled === undefined ? { enabled: obs.enabled } : obs.setEnabled(enabled));
  edit('editor:production:modes', (command) => ['read', 'configure'].includes(command?.type)
    ? productionModes.request(command, () => deckSession.blocked)
    : { ok: false, message: 'Choose a production mode setting.' });
  edit('editor:production:timers:read', () => ({ ok: true, state: productionTimers.snapshot() }));
  edit('editor:production:timers:save', (command) => {
    if (command?.type !== 'configure' || deckSession.blocked) return { ok: false, message: 'Choose a production timer setting.' };
    try {
      const state = productionTimers.change(command);
      send('production:timers:update', state);
      navigationBadges.refresh();
      return { ok: true, state };
    } catch (error) { return { ok: false, message: error.message }; }
  });
  edit('editor:stats-settings:get', async () => {
    const snapshot = await stats.settingsSnapshot();
    const preferences = statsSelection.read();
    return { ...preferences, defaults: snapshot.overview.filter(({ status }) => status !== 'unavailable').map(({ id }) => id),
      choices: readingChoices(snapshot, [...(preferences.selected ?? []), ...preferences.series.flatMap(({ readings }) => readings)]) };
  });
  edit('editor:stats-settings:set', ({ ids, style, layout, wide, series }) => {
    try {
      const snapshot = ids === null ? null : stats.snapshot({ refresh: false });
      const preferences = statsSelection.save(ids, snapshot, style, layout, wide, series);
      send('stats:preferences', preferences);
      return { ok: true, ...preferences };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  });
  edit('editor:tools:choices:get', () => toolChoices);
  edit('editor:tools:choices:set', setToolChoices);
  const shortcutSettings = (rows = deckShortcuts.sync()) => ({
    rows, views: VIEW_LABELS, activity: editorProfile.id,
    pages: editorProfile.store.current.pages.map(({ id, name }) => ({ id, name })),
  });
  edit('editor:deck-shortcuts:get', () => shortcutSettings());
  edit('editor:deck-shortcuts:set', (command, value) => {
    try {
      if (command === 'page' && value?.chord?.trim?.()
          && !editorProfile.store.current.pages.some(({ id }) => id === value.target)) throw new Error('Choose a saved page.');
      return { ok: true, settings: shortcutSettings(deckShortcuts.set(command, { ...value, activity: editorProfile.id })) };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  });
  edit('editor:shortcut-packs', (language) => {
    const packs = previewPacks(typeof language === 'string' ? language : undefined, process.platform);
    return { packs, icons: shortcutPackIcons(packs) };
  });
  edit('editor:shortcut-override', (chord) => normalizeOverrideChord(chord));
  edit('editor:shortcut-source', (url) => {
    const allowed = typeof url === 'string' && ['en-US', 'it-IT'].some((language) =>
      previewPacks(language, process.platform).some((pack) =>
        /** @type {any} */ (pack).source === url || pack.keys.some((key) => (key.binding?.source ?? key.source) === url)));
    if (!allowed) {
      throw new Error('This source is unavailable in the shortcut catalog.');
    }
    return shell.openExternal(url);
  });
  edit('editor:shortcut-webapp', (value) => normalizeWebApp(value));
  edit('editor:action-test', (request) => simulateAction(request));
  edit('editor:save', (profile, token) => inEditor(editorProfile.store.save(profile, token)));
  edit('editor:backups:list', () => editorProfile.store.editorBackups());
  edit('editor:backups:restore', (id, token) => inEditor(editorProfile.store.restoreBackup(id, token)));
  const imageLibrary = new ImageLibrary({
    choose: (options) => dialog.showOpenDialog(editor, options),
    getFileIcon: (file) => app.getFileIcon(file, { size: 'large' }),
  });
  edit('editor:asset-library:search', (mode, query, page) => imageLibrary.search(mode, query, page));
  edit('editor:asset-library:app', (id) => imageLibrary.selectedApp(id));
  edit('editor:asset-library:browse', (mode) => imageLibrary.browse(mode));
  edit('editor:preview-asset', (kind, value) => {
    if (typeof value !== 'string') return null;
    if (kind === 'icon') return lucideIcon(value);
    return kind === 'image' && (value.startsWith('data:') || value.length <= 32767) ? imageDataUrl(value) : null;
  });
  edit('editor:sensor-choices', () => sensorWidgets.choices());
  edit('editor:sound-outputs', () => soundboard.outputs().catch(() => []));
  edit('editor:choose-sound', async () => {
    const owner = editor;
    const choice = await dialog.showOpenDialog(owner, { title: 'Choose an audio clip', properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: Object.keys(SOUND_TYPES) }] });
    return choice.canceled || !choice.filePaths.length || editor !== owner || owner.isDestroyed() ? null : choice.filePaths[0];
  });
  edit('editor:preview-live', (source, revision, selectedSensors = []) => {
    if (source !== 'active' && source !== 'draft') throw new Error('Unknown preview source.');
    return {
      view: source === 'active' && revision !== pages.revision ? currentView() : null,
      readings: {
        audio: previewAudio(liveAudio),
        obs: previewObs(obs?.view),
        sensors: { ...previewSensors(liveSensors, sensors?.history.series),
          sensorWidgets: sensorWidgets.snapshot(checkedSensorIds(selectedSensors)) },
        media: previewMedia.snapshot(Date.now(), Math.max(3_500, (monitoring?.intervals.media ?? 1_000) * 2)),
      },
    };
  });
  const exchangeFilters = [{ name: 'Lastra JSON', extensions: ['json'] }];
  edit('editor:exchange:open', async () => {
    const owner = editor;
    const choice = await dialog.showOpenDialog(owner, { title: 'Import Lastra or Stream Deck', properties: ['openFile'],
      filters: [{ name: 'Lastra and Stream Deck', extensions: ['json', 'streamDeckProfile'] }, ...exchangeFilters,
        { name: 'Stream Deck profile', extensions: ['streamDeckProfile'] }] });
    if (choice.canceled || !choice.filePaths.length || editor !== owner || owner.isDestroyed()) return null;
    const file = choice.filePaths[0];
    if (!/\.streamDeckProfile$/i.test(file)) return readExchangeFile(file);
    const streamDeck = await readStreamDeckProfile(file);
    return editor === owner && !owner.isDestroyed() ? { streamDeck } : null;
  });
  edit('editor:exchange:prepare', prepareExchange);
  edit('editor:exchange:save', async (bundle) => {
    const owner = editor;
    const { text, summary } = encodeExchange(bundle);
    const choice = await dialog.showSaveDialog(owner, { title: 'Export Lastra ' + summary.kind,
      defaultPath: suggestedName(summary), filters: exchangeFilters });
    if (choice.canceled || !choice.filePath || editor !== owner || owner.isDestroyed()) return false;
    writeExchangeFile(choice.filePath, text, [editorProfile.store.file, store.file]);
    return true;
  });
  edit('editor:copy', (kind, item) => clipboard.writeText(encodeEditorClipboard(kind, item)));
  edit('editor:paste', (kind) => decodeEditorClipboard(kind, clipboard.readText()));

  deck('media:snapshot', async (artworkId, selectionId, route) => {
    const sample = await nowPlaying.snapshot(artworkId, selectionId, route);
    if (!selectionId) previewMedia.record(route, sample);
    if (!selectionId && !route) publishAgentPlayback(sample);
    return sample;
  });
  deck('media:change', (command) => nowPlaying.change(command));
  deck('media:seek:verified', (target) => {
    return seekVerified(nowPlaying, target, captureDeckGuard().reason);
  });
  deck('app-views:list', () => appViews.snapshot());
  deck('deck:badges:read', () => navigationBadges?.snapshot());
  deck('app-views:data', (viewId) => appViews.data(viewId));
  deck('app-views:change', async (command) => {
    if (['pin', 'follow', 'edit-custom'].includes(command?.type)
        || (command?.type === 'provider' && ((command.viewId === 'resources' && command.action === 'refresh')
          || (command.viewId === 'watchlist' && command.action === 'pin')))) {
      return { ok: false, message: 'Change these preferences in Lastra Settings.' };
    }
    try {
      const result = await appViews.change(command);
      if (command?.type === 'select' && result.state?.selected !== 'kubernetes') kubernetesView?.stop();
      return result;
    } catch (err) {
      return { ok: false, message: err.message };
    }
  });

  deck('obs:change', async (command) => {
    try {
      return await obs.change(command);
    } catch (err) {
      return { ok: false, message: err.message };
    }
  });
  deck('obs:preview', (generation) => navigation.current.view === 'obs' && !deckReveal.active
    ? obs.previewScene(generation) : { ok: false, message: 'Open the OBS view to see a scene preview.' });
  const productionVisible = () => navigation.current.view === 'obs' && !deckReveal.active;
  deck('obs:timing', (generation) => obs.outputTiming(generation, productionVisible));
  deck('production:timers:read', () => ({ ok: true, state: productionTimers.snapshot() }));
  deck('production:timers:change', (command) => {
    if (command?.type === 'configure') return { ok: false, message: 'Edit production timers in Lastra Settings.' };
    if (!productionVisible()) return { ok: false, message: 'Open the OBS view to change production timers.' };
    try {
      const state = productionTimers.change(command);
      navigationBadges.refresh();
      return { ok: true, state };
    }
    catch (error) { return { ok: false, message: error.message }; }
  });
  deck('production:modes', (command) => {
    if (command?.type === 'configure') return { ok: false, message: 'Edit production modes in Lastra Settings.' };
    const controls = command?.type === 'apply';
    const guard = viewOnly.guard();
    return productionModes.request(command, () => !productionVisible() || (controls && Boolean(guard())));
  });

  deck('display:backlight:read', () => displayBacklight.read());
  deck('display:backlight:set', (token, percent) => displayBacklight.change(token, percent));
  deck('display:backlight:widgets', (command) => displayBacklightWidgets.request(command));
  deck('audio:change', async (device, level, inputId) => {
    let message;
    try {
      message = await changeAudio(device, level, inputId);
    } catch (err) {
      updateAudio();
      return { ok: false, message: err.message };
    }
    const { [device]: endpoint, version } = updateAudio();
    return { ok: true, message, ...(Number.isInteger(level) ? { confirmed: { endpoint, version } } : {}) };
  });

  deck('audio:outputs:list', () => {
    try {
      return { ok: true, ...audio.listOutputs() };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  });
  deck('audio:outputs:select', async (id) => {
    try {
      await audio.setDefaultOutput(id);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err.message };
    } finally {
      updateAudio();
    }
  });

  function talk(channel, callback) {
    ipcMain.handle('audio:ptt:' + channel, async (event, ...args) => {
      if (!fromWindow(event, win, RENDERER)) return { ok: false, message: 'Unauthorized sender' };
      if (deckSession.blocked && channel !== 'stop') return SESSION_BLOCKED;
      if (deckReveal.active && channel !== 'stop') return REVEAL_BLOCKED;
      if (viewOnly.enabled && channel !== 'stop') return VIEW_ONLY_BLOCKED;
      try {
        await callback(event.sender, ...args);
        return { ok: true };
      } catch (err) {
        return { ok: false, message: err.message };
      }
    });
  }
  talk('start', (owner, token, id) => pushToTalk.start(owner, token, id));
  talk('renew', (owner, token) => pushToTalk.renew(owner, token));
  talk('stop', (owner, token) => pushToTalk.stop(owner, token));

  deck('audio:peaks', (inputId) => audio.readPeaks(inputId));
  deck('audio:apps:list', () => {
    try {
      return { ok: true, apps: appMixerPins.withStatus(audio.listApps()) };
    } catch (err) {
      return { ok: false, message: err.message, apps: appMixerPins.withStatus([]) };
    }
  });
  deck('audio:apps:change', (id, level) => {
    try {
      audio.changeApp(id, level);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err.message };
    } finally {
      agentAppAudio?.checkPending();
    }
  });

  deck('key:confirmation:begin', (id, revision) => {
    observeDeckForeground();
    if (typeof id !== 'string' || revision !== pages.revision) return { ok: false, message: 'Page changed' };
    const page = keyContext(id);
    if (!pages.binding(page).active) return { ok: false, message: 'The target window is unavailable.' };
    const key = store.findKey(keyId(id), page);
    const reason = key?.unavailable ?? shortcutUnavailableHere(key?.action);
    if (reason) return { ok: false, message: reason };
    if (confirmationMode(key?.confirm) !== 'prompt') return { ok: false, message: 'Key confirmation unavailable' };
    return { ok: true, token: keyConfirmation.begin(id, revision, readForeground.windowId?.()) };
  });
  deck('key:confirmation:cancel', (token) => keyConfirmation.cancel(token));

  deck('key:press', async (id, kind, revision, token, trace) => {
    panelMeasurement?.run?.command(trace, 'request');
    const press = resolveDeckPress(id, kind, revision);
    if (!press.ok) return press;
    if (confirmationMode(press.key.confirm) === 'prompt'
        && !keyConfirmation.consume(token, id, revision, readForeground.windowId?.())) {
      return { ok: false, message: 'The confirmation is no longer valid. Open it again.' };
    }
    const result = await queueDeckPress(press, { deckPress: true, trace });
    return result.ignored ? IGNORED : { ok: result.ok, message: result.message, unavailable: result.unavailable,
      ...(result.cancelled ? { cancelled: true } : {}), ...stepResults(result) };
  });

  ipcMain.on('measurement:report', (event, batch) => {
    if (panelMeasurement?.run && fromWindow(event, win, RENDERER)) panelMeasurement.run.receive(batch);
  });

  ipcMain.on('renderer:ready', (event) => {
    if (!fromWindow(event, win, RENDERER)) return;
    send('deck:appearance', appearance.current);
    if (feeds) {
      send('feeds', feeds.snapshot());
      send('weather', feeds.snapshot().weather ?? { line: '' });
    }
    send('pomodoro:changed', pomodoro.snapshot());
    if (panelMeasurement?.run) send('measurement:state', panelMeasurement.run.state);
    if (liveSensors) send('sensors', { ...liveSensors, history: sensors.history.series });
    if (liveAudio) send('audio', liveAudio);
    sendDashboardCalendar();
    send('audio:ptt', pushToTalk.view);
    send('obs', obs.view);
    if (appViews.automatic) send('app-views:focus', appViews.snapshot());
    if (profileError) send('status', { ok: false, message: profileError });
  });
}

// ---------------------------------------------------------------- startup

function start() {
  if (process.platform === 'win32') setSecretStorage(safeStorage);
  if (process.platform === 'linux') {
    linuxDesktop = createLinuxDesktop({ log, x11Window: app.commandLine.getSwitchValue('ozone-platform') === 'x11',
      onChange: () => { if (win && readForeground) refreshPage(true); } });
    if (linuxDesktop.reason) log(linuxDesktop.reason);
    if (linuxDesktop.close) disposables.add('Linux desktop', linuxDesktop.close);
  }
  // Lastra's own pages use no camera, microphone, notification or similar browser permission;
  // refuse them all in the default session as a second line of defence.
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  // Teardown runs newest first, so the shared PowerShell host registered here is released last.
  disposables.add('shared PowerShell', disposeSharedPowerShell);
  const display = deckDisplay();
  if (!opts.windowed && !display) {
    quitWithoutEdge();
    return;
  }
  const userData = app.getPath('userData');
  interfaceLanguage = new InterfaceLanguage(path.join(userData, 'interface-language.json'), () => app.getPreferredSystemLanguages());
  toolChoices = readJsonSettings(path.join(userData, 'tool-choices.json'), {
    maxBytes: 4_096,
    parse(data) {
      const choices = data?.version === 1 && normalizeChoices(data.choices);
      if (!choices) throw new Error('Invalid pick list');
      return choices;
    },
    fallback: () => DEFAULT_CHOICES,
    onError: () => log('Could not read Tools pick list.'),
  });
  statsSelection = new StatsSelection(path.join(userData, 'stats-selection.json'));
  processTelemetry = new ProcessTelemetry();
  sensorWidgets = new SensorWidgetSamples(() => liveSensors && ({
    sample: liveSensors, details: sensors.detail(liveSensors.hardwareSource),
  }));
  navigation = new DeckNavigation(path.join(userData, 'deck-navigation.json'), log);
  const power = createPowerEvents(powerMonitor, { log });
  disposables.add('power events', () => power.dispose());
  pomodoro = new Pomodoro(path.join(userData, 'pomodoro.json'), { onChange: (snapshot) => send('pomodoro:changed', snapshot) });
  disposables.add('Pomodoro', () => pomodoro.close());
  power.on('pomodoro', 'resume', () => pomodoro.restoreClock());
  dashboardAgenda = new DashboardAgenda(path.join(userData, 'dashboard-agenda.json'), {
    choose: async () => {
      const result = await dialog.showOpenDialog(editor, { title: 'Choose a local calendar file', properties: ['openFile'],
        filters: [{ name: 'iCalendar', extensions: ['ics'] }] });
      return result.canceled ? null : result.filePaths[0];
    },
    open: (url) => shell.openExternal(url),
  });
  const profileSuffix = opts.profile ? '-' + createHash('sha256').update(opts.profile.toLowerCase()).digest('hex').slice(0, 16) : '';
  pageLists = new DeckPageLists(path.join(userData, `deck-page-lists${profileSuffix}.json`), log);
  deckReveal = new DeckReveal({ BrowserWindow, ipcMain, restore: () => showDeck() });
  disposables.add('desktop reveal', () => deckReveal.dispose());
  viewOnly = new DeckViewOnly(path.join(userData, 'deck-view-only.json'), log);
  emojiUsage = new EmojiUsage(path.join(userData, 'emoji-usage.json'), log);
  appearance = new DeckAppearance(path.join(userData, 'deck-appearance.json'), log);
  feeds = new Feeds(path.join(userData, 'feeds.json'), {
    legacyWeather: path.join(userData, 'weather.json'),
    onChange(snapshot) {
      send('feeds', snapshot);
      send('weather', snapshot.weather ?? { line: '' });
      send('deck:navigation', { view: navigation.current.view, statsTab: deckStatsTab, sheet: deckSheet, views: snapshot.cycle });
    },
    log,
  });
  const feedsTimer = setInterval(() => { void feeds.refresh(); }, 60 * 1000);
  disposables.add('feeds', () => clearInterval(feedsTimer));
  void feeds.refresh();
  activities = new ActivityProfiles({ directory: userData, stockDirectory: path.dirname(DEFAULT_PROFILE), explicitFile: opts.profile });
  activateActivity(opts.profile ? 'main' : navigation.current.activity);
  deckShortcuts = new DeckShortcuts({ file: path.join(userData, `deck-shortcuts${profileSuffix}.json`),
    shortcuts: globalShortcut, run: runDeckShortcut, unavailable: shortcutUnavailableOnDeck, log });
  disposables.add('global deck shortcuts', () => deckShortcuts?.close());
  disposables.add('profile store', () => store?.close());
  activities.on('change', () => {
    log('Profile reloaded');
    profileError = null;
    deckShortcuts.sync();
    agentApply?.checkPending();
    agentActivitySwitch?.checkPending();
    refreshPage(true);
    publishAgentEvent('profile', { revision: pages.revision });
    send('status', { ok: true, message: 'Profile reloaded' });
  });
  activities.on('warning', (err) => {
    log(err.message);
    profileError = err.message;
    agentActivitySwitch?.checkPending();
    send('status', { ok: false, message: err.message });
  });

  monitoring = new MonitoringSettings(path.join(app.getPath('userData'), 'monitoring.json'), log);
  retainedTelemetry = new RetainedTelemetry(path.join(userData, 'telemetry-history.json'), { hours: monitoring.historyHours, log });
  disposables.add('Stats history', () => retainedTelemetry.flush());
  const intervals = monitoring.intervals;
  obs = Obs.fromFile(path.join(app.getPath('userData'), 'obs.json'));
  disposables.add('OBS', () => obs.stop());
  productionTimers = new ProductionTimers(path.join(userData, 'production-timers.json'));
  productionModes = new ProductionModes(path.join(userData, 'production-modes.json'), obs);
  disposables.add('production modes', () => productionModes.dispose());
  productionModes.on('update', (state) => {
    send('production:modes:update', state);
    if (editor && !editor.isDestroyed() && !editor.webContents.isDestroyed()) editor.webContents.send('editor:production:modes', state);
  });
  obs.on('update', (view) => {
    agentObsActions?.checkPending();
    agentObsOutputs?.checkPending();
    send('obs', view);
    publishAgentProviders();
  });
  obs.start();

  const onSample = opts.measureDeck ? recordPanelProvider : undefined;
  nowPlaying = new WindowsMedia(path.join(app.getPath('userData'), 'media-helper'), { log, onSample });
  disposables.add('Windows media', () => nowPlaying.stop());
  nowPlaying.setPollInterval(intervals.media);
  audio = createAudio();
  disposables.add('audio', () => audio.close());
  pushToTalk = new PushToTalk(audio, {
    startGuard: startMicGuard,
    publish(view) {
      send('audio:ptt', view);
      if (view.phase === 'idle' || view.phase === 'talking') updateAudio();
    },
  });
  const cancelDeckActions = () => {
    windowsSessionRevision++;
    productionModes?.interrupt();
    choicePrompts.check();
    void pushToTalk.cancel();
    keyPresses.cancelPending();
    keyConfirmation.clear();
  };
  deckSession.resume(powerMonitor.getSystemIdleState?.(1));
  deckShortcuts.sync();
  function blockDeck(transition) {
    transition();
    deckShortcuts.sync();
    agentActivitySwitch?.checkPending();
    agentSpotifyActions?.checkPending();
    processTelemetry.stop();
    kubernetesView?.stop();
    displayBacklight.invalidate();
    cancelDeckActions();
    syncWebEmbedSuspension();
    refreshPage(true);
  }
  function unblockDeck(transition) {
    transition();
    deckShortcuts.sync();
    syncWebEmbedSuspension();
    if (!deckSession.blocked && !deckReveal.active) pages.observe(readForeground.context?.());
    refreshPage(true);
  }
  power.on('deck-session', 'suspend', () => blockDeck(() => deckSession.suspend()));
  power.on('deck-session', 'lock-screen', () => blockDeck(() => deckSession.lock()));
  power.on('deck-session', 'unlock-screen', () => unblockDeck(() => deckSession.unlock()));
  power.on('deck-session', 'resume', () => unblockDeck(() => deckSession.resume(powerMonitor.getSystemIdleState?.(1))));
  appMixerPins = new AppMixerPins(path.join(app.getPath('userData'), 'audio-pins.json'), log);
  let appWindows;
  const windows = () => {
    if (appWindows === undefined) appWindows = createAppWindowReader();
    return appWindows;
  };
  const windowShortcutMode = process.platform === 'win32'
    ? createWindowShortcutMode({ findPack: (context) => packFor(context, store.current.webApps) }) : undefined;
  if (windowShortcutMode) disposables.add('shortcut window mode', () => windowShortcutMode.dispose());
  readForeground = linuxDesktop ? linuxForeground(linuxDesktop) : createForegroundReader({
    readAppIdentity: () => windows()?.foreground({ appId: true, title: false }),
    windowShortcutMode,
    needsTitle: () => store.current.pages.some((page) => page.windowTitle),
  });
  runner = createActionRunner({ shell, spawn, input: linuxDesktop ? linuxInput(linuxDesktop) : createInput(), audio: { change: changeAudio },
    toggleSpotify: (verifyTarget) => nowPlaying.toggle('spotify', verifyTarget), readForeground,
    selectObsScene: (action) => changeObsScene(obs, action),
    readShortcutSettings: () => store.current,
    readState: readMacroState, focusApp: (wanted) => windows()?.focusApp(wanted),
    restoreWorkspace: (id) => workspaces.apply(id), chooseAction: (choice, verify) => choicePrompts.ask(choice, verify),
    changeTimer: ({ command, ...timer }) => timers.change({ type: command, ...timer }).message,
    playSound: ({ command, ...clip }) => command === 'stop-all' ? soundboard.stopAll() : soundboard.play(clip) });
  async function openConfig(file) {
    const error = await shell.openPath(file);
    if (error && process.platform === 'win32') {
      return runner.run({ type: 'launch', target: '%WINDIR%\\System32\\notepad.exe', args: [file] });
    }
    return error ? { ok: false, message: error } : { ok: true };
  }
  const openExternal = (url) => shell.openExternal(url);
  const workspaces = new Workspaces(path.join(userData, 'workspaces.json'), {
    windows, openConfig, openShortcut: (file) => shell.openPath(file), run: runner.run,
    displays() {
      const primary = screen.getPrimaryDisplay().id;
      return screen.getAllDisplays().map((display) => ({ ...display, primary: display.id === primary }));
    },
    toScreenRect: (rect) => screen.dipToScreenRect(null, rect),
    readShortcutLink: (file) => shell.readShortcutLink(file),
  });
  webEmbedHost = new WebEmbedHost({ BrowserWindow, WebContentsView, session, ipcMain, getOwner: () => win, openExternal });
  disposables.add('web embeds', () => webEmbedHost.dispose());
  syncWebEmbedSuspension();
  const webEmbeds = new WebEmbeds(path.join(app.getPath('userData'), 'web-embeds.json'), { host: webEmbedHost, openConfig, openExternal });
  terminalView = new TerminalView(path.join(app.getPath('userData'), 'terminal.json'), {
    run: runner.run, openConfig, openLog: (file) => shell.openPath(file), log,
  });
  disposables.add('terminal', () => terminalView.close());
  const alerts = new AlertInbox(path.join(app.getPath('userData'), 'alerts.json'), { onChange: (entries) => {
    navigationBadges?.refresh();
    agentAlertAck?.checkPending();
    const active = entries.filter(({ status }) => status === 'active');
    publishAgentEvent('alerts', { active: active.length, unacknowledged: active.filter(({ acknowledgedAt }) => acknowledgedAt == null).length });
  } });
  // A finished timer stays in the alert inbox until it is dismissed or started again.
  const timerAlert = (id, name) => ({ id: `timer:${id}`, name, viewId: undefined, targetId: undefined, source: 'Timers' });
  timers = new Timers(path.join(userData, 'timers.json'), { onChange(state, { completed, cleared }) {
    for (const { id, label, endedAt } of completed) {
      const at = new Date(endedAt).toLocaleTimeString(store?.current?.locale, { hour: '2-digit', minute: '2-digit' });
      alerts.update(timerAlert(id, label), 'active', `Finished at ${at}`);
    }
    for (const id of cleared) alerts.update(timerAlert(id, alerts.entries.get(`timer:${id}`)?.name ?? id), 'recovered', 'Dismissed');
    send('timers:update', state);
  } });
  disposables.add('timers', () => timers.close());
  power.on('timers', 'resume', () => timers.restoreClock());
  timers.start();
  soundboard = new Soundboard({ createHost: createSoundHost, expandPath: (file) => expandPathEnv(file),
    onChange: (state) => send('sounds:update', state) });
  disposables.add('soundboard', () => soundboard.close());
  // A locked or sleeping PC should not keep playing clips nobody can stop from the deck.
  for (const event of ['lock-screen', 'suspend']) power.on('soundboard', event, () => soundboard.stopAll());
  let readSystemPower;
  const powerStatus = new PowerStatus({
    readSystem: () => (readSystemPower ??= createPowerReader())(),
    upsFile: path.join(app.getPath('userData'), 'ups-status.json'),
  });
  power.on('power-source', 'on-ac', () => powerStatus.observe('ac'));
  power.on('power-source', 'on-battery', () => powerStatus.observe('battery'));
  let readHelperProcess;
  const resources = new ResourceMonitor({
    settings: monitoring,
    onSettingsChanged(next) {
      hardware?.setIntervalMs(next.hardware);
      sensors?.setHardwareIntervals({ managed: next.hardware, http: next.http });
      nowPlaying.setPollInterval(next.media);
      send('monitoring', next);
    },
    readApp: () => app.getAppMetrics(),
    readHelper(pid) {
      readHelperProcess ??= createProcessReader();
      return readHelperProcess(pid);
    },
    helperPids: () => ({ hardware: hardware?.child?.pid, media: nowPlaying?.child?.pid }),
    embedUsage: () => webEmbedHost.usage(),
  });
  if (opts.measureDeck) {
    const cursor = createPanelPointerReader();
    panelMeasurement = new PanelMeasurements({
      input: () => ({ cursor: cursor(), window: readForeground.windowId?.() ?? null }),
      resources: () => resources.snapshot(),
      setup() {
        const page = pages.current(store.current);
        const display = edge ?? screen.getPrimaryDisplay();
        const bounds = process.platform === 'win32' ? screen.dipToScreenRect(null, display.bounds) : display.bounds;
        return {
          lastra: app.getVersion(), view: navigation.current.view, display: { width: bounds.width, height: bounds.height,
            rotation: display.rotation, scale: display.scaleFactor }, windowed: opts.windowed,
          grid: page.grid ?? store.current.grid, keys: page.keys.filter(Boolean).length,
          widgets: page.widgets.length, barKeys: store.current.bar.keys.filter(Boolean).length,
          barWidgets: store.current.bar.widgets.length, providerIntervalsMs: { ...monitoring.intervals },
          hardwareStatus: liveSensors?.hardwareSource ?? 'idle', mediaStatus: nowPlaying.diagnosticStatus(),
        };
      },
      update(state) {
        send('measurement:state', state);
        refreshTray();
      },
    });
    disposables.add('panel measurement', () => panelMeasurement.close());
  }
  incidentTimeline = new IncidentTimeline(path.join(userData, 'incident-timeline.json'), {
    onChange: (timeline) => send('stats:incidents:update', timeline),
  });
  serviceHealth = new ServiceHealth(path.join(app.getPath('userData'), 'service-checks.json'), {
    openConfig,
    onUpdate: () => navigationBadges.refresh(),
    onChecks: (ids) => {
      alerts.retireMissing('Service health', ids.map((id) => `service:${id}`));
      incidentTimeline.retainChecks(ids);
    },
    onResult(check, status, result) {
      incidentTimeline.observe(check, status);
      if (status === 'down' || status === 'up') {
        alerts.update({ id: `service:${check.id}`, name: check.name, viewId: 'service-health', targetId: check.id,
          source: 'Service health' }, status === 'down' ? 'active' : 'recovered', result.detail);
      }
    },
  });
  disposables.add('service health', () => serviceHealth.stop());
  navigationBadges = new NavigationBadges({
    alertCount: () => alerts.unacknowledgedCount(),
    serviceChecks: () => serviceHealth.badgeChecks(),
    timerCount: () => productionTimers.activeCount(),
    onChange: (state) => send('deck:badges', state),
  });
  disposables.add('navigation badges', () => navigationBadges.stop());
  telemetryThresholds = new TelemetryThresholds(path.join(app.getPath('userData'), 'hardware-thresholds.json'), {
    openConfig,
    onRules: (ids) => alerts.retireMissing('Hardware thresholds', ids.map((id) => `hardware:${id}`)),
    onResult(rule, active, detail) {
      alerts.update({ id: `hardware:${rule.id}`, name: rule.name, viewId: 'hardware-thresholds', targetId: rule.id,
        source: 'Hardware thresholds' }, active ? 'active' : 'recovered', detail);
    },
  });
  disposables.add('hardware thresholds', () => telemetryThresholds.stop());
  const docker = new DockerProvider({ run: runner.run });
  const watchlist = new MonitoringWatchlist(path.join(app.getPath('userData'), 'watchlist.json'), {
    serviceHealth: () => serviceHealth.snapshot(),
    resources: () => resources.snapshot(),
    resourceInterval: () => monitoring.intervals.resources,
    docker: () => docker.snapshot(),
  });
  readWindowIcons = process.platform === 'win32' ? createAppWindowIcons({
    getSources: (options) => desktopCapturer.getSources(options),
    getFileIcon: (file, options) => app.getFileIcon(file, options),
  }) : undefined;
  const spotifyAccount = new SpotifyAccount(app.getPath('userData'), {
    openConfig, openExternal, storage: process.platform === 'win32' ? safeStorage : undefined,
  });
  disposables.add('Spotify account', () => spotifyAccount.close());
  agentRuns = new RunActivity({ activity: () => activities.current.id, client: (id) => agentAccess?.client(id),
    available: () => Boolean(agentAccess?.state.enabled && !agentAccess.state.paused && agentService && !agentService.locked) });
  const snippets = new SnippetLibrary(path.join(userData, 'snippets.json'), {
    openConfig, copyText: (value) => clipboard.writeText(value),
  });
  const clipboardPins = new ClipboardPins(path.join(userData, 'clipboard-pins.json'), {
    readText: () => /** @type {string} */ (/** @type {unknown} */ (clipboard.readText())), writeText: (value) => clipboard.writeText(value),
    storage: process.platform === 'win32' ? safeStorage : undefined,
    currentGuard() {
      const deck = captureDeckGuard();
      return () => deck.blocked()
        ?? (!deck.sameOwner() || deck.sessionChanged() || navigation.current.view !== 'apps'
          || appViews.settings.selected !== 'clipboard-pins' ? 'Open Pinned clipboard on the deck again.' : undefined);
    },
  });
  const vscodeView = new VscodeView(userData);
  kubernetesView = new KubernetesView(path.join(userData, 'kubernetes.json'), {
    openConfig,
    canRead: () => win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && !deckSession.blocked
      && !deckReveal.active && navigation.current.view === 'apps' && appViews?.settings.selected === 'kubernetes' && win,
  });
  disposables.add('Kubernetes view', () => kubernetesView.stop());
  appViews = new AppViews(path.join(app.getPath('userData'), 'app-views.json'), {
    icon: lucideIcon, run: runner.run, actionHistory,
    windowIcons: readWindowIcons,
    providers: {
      wsl: new WslProvider({ run: runner.run }),
      vscode: vscodeView,
      projects: new ProjectPalette(path.join(userData, 'projects.json'), {
        currentProject: () => vscodeView.currentProject(), openConfig, openExternal,
        openDocument: (file) => shell.openPath(file), run: runner.run,
        currentGuard() {
          const deck = captureDeckGuard();
          return () => deck.blocked()
            ?? (!deck.sameOwner() || deck.sessionChanged() || navigation.current.view !== 'apps'
              || appViews.settings.selected !== 'projects' ? 'Open Projects on the deck again.' : undefined);
        },
      }),
      docker,
      claude: new ClaudeView(app.getPath('userData'), { openConfig, run: runner.run, windows }),
      chatgpt: new ChatGptView(path.join(app.getPath('userData'), 'chatgpt.json'), {
        openConfig, run: runner.run, windows, snippets,
      }),
      snippets,
      spotify: new SpotifyView(path.join(app.getPath('userData'), 'spotify.json'), {
        openConfig, run: runner.run, openEmbed: (entry) => webEmbeds.openSpotify(entry), account: spotifyAccount,
      }),
      netflix: new NetflixView(path.join(app.getPath('userData'), 'netflix.json'), {
        openConfig, run: runner.run, createWindows: createAppWindowReader,
      }),
      'streaming-watchlist': new StreamingWatchlist(path.join(app.getPath('userData'), 'streaming-watchlist.json'), {
        openConfig, run: runner.run,
      }),
      terminal: terminalView,
      notes: new NotesView(path.join(userData, 'notes.json')),
      'clipboard-pins': clipboardPins,
      'service-health': serviceHealth,
      syncthing: new SyncthingView(path.join(userData, 'syncthing.json'), { openConfig, openExternal }),
      prometheus: new PrometheusView(path.join(userData, 'prometheus.json'), { openConfig, openExternal,
        canRead: () => Boolean(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && !deckSession.blocked && !deckReveal.active) }),
      'hardware-thresholds': telemetryThresholds,
      kubernetes: kubernetesView,
      'audio-presets': new AudioPresets(path.join(userData, 'audio-presets.json'), {
        read: updateAudio, write: (device, level, id) => changeAudio(device, level, id), log,
        currentGuard: () => captureDeckGuard().reason,
      }),
      resources,
      power: powerStatus,
      watchlist,
      'action-history': actionHistory,
      'agent-activity': { snapshot: () => agentRuns.snapshot(), change: (command) => agentRuns.changeFromDeck(command) },
      'web-embeds': webEmbeds,
      workspaces,
      'github-checks': new GitHubChecksView(path.join(userData, 'github-checks.json'), { openConfig, openExternal,
        canRead: () => Boolean(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && !deckSession.blocked
          && !deckReveal.active && navigation.current.view === 'apps' && appViews.settings.selected === 'github-checks') }),
      alerts,
    }, log,
    customFile: path.join(app.getPath('userData'), 'app-views.custom.json'), createWindows: windows, openConfig,
    onUpdate: (snapshot, focusChanged) => send(focusChanged ? 'app-views:focus' : 'app-views:updated', snapshot),
  });
  disposables.add('app views', () => appViews.close());
  integrationSetup = new IntegrationSetup({ sources: {
    obs: () => obs.view,
    spotify: () => cachedSpotifySetup(spotifyAccount),
    vscode: () => appViews.providers.vscode.snapshot(),
    claude: () => appViews.providers.claude.sessions(),
    chatgpt: () => appViews.providers.chatgpt.snapshot(),
    services: () => serviceHealth.snapshot(),
    audio: () => liveAudio,
  }, actions: integrationSetupActions({ dataDirectory: userData, sourceRoot: ROOT, openLocal: openConfig, openExternal }) });
  if (process.platform === 'win32' && !opts.profile) {
    agentAccess = new AgentAccess(path.join(userData, 'agent-access.json'), { log });
    agentEvents = new AgentEvents();
    disposables.add('agent events', () => agentEvents.close());
    agentDrafts = new AgentDrafts();
    const agentAppViewDrafts = new AgentAppViewDrafts(agentDrafts);
    const agentMonitoringDrafts = new AgentMonitoringDrafts(agentDrafts, {
      thresholds: () => telemetryThresholds.configuration(), watchlist: () => watchlist.configuration(),
    });
    agentGestureFixtures = new AgentGestureFixtures({ file: path.join(userData, 'agent-gesture-fixtures.json'), drafts: agentDrafts, log });
    const approve = createAgentReview({ BrowserWindow, ipcMain, language: () => interfaceLanguage.language, bounds() {
      const area = (edge ?? screen.getPrimaryDisplay()).workArea;
      const width = Math.min(1080, area.width);
      const height = Math.min(720, area.height);
      return { x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2), width, height };
    } });
    agentApply = new AgentProfileApply({
      drafts: agentDrafts, history: actionHistory, approve, openEditor: offerEditorDraft,
      readContext: () => ({ activity: activities.current.id, store, label: ACTIVITIES[activities.current.id] + ' profile' }),
    });
    agentChoices = new AgentChoices({ approve, history: actionHistory,
      canReview: () => Boolean(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()
        && !deckSession.blocked && !deckReveal.active && !viewOnly.enabled),
    });
    agentActivitySwitch = new AgentActivitySwitch({ activities, approve, history: actionHistory,
      canReview: () => win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()
        && !viewOnly.enabled && !deckReveal.active && !deckSession.blocked && win,
      switchTo(id) {
        switchActivity(id);
        return { active: activities.current.id, saved: !navigation.unsaved && navigation.current.activity === id };
      },
    });
    agentActions = new AgentActions({ prepare: prepareAgentPress, history: actionHistory, approve });
    const agentAudio = new AgentAudioReader({ readState: () => liveAudio, listPlayback: () => audio.listOutputs(),
      listApps: () => audio.listAppControls(), pinStatus: (apps) => appMixerPins.withStatus(apps), readPeaks: (ids) => audio.readVerifiedPeaks(ids) });
    const canReviewAudio = () => win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()
      && !viewOnly.enabled && !deckReveal.active && !deckSession.blocked && win;
    agentAppAudio = new AgentAppAudio({ read: () => audio.listAppControls(), alias: (owner, kind, id) => agentAudio.alias(owner, kind, id),
      revision: (owner, id, stamp) => agentAudio.appRevision(owner, id, stamp), approve, history: actionHistory,
      canReview: canReviewAudio,
      write: (_device, level, appId, _before, endpoint, allowed) => audio.setAppLevel(appId, level, endpoint.stamp, allowed),
    });
    agentAudioActions = new AgentAudioActions({ read: () => audio.read(), alias: (owner, kind, id) => agentAudio.alias(owner, kind, id),
      async write(device, level, id) {
        try { await changeAudio(device, level, id); }
        finally { updateAudio(); }
      }, approve, history: actionHistory, canReview: canReviewAudio });
    agentAudioMuteActions = new AgentAudioActions({ property: 'muted', read: () => audio.read(), alias: (owner, kind, id) => agentAudio.alias(owner, kind, id),
      write(device, muted, id, before) {
        try { return audio.setEndpointMute(device, muted, id, before); }
        finally { updateAudio(); }
      }, approve, history: actionHistory,
      canReview: ({ device }) => (device !== 'microphone' || (!pushToTalk.lease && !pushToTalk.toggling)) && canReviewAudio() });
    agentAudioRouting = new AgentAudioRouting({ read: () => audio.readPlaybackRouting(), alias: (owner, kind, id) => agentAudio.alias(owner, kind, id),
      async write(_device, _desired, id, _before, endpoint, canContinue) {
        try { await audio.setDefaultOutput(id, { expected: endpoint.roles, canContinue }); }
        finally { updateAudio(); }
      }, approve, history: actionHistory, canReview: canReviewAudio });
    const agentMedia = new AgentMediaReader({ windows: (id, options) => nowPlaying.snapshotForAgent(id, options),
      spotify: (options) => spotifyAccount.snapshot({ ...options, includeControl: true }), obs: () => obs.view });
    const canReviewAgentMedia = () => Boolean(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()
      && !viewOnly.enabled && !deckReveal.active && !deckSession.blocked);
    agentWindowsMedia = new AgentWindowsMediaActions({ player: nowPlaying, media: agentMedia, approve, history: actionHistory,
      canReview: canReviewAgentMedia });
    agentSpotifyActions = new AgentSpotifyActions({ player: spotifyAccount, media: agentMedia, approve, history: actionHistory,
      canReview: canReviewAgentMedia });
    agentObsActions = new AgentObsActions({ obs, media: agentMedia, approve, history: actionHistory, canReview: canReviewAgentMedia });
    agentObsOutputs = new AgentObsActions({ obs, approve, history: actionHistory, productionOutputs: true, canReview: canReviewAgentMedia });
    const workspaceInventory = new AgentWorkspaceInventory(workspaces);
    agentProjects = new AgentProjects({ readProjects: () => appViews.providers.projects.projects(),
      readCommands: () => terminalView.configuredCommands() });
    const agentProjectActions = new AgentProjectActions({ inventory: agentProjects, terminal: terminalView, approve, history: actionHistory,
      actionGuard() {
        const deck = captureDeckGuard();
        const { owner } = deck;
        return () => Boolean(owner && deck.sameOwner() && !owner.isDestroyed() && owner.isVisible() && !deckSession.blocked
          && !deck.sessionChanged() && !deck.blocked());
      },
    });
    agentWorkspaceApply = new AgentWorkspaceApply({ inventory: workspaceInventory, approve, history: actionHistory,
      canArrange: () => Boolean(win && !win.isDestroyed() && win.isVisible() && !viewOnly.enabled && !deckReveal.active && !deckSession.blocked) });
    agentAlertAck = new AgentAlertAck({ inbox: alerts, approve, history: actionHistory,
      canReview: () => !viewOnly.enabled && !deckReveal.active });
    const visualPreview = new AgentVisualPreview({ drafts: agentDrafts, readCurrent: () => store.editorSnapshot(),
      readLive(selected, view) {
        const readings = {};
        if (selected.includes('audio')) {
          const { output, microphone, sampledAt, version } = previewAudio(liveAudio);
          readings.audio = { output, microphone, sampledAt, version, inputs: microphone ? [microphone] : [] };
        }
        if (selected.includes('telemetry')) {
          readings.sensors = previewSensors(liveSensors, sensors?.history.series);
          if (view === 'stats') readings.stats = previewStats(stats?.snapshot({ refresh: false }));
        }
        return readings;
      },
      render: createAgentDeckRenderer({ BrowserWindow, session, net, nativeImage, root: ROOT }) });
    const surface = () => {
      const display = edge ?? screen.getPrimaryDisplay();
      const [width, height] = win?.getContentSize() ?? [display.bounds.width, display.bounds.height];
      const logical = { x: display.bounds.x, y: display.bounds.y, width, height };
      const physical = screen.dipToScreenRect(null, logical);
      return {
        logical: { width, height, units: 'dip' },
        physical: { width: physical.width, height: physical.height, units: 'px' }, scale: display.scaleFactor,
      };
    };
    agentService = new AgentService(agentAccess, {
      profile: () => activities.current.id, history: actionHistory, events: agentEvents, log,
      projectAllowed: (binding) => agentProjects.grantCurrent(binding),
      onChange() {
        agentApply.checkPending();
        agentChoices.checkPending();
        agentActivitySwitch.checkPending();
        agentActions.checkPending();
        agentWorkspaceApply.checkPending();
        agentAlertAck.checkPending();
        agentObsActions.checkPending();
        agentObsOutputs.checkPending();
        agentAudioActions.checkPending();
        agentAudioMuteActions.checkPending();
        agentAudioRouting.checkPending();
        agentAppAudio.checkPending();
        agentWindowsMedia.checkPending();
        agentSpotifyActions.checkPending();
        refreshTray();
      },
      readers: {
        deck_navigation: (parameters) => {
          navigateDeck(parameters);
          const { page, reason } = pages.selection(store.current);
          const { active } = pages.binding(page);
          const dimensions = navigationSurface({ ...surface(), rotation: (edge ?? screen.getPrimaryDisplay()).rotation,
            available: Boolean(win && !win.isDestroyed() && !win.webContents.isCrashed()) });
          return { surface: dimensions, view: navigation.current.view, statsTab: deckStatsTab, revision: pages.revision,
            page: { id: page.id, name: page.name, reason, sheet: deckSheet, locked: pages.locked, following: pages.following,
              targetAvailable: Boolean(active) },
            pages: store.current.pages.map(({ id, name }) => ({ id, name })), appearance: appearance.current,
          };
        },
        profile_layout: () => {
          const dimensions = surface();
          const { logical } = dimensions;
          const view = currentView();
          return { ...describeLayoutView(view, view.page, logical.height > logical.width, appearance.current.largeKeys),
            revision: view.revision, sheet: view.deckSheet, surface: dimensions };
        },
        profile_snapshot: (parameters) => profileSnapshot({
          profile: store.current, active: pages.selection(store.current).page, revision: pages.revision, now: Date.now(),
          navigation: { activity: activities.current.id, view: navigation.current.view, statsTab: deckStatsTab,
            sheet: deckSheet, pageLocked: pages.locked },
          surface: surface(),
        }, parameters),
        profile_draft: (parameters, client) => {
          const result = agentDrafts.change(client.id, activities.current.id, parameters, () => {
            const base = store.editorSnapshot();
            if (!base.profile || base.warning) throw new DraftRequestError('The active saved profile is unavailable to fork.');
            return { profile: base.profile, token: base.token };
          });
          agentApply.checkPending();
          return result;
        },
        profile_changes: (parameters, client, authorized) => agentApply.change(client, parameters, authorized),
        agent_choice: (parameters, client, authorized) => agentChoices.change(parameters, client, authorized),
        profile_activity: (parameters, client, authorized) => agentActivitySwitch.change(client, parameters, authorized),
        app_view_draft: (parameters, client) => agentAppViewDrafts.change(client.id, activities.current.id, parameters),
        monitoring_draft: (parameters, client) => agentMonitoringDrafts.change(client.id, activities.current.id, parameters),
        gesture_fixture: (parameters, client, authorized) => agentGestureFixtures.change(client.id, activities.current.id, parameters, authorized),
        registered_action: (parameters, client, authorized) => agentActions.change(client, parameters, authorized),
        agent_run: (parameters, client, authorized) => agentRuns.change(parameters, client, authorized),
        telemetry_read: (parameters) => readTelemetry(parameters, {
          stats: () => stats?.snapshot({ refresh: false }), power: () => powerStatus.snapshot(), usage: () => resources.snapshot(),
          services: () => serviceHealth.snapshot(), alerts: () => alerts.snapshot(), thresholds: () => telemetryThresholds.snapshot(),
          watchlist: () => watchlist.snapshot({ refresh: false }),
        }),
        alert_acknowledge: (parameters, client, authorized) => agentAlertAck.change(client, parameters,
          () => authorized() && Boolean(agentAccess.client(client.id)?.scopes.includes('telemetry'))),
        audio_read: (parameters, client) => agentAudio.snapshot(parameters, client.id),
        audio_action: (parameters, client, authorized) => agentAudioActions.change(client, parameters, authorized),
        audio_mute: (parameters, client, authorized) => agentAudioMuteActions.change(client, parameters, authorized),
        audio_route: (parameters, client, authorized) => agentAudioRouting.change(client, parameters, authorized),
        audio_app_level: (parameters, client, authorized) => agentAppAudio.change(client, parameters, authorized),
        media_read: (parameters, client) => agentMedia.windowsState(parameters, client.id),
        media_action: (parameters, client, authorized) => agentWindowsMedia.change(client, parameters, authorized),
        spotify_read: (parameters, client) => agentMedia.spotifyState(parameters, client.id),
        spotify_action: (parameters, client, authorized) => agentSpotifyActions.change(client, parameters, authorized),
        obs_read: (parameters, client) => agentMedia.obsState(parameters, client.id),
        obs_action: (parameters, client, authorized) => agentObsActions.change(client, parameters, authorized),
        obs_output: (parameters, client, authorized) => agentObsOutputs.change(client, parameters, authorized),
        workspace_inventory: (parameters, client) => workspaceInventory.snapshot(parameters, client.id),
        project_inventory: (parameters, client) => agentProjects.read(client.id, activities.current.id, parameters,
          client.scopes.includes('project-actions'), client.project),
        project_command: (parameters, client, authorized) => agentProjectActions.change(client, activities.current.id, parameters, authorized),
        workspace_apply: (parameters, client, authorized) => agentWorkspaceApply.change(client, parameters, authorized),
        workspace_target: (parameters, client, authorized) => agentWorkspaceApply.change(client, parameters, authorized, 'target'),
        workspace_external: (parameters, client, authorized) => agentWorkspaceApply.change(client, parameters, authorized, 'external'),
        preview_draft: (parameters, client, authorized) => visualPreview.preview(client.id, activities.current.id, parameters, authorized,
          (scope) => Boolean(agentService.client(client.id)?.scopes.includes(scope))),
        provider_status: readAgentProviders,
      },
    });
    disposables.add('agent service', () => agentService.stop());
    const closeProjectGrantWatch = watchMonitorConfig(path.join(userData, 'projects.json'), () => {
      agentService.reconcile();
      refreshTray();
    }, () => log('Could not watch configured project grants.'));
    disposables.add('project grant watch', closeProjectGrantWatch);
    const setAgentLocked = (locked) => {
      if (locked) agentRuns.clear();
      agentService.setLocked(locked);
      agentChoices.checkPending();
      agentWorkspaceApply.checkPending();
      agentAudioActions.checkPending();
      agentAudioMuteActions.checkPending();
      agentAudioRouting.checkPending();
      agentAppAudio.checkPending();
      agentObsOutputs.checkPending();
      agentWindowsMedia.checkPending();
      agentSpotifyActions.checkPending();
    };
    const sessionState = () => setAgentLocked(['locked', 'unknown'].includes(powerMonitor.getSystemIdleState(1)));
    sessionState();
    power.on('agent-session', 'lock-screen', () => setAgentLocked(true));
    power.on('agent-session', 'suspend', () => setAgentLocked(true));
    power.on('agent-session', 'unlock-screen', () => setAgentLocked(deckSession.blocked));
    power.on('agent-session', 'resume', sessionState);
  }
  observeDeckForeground();
  servePreviewAssets(protocol, net, ROOT);
  registerIpc();

  const tray = new Tray(nativeImage.createFromPath(path.join(ROOT, 'assets', 'tray.png')));
  tray.on('click', () => openEditor());
  trayMenu = createTrayMenu({
    tray, electron: { Menu, dialog, clipboard, screen, shell }, log, startup, opts, root: ROOT,
    language: () => interfaceLanguage.language,
    state: () => ({ edge, store, activities, viewOnly, navigation, pages, monitoring, retainedTelemetry, deckReveal,
      panelMeasurement, preferredDisplay, win, update: updater?.menuItem(
        (label, values) => translate(interfaceLanguage.language, label, values),
        () => openEditor('updates'), restartToUpdate) ?? null, agent: agentAccess ? { access: agentAccess, service: agentService, drafts: agentDrafts,
        gestureFixtures: agentGestureFixtures, runs: agentRuns, apply: agentApply, projects: agentProjects } : null }),
    actions: {
      openEditor, switchActivity, setViewOnly, sendDashboardCalendar, exportDiagnostics, refreshPage,
      showInfo: (where) => { void dialog.showMessageBox({ type: 'info', title: 'Lastra', message: `Lastra ${app.getVersion()}`, detail: where }); },
      setMonitoringInterval: (source, intervalMs) => resources.change({ action: 'refresh', source, intervalMs }),
      organizationItems: deckOrganizationItems,
      watchlistItems: () => {
        const { checks = [] } = serviceHealth.snapshot();
        const options = watchlist.options(checks);
        const missing = watchlist.pins.filter((id) => !options.some((option) => option.id === id))
          .map((id) => ({ id, label: 'Unavailable reading' }));
        return [...options, ...missing].map(({ id, label }) => ({
          label, type: 'checkbox', checked: watchlist.pins.includes(id),
          click: ({ checked }) => {
            try { watchlist.change({ action: 'pin', id, pinned: checked }); }
            catch (error) { dialog.showErrorBox('Watchlist readings', error.message); }
          },
        }));
      },
      selectDisplay(id) {
        preferredDisplay = id;
        restoreDeck();
      },
      showDeck: () => showDeck(), revealDesktop: () => revealDesktop(), quit: () => app.quit(),
    },
  });
  updater = createUpdater({ app, log, preview: Boolean(opts.preview), supported: process.platform === 'win32', onChange: () => {
    trayMenu?.refresh();
    const status = updateStatus();
    send('update:status', status);
    if (editor && !editor.isDestroyed() && !editor.webContents.isCrashed()) editor.webContents.send('update:status', status);
  } });
  disposables.add('updates', () => updater.stop());
  updater.start();
  const maintenanceContext = () => ({
    platform: process.platform, root: ROOT, dialog, clipboard, shell, screen, window: editor,
    store, monitoring, retainedTelemetry, watchlist, serviceHealth, panelMeasurement, win,
    activity: () => activities.current.id,
    setMonitoringInterval: (source, intervalMs) => resources.change({ action: 'refresh', source, intervalMs }),
    exportDiagnostics,
    agent: agentAccess ? {
      access: agentAccess, service: agentService, drafts: agentDrafts, gestureFixtures: agentGestureFixtures,
      runs: agentRuns, apply: agentApply, projects: agentProjects,
    } : null,
  });
  const maintain = (channel, callback) => ipcMain.handle(channel, (event, ...args) => {
    if (!fromWindow(event, editor, EDITOR)) throw new Error('Unauthorized sender');
    return callback(...args);
  });
  maintain('editor:maintenance:get', () => readMaintenance(maintenanceContext()));
  maintain('editor:maintenance:set', (command) => runMaintenance(maintenanceContext(), command));
  if (!opts.windowed) {
    hardware = new HardwareMonitor(path.join(app.getPath('userData'), 'hardware-monitor'), log, { intervalMs: intervals.hardware, onSample });
    disposables.add('hardware monitor', () => hardware.stop());
    for (const event of /** @type {const} */ (['display-added', 'display-removed', 'display-metrics-changed'])) {
      screen.on(/** @type {any} */ (event), () => displayBacklight.invalidate());
    }
    displayWatcher = watchDeckDisplay({ screen, powerMonitor: power.subscriber('deck-display'), select: deckDisplay, restore: restoreDeck,
      missing: () => {
        if (deckReveal.active) restoreDeck(null);
        else quitWithoutEdge();
      } });
    disposables.add('display watcher', () => displayWatcher.stop());
  }
  createDeckWindow(display);
  if (opts.enableWaylandKeyboard) void linuxDesktop?.enable?.();
  if (opts.editor) openEditor('profile');
  else if (opts.settings) openEditor();

  sensors = new SensorPoller({ hardware, fetchImpl: opts.windowed ? null : globalThis.fetch,
    managedIntervalMs: intervals.hardware, httpIntervalMs: intervals.http, onSample });
  disposables.add('sensors', () => sensors.stop());
  stats = new StatsMonitor({
    sample: () => liveSensors && {
      sample: liveSensors, hardware: sensors.detail(liveSensors.hardwareSource), history: sensors.history.series,
    },
    display: () => ({ displays: screen.getAllDisplays(), selected: (edge ?? screen.getPrimaryDisplay()).id }),
    foreground: () => readForeground.context?.(),
    onSample, retained: retainedTelemetry,
  });
  disposables.add('Stats', () => stats.stop());
  sensors.on('data', guarded(log, 'Sensor update', (data) => {
    liveSensors = data;
    retainedTelemetry.record(data);
    telemetryThresholds.observe(data);
    const bound = sensorWidgets.snapshot(undefined, { record: true });
    send('sensors', Object.keys(bound).length ? { ...data, sensorWidgets: bound } : data);
    updateAudio();
    publishAgentProviders();
  }));
  telemetryThresholds.start();
  sensors.start();
  serviceHealth.start();
  foregroundTimer = setInterval(guarded(log, 'Foreground check', () => {
    if (deckSession.blocked) return;
    const foreground = readForeground.context?.();
    observeDeckForeground(foreground);
    pollAgentPlayback();
    if (deckReveal.active) return;
    const appViewContext = foreground?.shell ? '' : foreground?.executable ?? null;
    if (appViews.observe(appViewContext, !pages.locked && !foreground?.shell) !== undefined) {
      send('app-views:focus', appViews.snapshot());
    }
  }), 300);
  disposables.add('foreground check', () => clearInterval(foregroundTimer));
}

// `--preview=<png>`: render the deck offscreen with sample readings, save a screenshot and quit.
function runPreview() {
  return startPreview({
    opts, ipcMain, BrowserWindow, log, quit: () => app.quit(), fail: failStartup,
    renderer: RENDERER, defaultProfile: DEFAULT_PROFILE, background: BACKGROUND, webPreferences,
    deck: {
      pages, send, currentView, refreshPage, repaginatePage,
      setStore(value) { store = value; },
      setStats(value) { stats = value; },
      setWindow(value) { win = value; },
    },
  });
}

function failStartup(err) {
  console.error('[lastra]', err);
  // app.exit() skips will-quit, so release what start() managed to register before exiting.
  disposables.dispose();
  app.exit(1);
}

function reloadFrontend() {
  let reloaded = 0;
  for (const window of [win, editor]) {
    const contents = window && !window.isDestroyed() ? window.webContents : null;
    if (!contents || contents.isDestroyed()) continue;
    contents.reloadIgnoringCache();
    reloaded += 1;
  }
  log(reloaded ? 'Reloaded the deck interface.' : 'No deck window is open to reload.');
}

app.setAppUserModelId(APP_ID);
if (process.platform === 'linux') app.commandLine.appendSwitch('class', 'lastra');
declarePreviewScheme(protocol);

if (opts.preview) {
  app.whenReady().then(runPreview).catch(failStartup);
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(start).catch(failStartup);
  app.on('window-all-closed', () => {});
  app.on('second-instance', (_event, argv) => {
    if (edgeExit) return;
    const requested = parseArgs(argv);
    if (requested.reload) {
      reloadFrontend();
      return;
    }
    if (requested.enableWaylandKeyboard) void linuxDesktop?.enable?.();
    if ((requested.editor || requested.settings) && store) openEditor(requested.editor ? 'profile' : 'settings');
    else if (store) showDeck();
  });
  let microphoneQuit = 'idle';
  app.on('before-quit', () => {
    keyPresses.cancelPending();
    keyConfirmation.clear();
  });
  app.on('will-quit', (event) => {
    // Never leave a push-to-talk microphone open: hold the quit until Windows confirms the mute.
    if (pushToTalk?.lease && microphoneQuit !== 'ready') {
      event.preventDefault();
      if (microphoneQuit === 'idle') {
        microphoneQuit = 'waiting';
        void pushToTalk.dispose().then((confirmed) => {
          if (!confirmed) log('Windows did not confirm push-to-talk mute before quitting.');
          microphoneQuit = 'ready';
          app.quit();
        });
      }
      return;
    }
    disposables.dispose();
  });
}
