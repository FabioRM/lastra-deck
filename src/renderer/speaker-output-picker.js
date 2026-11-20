'use strict';

window.createSpeakerOutputPicker = (api, root, trigger) => {
  const picker = root.querySelector('#speaker-output-picker');
  const done = root.querySelector('#speaker-output-close');
  const status = root.querySelector('#speaker-output-status');
  const options = root.querySelector('#speaker-output-devices');
  const devices = new Map();
  const stateLabels = { disconnected: 'Disconnected', disabled: 'Disabled', unavailable: 'Unavailable' };
  let revision = 0;
  let pending = false;
  let timer;
  let selectionError = '';

  function showStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle('error', error);
  }

  function close(restoreFocus = false) {
    if (picker.hidden) return;
    revision++;
    clearTimeout(timer);
    picker.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  async function select(id, button) {
    if (picker.hidden || pending || button.disabled) return;
    if (button.getAttribute('aria-pressed') === 'true') {
      close(true);
      return;
    }
    const request = revision;
    clearTimeout(timer);
    pending = true;
    options.inert = true;
    showStatus(window.LastraI18n.t('Switching output…'));
    let error = '';
    try {
      const result = await api.setAudioOutput(id);
      if (!result?.ok) error = result?.message || 'Could not switch the audio output.';
    } catch (err) {
      error = err.message || 'Could not switch the audio output.';
    } finally {
      pending = false;
      options.inert = false;
    }
    if (picker.hidden) return;
    if (!error && request === revision) close(true);
    else {
      selectionError = request === revision ? error : '';
      refresh();
    }
  }

  function render({ devices: next, defaultId }) {
    const labels = next.map(({ id, name, state }) => {
      if (!devices.has(id)) {
        const button = document.createElement('button');
        const title = document.createElement('span');
        const caption = document.createElement('span');
        button.type = 'button';
        caption.className = 'speaker-output-device-state';
        button.append(title, caption);
        button.addEventListener('click', () => { void select(id, button); });
        devices.set(id, { button, title, caption });
      }
      const { button, title, caption } = devices.get(id);
      const label = id === defaultId ? 'Default' : stateLabels[state] ?? '';
      if (title.textContent !== name) title.textContent = name;
      if (caption.textContent !== label) caption.textContent = label;
      button.disabled = state !== 'active';
      button.setAttribute('aria-pressed', String(id === defaultId));
      return button;
    });
    const keep = new Set(next.map(({ id }) => id));
    for (const [id, { button }] of devices) {
      if (!keep.has(id)) {
        button.remove();
        devices.delete(id);
      }
    }
    labels.forEach((button, index) => {
      if (options.children[index] !== button) options.insertBefore(button, options.children[index] ?? null);
    });
    showStatus(selectionError || (next.some(({ state }) => state === 'active') ? '' : 'No active Windows audio outputs.'), Boolean(selectionError));
  }

  async function load(request) {
    try {
      const result = await api.getAudioOutputs();
      if (request !== revision || pending) return;
      if (!result?.ok) throw new Error(result?.message || window.LastraI18n.t('Could not read audio outputs.'));
      options.inert = false;
      render(result);
    } catch (err) {
      if (request !== revision || pending) return;
      options.inert = true;
      showStatus(selectionError || err.message, true);
    }
    timer = setTimeout(() => void load(request), 1_000);
  }

  function refresh() {
    clearTimeout(timer);
    void load(++revision);
  }

  function open() {
    if (!picker.hidden) return;
    selectionError = '';
    devices.clear();
    options.inert = true;
    options.replaceChildren();
    showStatus(pending ? window.LastraI18n.t('Switching output…') : window.LastraI18n.t('Reading audio outputs…'));
    picker.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    done.focus({ preventScroll: true });
    if (!pending) refresh();
  }

  done.addEventListener('click', () => close(true));
  document.addEventListener('pointerdown', ({ target }) => {
    if (!picker.hidden && !picker.contains(target) && !trigger.contains(target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || picker.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close(true);
  });
  document.getElementById('dashboard-switch').addEventListener('click', () => close());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) close();
  });
  window.addEventListener('pagehide', () => close(), { once: true });
  return { open, close };
};
