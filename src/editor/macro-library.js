'use strict';

window.createLastraMacroLibrary = function createLastraMacroLibrary(dialog) {
  const { createMacroResolver, MAX_MACROS } = window.LastraParameterizedMacros;
  const picker = dialog.querySelector('[name="macro"]');
  const source = dialog.querySelector('textarea');
  const status = dialog.querySelector('[role="status"]');
  const create = dialog.querySelector('[data-macro-new]');
  const apply = dialog.querySelector('[data-macro-apply]');
  const remove = dialog.querySelector('[data-macro-remove]');
  let profile;
  let save;
  let selected;

  function containsCall(value, id) {
    return value && typeof value === 'object' && ((value.type === 'macro' && value.macro === id)
      || Object.values(value).some((item) => containsCall(item, id)));
  }

  function choose(id) {
    selected = id;
    picker.value = id ?? '';
    status.textContent = '';
    const definition = (profile.macros ?? []).find((entry) => entry.id === id);
    source.value = definition ? JSON.stringify(definition, null, 2) : '';
    source.disabled = apply.disabled = remove.disabled = !definition;
  }

  function render(id) {
    const definitions = profile.macros ?? [];
    picker.replaceChildren(new Option(window.LastraI18n.t('Choose a saved macro'), ''), ...definitions.map((macro) => new Option(macro.label, macro.id)));
    picker.disabled = !definitions.length;
    create.disabled = definitions.length >= MAX_MACROS;
    choose(id);
  }

  function commit(definitions, nextId) {
    const resolver = createMacroResolver(definitions);
    for (const definition of resolver.definitions) resolver.sample(definition);
    save(resolver.definitions);
    render(nextId);
    status.textContent = nextId ? window.LastraI18n.t('Macro updated in the draft.') : window.LastraI18n.t('Macro removed from the draft.');
  }

  picker.addEventListener('change', () => choose(picker.value || undefined));
  create.addEventListener('click', () => {
    choose(undefined);
    let suffix = 1;
    while (profile.macros?.some((item) => item.id === `macro-${suffix}`)) suffix++;
    source.value = JSON.stringify({ id: `macro-${suffix}`, label: 'New macro',
      parameters: [{ id: 'pause', type: 'integer', default: 250 }], action: { type: 'delay', ms: { parameter: 'pause' } } }, null, 2);
    source.disabled = apply.disabled = false;
    source.focus();
  });
  apply.addEventListener('click', () => {
    try {
      const definition = JSON.parse(source.value);
      if (selected && selected !== definition?.id) throw new Error(window.LastraI18n.t('Keep the existing ID when editing a shared macro.'));
      const current = profile.macros ?? [];
      const definitions = selected ? current.map((item) => item.id === selected ? definition : item) : [...current, definition];
      commit(definitions, definition?.id);
    } catch (error) {
      status.textContent = error instanceof SyntaxError ? window.LastraI18n.t('Enter a valid JSON definition.') : error.message;
    }
  });
  remove.addEventListener('click', () => {
    if (!selected) return;
    try {
      const { macros = [], ...placements } = profile;
      const remaining = macros.filter(({ id }) => id !== selected);
      if (containsCall(placements, selected) || containsCall(remaining, selected)) throw new Error('Remove the calls to this macro before deleting it.');
      commit(remaining);
    } catch (error) { status.textContent = error.message; }
  });
  dialog.querySelector('[data-macro-close]').addEventListener('click', () => dialog.close());

  return (draft, update) => {
    profile = draft;
    save = update;
    render(profile.macros?.[0]?.id);
    dialog.showModal();
    (picker.disabled ? create : picker).focus();
  };
};
