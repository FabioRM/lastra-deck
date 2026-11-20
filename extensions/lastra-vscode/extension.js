'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { VERSION, DIRECTORY, HEARTBEAT_MS, MAX_TASKS, makeId, sessionPath, commandPath,
  publishSession, takeCommand, removePacket, shortText, validRequest } = require('./protocol');
const { activeFolder, editorFile, problems, currentBranch, reportPath, jestResults, taskId } = require('./workspace-state');
const { currentProjectKey } = require('./project-location');

const REFRESH_MS = 4_000;

class EditorBridge {
  constructor(vscode, directory, { now = Date.now, onError = () => {} } = {}) {
    this.vscode = vscode;
    this.directory = directory;
    this.now = now;
    this.onError = onError;
    this.session = null;
  }

  getSettings() {
    const settings = this.vscode.workspace.getConfiguration('lastra');
    const configured = (name) => settings.inspect(name)?.globalValue;
    const names = configured('allowedTasks');
    return {
      enabled: configured('enabled') === true,
      allowed: new Set(Array.isArray(names) ? names.filter((name) => typeof name === 'string' && name.length <= 120).slice(0, MAX_TASKS) : []),
      report: reportPath(configured('jestReport')),
    };
  }

  applySettings() {
    if (!this.getSettings().enabled) {
      this.stop();
      return;
    }
    if (this.session) return;
    try { fs.mkdirSync(this.directory, { recursive: true }); }
    catch { this.onError('Could not create the local VS Code bridge folder.'); return; }
    this.session = { id: makeId(), tasks: new Map(), results: new Map(), debug: new Map(), refreshAt: -Infinity };
    this.timer = setInterval(() => this.tick(), HEARTBEAT_MS);
    return this.tick();
  }

  stop() {
    const session = this.session;
    if (!session) return;
    this.session = null;
    clearInterval(this.timer);
    for (const file of [sessionPath(this.directory, session.id), commandPath(this.directory, session.id)]) {
      try { removePacket(file); } catch { this.onError('Could not remove VS Code bridge data for this window.'); }
    }
  }

  async findTasks(allowed) {
    const vscode = this.vscode;
    const found = new Map();
    if (!allowed.size || !vscode.workspace.isTrusted) return found;
    const ambiguous = new Set();
    for (const task of await vscode.tasks.fetchTasks()) {
      if (!allowed.has(task.name) || (task.scope !== vscode.TaskScope.Workspace && !task.scope?.uri)) continue;
      const id = taskId(task);
      if (found.has(id)) {
        found.delete(id);
        ambiguous.add(id);
      } else if (!ambiguous.has(id)) found.set(id, task);
    }
    return new Map([...found].slice(0, MAX_TASKS));
  }

  async refresh(session, folder, settings) {
    if (session.refreshing || this.now() < session.refreshAt) return;
    session.refreshing = true;
    session.refreshAt = this.now() + REFRESH_MS;
    const vscode = this.vscode;
    try {
      const [tasks, branch, tests] = await Promise.allSettled([
        this.findTasks(settings.allowed), currentBranch(vscode, folder), jestResults(vscode, folder, settings.report),
      ]);
      session.tasks = tasks.value ?? new Map();
      for (const id of session.results.keys()) if (!session.tasks.has(id)) session.results.delete(id);
      session.sources = { folder: folder?.uri.toString(), report: settings.report?.join('/'), branch: branch.value, tests: tests.value };
      this.publish(session);
    } finally {
      session.refreshing = false;
    }
  }

  updateTask(execution, phase, exitCode) {
    const session = this.session;
    if (!session || !this.getSettings().allowed.has(execution.task.name)) return;
    const id = taskId(execution.task);
    const item = session.results.get(id);
    const now = this.now();
    if (phase === 'start') {
      if (item?.execution !== execution) session.results.set(id, { execution, started: now });
    } else if (!item || item.execution === execution) {
      const result = item ?? { execution };
      result.finished ??= now;
      if (Number.isInteger(exitCode)) result.exitCode = exitCode;
      session.results.set(id, result);
    }
    this.publish(session);
  }

  updateDebug(sessionId, state) {
    const session = this.session;
    if (!session) return;
    if (state) session.debug.set(sessionId, state);
    else session.debug.delete(sessionId);
    this.publish(session);
  }

  taskResults(session, settings) {
    const vscode = this.vscode;
    if (!vscode.workspace.isTrusted) return [];
    const active = new Set(vscode.tasks.taskExecutions.map(({ task }) => taskId(task)));
    return [...session.tasks].filter(([, task]) => settings.allowed.has(task.name)).map(([id, task]) => {
      const item = session.results.get(id);
      const running = item ? item.finished === undefined : active.has(id);
      let status = 'idle';
      if (running) status = 'running';
      else if (item) status = item.exitCode === undefined ? 'finished' : item.exitCode === 0 ? 'passed' : 'failed';
      return { id, name: shortText(task.name), folder: shortText(task.scope?.name), test: task.group?.id === vscode.TaskGroup.Test.id,
        status, elapsed: item?.started === undefined ? null : Math.max(0, (item.finished ?? this.now()) - item.started), exitCode: item?.exitCode };
    });
  }

  publish(session) {
    if (this.session !== session) return;
    const vscode = this.vscode;
    const settings = this.getSettings();
    if (!settings.enabled) return;
    const folder = activeFolder(vscode);
    const debug = vscode.debug.activeDebugSession;
    const sources = session.sources?.folder === folder?.uri.toString() ? session.sources : null;
    try {
      publishSession(sessionPath(this.directory, session.id), {
        version: VERSION, session: session.id, updatedAt: this.now(), name: shortText(vscode.workspace.name ?? folder?.name),
        remote: shortText(vscode.env.remoteName), focused: vscode.window.state.focused, trusted: vscode.workspace.isTrusted,
        projectKey: currentProjectKey(vscode),
        file: editorFile(vscode), branch: sources?.branch, problems: problems(vscode),
        debug: { state: debug ? session.debug.get(debug.id) ?? 'active' : 'inactive', name: shortText(debug?.name) },
        tasks: this.taskResults(session, settings), command: session.command,
        tests: sources?.report === settings.report?.join('/') ? sources?.tests : null, testReportConfigured: Boolean(settings.report),
      });
      this.publishFailure = false;
    } catch {
      if (!this.publishFailure) this.onError('Could not publish the current VS Code workspace state.');
      this.publishFailure = true;
    }
  }

  async runTask(session, request) {
    const vscode = this.vscode;
    if (!vscode.workspace.isTrusted) return 'untrusted';
    const settings = this.getSettings();
    const tasks = await this.findTasks(settings.allowed);
    const task = tasks.get(request.task);
    if (this.session !== session || !task || !this.getSettings().allowed.has(task.name)) return 'missing-task';
    if (!validRequest(request, session.id, this.now())) return 'failed';
    if (!vscode.workspace.isTrusted) return 'untrusted';
    if (vscode.tasks.taskExecutions.some(({ task }) => taskId(task) === request.task)) return 'busy';
    const execution = await vscode.tasks.executeTask(task);
    if (this.session === session && !session.results.has(request.task) && vscode.tasks.taskExecutions.includes(execution)) {
      this.updateTask(execution, 'start');
    }
    return 'accepted';
  }

  async receiveCommand(session) {
    if (session.handling) return;
    let request;
    try { request = takeCommand(commandPath(this.directory, session.id)); }
    catch { return; }
    if (!validRequest(request, session.id, this.now()) || request.id === session.command?.id) return;
    session.handling = true;
    let state;
    try { state = await this.runTask(session, request); } catch { state = 'failed'; }
    session.command = { id: request.id, state };
    session.handling = false;
    this.publish(session);
  }

  tick() {
    const session = this.session;
    if (!session) return;
    this.publish(session);
    return Promise.all([this.refresh(session, activeFolder(this.vscode), this.getSettings()), this.receiveCommand(session)]);
  }
}

function activate(context) {
  const vscode = require('vscode');
  if (process.platform !== 'win32' || !process.env.APPDATA) return;
  const directory = path.join(process.env.APPDATA, 'Lastra', DIRECTORY);
  const bridge = new EditorBridge(vscode, directory, { onError: (message) => console.warn('[Lastra]', message) });
  const register = (resource) => context.subscriptions.push(resource);
  register({ dispose: () => bridge.stop() });
  register(vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('lastra')) bridge.applySettings();
  }));
  register(vscode.tasks.onDidStartTask(({ execution }) => bridge.updateTask(execution, 'start')));
  register(vscode.tasks.onDidEndTaskProcess(({ execution, exitCode }) => bridge.updateTask(execution, 'end', exitCode)));
  register(vscode.tasks.onDidEndTask(({ execution }) => bridge.updateTask(execution, 'end')));
  register(vscode.debug.onDidStartDebugSession((session) => bridge.updateDebug(session.id, 'running')));
  register(vscode.debug.onDidTerminateDebugSession((session) => bridge.updateDebug(session.id, null)));
  register(vscode.debug.registerDebugAdapterTrackerFactory('*', {
    createDebugAdapterTracker(session) {
      return {
        onDidSendMessage(message) {
          if (message?.type !== 'event') return;
          if (message.event === 'stopped') bridge.updateDebug(session.id, 'paused');
          if (message.event === 'continued') bridge.updateDebug(session.id, 'running');
        },
      };
    },
  }));
  bridge.applySettings();
}

module.exports = { activate, EditorBridge };
