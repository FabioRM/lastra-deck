'use strict';

{
  const reading = { label: 'Reading…', tone: 'loading', available: false };
  const unavailable = { label: 'Unavailable', tone: 'unavailable', available: false };
  const muted = { label: 'Muted', tone: 'muted', pressed: 'true', available: true };
  const unmuted = { label: 'Unmuted', tone: 'unmuted', pressed: 'false', available: true };
  const unknown = { label: 'Mute state unknown', tone: 'unknown', available: true };

  function dashboardAudioState(snapshot, device) {
    if (!snapshot) return reading;
    const endpoint = snapshot[device];
    if (!endpoint) return unavailable;
    if (device === 'output') return endpoint.muted === true ? muted : endpoint.muted === false ? unmuted : unknown;

    const inputs = snapshot.inputs ?? [];
    if (!inputs.length) return unavailable;
    const mutedCount = inputs.filter((input) => input.muted === true).length;
    const activeCount = inputs.filter((input) => input.muted === false).length;
    if (mutedCount === inputs.length) return muted;
    if (activeCount === inputs.length) return unmuted;
    if (!mutedCount && !activeCount) return unknown;

    const missing = inputs.length - mutedCount - activeCount;
    const count = `${mutedCount} of ${inputs.length} muted`;
    return {
      label: missing ? `${count} · ${missing} unknown` : count,
      tone: mutedCount ? 'mixed' : 'unknown',
      pressed: mutedCount && activeCount ? 'mixed' : undefined,
      available: true,
    };
  }

  function mount(api, root) {
    const { t } = window.LastraI18n;
    const feedback = root.querySelector('#dashboard-audio-status');
    const controls = Array.from(root.querySelectorAll('[data-dashboard-audio]'), (button) => ({
      button, device: button.dataset.dashboardAudio,
      state: root.querySelector(`#${button.getAttribute('aria-describedby')}`),
      label: button.dataset.dashboardAudio === 'output' ? 'Speakers' : 'Windows microphones',
      pending: false, error: '',
    }));
    const speaker = controls.find(({ device }) => device === 'output');
    const picker = speaker && window.LastraSpeakerPress && window.createSpeakerOutputPicker && api.getAudioOutputs && api.setAudioOutput
      ? window.createSpeakerOutputPicker(api, root, speaker.button) : null;
    let snapshot;

    function render() {
      for (const control of controls) {
        const view = dashboardAudioState(snapshot, control.device);
        const canPick = picker && control === speaker;
        control.button.disabled = control.pending || (!view.available && !canPick);
        control.button.dataset.state = view.tone;
        if (control.pending) control.button.setAttribute('aria-busy', 'true');
        else control.button.removeAttribute('aria-busy');
        if (view.pressed === undefined) control.button.removeAttribute('aria-pressed');
        else control.button.setAttribute('aria-pressed', view.pressed);
        const label = t(control.pending ? 'Changing mute…' : view.label);
        const hint = canPick ? ' · ' + t('Hold to choose an output') : '';
        control.button.title = `${t(control.label)} · ${label}${hint}`;
        const description = label + hint;
        if (control.state.textContent !== description) control.state.textContent = description;
      }
      const message = controls.filter((control) => control.error).map((control) => `${t(control.label)} · ${t(control.error)}`).join(' · ');
      if (feedback.textContent !== message) feedback.textContent = message;
    }

    for (const control of controls) {
      async function toggleMute() {
        if (control.pending || !dashboardAudioState(snapshot, control.device).available) return;
        control.pending = true;
        control.error = '';
        render();
        try {
          // With no level or input ID, Windows receives the same group toggle as the deck.
          const result = await api.changeAudio(control.device);
          if (!result?.ok) control.error = result?.message || 'Could not change mute.';
        } catch (error) {
          control.error = error?.message || 'Could not change mute.';
        } finally {
          control.pending = false;
          render();
        }
      }
      if (control === speaker && picker) {
        control.button.setAttribute('aria-keyshortcuts', 'ArrowDown Shift+F10 ContextMenu');
        window.LastraSpeakerPress.bind(control.button, {
          onLongPress: picker.open,
          onShortPress: () => { picker.close(); void toggleMute(); },
        });
      } else {
        control.button.addEventListener('click', toggleMute);
      }
    }

    const unsubscribe = api.onAudio((value) => {
      snapshot = value;
      render();
    });
    document.addEventListener('lastra:view-only', ({ detail }) => { if (detail) picker?.close(); });
    document.addEventListener('lastra-language', render);
    window.addEventListener('pagehide', unsubscribe, { once: true });
    render();
    return {
      openOutputPicker() {
        if (!picker || speaker.pending || document.getElementById('stage').hasAttribute('data-view-only')) return false;
        picker.open();
        return true;
      },
      closeOutputPicker: () => picker?.close(),
    };
  }

  if (typeof module === 'object') module.exports = { dashboardAudioState };
  else {
    const api = window.lastra ?? window.LastraDeckPreview?.panels;
    if (api?.onAudio && api.changeAudio) window.LastraDashboardAudio = mount(api, document.getElementById('deck-audio-controls'));
  }
}
