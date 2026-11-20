'use strict';

{
  const { element, button } = window.LastraDom;
  const { LIMIT, PARTS, ICONS, METRICS, DEFAULT_COMPOSITION, normalizeComposition,
    compositionIcons, compositionMetrics } = window.LastraWidgetComposition;
  const { findPosition, cells } = window.LastraWidgetLayout;

  function field(label, input) {
    const wrapper = element('label', 'field', label);
    wrapper.append(input);
    return wrapper;
  }

  function number(label, value, maximum, update) {
    const input = element('input', '');
    input.type = 'number';
    input.min = '1';
    input.max = maximum;
    input.value = value;
    input.required = true;
    input.addEventListener('input', () => update(input.valueAsNumber));
    return field(label, input);
  }

  function choice(options, value) {
    const input = element('select', '');
    for (const [key, name] of Object.entries(options)) {
      const option = element('option', '', name);
      option.value = key;
      input.append(option);
    }
    input.value = value;
    return input;
  }

  function createCompositionEditor(existing, { compact, readIcon, readSensors }) {
    const data = structuredClone(existing ?? DEFAULT_COMPOSITION);
    const root = element('div', 'composition-editor');
    const sample = element('div', 'composition-editor-sample');
    const parts = element('div', 'composition-editor-parts');
    const status = element('p', 'widget-editor-status');
    status.setAttribute('role', 'status');
    const dependencies = element('p', 'muted');
    dependencies.setAttribute('role', 'status');
    const icons = {};
    const requests = new Set();
    let live;

    function draw() {
      let configuration;
      try {
        configuration = normalizeComposition(data);
      } catch (error) {
        status.textContent = error.message;
        sample.replaceChildren();
        return;
      }
      status.textContent = '';
      const missing = compositionMetrics(configuration).filter((metric) => !Number.isFinite(live?.[metric]));
      dependencies.textContent = missing.length
        ? live ? `Unavailable readings on this PC: ${missing.map((metric) => METRICS[metric]).join(', ')}.` : window.LastraI18n.t('Checking sensor availability…')
        : '';
      const preview = window.LastraCompositionCard.createCompositionCard(configuration, icons);
      preview.root.classList.add('widget-editor-preview');
      preview.root.classList.toggle('widget-editor-bar', compact);
      const now = Date.now();
      const fixtures = { sampledAt: now, hardwareAt: now, hardwareSource: 'preview', cpu: 0.42, ram: 0.63, gpu: 0.77, cpuTemp: 56, gpuTemp: 72 };
      fixtures.history = Object.fromEntries(compositionMetrics(configuration).map((metric) =>
        [metric, [0.66, 0.77, 0.72, 0.88, 1].map((fraction, index) => [now - (4 - index) * 1_000, fixtures[metric] * fraction])]));
      preview.render(fixtures);
      sample.replaceChildren(preview.root);
      for (const name of compositionIcons(configuration)) {
        if (requests.has(name)) continue;
        requests.add(name);
        Promise.resolve(readIcon(name)).then((asset) => {
          if (typeof asset !== 'string' || !root.isConnected) return;
          icons[name] = asset;
          draw();
        }).catch(() => {});
      }
    }

    function renderParts() {
      parts.replaceChildren(...data.parts.map((part) => {
        const section = element('fieldset', 'composition-part-editor');
        section.append(element('legend', '', PARTS[part.type]));
        let input;
        if (part.type === 'text') {
          input = element('textarea', '');
          input.maxLength = 100;
          input.value = part.text;
          input.required = true;
          input.addEventListener('input', () => { part.text = input.value; draw(); });
          section.append(field('Text', input));
        } else {
          const property = part.type === 'icon' ? 'icon' : 'metric';
          input = choice(property === 'icon' ? ICONS : METRICS, part[property]);
          input.addEventListener('change', () => { part[property] = input.value; draw(); });
          section.append(field(property === 'icon' ? 'Icon' : 'Sensor', input));
        }
        const placement = element('div', 'widget-placement');
        for (const [key, label, offset] of [['column', 'Column', 1], ['row', 'Row', 1], ['cols', 'Width', 0], ['rows', 'Height', 0]]) {
          placement.append(number(label, part.layout[key] + offset, LIMIT, (value) => { part.layout[key] = value - offset; draw(); }));
        }
        section.append(placement, button(window.LastraI18n.t('Remove part'), () => {
          data.parts = data.parts.filter(({ id }) => id !== part.id);
          renderParts();
          draw();
          add.focus();
        }, { className: 'danger' }));
        return section;
      }));
    }

    const name = element('input', '');
    name.value = data.name;
    name.maxLength = 40;
    name.required = true;
    name.addEventListener('input', () => { data.name = name.value; draw(); });
    const dimensions = element('div', 'widget-placement');
    dimensions.append(number('Inner columns', data.grid.cols, LIMIT, (value) => { data.grid.cols = value; draw(); }),
      number('Inner rows', data.grid.rows, LIMIT, (value) => { data.grid.rows = value; draw(); }));
    const type = choice(PARTS, 'text');
    const add = button(window.LastraI18n.t('Add part'), () => {
      try {
        const { grid, parts: currentParts } = normalizeComposition(data);
        const used = new Set(currentParts.flatMap(({ layout }) => cells(layout, grid.cols)));
        const layout = findPosition(grid, used, { cols: 1, rows: 1 });
        if (!layout) throw new Error('Expand the inner grid or free a cell to add a part.');
        const part = type.value === 'text' ? { text: 'Label' } : type.value === 'icon' ? { icon: 'activity' } : { metric: 'cpu' };
        data.parts.push({ id: crypto.randomUUID(), type: type.value, layout, ...part });
        renderParts();
        draw();
        parts.lastElementChild?.querySelector('input, textarea, select')?.focus();
      } catch (error) {
        status.textContent = error.message;
      }
    }, { className: 'quiet' });
    const tools = element('div', 'composition-add');
    tools.append(field(window.LastraI18n.t('Part type'), type), add);
    root.append(field(window.LastraI18n.t('Composition name'), name), dimensions, sample, dependencies, tools, status, parts);
    renderParts();
    draw();
    Promise.resolve().then(readSensors).then((reading) => {
      live = reading ?? {};
      if (root.isConnected) draw();
    }).catch(() => {
      live = {};
      if (root.isConnected) draw();
    });
    return { root, configuration: () => normalizeComposition(data) };
  }

  window.createCompositionEditor = createCompositionEditor;
}
