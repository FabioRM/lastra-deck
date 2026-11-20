'use strict';

{
  const { element, button } = window.LastraDom;
  const api = window.lastraEditor;
  const details = document.getElementById('deck-shortcut-settings');
  const rows = document.getElementById('deck-shortcut-rows');
  const status = document.getElementById('deck-shortcut-status');
  const controls = new Map();

  function field(label, input) {
    const root = element('label', 'field', label);
    root.append(input);
    return root;
  }

  function updateStatuses(settings) {
    for (const row of settings.rows) {
      const text = row.activity && row.activity !== settings.activity
        ? [row.status, 'Assigned to a page in a different activity'].join(' · ') : row.status;
      controls.get(row.command).state.textContent = text;
    }
  }

  function render(settings) {
    controls.clear();
    rows.replaceChildren(...settings.rows.map((row) => {
      const { command, label } = row;
      const form = element('form', 'deck-shortcut-row');
      const chord = element('input', '');
      chord.value = row.chord;
      chord.maxLength = 64;
      chord.autocomplete = 'off';
      chord.spellcheck = false;
      form.append(field(label, chord));
      let target;
      if (command === 'view' || command === 'page') {
        target = element('select', '');
        const options = command === 'view' ? Object.entries(settings.views) : settings.pages.map(({ id, name }) => [id, name]);
        target.append(new Option(command === 'page' ? window.LastraI18n.t('Choose a page') : window.LastraI18n.t('Choose a view'), ''),
          ...options.map(([value, name]) => new Option(name, value)));
        target.value = options.some(([value]) => value === row.target)
          && (command === 'view' || row.activity === settings.activity) ? row.target : '';
        form.append(field(command === 'page' ? window.LastraI18n.t('Saved page') : 'View', target));
      }
      const state = element('output', 'muted deck-shortcut-state');
      state.setAttribute('aria-label', label + ' status');
      const apply = button(window.LastraI18n.t('Apply'), undefined, { label: 'Apply ' + label.toLowerCase() });
      apply.type = 'submit';
      controls.set(command, { state });
      form.append(apply, state);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const focus = document.activeElement;
        rows.inert = true;
        status.textContent = '';
        try {
          const reply = await api.setDeckShortcut(command, { chord: chord.value, target: target?.value });
          if (!reply.ok) throw new Error(reply.message);
          chord.value = reply.settings.rows.find((entry) => entry.command === command).chord;
          updateStatuses(reply.settings);
        } catch (error) {
          status.textContent = error.message || window.LastraI18n.t('Could not save the deck shortcut.');
        } finally {
          rows.inert = false;
          focus?.focus();
        }
      });
      return form;
    }));
    updateStatuses(settings);
  }

  details.addEventListener('toggle', async () => {
    if (!details.open) return;
    try {
      render(await api.getDeckShortcuts());
      status.textContent = '';
    } catch {
      status.textContent = window.LastraI18n.t('Could not read global deck shortcuts.');
    }
  });
}
