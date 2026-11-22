'use strict';

{
  const api = window.lastraEditor;
  const { t } = window.LastraI18n;
  const root = document.getElementById('deck-behavior');
  if (!root || !api.deckBehavior) {
    /* Older preloads keep the native menus. */
  } else {
    let state = null;
    let busy = false;

    const option = (name, value, label, checked) =>
      `<label><input type="radio" name="${name}" value="${escapeAttr(value)}"${checked ? ' checked' : ''}>${escapeText(t(label))}</label>`;

    function escapeText(value) {
      return String(value).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
    }
    function escapeAttr(value) {
      return escapeText(value).replace(/"/g, '&quot;');
    }

    function checks(items, empty, type) {
      if (!items.length) return `<p class="muted">${escapeText(t(empty))}</p>`;
      return `<div class="deck-checks">${items.map((item) =>
        `<label class="check"><input type="checkbox" data-command="${type}" data-id="${escapeAttr(item.id)}"${item.on ? ' checked' : ''}>${escapeText(item.name)}</label>`).join('')}</div>`;
    }

    function render() {
      const current = state;
      const activities = Object.entries(current.activities).map(([id, label]) =>
        option('deck-activity', id, label, id === current.activity)).join('');
      const displays = [`<option value="">${escapeText(t('Detect automatically'))}</option>`,
        ...current.displays.map((display) => `<option value="${escapeAttr(display.id)}"${display.id === current.display ? ' selected' : ''}>${escapeText(display.label)}</option>`)].join('');
      const returns = Object.entries(current.contextReturns).map(([mode, label]) =>
        `<option value="${escapeAttr(mode)}"${mode === current.contextReturn ? ' selected' : ''}>${escapeText(t(label))}</option>`).join('');
      const calendars = Object.entries(current.calendars).map(([id, label]) =>
        `<option value="${escapeAttr(id)}"${id === current.calendar ? ' selected' : ''}>${escapeText(t(label))}</option>`).join('');
      root.innerHTML = `
        <section class="deck-settings-card" aria-labelledby="deck-behavior-heading">
          <h3 id="deck-behavior-heading">${escapeText(t('Deck behavior'))}</h3>
          <fieldset class="deck-choice"${current.activityLocked ? ' disabled' : ''}>
            <legend>${escapeText(t('Activity profile'))}</legend>
            ${activities}
          </fieldset>
          <label class="check"><input type="checkbox" data-command="viewOnly"${current.viewOnly ? ' checked' : ''}>${escapeText(t('View-only mode'))}</label>
          <div class="deck-settings-fields">
            <label class="field">${escapeText(t('After an app page'))}<select data-command="contextReturn">${returns}</select></label>
            <label class="field">${escapeText(t('Dashboard calendar'))}<select data-command="calendar">${calendars}</select></label>
            <label class="field">${escapeText(t('Deck display'))}<select data-command="display"${current.windowed ? ' disabled' : ''}>${displays}</select></label>
          </div>
          <label class="check"><input type="checkbox" data-command="revealGesture"${current.revealGesture ? ' checked' : ''}>${escapeText(t('Swipe up from the bottom of Deck Keys to reveal desktop'))}</label>
          <div class="deck-settings-fields">
            ${current.revealed
              ? `<button type="button" data-command="show">${escapeText(t('Restore deck'))}</button>`
              : `<button type="button" data-command="reveal">${escapeText(t('Reveal desktop'))}</button><button type="button" data-command="show">${escapeText(t('Show deck'))}</button>`}
          </div>
          <p id="deck-behavior-status" class="muted" role="status"></p>
        </section>
        <section class="deck-settings-card" aria-labelledby="deck-organization-heading">
          <h3 id="deck-organization-heading">${escapeText(t('Deck organization'))}</h3>
          <h4>${escapeText(t('Favorite pages'))}</h4>
          ${checks(current.pages.map((page) => ({ ...page, on: page.favorite })), 'No saved pages.', 'favorite')}
          <h4>${escapeText(t('Pinned app views'))}</h4>
          ${checks(current.appViews.map((view) => ({ ...view, on: view.pinned })), 'No app views.', 'pinView')}
          <label class="check"><input type="checkbox" data-command="follow"${current.followApps ? ' checked' : ''}>${escapeText(t('Follow foreground apps in Apps'))}</label>
          <h4>${escapeText(t('Pinned mixer apps'))}</h4>
          ${checks(current.mixer.map((app) => ({ ...app, on: app.pinned })), 'No mixer apps.', 'mixer')}
          <div class="deck-settings-fields"><button type="button" data-command="editViews">${escapeText(t('Edit custom app views'))}</button></div>
        </section>`;
    }

    async function apply(command) {
      if (busy) return;
      busy = true;
      const status = document.getElementById('deck-behavior-status');
      if (status) status.textContent = '';
      try {
        state = await api.setDeckBehavior(command);
        render();
      } catch (error) {
        if (status) status.textContent = error.message || t('Could not update these deck options.');
        render();
        const next = document.getElementById('deck-behavior-status');
        if (next) next.textContent = error.message || t('Could not update these deck options.');
      } finally {
        busy = false;
      }
    }

    root.addEventListener('change', (event) => {
      const control = event.target;
      if (control.name === 'deck-activity') {
        void apply({ type: 'activity', id: control.value });
        return;
      }
      const command = control.dataset?.command;
      if (!command) return;
      if (control.type === 'checkbox' && control.dataset.id) void apply({ type: command, id: control.dataset.id, enabled: control.checked });
      else if (control.type === 'checkbox') void apply({ type: command, enabled: control.checked });
      else if (control.tagName === 'SELECT') void apply({ type: command, id: control.value, mode: control.value });
    });
    root.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-command]');
      if (!button) return;
      void apply({ type: button.dataset.command });
    });

    api.deckBehavior().then((snapshot) => {
      state = snapshot;
      render();
    }).catch((error) => {
      root.textContent = error.message || t('Could not update these deck options.');
    });
  }
}
