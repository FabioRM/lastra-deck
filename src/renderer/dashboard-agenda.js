'use strict';

{
  const messages = { setup: 'Set a calendar file in Lastra Settings.', empty: 'No upcoming events.',
    invalid: 'The selected calendar could not be read.', unavailable: 'The selected calendar is unavailable.' };

  function mount(root, api) {
    const title = root.querySelector('#agenda-title');
    const timing = root.querySelector('#agenda-timing');
    const notice = root.querySelector('#agenda-notice');
    const join = root.querySelector('#agenda-join');
    let locale = navigator.language;
    let visible = false;
    let pending = false;
    let state;
    let message = '';
    let readError = '';
    root.hidden = false;

    function eventTime(event) {
      const options = event.allDay ? { weekday: 'short', month: 'short', day: 'numeric' }
        : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
      const date = new Intl.DateTimeFormat(locale, options).format(event.startAt);
      return event.allDay ? `${date} · All day` : event.active ? `In progress · ${date}` : date;
    }

    function setText(element, text) {
      if (element.textContent !== text) element.textContent = text;
      element.hidden = !text;
    }

    function paint() {
      const event = state?.event;
      setText(title, event?.title || window.LastraI18n.t('Next event'));
      title.title = event?.title || '';
      setText(timing, event ? eventTime(event) : '');
      const note = message || readError || state?.message || (state?.partial ? 'Some calendar events could not be included.'
        : messages[state?.status] ?? (!state ? 'Reading calendar…' : ''));
      setText(notice, note);
      join.disabled = pending || !event?.join;
      join.hidden = !event?.join;
    }

    const feed = window.createVisibleFeed(() => api.dashboardAgenda({ type: 'read' }), (next) => {
      if (pending || next.status === 'loading') return;
      state = next.ok ? next.state : undefined;
      readError = next.ok ? '' : next.message || next.error || messages.unavailable;
      paint();
    }, { interval: (response) => response.state?.selected ? 1500 : 3500, error: messages.unavailable });

    async function joinEvent() {
      if (!visible || pending) return;
      const token = state?.event?.join;
      if (!token) return;
      pending = true;
      message = '';
      paint();
      try {
        const result = await api.dashboardAgenda({ type: 'join', token });
        if (!result.ok) message = result.message || messages.unavailable;
      } catch { message = messages.unavailable; }
      finally {
        pending = false;
        paint();
        feed.reload();
      }
    }

    join.addEventListener('click', () => void joinEvent());
    return {
      setLocale(value) { locale = value; paint(); },
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

  window.LastraDashboardAgenda = { mount };
}
