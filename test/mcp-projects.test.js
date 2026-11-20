'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter, once } = require('node:events');
const { test } = require('node:test');
const { AgentProjects, projectParams } = require('../src/main/mcp-projects');
const { ProjectPalette } = require('../src/main/app-view-projects');
const { TerminalView } = require('../src/main/app-view-terminal');
const { AgentAccess } = require('../src/main/mcp-access');
const { AgentService } = require('../src/main/mcp-service');
const { ActionHistory } = require('../src/main/action-history');
const { connectAgent } = require('../src/main/mcp-client');
const { tempDir } = require('./helpers/temp-dir');

const WORK = 'C:\\Fixture Private\\Desktop';
const OTHER = 'D:\\Other Private\\Studio';
const COMMAND = { id: 'private-server', name: 'Development server C:\\Fixture Private\\Desktop', directory: WORK,
  program: 'C:\\Fixture Private\\node.exe', args: ['do-not-disclose-script.js', '--private-option'], kind: 'server' };
const PROJECTS = [
  { id: 'private-desktop', name: 'The Desktop https://internal.example.test/location', directory: WORK,
    repository: 'https://internal.example.test/repo', issues: 'https://internal.example.test/issues', documentation: 'docs/README.md' },
  { id: 'private-studio', name: 'Local Studio', directory: OTHER, documentation: 'https://internal.example.test/studio-guide' },
];

function fixture(t, options = {}) {
  const root = tempDir(t, 'lastra-mcp-projects-');
  const projectsFile = path.join(root, 'projects.json');
  const terminalFile = path.join(root, 'terminal.json');
  const logs = path.join(root, 'terminal-logs');
  const savedProject = JSON.stringify({ version: 1, projects: PROJECTS });
  const savedTerminal = JSON.stringify({ version: 1, profiles: [], commands: [COMMAND] });
  fs.writeFileSync(projectsFile, savedProject);
  fs.writeFileSync(terminalFile, savedTerminal);
  let spawned;
  const failure = () => assert.fail('A read-only project query attempted a desktop effect.');
  const palette = new ProjectPalette(projectsFile, { platform: 'win32', run: failure, currentProject: failure,
    openConfig: failure, openExternal: failure, openDocument: failure });
  const terminal = new TerminalView(terminalFile, { platform: 'win32', now: () => 50000, monotonic: () => 1300,
    openLog: failure, openConfig: failure, run: failure, spawnChild: () => {
      spawned = new EventEmitter();
      spawned.kill = () => { spawned.emit('exit', null); return true; };
      return spawned;
    },
  });
  t.after(() => terminal.close());
  const reader = new AgentProjects({ readProjects: () => palette.projects(), readCommands: () => terminal.configuredCommands(),
    now: () => 50_001, aliasKey: Buffer.alloc(32, 8), ...options });
  const read = (params = {}, owner = 'agent-a', activity = 'work') => reader.read(owner, activity, projectParams(params));
  return { root, projectsFile, terminalFile, savedProject, savedTerminal, logs, terminal, reader, read, child: () => spawned };
}

test('project and command inventory joins exact configured paths with private aliases and no destinations or output', async (t) => {
  const { read, terminal, child } = fixture(t);
  const initial = read();
  assert.equal(initial.sampledAt, 50001);
  assert.equal(initial.projectsStatus, 'available');
  assert.equal(initial.commandsStatus, 'available');
  const [desk, studio, server] = initial.items;
  assert.match(desk.id, /^project-[a-f0-9]{24}$/);
  assert.deepEqual(desk.destinations, ['repository', 'issues', 'terminal', 'documentation']);
  assert.deepEqual(studio.destinations, ['terminal', 'documentation']);
  assert.deepEqual(initial.items.map(({ commandCount }) => commandCount), [1, 0, undefined]);
  assert.equal(server.project, desk.id);
  assert.match(server.id, /^command-[a-f0-9]{24}$/);
  assert.equal(server.commandKind, 'server');
  assert.equal(server.active, null);
  assert.equal(server.last, null);
  assert.doesNotMatch(JSON.stringify(initial), /private-|Fixture Private|Studio|internal\.example|directory|README\.md|node\.exe|private-option|do-not-disclose/);
  await terminal.change({ action: 'run-command', id: COMMAND.id });
  const during = read({ section: 'commands', project: desk.id }).items[0];
  assert.deepEqual(during.active, { state: 'running', elapsedMs: 0, hasLog: false });
  assert.equal(during.last, null);
  assert.notEqual(terminal.snapshot().commands[0].active.id, during.id);
  child().emit('exit', 7);
  const summary = read({ section: 'commands', project: desk.id }).items[0];
  assert.equal(summary.active, null);
  assert.deepEqual(summary.last, { outcome: 'exited', exitCode: 7, durationMs: 0, hasLog: false });
  const labels = read({ metadata: true }).items.map(({ name }) => name);
  assert.deepEqual(labels, ['The Desktop [link]', 'Local Studio', 'Development server [local path]']);
  assert.doesNotMatch(JSON.stringify(labels), /Fixture Private|internal\.example/);
});

test('inventory limits, cursors and aliases are bound to the owner, activity and query', (t) => {
  const { read, terminalFile, projectsFile } = fixture(t);
  const response = read({ limit: 1 });
  const cursor = response.nextCursor;
  const alias = response.items[0].id;
  assert.ok(cursor);
  assert.notEqual(read({ limit: 1, cursor }).items[0].id, alias);
  assert.throws(() => read({ limit: 1, cursor }, 'agent-b'), /cursor is unavailable/);
  assert.throws(() => read({ limit: 1, cursor, section: 'projects' }), /cursor is unavailable/);
  assert.throws(() => read({ project: alias }, 'agent-a', 'personal'), /alias is unavailable/);
  assert.throws(() => read({ project: 'private-desktop' }), /valid project alias/);
  assert.throws(() => read({ start: COMMAND.id }), /supported project inventory/);
  assert.throws(() => read({ limit: 25 }), /page limit/);
  fs.writeFileSync(terminalFile, '{broken');
  assert.equal(read().commandsStatus, 'invalid');
  assert.equal(read().items.length, 2);
  fs.writeFileSync(projectsFile, '{broken');
  assert.equal(read().projectsStatus, 'invalid');
  assert.deepEqual(read().items, []);
  fs.unlinkSync(projectsFile);
  assert.equal(read().projectsStatus, 'empty');
});

test('a passive inventory leaves local files and unregistered running processes untouched', async (t) => {
  const { read, terminal, child, terminalFile, logs, projectsFile, savedProject } = fixture(t);
  fs.mkdirSync(logs);
  const orphan = path.join(logs, `run-${'a'.repeat(32)}.txt`);
  fs.writeFileSync(orphan, 'private orphaned capture');
  read();
  assert.equal(fs.readFileSync(orphan, 'utf8'), 'private orphaned capture');
  assert.equal(fs.readFileSync(projectsFile, 'utf8'), savedProject);
  await terminal.change({ action: 'run-command', id: COMMAND.id });
  fs.writeFileSync(terminalFile, JSON.stringify({ version: 1, projects: [], profiles: [], commands: [] }));
  assert.equal(read().commandsStatus, 'empty');
  assert.equal(read().items.some(({ kind }) => kind === 'command'), false);
  assert.equal(terminal.snapshot().commands[0].active.state, 'running');
  assert.equal(fs.existsSync(orphan), false, 'the ordinary deck snapshot can still clean prior logs');
  child().emit('exit', 0);
});

test('project inventory requires its own activity-bound scope and emits no private identifiers to MCP history', async (t) => {
  const { root, reader, projectsFile, terminalFile, savedProject, savedTerminal } = fixture(t);
  const protect = process.platform === 'win32' ? undefined : () => ({ protect: (bytes) => Buffer.from(bytes), unprotect: (bytes) => Buffer.from(bytes) });
  const access = new AgentAccess(path.join(root, 'grants.json'), { protect });
  access.setEnabled(true);
  const first = access.grant(['projects'], 'work');
  const second = access.grant(['projects'], 'work');
  const limited = access.grant(['layout'], 'work');
  const address = process.platform === 'win32' ? undefined : () => path.join(root, 'fixture.sock');
  let activity = 'work';
  const history = new ActionHistory();
  const service = new AgentService(access, { history, address, profile: () => activity,
    readers: { project_inventory: (params, client) => reader.read(client.id, activity, params) } });
  t.after(() => service.stop());
  service.setLocked(false);
  await once(service.server, 'listening');
  const links = await Promise.all([first, second, limited].map((grant) => connectAgent(grant, { address, protect })));
  t.after(() => links.forEach((link) => link.close()));
  const [owner, peer, observer] = links;
  assert.equal((await observer.call('project_inventory')).ok, false);
  const { data } = await owner.call('project_inventory', { limit: 1 });
  assert.equal(data.items.length, 1);
  assert.equal((await peer.call('project_inventory', { project: data.items[0].id })).ok, false);
  assert.equal((await owner.call('project_inventory', { project: data.items[0].id })).ok, true);
  activity = 'different';
  assert.equal((await owner.call('project_inventory')).ok, false);
  assert.doesNotMatch(JSON.stringify(history.snapshot()), /Fixture Private|private-desktop|private-server|internal\.example/);
  assert.equal(fs.readFileSync(projectsFile, 'utf8'), savedProject);
  assert.equal(fs.readFileSync(terminalFile, 'utf8'), savedTerminal);
});

test('a project grant filters both inventory and command resolution and disconnects on a changed project', async (t) => {
  const { root, reader, projectsFile, terminalFile } = fixture(t);
  const secondCommand = { ...COMMAND, id: 'studio-test', name: 'Studio test', directory: OTHER };
  fs.writeFileSync(terminalFile, JSON.stringify({ version: 1, profiles: [], commands: [COMMAND, secondCommand] }));
  const [selected, other] = reader.grantTargets();
  const protect = process.platform === 'win32' ? undefined : () => ({ protect: (bytes) => Buffer.from(bytes), unprotect: (bytes) => Buffer.from(bytes) });
  const access = new AgentAccess(path.join(root, 'grants.json'), { protect });
  const address = process.platform === 'win32' ? undefined : () => path.join(root, 'fixture.sock');
  access.setEnabled(true);
  assert.throws(() => access.grant(['layout'], 'work', { project: selected.binding }), /registered project/);
  const credential = access.grant(['projects', 'project-actions'], 'work', { project: selected.binding });
  const unrestricted = access.grant(['projects'], 'work');
  const reloaded = new AgentAccess(access.file, { protect });
  assert.deepEqual(reloaded.activeClients()[0].project, selected.binding);
  const service = new AgentService(reloaded, { history: new ActionHistory(), address, profile: () => 'work',
    projectAllowed: (binding) => reader.grantCurrent(binding),
    readers: { project_inventory: (params, client) => reader.read(client.id, 'work', params, client.scopes.includes('project-actions'), client.project) } });
  t.after(() => service.stop());
  service.setLocked(false);
  await once(service.server, 'listening');
  const [narrow, broad] = await Promise.all([credential, unrestricted].map((grant) => connectAgent(grant, { address, protect })));
  t.after(() => { narrow.close(); broad.close(); });
  const { data } = await narrow.call('project_inventory');
  assert.equal(data.items.length, 2);
  assert.equal(data.items[0].commandCount, 1);
  assert.equal(data.items[1].project, data.items[0].id);
  assert.equal((await narrow.call('connection')).data.projectRestricted, true);
  assert.doesNotMatch(JSON.stringify(data), /private-desktop|Fixture Private|studio-test/);
  const { id } = reloaded.activeClients()[0];
  const all = reader.read(id, 'work', projectParams({}), true);
  const otherAlias = reader.alias(id, 'work', 'project', other.binding.id);
  const wrong = all.items.find(({ project }) => project === otherAlias);
  assert.ok(wrong?.revision);
  assert.equal((await narrow.call('project_inventory', { project: otherAlias })).ok, false);
  assert.equal(reader.resolveCommand(id, 'work', wrong.id, wrong.revision, selected.binding), null);
  assert.equal(reader.resolveCommand(id, 'work', data.items[1].id, data.items[1].revision, selected.binding).id, COMMAND.id);
  const changed = structuredClone(PROJECTS);
  changed[0].directory = 'C:\\Replacement project';
  fs.writeFileSync(projectsFile, JSON.stringify({ version: 1, projects: changed }));
  service.reconcile();
  await assert.rejects(narrow.call('connection'), /unavailable/);
  assert.equal((await broad.call('project_inventory')).ok, true);
});
