'use strict';

{
  const { t } = window.LastraI18n;

  function format(ms) {
    const seconds = Math.ceil(ms / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function mount(root, api, prefix = 'pomodoro') {
    const phase = root.querySelector(`#${prefix}-phase`);
    const time = root.querySelector(`#${prefix}-time`);
    const primary = root.querySelector(`#${prefix}-primary`);
    const reset = root.querySelector(`#${prefix}-reset`);
    const feedback = root.querySelector(`#${prefix}-feedback`);
    const unavailable = 'Pomodoro unavailable.';
    let state;
    let visible = false;
    let pending = false;
    let readOnly = false;
    let message = '';
    let readError = '';
    root.hidden = false;

    function paint() {
      const round = state?.phase === 'break' ? 'Break' : 'Focus';
      const running = state?.status === 'running';
      const paused = state?.status === 'paused';
      const complete = state?.status === 'complete';
      const action = running ? 'pause' : paused ? 'resume' : 'start';
      primary.dataset.action = action;
      const startBreak = (round === 'Break') !== complete;
      primary.textContent = t(running ? 'Pause' : paused ? 'Resume' : startBreak ? 'Start break' : 'Start focus');
      primary.disabled = readOnly || pending || !state;
      reset.disabled = readOnly || pending || !state;
      reset.hidden = !state || state.status === 'idle';
      const countdown = state ? format(state.remainingMs) : '–:––';
      if (time.textContent !== countdown) time.textContent = countdown;
      const label = t(state ? `${round}${complete ? ' complete' : paused ? ' paused' : ''}` : 'Reading timer');
      if (phase.textContent !== label) phase.textContent = label;
      const text = message || readError || state?.warning || '';
      if (feedback.textContent !== text) feedback.textContent = text;
      feedback.hidden = !text;
    }

    const feed = window.createVisibleFeed(api.readDashboardPomodoro, (next) => {
      if (pending || next.status === 'loading') return;
      state = next.ok ? next.state : undefined;
      readError = next.ok ? '' : next.message || next.error || unavailable;
      paint();
    }, { interval: (response) => response.state?.status === 'running' ? 500 : 2000, error: unavailable });

    async function change(type) {
      if (readOnly || !visible || pending || !state) return;
      pending = true;
      message = '';
      paint();
      try {
        const result = await api.changeDashboardPomodoro({ type, revision: state.revision });
        if (result.ok) state = result.state;
        else message = result.message || unavailable;
      } catch { message = unavailable; }
      finally {
        pending = false;
        paint();
        feed.reload();
      }
    }

    primary.addEventListener('click', () => void change(primary.dataset.action));
    reset.addEventListener('click', () => void change('reset'));
    document.addEventListener('lastra-language', paint);
    return {
      setReadOnly(value) { readOnly = value; paint(); },
      setVisible(active) {
        if (visible === active) return;
        visible = active;
        message = '';
        readError = '';
        if (!active) state = undefined;
        paint();
        feed.setVisible(active);
      },
      destroy() {
        document.removeEventListener('lastra-language', paint);
        feed.destroy();
      },
    };
  }

  function mountBreak(dialog, api) {
    const time = document.getElementById('pomodoro-break-time');
    const progress = document.getElementById('pomodoro-break-progress');
    const paused = document.getElementById('pomodoro-break-paused');
    const otherDialog = 'dialog[open]:not(#pomodoro-break, #quick-tools)';
    let active;
    let deadline;
    let dismissed = false;
    let tick;

    function paint() {
      clearTimeout(tick);
      if (!dialog.open || !active) return;
      const running = active.status === 'running';
      const remaining = running ? Math.max(0, deadline - performance.now()) : active.remainingMs;
      const countdown = format(remaining);
      if (time.textContent !== countdown) time.textContent = countdown;
      progress.max = active.durationMs;
      progress.value = active.durationMs - remaining;
      paused.hidden = running;
      if (running && remaining > 0) tick = setTimeout(paint, remaining % 1000 || 1000);
    }

    function sync() {
      const show = active && !dismissed && !document.hidden && !document.querySelector(otherDialog);
      if (show && !dialog.open) dialog.showModal();
      else if (!show && dialog.open) dialog.close();
      paint();
    }

    function dismiss() {
      dismissed = true;
      sync();
    }

    const stop = api.onPomodoroChanged((state) => {
      active = state.phase === 'break' && ['running', 'paused'].includes(state.status) ? state : null;
      if (!active) dismissed = false;
      deadline = performance.now() + state.remainingMs;
      sync();
    });
    document.getElementById('pomodoro-break-close').addEventListener('click', dismiss);
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); dismiss(); });
    document.addEventListener('close', sync, true);
    document.addEventListener('visibilitychange', sync);
    document.addEventListener('lastra:session-blocked', sync);
    window.addEventListener('pagehide', () => { stop(); clearTimeout(tick); }, { once: true });
  }

  window.LastraPomodoro = { mount };
  if (window.lastra?.onPomodoroChanged) mountBreak(document.getElementById('pomodoro-break'), window.lastra);
}
