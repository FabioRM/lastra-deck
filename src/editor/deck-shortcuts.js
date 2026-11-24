'use strict';

{
  const { element, button } = window.LastraDom;
  const { t } = window.LastraI18n;
  const api = window.lastraEditor;
  const panel = document.getElementById('deck-shortcut-settings');
  const rows = document.getElementById('deck-shortcut-rows');
  const status = document.getElementById('deck-shortcut-status');
  const controls = new Map();
  let loaded;
  let loading = false;

  function captureShortcut(input, record, feedback) {
    function stop() {
      input.readOnly = false;
      record.setAttribute('aria-pressed', 'false');
    }
    record.setAttribute('aria-pressed', 'false');
    record.addEventListener('click', () => {
      input.readOnly = true;
      record.setAttribute('aria-pressed', 'true');
      feedback.classList.remove('error');
      feedback.textContent = t('Press a shortcut, or Esc to cancel.');
      input.focus();
      input.select();
    });
    input.addEventListener('blur', () => {
      if (input.readOnly) feedback.textContent = '';
      stop();
    });
    input.addEventListener('keydown', (event) => {
      if (!input.readOnly || event.key === 'Tab') return;
      event.preventDefault();
      if (event.key === 'Escape') {
        feedback.textContent = '';
        stop();
        return;
      }
      const key = event.key === ' ' ? 'Space' : event.key.replace(/^Arrow/, '');
      const modifiers = [[event.ctrlKey, 'Ctrl'], [event.altKey, 'Alt'], [event.shiftKey, 'Shift'], [event.metaKey, 'Super']]
        .filter(([held]) => held).map(([, label]) => label);
      const functionKey = /^F(?:[1-9]|1\d|2[0-4])$/.test(key);
      if (!functionKey && (!modifiers.length || !/^(?:[a-z0-9]|Up|Down|Left|Right|PageUp|PageDown|Home|End|Insert|Delete|Space)$/i.test(key))) return;
      input.value = [...modifiers, key.length === 1 ? key.toUpperCase() : key].join('+');
      feedback.textContent = t('Shortcut captured. Select Apply to save.');
      stop();
    });
  }

  function field(label, input) {
    const root = element('label', 'field', label);
    root.append(input);
    return root;
  }

  function updateStatuses(settings) {
    for (const row of settings.rows) {
      const message = row.status.startsWith('Also assigned to ')
        ? t('Also assigned to {command}', { command: t(row.status.slice('Also assigned to '.length)) }) : t(row.status);
      const text = row.activity && row.activity !== settings.activity
        ? [message, t('Assigned to a page in a different activity')].join(' · ') : message;
      const state = controls.get(row.command).state;
      state.textContent = text;
      state.dataset.state = row.status === 'Active' ? 'active' : !row.chord ? 'none' : 'attention';
    }
  }

  function render(settings) {
    const previous = new Map(controls);
    controls.clear();
    rows.replaceChildren(...settings.rows.map((row) => {
      const { command, label } = row;
      const form = element('form', 'deck-shortcut-row');
      const chord = element('input', '');
      const previousControl = previous.get(command);
      chord.value = previousControl && previousControl.chord.value !== previousControl.saved ? previousControl.chord.value : row.chord;
      chord.maxLength = 64;
      chord.autocomplete = 'off';
      chord.spellcheck = false;
      form.append(field(t(label), chord));
      let target;
      let savedTarget;
      if (command === 'view' || command === 'page') {
        target = element('select', '');
        const options = command === 'view' ? Object.entries(settings.views) : settings.pages.map(({ id, name }) => [id, name]);
        target.append(new Option(t(command === 'page' ? 'Choose a page' : 'Choose a view'), ''),
          ...options.map(([value, name]) => new Option(command === 'view' ? t(name) : name, value)));
        savedTarget = options.some(([value]) => value === row.target)
          && (command === 'view' || row.activity === settings.activity) ? row.target : '';
        const draftTarget = previousControl?.target?.value;
        target.value = previousControl && draftTarget !== previousControl.savedTarget && loaded?.activity === settings.activity
          && [...target.options].some(({ value }) => value === draftTarget) ? draftTarget : savedTarget;
        form.append(field(t(command === 'page' ? 'Saved page' : 'View'), target));
      }
      const state = element('output', 'muted deck-shortcut-state');
      state.setAttribute('aria-label', t('Status for {command}', { command: t(label) }));
      const feedback = element('p', 'settings-status');
      feedback.setAttribute('role', 'status');
      const record = button(t('Record'), undefined, { className: 'quiet', label: t('Record shortcut for {command}', { command: t(label) }) });
      captureShortcut(chord, record, feedback);
      const apply = button(t('Apply'), undefined, { label: t('Apply shortcut for {command}', { command: t(label) }) });
      apply.type = 'submit';
      const control = { state, chord, target, saved: row.chord, savedTarget };
      controls.set(command, control);
      const messages = element('div', 'deck-shortcut-messages');
      messages.append(state, feedback);
      form.append(record, apply, messages);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const focus = document.activeElement;
        rows.inert = true;
        feedback.textContent = '';
        feedback.classList.remove('error');
        try {
          const reply = await api.setDeckShortcut(command, { chord: chord.value, target: target?.value });
          if (!reply.ok) throw new Error(reply.message);
          control.saved = chord.value = reply.settings.rows.find((entry) => entry.command === command).chord;
          control.savedTarget = target?.value;
          loaded = reply.settings;
          updateStatuses(reply.settings);
          feedback.textContent = t('Shortcut saved.');
        } catch (error) {
          feedback.textContent = t(error.message || 'Could not save the deck shortcut.');
          feedback.classList.add('error');
        } finally {
          rows.inert = false;
          if (document.activeElement === document.body) focus?.focus({ preventScroll: true });
        }
      });
      return form;
    }));
    updateStatuses(settings);
    loaded = settings;
  }

  panel.addEventListener('settings:open', async () => {
    if (loading || rows.inert) return;
    loading = true;
    try {
      const settings = await api.getDeckShortcuts();
      if (!loaded || JSON.stringify(loaded) !== JSON.stringify(settings)) render(settings);
      status.textContent = '';
    } catch {
      status.textContent = t('Could not read global deck shortcuts.');
      status.classList.add('error');
    } finally {
      loading = false;
    }
  });
  document.addEventListener('lastra-language', () => { if (loaded && !rows.inert) render(loaded); });
}
