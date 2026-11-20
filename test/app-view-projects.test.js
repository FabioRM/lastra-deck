'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { AppViews } = require('../src/main/app-views');
const { ProjectPalette, normalizeProjects } = require('../src/main/app-view-projects');
const { VscodeView } = require('../src/main/app-view-vscode');
const { EditorBridge } = require('../extensions/lastra-vscode/extension');
const { currentProjectKey, projectDirectoryKey } = require('../extensions/lastra-vscode/project-location');
const { VERSION, STALE_MS, makeId, publishSession, readPacket, sessionPath } = require('../extensions/lastra-vscode/protocol');
const { tempDir } = require('./helpers/temp-dir');

const projects = [
  { id: 'studio', name: 'Studio', directory: 'C:\\Studio Work\\Project', repository: 'https://code.example.org/org/studio',
    issues: 'https://code.example.org/org/studio/issues', documentation: 'docs/README.md' },
  { id: 'tools', name: 'Tools', directory: 'D:\\Utilities', documentation: 'https://docs.example.org/tools' },
];

function directory(t) {
  const location = tempDir(t, 'lastra-projects-');
  return location;
}

function setup(t, dependencies = {}) {
  const location = directory(t);
  const file = path.join(location, 'projects.json');
  const actions = [];
  let workspace = { session: makeId(), key: projectDirectoryKey(projects[0].directory) };
  const write = (configured) => fs.writeFileSync(file, JSON.stringify({ version: 1, projects: configured }));
  write(projects);
  const view = new ProjectPalette(file, { platform: 'win32', currentProject: () => workspace,
    openConfig: (file) => actions.push({ config: file }), openExternal: async (url) => { actions.push({ url }); },
    openDocument: async (file) => { actions.push({ document: file }); return ''; },
    run: async (action) => { actions.push(action); return { ok: true }; },
    files: { realpath: async (file) => file, stat: async () => ({ isDirectory: () => true, isFile: () => true }) },
    ...dependencies });
  const appViews = new AppViews(path.join(location, 'app-views.json'), { providers: { projects: view } });
  const read = () => appViews.data('projects');
  const change = (parameters) => appViews.change({ type: 'provider', viewId: 'projects', ...parameters });
  const data = (id, action, current = read()) => {
    const { revision } = current.projects.find((project) => project.id === id);
    return { id, revision, action };
  };
  return { read, change, actions, data, write, appViews, setWorkspace: (next) => { workspace = next; } };
}

test('the project palette uses configured links and exact local workspace, with explicit manual selection', async (t) => {
  const { read, change, actions, data, setWorkspace, appViews } = setup(t);
  const initial = read();
  assert.equal(initial.status, 'ready');
  assert.equal(initial.workspace.id, 'studio');
  assert.equal(appViews.snapshot().views.find(({ id }) => id === 'projects').provider, 'projects');
  assert.doesNotMatch(JSON.stringify(initial), /Studio Work|example\.org|README\.md|projectKey|Utilities/);
  assert.deepEqual(initial.projects[0].actions, ['repository', 'issues', 'terminal', 'documentation']);
  assert.deepEqual(actions, []);
  for (const action of initial.projects[0].actions) {
    assert.equal((await change({ ...data('studio', action, initial), workspace: initial.workspace.token, target: 'ignored' })).ok, true);
  }
  assert.deepEqual(actions, [
    { url: projects[0].repository }, { url: projects[0].issues },
    { type: 'launch', target: 'wt.exe', args: ['new-tab', '--startingDirectory', projects[0].directory] },
    { document: path.win32.join(projects[0].directory, 'docs', 'README.md') },
  ]);
  setWorkspace({ session: makeId(), key: projectDirectoryKey(projects[1].directory) });
  await assert.rejects(change({ ...data('studio', 'repository', initial), workspace: initial.workspace.token }), /VS Code folder changed/);
  assert.equal(read().workspace.id, 'tools');
  setWorkspace(null);
  assert.equal(read().workspace, null);
  await assert.rejects(change(data('tools', 'issues')), /not configured/);
  assert.equal((await change(data('tools', 'documentation'))).ok, true);
  assert.equal(actions.at(-1).url, projects[1].documentation);
});

test('configuration edits and guard transitions prevent stale clicks during path resolution', async (t) => {
  let release;
  let blockCheck;
  let revision = 0;
  const { read, change, actions, data, write: update, setWorkspace } = setup(t, {
    currentGuard() {
      const started = revision;
      return () => (started !== revision || revision % 2 ? 'Deck unavailable' : undefined);
    },
    files: { realpath: (file) => blockCheck ? Promise.resolve(file) : new Promise((resolve) => { release = () => resolve(file); }),
      stat: async () => ({ isDirectory: () => true }) },
  });
  const first = read();
  const stale = data('studio', 'terminal', first);
  const pending = change({ ...stale, workspace: first.workspace.token });
  setWorkspace(null);
  release();
  await assert.rejects(pending, /VS Code folder changed/);
  const locked = change(stale);
  revision++;
  release();
  await assert.rejects(locked, /Deck unavailable/);
  await assert.rejects(change({ action: 'configure' }), /Deck unavailable/);
  revision++;
  const changed = change(stale);
  update([{ ...projects[0], directory: 'C:\\Other' }]);
  blockCheck = true;
  release();
  await assert.rejects(changed, /configuration changed/);
  assert.deepEqual(actions, []);
});

test('project configuration rejects ambiguous directories, URI credentials and traversal', (t) => {
  const { read, write: update } = setup(t);
  const check = (input, problem) => assert.throws(() => normalizeProjects({ version: 1, projects: input }), problem);
  check([...projects, { ...projects[0], id: 'other', directory: 'c:/studio work/project/' }], /unique absolute/);
  for (const directory of ['\\\\host\\Share', 'C:\\folder:alternate', 'C:\\folder;launch', 'C:\\%TEMP%', 'relative/path']) {
    check([{ ...projects[0], directory }], /absolute local/);
  }
  for (const issues of ['http://insecure.example.org/', 'https://private:secret@code.example.org/', 'file:///C:/test']) {
    check([{ ...projects[0], issues }], /HTTPS without credentials/);
  }
  for (const documentation of ['../outside.md', 'docs/../outside.md', '/root.md', 'tool.exe', 'C:\\hidden.md', 'docs/. /escape.md']) {
    check([{ ...projects[0], documentation }], /path relative/);
  }
  update([{ ...projects[0], directory: 'invalid' }]);
  assert.equal(read().status, 'invalid');
  assert.deepEqual(read().projects, []);
});

test('the project document uses its real path and skips a junction to an external directory', { skip: process.platform !== 'win32' }, async (t) => {
  const parent = directory(t);
  const root = path.join(parent, 'Actual Folder');
  const outside = path.join(parent, 'Other Folder');
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(root, 'README.md'), 'Synthetic documentation\n');
  fs.writeFileSync(path.join(outside, 'README.md'), 'Synthetic out-of-root documentation\n');
  fs.symlinkSync(outside, path.join(root, 'linked'), 'junction');
  const { change, data, actions, write: update } = setup(t, { files: fs.promises });
  update([{ id: 'manual', name: 'Manual', directory: root, documentation: 'README.md' }]);
  await change(data('manual', 'documentation'));
  assert.deepEqual(actions, [{ document: fs.realpathSync(path.join(root, 'README.md')) }]);
  update([{ id: 'manual', name: 'Manual', directory: root, documentation: 'linked/README.md' }]);
  await assert.rejects(change(data('manual', 'documentation')), /document is unavailable/);
  assert.equal(actions.length, 1);
});

test('VS Code bridge shares only opaque trusted local folder context and omits it from public sessions', (t) => {
  let now = 40_000;
  const view = new VscodeView(directory(t), { now: () => now });
  fs.mkdirSync(view.directory);
  const a = { name: 'Study', uri: { scheme: 'file', fsPath: projects[0].directory, toString: () => 'file:///C:/fixture-a' } };
  const b = { name: 'Tools', uri: { scheme: 'file', fsPath: projects[1].directory, toString: () => 'file:///D:/fixture-b' } };
  const uri = { scheme: 'file', toString: () => 'file:///D:/fixture-b/main.js' };
  const vscode = { env: {}, window: { state: { focused: true }, activeTextEditor: { document: { uri } } },
    workspace: { name: 'Fixture', isTrusted: true, workspaceFolders: [a, b], getWorkspaceFolder: () => b,
      asRelativePath: () => 'main.js', getConfiguration: () => ({ inspect: (name) => ({ globalValue: name === 'enabled' }) }) },
    debug: {}, languages: { getDiagnostics: () => [] }, tasks: { taskExecutions: [] } };
  const bridge = new EditorBridge(vscode, view.directory, { now: () => now });
  const session = { id: makeId(), tasks: new Map() };
  bridge.session = session;
  t.after(() => bridge.stop());
  bridge.publish(session);
  const file = sessionPath(view.directory, session.id);
  assert.equal(readPacket(file).projectKey, projectDirectoryKey(projects[1].directory));
  assert.doesNotMatch(JSON.stringify(readPacket(file)), /Utilities|fixture-b/);
  assert.deepEqual(view.currentProject(), { session: session.id, key: projectDirectoryKey(projects[1].directory) });
  assert.equal(Object.hasOwn(view.snapshot().sessions[0], 'projectKey'), false);
  const peer = makeId();
  publishSession(sessionPath(view.directory, peer), { version: VERSION, updatedAt: now, session: peer,
    name: 'Other window', trusted: true, focused: true, tasks: [], projectKey: projectDirectoryKey(projects[0].directory) });
  assert.equal(view.currentProject(), null);
  fs.unlinkSync(sessionPath(view.directory, peer));
  vscode.window.state.focused = false;
  bridge.publish(session);
  assert.equal(view.currentProject(), null);
  vscode.window.state.focused = true;
  bridge.publish(session);
  now += STALE_MS + 1;
  assert.equal(view.currentProject(), null);
  vscode.workspace.isTrusted = false;
  assert.equal(currentProjectKey(vscode), null);
  vscode.workspace.isTrusted = true;
  vscode.env.remoteName = 'wsl';
  assert.equal(currentProjectKey(vscode), null);
  vscode.env.remoteName = undefined;
  vscode.window.activeTextEditor = null;
  assert.equal(currentProjectKey(vscode), null);
  vscode.workspace.workspaceFolders = [a];
  assert.equal(currentProjectKey(vscode), projectDirectoryKey(projects[0].directory));
});
