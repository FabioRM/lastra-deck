'use strict';

(() => {
  const api = window.lastra;
  if (!api?.startPushToTalk) return;

  const button = document.getElementById('push-to-talk');
  const label = document.getElementById('push-to-talk-label');
  const holdMs = 160;
  const heartbeatMs = 250;
  let microphone = null;
  let gesture = null;
  let state = { phase: 'idle' };

  function render() {
    const captions = { opening: 'Opening…', talking: 'Talking', closing: 'Muting…', fault: 'Mute unverified' };
    const muted = microphone?.muted === true;
    const waiting = gesture && state.phase === 'idle';
    label.textContent = captions[state.phase] ?? (waiting ? 'Keep holding' : 'Push to talk');
    button.disabled = !gesture && (!muted || state.phase !== 'idle');
    button.dataset.phase = state.phase;
    button.setAttribute('aria-pressed', String(state.phase === 'talking'));
    const instruction = microphone ? 'Push-to-talk is available when the selected microphone is muted.'
      : 'Select an individual microphone to use push-to-talk.';
    button.title = state.message || (microphone && (muted || gesture)
      ? 'Hold to temporarily unmute ' + microphone.name + '. Release to mute.'
      : instruction);
  }

  function notice(message) {
    if (message) document.dispatchEvent(new CustomEvent('lastra-microphone-notice', { detail: message }));
  }

  function end(send = true) {
    const current = gesture;
    if (!current) return;
    gesture = null;
    clearTimeout(current.hold);
    clearInterval(current.heartbeat);
    if (send && current.started) void api.stopPushToTalk(current.token).catch(() => {});
    if (current.pointerId !== undefined && button.hasPointerCapture(current.pointerId)) {
      button.releasePointerCapture(current.pointerId);
    }
    render();
  }

  function start(input) {
    if (gesture || button.disabled || microphone?.muted !== true) return;
    const current = gesture = { ...input, token: crypto.randomUUID(), inputId: microphone.id, started: false };
    current.hold = setTimeout(async () => {
      if (gesture !== current) return;
      current.started = true;
      try {
        const result = await api.startPushToTalk(current.token, current.inputId);
        if (gesture !== current) return;
        if (!result.ok) {
          end(false);
          notice(result.message);
          return;
        }
        current.heartbeat = setInterval(() => {
          void api.renewPushToTalk(current.token).then((result) => {
            if (gesture === current && !result.ok) end();
          }).catch(() => { if (gesture === current) end(); });
        }, heartbeatMs);
      } catch (err) {
        if (gesture === current) {
          end();
          notice(err.message);
        }
      }
    }, holdMs);
    render();
  }

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary || gesture || button.disabled) return;
    button.setPointerCapture(event.pointerId);
    start({ pointerId: event.pointerId });
  });
  button.addEventListener('pointermove', (event) => {
    if (gesture?.pointerId !== event.pointerId) return;
    const { left, top, right, bottom } = button.getBoundingClientRect();
    if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) end();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, (event) => {
      if (gesture?.pointerId === event.pointerId) end();
    });
  }
  button.addEventListener('keydown', (event) => {
    if (![' ', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    if (!event.repeat) start({ key: event.key });
  });
  window.addEventListener('keyup', (event) => {
    if (gesture?.key === event.key) {
      event.preventDefault();
      end();
    }
  });
  button.addEventListener('blur', () => { if (gesture?.key) end(); });
  window.addEventListener('blur', () => end());
  window.addEventListener('pagehide', () => end());
  document.addEventListener('visibilitychange', () => { if (document.hidden) end(); });
  document.addEventListener('lastra-key-confirmation-open', () => end());
  document.getElementById('panel').addEventListener('lastra:close-view', () => end());
  document.addEventListener('lastra-microphone-selection', ({ detail }) => {
    microphone = detail;
    if (gesture && (gesture.inputId !== detail?.id || (!gesture.started && detail?.muted !== true))) end();
    render();
  });
  api.onProfile(() => end());
  api.onPushToTalk((next) => {
    state = next;
    if (gesture?.token === next.token && !['opening', 'talking'].includes(next.phase)) end(false);
    if (next.phase === 'fault' || next.phase === 'idle') notice(next.message);
    render();
  });
  render();
})();
