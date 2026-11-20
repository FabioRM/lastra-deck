// @ts-check
'use strict';

const { createHash, createHmac, randomBytes } = require('node:crypto');
const { projectDirectoryKey } = require('../../extensions/lastra-vscode/project-location');
const { SnapshotRequestError } = require('./mcp-snapshot');

const ENTRY_ID = /^[a-z0-9_-]{1,48}$/;
const PROJECT_ID = /^project-[a-f0-9]{24}$/;
const COMMAND_ID = /^command-[a-f0-9]{24}$/;
const COMMAND_REVISION = /^command-revision-[a-f0-9]{24}$/;
const CURSOR = /^[a-f0-9]{24}\.\d{1,2}$/;
const SECTIONS = ['all', 'projects', 'commands'];
const STATUS = ['available', 'empty', 'invalid', 'unavailable'];
const ACTIVE = ['running', 'stopping', 'finishing', 'stop-failed'];
const RESULT = ['exited', 'failed', 'stopped', 'timed-out', 'interrupted'];
const DESTINATIONS = ['repository', 'issues', 'terminal', 'documentation'];
const LIMIT = 24;
const PROJECT_LIMIT = 32;
const COMMAND_LIMIT = 24;

const text = { type: 'string' };
const count = { type: 'integer', minimum: 0 };
const flag = { type: 'boolean' };
const enumOf = (values) => ({ enum: values });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const nullable = (data) => ({ anyOf: [data, { type: 'null' }] });
const projectId = { ...text, pattern: PROJECT_ID.source };
const commandId = { ...text, pattern: COMMAND_ID.source };
const cursorSchema = { ...text, pattern: CURSOR.source };
const name = { ...text, minLength: 1, maxLength: 80 };
const projectInput = object({ section: enumOf(SECTIONS), project: projectId, metadata: flag, cursor: cursorSchema,
  limit: { ...count, minimum: 1, maximum: LIMIT } }, []);
const projectItem = object({ kind: { const: 'project' }, id: projectId, name,
  destinations: { type: 'array', maxItems: DESTINATIONS.length, items: enumOf(DESTINATIONS) }, commandCount: count },
['kind', 'id', 'destinations', 'commandCount']);
const activeRun = object({ state: enumOf(ACTIVE), elapsedMs: nullable(count), hasLog: flag });
const lastRun = object({ outcome: enumOf(RESULT), exitCode: nullable({ type: 'integer' }), durationMs: nullable(count), hasLog: flag });
const commandItem = object({ kind: { const: 'command' }, id: commandId, name, project: nullable(projectId),
  commandKind: enumOf(['task', 'server']), active: nullable(activeRun), last: nullable(lastRun),
  revision: { ...text, pattern: COMMAND_REVISION.source } },
['kind', 'id', 'project', 'commandKind', 'active', 'last']);
const projectOutput = object({ version: { const: 1 }, section: enumOf(SECTIONS), sampledAt: count,
  projectsStatus: enumOf(STATUS), commandsStatus: enumOf(STATUS), nextCursor: cursorSchema,
  items: { type: 'array', maxItems: LIMIT, items: { oneOf: [projectItem, commandItem] } },
}, ['version', 'section', 'sampledAt', 'projectsStatus', 'commandsStatus', 'items']);

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const valid = (value, pattern) => typeof value === 'string' && pattern.test(value);
const millis = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
const boundProject = (entries, binding) => entries.find(({ id, revision }) => id === binding.id && revision === binding.revision);

function projectParams(input = {}) {
  if (!record(input) || Object.keys(input).some((key) => !Object.hasOwn(projectInput.properties, key))) {
    throw new Error('Choose supported project inventory options.');
  }
  const { section = 'all', project, metadata = false, limit = 16, cursor } = input;
  if (!SECTIONS.includes(section) || typeof metadata !== 'boolean' || !Number.isSafeInteger(limit) || limit < 1 || limit > LIMIT
      || (project !== undefined && !valid(project, PROJECT_ID)) || (cursor !== undefined && !valid(cursor, CURSOR))) {
    throw new Error('Choose a valid project alias, section and page limit.');
  }
  return { section, project, metadata, limit, cursor };
}

function publicName(value, metadata) {
  if (!metadata || typeof value !== 'string') return {};
  const name = value.replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s]+/gi, '[link]')
    .replace(/(?:\b[A-Za-z]:[\\/]|\\\\|(?:^|\s)(?:~\/|\/))[^\r\n]*/g, ' [local path]')
    .replace(/\s+/g, ' ').trim().slice(0, 80);
  return name ? { name } : {};
}

function collect(entries, maximum) {
  const seen = new Set();
  return entries.slice(0, maximum).filter((item) => {
    if (!valid(item?.id, ENTRY_ID) || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function projects(readProjects) {
  try {
    const supplied = readProjects?.();
    if (!Array.isArray(supplied)) return { entries: [], status: 'unavailable' };
    const entries = collect(supplied, PROJECT_LIMIT);
    return { entries, status: entries.length ? 'available' : 'empty' };
  } catch { return { entries: [], status: 'invalid' }; }
}

function commands(readCommands) {
  try {
    const supplied = readCommands?.();
    if (supplied?.status === 'invalid') return { entries: [], status: 'invalid' };
    if (supplied?.status !== 'ready' || !Array.isArray(supplied.commands)) return { entries: [], status: 'unavailable' };
    const entries = collect(supplied.commands, COMMAND_LIMIT);
    return { entries, status: entries.length ? 'available' : 'empty' };
  } catch { return { entries: [], status: 'unavailable' }; }
}

function runView({ active, last }) {
  return {
    active: ACTIVE.includes(active?.state) ? { state: active.state, elapsedMs: millis(active.durationMs), hasLog: active.log === true } : null,
    last: RESULT.includes(last?.status) ? { outcome: last.status, durationMs: millis(last.durationMs),
      exitCode: Number.isSafeInteger(last.exitCode) ? last.exitCode : null, hasLog: typeof last.logRun === 'string' } : null,
  };
}

function page(items, { section, project, metadata, limit, cursor }) {
  const prefix = createHash('sha256').update(JSON.stringify([section, project, metadata, limit, items.map(({ id, name }) => [id, name])]))
    .digest('hex').slice(0, 24) + '.';
  const offset = cursor === undefined ? 0 : cursor.startsWith(prefix) ? Number(cursor.slice(prefix.length)) : -1;
  if (offset < 0 || offset > items.length || offset % limit) throw new SnapshotRequestError('The project cursor is unavailable for this inventory.');
  return { items: items.slice(offset, offset + limit), ...(offset + limit < items.length ? { nextCursor: prefix + (offset + limit) } : {}) };
}

class AgentProjects {
  /** @param {{ readProjects?: () => any, readCommands?: () => any, now?: () => number, aliasKey?: Buffer }} [options] */
  constructor({ readProjects, readCommands, now = Date.now, aliasKey = randomBytes(32) } = {}) {
    this.readProjects = readProjects;
    this.readCommands = readCommands;
    this.now = now;
    this.aliasKey = aliasKey;
  }

  alias(owner, activity, kind, id) {
    return `${kind}-${createHmac('sha256', this.aliasKey).update(JSON.stringify([owner, activity, kind, id])).digest('hex').slice(0, 24)}`;
  }

  revision(owner, activity, command) {
    return command.reviewRevision && this.alias(owner, activity, 'command-revision', [command.id, command.reviewRevision]);
  }

  grantTargets() {
    return projects(this.readProjects).entries.map(({ id, name, revision }) => ({ name: publicName(name, true).name ?? id,
      binding: { id, revision } }));
  }

  grantCurrent(binding) { return Boolean(boundProject(projects(this.readProjects).entries, binding)); }

  resolveCommand(owner, activity, alias, revision, binding) {
    const { entries } = commands(this.readCommands);
    const current = entries.find((entry) => this.alias(owner, activity, 'command', entry.id) === alias);
    if (!current || this.revision(owner, activity, current) !== revision) return null;
    if (binding) {
      const project = boundProject(projects(this.readProjects).entries, binding);
      if (!project || projectDirectoryKey(current.directory) !== project.key) return null;
    }
    return current;
  }

  read(owner, activity, parameters, reviewAccess = false, binding) {
    const { project, section, metadata } = parameters;
    const toAlias = (kind, id) => this.alias(owner, activity, kind, id);
    const configured = projects(this.readProjects);
    const targets = commands(this.readCommands);
    if (binding) {
      const selected = boundProject(configured.entries, binding);
      if (!selected) throw new SnapshotRequestError('The granted project changed.');
      configured.entries = [selected];
      targets.entries = targets.entries.filter(({ directory }) => projectDirectoryKey(directory) === selected.key);
      if (!targets.entries.length && targets.status === 'available') targets.status = 'empty';
    }
    const projectIds = new Map(configured.entries.map(({ id, key }) => [key, toAlias('project', id)]));
    if (project && ![...projectIds.values()].includes(project)) throw new SnapshotRequestError('The project alias is unavailable.');
    const commandCounts = new Map();
    const commandItems = targets.entries.map((entry) => {
      const bound = projectIds.get(projectDirectoryKey(entry.directory)) ?? null;
      if (bound) commandCounts.set(bound, (commandCounts.get(bound) ?? 0) + 1);
      const revision = reviewAccess && this.revision(owner, activity, entry);
      return { kind: 'command', id: toAlias('command', entry.id), project: bound,
        commandKind: entry.kind === 'server' ? 'server' : 'task', ...publicName(entry.name, metadata), ...runView(entry),
        ...(revision ? { revision } : {}) };
    });
    const items = [];
    if (section !== 'commands') for (const entry of configured.entries) {
      const id = toAlias('project', entry.id);
      if (project && project !== id) continue;
      const destinations = [entry.repository && 'repository', entry.issues && 'issues', 'terminal', (entry.docsLink || entry.docsFile) && 'documentation'].filter(Boolean);
      items.push({ kind: 'project', id, ...publicName(entry.name, metadata), destinations, commandCount: commandCounts.get(id) ?? 0 });
    }
    if (section !== 'projects') items.push(...commandItems.filter((item) => !project || item.project === project));
    return { version: 1, section, sampledAt: this.now(), projectsStatus: configured.status, commandsStatus: targets.status, ...page(items, parameters) };
  }
}

module.exports = { AgentProjects, COMMAND_ID, COMMAND_REVISION, projectInput, projectOutput, projectParams };
