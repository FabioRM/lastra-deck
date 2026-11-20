'use strict';

(() => {
  const api = window.lastra;
  const toggle = document.getElementById('microphone-mixer-toggle');
  if (!api?.onAudio || !toggle) return;

  const panel = document.getElementById('panel');
  const mixer = document.getElementById('microphone-mixer');
  const closeButton = document.getElementById('microphone-mixer-close');
  const status = document.getElementById('microphone-mixer-status');
  const options = document.getElementById('microphone-mixer-options');
  let snapshot;
  let selectedId;
  let shown;

  const inputs = () => snapshot?.inputs ?? [];
  const hasInput = (id) => inputs().some((input) => input.id === id);

  function setChoice(id, meterTarget = null) {
    document.dispatchEvent(new CustomEvent('lastra-microphone-meter-choice', { detail: meterTarget }));
    if (selectedId === id) return;
    selectedId = id;
    document.dispatchEvent(new CustomEvent('lastra-microphone-choice', { detail: id }));
  }

  function render() {
    if (mixer.hidden) return;
    const available = inputs();
    const caption = !snapshot ? 'Reading Windows microphones…' : available.length ? '' : 'No active Windows microphones.';
    if (status.textContent !== caption) status.textContent = caption;
    const choices = [{ id: null, name: 'All microphones' }, ...available.map(({ id, name }) => ({ id, name }))];
    const signature = JSON.stringify([selectedId, choices]);
    if (signature === shown) return;
    shown = signature;

    options.replaceChildren(...choices.map(({ id, name }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.setAttribute('aria-pressed', String(selectedId === id));
      button.addEventListener('click', () => {
        if (mixer.hidden || (id !== null && !hasInput(id))) return;
        setChoice(id, id);
        close();
      });
      return button;
    }));
  }

  function setOpen(open) {
    if (open === !mixer.hidden) return;
    if (open) panel.dispatchEvent(new Event('lastra:close-view'));
    mixer.hidden = !open;
    panel.classList.toggle('microphone-mixer-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      render();
      options.scrollTop = 0;
      closeButton.focus({ preventScroll: true });
    }
  }

  function close() {
    setOpen(false);
    toggle.focus({ preventScroll: true });
  }

  toggle.addEventListener('click', () => setOpen(mixer.hidden));
  closeButton.addEventListener('click', close);
  panel.addEventListener('lastra:close-view', () => setOpen(false));
  mixer.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  const unsubscribe = api.onAudio((state) => {
    snapshot = state;
    if (selectedId !== null && !hasInput(selectedId)) {
      const preferred = snapshot?.microphone?.id;
      setChoice(hasInput(preferred) ? preferred : inputs()[0]?.id ?? '');
    }
    render();
  });
  window.addEventListener('pagehide', () => {
    unsubscribe();
    setOpen(false);
  }, { once: true });
})();
