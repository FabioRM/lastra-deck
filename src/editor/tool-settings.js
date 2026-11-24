'use strict';

{
  const api = window.lastraEditor;
  const panel = document.getElementById('tool-settings');
  const form = document.getElementById('tool-choices-form');
  const input = form.elements.choices;
  const status = document.getElementById('tool-choices-status');
  let loaded = false;
  let loading = false;
  panel.addEventListener('settings:open', async () => {
    if (loaded || loading) return;
    loading = true;
    try {
      input.value = (await api.getToolChoices()).join('\n');
      loaded = true;
      form.inert = false;
      status.textContent = '';
    } catch {
      status.textContent = window.LastraI18n.t('Could not load the pick list.');
    } finally {
      loading = false;
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const choices = input.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const focused = document.activeElement;
    form.inert = true;
    try {
      const result = await api.setToolChoices(choices);
      if (!result.ok) throw new Error(result.message);
      input.value = result.choices.join('\n');
      status.textContent = window.LastraI18n.t('Pick list saved.');
    } catch (error) {
      status.textContent = error.message || window.LastraI18n.t('Could not save the pick list.');
    } finally {
      form.inert = false;
      if (document.activeElement === document.body) focused?.focus({ preventScroll: true });
    }
  });
}
