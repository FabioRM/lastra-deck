// @ts-check
'use strict';

const { inputSchema: SEARCH_INPUT, outputSchema: SEARCH_OUTPUT } = require('./mcp-catalog-search');
const { inputSchema: MACRO_INPUT, outputSchema: MACRO_OUTPUT } = require('./mcp-macros');

const { snapshotInput, snapshotOutput, snapshotParams } = require('./mcp-snapshot');
const { draftInput, draftOutput, draftParams } = require('./mcp-drafts');
const { appViewDraftInput, appViewDraftOutput, appViewDraftParams } = require('./mcp-app-view-drafts');
const { applyInput, applyOutput, applyParams } = require('./mcp-apply');
const { choiceInput, choiceOutput, choiceParams, SCOPE: CHOICES_SCOPE } = require('./mcp-choices');
const { activitySwitchInput, activitySwitchOutput, activitySwitchParams } = require('./mcp-activity-switch');
const { scenarioInput, scenarioOutput } = require('./mcp-simulate');
const { eventInput, eventOutput, eventParams, EventRequestError } = require('./mcp-events');
const { commandInput, navigationOutput, navigationParams } = require('./mcp-navigation');
const { fixtureInput, fixtureOutput, fixtureParams } = require('./mcp-gesture-fixtures');
const { actionInput, actionOutput, actionParams } = require('./mcp-actions');
const { telemetryInput, telemetryOutput, telemetryParams } = require('./mcp-telemetry');
const { monitoringDraftInput, monitoringDraftOutput, monitoringDraftParams } = require('./mcp-monitoring-drafts');
const { audioInput, audioOutput, audioParams } = require('./mcp-audio');
const { audioActionInput, audioActionOutput, audioActionParams, audioMuteInput, audioMuteParams } = require('./mcp-audio-actions');
const { audioRouteInput, audioRouteParams } = require('./mcp-audio-routing');
const { audioAppLevelInput, audioAppLevelParams } = require('./mcp-app-audio');
const { windowsActionInput, windowsActionOutput, windowsActionParams } = require('./mcp-windows-media-actions');
const { spotifyActionInput, spotifyActionOutput, spotifyActionParams } = require('./mcp-spotify-actions');
const { mediaInput, mediaOutput, mediaParams, spotifyInput, spotifyOutput, spotifyParams, obsInput, obsOutput, obsParams } = require('./mcp-media');
const { workspaceInput, workspaceOutput, workspaceParams } = require('./mcp-workspaces');
const { projectInput, projectOutput, projectParams } = require('./mcp-projects');
const { projectActionInput, projectActionOutput, projectActionParams } = require('./mcp-project-actions');
const { workspaceApplyInput, workspaceApplyOutput, workspaceApplyParams, workspaceTargetInput, workspaceTargetParams } = require('./mcp-workspace-apply');
const { visualPreviewInput, visualPreviewOutput, visualPreviewParams } = require('./mcp-visual-preview');
const { alertAckInput, alertAckOutput, alertAckParams } = require('./mcp-alert-ack');
const { obsActionInput, obsActionOutput, obsActionParams, obsOutputInput, obsOutputParams } = require('./mcp-obs-actions');
const { runInput, runOutput, runParams, SCOPE: RUN_SCOPE } = require('./mcp-run-activity');

const CATALOG_VERSION = 1;
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const EMPTY = { type: 'object', additionalProperties: false, properties: {} };
const STRING = { type: 'string' };
const INTEGER = { type: 'integer' };
const BOOLEAN = { type: 'boolean' };
const STRINGS = { type: 'array', items: STRING };
const GRID = { type: 'object', required: ['cols', 'rows'], properties: { cols: INTEGER, rows: INTEGER } };
const POSITION = { type: 'object', required: ['column', 'row', 'cols', 'rows'],
  properties: { column: INTEGER, row: INTEGER, cols: INTEGER, rows: INTEGER } };
const KEYS = { type: 'array', items: { type: 'object', required: ['id', 'layout'], properties: { id: STRING, layout: POSITION } } };
const WIDGETS = { type: 'array', items: { type: 'object', required: ['id', 'type', 'layout'],
  properties: { id: STRING, type: STRING, layout: POSITION } } };
const STATUS = { enum: ['connected', 'simulated', 'unavailable', 'stale'] };

const LAYOUT = {
  type: 'object', required: ['page', 'orientation', 'grid', 'editing', 'sheets', 'bar'],
  properties: {
    page: STRING, orientation: { enum: ['landscape', 'portrait'] }, grid: GRID, editing: KEYS,
    sheets: { type: 'array', items: { type: 'object', required: ['keys', 'widgets'], properties: { keys: KEYS, widgets: WIDGETS, group: STRING } } },
    bar: { type: 'object', required: ['keys', 'widgets'], properties: {
      keys: { type: 'array', items: { type: 'object', required: ['id', 'column'], properties: { id: STRING, column: INTEGER, span: GRID } } },
      widgets: WIDGETS,
    } },
  },
};
const CONNECTION = {
  type: 'object', required: ['status', 'scopes', 'available'], properties: { status: { const: 'connected' }, scopes: STRINGS, available: STRINGS,
    expiresAt: INTEGER, projectRestricted: { const: true } },
};
const PROVIDER = { type: 'object', required: ['status', 'reason', 'source'], properties: { status: STATUS, reason: STRING, source: STRING } };
const PROVIDERS = {
  type: 'object', required: ['version', 'sampledAt', 'providers'],
  properties: { version: { const: CATALOG_VERSION }, sampledAt: INTEGER,
    providers: { type: 'object', required: ['audio', 'media', 'telemetry', 'obs'],
      properties: { audio: PROVIDER, media: PROVIDER, telemetry: PROVIDER, obs: PROVIDER } } },
};
const DISCOVERY = {
  type: 'object', required: ['version', 'connection', 'tools'],
  properties: { version: { const: CATALOG_VERSION }, connection: PROVIDER,
    tools: { type: 'array', items: { type: 'object',
      required: ['name', 'effect', 'status', 'permission', 'prerequisite', 'reason', 'platforms'],
      properties: { name: STRING, effect: STRING, status: STATUS, permission: STRING, prerequisite: STRING, reason: STRING, platforms: STRINGS },
    } }, },
};

/**
 * @typedef {object} LiveOperation
 * @property {string} label
 * @property {string} target
 * @property {string | null} [scope]
 * @property {string[]} [allScopes]
 * @property {string[]} [anyScopes]
 * @property {string} [description]
 * @property {object} [inputSchema]
 * @property {object} [outputSchema]
 * @property {object} [example]
 * @property {string} [effect]
 * @property {boolean} [destructive]
 * @property {boolean} [internal]
 * @property {boolean} [requiresEvents]
 * @property {(value: any, ...rest: any[]) => any} [parameters]
 */

/** @type {Readonly<Record<string, LiveOperation>>} */
const LIVE_OPERATIONS = Object.freeze({
  connection: {
    label: 'Check agent connection', target: 'Lastra', scope: null, outputSchema: CONNECTION,
    description: 'Check the opted-in local Lastra connection and its available scopes.',
  },
  profile_layout: {
    label: 'Read profile layout', target: 'Deck Keys', scope: 'layout', outputSchema: LAYOUT,
    description: 'Read the active Deck Keys layout for the Windows activity granted to this client.',
  },
  provider_status: {
    label: 'Read provider availability', target: 'Providers', scope: 'providers', outputSchema: PROVIDERS,
    description: 'Read whether local audio, media, telemetry and OBS are available.',
  },
  profile_snapshot: {
    label: 'Read profile snapshot', target: 'Active profile', scope: 'layout', outputSchema: snapshotOutput,
    inputSchema: snapshotInput, parameters: snapshotParams, example: { section: 'keys', limit: 10 },
    description: 'Read paginated profile, navigation, key, widget, bar or contextual rule metadata for the granted activity.',
  },
  profile_draft: {
    label: 'Edit agent draft', target: 'Temporary profile draft', scope: 'drafts', outputSchema: draftOutput,
    inputSchema: draftInput, parameters: draftParams, example: { command: 'create', source: 'active' }, effect: 'Draft edit',
    description: 'Create, inspect, edit, preview, or discard an in-memory draft of the granted activity profile.',
  },
  app_view_draft: {
    label: 'Edit app-view draft', target: 'Temporary app-view draft', scope: 'drafts', outputSchema: appViewDraftOutput,
    inputSchema: appViewDraftInput, parameters: appViewDraftParams, effect: 'Draft edit',
    example: { command: 'create', view: { id: 'research', name: 'Research', match: { executable: 'notepad.exe' } } },
    description: 'Create, fork, edit or inspect a caller-owned custom app-view draft, preview its widget grid, or compare its draft revisions.',
  },
  profile_changes: {
    label: 'Manage profile revisions', target: 'Saved activity profile', scope: 'apply', outputSchema: applyOutput,
    inputSchema: applyInput, parameters: applyParams, example: { command: 'backups' }, effect: 'Request reviewed profile change',
    description: 'Compare a draft with the active profile or request approval for applying it, opening its page as an unsaved editor draft, or restoring a backup.',
    destructive: true,
  },
  profile_activity: {
    label: 'Manage activity switches', target: 'Lastra activity', scope: 'profile-switch', destructive: true,
    inputSchema: activitySwitchInput, outputSchema: activitySwitchOutput, parameters: activitySwitchParams,
    example: { command: 'inspect' }, effect: 'Request reviewed activity switch',
    description: 'List available activities, request a switch against its inspected revision, and check a caller-owned review outcome.',
  },
  agent_choice: {
    label: 'Request a user decision', target: 'Lastra deck', scope: CHOICES_SCOPE,
    inputSchema: choiceInput, outputSchema: choiceOutput, parameters: choiceParams,
    example: { command: 'status', request: '000000000000000000000000' },
    effect: 'Display an attributed question and return the selected option ID',
    description: 'Ask a short question with two to five options and their stated effects. Check the answer or cancel by request ID. A selection does not execute an action.',
  },
  events_since: {
    label: 'Read deck events', target: 'Deck events', requiresEvents: true, anyScopes: ['layout', 'providers'], outputSchema: eventOutput,
    inputSchema: eventInput, parameters: eventParams, example: { types: ['page', 'profile'], limit: 20 },
    description: 'Read bounded state changes for the granted activity and providers using a revision cursor.',
  },
  deck_navigation: {
    label: 'Navigate the deck', target: 'Deck surface', scope: 'navigate', inputSchema: commandInput, outputSchema: navigationOutput,
    parameters: navigationParams, example: { command: 'view', surface: 'deck', view: 'stats' }, effect: 'Navigate or change appearance',
    description: 'Inspect or show the granted deck surface, navigate views and pages, select Stats tabs, or change follow, lock, and appearance settings.',
  },
  gesture_fixture: {
    label: 'Manage gesture fixtures', target: 'Offline gesture regression fixtures', scope: 'drafts', inputSchema: fixtureInput,
    outputSchema: fixtureOutput, parameters: fixtureParams, example: { command: 'list' }, effect: 'Save or run offline gesture fixtures',
    description: 'Manage saved gesture regression fixtures or replay one approved Panel measurement contact offline using an explicit scenario against a temporary draft owned by the current client.',
  },
  registered_action: {
    label: 'Request a saved key action', target: 'Saved deck and bar keys', scope: 'actions', inputSchema: actionInput,
    outputSchema: actionOutput, parameters: actionParams, effect: 'Request local approval for a saved key', destructive: true,
    example: { command: 'run', id: 'terminal', page: 'home', gesture: 'tap', revision: 1, idempotencyKey: 'request-a8d3' },
    description: 'Request local approval to run one assigned gesture of a saved key. Read progress or cancel by request ID.',
  },
  agent_run: {
    label: 'Publish agent run activity', target: 'Agent activity', scope: RUN_SCOPE,
    inputSchema: runInput, outputSchema: runOutput, parameters: runParams, effect: 'Publish a temporary status card on the deck',
    example: { command: 'publish', run: 'build-a8d3', revision: 1, state: 'running', summary: 'Verify the project build', progress: 20 },
    description: 'Publish a short status for your run in the granted activity, or withdraw your card. The deck shows the latest revision and expires stale cards.',
  },
  telemetry_read: {
    label: 'Read telemetry and monitoring', target: 'Lastra monitoring', scope: 'telemetry', inputSchema: telemetryInput,
    outputSchema: telemetryOutput, parameters: telemetryParams, example: { section: 'metrics', group: 'cpu' },
    description: 'Read bounded stats history, power, Lastra resources, or redacted configured service and alert summaries.',
  },
  monitoring_draft: {
    label: 'Edit a monitoring draft', target: 'Temporary threshold or watchlist draft', scope: 'drafts', allScopes: ['telemetry'],
    inputSchema: monitoringDraftInput, outputSchema: monitoringDraftOutput, parameters: monitoringDraftParams, effect: 'Draft edit',
    example: { command: 'create', target: 'thresholds', source: 'active' },
    description: 'Create, edit, preview, compare or discard temporary thresholds and watchlist pins using existing monitoring aliases.',
  },
  alert_acknowledge: {
    label: 'Request an alert acknowledgement', target: 'Active Lastra monitoring alert', scope: 'alert-actions',
    inputSchema: alertAckInput, outputSchema: alertAckOutput, parameters: alertAckParams,
    effect: 'Acknowledge an active alert after local approval', destructive: true,
    example: { command: 'status', request: '000000000000000000000000' },
    description: 'Use a current alert alias and revision from telemetry to request local approval. Requires telemetry access. Read or cancel by request ID.',
  },
  audio_read: {
    label: 'Read Windows audio', target: 'Windows audio readings', scope: 'audio', inputSchema: audioInput,
    outputSchema: audioOutput, parameters: audioParams, example: { section: 'state' },
    description: 'Read scoped playback and capture levels, mute state, verified signal peaks, or mixer and device availability.',
  },
  audio_action: {
    label: 'Request a Windows audio level change', target: 'Windows audio endpoint', scope: 'audio-actions', allScopes: ['audio'],
    inputSchema: audioActionInput, outputSchema: audioActionOutput, parameters: audioActionParams, destructive: true,
    effect: 'Set one audio endpoint level after local approval',
    example: { command: 'status', request: '000000000000000000000000' },
    description: 'Use a current endpoint alias and level from audio_read to request a speaker or microphone level on the deck. Read or cancel by request ID.',
  },
  audio_mute: {
    label: 'Request a Windows endpoint mute change', target: 'Windows audio endpoint', scope: 'audio-mute', allScopes: ['audio'],
    inputSchema: audioMuteInput, outputSchema: audioActionOutput, parameters: audioMuteParams, destructive: true,
    effect: 'Mute or unmute one reviewed speaker or microphone after local approval',
    example: { command: 'status', request: '000000000000000000000000' },
    description: 'Use a current endpoint alias and mute state from audio_read to review an explicit mute or unmute. Read or cancel by request ID.',
  },
  audio_route: {
    label: 'Request Windows playback routing', target: 'Windows playback endpoints', scope: 'audio-routing', allScopes: ['audio'],
    inputSchema: audioRouteInput, outputSchema: audioActionOutput, parameters: audioRouteParams, destructive: true,
    effect: 'Switch Windows console and multimedia playback after local approval',
    example: { command: 'status', request: '000000000000000000000000' },
    description: 'Use current and destination playback aliases from audio_read to select one active playback device. Read or cancel by request ID.',
  },
  audio_app_level: {
    label: 'Set Windows app volume', target: 'Windows mixer app', scope: 'audio-app-level', allScopes: ['audio'],
    inputSchema: audioAppLevelInput, outputSchema: audioActionOutput, parameters: audioAppLevelParams, destructive: true,
    description: 'Request deck approval for the volume of the inspected Windows app sessions.',
    effect: 'Request reviewed app volume change', example: { command: 'status', request: '000000000000000000000000' },
  },
  media_read: {
    label: 'Read Windows media state', target: 'Windows media sessions', scope: 'media', inputSchema: mediaInput,
    outputSchema: mediaOutput, parameters: mediaParams, example: { section: 'active' },
    description: 'Read available Windows media sessions, transport state, and playback position.',
  },
  media_action: {
    label: 'Request a Windows playback change', target: 'Windows media session', scope: 'media-actions', allScopes: ['media'],
    inputSchema: windowsActionInput, outputSchema: windowsActionOutput, parameters: windowsActionParams, destructive: true,
    effect: 'Play, pause, seek, or skip on an exact media session after local approval',
    example: { command: 'status', request: '000000000000000000000000' },
    description: 'Use a current session alias and playback state from media_read to request play, pause, seek, next, or previous on the deck. Read or cancel by request ID.',
  },
  spotify_read: {
    label: 'Read Spotify Connect state', target: 'Spotify account', scope: 'spotify', inputSchema: spotifyInput,
    outputSchema: spotifyOutput, parameters: spotifyParams, example: { section: 'devices' },
    description: 'Read devices, playback, or queue from the Spotify account already configured on this PC.',
  },
  spotify_action: {
    label: 'Request Spotify Connect playback', target: 'Active Spotify Connect device', scope: 'spotify-control', allScopes: ['spotify'],
    inputSchema: spotifyActionInput, outputSchema: spotifyActionOutput, parameters: spotifyActionParams, destructive: true,
    effect: 'Resume or pause the current item on the reviewed Spotify Connect device after local approval',
    example: { command: 'status', request: '000000000000000000000000' },
    description: 'Use the current playback.control revision and capabilities from spotify_read to request play or pause. Read or cancel by request ID.',
  },
  obs_read: {
    label: 'Read OBS production state', target: 'OBS WebSocket', scope: 'obs', inputSchema: obsInput,
    outputSchema: obsOutput, parameters: obsParams, example: { section: 'state' },
    description: 'Read OBS connection, scenes, selected sources, recording, or streaming state.',
  },
  obs_action: {
    label: 'Request an OBS scene or source change', target: 'Connected OBS production', scope: 'obs-actions', allScopes: ['obs'],
    inputSchema: obsActionInput, outputSchema: obsActionOutput, parameters: obsActionParams, destructive: true,
    effect: 'Change an OBS scene, source visibility, or selected source mute after local approval',
    example: { command: 'status', request: '000000000000000000000000' },
    description: 'Use a current alias and generation from OBS readings to request local review. Read or cancel by request ID.',
  },
  obs_output: {
    label: 'Request an OBS recording or streaming change', target: 'Connected OBS production output', scope: 'obs-output-actions', allScopes: ['obs'],
    inputSchema: obsOutputInput, outputSchema: obsActionOutput, parameters: obsOutputParams, destructive: true,
    effect: 'Start or stop OBS recording or streaming after local approval',
    example: { command: 'status', request: '000000000000000000000000' },
    description: 'Use the current OBS generation and output state to request a recording or streaming change on the deck. Read or cancel by request ID.',
  },
  workspace_inventory: {
    label: 'Read workspace inventory', target: 'Saved Windows workspaces', scope: 'workspaces', inputSchema: workspaceInput,
    outputSchema: workspaceOutput, parameters: workspaceParams, example: { limit: 20 },
    description: 'Inspect saved workspaces, their configured launch targets, matching open windows, and monitor placement.',
  },
  project_inventory: {
    label: 'Read project inventory', target: 'Configured projects and Terminal commands', scope: 'projects', inputSchema: projectInput,
    outputSchema: projectOutput, parameters: projectParams, example: { section: 'all', limit: 16 },
    description: 'List configured projects and Terminal commands, destination categories, and redacted run results for this activity grant.',
  },
  project_command: {
    label: 'Request a registered Terminal command', target: 'Configured Terminal command', scope: 'project-actions', allScopes: ['projects'],
    inputSchema: projectActionInput, outputSchema: projectActionOutput, parameters: projectActionParams, destructive: true,
    effect: 'Start one saved command after local approval or stop the direct process started by a request',
    example: { command: 'status', request: '000000000000000000000000' },
    description: 'Request local approval for a current command alias and revision. Read or cancel your own request without receiving command lines or logs.',
  },
  workspace_apply: {
    label: 'Request a workspace arrangement', target: 'Existing windows in a saved workspace', scope: 'workspace-actions',
    inputSchema: workspaceApplyInput, outputSchema: workspaceApplyOutput, parameters: workspaceApplyParams,
    effect: 'Arrange open windows after local approval', destructive: true,
    example: { command: 'status', request: '000000000000000000000000' },
    description: 'Request local approval to arrange already-open windows for the current workspace revision. Read or cancel by request ID.',
  },
  workspace_target: {
    label: 'Request opening or focusing a saved app', target: 'An app or window registered in a Windows workspace', scope: 'workspace-targets', allScopes: ['workspaces'],
    inputSchema: workspaceTargetInput, outputSchema: workspaceApplyOutput, parameters: workspaceTargetParams,
    effect: 'Open a configured executable or focus an exact existing window after local approval', destructive: true,
    example: { command: 'status', request: '000000000000000000000000' },
    description: 'Use a fresh launch or focus revision from the workspace inventory to request a single app effect. Read or cancel by request ID.',
  },
  workspace_external: {
    label: 'Request opening a saved PowerToys workspace', target: 'PowerToys layout registered in Lastra',
    scope: 'workspace-external', allScopes: ['workspaces'], inputSchema: workspaceApplyInput,
    outputSchema: workspaceApplyOutput, parameters: workspaceApplyParams, destructive: true,
    effect: 'Open a registered PowerToys shortcut after local approval. PowerToys may launch apps and move windows.',
    example: { command: 'status', request: '000000000000000000000000' },
    description: 'Use an externalRevision from the workspace inventory to review a saved layout. Read or cancel by request ID. Windows placement is controlled by PowerToys.',
  },
  preview_draft: {
    label: 'Render a draft deck preview', target: 'Temporary profile or app-view draft', scope: 'drafts', inputSchema: visualPreviewInput,
    outputSchema: visualPreviewOutput, parameters: visualPreviewParams, example: { draft: '000000000000000000000000', revision: 1 },
    description: 'Preview Deck Keys, Dashboard, Stats, or a custom Apps draft with a screenshot and layout checks. Uses fixtures by default. Select audio or telemetry in liveReadings to use cached readings with the corresponding read grant. A layout grant enables Deck Keys geometry comparison.',
  },
  event_subscribe: {
    label: 'Follow deck events', target: 'Deck events', requiresEvents: true, anyScopes: ['layout', 'providers'], internal: true, parameters: eventParams,
  },
  event_unsubscribe: {
    label: 'Stop following deck events', target: 'Deck events', requiresEvents: true, internal: true,
    parameters(value) {
      if (!value || typeof value.subscription !== 'string' || !/^[a-f0-9]{24}$/.test(value.subscription)) {
        throw new EventRequestError('Choose an event subscription ID.');
      }
      return { subscription: value.subscription };
    },
  },
});

const profileInput = { type: 'object' };
const readOnly = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };
const tool = (name, description, inputSchema, outputSchema, example) => ({ name, description, inputSchema, outputSchema, example, annotations: readOnly });
const TOOLS = [
  ...Object.entries(LIVE_OPERATIONS).filter(([, operation]) => !operation.internal)
    .map(([name, { description, inputSchema, outputSchema, example, effect, destructive }]) => ({
    ...tool(name, description, inputSchema ?? EMPTY, outputSchema, example ?? {}),
    ...(effect ? { annotations: { readOnlyHint: false, destructiveHint: destructive === true, openWorldHint: false } } : {}),
  })),
  tool('search_catalog', 'Search the bundled action, widget, and shortcut catalog with requirements and sources. Runs offline.',
    SEARCH_INPUT, SEARCH_OUTPUT, { kind: 'shortcut', app: 'Google Docs', query: 'copy', platform: 'web' }),
  tool('compose_macro', 'Validate a supplied profile and an optional gesture edit without running actions or changing saved data.',
    MACRO_INPUT, MACRO_OUTPUT, { profile: { keys: [{ id: 'pause', action: { type: 'delay', ms: 100 } }] },
      edit: { target: { surface: 'page', page: 'home', id: 'pause' }, behavior: { hold: { type: 'delay', ms: 500 } } } }),
  tool('preview_profile', 'Validate a supplied profile and calculate its deck positions offline.', {
    type: 'object', required: ['profile'], additionalProperties: false,
    properties: { profile: profileInput, page: STRING, portrait: BOOLEAN },
  }, LAYOUT, { profile: { grid: { cols: 8, rows: 3 }, pages: [{ id: 'main', keys: [] }] }, portrait: true }),
  tool('validate_profile', 'Validate a supplied profile with the desktop editor rules.', {
    type: 'object', required: ['profile'], additionalProperties: false, properties: { profile: profileInput },
  }, { type: 'object', required: ['valid'], properties: { valid: BOOLEAN } }, { profile: { keys: [] } }),
  tool('simulate_gesture', 'Simulate a gesture, action branches and provider or target changes in a supplied profile.',
    scenarioInput, scenarioOutput, {
      profile: { keys: [{ id: 'example', action: { type: 'audio', device: 'output' } }] }, key: 'example', gesture: 'tap',
      values: { 'speaker-muted': false },
    }),
  tool('capabilities', 'Discover the Lastra tool catalog, their access requirements, and current availability.', EMPTY, DISCOVERY, {}),
];

const RESOURCES = [
  { uri: 'lastra://v1/capabilities', name: 'Lastra capabilities', mimeType: 'application/json',
    description: 'Versioned tools, inputs, outputs, examples, prerequisites and available scopes.' },
  { uri: 'lastra://v1/profile/example', name: 'Profile example', mimeType: 'application/json',
    description: 'An offline example for the profile validation and preview tools.' },
  { uri: 'lastra://v1/reference', name: 'Lastra reference links', mimeType: 'application/json',
    description: 'Project guides for agent access, actions, widgets, shortcut sources, and profile examples.' },
];
const RESOURCE_TEMPLATES = [
  {
    uriTemplate: 'lastra://v1/deck/profile{?section,page,query,cursor,limit}', name: 'Active profile snapshot',
    mimeType: 'application/json', description: 'Profile, pages, controls and navigation for the granted activity.',
  },
  {
    uriTemplate: 'lastra://v1/deck/providers', name: 'Provider availability',
    mimeType: 'application/json', description: 'Source, sample time, status, and freshness of local providers.',
  },
  {
    uriTemplate: 'lastra://v1/deck/events{?types,after,limit}', name: 'Deck events',
    mimeType: 'application/json', description: 'Revision-aware events for approved scopes. Lists types separated by commas.',
  },
];
const REFERENCE = Object.freeze({
  agentAccess: 'docs/agent-access.md', actions: 'README.md#action-fields', macros: 'docs/macros.md', widgets: 'docs/widgets.md',
  shortcutSources: 'docs/shortcut-packs.md', example: 'profiles/default.json',
});
function paginate(collection, items, cursor, size = 4) {
  const prefix = 'v' + CATALOG_VERSION + ':' + collection + ':';
  const offset = cursor === undefined ? 0 : typeof cursor === 'string' && cursor.startsWith(prefix) && /^\d{1,3}$/.test(cursor.slice(prefix.length))
    ? Number(cursor.slice(prefix.length)) : -1;
  if (offset < 0 || offset > items.length || offset % size !== 0) throw new Error('Invalid Lastra catalog cursor.');
  const entries = items.slice(offset, offset + size);
  return { [collection]: entries, ...(offset + size < items.length ? { nextCursor: prefix + (offset + size) } : {}) };
}

function providerStatus({ now, audio, media, telemetry, obs, freshnessMs }) {
  const entry = (source, status, reason) => ({ source, status, reason });
  const telemetryStatus = !Number.isFinite(telemetry) ? 'unavailable' : now - telemetry > freshnessMs ? 'stale' : 'connected';
  return { version: CATALOG_VERSION, sampledAt: now, audio: audio ? 'available' : 'unavailable',
    media: media ? 'active' : 'idle', telemetry: Number.isFinite(telemetry) ? 'available' : 'unavailable',
    obs: obs ? 'connected' : 'unavailable', providers: {
    audio: entry('Windows Core Audio', audio ? 'connected' : 'unavailable', audio ? 'Windows reports a playback endpoint.' : 'No playback endpoint is available.'),
    media: entry('Windows media sessions', media ? 'connected' : 'unavailable', media ? 'The media helper is active.' : 'The media helper starts when the media view needs it.'),
    telemetry: entry('Lastra telemetry', telemetryStatus, { connected: 'Lastra has a recent sample.', stale: 'The last sample has expired.', unavailable: 'Lastra has no sample.' }[telemetryStatus]),
    obs: entry('OBS WebSocket', obs ? 'connected' : 'unavailable', obs ? 'OBS is connected.' : 'An OBS WebSocket connection is unavailable.'),
  } };
}

module.exports = { CATALOG_VERSION, PROTOCOLS, LIVE_OPERATIONS, TOOLS, RESOURCES, RESOURCE_TEMPLATES, REFERENCE,
  paginate, providerStatus };
