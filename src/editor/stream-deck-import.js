'use strict';

{
  const reasons = {
    navigation: 'Stream Deck page or folder navigation', 'external-action': 'Launch, file or link action',
    plugin: 'Plugin dependency', 'unsupported-action': 'Unsupported action', 'unmapped-key': 'Unmapped Windows key',
    'ambiguous-keyboard': 'Conflicting keyboard codes', 'multiple-chords': 'Multiple key combinations',
    'unmapped-position': 'Unmapped position', 'duplicate-position': 'Duplicate keypad position',
  };
  const maxPages = 16;
  const executable = /^[^\\/:*?"<>|\p{Cc}\p{Cf}]+\.exe$/iu;

  function fitPage(page, grid, app = '') {
    const keys = Array(grid.rows * grid.cols).fill(null);
    const overflow = [];
    let imported = 0;
    for (const key of page.keys) {
      if (key.column >= grid.cols || key.row >= grid.rows) {
        overflow.push(key);
      } else {
        const at = key.row * grid.cols + key.column;
        keys[at] = { id: `key-${key.column}-${key.row}`, label: key.label, category: 'app',
          action: { type: 'hotkey', keys: key.keys, ...(app ? { targetApps: [app] } : {}) } };
        imported++;
      }
    }
    return { page: { id: page.id, name: page.name, grid, apps: app ? [app] : [], keys, widgets: [] }, imported, overflow };
  }

  function reviewPlan(profile, draft, choices) {
    const { cols, rows, windowsSource, selection } = choices;
    const grid = { cols, rows };
    if (!Number.isInteger(cols) || cols < 1 || cols > 12 || !Number.isInteger(rows) || rows < 1 || rows > 6) {
      return { error: 'Choose 1–12 columns and 1–6 rows.', pages: [] };
    }
    const existingMatches = new Set(draft.pages.filter(({ windowTitle }) => !windowTitle)
      .flatMap(({ apps }) => (apps ?? []).map((app) => app.toLowerCase())));
    const pages = profile.pages.map((page) => {
      const { selected, match = '' } = selection.get(page.id) ?? {};
      const app = match.trim();
      const appError = app && (app.length > 100 || !executable.test(app));
      const collision = selected && app && !appError && existingMatches.has(app.toLowerCase());
      if (selected && app && !appError) existingMatches.add(app.toLowerCase());
      return { ...fitPage(page, grid, appError ? '' : app), selected, appError, collision };
    });
    const selected = pages.filter((page) => page.selected);
    let error = '';
    if (selected.some(({ appError }) => appError)) error = 'Enter a Windows executable name such as Code.exe.';
    else if (!selected.length || selected.some(({ imported }) => !imported)) error = 'Select pages with at least one key that fits the grid.';
    else if (draft.pages.length + selected.length > maxPages) error = `Select up to ${Math.max(0, maxPages - draft.pages.length)} pages for this draft.`;
    else if (!windowsSource) error = 'Confirm this profile was exported on Windows.';
    return { error, pages, bundle: { kind: 'stream-deck-pages', item: { grid, pages: selected.map(({ page }) => page) } } };
  }

  function node(tag, content = '', attributes = {}) {
    const element = document.createElement(tag);
    element.textContent = content;
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  }

  function disclosure(heading, rows) {
    if (!rows.length) return null;
    const details = node('details');
    details.append(node('summary', `${heading} (${rows.length})`));
    const list = node('ul');
    list.append(...rows.slice(0, 80).map((value) => node('li', value)));
    if (rows.length > 80) list.append(node('li', `${rows.length - 80} more`));
    details.append(list);
    return details;
  }

  function position(row) {
    return row.column === undefined ? '' : `Row ${row.row + 1}, column ${row.column + 1} · `;
  }

  function renderReview(container, profile, draft, onChange) {
    container.append(node('h3', profile.name), node('p', 'Review the keyboard shortcuts and add selected pages to the draft.'));
    const windows = node('input', '', { type: 'checkbox', 'data-stream-deck-windows': '' });
    const windowsLabel = node('label', '', { class: 'check' });
    windowsLabel.append(windows, document.createTextNode(' This profile was exported on Windows'));
    const gridRow = node('div', '', { class: 'row' });
    function gridInput(name, value, max) {
      const input = node('input', '', { type: 'number', min: 1, max, value, 'data-stream-deck-grid': name });
      const field = node('label', name, { class: 'field' });
      field.append(input);
      gridRow.append(field);
      return input;
    }
    const columns = gridInput('Columns', draft.grid.cols, 12);
    const rows = gridInput('Rows', draft.grid.rows, 6);
    container.append(windowsLabel, gridRow);
    const showDependencies = disclosure('Unsupported plugin dependencies', profile.dependencies);
    if (showDependencies) container.append(showDependencies);
    if (profile.omittedDependencies) container.append(node('p', `${profile.omittedDependencies} additional plugin dependencies.`));
    if (profile.ignoredEntries) container.append(node('p', `${profile.ignoredEntries} packaged resources omitted.`));
    if (profile.hasForegroundHint) container.append(node('p', 'Choose the foreground match for each page. The archive’s app match is skipped.'));
    let room = maxPages - draft.pages.length;
    const controls = profile.pages.map((page) => {
      const field = node('section', '', { 'data-stream-deck-page': page.id });
      const include = node('input', '', { type: 'checkbox', 'aria-label': `Add ${page.name}` });
      include.checked = room > 0 && fitPage(page, draft.grid).imported > 0;
      if (include.checked) room--;
      const title = node('label', '', { class: 'check' });
      title.append(include, document.createTextNode(' ' + page.name));
      const match = node('input', '', { type: 'text', maxlength: 100, placeholder: window.LastraI18n.t('Manual page'), spellcheck: 'false' });
      const matchLabel = node('label', 'Foreground executable', { class: 'field' });
      matchLabel.append(match);
      const results = node('div', '', { 'data-stream-deck-page-results': '' });
      field.append(title, matchLabel, results);
      container.append(field);
      const issues = disclosure('Unsupported and unmapped actions', page.issues.map((issue) =>
        [position(issue) + issue.label, reasons[issue.reason], issue.dependency].filter(Boolean).join(' · ')));
      if (issues) field.append(issues);
      if (page.ignoredControllers) field.append(node('p', `${page.ignoredControllers} non-keypad controller sections omitted.`));
      include.addEventListener('change', update);
      match.addEventListener('input', update);
      return { page, include, match, results };
    });
    columns.addEventListener('input', update);
    rows.addEventListener('input', update);
    windows.addEventListener('change', update);

    function read() {
      return reviewPlan(profile, draft, { cols: columns.valueAsNumber, rows: rows.valueAsNumber, windowsSource: windows.checked,
        selection: new Map(controls.map(({ page, include, match }) => [page.id, { selected: include.checked, match: match.value }])) });
    }
    function update() {
      const result = read();
      result.pages.forEach(({ imported, overflow, appError, collision }, index) => {
        const { page, match, results } = controls[index];
        match.setAttribute('aria-invalid', String(Boolean(appError)));
        results.replaceChildren(node('p', `${imported} keyboard shortcuts fit this grid.`));
        if (collision) results.append(node('p', 'This executable already switches to another page. Open this copy manually. Its keys keep the chosen target.'));
        const dropped = disclosure('Outside the grid', overflow.map((key) => `${position(key)}${key.label} · ${key.keys}`));
        if (dropped) results.append(dropped);
        const supported = disclosure('Keyboard shortcuts', page.keys.filter((key) => !overflow.includes(key))
          .map((key) => `${position(key)}${key.label} · ${key.keys}${key.layoutDependent ? ' · Windows keyboard layout may affect punctuation' : ''}`));
        if (supported) results.append(supported);
      });
      if (!result.pages.length) controls.forEach(({ results }) => results.replaceChildren());
      onChange(result);
    }
    update();
    return read;
  }

  if (typeof module === 'object') module.exports = { fitPage, reviewPlan };
  else window.LastraStreamDeckImport = { renderReview };
}
