'use strict';

{
  const { t } = window.LastraI18n;
  const root = document.getElementById('activity-profile');
  const toggle = document.getElementById('activity-profile-toggle');
  const panel = document.getElementById('activity-profile-options');
  const options = document.getElementById('activity-profile-choices');
  const error = document.getElementById('activity-profile-error');
  const buttons = new Map();
  let active;
  let busy = false;

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }

  function render(profile) {
    root.hidden = !profile || typeof window.lastra?.selectActivity !== 'function';
    if (root.hidden) {
      setOpen(false);
      return;
    }
    active = profile.active;
    const label = t(profile.choices.find(({ id }) => id === active).label);
    toggle.textContent = label;
    toggle.setAttribute('aria-label', t('Activity profile: {label}. Switch profile', { label }));
    for (const { id, label } of profile.choices) {
      if (!buttons.has(id)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.addEventListener('click', () => void select(id));
        options.append(button);
        buttons.set(id, button);
      }
      buttons.get(id).textContent = t(label);
      buttons.get(id).setAttribute('aria-pressed', String(id === active));
    }
  }

  async function select(id) {
    if (busy) return;
    error.textContent = '';
    if (id === active) {
      setOpen(false);
      toggle.focus();
      return;
    }
    busy = true;
    options.inert = true;
    try {
      render(await window.lastra.selectActivity(id));
      setOpen(false);
      window.LastraDeckViews.active?.dispatchEvent(new Event('lastra:close-view'));
      toggle.focus();
    } catch (failure) {
      error.textContent = failure.message;
    } finally {
      busy = false;
      options.inert = false;
    }
  }

  toggle.addEventListener('click', () => {
    if (busy) return;
    error.textContent = '';
    setOpen(panel.hidden);
    if (!panel.hidden) buttons.get(active)?.focus();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!root.contains(event.target)) setOpen(false);
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.stopPropagation();
      setOpen(false);
      toggle.focus();
    }
  });
  window.LastraActivityProfile = { render };
}
