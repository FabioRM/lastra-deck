'use strict';

{
  const { element, button } = window.LastraDom;
  const { snippetDraft, FIELD_LIMIT } = window.LastraSnippets;
  const KINDS = { all: 'All', prompt: 'Prompts', reply: 'Replies', text: 'Text' };
  const KIND_LABELS = { prompt: 'Prompt', reply: 'Reply', text: 'Text' };

  function mount(container, dispatch, { title = 'Snippets', editLabel = 'Edit snippets', filterKinds = false,
    showHeading = true, onReload } = {}) {
    const section = element('section', 'snippet-picker');
    const header = element('div', 'snippet-toolbar');
    const search = element('input', 'snippet-search');
    search.type = 'search';
    search.inputMode = 'none';
    search.maxLength = 80;
    search.placeholder = 'Search ' + title.toLowerCase();
    search.setAttribute('aria-label', search.placeholder);
    const keyboard = element('div', 'snippet-keyboard');
    keyboard.setAttribute('aria-label', 'Touch keyboard');
    keyboard.hidden = true;
    const keyboardToggle = button('Touch keyboard', () => {
      if (keyboard.hidden || input !== search) showKeyboard(search);
      else showKeyboard(null);
    });
    keyboardToggle.className = 'snippet-search-toggle';
    keyboardToggle.setAttribute('aria-expanded', 'false');
    const searchRow = element('div', 'snippet-toolbar');
    const entries = element('div', 'snippet-results');
    const fields = element('div', 'snippet-fields');
    const editRow = element('div', 'snippet-edit');
    const draft = element('pre', 'snippet-draft');
    draft.setAttribute('aria-label', 'Draft preview');
    const status = element('p', 'app-view-secondary');
    status.setAttribute('role', 'status');
    status.hidden = true;
    const copy = button('Copy to clipboard', copyDraft);
    editRow.hidden = true;
    const filters = element('div', 'snippet-toolbar snippet-kinds');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', 'Snippet type');

    if (showHeading) header.append(element('h4', '', title));
    header.append(button(editLabel, () => dispatch({ action: 'edit-snippets' })));
    if (onReload) {
      const reload = button('Reload snippets', async () => {
        reload.disabled = true;
        try { await onReload(); }
        finally { reload.disabled = false; }
      });
      reload.className = 'snippet-reload';
      header.append(reload);
    }
    searchRow.append(search, keyboardToggle);
    editRow.append(element('h5', '', 'Draft preview'), fields, draft, copy);
    section.append(header, searchRow, ...(filterKinds ? [filters] : []), keyboard, entries, editRow, status);
    container.append(section);
    let snippets = [];
    let input = null;
    let current = null;
    let issue = null;
    let copying = false;
    let kind = 'all';
    const controls = new Map();
    if (filterKinds) for (const [id, label] of Object.entries(KINDS)) {
      const filter = button(label, () => {
        kind = id;
        if (current && kind !== 'all' && kind !== current.kind) choose(null);
        for (const child of filters.children) child.setAttribute('aria-pressed', String(child === filter));
        renderEntries();
      });
      filter.setAttribute('aria-pressed', String(id === kind));
      filters.append(filter);
    }

    function setStatus(message) {
      status.textContent = message;
      status.hidden = !message;
    }

    function showKeyboard(target) {
      input = target;
      keyboard.hidden = !target;
      keyboardToggle.setAttribute('aria-expanded', String(target === search));
      if (target === search) searchRow.after(keyboard);
      else if (target) fields.after(keyboard);
    }

    function values() {
      return Object.fromEntries([...controls].map(([name, control]) => [name, control.value]));
    }

    function renderDraft() {
      if (!current) return;
      const next = snippetDraft(current.template, values());
      draft.textContent = next.text;
      copy.disabled = copying || next.missing.length > 0;
    }

    function choose(entry) {
      if (entry && entry.id === current?.id && entry.revision === current.revision) return;
      showKeyboard(null);
      current = entry;
      controls.clear();
      editRow.hidden = !entry;
      fields.replaceChildren();
      draft.textContent = '';
      if (!entry) return;
      for (const name of entry.fields) {
        const control = element('input', '');
        control.type = 'text';
        control.inputMode = 'none';
        control.maxLength = FIELD_LIMIT;
        const label = element('label', '', name);
        controls.set(name, control);
        control.addEventListener('click', () => showKeyboard(control));
        control.addEventListener('input', () => { renderDraft(); setStatus(''); });
        label.append(control);
        fields.append(label);
      }
      renderDraft();
    }

    function renderEntries() {
      const terms = search.value.toLowerCase().trim().split(/\s+/);
      const matches = snippets.filter((entry) => (kind === 'all' || entry.kind === kind)
        && terms.every((term) => (entry.name + ' ' + entry.template).toLowerCase().includes(term)));
      entries.replaceChildren(...matches.map((entry) => {
        const item = button(filterKinds ? '' : entry.name, () => {
          choose(entry);
          setStatus('');
          for (const sibling of entries.children) sibling.setAttribute('aria-pressed', String(sibling === item));
        });
        if (filterKinds) item.append(element('strong', '', entry.name), element('span', 'app-view-secondary', KIND_LABELS[entry.kind]));
        item.setAttribute('aria-pressed', String(current?.id === entry.id));
        return item;
      }));
      setStatus(issue || (!snippets.length ? 'Add an entry using ' + editLabel + '.' : !matches.length ? 'No matching entries.' : ''));
    }

    async function copyDraft() {
      const selected = current;
      if (!selected || copy.disabled) return;
      const reviewedText = draft.textContent;
      copying = true;
      renderDraft();
      try {
        const result = await dispatch({ action: 'copy-snippet', id: selected.id, revision: selected.revision, values: values() });
        if (result && current === selected && draft.textContent === reviewedText) setStatus('Copied to clipboard.');
      } finally {
        copying = false;
        renderDraft();
      }
    }

    search.addEventListener('click', () => showKeyboard(search));
    search.addEventListener('input', renderEntries);
    window.mountLastraTouchKeyboard(keyboard, { extended: true,
      getValue: () => input?.value ?? '',
      setValue(value) {
        if (!input) return;
        input.value = value.slice(0, input.maxLength);
        input.dispatchEvent(new Event('input'));
      },
      done: () => showKeyboard(null),
    });

    return {
      update(next) {
        snippets = next.snippets;
        issue = next.message;
        choose(snippets.find((entry) => entry.id === current?.id && (kind === 'all' || entry.kind === kind)) ?? null);
        renderEntries();
      },
      hide() { showKeyboard(null); },
    };
  }

  window.LastraSnippetPicker = { mount };
}
