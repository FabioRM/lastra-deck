'use strict';

{
  // Node loads this file for the timer tests, where only the pure helpers below are used.
  const { element, button } = typeof module === 'object' ? require('../shared/dom') : window.LastraDom;
  const FRESH_MS = 10_000;

  function durationText(milliseconds, round = Math.floor) {
    const seconds = Math.max(0, round(milliseconds / 1000));
    const hours = Math.floor(seconds / 3600);
    const mins = String(Math.floor(seconds / 60) % 60).padStart(2, '0');
    const secs = String(seconds % 60).padStart(2, '0');
    return hours ? `${hours}:${mins}:${secs}` : `${mins}:${secs}`;
  }

  function remainingTime(durationMs, elapsedMs) {
    const remaining = durationMs - elapsedMs;
    return remaining < 0 ? { state: 'overrun', label: '+' + durationText(-remaining) }
      : { state: remaining === 0 ? 'due' : 'running', label: durationText(remaining, Math.ceil) };
  }

  function providerTime(sample, sinceReceipt) {
    if (!sample) return { state: 'unavailable', label: 'Unavailable' };
    if (sample.state === 'idle') return { state: 'idle', label: 'Inactive' };
    if (sample.state === 'reconnecting') return { state: 'reconnecting', label: 'Reconnecting' };
    const age = sample.ageMs + sinceReceipt;
    if (age > FRESH_MS) return { state: 'stale', label: 'Waiting for OBS' };
    if (!Number.isSafeInteger(sample.durationMs) || sample.durationMs < 0) return { state: 'unavailable', label: 'Unavailable' };
    return { state: sample.state, label: durationText(sample.durationMs + (sample.state === 'active' ? age : 0)) };
  }

  function timerProjection(state, sinceReceipt) {
    const { countdown, rundown } = state;
    const countdownTime = countdown ? remainingTime(countdown.durationMs, countdown.elapsedMs + sinceReceipt)
      : { state: 'idle', label: durationText(state.config.countdownSeconds * 1000) };
    let rundownTime;
    const current = rundown?.segments[rundown.index];
    if (current && rundown.elapsedMs !== null) rundownTime = remainingTime(current.seconds * 1000, rundown.elapsedMs + sinceReceipt);
    else if (rundown) rundownTime = { state: 'complete', label: 'Complete' };
    else rundownTime = { state: 'idle', label: 'Not started' };
    return { countdownTime, rundownTime, current, next: rundown?.segments[rundown.index + 1] };
  }

  function field(text, control) {
    const label = element('label', '', text);
    label.append(control);
    return label;
  }

  function createProductionView(root, api, { settingsOnly = false } = {}) {
    const status = element('p', 'production-status');
    status.setAttribute('role', 'status');
    const cards = element('div', 'production-cards');
    const rundown = element('div', 'production-plan');
    const planList = element('ol');
    rundown.append(element('h3', '', 'Rundown'), planList);
    const settings = element('fieldset', 'production-settings');
    settings.hidden = true;
    const secondsInput = (value) => {
      const control = element('input');
      Object.assign(control, { type: 'number', min: '1', max: '86400', step: '1', inputMode: 'numeric', value });
      return control;
    };
    const countdownSeconds = secondsInput(300);
    const segmentRows = element('div', 'production-segments');
    const settingsButtons = element('div', 'production-controls');
    settings.append(element('legend', '', 'Timer settings'), field('Countdown seconds', countdownSeconds), segmentRows, settingsButtons);
    let form = [];
    let state;
    let stateAt = 0;
    let provider;
    let providerAt = 0;
    let obs = { status: 'disabled' };
    let visible = false;
    let pending = false;
    let loadEpoch = 0;
    let providerEpoch = 0;
    let pollTimer;
    let ticks;
    let obsKey;
    let paintedRevision;

    function card(title, ...controls) {
      const item = element('section', 'production-card');
      const value = element('p', 'production-value', '—');
      item.append(element('h3', '', title), value);
      if (controls.length) {
        const actions = element('div', 'production-controls');
        actions.append(...controls);
        item.append(actions);
      }
      cards.append(item);
      return value;
    }

    const startCountdown = button('Start', () => change('start-countdown'));
    const resetCountdown = button('Reset', () => change('reset-countdown'));
    resetCountdown.setAttribute('aria-label', 'Reset countdown');
    const countdown = card('Countdown', startCountdown, resetCountdown);
    const stream = card('Live duration');
    const record = card('Recording duration');
    const startRundown = button('Start rundown', () => change('start-rundown'));
    const advanceRundown = button('Next segment', () => change('advance-rundown'));
    const resetRundown = button('Reset', () => change('reset-rundown'));
    resetRundown.setAttribute('aria-label', 'Reset rundown');
    const segment = card('Current segment', startRundown, advanceRundown, resetRundown);
    const edit = button('Edit timer settings', () => showSettings(settings.hidden));
    edit.disabled = true;
    edit.setAttribute('aria-expanded', 'false');
    const add = button('Add segment', () => {
      const values = readForm();
      if (values.length >= 24) return;
      addRows([...values, { name: '', seconds: '60' }]);
      form.at(-1)?.name.focus();
    });
    const save = button('Save settings', async () => {
      const config = { version: 1, countdownSeconds: countdownSeconds.valueAsNumber,
        segments: readForm().map(({ name, seconds }) => ({ name, seconds: Number(seconds) })) };
      if (await change('configure', { config })) showSettings(false);
    });
    settingsButtons.append(add, save, button('Cancel', () => showSettings(false)));
    if (settingsOnly) root.append(edit, settings, status);
    else root.append(cards, rundown, status);

    function readForm() {
      return form.map(({ name, seconds }) => ({ name: name.value, seconds: seconds.value }));
    }

    function reorder(index, target) {
      const values = readForm();
      [values[index], values[target]] = [values[target], values[index]];
      addRows(values);
      form[target].name.focus();
    }

    function addRows(values) {
      form = values.map((value, index) => {
        const row = element('div', 'production-segment');
        const name = element('input');
        Object.assign(name, { type: 'text', maxLength: 60, value: value.name });
        const seconds = secondsInput(value.seconds);
        const actions = element('div', 'production-controls');
        const up = button('Up', () => reorder(index, index - 1));
        const down = button('Down', () => reorder(index, index + 1));
        const remove = button('Remove', () => addRows(readForm().filter((_, position) => position !== index)));
        up.disabled = index === 0;
        down.disabled = index === values.length - 1;
        actions.append(up, down, remove);
        row.append(field(`Segment ${index + 1}`, name), field('Seconds', seconds), actions);
        return { row, name, seconds };
      });
      segmentRows.replaceChildren(...form.map(({ row }) => row));
      add.disabled = form.length >= 24;
    }

    function showSettings(open) {
      if (!state) return;
      settings.hidden = !open;
      edit.setAttribute('aria-expanded', String(open));
      if (open) {
        countdownSeconds.value = state.config.countdownSeconds;
        addRows(state.config.segments);
        countdownSeconds.focus();
      }
    }

    function display(target, time, name = '') {
      const label = [name, time.label, time.state === 'overrun' ? 'overrun' : time.state === 'paused' ? 'paused' : ''].filter(Boolean).join(' · ');
      if (target.textContent !== label) target.textContent = label;
      target.dataset.state = time.state;
    }

    function sourceTime(output) {
      if (obs.status !== 'connected') return { state: 'unavailable', label: 'OBS unavailable' };
      if (!obs[output]?.active) return { state: 'idle', label: 'Inactive' };
      if (obs[output].phase === 'reconnecting') return { state: 'reconnecting', label: 'Reconnecting' };
      const sample = provider?.[output];
      if (!sample) return { state: 'stale', label: 'Waiting for OBS' };
      return providerTime(sample, Math.max(0, performance.now() - providerAt));
    }

    function paint() {
      display(stream, sourceTime('streaming'));
      display(record, sourceTime('recording'));
      edit.disabled = !state || pending;
      startCountdown.disabled = !state || pending || Boolean(state.countdown);
      resetCountdown.disabled = !state?.countdown || pending;
      startRundown.disabled = !state?.config.segments.length || pending || state?.rundown?.elapsedMs != null;
      advanceRundown.disabled = state?.rundown?.elapsedMs == null || pending;
      resetRundown.disabled = !state?.rundown || pending;
      save.disabled = !state || pending;
      if (!state) return;
      const { countdownTime, rundownTime, current } = timerProjection(state, Math.max(0, performance.now() - stateAt));
      display(countdown, countdownTime);
      display(segment, rundownTime, current?.name);
      if (paintedRevision !== state.revision) {
        paintedRevision = state.revision;
        advanceRundown.textContent = current && state.rundown.index === state.rundown.segments.length - 1 ? 'Finish rundown' : 'Next segment';
        const segments = state.rundown?.segments ?? state.config.segments;
        planList.replaceChildren(...segments.map(({ name, seconds }, index) => {
          const actual = state.rundown?.completed[index];
          const tag = index === state.rundown?.index ? ' · current' : index === state.rundown?.index + 1 ? ' · next' : '';
          const elapsed = actual === undefined ? '' : ` · ${durationText(actual)} elapsed${actual > seconds * 1000 ? ' · overrun' : ''}`;
          return element('li', '', `${name} · ${durationText(seconds * 1000)} planned${elapsed}${tag}`);
        }));
        if (!segments.length) planList.append(element('li', '', 'No segments configured'));
      }
    }

    function accept(result) {
      if (!result?.ok) throw new Error(result?.message ?? 'Production timers unavailable.');
      state = result.state;
      stateAt = performance.now();
    }

    async function load(epoch) {
      try {
        const result = await api.readProductionTimers();
        if (epoch !== loadEpoch) return;
        accept(result);
        status.textContent = state.warning ?? '';
      } catch (error) {
        if (epoch === loadEpoch) status.textContent = error.message;
      } finally {
        if (epoch === loadEpoch) paint();
      }
    }

    async function change(type, extra = {}) {
      if (!visible || !state || pending) return false;
      pending = true;
      paint();
      try {
        accept(await api.changeProductionTimers({ type, revision: state.revision, ...extra }));
        status.textContent = type === 'configure' ? 'Timer settings saved.' : '';
        return true;
      } catch (error) {
        status.textContent = error.message;
        return false;
      } finally {
        pending = false;
        paint();
      }
    }

    function watchProvider() {
      const key = visible && obs.status === 'connected' ? JSON.stringify([obs.generation, obs.recording, obs.streaming]) : null;
      if (key === obsKey) return;
      obsKey = key;
      const epoch = ++providerEpoch;
      clearTimeout(pollTimer);
      provider = undefined;
      if (!key) return;
      async function poll() {
        const sample = await api.readObsTiming(obs.generation).catch(() => null);
        if (epoch !== providerEpoch) return;
        if (sample) {
          provider = sample;
          providerAt = performance.now();
        }
        paint();
        if (obs.recording?.active || obs.streaming?.active) pollTimer = setTimeout(poll, 4_000);
      }
      void poll();
    }

    api.onProductionTimers?.((next) => {
      if (!visible || pending) return;
      accept({ ok: true, state: next });
      paint();
    });

    return (open, view) => {
      obs = view;
      if (visible !== open) {
        visible = open;
        const epoch = ++loadEpoch;
        clearInterval(ticks);
        if (open) {
          void load(epoch);
          if (!settingsOnly) ticks = setInterval(paint, 250);
        }
      }
      if (!settingsOnly) watchProvider();
      if (visible) paint();
    };
  }

  if (typeof module === 'object') module.exports = { durationText, remainingTime, providerTime, timerProjection };
  else window.LastraObsProduction = { createProductionView, timerProjection };
}
