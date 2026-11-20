'use strict';

(() => {
  const { element: node, button } = window.LastraDom;
  const POLL_MS = 750;
  const outcomes = {
    failed: 'Could not start',
    stopped: 'Stopped',
    'timed-out': 'Timed out',
    interrupted: 'Interrupted',
  };
  const activeOutcomes = { running: 'Running…', stopping: 'Stopping…', finishing: 'Finishing…', 'stop-failed': 'Stop unavailable' };

  function resultText(command) {
    if (command.active) return `${activeOutcomes[command.active.state]} · ${durationText(command.active.durationMs)}`;
    if (!command.last) return 'Ready';
    const { status, exitCode, durationMs } = command.last;
    const outcome = status === 'exited' ? (exitCode === 0 ? 'Succeeded' : 'Exit ' + exitCode) : outcomes[status];
    return outcome + ' · ' + durationText(durationMs);
  }

  function durationText(ms) { return ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(1) + ' s'; }

  function mount(container, read, dispatch) {
    const view = node('section', 'terminal-view');
    container.append(view);
    let state = { status: 'loading', profiles: [], commands: [] };
    let drawn = '';
    let visible = false;
    let generation = 0;
    let timer;
    const pending = new Set();

    function show() {
      const signature = JSON.stringify([state, [...pending]]);
      if (signature === drawn) return;
      drawn = signature;
      const focus = view.contains(document.activeElement) ? document.activeElement.dataset.terminalFocus : null;
      const supported = state.status !== 'unsupported';
      const ready = state.status === 'ready';
      const toolbar = node('div', 'terminal-toolbar');
      toolbar.append(button('Edit shells and commands', () => send('configure'), { disabled: !supported }),
        button('Reload', reload, { disabled: !supported }));
      view.replaceChildren(toolbar);
      if (!ready) {
        const copy = {
          loading: 'Reading Terminal settings…',
          unsupported: 'Windows Terminal is unavailable on this system.',
          invalid: state.message,
          unavailable: 'Terminal settings could not be read.',
        };
        const message = node('p', 'app-view-secondary', copy[state.status] ?? copy.unavailable);
        message.setAttribute('role', 'status');
        view.append(message);
      }
      if (!supported || state.status === 'loading') return;

      const columns = node('div', 'terminal-columns');
      const profiles = node('section', 'terminal-list');
      profiles.append(node('h4', '', 'Shell profiles'));
      if (!state.profiles.length) profiles.append(node('p', 'app-view-secondary', 'No shell profiles configured.'));
      for (const item of state.profiles) {
        const control = button('', () => send('open-profile', item.id), { disabled: !ready || pending.has('open-profile:' + item.id) });
        control.append(node('strong', '', item.name), node('span', 'app-view-secondary', item.directory));
        control.title = item.profile + ' · ' + item.directory;
        profiles.append(control);
      }
      const commands = node('section', 'terminal-list');
      commands.append(node('h4', '', 'Pinned commands'));
      if (!state.commands.length) commands.append(node('p', 'app-view-secondary', 'Add a command in Terminal settings.'));
      for (const item of state.commands) {
        const card = node('div', 'terminal-command');
        const control = commandButton('', 'run-command', item, { revision: item.revision }, !ready || item.running);
        control.append(node('strong', '', item.name), node('span', 'app-view-secondary', resultText(item)));
        control.title = item.program + ' · ' + item.directory;
        card.append(control);
        const actions = node('div', 'terminal-command-actions');
        const { active } = item;
        if (active) {
          actions.append(commandButton('Stop', 'stop-command', item, { run: active.id },
            active.state === 'stopping' || active.state === 'finishing'));
        }
        const logRun = active ? (active.log && active.id) : item.last?.logRun;
        if (logRun) actions.append(commandButton('Open log', 'open-log', item, { run: logRun }, !active && !ready));
        if (actions.childElementCount) card.append(actions);
        commands.append(card);
      }
      columns.append(profiles, commands);
      view.append(columns);
      if (focus) [...view.querySelectorAll('[data-terminal-focus]')].find((item) => item.dataset.terminalFocus === focus)?.focus({ preventScroll: true });
    }

    function commandButton(label, action, item, params, disabled) {
      const key = `${action}:${item.id}`;
      const control = button(label, () => send(action, item.id, params), { disabled: disabled || pending.has(key) });
      control.dataset.terminalFocus = key;
      if (label) control.setAttribute('aria-label', `${label} for ${item.name}`);
      return control;
    }

    async function load(current) {
      let next;
      try { next = await read(); } catch { next = { status: 'unavailable', profiles: [], commands: [] }; }
      if (!visible || current !== generation) return;
      state = next;
      show();
      if (state.commands.some((item) => item.running)) timer = setTimeout(() => load(current), POLL_MS);
    }

    function reload() {
      clearTimeout(timer);
      if (visible) {
        show();
        void load(++generation);
      }
    }

    async function send(action, id, params) {
      const key = action + ':' + id;
      if (pending.has(key)) return;
      pending.add(key);
      show();
      try { await dispatch({ action, id, ...params }); } finally {
        pending.delete(key);
        reload();
      }
    }

    return {
      setVisible(active) {
        if (visible === active) return;
        visible = active;
        generation++;
        reload();
      },
      destroy() {
        visible = false;
        generation++;
        reload();
      },
    };
  }

  window.LastraTerminalView = { mount };
})();
