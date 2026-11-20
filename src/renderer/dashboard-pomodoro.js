'use strict';

{
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
      const next = state?.phase === 'break' ? 'focus' : 'break';
      const running = state?.status === 'running';
      const paused = state?.status === 'paused';
      const complete = state?.status === 'complete';
      const action = running ? 'pause' : paused ? 'resume' : 'start';
      primary.dataset.action = action;
      primary.textContent = running ? window.LastraI18n.t('Pause') : paused ? 'Resume' : `Start ${complete ? next : round.toLowerCase()}`;
      primary.disabled = readOnly || pending || !state;
      reset.disabled = readOnly || pending || !state;
      reset.hidden = !state || state.status === 'idle';
      const countdown = state ? format(state.remainingMs) : '–:––';
      if (time.textContent !== countdown) time.textContent = countdown;
      const label = state ? `${round}${complete ? ' complete' : paused ? ' paused' : ''}` : 'Reading timer';
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
      destroy: feed.destroy,
    };
  }

  window.LastraPomodoro = { mount };
}
