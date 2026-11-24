'use strict';

{
  const api = window.lastraEditor;
  const { t } = window.LastraI18n;
  const root = document.getElementById('deck-behavior');
  const display = document.getElementById('deck-display-settings');
  const calendar = document.getElementById('deck-calendar-settings');
  const containers = [root, display, calendar];
  if (root && api.deckBehavior) {
    let state = null;
    let busy = false;
    let request = 0;

    const status = '<p class="settings-status" role="status"></p>';
    const translated = (value) => escapeText(t(value));

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
      const focused = document.activeElement;
      const focusedContainer = containers.find((container) => container.contains(focused));
      const activities = Object.entries(current.activities).map(([id, label]) =>
        option('deck-activity', id, label, id === current.activity)).join('');
      const missingDisplay = current.display && !current.displays.some((item) => item.id === current.display);
      const displays = [`<option value="">${translated('Detect automatically')}</option>`,
        ...(missingDisplay ? [`<option value="${escapeAttr(current.display)}" selected disabled>${translated('Saved screen is disconnected')}</option>`] : []),
        ...current.displays.map((item) => `<option value="${escapeAttr(item.id)}"${item.id === current.display ? ' selected' : ''}>${escapeText(item.label)}</option>`)].join('');
      const returns = Object.entries(current.contextReturns).map(([mode, label]) =>
        `<option value="${escapeAttr(mode)}"${mode === current.contextReturn ? ' selected' : ''}>${escapeText(t(label))}</option>`).join('');
      const calendars = Object.entries(current.calendars).map(([id, label]) =>
        `<option value="${escapeAttr(id)}"${id === current.calendar ? ' selected' : ''}>${escapeText(t(label))}</option>`).join('');
      display.innerHTML = `<section class="deck-settings-card settings-option" aria-labelledby="deck-display-heading">
        <div><h3 id="deck-display-heading" tabindex="-1"><label for="deck-display-choice">${translated('Deck display')}</label></h3>
          <p class="muted">${translated(current.windowed ? 'Screen selection is unavailable in windowed mode.'
            : missingDisplay ? 'Lastra uses automatic detection while the saved screen is disconnected.'
              : 'Lastra remembers the selected screen across restarts.')}</p></div>
        <select id="deck-display-choice" data-command="display"${current.windowed ? ' disabled' : ''}>${displays}</select>
        ${status}</section>`;
      calendar.innerHTML = `<section class="deck-settings-card settings-option" aria-labelledby="deck-calendar-heading">
        <div><h3 id="deck-calendar-heading" tabindex="-1"><label for="deck-calendar-choice">${translated('Dashboard calendar')}</label></h3>
          <p class="muted">${translated('Open this service when you tap the calendar on the deck.')}</p></div>
        <select id="deck-calendar-choice" data-command="calendar">${calendars}</select>
        ${status}</section>`;
      root.innerHTML = `
        <section class="deck-settings-card" aria-labelledby="deck-activity-heading">
          <h3 id="deck-activity-heading" tabindex="-1">${translated('Activity profile')}</h3>
          <p class="muted">${translated(current.activityLocked ? 'This session uses a profile chosen at launch.'
            : 'Each activity keeps its own pages and favorites.')}</p>
          <fieldset class="deck-choice" aria-labelledby="deck-activity-heading"${current.activityLocked ? ' disabled' : ''}>${activities}</fieldset>
          ${status}
        </section>
        <section class="deck-settings-card" aria-labelledby="deck-navigation-heading">
          <h3 id="deck-navigation-heading" tabindex="-1">${translated('Navigation and input')}</h3>
          <label class="check"><input type="checkbox" data-command="viewOnly"${current.viewOnly ? ' checked' : ''}>${translated('View-only mode')}</label>
          <p class="muted">${translated('Pause shortcut and macro actions while keeping the deck visible.')}</p>
          <div class="deck-settings-fields">
            <label class="field">${escapeText(t('After an app page'))}<select data-command="contextReturn">${returns}</select></label>
          </div>
          <label class="check"><input type="checkbox" data-command="revealGesture"${current.revealGesture ? ' checked' : ''}>${escapeText(t('Swipe up from the bottom of Deck Keys to reveal desktop'))}</label>
          <div class="deck-settings-fields">
            ${current.revealed
              ? `<button type="button" data-command="show">${escapeText(t('Restore deck'))}</button>`
              : `<button type="button" data-command="reveal">${escapeText(t('Reveal desktop'))}</button><button type="button" data-command="show">${escapeText(t('Show deck'))}</button>`}
          </div>
          ${status}
        </section>
        <section class="deck-settings-card" aria-labelledby="deck-organization-heading">
          <h3 id="deck-organization-heading" tabindex="-1">${translated('Deck organization')}</h3>
          <h4>${escapeText(t('Favorite pages'))}</h4>
          ${checks(current.pages.map((page) => ({ ...page, on: page.favorite })), 'No saved pages.', 'favorite')}
          <h4>${escapeText(t('Pinned app views'))}</h4>
          ${checks(current.appViews.map((view) => ({ ...view, on: view.pinned })), 'No app views.', 'pinView')}
          <label class="check"><input type="checkbox" data-command="follow"${current.followApps ? ' checked' : ''}>${escapeText(t('Follow foreground apps in Apps'))}</label>
          <h4>${escapeText(t('Pinned mixer apps'))}</h4>
          ${checks(current.mixer.map((app) => ({ ...app, on: app.pinned })), 'No mixer apps.', 'mixer')}
          <div class="deck-settings-fields"><button type="button" data-command="editViews">${escapeText(t('Edit custom app views'))}</button></div>
          ${status}
        </section>`;
      if (focusedContainer) {
        const replacement = focused.id ? document.getElementById(focused.id)
          : [...focusedContainer.querySelectorAll('input, select, button')].find((candidate) => identified(focused, candidate));
        replacement?.focus({ preventScroll: true });
      }
    }

    function identified(control, candidate) {
      if (control.name === 'deck-activity') return candidate.name === control.name && candidate.value === control.value;
      const command = control.dataset.command;
      return (candidate.dataset.command === command || (command === 'reveal' && candidate.dataset.command === 'show'))
        && candidate.dataset.id === control.dataset.id;
    }

    async function apply(command, control) {
      if (busy) return;
      busy = true;
      request++;
      const card = control.closest('.deck-settings-card');
      const headingId = card.getAttribute('aria-labelledby');
      const restoreFocus = document.activeElement === control;
      for (const container of containers) container.inert = true;
      let message = '';
      let failed = false;
      try {
        state = await api.setDeckBehavior(command);
        message = ['editViews', 'show', 'reveal'].includes(command.type) ? '' : t('Deck settings saved.');
        if (command.type === 'display' && state.displaySaved === false) {
          message = t('Screen changed for this session. The preference could not be saved.');
          failed = true;
        }
      } catch (error) {
        message = t(error.message || 'Could not update these deck options.');
        failed = true;
        state = await api.deckBehavior().catch(() => state);
      } finally {
        render();
        for (const container of containers) container.inert = false;
        const next = document.getElementById(headingId).closest('.deck-settings-card');
        const feedback = next.querySelector('.settings-status');
        feedback.classList.toggle('error', failed);
        feedback.textContent = message;
        if (restoreFocus && document.activeElement === document.body && !next.closest('[hidden]')) {
          const replacement = [...next.querySelectorAll('input, select, button')].find((candidate) => identified(control, candidate));
          replacement?.focus({ preventScroll: true });
        }
        busy = false;
      }
    }

    function change(event) {
      const control = event.target;
      if (control.name === 'deck-activity') {
        void apply({ type: 'activity', id: control.value }, control);
        return;
      }
      const command = control.dataset?.command;
      if (!command) return;
      if (control.type === 'checkbox') void apply({ type: command, id: control.dataset.id, enabled: control.checked }, control);
      else if (control.tagName === 'SELECT') void apply({ type: command, id: control.value, mode: control.value }, control);
    }
    for (const container of containers) container.addEventListener('change', change);
    root.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-command]');
      if (!button) return;
      void apply({ type: button.dataset.command }, button);
    });

    async function refresh() {
      if (busy) return;
      const current = ++request;
      try {
        const snapshot = await api.deckBehavior();
        if (current !== request || JSON.stringify(snapshot) === JSON.stringify(state)) return;
        state = snapshot;
        render();
      } catch {
        if (state || current !== request) return;
        for (const container of containers) container.textContent = t('Could not read the deck options.');
      }
    }

    for (const container of containers) container.closest('[data-settings-panel]').addEventListener('settings:open', refresh);
    document.addEventListener('lastra-language', () => { if (state && !busy) render(); });
    void refresh();
  }
}
