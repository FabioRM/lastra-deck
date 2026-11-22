'use strict';

{
  const wakeKeys = new Set(['Enter', ' ', 'Escape']);
  const WAKE_TAIL_MS = 400;
  const pointerTail = new Set(['click', 'dblclick', 'auxclick', 'contextmenu', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'touchcancel']);
  const activity = ['pointerdown', 'pointerup', 'pointercancel', 'pointermove', 'keydown', 'keyup', 'wheel', ...pointerTail];

  class IdleGate {
    constructor({ now = () => performance.now(), setIdle }) {
      this.now = now;
      this.setIdle = setIdle;
      this.last = now();
      this.timeout = 0;
      this.idle = false;
      this.suspended = false;
      this.suppressUntil = -Infinity;
      this.pointers = new Set();
      this.keys = new Set();
    }

    configure(seconds) {
      const timeout = seconds * 1_000;
      if (timeout === this.timeout) return;
      this.timeout = timeout;
      this.reset();
    }

    reset() {
      if (this.idle && (this.pointers.size || this.keys.size)) this.suppressUntil = this.now() + WAKE_TAIL_MS;
      this.pointers.clear();
      this.keys.clear();
      this.wakeKey = undefined;
      this.touchReleased = false;
      this.change(false);
      this.last = this.now();
    }

    suspend(value) {
      if (value === this.suspended) return;
      this.suspended = value;
      this.reset();
    }

    change(value) {
      if (this.idle === value) return;
      this.idle = value;
      this.setIdle(value);
    }

    tick(blocked = false) {
      if (!this.timeout || this.suspended || this.idle || this.pointers.size || this.keys.size) return;
      if (blocked) this.last = this.now();
      else if (this.now() - this.last >= this.timeout) this.change(true);
    }

    wake() {
      this.suppressUntil = this.now() + WAKE_TAIL_MS;
      this.reset();
    }

    input({ type, pointerId, key, code = key, repeat = false, trusted = true }) {
      // Programmatic navigation within the deck does not count as user activity.
      if (!trusted || this.suspended) return false;
      if (!this.idle) {
        if (this.now() < this.suppressUntil && pointerTail.has(type)) {
          if (type === 'click') this.suppressUntil = -Infinity;
          return true;
        }
        if (type === 'pointerdown' || (type === 'keydown' && !repeat)) this.suppressUntil = -Infinity;
        if (type === 'pointerdown') this.pointers.add(pointerId);
        if (type === 'pointerup' || type === 'pointercancel') this.pointers.delete(pointerId);
        if (type === 'keydown') this.keys.add(code);
        if (type === 'keyup') this.keys.delete(code);
        this.last = this.now();
        return false;
      }

      if (type === 'pointerdown') this.pointers.add(pointerId);
      if ((type === 'pointerup' || type === 'pointercancel') && this.pointers.delete(pointerId)) {
        this.touchReleased ||= type === 'pointerup';
        if (!this.pointers.size && this.touchReleased && !this.keys.size) this.wake();
      }
      if (type === 'keydown') {
        this.keys.add(code);
        if (!repeat && wakeKeys.has(key)) this.wakeKey = code;
      }
      if (type === 'keyup') {
        this.keys.delete(code);
        if (code === this.wakeKey && !this.pointers.size) this.wake();
      }
      // Assistive technology can activate the wake button without a pointer sequence.
      if (type === 'click' && !this.pointers.size && !this.keys.size) this.wake();
      return true;
    }
  }

  function idleStatuses(profile, obs) {
    const output = [];
    if (profile?.viewOnly) output.push('View-only mode');
    if (obs?.status === 'connected') {
      if (obs.streaming?.active) output.push(obs.streaming.phase === 'reconnecting' ? 'Stream reconnecting' : 'Streaming live');
      if (obs.recording?.active) output.push(obs.recording.paused ? 'Recording paused' : 'Recording');
    }
    return output;
  }

  function timerLines(state, sinceReceipt, project) {
    if (!state || !project) return [];
    const { countdownTime, rundownTime } = project(state, sinceReceipt);
    const format = (label, time) => `${label} · ${time.label}${time.state === 'overrun' ? ' overrun' : ''}`;
    return [
      ...(state.countdown ? [format('Countdown', countdownTime)] : []),
      ...(state.rundown?.elapsedMs != null ? [format(`Segment ${state.rundown.index + 1} of ${state.rundown.segments.length}`, rundownTime)] : []),
    ];
  }

  function startIdleScreen(api) {
    const stage = document.getElementById('stage');
    const overlay = document.createElement('section');
    overlay.id = 'deck-idle-screen';
    overlay.hidden = true;
    overlay.setAttribute('aria-label', window.LastraI18n.t('Deck idle screen'));
    const time = document.createElement('time');
    const date = document.createElement('p');
    const timers = document.createElement('ul');
    timers.setAttribute('aria-label', window.LastraI18n.t('Active timers'));
    const statuses = document.createElement('p');
    statuses.className = 'deck-idle-statuses';
    const weather = document.createElement('p');
    weather.className = 'deck-idle-statuses';
    let weatherLine = '';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = window.LastraI18n.t('Tap to wake');
    button.setAttribute('aria-label', window.LastraI18n.t('Wake deck'));
    overlay.append(time, date, weather, timers, statuses, button);
    document.body.append(overlay);
    let profile;
    let obs;
    let settings;
    let clock;
    let calendar;
    let formatterKey;
    let timerState;
    let timerAt;
    let timerSignature;
    let timerRequest = 0;
    let deskTimers;
    let stopDeskTimers;
    let savedInert = false;
    let previousFocus;
    let interval;

    function paint() {
      const locale = profile?.locale || 'en-GB';
      const seconds = settings?.showClockSeconds === true;
      const key = `${locale}:${seconds}`;
      if (key !== formatterKey) {
        formatterKey = key;
        const timeOptions = { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) };
        try { clock = new Intl.DateTimeFormat(locale, timeOptions); }
        catch { clock = new Intl.DateTimeFormat('en-GB', timeOptions); }
        calendar = new Intl.DateTimeFormat(clock.resolvedOptions().locale, { weekday: 'long', day: 'numeric', month: 'long' });
      }
      const now = new Date();
      const clockText = clock.format(now);
      if (clockText !== time.textContent) { time.dateTime = now.toISOString(); time.textContent = clockText; }
      const dateText = calendar.format(now);
      if (dateText !== date.textContent) date.textContent = dateText;
      if (weather.textContent !== weatherLine) weather.textContent = weatherLine;
      weather.hidden = !weatherLine;
      const status = idleStatuses(profile, obs).join(' · ');
      if (status !== statuses.textContent) statuses.textContent = status;
      statuses.hidden = !status;
      const lines = [
        ...timerLines(timerState, Math.max(0, performance.now() - timerAt), window.LastraObsProduction?.timerProjection),
        ...(window.LastraTimers?.timerLines(deskTimers, Date.now()) ?? []),
      ];
      const signature = JSON.stringify(lines);
      if (signature !== timerSignature) {
        timerSignature = signature;
        timers.replaceChildren(...lines.map((line) => {
          const node = document.createElement('li');
          node.textContent = line;
          return node;
        }));
      }
      timers.hidden = !lines.length;
    }

    const gate = new IdleGate({ setIdle(show) {
      overlay.hidden = !show;
      const request = ++timerRequest;
      timerState = undefined;
      if (show) {
        previousFocus = stage.contains(document.activeElement) ? document.activeElement : undefined;
        savedInert = stage.inert;
        stage.inert = true;
        button.focus({ preventScroll: true });
        paint();
        stopDeskTimers = window.LastraWidgetProviders?.timers.subscribe((state) => {
          deskTimers = state;
          paint();
        });
        void api.readProductionTimers?.().then((result) => {
          if (request !== timerRequest || !result?.ok) return;
          timerState = result.state;
          timerAt = performance.now();
          paint();
        }).catch(() => {});
      } else {
        stopDeskTimers?.();
        stopDeskTimers = deskTimers = undefined;
        stage.inert = savedInert;
        if (!document.hidden && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        previousFocus = undefined;
      }
    } });

    function handle(event) {
      const consume = gate.input({ type: event.type, pointerId: event.pointerId, code: event.code || event.key,
        key: event.key, repeat: event.repeat, trusted: event.isTrusted });
      if (!consume) return;
      if (event.type === 'pointerdown') {
        try { event.target.setPointerCapture?.(event.pointerId); } catch { /* The capture may have ended. */ }
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    function poll() {
      const blocking = stage.inert && !gate.idle || Boolean(document.querySelector('dialog[open]'))
        || Array.from(document.querySelectorAll('[role="dialog"]:not([hidden]), #obs-confirm:not([hidden])'))
          .some((node) => node.getClientRects().length > 0);
      gate.tick(blocking);
      if (gate.idle) paint();
    }

    function visibility() { gate.suspend(document.hidden || profile?.desktopRevealed === true || profile?.sessionBlocked === true); }
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', () => { if (!gate.idle) gate.reset(); });
    for (const event of activity) window.addEventListener(event, handle, { capture: true, passive: false });
    button.addEventListener('click', () => { if (gate.idle) gate.wake(); });
    api.onProfile?.((view) => {
      profile = view;
      visibility();
    });
    api.onObs?.((view) => { obs = view; });
    api.onWeather?.((snapshot) => {
      weatherLine = snapshot?.label ? `${snapshot.temperature}° · ${window.LastraI18n.t(snapshot.label)}` : '';
      if (gate.idle) paint();
    });
    api.onDeckAppearance((appearance) => {
      settings = appearance;
      gate.configure(appearance.idleScreenSeconds ?? 0);
      clearInterval(interval);
      if (gate.timeout) interval = setInterval(poll, 250);
      visibility();
    });
    visibility();
  }

  if (typeof module === 'object') module.exports = { IdleGate, idleStatuses, timerLines };
  else if (window.lastra?.onDeckAppearance) startIdleScreen(window.lastra);
}
