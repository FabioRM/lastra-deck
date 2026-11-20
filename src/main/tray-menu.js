// @ts-check
'use strict';

// The notification-area entry point and the advanced menus opened from the desktop Settings window.

const path = require('node:path');
const { describeDisplay } = require('./display');
const { CALENDARS, CONTEXT_RETURN_CHOICES } = require('./deck-navigation');
const { ACTIVITIES } = require('./activity-profiles');
const { SCOPES, activityScope, TEMPORARY_GRANT_MS } = require('./mcp-access');
const { SCOPE: RUN_SCOPE } = require('./mcp-run-activity');
const { HISTORY_HOURS } = require('./retained-telemetry');
const { openTouchSetup, showTouchDiagnostics } = require('./touch-diagnostics');
const { translate } = require('../shared/i18n');

const DESKTOP_MENUS = Object.freeze({
  navigation: ['Activity profile', 'View-only mode', 'After an app page', 'Dashboard calendar', 'Deck display',
    'Restore deck', 'Reveal desktop', 'Show deck', 'Swipe up from the bottom of Deck Keys to reveal desktop'],
  monitoring: ['Local Stats history', 'Refresh intervals'],
  agents: ['Agent access'],
  diagnostics: ['Panel measurement', 'Touch diagnostics', 'Configure Windows touch', 'Export diagnostics…',
    'Reload interface', 'Developer tools'],
});

/**
 * @typedef {object} AgentServices The local agent access services; present only on Windows without `--profile=`.
 * @property {any} access
 * @property {any} service
 * @property {any} drafts
 * @property {any} gestureFixtures
 * @property {any} runs
 * @property {any} apply
 * @property {any} projects
 */

/**
 * @typedef {object} TrayState Read on every rebuild and on every click that needs the current value.
 * @property {any} edge The deck display, or null.
 * @property {any} store The active profile store.
 * @property {any} activities
 * @property {any} viewOnly
 * @property {any} navigation
 * @property {any} pages
 * @property {any} monitoring
 * @property {any} retainedTelemetry
 * @property {any} deckReveal
 * @property {any} panelMeasurement
 * @property {string | null} preferredDisplay
 * @property {{ label: string, enabled: boolean, click?: () => void } | null} [update] Update item from updater.js, or null.
 * @property {any} win The deck window, or null.
 * @property {AgentServices | null} agent
 */

/**
 * @typedef {object} TrayActions
 * @property {() => void} openEditor
 * @property {(where: string) => void} showInfo
 * @property {(source: string, intervalMs: number) => void} setMonitoringInterval
 * @property {() => any[]} organizationItems
 * @property {() => any[]} watchlistItems
 * @property {(id: string) => void} switchActivity
 * @property {(enabled: boolean) => void} setViewOnly
 * @property {() => void} sendDashboardCalendar
 * @property {(id: string | null) => void} selectDisplay Sets the preferred deck display and moves the deck.
 * @property {() => void} exportDiagnostics
 * @property {() => void} showDeck
 * @property {() => void} revealDesktop
 * @property {(force?: boolean) => void} refreshPage
 * @property {() => void} quit
 */

/**
 * Text of the grant confirmation: what the selected scopes allow and which approvals they still need.
 *
 * @param {string[]} scopes
 * @param {{ profile: string, durationMs?: number, project?: { name: string } }} options
 */
function grantDetail(scopes, { profile, durationMs, project }) {
  return scopes.map((scope) => SCOPES[scope]).join(' and ') + (scopes.some(activityScope) ? ' · ' + ACTIVITIES[profile] + ' profile' : '')
    + (durationMs ? '\nThis grant ends after 15 minutes.' : '')
    + (project ? `\nOnly the configured project “${project.name}” is available to this client.` : '')
    + (scopes.includes('drafts') ? '\nThe agent may edit temporary drafts in this Lastra session.' : '')
    + (scopes.includes('apply') ? '\nEach saved profile change needs your approval.' : '')
    + (scopes.includes('profile-switch') ? '\nEach activity switch needs your approval on the deck. Profile reads and edits have separate grants.' : '')
    + (scopes.includes('navigate') ? '\nThe agent may show the deck and change its views, page lock, and appearance in this activity.' : '')
    + (scopes.includes('actions') ? '\nEach saved key action needs your approval on the deck.' : '')
    + (scopes.includes(RUN_SCOPE) ? '\nThe agent may show short temporary status cards in this activity.' : '')
    + (scopes.includes('telemetry') ? '\nThe agent may read Stats, power, and redacted monitoring data on this PC.' : '')
    + (scopes.includes('alert-actions') ? '\nEach alert acknowledgement needs your approval on the deck.' : '')
    + (scopes.includes('audio') ? '\nThe agent may read speaker and microphone signal levels, mute states, and mixer availability.' : '')
    + (scopes.includes('audio-actions') ? '\nEach speaker or microphone level change needs your approval on the deck.' : '')
    + (scopes.includes('audio-mute') ? '\nEach mute or unmute of one speaker or microphone needs your approval on the deck.' : '')
    + (scopes.includes('audio-routing') ? '\nEach Windows playback device switch needs your approval on the deck.' : '')
    + (scopes.includes('audio-app-level') ? '\nEach Windows app volume change needs your approval on the deck.' : '')
    + (scopes.some((scope) => ['media', 'spotify', 'obs'].includes(scope)) ? '\nThe agent may read state for this provider and request its available metadata.' : '')
    + (scopes.includes('media-actions') ? '\nEach Windows playback change needs your approval on the deck.' : '')
    + (scopes.includes('spotify-control') ? '\nEach Spotify Connect play or pause on the active device needs your approval on the deck.' : '')
    + (scopes.includes('obs-actions') ? '\nEach OBS scene, visibility, or mute change needs your approval on the deck.' : '')
    + (scopes.includes('obs-output-actions') ? '\nEach OBS recording or streaming change needs your approval on the deck.' : '')
    + (scopes.includes('workspaces') ? '\nThe agent may inspect saved workspaces, matching open windows, and monitor placement.' : '')
    + (scopes.includes('projects') ? '\nThe agent may read configured project destinations, command outcomes, and optional display labels in this activity.' : '')
    + (scopes.includes('project-actions') ? '\nEach start of a configured command needs approval on the deck. The requester can stop its direct process.' : '')
    + (scopes.includes('workspace-actions') ? '\nEach arrangement of existing windows needs your approval on the deck.' : '')
    + (scopes.includes('workspace-targets') ? '\nEach request to open a saved app or focus a reviewed window needs your approval on the deck.' : '')
    + (scopes.includes('workspace-external') ? '\nEach PowerToys workspace needs your approval before it can open apps or move windows.' : '')
    + (scopes.includes('agent-choices') ? '\nThe client can ask a question on the deck and receive your answer.' : '')
    + '\n\nLastra will copy the local MCP configuration for this Windows user.';
}

/**
 * @param {object} options
 * @param {AgentServices} options.agent
 * @param {() => string} options.activity The current activity id.
 * @param {any} options.dialog
 * @param {any} options.clipboard
 * @param {string} options.root The source root, for the MCP stdio entry point.
 * @param {() => void} options.refresh
 */
function agentMenu({ agent, activity, dialog, clipboard, root, refresh }) {
  const { access: agentAccess, service: agentService } = agent;
  const { enabled, paused } = agentAccess.state;
  const clients = agentAccess.activeClients();
  const connected = agentService.connected();
  const change = (operation) => {
    try {
      operation();
      const draftOwners = new Set(agentAccess.activeClients().filter(({ scopes }) => scopes.includes('drafts')).map(({ id }) => id));
      agent.drafts.prune(draftOwners);
      agent.gestureFixtures.prune(draftOwners);
      agent.runs.prune();
      agentService.reconcile();
      agent.apply.checkPending();
    } catch (error) {
      dialog.showErrorBox('Agent access', error.message);
    }
    refresh();
  };
  /**
   * @param {string[]} scopes
   * @param {{ durationMs?: number, project?: any }} [options]
   */
  async function grant(scopes, { durationMs, project } = {}) {
    const profile = activity();
    const { response } = await dialog.showMessageBox({
      type: 'question', title: 'Grant Lastra agent access', message: 'Create credentials for an agent?',
      detail: grantDetail(scopes, { profile, durationMs, project }),
      buttons: ['Cancel', 'Grant and copy setup'], defaultId: 0, cancelId: 0,
    });
    if (response !== 1 || activity() !== profile || agentService.locked || agentAccess.state.paused) return;
    if (project && !agent.projects.grantCurrent(project.binding)) throw new Error('The project configuration changed.');
    change(() => {
      const credential = agentAccess.grant(scopes, profile, { durationMs, project: project?.binding });
      clipboard.writeText(JSON.stringify({ mcpServers: { lastra: {
        command: 'node', args: [path.join(root, 'extensions', 'lastra-mcp', 'stdio.js')],
        env: { LASTRA_AGENT_CREDENTIAL: credential },
      } } }, null, 2));
    });
  }
  const grantEnabled = enabled && !paused && !agentService.locked;
  /**
   * @param {string[]} scopes
   * @param {{ durationMs?: number, project?: any }} [options]
   */
  const grantItem = (scopes, options) => ({ label: scopes.map((scope) => SCOPES[scope]).join(' and '),
    click: () => void grant(scopes, options).catch(() => dialog.showErrorBox('Agent access', 'The grant could not be created. Check the selected activity or project.')) });
  const projectTargets = agent.projects?.grantTargets() ?? [];
  return {
    label: 'Agent access',
    submenu: [
      { label: 'Enable local agent access', type: 'checkbox', checked: enabled, click: ({ checked }) => change(() => agentAccess.setEnabled(checked)) },
      { label: 'Pause agent access', type: 'checkbox', checked: paused, enabled, click: ({ checked }) => change(() => agentAccess.setPaused(checked)) },
      { label: agentService.locked ? 'Windows session unavailable' : `${connected.size} connected`, enabled: false },
      {
        label: 'Grant access', enabled: grantEnabled,
        submenu: [['layout'], ['providers'], ['layout', 'providers'], ['drafts'], ['layout', 'drafts'], ['drafts', 'apply'], ['drafts', 'telemetry'], ['agent-choices'],
          ['profile-switch'], ['layout', 'navigate'], ['layout', 'actions'], ['telemetry'], ['audio'], ['media'], ['spotify'], ['obs'],
          ['telemetry', 'alert-actions'], ['obs', 'obs-actions'], ['obs', 'obs-output-actions'],
          ['audio', 'audio-actions'], ['audio', 'audio-mute'], ['audio', 'audio-routing'], ['audio', 'audio-app-level'], ['workspaces'],
          ['workspaces', 'workspace-actions'], ['workspaces', 'workspace-targets'], ['workspaces', 'workspace-external'],
          ['media', 'media-actions'], ['projects'],
          ['spotify', 'spotify-control'],
          ['projects', 'project-actions'], [RUN_SCOPE]].map((scopes) => grantItem(scopes)),
      },
      {
        label: 'Grant read access for 15 minutes', enabled: grantEnabled,
        submenu: [['layout'], ['providers'], ['layout', 'providers'], ['telemetry'], ['audio'], ['media'], ['spotify'], ['obs'], ['workspaces'], ['projects']]
          .map((scopes) => grantItem(scopes, { durationMs: TEMPORARY_GRANT_MS })),
      },
      {
        label: 'Grant access to one project', enabled: grantEnabled && projectTargets.length > 0,
        submenu: projectTargets.map((project) => ({ label: project.name, submenu: [grantItem(['projects'], { project }),
          grantItem(['projects', 'project-actions'], { project })] })),
      },
      {
        label: 'Clients', enabled: clients.length > 0,
        submenu: clients.map(({ id, scopes, profile, expiresAt, project }) => ({
          label: `Agent ${id.slice(0, 8)} · ${connected.has(id) ? 'Connected' : 'Offline'}`,
          submenu: [
            { label: scopes.map((scope) => SCOPES[scope]).join(' and ') + (profile ? ' · ' + ACTIVITIES[profile] : ''), enabled: false },
            ...(project ? [{ label: projectTargets.find(({ binding }) => binding.id === project.id && binding.revision === project.revision)?.name
              ?? 'Granted project unavailable', enabled: false }] : []),
            ...(expiresAt === undefined ? [] : [{ label: 'Expires at ' + new Date(expiresAt).toLocaleTimeString(undefined,
              { hour: 'numeric', minute: '2-digit' }), enabled: false }]),
            { label: 'Revoke access', click: () => change(() => agentAccess.revoke(id)) },
          ],
        })),
      },
    ],
  };
}

/**
 * @param {object} options
 * @param {{ isEnabled(): boolean, setEnabled(enabled: boolean): void }} options.startup
 * @param {any} options.dialog
 * @param {(...args: any[]) => void} options.log
 * @param {() => void} options.refresh
 * @param {(label: string) => string} options.t
 */
function loginMenuItem({ startup, dialog, log, refresh, t }) {
  let checked = false;
  let enabled = true;
  try {
    checked = startup.isEnabled();
  } catch (err) {
    enabled = false;
    log('Windows startup setting unavailable:', err.message);
  }
  return {
    label: t('Start with Windows'),
    type: 'checkbox',
    checked,
    enabled,
    click: ({ checked }) => {
      try {
        startup.setEnabled(checked);
      } catch (err) {
        dialog.showErrorBox(t('Start with Windows'), err.message);
      }
      refresh();
    },
  };
}

/**
 * @param {object} options
 * @param {{ setToolTip(text: string): void, setContextMenu(menu: any): void }} options.tray
 * @param {{ Menu: any, dialog: any, clipboard: any, screen: any, shell: any }} options.electron
 * @param {(...args: any[]) => void} options.log
 * @param {{ isEnabled(): boolean, setEnabled(enabled: boolean): void }} options.startup
 * @param {{ windowed: boolean, profile: string | null }} options.opts
 * @param {string} options.root
 * @param {string} [options.platform]
 * @param {() => string} [options.language]
 * @param {() => TrayState} options.state
 * @param {TrayActions} options.actions
 */
function createTrayMenu({ tray, electron, log, startup, opts, root, platform = process.platform, language = () => 'en', state, actions }) {
  const { Menu, dialog, clipboard, screen, shell } = electron;
  const t = (label) => translate(language(), label);
  const localize = (items) => items.map(({ label, submenu, ...item }) => ({
    ...item, ...(label ? { label: t(label) } : {}), ...(Array.isArray(submenu) ? { submenu: localize(submenu) } : {}),
  }));

  /** @param {TrayState} current */
  function desktopItems(current) {
    const { activities, viewOnly, navigation, pages, monitoring, retainedTelemetry, deckReveal, panelMeasurement,
      preferredDisplay, agent } = current;
    return [
      { label: 'Open profile JSON', click: () => shell.openPath(state().store.file) },
      { label: 'Show profile in folder', click: () => shell.showItemInFolder(state().store.file) },
      ...(agent ? [agentMenu({ agent, activity: () => state().activities.current.id, dialog, clipboard, root, refresh })] : []),
      ...(panelMeasurement ? [{
        label: 'Panel measurement',
        submenu: [
          { label: 'Record idle (60 seconds)', enabled: !panelMeasurement.run, click: () => panelMeasurement.start('idle') },
          { label: 'Record active (60 seconds)', enabled: !panelMeasurement.run, click: () => panelMeasurement.start('active') },
        ],
      }] : []),
      ...(!opts.profile ? [{
        label: 'Activity profile',
        submenu: Object.entries(ACTIVITIES).map(([id, label]) => ({
          label, type: 'radio', checked: id === activities.current.id,
          click: () => {
            try {
              actions.switchActivity(id);
            } catch (error) {
              dialog.showErrorBox('Activity profile', error.message);
              refresh();
            }
          },
        })),
      }] : []),
      {
        label: 'View-only mode', type: 'checkbox', checked: viewOnly.enabled,
        click: ({ checked }) => {
          try {
            actions.setViewOnly(checked);
          } catch (error) {
            dialog.showErrorBox('View-only mode', error.message);
          }
          refresh();
        },
      },
      {
        label: 'After an app page',
        submenu: Object.entries(CONTEXT_RETURN_CHOICES).map(([mode, label]) => ({
          label, type: 'radio', checked: mode === navigation.current.contextReturn,
          click: () => {
            navigation.setContextReturn(mode);
            pages.setContextReturn(mode);
            actions.refreshPage();
            refresh();
          },
        })),
      },
      {
        label: 'Local Stats history',
        submenu: Object.entries(HISTORY_HOURS).map(([value, label]) => ({
          label, type: 'radio', checked: Number(value) === monitoring.historyHours,
          click: () => {
            try {
              const hours = Number(value);
              monitoring.setHistoryHours(hours);
              retainedTelemetry.configure(hours);
            } catch (error) {
              dialog.showErrorBox('Local Stats history', error.message);
            }
            refresh();
          },
        })),
      },
      ...(monitoring.snapshot ? [{
        label: 'Refresh intervals',
        submenu: Object.entries({ resources: 'Process usage', hardware: 'Managed hardware', http: 'Hardware HTTP', media: 'Media updates' })
          .map(([source, label]) => ({ label, submenu: monitoring.snapshot().options[source].map((value) => ({
            label: `${value / 1_000} s`, type: 'radio', checked: value === monitoring.intervals[source],
            click: () => {
              try { actions.setMonitoringInterval(source, value); }
              catch (error) { dialog.showErrorBox('Refresh intervals', error.message); }
            },
          })) })),
      }] : []),
      {
        label: 'Dashboard calendar',
        submenu: Object.entries(CALENDARS).map(([calendar, { label }]) => ({
          label, type: 'radio', checked: navigation.current.calendar === calendar,
          click: () => {
            navigation.setCalendar(calendar);
            actions.sendDashboardCalendar();
          },
        })),
      },
      {
        label: 'Deck display',
        enabled: !opts.windowed,
        submenu: [
          { label: 'Detect automatically', type: 'radio', checked: preferredDisplay === null,
            click: () => actions.selectDisplay(null) },
          ...screen.getAllDisplays().map((display) => ({
            label: describeDisplay(display), type: 'radio', checked: String(display.id) === String(preferredDisplay),
            click: () => actions.selectDisplay(String(display.id)),
          })),
        ],
      },
      ...(platform === 'win32' ? [
        { label: 'Touch diagnostics', click: () => showTouchDiagnostics({ screen, dialog, clipboard }) },
        { label: 'Configure Windows touch', click: () => openTouchSetup(dialog) },
      ] : []),
      { label: 'Export diagnostics…', click: actions.exportDiagnostics },
      ...(deckReveal.active ? [{ label: 'Restore deck', enabled: opts.windowed || Boolean(current.edge), click: () => actions.showDeck() }]
        : [{ label: 'Reveal desktop', click: () => actions.revealDesktop() }, { label: 'Show deck', click: () => actions.showDeck() }]),
      { label: 'Swipe up from the bottom of Deck Keys to reveal desktop', type: 'checkbox', checked: navigation.current.desktopRevealGesture,
        click: ({ checked }) => { navigation.setDesktopRevealGesture(checked); actions.refreshPage(true); refresh(); } },
      { label: 'Reload interface', click: () => state().win?.reload() },
      { label: 'Developer tools', click: () => state().win?.webContents.openDevTools({ mode: 'detach' }) },
    ];
  }

  function refresh() {
    const current = state();
    const where = current.edge ? describeDisplay(current.edge) : t(opts.windowed ? 'Windowed mode' : 'XENEON EDGE not found');
    tray.setToolTip(`Lastra: ${where}`);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Lastra', click: () => actions.openEditor() },
      platform === 'win32' ? loginMenuItem({ startup, dialog, log, refresh, t }) : { label: t('Start with Windows'), enabled: false },
      { label: t('About'), click: () => actions.showInfo(where) },
      { label: t('Quit'), click: () => actions.quit() },
    ]));
  }

  function settingsItems(group) {
    const current = state();
    if (group === 'updates') return current.update ? [current.update] : [];
    if (group === 'organization') return actions.organizationItems();
    if (group === 'watchlist') return actions.watchlistItems();
    const labels = group === 'files' ? ['Open profile JSON', 'Show profile in folder']
      : Object.hasOwn(DESKTOP_MENUS, group) ? DESKTOP_MENUS[group] : [];
    return desktopItems(current).filter(({ label }) => labels.includes(label));
  }

  return { refresh, settingsItems, openSettings(group, window) {
    const items = settingsItems(group);
    if (!items.length) return false;
    Menu.buildFromTemplate(['organization', 'watchlist'].includes(group) ? items : localize(items)).popup({ window });
    return true;
  } };
}

module.exports = { createTrayMenu, grantDetail };
