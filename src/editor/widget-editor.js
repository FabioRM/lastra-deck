'use strict';

{
  const { t } = window.LastraI18n;
  const { MAX_WIDGETS, catalog, defaultSettings, occupiedCells, canPlace, findPosition, groupWidgetPlacements,
    widgetTabLabel, placeWidget, pruneWidgetStacks } = window.LastraWidgetLayout;
  const { element, button } = window.LastraDom;
  const { stat, badge, gauge, graph, progress, list, action, decisionCard } = window.LastraWidgetComponents;
  const { isSensorId, searchSensors } = window.LastraSensorBinding;
  const { normalizeChoices } = window.LastraDecisions;

  function field(label, input) {
    const wrapper = element('label', 'field', t(label));
    wrapper.append(input);
    return wrapper;
  }

  function sampleCard(type, settings, compact, sensor) {
    if (type === 'decision') {
      const root = decisionCard(settings.options, { sample: true });
      root.classList.add('widget-editor-preview');
      root.classList.toggle('widget-editor-bar', compact);
      return root;
    }
    if (['audio-fader', 'audio-encoder', 'virtual-dial'].includes(type)) {
      const fader = window.LastraAudioFader.createFader(settings, catalog[type].fields.device.choices[settings.device], type);
      fader.root.classList.add('widget-editor-preview');
      fader.root.classList.toggle('widget-editor-bar', compact);
      for (const control of fader.controls) control.disabled = true;
      fader.show(settings.defaultLevel);
      return fader.root;
    }
    if (type === 'timers') {
      const root = element('article', 'lastra-widget widget-editor-preview widget-timers');
      root.classList.toggle('widget-editor-bar', compact);
      const header = element('header', 'widget-header');
      header.append(element('h3', 'widget-title', catalog[type].name), badge('Sample'));
      const rows = element('ul', 'widget-timer-list');
      for (const [name, time] of [['Tea', '2:41 left'], ['Stopwatch', '12:05']]) {
        const row = element('li');
        row.dataset.status = 'running';
        row.append(element('span', 'widget-timer-name', name), element('span', 'widget-timer-time', time));
        rows.append(row);
      }
      const controls = element('div', 'widget-actions');
      for (const label of [`+ ${settings.quickMinutes} min`, '+ Stopwatch']) {
        const control = action(label, () => {});
        control.disabled = true;
        controls.append(control);
      }
      root.append(header, element('div', 'widget-source', catalog[type].provider), rows, controls);
      return root;
    }
    const root = element('article', 'lastra-widget widget-editor-preview');
    root.classList.toggle('widget-editor-bar', compact);
    const media = ['now-playing', 'spotify', 'netflix'].includes(type);
    const title = media ? 'Sample track' : settings.sensorId
      ? sensor?.name ?? 'Selected sensor'
      : catalog[type].fields.metric.choices[settings.metric];
    const header = element('header', 'widget-header');
    header.append(element('h3', 'widget-title', title), badge(settings.sensorId ? 'Live binding' : 'Sample'));
    const source = sensor ? [sensor.device, sensor.source].filter(Boolean).join(' · ') : catalog[type].provider;
    root.append(header, element('div', 'widget-source', source));
    if (settings.sensorId) {
      root.append(element('p', '', window.LastraI18n.t('Enable Live readings in the deck preview to see this sensor.')));
      return root;
    }
    if (media) {
      root.classList.add('widget-media', `widget-media-${settings.appearance}`);
      const credits = list();
      credits.update(['Sample artist', 'Sample album']);
      const time = progress('Sample track position');
      time.max = 100;
      time.value = 40;
      const controls = element('div', 'widget-actions');
      for (const [label, icon] of [['Previous track', '‹'], ['Pause', 'Ⅱ'], ['Next track', '›']]) {
        const control = action(label, () => {}, icon);
        control.disabled = true;
        controls.append(control);
      }
      const summary = element('div', 'widget-media-summary');
      const cover = element('span', 'widget-artwork widget-editor-cover', '♫');
      cover.setAttribute('aria-hidden', 'true');
      summary.append(cover, credits.element);
      root.append(summary, time, controls);
    } else {
      const value = stat();
      const temperature = settings.metric.endsWith('Temp');
      const amount = temperature ? 62 : 42;
      value.textContent = temperature ? `${amount} °C` : `${amount}%`;
      root.append(value);
      if (settings.shape === 'gauge') {
        const meter = gauge(title);
        meter.max = temperature ? 110 : 100;
        meter.value = amount;
        root.append(meter);
      }
      if (settings.shape === 'graph') {
        const trend = graph(`${title} sample history`);
        trend.update([24, 33, 29, 56, 39, amount].map((point, index) => [index * 1_000, point]), temperature ? 110 : 100);
        root.append(trend.element);
      }
    }
    return root;
  }

  function createWidgetEditor(dialog) {
    const search = dialog.querySelector('#widget-search');
    const entries = dialog.querySelector('#widget-catalog');
    const instances = dialog.querySelector('#widget-instances');
    const presets = dialog.querySelector('#widget-presets');
    const presetsHeading = dialog.querySelector('#widget-presets-heading');
    const options = dialog.querySelector('#widget-options');
    const title = dialog.querySelector('h2');
    let context;
    let choice;

    function sensorField(settings, schema, refreshSample) {
      const filter = Object.assign(element('input', ''), { type: 'search', placeholder: 'GPU, fan, VRAM, drive…' });
      const select = element('select', '');
      const status = element('p', 'muted');
      status.setAttribute('role', 'status');
      const root = element('div', '');
      root.append(field(window.LastraI18n.t('Find a device sensor'), filter), field(schema.label, select), status);
      let sensors = [];

      function redraw() {
        const matches = searchSensors(sensors, filter.value);
        const current = settings.sensorId && sensors.find(({ id }) => id === settings.sensorId);
        if (current && !matches.includes(current)) matches.unshift(current);
        const options = Object.entries(schema.choices).map(([id, name]) => [id, t(name)]);
        for (const item of matches) {
          const detail = item.deviceId || item.device;
          options.push([item.id, [item.name, item.device, item.unit, detail && detail !== item.device ? detail : null,
            !item.available ? t('Unavailable') : null].filter(Boolean).join(' · ')]);
        }
        if (settings.sensorId && !current) options.push([settings.sensorId, t('Selected sensor is unavailable')]);
        select.replaceChildren(...options.map(([value, label]) => Object.assign(element('option', '', label), { value })));
        select.value = settings.sensorId ?? settings.metric;
        refreshSample(current);
      }

      filter.addEventListener('input', redraw);
      select.addEventListener('change', () => {
        if (isSensorId(select.value)) settings.sensorId = select.value;
        else {
          delete settings.sensorId;
          settings.metric = select.value;
        }
        refreshSample(sensors.find(({ id }) => id === settings.sensorId));
      });
      redraw();
      status.textContent = window.LastraI18n.t('Reading the hardware sensor list…');
      const owner = context;
      void Promise.resolve().then(() => owner.readSensorChoices()).then((result) => {
        if (!root.isConnected || owner !== context) return;
        sensors = result;
        status.textContent = sensors.length ? '' : t('No device-specific sensors are currently available.');
        redraw();
      }).catch(() => {
        if (root.isConnected && owner === context) status.textContent = window.LastraI18n.t('Could not read the hardware sensor list.');
      });
      return root;
    }

    function renderLists() {
      const words = search.value.trim().toLowerCase().split(/\s+/);
      const matching = Object.entries(catalog).filter(([, item]) =>
        words.every((word) => `${item.name} ${item.provider} ${t(item.name)} ${t(item.provider)}`.toLowerCase().includes(word)));
      entries.replaceChildren(...matching.map(([type, item]) => {
        const entry = button(t(item.name), () => choose({ type, settings: defaultSettings(type) }, true), { className: 'quiet' });
        entry.append(element('small', '', t(item.provider)));
        entry.setAttribute('aria-pressed', String(choice?.type === type && !choice.id && !choice.presetId));
        return entry;
      }));
      if (!matching.length) entries.append(element('p', 'muted', t('No matching widgets.')));
      const saved = context.presets.filter(({ composition }) => words.every((word) => composition.name.toLowerCase().includes(word)));
      presetsHeading.hidden = !saved.length;
      presets.replaceChildren(...saved.map((preset) => {
        const { id, composition, size } = preset;
        const entry = button(composition.name, () => choose({ type: 'composition', settings: { composition }, size, presetId: id }, true), { className: 'quiet' });
        entry.setAttribute('aria-pressed', String(choice?.presetId === id));
        entry.append(element('small', '', `${size.cols} × ${size.rows}`));
        return entry;
      }));

      const counts = new Map(groupWidgetPlacements(context.widgets).flatMap(({ members }) =>
        members.map(({ id }, index) => [id, { index, count: members.length }])));
      instances.replaceChildren(...context.widgets.map((widget) => {
        const { column, row, cols, rows } = widget.layout;
        const { index, count } = counts.get(widget.id);
        const name = count > 1 ? widgetTabLabel(widget) : widget.settings?.composition?.name ?? t(catalog[widget.type].name);
        const entry = button(name, () => choose(widget, true), { className: 'quiet' });
        entry.setAttribute('aria-pressed', String(widget.id === choice?.id));
        const tab = count > 1 ? ' · ' + t('Tab {number} of {count}', { number: index + 1, count }) : '';
        const position = t('Column {column}, row {row}', { column: column + 1, row: row + 1 });
        entry.append(element('small', '', `${position} · ${cols} × ${rows}${tab}`));
        return entry;
      }));
      if (!context.widgets.length) instances.append(element('p', 'muted', t('No widgets placed.')));
    }

    function choose(widget, focus = false) {
      choice = widget;
      renderLists();
      if (!widget) {
        options.replaceChildren(element('p', 'muted', t('Select a catalog widget to add, or select a placed widget to edit.')));
        return;
      }

      const { id, type } = widget;
      const metadata = catalog[type];
      const grid = context.grid;
      const taken = occupiedCells(grid, context.keys, context.widgets.filter((entry) => entry.id !== id));
      const preferred = widget.size ?? metadata.size;
      const size = { cols: Math.min(grid.cols, preferred.cols), rows: Math.min(grid.rows, preferred.rows) };
      const free = () => findPosition(grid, taken, size) ?? findPosition(grid, taken, { cols: 1, rows: 1 })
        ?? { column: 0, row: 0, ...size };
      const initial = widget.layout ?? free();
      const sample = element('div', 'widget-editor-sample');
      const form = element('form', 'widget-editor-form');
      const status = element('p', 'widget-editor-status');
      status.setAttribute('role', 'status');
      const settings = { ...widget.settings };
      const compose = type === 'composition' ? window.createCompositionEditor(settings.composition, context) : null;
      let sensor;
      const updateSample = () => sample.replaceChildren(sampleCard(type, settings, context.compact, sensor));
      const fields = Object.entries(metadata.fields).map(([key, schema]) => {
        if (type === 'decision' && key === 'options') {
          const input = element('textarea', '');
          input.rows = 4;
          input.maxLength = 600;
          input.required = true;
          input.value = settings.options.join('\n');
          input.addEventListener('input', () => {
            const choices = normalizeChoices(input.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
            input.setCustomValidity(choices ? '' : 'Enter 2–8 distinct options of up to 32 characters each.');
            if (!choices) return;
            settings.options = choices;
            updateSample();
          });
          return field(t('{label} (one per line)', { label: t(schema.label) }), input);
        }
        if (type === 'system-metric' && key === 'metric') return sensorField(settings, schema, (selected) => {
          sensor = selected;
          updateSample();
        });
        if (!schema.choices) {
          const input = element('input', '');
          input.type = 'number';
          input.min = String(schema.min);
          input.max = String(schema.max);
          input.required = true;
          input.value = String(settings[key]);
          input.addEventListener('input', () => {
            if (!input.validity.valid) return;
            settings[key] = input.valueAsNumber;
            updateSample();
          });
          return field(schema.label, input);
        }
        const select = element('select', '');
        for (const [value, label] of Object.entries(schema.choices)) {
          const option = element('option', '', t(label));
          option.value = value;
          select.append(option);
        }
        select.value = settings[key] ?? schema.value;
        select.addEventListener('change', () => {
          settings[key] = select.value;
          updateSample();
        });
        return field(schema.label, select);
      });
      const placement = element('div', 'widget-placement');
      const inputs = {};
      for (const [key, label, value, max] of [
        ['column', 'Column', initial.column + 1, grid.cols], ['row', 'Row', initial.row + 1, grid.rows],
        ['cols', 'Width in cells', initial.cols, grid.cols], ['rows', 'Height in cells', initial.rows, grid.rows],
      ]) {
        const input = element('input', '');
        input.type = 'number';
        input.min = '1';
        input.max = String(max);
        input.value = value;
        input.required = true;
        inputs[key] = input;
        placement.append(field(label, input));
      }

      const footer = element('div', 'clipboard-tools');
      const apply = element('button', 'primary', id ? window.LastraI18n.t('Apply changes') : window.LastraI18n.t('Add widget'));
      apply.type = 'submit';
      apply.disabled = !id && context.widgets.length >= MAX_WIDGETS;
      if (apply.disabled) status.textContent = `This layout already has ${MAX_WIDGETS} widgets.`;
      footer.append(apply);
      if (id) footer.append(button(window.LastraI18n.t('Remove widget'), () => {
        update(pruneWidgetStacks(context.widgets.filter((entry) => entry.id !== id)));
        choose(null);
        entries.querySelector('button')?.focus();
      }, { className: 'danger' }));
      function readLayout() {
        return { column: inputs.column.valueAsNumber - 1, row: inputs.row.valueAsNumber - 1,
          cols: inputs.cols.valueAsNumber, rows: inputs.rows.valueAsNumber };
      }
      const stackControls = element('div', 'widget-stack-settings');
      const stack = element('select', '');
      const label = element('input', '');
      label.maxLength = 24;
      label.value = widget.tabLabel ?? '';
      const tabLabel = field(window.LastraI18n.t('Tab label'), label);
      const hint = element('p', 'muted', 'Move or resize the whole stack in Live preview.');
      const choices = groupWidgetPlacements(context.widgets.filter((entry) => entry.id !== id));
      stack.append(element('option', '', window.LastraI18n.t('Own slot')));
      stack.firstElementChild.value = '';
      for (const { members } of choices) {
        const [target] = members;
        const count = members.length > 1 ? ` · ${members.length} tabs` : '';
        const option = element('option', '', widgetTabLabel(target) + count);
        option.value = target.id;
        stack.append(option);
        if (widget.stackId && target.stackId === widget.stackId) stack.value = target.id;
      }
      const selectedTarget = () => context.widgets.find((entry) => entry.id === stack.value);
      let solo = widget.stackId && selectedTarget() ? free() : initial;
      let wasStacked = Boolean(selectedTarget());
      function changeStack() {
        const target = selectedTarget();
        if (target && !wasStacked) solo = readLayout();
        const layout = target?.layout ?? solo;
        for (const [key, control] of Object.entries(inputs)) {
          control.value = layout[key] + (key === 'row' || key === 'column' ? 1 : 0);
          control.disabled = Boolean(target);
        }
        tabLabel.hidden = hint.hidden = !target;
        wasStacked = Boolean(target);
      }
      stackControls.hidden = !choices.length;
      stackControls.append(field(window.LastraI18n.t('Stack with'), stack), tabLabel, hint);
      stack.addEventListener('change', changeStack);
      changeStack();
      if (compose) {
        footer.append(button(window.LastraI18n.t('Save as preset'), () => {
          try {
            const composition = compose.configuration();
            const { cols, rows } = readLayout();
            if (!inputs.cols.reportValidity() || !inputs.rows.reportValidity() || !cols || !rows) return;
            updatePresets([...context.presets, { id: crypto.randomUUID(), size: { cols, rows }, composition }]);
            status.textContent = window.LastraI18n.t('Preset added to this profile.');
          } catch (error) {
            status.textContent = error.message;
          }
        }, { className: 'quiet' }));
        if (widget.presetId) {
          const remove = button(window.LastraI18n.t('Remove preset'), () => {
            const presetId = widget.presetId;
            delete widget.presetId;
            updatePresets(context.presets.filter((entry) => entry.id !== presetId));
            remove.remove();
            status.textContent = window.LastraI18n.t('Preset removed from this profile.');
          }, { className: 'danger' });
          footer.append(remove);
        }
      }
      form.addEventListener('input', () => { if (!apply.disabled) status.textContent = ''; });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (apply.disabled) return;
        const layout = readLayout();
        const target = selectedTarget();
        if (!target && !canPlace(layout, grid, taken)) {
          status.textContent = window.LastraI18n.t('Choose a position and size that fit in empty cells.');
          return;
        }
        let chosenSettings = settings;
        if (compose) {
          try {
            chosenSettings = { composition: compose.configuration() };
          } catch (error) {
            status.textContent = error.message;
            return;
          }
        }
        const tab = label.value.trim();
        if (tab && !/^\P{Cc}{1,24}$/u.test(tab)) {
          status.textContent = 'Enter a tab label up to 24 characters.';
          return;
        }
        const next = { id: id ?? crypto.randomUUID(), type, settings: chosenSettings, layout, ...(tab ? { tabLabel: tab } : {}) };
        update(placeWidget(context.widgets, next, target));
        choose(context.widgets.find(({ id }) => id === next.id));
        instances.querySelector('[aria-pressed="true"]')?.focus();
      });
      if (!compose) updateSample();
      form.append(...(compose ? [compose.root] : fields), stackControls, placement, status, footer);
      const heading = element('h3', '', t(metadata.name));
      heading.tabIndex = -1;
      options.replaceChildren(heading, element('p', 'muted', t(metadata.description)),
        element('p', 'muted', t(metadata.requirement)), ...(compose ? [] : [sample]), form);
      if (focus) heading.focus();
    }

    function update(widgets) {
      context.onChange(widgets);
      context.widgets = widgets;
    }
    function updatePresets(values) {
      context.onPresetsChange(values);
      context.presets = values;
      renderLists();
    }

    search.addEventListener('input', renderLists);
    dialog.querySelector('#close-widgets').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      context?.restoreFocus?.();
      context = null;
    });

    return (target, id) => {
      context = target;
      title.textContent = target.title;
      search.value = '';
      choose(target.widgets.find((widget) => widget.id === id) ?? null);
      dialog.showModal();
      search.focus();
    };
  }

  window.createLastraWidgetEditor = createWidgetEditor;
}
