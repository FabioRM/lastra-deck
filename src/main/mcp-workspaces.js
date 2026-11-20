// @ts-check
'use strict';

const { createHash, createHmac, randomBytes } = require('node:crypto');
const { SnapshotRequestError } = require('./mcp-snapshot');
const { windowRect } = require('./workspaces');

const LIMIT = 40;
const WORKSPACE_LIMIT = 24;
const TARGET_LIMIT = WORKSPACE_LIMIT * 8;
const SCREEN_LIMIT = 32;
const WORKSPACE_ALIAS = /^workspace-[a-f0-9]{24}$/;
const TARGET_ALIAS = /^target-[a-f0-9]{24}$/;
const WINDOW_ALIAS = /^window-[a-f0-9]{24}$/;
const REVISION = /^revision-[a-f0-9]{24}$/;
const CURSOR = /^[a-f0-9]{24}\.\d{1,4}$/;
const AVAILABILITY = ['available', 'empty', 'unavailable', 'invalid'];
const PLAN_STATES = ['ready', 'busy', 'missing-windows', 'ambiguous-windows', 'unavailable-monitor', 'unavailable-windows', 'external-layout'];

const text = { type: 'string' };
const integer = { type: 'integer' };
const count = { ...integer, minimum: 0 };
const number = { type: 'number' };
const boolean = { type: 'boolean' };
const nullable = (value) => ({ anyOf: [value, { type: 'null' }] });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const list = (items, maxItems) => ({ type: 'array', items, maxItems });
const boundsSchema = object({ x: integer, y: integer, width: count, height: count });
const workspaceInput = object({ metadata: boolean, limit: { ...count, minimum: 1, maximum: LIMIT }, cursor: { ...text, pattern: CURSOR.source } }, []);
const targetSchema = object({ id: text, app: text, windows: count, state: { enum: ['open', 'closed', 'multiple', 'unavailable'] } }, ['id', 'windows', 'state']);
const revisionSchema = { ...text, pattern: REVISION.source };
const windowSchema = object({ id: text, target: text, monitor: nullable(text), boundsPx: nullable(boundsSchema), minimized: boolean, maximized: boolean,
  focusRevision: nullable(revisionSchema) });
const monitorSchema = object({ id: text, number: count, primary: boolean, rotation: nullable(integer), scale: nullable(number),
  workAreaPx: object({ width: count, height: count }) });
const workspaceSchema = object({ id: { ...text, pattern: WORKSPACE_ALIAS.source }, name: text,
  kind: { enum: ['native', 'powertoys'] }, state: { enum: PLAN_STATES }, revision: nullable(revisionSchema),
  externalRevision: nullable(revisionSchema),
  apps: list(object({ target: text, monitor: nullable(text), placementPx: nullable(boundsSchema), launchRevision: nullable(revisionSchema) }), 8) },
['id', 'kind', 'state', 'revision', 'apps']);
const workspaceOutput = object({ version: { const: 1 }, sampledAt: count, status: { enum: AVAILABILITY }, windowsStatus: { enum: AVAILABILITY },
  monitors: list(monitorSchema, SCREEN_LIMIT), workspaces: list(workspaceSchema, WORKSPACE_LIMIT), targets: list(targetSchema, TARGET_LIMIT),
  windows: list(windowSchema, LIMIT), nextCursor: workspaceInput.properties.cursor },
['version', 'sampledAt', 'status', 'windowsStatus', 'monitors', 'workspaces', 'targets', 'windows']);

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeRect = (value) => value && ['x', 'y', 'width', 'height'].every((key) => Number.isSafeInteger(value[key])) && value.width > 0 && value.height > 0;
const pattern = (value, expression) => typeof value === 'string' && expression.test(value);
const allowedList = (value) => Array.isArray(value) ? value : [];
const label = (value) => value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/(?:https?|wss?|file):\S+/gi, '[link]').trim().slice(0, 80);
const marshal = (value) => JSON.stringify(value);

function workspaceParams(input = {}) {
  if (!record(input) || Object.keys(input).some((key) => !Object.hasOwn(workspaceInput.properties, key))) {
    throw new Error('Choose the workspace inventory options.');
  }
  const { metadata = false, limit = 20, cursor } = input;
  if (typeof metadata !== 'boolean' || !Number.isSafeInteger(limit) || limit < 1 || limit > LIMIT ||
      (cursor !== undefined && !pattern(cursor, CURSOR))) throw new Error('Choose a workspace page limit and cursor.');
  return { metadata, limit, cursor };
}

function page(rows, params) {
  const { metadata, limit, cursor } = params;
  const prefix = createHash('sha256').update(marshal([metadata, limit, rows.map(({ id }) => id)])).digest('hex').slice(0, 24) + '.';
  const offset = cursor === undefined ? 0 : cursor.startsWith(prefix) ? Number(cursor.slice(prefix.length)) : -1;
  if (offset < 0 || offset > rows.length || offset % limit !== 0) throw new SnapshotRequestError('The window cursor is unavailable for this inventory.');
  return { windows: rows.slice(offset, offset + limit), ...(offset + limit < rows.length ? { nextCursor: prefix + (offset + limit) } : {}) };
}

function physicalDisplays(workspaces) {
  const displays = [];
  for (const candidate of allowedList(workspaces.displays())) {
    if (!Number.isSafeInteger(candidate?.id) || !safeRect(candidate.workArea)) continue;
    const area = workspaces.toScreenRect(candidate.workArea);
    if (!safeRect(area)) continue;
    const bounds = safeRect(candidate.bounds) ? workspaces.toScreenRect(candidate.bounds) : area;
    displays.push({ id: candidate.id, primary: candidate.primary === true, workArea: candidate.workArea, area,
      bounds: safeRect(bounds) ? bounds : area, rotation: [0, 90, 180, 270].includes(candidate.rotation) ? candidate.rotation : null,
      scale: Number.isFinite(candidate.scaleFactor) && candidate.scaleFactor > 0 ? candidate.scaleFactor : null });
  }
  displays.sort((first, second) => Number(second.primary) - Number(first.primary) || first.id - second.id);
  return displays.map((display, index) => ({ ...display, number: index + 1 }));
}

function areaIn(bounds, display) {
  const overlap = (origin, span) => Math.max(0, Math.min(bounds[origin] + bounds[span], display[origin] + display[span])
    - Math.max(bounds[origin], display[origin]));
  return overlap('x', 'width') * overlap('y', 'height');
}

function containingDisplay(bounds, displays) {
  if (!bounds) return null;
  let best = null;
  let overlap = 0;
  for (const display of displays) {
    const measured = areaIn(bounds, display.bounds);
    if (measured <= overlap) continue;
    best = display;
    overlap = measured;
  }
  return best;
}

function relativeBounds(bounds, display) {
  if (!bounds || !display) return null;
  return { x: bounds.x - display.area.x, y: bounds.y - display.area.y, width: bounds.width, height: bounds.height };
}

class AgentWorkspaceInventory {
  constructor(workspaces, { now = Date.now, aliasKey = randomBytes(32) } = {}) {
    this.workspaces = workspaces;
    this.now = now;
    this.aliasKey = aliasKey;
  }

  alias(owner, kind, value) {
    return `${kind}-${createHmac('sha256', this.aliasKey).update(marshal([owner, kind, value])).digest('hex').slice(0, 24)}`;
  }

  collect() {
    const { workspaces } = this;
    let status = 'available';
    let entries = [];
    let displays = [];
    try { entries = workspaces.entries(); }
    catch { status = 'invalid'; }
    try { displays = physicalDisplays(workspaces); } catch { /* Missing topology is reflected in plan availability. */ }
    const targets = new Map(entries.flatMap(({ apps }) => allowedList(apps).map((app) => [app.identity, app])));
    const windowsByTarget = new Map();
    let windowsStatus = 'empty';
    if (targets.size) {
      try {
        const windows = workspaces.windows();
        const listed = windows?.workspaceWindows([...targets.keys()]);
        if (!Array.isArray(listed)) throw new Error('Window inventory unavailable');
        const ids = new Set();
        for (const window of listed) {
          if (!window || typeof window.id !== 'string' || !window.id || window.id.length > 80 || ids.has(window.id) || !targets.has(window.path)) continue;
          ids.add(window.id);
          const bounds = !window.minimized && safeRect(window.bounds) ? window.bounds : null;
          const group = windowsByTarget.get(window.path) ?? [];
          if (group.length >= 3) continue;
          group.push({ id: window.id, identity: window.path, bounds, display: containingDisplay(bounds, displays),
            maximized: window.maximized === true, minimized: window.minimized === true });
          windowsByTarget.set(window.path, group);
        }
        if (windowsByTarget.size) windowsStatus = 'available';
      } catch { windowsStatus = 'unavailable'; }
    }
    const busy = Boolean(workspaces.running);
    const plans = entries.map((entry) => this.plan(entry, displays, windowsByTarget, { windowsStatus, busy }));
    return { status: status === 'available' && !entries.length ? 'empty' : status, windowsStatus, displays, targets, windowsByTarget, plans };
  }

  plan(entry, displays, windowsByTarget, { windowsStatus, busy }) {
    const applications = allowedList(entry.apps).map((app) => {
      const matches = windowsByTarget.get(app.identity) ?? [];
      const monitor = app.placement && displays.find((item) => app.placement.display === 'primary' ? item.primary : item.id === app.placement.display);
      let proposed;
      try { proposed = monitor && this.workspaces.toScreenRect(windowRect(monitor.workArea, app.placement)); } catch {}
      return { app, matches, monitor: monitor || null, destination: safeRect(proposed) ? proposed : null };
    });
    let state = 'ready';
    if (!entry.apps) state = 'external-layout';
    else if (busy) state = 'busy';
    else if (windowsStatus === 'unavailable') state = 'unavailable-windows';
    else if (applications.some(({ app, destination }) => app.placement && !destination)) state = 'unavailable-monitor';
    else if (applications.some(({ matches }) => matches.length > 1)) state = 'ambiguous-windows';
    else if (applications.some(({ matches }) => matches.length !== 1)) state = 'missing-windows';
    else if (applications.some(({ matches: [window] }) => !window.minimized && !window.bounds)) state = 'unavailable-windows';
    const config = marshal(entry);
    const topology = marshal(displays);
    const external = entry.powerToysShortcut && !busy ? this.workspaces.externalLayout(entry) : null;
    const signature = state === 'ready' ? marshal([config, topology, applications.map(({ matches: [window], destination }) => [
      window.id, window.bounds, window.minimized, window.maximized, destination,
    ])]) : null;
    return { entry, state, applications, config, topology, signature, external,
      externalSignature: external ? marshal([config, topology, external]) : null };
  }

  launchPlan(state, plan, app) {
    if (this.workspaces.running || this.workspaces.startingApp(app.identity) || state.windowsStatus === 'unavailable'
        || state.windowsByTarget.get(app.identity)?.length) return null;
    const signature = marshal(['launch', plan.config, app.identity]);
    return { operation: 'launch', entry: plan.entry, app, signature, config: plan.config };
  }

  focusPlan(state, window) {
    const app = state.targets.get(window.identity);
    if (!app || this.workspaces.running || (!window.minimized && !window.bounds)) return null;
    const signature = marshal(['focus', app.target, window.id, window.bounds, window.minimized, window.maximized,
      window.display?.id, window.display?.area]);
    return { operation: 'focus', app, window, signature };
  }

  snapshot(params, owner) {
    const { metadata } = params;
    const state = this.collect();
    const alias = (kind, raw) => this.alias(owner, kind, raw);
    const monitorId = (display) => display ? alias('monitor', display.id) : null;
    const windows = [...state.windowsByTarget.values()].flat().map((window) => {
      const focus = this.focusPlan(state, window);
      return { id: alias('window', [window.identity, window.id]), target: alias('target', window.identity), monitor: monitorId(window.display),
        boundsPx: relativeBounds(window.bounds, window.display), minimized: window.minimized, maximized: window.maximized,
        focusRevision: focus ? alias('revision', focus.signature) : null };
    }).sort((a, b) => a.id.localeCompare(b.id));
    return { version: 1, sampledAt: this.now(), status: state.status, windowsStatus: state.windowsStatus,
      monitors: state.displays.slice(0, SCREEN_LIMIT).map((display) => ({ id: monitorId(display), number: display.number, primary: display.primary,
        rotation: display.rotation, scale: display.scale, workAreaPx: { width: display.area.width, height: display.area.height } })),
      workspaces: state.plans.map((plan) => ({ id: alias('workspace', plan.entry.id), ...(metadata ? { name: label(plan.entry.name) } : {}),
        kind: plan.entry.apps ? 'native' : 'powertoys', state: plan.state, revision: plan.signature ? alias('revision', plan.signature) : null,
        ...(plan.entry.powerToysShortcut ? { externalRevision: plan.externalSignature ? alias('revision', plan.externalSignature) : null } : {}),
        apps: plan.applications.map(({ app, monitor, destination }) => {
          const launch = this.launchPlan(state, plan, app);
          return { target: alias('target', app.identity), monitor: monitorId(monitor), placementPx: relativeBounds(destination, monitor),
            launchRevision: launch ? alias('revision', launch.signature) : null };
        }) })),
      targets: [...state.targets.values()].map((app) => {
        const count = state.windowsByTarget.get(app.identity)?.length ?? 0;
        return { id: alias('target', app.identity), ...(metadata ? { app: label(app.name) } : {}), windows: count,
          state: state.windowsStatus === 'unavailable' ? 'unavailable' : count > 1 ? 'multiple' : count ? 'open' : 'closed' };
      }), ...page(windows, params) };
  }

  resolve(owner, alias, revision, external = false) {
    const plan = this.collect().plans.find(({ entry }) => this.alias(owner, 'workspace', entry.id) === alias);
    const signature = external ? plan?.externalSignature : plan?.signature;
    return signature && this.alias(owner, 'revision', signature) === revision ? plan : null;
  }

  resolveTarget(owner, request) {
    const state = this.collect();
    const alias = (kind, value) => this.alias(owner, kind, value);
    let target;
    if (request.command === 'launch') {
      const plan = state.plans.find(({ entry }) => alias('workspace', entry.id) === request.workspace);
      const selected = plan?.applications.find(({ app }) => alias('target', app.identity) === request.target);
      if (selected) target = this.launchPlan(state, plan, selected.app);
    } else {
      const window = [...state.windowsByTarget.values()].flat().find(({ identity, id }) => alias('window', [identity, id]) === request.window);
      if (window) target = this.focusPlan(state, window);
    }
    return target && alias('revision', target.signature) === request.revision ? target : null;
  }

  targetMatches(plan) {
    try {
      const entries = this.workspaces.entries();
      if (plan.operation === 'launch') return marshal(entries.find(({ id }) => id === plan.entry.id)) === plan.config;
      if (plan.window.display && !physicalDisplays(this.workspaces)
        .some(({ id, area }) => id === plan.window.display.id && marshal(area) === marshal(plan.window.display.area))) return false;
      return entries.some(({ apps }) => apps?.some(({ target }) => target === plan.app.target));
    } catch {
      return false;
    }
  }

  topologyMatches(plan) {
    try {
      const saved = this.workspaces.entries().find(({ id }) => id === plan.entry.id);
      return marshal(saved) === plan.config && marshal(physicalDisplays(this.workspaces)) === plan.topology;
    } catch {
      return false;
    }
  }
}

module.exports = { AgentWorkspaceInventory, workspaceInput, workspaceOutput, workspaceParams, relativeBounds, WORKSPACE_ALIAS, TARGET_ALIAS, WINDOW_ALIAS, REVISION };
