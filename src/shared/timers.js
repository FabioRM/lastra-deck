'use strict';

// Rules and readings shared by the timer store, the deck and the editor.

{
  const MAX_TIMERS = 12;
  const TIMER_DURATION = { min: 1_000, max: 24 * 3_600_000, value: 5 * 60_000 };
  const STOPWATCH_LIMIT = 100 * 3_600_000 - 1_000;
  const TIMER_ID = /^[a-z0-9_-]{1,40}$/i;
  const TIMER_KINDS = { countdown: 'Countdown', stopwatch: 'Stopwatch' };
  const TIMER_COMMANDS = { toggle: 'Start, pause or resume', restart: 'Start again from the beginning', remove: 'Remove the timer' };

  function timerLabel(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!/^\P{Cc}{1,40}$/u.test(text)) throw new Error('Enter a timer name of 1 to 40 characters');
    return text;
  }

  /** Validate what defines a timer: its ID, name, kind and, for a countdown, its duration. */
  function timerDefinition(raw) {
    const kind = raw.kind ?? 'countdown';
    if (typeof raw.id !== 'string' || !TIMER_ID.test(raw.id)) throw new Error('A timer needs a valid ID');
    const label = timerLabel(raw.label);
    if (!Object.hasOwn(TIMER_KINDS, kind)) throw new Error('Choose a countdown or a stopwatch');
    if (kind === 'stopwatch') {
      if (raw.durationMs !== undefined) throw new Error('A stopwatch has no duration');
      return { id: raw.id, label, kind };
    }
    const { durationMs } = raw;
    if (!Number.isInteger(durationMs) || durationMs < TIMER_DURATION.min || durationMs > TIMER_DURATION.max) {
      throw new Error('A countdown lasts from 1 second to 24 hours');
    }
    return { id: raw.id, label, kind, durationMs };
  }

  /** Validate a key's timer action and return the definition together with its command. */
  function timerFields(action) {
    const command = action.command ?? 'toggle';
    if (!Object.hasOwn(TIMER_COMMANDS, command)) throw new Error('Choose a supported timer command');
    return { ...timerDefinition(action), command };
  }

  /** The current reading of a stored timer: time left for a countdown, time elapsed for a stopwatch. */
  function timerReading(timer, now) {
    const since = timer.status === 'running' ? Math.max(0, now - timer.anchorAt) : 0;
    if (timer.kind === 'stopwatch') return { status: timer.status, ms: Math.min(STOPWATCH_LIMIT, timer.valueMs + since) };
    const ms = Math.max(0, timer.valueMs - since);
    return { status: timer.status === 'running' && ms === 0 ? 'complete' : timer.status, ms };
  }

  function formatTimer(ms, kind = 'countdown') {
    const total = kind === 'stopwatch' ? Math.floor(ms / 1000) : Math.ceil(ms / 1000);
    const pad = (value) => String(value).padStart(2, '0');
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total % 3600 / 60);
    return hours ? `${hours}:${pad(minutes)}:${pad(total % 60)}` : `${minutes}:${pad(total % 60)}`;
  }

  /** A status word and a time, as a key or a list row shows them. */
  function timerSummary(timer, now) {
    const { status, ms } = timerReading(timer, now);
    const clock = formatTimer(ms, timer.kind);
    if (status === 'complete') return { status, state: 'Finished', time: '' };
    if (status === 'paused') return { status, state: 'Paused', time: clock };
    return { status, state: 'Running', time: timer.kind === 'stopwatch' ? clock : `${clock} left` };
  }

  function timerLine(timer, now) {
    const { status, time } = timerSummary(timer, now);
    if (status === 'complete') return `${timer.label} · Finished`;
    return `${timer.label} · ${time}${status === 'paused' ? ' paused' : ''}`;
  }

  /** Lines for every timer that is running, paused or finished and not yet dismissed. */
  function timerLines(state, now) {
    return Array.isArray(state?.timers) ? state.timers.map((timer) => timerLine(timer, now)) : [];
  }

  const api = { MAX_TIMERS, TIMER_DURATION, STOPWATCH_LIMIT, TIMER_ID, TIMER_KINDS, TIMER_COMMANDS,
    timerLabel, timerDefinition, timerFields, timerReading, formatTimer, timerSummary, timerLine, timerLines };
  if (typeof module === 'object') module.exports = api;
  else window.LastraTimers = api;
}
