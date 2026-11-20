'use strict';

(() => {
  const api = window.lastra;
  if (!api?.readDisplayBacklight) return;

  const byId = (id) => document.getElementById(id);
  const dialog = byId('deck-backlight');
  const refresh = byId('deck-backlight-refresh');
  const apply = byId('deck-backlight-apply');
  const slider = byId('deck-backlight-level');
  const percent = byId('deck-backlight-percent');
  const status = byId('deck-backlight-status');
  const controls = byId('deck-backlight-controls');
  const viewOnly = () => byId('stage').hasAttribute('data-view-only');
  let reading;
  let busy = false;
  let generation = 0;

  function sync() {
    const disabled = busy || !reading || viewOnly();
    controls.hidden = !reading;
    percent.textContent = `${slider.value}%`;
    slider.disabled = disabled;
    refresh.disabled = busy;
    apply.disabled = disabled || Number(slider.value) === reading.percent;
  }

  async function run(send, pending, success) {
    const request = ++generation;
    busy = true;
    status.textContent = pending;
    sync();
    let result;
    try {
      result = await send();
    } catch {
      result = { message: 'Could not communicate with display brightness.' };
    }
    if (request !== generation || !dialog.open) return;
    busy = false;
    reading = result.ok ? result : undefined;
    if (reading) slider.value = reading.percent;
    status.textContent = reading ? success : result.message;
    sync();
  }

  function read() {
    void run(() => api.readDisplayBacklight(), 'Reading current brightness…', '');
  }

  byId('deck-backlight-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    generation++;
    busy = false;
    reading = undefined;
  });
  refresh.addEventListener('click', read);
  slider.addEventListener('input', sync);
  apply.addEventListener('click', () => {
    if (apply.disabled) return;
    const { token } = reading;
    const level = Number(slider.value);
    void run(() => api.setDisplayBacklight(token, level), 'Applying display brightness…', 'Display brightness verified.');
  });
  document.addEventListener('lastra:view-only', () => {
    if (dialog.open) dialog.close();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && dialog.open) dialog.close(); });

  window.LastraDisplayBacklight = {
    open() {
      if (document.hidden || document.querySelector('dialog[open]')) return;
      reading = undefined;
      dialog.showModal();
      read();
    },
  };
})();
