'use strict';

{
  const { element, button } = window.LastraDom;
  const { t } = window.LastraI18n;
  const { SHORTCUT_LAYOUT_LIMITS: limits } = window.LastraShortcutLayouts;

  function createShortcutPageEditor(root, { read, write, updated, normalizeChord }) {
    const body = root.querySelector('[data-shortcut-pages]');
    const status = root.querySelector('[role="status"]');
    const selected = new Map();
    let pack;

    const layout = () => read(pack.id) ?? { enabled: true };
    const current = (pages) => pages?.find(({ id }) => id === selected.get(pack.id)) ?? pages?.[0];
    const newPage = (name, shortcuts = []) => ({ id: crypto.randomUUID(), name, shortcuts });
    const initialPages = () => [newPage(t('App shortcuts'), pack.defaultShortcutIds.map((id) => ({ id })))];
    const check = (label, checked, handler, className = 'check') => {
      const control = Object.assign(element('input'), { type: 'checkbox', checked });
      control.addEventListener('change', () => handler(control.checked));
      const row = element('label', className);
      row.append(control, document.createTextNode(label));
      return row;
    };

    function save(next, focus, redraw = true) {
      try {
        write(pack.id, next);
        status.textContent = '';
        if (redraw) {
          render(pack, focus);
          updated();
        }
        return true;
      } catch (error) {
        render(pack, focus);
        status.textContent = error.message;
        return false;
      }
    }

    function edit(transform, focus) {
      const next = structuredClone(layout());
      transform(current(next.pages), next.pages);
      save(next, focus);
    }

    function shift(items, index, offset) {
      const [item] = items.splice(index, 1);
      items.splice(index + offset, 0, item);
    }

    function action(label, handler, options = {}) {
      const control = button(label, handler, { className: 'quiet', ...options });
      if (options.focus) control.dataset.shortcutFocus = options.focus;
      return control;
    }

    function render(nextPack, focus) {
      if (pack !== nextPack) status.textContent = '';
      pack = nextPack;
      root.hidden = !pack?.defaultShortcutIds;
      if (root.hidden) {
        body.replaceChildren();
        return;
      }
      const { enabled, pages } = layout();
      const automatic = check(t('Show automatic pages for this app'), enabled, (checked) => {
        save({ ...layout(), enabled: checked }, 'enabled');
      });
      automatic.querySelector('input').dataset.shortcutFocus = 'enabled';
      const tools = element('div', 'shortcut-page-actions');
      body.replaceChildren(automatic, tools);
      if (!pages) {
        tools.append(action(t('Customize pages'), () => save({ enabled, pages: initialPages() }, 'selector')));
        toggleHint('Add shortcuts from the catalog below.');
      } else {
        const page = current(pages);
        const index = pages.indexOf(page);
        const picker = element('select');
        picker.setAttribute('aria-label', t('Shortcut page'));
        picker.dataset.shortcutFocus = 'selector';
        for (const item of pages) picker.append(new Option(item.name, item.id));
        picker.value = page.id;
        picker.addEventListener('change', () => {
          selected.set(pack.id, picker.value);
          render(pack, 'selector');
          updated();
        });
        const name = Object.assign(element('input'), { value: page.name, maxLength: 40 });
        name.setAttribute('aria-label', t('Shortcut page name'));
        name.dataset.shortcutFocus = 'name';
        name.addEventListener('change', () => {
          const value = name.value.trim();
          const next = structuredClone(layout());
          const item = current(next.pages);
          if (!value || value === item.name) { name.value = item.name; return; }
          item.name = value;
          if (save(next, 'name', false)) name.value = picker.selectedOptions[0].textContent = value;
        });
        function addPage() {
          const item = newPage(t('Shortcut page {number}', { number: pages.length + 1 }));
          selected.set(pack.id, item.id);
          edit((_page, draftPages) => draftPages.push(item), 'name');
        }
        tools.append(picker, name,
          action(t('Add page'), addPage, { disabled: pages.length >= limits.pages }),
          action('↑', () => edit((_page, draftPages) => shift(draftPages, index, -1), 'selector'),
            { disabled: !index, label: t('Move page earlier') }),
          action('↓', () => edit((_page, draftPages) => shift(draftPages, index, 1), 'selector'),
            { disabled: index === pages.length - 1, label: t('Move page later') }),
          action(t('Delete page'), () => {
            selected.delete(pack.id);
            save({ enabled, pages: pages.filter(({ id }) => id !== page.id) }, 'selector');
          }, { disabled: pages.length === 1 }),
          action(t('Restore automatic pages'), () => save({ enabled }, 'enabled')));
        const list = element('ul', 'shortcut-page-keys');
        list.setAttribute('aria-label', t('Shortcuts on this page'));
        const keys = new Map(pack.keys.map((key) => [key.id, key]));
        page.shortcuts.forEach(({ id, hidden, custom }, index) => {
          const item = element('li');
          const key = keys.get(id);
          const label = custom?.label ?? key?.label ?? id;
          item.toggleAttribute('data-hidden-shortcut', Boolean(hidden));
          const title = element('span', 'shortcut-page-key-title', label);
          const chord = custom?.keys ?? key?.notation ?? key?.action?.keys;
          if (chord) title.append(element('code', '', chord));
          const hide = check(t('Hide'), Boolean(hidden), (checked) => {
            edit(({ shortcuts }) => { shortcuts[index].hidden = checked; }, 'hide:' + id);
          });
          const toggle = hide.querySelector('input');
          toggle.setAttribute('aria-label', t('Hide {name}', { name: label }));
          toggle.dataset.shortcutFocus = 'hide:' + id;
          item.append(title, hide,
            action('↑', () => edit(({ shortcuts }) => shift(shortcuts, index, -1), 'hide:' + id),
              { disabled: !index, label: t('Move {name} earlier', { name: label }) }),
            action('↓', () => edit(({ shortcuts }) => shift(shortcuts, index, 1), 'hide:' + id),
              { disabled: index === page.shortcuts.length - 1, label: t('Move {name} later', { name: label }) }),
            action(t('Remove'), () => edit(({ shortcuts }) => shortcuts.splice(index, 1), 'selector'),
              { label: t('Remove {name}', { name: label }) }));
          list.append(item);
        });
        if (list.childElementCount) body.append(list);
        else toggleHint('This page is empty. Add shortcuts from the catalog below.');
        body.append(customForm());
      }
      if (focus) [...body.querySelectorAll('[data-shortcut-focus]')]
        .find((control) => control.dataset.shortcutFocus === focus)?.focus({ preventScroll: true });
    }

    function toggleHint(message) { body.append(element('p', 'muted', t(message))); }

    function addStatus(keyId) {
      if (!pack?.defaultShortcutIds) return;
      const { pages } = layout();
      const duplicate = pages ? current(pages).shortcuts.some(({ id }) => id === keyId) : pack.defaultShortcutIds.includes(keyId);
      if (duplicate) return 'Already on this page';
      const count = pages ? pages.reduce((total, page) => total + page.shortcuts.length, 0) : pack.defaultShortcutIds.length;
      if (count >= limits.shortcuts) return 'This app shortcut layout is full.';
    }

    function add(keyId) {
      if (!pack?.defaultShortcutIds || addStatus(keyId)) return;
      const next = structuredClone(layout());
      next.pages ??= initialPages();
      current(next.pages).shortcuts.push({ id: keyId });
      root.open = true;
      save(next);
    }

    function customForm() {
      const form = element('form', 'shortcut-page-custom');
      const label = Object.assign(element('input'), { maxLength: 24, placeholder: t('Shortcut label') });
      label.setAttribute('aria-label', t('Shortcut label'));
      const chord = Object.assign(element('input'), { maxLength: 80, placeholder: 'Ctrl+Shift+F' });
      chord.setAttribute('aria-label', t('Shortcut keys'));
      form.append(label, chord, button(t('Add your shortcut'), () => { void addCustom(label.value, chord.value); }, { className: 'quiet' }));
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        void addCustom(label.value, chord.value);
      });
      return form;
    }

    async function addCustom(label, keys) {
      const name = label.trim();
      if (!/^\P{C}{1,24}$/u.test(name)) {
        status.textContent = t('Enter a shortcut name of up to 24 characters.');
        return;
      }
      let chord;
      try {
        chord = await normalizeChord(keys);
      } catch (error) {
        status.textContent = error.message;
        return;
      }
      const next = structuredClone(layout());
      next.pages ??= initialPages();
      current(next.pages).shortcuts.push({ id: 'custom-' + crypto.randomUUID(), custom: { label: name, icon: 'keyboard', keys: chord } });
      root.open = true;
      save(next);
    }

    return { render, add, addStatus };
  }

  window.createShortcutPageEditor = createShortcutPageEditor;
}
