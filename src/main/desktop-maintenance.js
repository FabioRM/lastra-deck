// @ts-check
'use strict';

// In-page Settings actions. The desktop window used to open these as native menus.

const path = require('node:path');
const { SCOPES, TEMPORARY_GRANT_MS } = require('./mcp-access');
const { ACTIVITIES } = require('./activity-profiles');
const { HISTORY_HOURS } = require('./retained-telemetry');
const { GRANT_SETS, TEMPORARY_GRANT_SETS, grantDetail } = require('./tray-menu');

const INTERVALS = Object.freeze({
  resources: 'Process usage',
  hardware: 'Managed hardware',
  http: 'Hardware HTTP',
  media: 'Media updates',
});

const grantLabel = (scopes) => scopes.map((scope) => SCOPES[scope]).join(' and ');

function grantChoice(id) {
  const match = /^(grant|temp):(\d+)$/.exec(String(id ?? ''));
  if (!match) return null;
  const sets = match[1] === 'grant' ? GRANT_SETS : TEMPORARY_GRANT_SETS;
  const scopes = sets[Number(match[2])];
  return scopes ? { scopes, temporary: match[1] === 'temp' } : null;
}

function agentSnapshot(agent) {
  if (!agent) return null;
  const { enabled, paused } = agent.access.state;
  const clients = agent.access.activeClients();
  const connected = agent.service.connected();
  const projects = (agent.projects?.grantTargets() ?? []).map((project) => ({
    id: project.binding.id, revision: project.binding.revision, name: project.name,
  }));
  return {
    enabled, paused, locked: Boolean(agent.service.locked), connected: connected.size,
    grantEnabled: Boolean(enabled && !paused && !agent.service.locked),
    clients: clients.map(({ id, scopes, profile, expiresAt, project }) => ({
      id, short: id.slice(0, 8), online: connected.has(id),
      summary: grantLabel(scopes) + (profile ? ' · ' + (ACTIVITIES[profile] ?? profile) : ''),
      project: project ? (projects.find((item) => item.id === project.id && item.revision === project.revision)?.name
        ?? 'Granted project unavailable') : '',
      expiresAt: typeof expiresAt === 'number' ? expiresAt : null,
    })),
    grants: GRANT_SETS.map((scopes, index) => ({ id: `grant:${index}`, label: grantLabel(scopes) })),
    temporary: TEMPORARY_GRANT_SETS.map((scopes, index) => ({ id: `temp:${index}`, label: grantLabel(scopes) })),
    projects,
  };
}

/**
 * @param {object} ctx
 */
function readMaintenance(ctx) {
  const snap = ctx.monitoring.snapshot?.() ?? null;
  const { checks = [] } = ctx.serviceHealth.snapshot();
  const options = ctx.watchlist.options(checks);
  const missing = ctx.watchlist.pins.filter((id) => !options.some((option) => option.id === id))
    .map((id) => ({ id, label: 'Unavailable reading' }));
  return {
    windows: ctx.platform === 'win32',
    measuring: Boolean(ctx.panelMeasurement?.run),
    measurement: Boolean(ctx.panelMeasurement),
    historyHours: ctx.monitoring.historyHours,
    history: Object.entries(HISTORY_HOURS).map(([hours, label]) => ({ hours: Number(hours), label })),
    intervals: snap ? Object.entries(INTERVALS).map(([source, label]) => ({
      source, label, value: snap.intervals[source], options: snap.options[source],
    })) : [],
    watchlist: [...options, ...missing].map(({ id, label }) => ({ id, label, pinned: ctx.watchlist.pins.includes(id) })),
    agent: agentSnapshot(ctx.agent),
  };
}

function settle(agent) {
  const draftOwners = new Set(agent.access.activeClients().filter(({ scopes }) => scopes.includes('drafts')).map(({ id }) => id));
  agent.drafts.prune(draftOwners);
  agent.gestureFixtures.prune(draftOwners);
  agent.runs.prune();
  agent.service.reconcile();
  agent.apply.checkPending();
}

/** @param {{ durationMs?: number, project?: { name: string, binding: any } }} [options] */
async function grant(ctx, scopes, options = {}) {
  const { durationMs, project } = options;
  const agent = ctx.agent;
  if (!agent) throw new Error('Agent access is unavailable.');
  const profile = ctx.activity();
  const { response } = await ctx.dialog.showMessageBox(ctx.window, {
    type: 'question', title: 'Grant Lastra agent access', message: 'Create credentials for an agent?',
    detail: grantDetail(scopes, { profile, durationMs, project }),
    buttons: ['Cancel', 'Grant and copy setup'], defaultId: 0, cancelId: 0,
  });
  if (response !== 1 || ctx.activity() !== profile || agent.service.locked || agent.access.state.paused) return;
  if (project && !agent.projects.grantCurrent(project.binding)) throw new Error('The project configuration changed.');
  const credential = agent.access.grant(scopes, profile, { durationMs, project: project?.binding });
  ctx.clipboard.writeText(JSON.stringify({ mcpServers: { lastra: {
    command: 'node', args: [path.join(ctx.root, 'extensions', 'lastra-mcp', 'stdio.js')],
    env: { LASTRA_AGENT_CREDENTIAL: credential },
  } } }, null, 2));
  settle(agent);
}

/**
 * @param {object} ctx
 * @param {any} command
 */
async function runMaintenance(ctx, command) {
  if (!command || typeof command !== 'object') throw new Error('Invalid settings action.');
  const agent = ctx.agent;
  switch (command.type) {
    case 'history': {
      const hours = Number(command.hours);
      if (!Object.hasOwn(HISTORY_HOURS, hours)) throw new Error('Choose a supported telemetry retention period.');
      ctx.monitoring.setHistoryHours(hours);
      ctx.retainedTelemetry.configure(hours);
      break;
    }
    case 'interval': {
      const known = ctx.monitoring.snapshot?.()?.options?.[command.source];
      if (!known?.includes(command.intervalMs)) throw new Error('Choose a supported monitoring refresh interval');
      ctx.setMonitoringInterval(command.source, command.intervalMs);
      break;
    }
    case 'watch':
      ctx.watchlist.change({ action: 'pin', id: command.id, pinned: command.pinned === true });
      break;
    case 'open-profile':
      await ctx.shell.openPath(ctx.store.file);
      break;
    case 'show-profile':
      ctx.shell.showItemInFolder(ctx.store.file);
      break;
    case 'touch':
    case 'touch-setup': {
      if (ctx.platform !== 'win32') throw new Error('Touch setup is unavailable.');
      const { openTouchSetup, showTouchDiagnostics } = require('./touch-diagnostics');
      if (command.type === 'touch') showTouchDiagnostics({ screen: ctx.screen, dialog: ctx.dialog, clipboard: ctx.clipboard });
      else openTouchSetup(ctx.dialog);
      break;
    }
    case 'export-diagnostics':
      await ctx.exportDiagnostics();
      break;
    case 'reload':
      ctx.win?.reload();
      break;
    case 'devtools':
      ctx.win?.webContents.openDevTools({ mode: 'detach' });
      break;
    case 'measure':
      if (!ctx.panelMeasurement || ctx.panelMeasurement.run || !['idle', 'active'].includes(command.phase)) {
        throw new Error('Panel measurement is unavailable.');
      }
      ctx.panelMeasurement.start(command.phase);
      break;
    case 'agent-enabled':
    case 'agent-paused':
      if (!agent) throw new Error('Agent access is unavailable.');
      if (command.type === 'agent-enabled') agent.access.setEnabled(command.enabled === true);
      else agent.access.setPaused(command.enabled === true);
      settle(agent);
      break;
    case 'grant': {
      const choice = grantChoice(command.id);
      if (!choice || !agent?.access.state.enabled) throw new Error('Agent access is unavailable.');
      await grant(ctx, choice.scopes, choice.temporary ? { durationMs: TEMPORARY_GRANT_MS } : {});
      break;
    }
    case 'project-grant': {
      if (!agent) throw new Error('Agent access is unavailable.');
      const scopes = command.kind === 'actions' ? ['projects', 'project-actions'] : command.kind === 'read' ? ['projects'] : null;
      const project = (agent.projects?.grantTargets() ?? [])
        .find((item) => item.binding.id === command.id && item.binding.revision === command.revision);
      if (!scopes || !project) throw new Error('The project configuration changed.');
      await grant(ctx, scopes, { project });
      break;
    }
    case 'revoke':
      if (!agent || typeof command.id !== 'string') throw new Error('Agent access is unavailable.');
      agent.access.revoke(command.id);
      settle(agent);
      break;
    default:
      throw new Error('Invalid settings action.');
  }
  return readMaintenance(ctx);
}

module.exports = { readMaintenance, runMaintenance, grantChoice };
