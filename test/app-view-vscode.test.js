'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { AppViews } = require('../src/main/app-views');
const { VscodeView } = require('../src/main/app-view-vscode');
const { EditorBridge } = require('../extensions/lastra-vscode/extension');
const { VERSION, STALE_MS, REQUEST_MS, commandPath, readPacket, makeId, sessionPath } = require('../extensions/lastra-vscode/protocol');
const { reportPath } = require('../extensions/lastra-vscode/workspace-state');
const { tempDir } = require('./helpers/temp-dir');

const remote = '/home/sample/project';
const sampleTask = (label, folder, test = false) => ({ name: label, definition: { type: 'shell', command: 'fixture only' },
  source: 'Workspace', scope: folder, group: test ? { id: 'test' } : undefined });

function fixture(t) {
  const directory = tempDir(t, 'lastra-vscode-test-');
  let now = 60_000;
  const view = new VscodeView(directory, { now: () => now });
  const appViews = new AppViews(path.join(directory, 'views.json'), { providers: { vscode: view } });
  const change = (action) => appViews.change({ type: 'provider', viewId: 'vscode', ...action });
  const uri = (file) => ({ path: file, toString: () => 'vscode-remote://wsl+distro' + file });
  const folder = { uri: uri(remote), name: 'Workspace folder' };
  const document = { uri: uri(remote + '/src/example.js') };
  const files = new Map([
    [remote + '/.git/HEAD', 'ref: refs/heads/review\n'],
    [remote + '/reports/jest.json', JSON.stringify({ success: false, numPassedTests: 3, numFailedTests: 1, numPendingTests: 1,
      numTodoTests: 1, testResults: [{ fullName: 'Private test name', failureMessages: ['Private log'] }] })],
  ]);
  const testTask = sampleTask('Verify', folder, true);
  const tasks = [testTask, sampleTask('Build', folder), sampleTask('Privileged label', folder), sampleTask('Verify', 1)];
  const settings = { enabled: true, allowedTasks: ['Verify', 'Build'], jestReport: 'reports/jest.json' };
  const wanted = [];
  const executions = [];
  const accessed = [];
  const errors = [];
  const vscode = {
    FileType: { File: 1 },
    TaskScope: { Global: 1, Workspace: 2 },
    TaskGroup: { Test: { id: 'test' } },
    Uri: { joinPath: (root, ...parts) => uri(path.posix.join(root.path, ...parts)) },
    env: { remoteName: 'wsl' },
    extensions: { getExtension: () => undefined },
    window: { state: { focused: true }, activeTextEditor: { document } },
    workspace: {
      name: 'Sample editor', isTrusted: true, workspaceFolders: [folder],
      getWorkspaceFolder: (file) => file.path.startsWith(remote + '/') ? folder : undefined,
      asRelativePath: (file) => file.path.slice(remote.length + 1),
      getConfiguration: () => ({ inspect: (name) => ({ globalValue: settings[name], workspaceValue: true }) }),
      fs: {
        async stat(file) {
          const data = files.get(file.path);
          if (data === undefined) throw new Error('Missing file');
          return { type: 1, size: Buffer.byteLength(data), mtime: 59_000 };
        },
        async readFile(file) { accessed.push(file.toString()); return Buffer.from(files.get(file.path)); },
      },
    },
    languages: { getDiagnostics: () => [[uri(remote + '/src/example.js'), [{ severity: 0 }, { severity: 1 }, { severity: 1 }]],
      [uri('/unrelated/other.js'), [{ severity: 0 }]]] },
    debug: { activeDebugSession: { id: 'node-debug', name: 'Fixture debugger' } },
    tasks: {
      taskExecutions: executions,
      fetchTasks: async () => tasks,
      async executeTask(task) {
        wanted.push(task);
        const execution = { task };
        executions.push(execution);
        bridge.updateTask(execution, 'start');
        return execution;
      },
    },
  };
  const bridge = new EditorBridge(vscode, view.directory, { now: () => now, onError: (message) => errors.push(message) });
  t.after(() => bridge.stop());
  return { bridge, view, appViews, vscode, change, files, settings, wanted, executions, accessed, tests: testTask, errors,
    advance: (ms) => { now += ms; }, now: () => now };
}

test('the registered VS Code view waits for user opt-in and reads workspace state from the WSL API', async (t) => {
  const { bridge, view, appViews, settings, accessed, errors } = fixture(t);
  settings.enabled = undefined;
  await bridge.applySettings();
  assert.equal(fs.existsSync(view.directory), false);
  assert.equal(appViews.data('vscode').status, 'setup');

  settings.enabled = true;
  await bridge.applySettings();
  bridge.updateDebug('node-debug', 'paused');
  const [session] = appViews.data('vscode').sessions;
  assert.equal(appViews.snapshot().views.find(({ id }) => id === 'vscode').provider, 'vscode');
  assert.equal(session.name, 'Sample editor');
  assert.equal(session.remote, 'wsl');
  assert.equal(session.file, 'src/example.js');
  assert.equal(session.branch, 'review');
  assert.deepEqual(session.problems, { errors: 1, warnings: 2, information: 0, hints: 0 });
  assert.deepEqual(session.debug, { state: 'paused', name: 'Fixture debugger' });
  assert.deepEqual(session.tests, { passed: 3, failed: 1, skipped: 2, success: false, updatedAt: 59_000 });
  assert.deepEqual(session.tasks.map(({ name, test }) => [name, test]), [['Verify', true], ['Build', false]]);
  assert.ok(accessed.every((file) => file.startsWith('vscode-remote://wsl+distro')));
  assert.doesNotMatch(JSON.stringify(session), /Private|fixture only|\/home\/sample|Privileged label/);
  assert.deepEqual(errors, []);
  settings.enabled = false;
  await bridge.applySettings();
  assert.equal(fs.existsSync(sessionPath(view.directory, session.session)), false);
  assert.equal(appViews.data('vscode').status, 'setup');
});

test('the bridge runs only the selected trusted VS Code task and reports its real process outcome', async (t) => {
  const { bridge, appViews, change, view, wanted, executions, advance, tests } = fixture(t);
  await bridge.applySettings();
  const current = () => appViews.data('vscode').sessions[0];
  const { session, tasks } = current();
  const task = tasks.find((entry) => entry.test).id;
  const run = (target) => change({ action: 'run-task', session, task: target, command: 'renderer text is ignored' });
  await assert.rejects(run('not-a-task'), /Invalid VS Code task/);
  await assert.rejects(run(makeId()), /unavailable/);
  const response = await run(task);
  assert.deepEqual(readPacket(commandPath(view.directory, session)), {
    version: VERSION, session, id: response.request, task, issuedAt: response.issuedAt,
  });
  await assert.rejects(run(task), /pending/);
  await bridge.tick();
  assert.deepEqual(wanted, [tests]);
  assert.deepEqual(current().command, { id: response.request, state: 'accepted' });
  assert.equal(current().tasks.find(({ id }) => id === task).status, 'running');
  await assert.rejects(run(task), /running/);

  const execution = executions.pop();
  advance(1_500);
  bridge.updateTask(execution, 'end', 2);
  assert.deepEqual(current().tasks.find(({ id }) => id === task), { id: task, name: 'Verify', folder: 'Workspace folder',
    status: 'failed', test: true, elapsed: 1500, exitCode: 2 });
});

test('expired requests and snapshots cannot dispatch a task after disconnect or trust changes', async (t) => {
  const { bridge, view, vscode, change, settings, wanted, advance } = fixture(t);
  await bridge.applySettings();
  const { session, tasks } = view.snapshot().sessions[0];
  const task = tasks[0].id;
  const run = () => change({ action: 'run-task', session, task });
  const queued = await run();
  vscode.workspace.isTrusted = false;
  await bridge.tick();
  assert.deepEqual(view.snapshot().sessions[0].command, { id: queued.request, state: 'untrusted' });
  await assert.rejects(run(), /Trust the workspace/);
  assert.deepEqual(wanted, []);

  vscode.workspace.isTrusted = true;
  await bridge.tick();
  await run();
  advance(REQUEST_MS + 1);
  assert.equal(view.snapshot().status, 'offline');
  await assert.rejects(run(), /offline/);
  await bridge.tick();
  assert.deepEqual(wanted, []);

  settings.allowedTasks = ['Build'];
  await bridge.tick();
  advance(STALE_MS + 1);
  assert.equal(view.snapshot().status, 'offline');
  bridge.stop();
  await bridge.applySettings();
  assert.notEqual(view.snapshot().sessions[0].session, session);
  await assert.rejects(run(), /offline/);
});

test('Jest reports use a bounded workspace-relative path, and stale data from another active folder is omitted', async (t) => {
  const { bridge, view, vscode, files, settings, advance } = fixture(t);
  assert.equal(reportPath('../outside.json'), null);
  assert.equal(reportPath('C:/outside.json'), null);
  assert.deepEqual(reportPath('out/report.json'), ['out', 'report.json']);
  await bridge.applySettings();
  assert.equal(view.snapshot().sessions[0].testReportConfigured, true);
  assert.equal(view.snapshot().sessions[0].tests.failed, 1);
  settings.jestReport = 'new/report.json';
  await bridge.tick();
  assert.equal(view.snapshot().sessions[0].tests, null);
  files.set(remote + '/new/report.json', JSON.stringify({ success: true, numPassedTests: 2, numFailedTests: 0, numPendingTests: 0 }));
  advance(5_000);
  await bridge.tick();
  assert.equal(view.snapshot().sessions[0].tests.passed, 2);

  const secondUri = { path: '/home/sample/secondary', toString: () => 'vscode-remote://wsl+distro/home/sample/secondary' };
  const secondFolder = { uri: secondUri, name: 'Secondary folder' };
  const secondFile = vscode.Uri.joinPath(secondUri, 'src/second.js');
  const originalResolver = vscode.workspace.getWorkspaceFolder;
  vscode.workspace.getWorkspaceFolder = (uri) => uri.path === secondFile.path ? secondFolder : originalResolver(uri);
  vscode.workspace.asRelativePath = () => 'src/second.js';
  vscode.window.activeTextEditor = { document: { uri: secondFile } };
  await bridge.tick();
  let [context] = view.snapshot().sessions;
  assert.equal(context.file, 'src/second.js');
  assert.equal(context.branch, null);
  assert.equal(context.tests, null);
  files.set(secondUri.path + '/.git/HEAD', 'ref: refs/heads/secondary');
  advance(5_000);
  await bridge.tick();
  [context] = view.snapshot().sessions;
  assert.equal(context.branch, 'secondary');
});
