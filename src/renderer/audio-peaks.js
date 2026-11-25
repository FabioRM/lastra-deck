'use strict';

{
  const floor = -60;

  function peakReading(value, muted) {
    if (muted === true) return { state: 'muted', label: 'Muted', fill: 0 };
    if (!Number.isFinite(value)) return { state: 'unavailable', label: 'Unavailable', fill: 0 };
    const db = value > 0 ? Math.max(floor, Math.min(0, Math.round(20 * Math.log10(value)))) : floor;
    return {
      db, fill: (db - floor) / -floor * 100,
      state: db === floor ? 'silent' : 'active',
      label: db === floor ? 'No signal' : (db < 0 ? '−' + Math.abs(db) : db) + ' dBFS',
    };
  }

  if (typeof module === 'object') module.exports = { peakReading };
  else mount();

  function mount() {
    const api = window.lastra ?? window.LastraDeckPreview?.panels;
    if (!api?.readAudioPeaks) return;
    const { t } = window.LastraI18n;
    const interval = 125;
    const dashboard = document.getElementById('dashboard-signal');
    if (dashboard) dashboard.hidden = false;
    const meters = [...document.querySelectorAll('[data-peak]')].map((meter) => ({
      device: meter.dataset.peak, meter, value: meter.parentElement.querySelector('[data-peak-value]'),
    }));
    let audio;
    let selectedInputId = null;
    let timer;
    let reading = false;
    let closed = false;

    function render({ meter, value }, peak, muted, source) {
      const reading = peakReading(peak, muted);
      const fill = reading.fill + '%';
      if (meter.style.getPropertyValue('--peak') !== fill) meter.style.setProperty('--peak', fill);
      if (meter.dataset.signalState !== reading.state) meter.dataset.signalState = reading.state;
      const level = reading.db === undefined ? null : String(reading.db);
      if (meter.getAttribute('aria-valuenow') !== level) {
        if (level === null) meter.removeAttribute('aria-valuenow');
        else meter.setAttribute('aria-valuenow', level);
      }
      const signal = t(reading.label);
      const label = source ? signal + ' · ' + source : signal;
      if (meter.getAttribute('aria-valuetext') !== label) meter.setAttribute('aria-valuetext', label);
      if (meter.parentElement.title !== label) meter.parentElement.title = label;
      if (value.textContent !== signal) value.textContent = signal;
    }

    function microphoneMuted(inputs, id) {
      return id === null ? inputs.length > 0 && inputs.every(({ muted }) => muted === true)
        : inputs.find((input) => input.id === id)?.muted;
    }

    function visibleMeters() {
      return closed || document.hidden ? [] : meters.filter(({ meter }) => meter.checkVisibility({ visibilityProperty: true }));
    }

    function canPoll() {
      return (audio?.output || audio?.microphone || audio?.inputs?.length) && visibleMeters().length > 0;
    }

    async function poll() {
      timer = undefined;
      if (!canPoll()) return;
      reading = true;
      const inputId = selectedInputId;
      let latest;
      try {
        latest = await api.readAudioPeaks(inputId);
      } catch {}
      if (inputId === selectedInputId) {
        const output = audio.output;
        const inputs = audio.inputs ?? [];
        const source = inputs.find((input) => input.id === latest?.microphoneId);
        const selected = inputs.find((input) => input.id === inputId);
        const muted = microphoneMuted(inputs, inputId);
        for (const entry of visibleMeters()) {
          if (entry.device === 'output') render(entry, output?.id === latest?.outputId ? latest?.output : null, output?.muted);
          else render(entry, source?.muted === false ? latest?.microphone : null, muted, selected?.name ?? source?.name);
        }
      }
      reading = false;
      if (canPoll()) timer = setTimeout(poll, interval);
    }

    function updatePolling() {
      if (!canPoll()) {
        clearTimeout(timer);
        timer = undefined;
      } else if (!reading && timer === undefined) {
        void poll();
      }
    }

    api.onAudio((state) => {
      audio = state;
      const inputs = state.inputs ?? [];
      const muted = microphoneMuted(inputs, selectedInputId);
      for (const entry of meters) {
        if (entry.device === 'output' && (!state.output || state.output.muted === true)) render(entry, null, state.output?.muted);
        if (entry.device === 'microphone' && (!inputs.length || muted === true)) render(entry, null, muted);
      }
      updatePolling();
    });
    document.addEventListener('lastra-microphone-meter-choice', ({ detail }) => {
      if (selectedInputId === detail) return;
      selectedInputId = detail;
      for (const entry of meters) if (entry.device === 'microphone') render(entry, null);
    });
    for (const meter of meters) render(meter, null);
    const observer = new MutationObserver(updatePolling);
    for (const id of ['panel', 'dashboard-panel', 'quick-tools']) {
      observer.observe(document.getElementById(id), { attributeFilter: ['hidden'] });
    }
    observer.observe(document.getElementById('stage'), { attributeFilter: ['inert', 'data-desktop-revealed'] });
    observer.observe(document.getElementById('windows-session-cover'), { attributeFilter: ['open'] });
    document.addEventListener('visibilitychange', updatePolling);
    window.addEventListener('pagehide', () => {
      closed = true;
      clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', updatePolling);
    }, { once: true });
  }
}
