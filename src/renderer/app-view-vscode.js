'use strict';

{
  const { element, button } = window.LastraDom;
  const remoteNames = new Map([['wsl', 'WSL'], ['ssh-remote', 'SSH'], ['dev-container', 'Dev Container'], ['codespaces', 'Codespaces']]);
  const taskStates = { idle: 'Ready', running: 'Running', finished: 'Finished', passed: 'Passed', failed: 'Failed' };
  const debugStates = { inactive: 'Inactive', active: 'Active', running: 'Running', paused: 'Paused' };
  const outcomes = {
    accepted: 'VS Code accepted the task.', untrusted: 'Trust this workspace in VS Code before running tasks.',
    'missing-task': 'This task is no longer available.', busy: 'This task is already running.', failed: 'VS Code could not start the task.',
  };
  const clock = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: 'numeric', second: 'numeric' });

  function row(label, value) {
    const tile = element('div', 'vscode-reading');
    tile.append(element('dt', 'app-view-secondary', label), element('dd', '', value));
    return tile;
  }

  function mount(container, read, dispatch) {
    const root = element('section', 'vscode-view');
    container.append(root);
    let state = { status: 'loading' };
    let selected;
    const pending = new Map();
    const timedOut = new Map();

    function render() {
      const sessions = state.sessions ?? [];
      const focused = sessions.filter((session) => session.focused);
      const context = selected ? sessions.find((session) => session.session === selected)
        : focused.length === 1 ? focused[0] : sessions.length === 1 ? sessions[0] : null;
      const focusedButton = root.contains(document.activeElement) ? document.activeElement.dataset.vscodeTarget : null;
      root.replaceChildren();
      const status = element('p', 'app-view-secondary');
      status.setAttribute('role', 'status');
      if (!sessions.length) {
        const messages = {
          loading: 'Reading VS Code workspaces…',
          setup: 'Install the Lastra for VS Code extension locally and enable Lastra in VS Code user settings.',
          offline: 'VS Code is disconnected. Workspace data will refresh when it reconnects.',
        };
        status.textContent = messages[state.status] ?? 'VS Code workspace data is unavailable.';
        root.append(status);
        return;
      }
      const workspaces = element('div', 'vscode-toolbar');
      workspaces.setAttribute('aria-label', 'VS Code workspaces');
      for (const session of sessions) {
        const remote = session.remote && (remoteNames.get(session.remote) ?? session.remote);
        const control = button(remote ? `${session.name} · ${remote}` : session.name, () => { selected = session.session; render(); });
        control.setAttribute('aria-pressed', String(context === session));
        control.dataset.vscodeTarget = session.session;
        workspaces.append(control);
      }
      root.append(workspaces);
      if (!context) {
        status.textContent = selected ? 'That workspace disconnected. Select an available workspace.' : 'Choose a workspace.';
        root.append(status);
      } else {
        appendContext(context, status);
      }
      if (focusedButton) root.querySelector(`[data-vscode-target="${focusedButton}"]`)?.focus({ preventScroll: true });
    }

    function appendContext(context, status) {
      const readings = element('dl', 'vscode-readings');
      const { errors, warnings, information, hints } = context.problems;
      const debuggerLabel = debugStates[context.debug.state];
      const hasDiagnostics = [errors, warnings, information, hints].every(Number.isInteger);
      readings.append(row('Active file', context.file ?? 'No active file'), row('Git branch', context.branch ?? 'Unavailable'),
        row('Problems', hasDiagnostics ? `${errors} errors · ${warnings} warnings · ${information} info · ${hints} hints` : 'Unavailable'),
        row('Debugger', context.debug.name ? `${debuggerLabel} · ${context.debug.name}` : debuggerLabel));
      if (context.tests) {
        const { passed, failed, skipped, success, updatedAt } = context.tests;
        const result = `${success ? 'Passed' : 'Failed'} · ${passed} passed · ${failed} failed · ${skipped} skipped`;
        readings.append(row('Jest report', updatedAt ? result + ' · ' + clock.format(updatedAt) : result));
      } else if (context.testReportConfigured) readings.append(row('Jest report', 'Unavailable'));
      root.append(readings);

      const queued = pending.get(context.session);
      if (queued?.request && context.command?.id === queued.request) pending.delete(context.session);
      else if (queued?.request && Date.now() - queued.issuedAt > 12_000) {
        pending.delete(context.session);
        timedOut.set(context.session, queued.request);
      }
      if (context.command?.id === timedOut.get(context.session)) timedOut.delete(context.session);
      const waiting = pending.has(context.session);
      status.textContent = waiting ? 'Waiting for VS Code…' : timedOut.has(context.session) ? 'VS Code did not acknowledge the task request.'
        : !context.trusted ? 'Trust this workspace in VS Code to use tasks.'
          : context.command ? outcomes[context.command.state] : context.tasks.length ? '' : 'Add task names to Lastra: Allowed Tasks in VS Code user settings.';
      status.hidden = !status.textContent;
      root.append(status);

      const tasks = element('div', 'vscode-tasks');
      for (const task of context.tasks) {
        const item = button('', () => void runTask(context, task));
        item.disabled = !context.trusted || waiting || task.status === 'running';
        item.dataset.vscodeTarget = task.id;
        const title = task.folder ? `${task.name} · ${task.folder}` : task.name;
        const elapsed = task.elapsed === null ? '' : ` · ${(task.elapsed / 1000).toFixed(1)} s`;
        const exit = task.exitCode === null || task.exitCode === 0 ? '' : ` · Exit ${task.exitCode}`;
        item.append(element('strong', '', title), element('span', 'app-view-secondary',
          `${task.test ? 'Test task' : 'Task'} · ${taskStates[task.status]}${exit}${elapsed}`));
        tasks.append(item);
      }
      if (context.tasks.length) root.append(tasks);
      root.append(element('p', 'app-view-secondary', 'Workspace updated ' + clock.format(context.updatedAt)));
    }

    async function runTask(context, task) {
      if (pending.has(context.session)) return;
      selected = context.session;
      pending.set(context.session, {});
      timedOut.delete(context.session);
      render();
      try {
        const result = await dispatch({ action: 'run-task', session: context.session, task: task.id });
        if (result?.request) pending.set(context.session, result);
        else pending.delete(context.session);
      } finally {
        if (root.isConnected) render();
      }
    }

    return window.createVisibleFeed(read, (next) => { state = next; render(); }, { interval: 1_500 });
  }

  window.LastraVscodeView = { mount };
}
