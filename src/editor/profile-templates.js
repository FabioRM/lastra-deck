'use strict';

{
  const { element: node } = window.LastraDom;
  const { FIXED_EDITING_KEYS, projectEditingPage, duplicateEditingKey } = window.LastraEditingKeys;
  const { catalog } = window.LastraWidgetLayout;
  const { prepareTemplatePages } = window.LastraProfileTemplateImport;

  function renderBoard(canvas, profile, page, portrait) {
    const grid = page.grid ?? profile.grid;
    const slots = page.keys.map((key) => duplicateEditingKey(key, FIXED_EDITING_KEYS) ? null : key);
    const projection = projectEditingPage(grid, slots, page.widgets, portrait);
    canvas.style.setProperty('--template-cols', projection.cols);
    canvas.style.setProperty('--template-rows', projection.rows);
    const tile = ({ column, row, cols, rows }, label, kind) => {
      const element = node('span', 'template-tile', label);
      if (label) element.title = label;
      if (kind) element.dataset.kind = kind;
      element.style.gridColumn = `${column + 1} / span ${cols}`;
      element.style.gridRow = `${row + 1} / span ${rows}`;
      return element;
    };
    const [first] = projection.sheets;
    canvas.replaceChildren(
      ...first.keys.map(({ index, layout }) => tile(layout, slots[index]?.label, slots[index] ? 'key' : undefined)),
      ...first.widgets.map(({ type, layout }) => tile(layout, catalog[type].name, 'widget')),
      ...projection.editing.map(({ layout }, index) => tile(layout, FIXED_EDITING_KEYS[index].label, 'fixed')),
    );
    canvas.setAttribute('aria-label', [page.name, ...[...canvas.children].map((cell) => cell.textContent).filter(Boolean)].join(' · '));
    return projection.sheets.length;
  }

  function createTemplatePicker(dialog, read, copy) {
    const select = (id) => dialog.querySelector('#template-' + id);
    const choices = select('choices');
    const detail = select('detail');
    const name = select('name');
    const description = select('description');
    const requirements = select('requirements');
    const pageChoice = select('page');
    const orientation = select('orientation');
    const canvas = select('board');
    const counts = select('counts');
    const message = select('message');
    const add = select('add');
    let templates = [];
    let owner;
    let current;
    let plan;
    let version = 0;

    function renderPreview() {
      const profile = current?.profile;
      const page = profile?.pages.find(({ id }) => id === pageChoice.value);
      if (!page) return;
      const screens = renderBoard(canvas, profile, page, orientation.value === 'portrait');
      const keyCount = page.keys.filter(Boolean).length;
      const widgetCount = page.widgets.length;
      const details = [`${keyCount} ${keyCount === 1 ? 'key' : 'keys'}`, `${widgetCount} ${widgetCount === 1 ? 'widget' : 'widgets'}`];
      if (screens > 1) details.push(`Screen 1 of ${screens}`);
      counts.textContent = details.join(' · ');
    }

    function choose(template) {
      current = template;
      name.textContent = template.name;
      description.textContent = template.description;
      requirements.replaceChildren(...template.requirements.map((text) => node('li', '', text)));
      pageChoice.replaceChildren(...template.profile.pages.map((page) => {
        const option = node('option', '', page.name);
        option.value = page.id;
        return option;
      }));
      detail.hidden = false;
      for (const control of choices.children) control.setAttribute('aria-pressed', String(control.dataset.id === template.id));
      try {
        plan = prepareTemplatePages(owner, template.profile);
        const kept = [...new Set(plan.collisions.map(({ value }) => value))];
        message.textContent = kept.length ? `Your existing pages keep these app matches: ${kept.join(', ')}.` : '';
      } catch (error) {
        plan = undefined;
        message.textContent = error.message;
      }
      const count = template.profile.pages.length;
      add.textContent = `Add ${count} ${count === 1 ? 'page' : 'pages'} to draft`;
      add.disabled = !plan;
      renderPreview();
    }

    async function open(draft) {
      if (dialog.open) return;
      owner = draft;
      const session = ++version;
      detail.hidden = true;
      add.disabled = true;
      choices.replaceChildren();
      message.textContent = window.LastraI18n.t('Loading templates…');
      dialog.showModal();
      try {
        templates = await read(draft.shortcutLanguage);
        if (!dialog.open || session !== version) return;
        choices.replaceChildren(...templates.map((template) => {
          const option = node('button', '', template.name);
          option.type = 'button';
          option.dataset.id = template.id;
          option.addEventListener('click', () => choose(template));
          return option;
        }));
        choose(templates[0]);
        choices.firstElementChild?.focus();
      } catch {
        if (dialog.open && session === version) message.textContent = window.LastraI18n.t('Templates could not be loaded.');
      }
    }

    select('close').addEventListener('click', () => dialog.close());
    pageChoice.addEventListener('change', renderPreview);
    orientation.addEventListener('change', renderPreview);
    add.addEventListener('click', () => {
      if (plan && copy(owner, plan)) dialog.close();
    });
    dialog.addEventListener('close', () => {
      version++;
      templates = [];
      owner = current = plan = undefined;
      document.getElementById('profile-templates-open')?.focus();
    });
    return open;
  }

  window.createTemplatePicker = createTemplatePicker;
}
