'use strict';

{
  const api = window.lastraEditor;
  const { t } = window.LastraI18n;
  const { SPECIES, PRESETS, CHOICES, DECORATIONS, DECORATION_LIMIT, STOCK_LIMIT, applyAquariumPreset } = window.LastraAquariumSettings;
  const GROUPS = { all: 'All animals', fish: 'Fish', crustaceans: 'Crustaceans', molluscs: 'Molluscs',
    reptiles: 'Reptiles', invertebrates: 'Other invertebrates' };
  const form = document.getElementById('aquarium-preferences');
  const status = document.getElementById('aquarium-settings-status');
  const total = document.getElementById('aquarium-stock-total');
  const counts = {};
  const fields = [...Object.keys(CHOICES), 'dawn', 'dusk'];
  const ranges = ['rocks', 'plants', 'algaeDensity', 'coralDensity', 'spongeDensity', 'bubbleDensity', 'brightness', 'portion'];
  const checks = ['enabled', 'bubbles', 'touch'];
  const stockGroup = document.getElementById('aquarium-stock-group');
  const stockSearch = document.getElementById('aquarium-stock-search');
  const decorMap = document.getElementById('aquarium-decor-map');
  const decorControls = document.getElementById('aquarium-decor-controls');
  const decorKind = document.getElementById('aquarium-decor-kind');
  const decorAdd = document.getElementById('aquarium-decor-add');
  const decorRemove = document.getElementById('aquarium-decor-remove');
  let current;
  let message = '';
  let selectedDecoration = 0;

  function setOptions(select, choices) {
    const selected = select.value;
    select.replaceChildren(...Object.entries(choices).map(([id, label]) => new Option(t(label), id)));
    if (selected) select.value = selected;
  }

  function localize() {
    setOptions(form.elements.namedItem('preset'), Object.fromEntries(Object.entries(PRESETS).map(([id, { label }]) => [id, label])));
    for (const [name, choices] of Object.entries(CHOICES)) setOptions(form.elements.namedItem(name), choices);
    setOptions(stockGroup, GROUPS);
    setOptions(decorKind, DECORATIONS);
    for (const label of form.querySelectorAll('[data-aquarium-label]')) label.textContent = t(label.dataset.aquariumLabel);
    renderStatus();
    filterStock();
    if (current) renderDecorations();
  }

  const stock = document.getElementById('aquarium-stock');
  for (const [group, name] of Object.entries(GROUPS).filter(([id]) => id !== 'all')) {
    const fieldset = document.createElement('fieldset');
    fieldset.dataset.aquariumGroup = group;
    const legend = document.createElement('legend');
    legend.dataset.aquariumLabel = name;
    const options = document.createElement('div');
    options.className = 'aquarium-stock-options';
    for (const [id, species] of Object.entries(SPECIES)) {
      if (species.group !== group) continue;
      const label = document.createElement('label');
      label.className = 'field';
      label.dataset.aquariumSpecies = id;
      const text = document.createElement('span');
      text.dataset.aquariumLabel = species.label;
      const count = document.createElement('input');
      count.type = 'number';
      count.inputMode = 'numeric';
      count.name = id;
      count.min = '0';
      count.max = String(species.max);
      count.step = '1';
      counts[id] = count;
      label.append(text, count);
      options.append(label);
    }
    fieldset.append(legend, options);
    stock.append(fieldset);
  }

  function filterStock() {
    const query = stockSearch.value.trim().toLocaleLowerCase();
    for (const group of stock.querySelectorAll('[data-aquarium-group]')) {
      let matches = 0;
      for (const label of group.querySelectorAll('[data-aquarium-species]')) {
        const { label: name } = SPECIES[label.dataset.aquariumSpecies];
        label.hidden = !!query && ![name,t(name)].some((value) => value.toLocaleLowerCase().includes(query));
        if (!label.hidden) matches++;
      }
      group.hidden = !matches || (stockGroup.value !== 'all' && group.dataset.aquariumGroup !== stockGroup.value);
    }
  }

  function presentRange(output, value, name) {
    output.value = value + (name === 'rotation' ? '°' : name === 'portion' ? '' : '%');
  }

  function renderDecorations() {
    const list = current.decorations;
    selectedDecoration = Math.min(selectedDecoration, Math.max(0,list.length-1));
    decorMap.replaceChildren(...list.map((item,index) => {
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.dataset.decoration = index;
      marker.title = t(DECORATIONS[item.type]);
      marker.setAttribute('aria-label', marker.title);
      marker.setAttribute('aria-pressed', String(index===selectedDecoration));
      marker.style.left = `${50 + item.x*.466}%`;
      marker.style.top = `${91 - item.depth*.82}%`;
      return marker;
    }));
    decorAdd.disabled = list.length>=DECORATION_LIMIT;
    const selected = list[selectedDecoration];
    decorControls.hidden = !selected;
    if (!selected) return;
    for (const field of decorControls.querySelectorAll('[data-decor-field]')) {
      const key=field.dataset.decorField;
      field.value=selected[key];
      presentRange(decorControls.querySelector(`[data-decor-range="${key}"]`),selected[key],key);
    }
  }

  function renderStatus() {
    status.textContent = t(message);
    if (current) {
      const count = Object.values(current.stock).reduce((sum, amount) => sum + amount, 0);
      total.textContent = t('{count} / {limit} animals', { count, limit: STOCK_LIMIT });
    }
  }

  function render() {
    for (const name of ['preset', ...fields]) form.elements.namedItem(name).value = current[name];
    for (const name of checks) form.elements.namedItem(name).checked = current[name];
    for (const name of ranges) {
      form.elements.namedItem(name).value = current[name];
      presentRange(form.querySelector(`[data-aquarium-range="${name}"]`),current[name],name);
    }
    for (const [id, input] of Object.entries(counts)) input.value = current.stock[id];
    renderDecorations();
    renderStatus();
  }

  function read() {
    const value = { ...current };
    for (const name of fields) value[name] = form.elements.namedItem(name).value;
    for (const name of checks) value[name] = form.elements.namedItem(name).checked;
    for (const name of ranges) value[name] = form.elements.namedItem(name).valueAsNumber;
    value.stock = Object.fromEntries(Object.entries(counts).map(([id, input]) => [id,
      input.value === '' ? 0 : Math.round(Math.min(SPECIES[id].max, Math.max(0, input.valueAsNumber)))]));
    return value;
  }

  async function save(value, target) {
    if (form.inert || !current) return;
    const selectedPreset = form.elements.namedItem('preset').value;
    const keepPresetSelection = value.preset === current.preset && selectedPreset !== current.preset;
    if (!value.dawn || !value.dusk || value.dawn === value.dusk) {
      message = 'Choose different times for sunrise and sunset.';
      status.classList.add('error');
      renderStatus();
      return;
    }
    const count = Object.values(value.stock).reduce((sum, amount) => sum + amount, 0);
    if (count > STOCK_LIMIT) {
      message = 'The aquarium has reached its animal limit.';
      status.classList.add('error');
      render();
      if (keepPresetSelection) form.elements.namedItem('preset').value = selectedPreset;
      return;
    }
    const focused = document.activeElement === target;
    form.inert = true;
    try {
      current = await api.setAquarium(value);
      message = 'Aquarium settings saved.';
      status.classList.remove('error');
    } catch {
      message = 'Could not save aquarium settings.';
      status.classList.add('error');
    } finally {
      render();
      if (keepPresetSelection) form.elements.namedItem('preset').value = selectedPreset;
      form.inert = false;
      if (focused && document.activeElement === document.body) target.focus({ preventScroll: true });
    }
  }

  form.addEventListener('submit', (event) => event.preventDefault());
  form.addEventListener('input', ({ target }) => {
    if (ranges.includes(target.name)) {
      presentRange(form.querySelector(`[data-aquarium-range="${target.name}"]`),target.value,target.name);
    }
    const key=target.dataset.decorField;
    if (key) presentRange(decorControls.querySelector(`[data-decor-range="${key}"]`),target.value,key);
  });
  form.addEventListener('change', ({ target }) => {
    if ([...fields,...ranges,...checks].includes(target.name) || Object.hasOwn(counts,target.name)) void save(read(), target);
    const key=target.dataset.decorField;
    if (key) editDecoration({ [key]:target.valueAsNumber },target);
  });
  stockGroup.addEventListener('change',filterStock);
  stockSearch.addEventListener('input',filterStock);

  function editDecoration(change,target) {
    if (!current?.decorations[selectedDecoration]) return;
    const decorations = current.decorations.map((item,index) => index === selectedDecoration ? {...item,...change} : item);
    void save({...read(),decorations},target);
  }

  decorMap.addEventListener('click', (event) => {
    if (form.inert || !current) return;
    const marker=event.target.closest('button[data-decoration]');
    if (marker) {
      selectedDecoration=Number(marker.dataset.decoration);
      renderDecorations();
      decorMap.querySelector(`[data-decoration="${selectedDecoration}"]`)?.focus({preventScroll:true});
      return;
    }
    const box=decorMap.getBoundingClientRect();
    const x=(event.clientX-box.left)/box.width, y=(event.clientY-box.top)/box.height;
    editDecoration({ x:Math.round((x-.50)*100/.466),depth:Math.round((.91-y)*100/.82) },decorMap);
  });
  decorAdd.addEventListener('click', ({ currentTarget }) => {
    if (form.inert || current.decorations.length>=DECORATION_LIMIT) return;
    selectedDecoration=current.decorations.length;
    const x=selectedDecoration ? (selectedDecoration%2 ? 1 : -1)*Math.ceil(selectedDecoration/2)*18 : 0;
    void save({...read(),decorations:[...current.decorations,{type:decorKind.value,x,depth:50}]},currentTarget);
  });
  decorRemove.addEventListener('click', ({ currentTarget }) => {
    if (form.inert) return;
    void save({...read(),decorations:current.decorations.filter((_,index)=>index!==selectedDecoration)},currentTarget);
  });
  document.getElementById('aquarium-apply-preset').addEventListener('click', ({ currentTarget }) => {
    const preset = form.elements.namedItem('preset').value;
    selectedDecoration=0;
    void save(applyAquariumPreset(read(), preset), currentTarget);
  });
  document.getElementById('aquarium-reshape').addEventListener('click', ({ currentTarget }) => {
    void save({ ...read(), seed: crypto.getRandomValues(new Uint32Array(1))[0] }, currentTarget);
  });
  document.addEventListener('lastra-language', localize);
  localize();
  api.getAquarium().then((settings) => {
    current = settings;
    render();
    form.inert = false;
  }).catch(() => {
    message = 'Could not load aquarium settings.';
    status.classList.add('error');
    renderStatus();
  });
}
