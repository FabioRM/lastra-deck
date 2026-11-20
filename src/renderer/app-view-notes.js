'use strict';

{
  const { element, button } = window.LastraDom;

  function mount(container, read, dispatch) {
    const root = element('section', 'notes-view');
    const toolbar = element('div', 'notes-toolbar');
    const readPane = element('article', 'notes-card');
    const editPane = element('section', 'notes-form');
    const pager = element('div', 'notes-pager');
    const notice = element('p', 'app-view-secondary notes-message');
    notice.setAttribute('role', 'status');
    const keyboardPanel = element('div', 'notes-keyboard-panel');
    keyboardPanel.setAttribute('aria-label', 'Touch keyboard');
    const keyboard = element('div', 'notes-keyboard');
    const newline = button('New line', () => { if (keyboardTarget) applyKeyboard(keyboardTarget.value + '\n'); });
    keyboardPanel.append(keyboard, newline);
    keyboardPanel.hidden = true;
    const tabs = {};
    const actions = element('div', 'notes-toolbar-actions');
    const page = { notes: 0, lists: 0 };
    let collection = 'notes';
    let state;
    let draft;
    let keyboardTarget;
    let visible = false;
    let pending = false;
    let epoch = 0;

    function items() { return (draft ?? state?.document)?.[collection] ?? []; }
    function current() { return items()[page[collection]]; }
    const isNote = () => collection === 'notes';
    const type = () => isNote() ? 'note' : 'checklist';

    function showKeyboard(target) {
      keyboardTarget = target;
      keyboardPanel.hidden = !target;
      newline.hidden = target?.tagName !== 'TEXTAREA';
      if (target) target.closest('label').after(keyboardPanel);
    }

    function applyKeyboard(value) {
      if (!keyboardTarget?.isConnected || pending) return;
      if (value.length > keyboardTarget.maxLength) return;
      keyboardTarget.value = value;
      keyboardTarget.dispatchEvent(new Event('input'));
    }

    window.mountLastraTouchKeyboard(keyboard, { extended: true, extraLetters: 'àèéìòù',
      getValue: () => keyboardTarget?.value ?? '', setValue: applyKeyboard, done: () => showKeyboard(null) });

    function field(label, value, limit, change, multiline = false) {
      const wrapper = element('label', 'notes-field', label);
      const input = element(multiline ? 'textarea' : 'input', '');
      if (!multiline) input.type = 'text';
      input.value = value;
      input.maxLength = limit;
      input.autocomplete = 'off';
      input.inputMode = 'none';
      input.addEventListener('click', () => showKeyboard(input));
      input.addEventListener('input', () => change(input.value));
      wrapper.append(input);
      return wrapper;
    }

    function renderReading(entry) {
      if (!entry) {
        readPane.replaceChildren(element('p', 'app-view-secondary', isNote() ? 'No notes yet.' : 'No checklists yet.'));
        return;
      }
      const heading = element('h4', 'notes-title', entry.title);
      if (isNote()) {
        readPane.replaceChildren(heading, element('p', 'notes-text', entry.body));
        return;
      }
      const tasks = element('ul', 'notes-tasks');
      tasks.replaceChildren(...entry.items.map(({ label, done }) => {
        const row = element('li', '', '');
        row.dataset.done = String(done);
        const glyph = element('span', '', done ? '✓' : '○');
        glyph.setAttribute('role', 'img');
        glyph.setAttribute('aria-label', done ? 'Done' : 'Open');
        row.append(glyph, element('span', '', label));
        return row;
      }));
      const completed = entry.items.filter(({ done }) => done).length;
      readPane.replaceChildren(heading, element('p', 'app-view-secondary', `${completed} / ${entry.items.length} done`), tasks);
    }

    function renderEditor(entry) {
      if (!entry) {
        editPane.replaceChildren(element('p', 'app-view-secondary', `Add a ${type()} to get started.`));
        return;
      }
      const { limits } = state;
      const title = field('Title', entry.title, limits.title, (value) => { entry.title = value; });
      const remove = button(`Remove ${type()}`, () => {
        items().splice(page[collection], 1);
        render();
      });
      if (isNote()) {
        const body = field('Note', entry.body, limits.note, (value) => { entry.body = value; }, true);
        editPane.replaceChildren(title, body, remove);
        return;
      }
      const tasks = entry.items.map((task, index) => {
        const line = element('div', 'notes-task-edit');
        const title = field(`Task ${index + 1}`, task.label, limits.task, (value) => { task.label = value; });
        const done = button('Done', () => {
          task.done = !task.done;
          done.setAttribute('aria-pressed', String(task.done));
        });
        done.setAttribute('aria-label', `Task ${index + 1} done`);
        done.setAttribute('aria-pressed', String(task.done));
        const deleteTask = button('Remove task', () => {
          entry.items.splice(index, 1);
          render();
        });
        line.append(title, done, deleteTask);
        return line;
      });
      const add = button('Add task', () => {
        entry.items.push({ id: crypto.randomUUID(), label: '', done: false });
        render();
        editPane.querySelector('.notes-task-edit:last-of-type input')?.focus();
      });
      add.disabled = entry.items.length >= limits.items;
      editPane.replaceChildren(title, ...tasks, add, remove);
    }

    function render() {
      showKeyboard(null);
      const group = items();
      const total = group.length;
      page[collection] = Math.min(page[collection], Math.max(0, total - 1));
      for (const [name, tab] of Object.entries(tabs)) {
        tab.setAttribute('aria-pressed', String(name === collection));
        tab.disabled = pending;
      }
      previous.disabled = pending || page[collection] === 0;
      next.disabled = pending || page[collection] >= total - 1;
      position.textContent = `${page[collection] + 1} / ${total}`;
      pager.hidden = total <= 1;
      readPane.hidden = Boolean(draft) || state?.status !== 'ready';
      editPane.hidden = !draft;
      editPane.inert = pending;
      edit.hidden = Boolean(draft);
      edit.disabled = state?.status !== 'ready';
      edit.textContent = isNote() ? 'Edit notes' : 'Edit checklists';
      addEntry.hidden = save.hidden = cancel.hidden = !draft;
      addEntry.textContent = `New ${type()}`;
      addEntry.disabled = pending || total >= (state?.limits?.entries ?? 0);
      save.disabled = cancel.disabled = pending;
      if (draft) renderEditor(current());
      else if (state?.status === 'ready') renderReading(current());
    }

    async function saveDraft() {
      pending = true;
      render();
      try {
        const result = await dispatch({ action: 'save', revision: state.revision, document: draft });
        if (result?.snapshot) {
          state = result.snapshot;
          draft = undefined;
          notice.textContent = 'Saved locally.';
        }
      } finally {
        pending = false;
        render();
        if (!draft) edit.focus({ preventScroll: true });
      }
    }

    async function load() {
      const request = ++epoch;
      notice.textContent = 'Reading local notes…';
      try {
        const next = await read();
        if (!visible || request !== epoch) return;
        state = next;
        notice.textContent = next.error ?? '';
      } catch {
        if (!visible || request !== epoch) return;
        state = undefined;
        notice.textContent = 'The local notes could not be read.';
      }
      render();
    }

    for (const [id, label] of [['notes', 'Notes'], ['lists', 'Checklists']]) {
      tabs[id] = button(label, () => {
        collection = id;
        render();
      });
    }
    const edit = button('Edit notes', () => {
      draft = structuredClone(state.document);
      notice.textContent = '';
      render();
      (editPane.querySelector('input') ?? addEntry).focus({ preventScroll: true });
    });
    const addEntry = button('New note', () => {
      const id = crypto.randomUUID();
      items().push(isNote() ? { id, title: 'New note', body: '' } : { id, title: 'New checklist', items: [] });
      page[collection] = items().length - 1;
      render();
      editPane.querySelector('input')?.focus({ preventScroll: true });
    });
    const cancel = button('Cancel edits', () => {
      draft = undefined;
      notice.textContent = '';
      render();
      edit.focus({ preventScroll: true });
      if (visible) void load();
    });
    cancel.classList.add('notes-cancel');
    const save = button('Save changes', () => { if (!pending) void saveDraft(); });
    const previous = button('Previous', () => { page[collection]--; render(); });
    const next = button('Next', () => { page[collection]++; render(); });
    const position = element('span', 'app-view-secondary');
    actions.append(edit, addEntry, save, cancel);
    toolbar.append(tabs.notes, tabs.lists, actions);
    pager.append(previous, position, next);
    root.append(toolbar, notice, pager, readPane, editPane, keyboardPanel);
    container.append(root);
    render();

    function setVisible(active) {
      if (visible === active) return;
      visible = active;
      epoch++;
      if (active && !draft) void load();
      if (!active) showKeyboard(null);
    }
    return { setVisible, destroy: () => setVisible(false) };
  }

  window.LastraNotesView = { mount };
}
