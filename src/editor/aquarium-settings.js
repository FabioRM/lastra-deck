'use strict';

{
  const api = window.lastraEditor;
  const { t } = window.LastraI18n;
  const { SPECIES, PRESETS, CHOICES, DECORATIONS, DECORATION_LIMIT, STOCK_LIMIT, applyAquariumPreset } = window.LastraAquariumSettings;
  const { picture, show, rangeSample } = window.LastraAquariumVisuals;
  const GROUPS = { all: 'All animals', fish: 'Fish', crustaceans: 'Crustaceans', molluscs: 'Molluscs',
    reptiles: 'Reptiles', invertebrates: 'Other invertebrates' };
  const panel = document.getElementById('aquarium-settings');
  const settingsPanel = document.getElementById('desktop-settings');
  const form = document.getElementById('aquarium-preferences');
  const status = document.getElementById('aquarium-settings-status');
  const total = document.getElementById('aquarium-stock-total');
  const saveButton = document.getElementById('aquarium-save');
  const discardButton = document.getElementById('aquarium-discard');
  const previewFeeding = document.getElementById('aquarium-preview-feeding');
  const previewCanvas = document.getElementById('aquarium-preview-canvas');
  const view = window.LastraAquariumView.mount({
    canvas: previewCanvas,
    status: document.getElementById('aquarium-preview-error'),
    maxRate: 30,
    editable: true,
  });
  const counts = {};
  const fields = [...Object.keys(CHOICES), 'dawn', 'dusk'];
  const nightRanges = ['nightBrightness', 'glowIntensity'];
  const ranges = ['rocks', 'plants', 'algaeDensity', 'coralDensity', 'spongeDensity', 'bubbleDensity', 'brightness', ...nightRanges, 'portion'];
  const rangeSamples = Object.fromEntries(ranges.map((name) => [name,
    rangeSample(form.elements.namedItem(name), nightRanges.includes(name) ? 'nightSamples' : 'samples')]));
  const lightControls = [...document.querySelectorAll('[data-aquarium-light-preview]')];
  let lightPreview = 'auto';
  const checks = ['enabled', 'bubbles', 'touch'];
  const stockGroup = document.getElementById('aquarium-stock-group');
  const stockSearch = document.getElementById('aquarium-stock-search');
  const stockedOnly = document.getElementById('aquarium-stock-populated');
  const stockEmpty = document.getElementById('aquarium-stock-empty');
  const decorMap = document.getElementById('aquarium-decor-map');
  const mapStage = decorMap.parentElement;
  const mapEmpty = document.getElementById('aquarium-map-empty');
  const placed = document.getElementById('aquarium-decor-placed');
  const decorControls = document.getElementById('aquarium-decor-controls');
  const decorKind = document.getElementById('aquarium-decor-kind');
  const decorPicture = picture('decorations', '');
  document.getElementById('aquarium-decor-picture').append(decorPicture);
  const decorSelected = document.getElementById('aquarium-decor-selected');
  const decorAdd = document.getElementById('aquarium-decor-add');
  const decorRemove = document.getElementById('aquarium-decor-remove');
  let markers = [], placedButtons = [];
  let drag, previewTimer;
  let panelLightingFrame;
  let panelLightingRequested = false;
  let highlight = false;
  let saved, draft, lastPreview;
  let dirty = false;
  let saving = false;
  let inViewport = false;
  let message = '';
  let failed = false;
  let selectedDecoration = 0;

  const presetGallery = document.getElementById('aquarium-presets');
  for (const [id, { label }] of Object.entries(PRESETS)) {
    const card = document.createElement('label');
    const option = document.createElement('input');
    Object.assign(option, { type: 'radio', name: 'preset', value: id });
    const text = document.createElement('span');
    text.dataset.aquariumLabel = label;
    card.append(option, picture('presets', id), text);
    presetGallery.append(card);
  }

  function setOptions(select, choices) {
    const selected = select.value;
    select.replaceChildren(...Object.entries(choices).map(([id, label]) => new Option(t(label), id)));
    if (selected) select.value = selected;
  }

  function localize() {
    for (const [name, choices] of Object.entries(CHOICES)) setOptions(form.elements.namedItem(name), choices);
    setOptions(stockGroup, GROUPS);
    setOptions(decorKind, DECORATIONS);
    show(decorPicture, decorKind.value);
    for (const label of form.querySelectorAll('[data-aquarium-label]')) label.textContent = t(label.dataset.aquariumLabel);
    update();
    filterStock();
    if (draft) renderDecorations();
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
      label.append(picture('species', id), text, count);
      options.append(label);
    }
    fieldset.append(legend, options);
    stock.append(fieldset);
  }

  function searchText(value) {
    return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
  }

  function filterStock() {
    const query = searchText(stockSearch.value.trim());
    let visible = false;
    for (const group of stock.querySelectorAll('[data-aquarium-group]')) {
      let matches = 0;
      for (const label of group.querySelectorAll('[data-aquarium-species]')) {
        const id = label.dataset.aquariumSpecies;
        const { label: name } = SPECIES[id];
        label.hidden = (stockedOnly.checked && !(counts[id].valueAsNumber > 0))
          || ![name, t(name)].some((value) => searchText(value).includes(query));
        if (!label.hidden) matches++;
      }
      group.hidden = !matches || (stockGroup.value !== 'all' && group.dataset.aquariumGroup !== stockGroup.value);
      visible ||= !group.hidden;
    }
    stockEmpty.hidden = visible || !draft;
  }

  function presentRange(output, value, name) {
    output.value = value + (name === 'rotation' ? '°' : name === 'portion' ? '' : '%');
  }

  function renderDecorations() {
    const list = draft.decorations;
    selectedDecoration = Math.min(selectedDecoration, Math.max(0,list.length-1));
    markers = list.map((item, index) => {
      const piece = document.createElement('div');
      piece.className = 'aquarium-map-piece';
      const marker = document.createElement('button');
      marker.type = 'button';
      marker.dataset.decoration = index;
      marker.append(picture('decorations', item.type));
      const footprint = picture('footprints', item.type);
      piece.append(footprint, marker);
      return { piece, marker };
    });
    placedButtons = list.map((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.decoration = index;
      button.append(picture('decorations', item.type), document.createTextNode(t(DECORATIONS[item.type])));
      return button;
    });
    decorMap.replaceChildren(...markers.map(({ piece }) => piece));
    placed.replaceChildren(...placedButtons);
    placed.hidden = !list.length;
    mapEmpty.hidden = Boolean(list.length);
    decorAdd.disabled = list.length>=DECORATION_LIMIT;
    list.forEach(updateMarker);
    renderSelection();
  }

  function updateMarker(item, index) {
    const { piece, marker } = markers[index];
    const label = t('{name} · placement {number}', { name: t(DECORATIONS[item.type]), number: index + 1 });
    marker.title = placedButtons[index].title = label;
    marker.setAttribute('aria-label', label);
    placedButtons[index].setAttribute('aria-label', label);
    piece.style.left = `${(item.x + 100) / 2}%`;
    piece.style.top = `${100 - item.depth}%`;
    piece.style.setProperty('--footprint-scale', item.size / 100);
    piece.style.setProperty('--footprint-angle', `${-item.rotation}deg`);
  }

  function renderSelection() {
    for (const [index, { piece, marker }] of markers.entries()) {
      const pressed = index === selectedDecoration;
      piece.toggleAttribute('data-selected', pressed);
      marker.setAttribute('aria-pressed', String(pressed));
      placedButtons[index].setAttribute('aria-pressed', String(pressed));
    }
    const selected = draft.decorations[selectedDecoration];
    view.highlightDecoration(highlight && selected ? selectedDecoration : null);
    decorControls.hidden = !selected;
    if (!selected) return;
    decorSelected.textContent = t(DECORATIONS[selected.type]);
    for (const field of decorControls.querySelectorAll('[data-decor-field]')) {
      const key=field.dataset.decorField;
      field.value=selected[key];
      presentRange(decorControls.querySelector(`[data-decor-range="${key}"]`),selected[key],key);
    }
  }

  function render(value) {
    draft = value;
    for (const name of ['preset', ...fields]) form.elements.namedItem(name).value = value[name];
    for (const name of checks) form.elements.namedItem(name).checked = value[name];
    for (const name of ranges) {
      form.elements.namedItem(name).value = value[name];
      presentRange(form.querySelector(`[data-aquarium-range="${name}"]`),value[name],name);
      rangeSamples[name]();
    }
    for (const [id, input] of Object.entries(counts)) input.value = value.stock[id];
    renderDecorations();
    filterStock();
    update(true);
  }

  function read() {
    const value = { ...draft };
    for (const name of fields) value[name] = form.elements.namedItem(name).value;
    for (const name of checks) value[name] = form.elements.namedItem(name).checked;
    for (const name of ranges) value[name] = form.elements.namedItem(name).valueAsNumber;
    value.stock = Object.fromEntries(Object.keys(SPECIES).map((id) => {
      const amount = counts[id].valueAsNumber;
      return [id, Number.isFinite(amount) ? amount : 0];
    }));
    return value;
  }

  function update(updatePreview = false) {
    if (!draft) {
      status.textContent = t(message);
      status.classList.toggle('error', failed);
      return;
    }
    const value = read();
    const count = Object.values(value.stock).reduce((sum, amount) => sum + amount, 0);
    total.textContent = t('{count} / {limit} animals', { count, limit: STOCK_LIMIT });
    total.classList.toggle('invalid', count > STOCK_LIMIT);
    const timesInvalid = !value.dawn || !value.dusk || value.dawn === value.dusk;
    const stockInvalid = Object.values(counts).some((input) => !input.validity.valid);
    const problem = timesInvalid ? 'Choose different times for sunrise and sunset.'
      : stockInvalid ? 'Enter a whole number within the limit for each species.'
        : count > STOCK_LIMIT ? 'The aquarium has reached its animal limit.' : '';
    const signature = JSON.stringify(value);
    dirty = Boolean(problem) || signature !== JSON.stringify(saved);
    saveButton.disabled = saving || !dirty || Boolean(problem);
    discardButton.disabled = saving || !dirty;
    status.classList.toggle('error', Boolean(problem) || failed);
    const label = t(problem || message || (dirty ? 'Unsaved aquarium changes.' : ''));
    if (status.textContent !== label) status.textContent = label;
    for (const name of ['bubblePattern', 'bubbleDensity']) form.elements.namedItem(name).disabled = !value.bubbles;
    for (const name of ['feedType', 'portion']) form.elements.namedItem(name).disabled = !value.touch;
    form.elements.namedItem('turtleVisits').disabled = !(value.stock.greenTurtle || value.stock.hawksbill);
    if (updatePreview && !problem && lastPreview !== signature) {
      lastPreview = signature;
      previewFeeding.hidden = !value.touch;
      view.configure({ ...value, enabled: true });
    }
  }

  async function save() {
    if (saveButton.disabled || form.inert) return;
    const value = read();
    if (panelLightingFrame !== undefined) sendPanelLighting();
    saving = true;
    failed = false;
    message = 'Saving aquarium settings…';
    update();
    try {
      saved = await api.setAquarium(value);
      message = JSON.stringify(read()) === JSON.stringify(value) ? 'Aquarium settings saved.' : '';
    } catch {
      message = 'Could not save aquarium settings.';
      failed = true;
    } finally {
      saving = false;
      update();
    }
  }

  function queuePreview() {
    if (previewTimer !== undefined) return;
    previewTimer = setTimeout(() => {
      previewTimer = undefined;
      if (view.isUpdating()) queuePreview();
      else update(true);
    }, 160);
  }

  function edited(updatePreview, queue = true) {
    if (!draft) return;
    if (!saving) message = '';
    failed = false;
    if (updatePreview || !queue) {
      clearTimeout(previewTimer);
      previewTimer = undefined;
    }
    update(updatePreview);
    if (!updatePreview && queue) queuePreview();
  }

  function setLightPreview(mode) {
    if (lightPreview === mode) return;
    lightPreview = mode;
    view.setLightPreview(mode);
    for (const button of lightControls) button.setAttribute('aria-pressed', String(button.dataset.aquariumLightPreview === mode));
  }
  for (const button of lightControls) button.addEventListener('click', () => {
    const mode = button.dataset.aquariumLightPreview;
    setLightPreview(mode);
    if (mode === 'auto') stopPanelLighting();
    else sendPanelLighting();
  });

  function lightingControlsVisible() {
    return !document.hidden && !panel.hidden && !settingsPanel.hidden;
  }

  function sendPanelLighting() {
    if (panelLightingFrame !== undefined) cancelAnimationFrame(panelLightingFrame);
    panelLightingFrame = undefined;
    if (!draft || !lightingControlsVisible() || lightPreview === 'auto') return;
    panelLightingRequested = true;
    const nightBrightness = form.elements.namedItem('nightBrightness').valueAsNumber;
    const glowIntensity = form.elements.namedItem('glowIntensity').valueAsNumber;
    void api.previewAquariumLighting({ mode: lightPreview, nightBrightness, glowIntensity }).catch(() => {});
  }

  function stopPanelLighting() {
    if (panelLightingFrame !== undefined) cancelAnimationFrame(panelLightingFrame);
    panelLightingFrame = undefined;
    if (!panelLightingRequested) return;
    panelLightingRequested = false;
    void api.previewAquariumLighting(null).catch(() => {});
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (event.submitter === saveButton) void save();
  });
  form.addEventListener('input', ({ target }) => {
    const nightRange = nightRanges.includes(target.name);
    if (nightRange && draft) {
      setLightPreview('night');
      panelLightingFrame ??= requestAnimationFrame(sendPanelLighting);
    }
    if (ranges.includes(target.name)) {
      presentRange(form.querySelector(`[data-aquarium-range="${target.name}"]`),target.value,target.name);
      rangeSamples[target.name]();
    }
    if (target.name === 'feedType' || target.name === 'touch') rangeSamples.portion();
    if (target.name === 'bubbles') rangeSamples.bubbleDensity();
    const key=target.dataset.decorField;
    if (key) editDecoration({ [key]: target.valueAsNumber }, false);
    if (fields.includes(target.name) || checks.includes(target.name) || ranges.includes(target.name)
      || Object.hasOwn(counts,target.name)) edited(target.name === 'brightness' || nightRange);
  });
  form.addEventListener('change', ({ target }) => {
    if (fields.includes(target.name) || checks.includes(target.name) || ranges.includes(target.name)
      || Object.hasOwn(counts,target.name)) edited(true);
    if (Object.hasOwn(counts,target.name)) filterStock();
    const key=target.dataset.decorField;
    if (key) editDecoration({ [key]: target.valueAsNumber });
  });
  stockGroup.addEventListener('change',filterStock);
  stockSearch.addEventListener('input',filterStock);
  stockedOnly.addEventListener('change',filterStock);
  decorKind.addEventListener('change', () => show(decorPicture, decorKind.value));

  function setDecorations(decorations) {
    draft = { ...draft, decorations };
    highlight = true;
    renderDecorations();
    edited(true);
  }

  function editDecoration(change, commit = true, index = selectedDecoration) {
    const previous = draft?.decorations[index];
    if (!previous) return false;
    if (Object.entries(change).every(([key, value]) => previous[key] === value)) {
      if (commit) edited(true);
      return false;
    }
    const decorations = [...draft.decorations];
    const item = { ...previous, ...change };
    decorations[index] = item;
    draft = { ...draft, decorations };
    updateMarker(item, index);
    highlight = true;
    renderSelection();
    view.previewDecoration(index, item);
    edited(commit, false);
    return true;
  }

  function selectDecoration(index) {
    if (!draft?.decorations[index]) return;
    selectedDecoration = index;
    highlight = true;
    renderSelection();
    const { x, depth } = draft.decorations[index];
    return { x, depth };
  }

  function moveOnMap(clientX, clientY, commit) {
    const box = decorMap.getBoundingClientRect();
    const x = (clientX - box.left) / box.width;
    const y = (clientY - box.top) / box.height;
    editDecoration({
      x: Math.max(-100, Math.min(100, Math.round(x * 200 - 100))),
      depth: Math.max(0, Math.min(100, Math.round((1 - y) * 100))),
    }, commit);
  }

  mapStage.addEventListener('click', (event) => {
    const marker = event.target.closest('button[data-decoration]');
    if (marker) selectDecoration(Number(marker.dataset.decoration));
    else if (!drag) moveOnMap(event.clientX, event.clientY, true);
  });
  placed.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-decoration]');
    if (button) selectDecoration(Number(button.dataset.decoration));
  });
  mapStage.addEventListener('pointerdown', (event) => {
    const marker = event.target.closest('button[data-decoration]');
    if (!marker || !event.isPrimary || event.button !== 0) return;
    selectDecoration(Number(marker.dataset.decoration));
    const box = marker.getBoundingClientRect();
    drag = {
      id: event.pointerId, x: event.clientX, y: event.clientY, moved: false,
      offsetX: event.clientX - (box.left + box.width / 2), offsetY: event.clientY - (box.top + box.height / 2),
    };
    marker.setPointerCapture(drag.id);
  });
  mapStage.addEventListener('pointermove', (event) => {
    if (event.pointerId !== drag?.id) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
    drag.moved = true;
    moveOnMap(event.clientX - drag.offsetX, event.clientY - drag.offsetY, false);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) mapStage.addEventListener(name, (event) => {
    if (event.pointerId !== drag?.id) return;
    if (drag.moved) edited(true);
    drag = undefined;
  });
  decorAdd.addEventListener('click', () => {
    if (form.inert || draft.decorations.length>=DECORATION_LIMIT) return;
    selectedDecoration=draft.decorations.length;
    const x=(selectedDecoration%2 ? 1 : -1)*Math.ceil(selectedDecoration/2)*18;
    setDecorations([...draft.decorations, { type:decorKind.value, x, depth:50, size:100, rotation:0 }]);
    decorMap.querySelector(`[data-decoration="${selectedDecoration}"]`)?.focus({ preventScroll:true });
  });
  decorRemove.addEventListener('click', () => {
    if (form.inert) return;
    setDecorations(draft.decorations.filter((_,index)=>index!==selectedDecoration));
    (decorMap.querySelector(`[data-decoration="${selectedDecoration}"]`) ?? decorAdd).focus({ preventScroll:true });
  });
  document.getElementById('aquarium-apply-preset').addEventListener('click', () => {
    const preset = form.elements.namedItem('preset').value;
    const value = read();
    const next = applyAquariumPreset(value, preset);
    message = '';
    failed = false;
    highlight = false;
    selectedDecoration = 0;
    // The preset replaces the aquascape and stock, leaving schedule edits in the draft.
    render({ ...next, dawn: value.dawn, dusk: value.dusk });
  });
  document.getElementById('aquarium-reshape').addEventListener('click', () => {
    draft = { ...draft, seed: crypto.getRandomValues(new Uint32Array(1))[0] };
    edited(true);
  });
  discardButton.addEventListener('click', () => {
    stopPanelLighting();
    setLightPreview('auto');
    message = '';
    failed = false;
    highlight = false;
    selectedDecoration = 0;
    render(saved);
  });
  window.addEventListener('beforeunload', (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = false;
  });

  const previewControls = window.LastraAquariumPreviewControls.mount({
    canvas: previewCanvas,
    view,
    canEdit: () => !form.inert,
    select: selectDecoration,
    move: (index, change) => editDecoration(change, false, index),
    commit: () => edited(true),
  });

  function updateVisibility() {
    const controlsVisible = lightingControlsVisible();
    if (!controlsVisible) {
      stopPanelLighting();
      setLightPreview('auto');
    }
    const visible = controlsVisible && inViewport;
    if (!visible) previewControls.cancel();
    view.setVisible(visible);
  }

  function updateLocation() {
    void api.getFeeds().then((settings) => view.setLocation(settings?.weather)).catch(() => {});
  }

  const observePreview = new IntersectionObserver(([entry]) => {
    inViewport = entry.isIntersecting;
    updateVisibility();
  });
  observePreview.observe(document.getElementById('aquarium-preview-tank'));
  const observePanel = new MutationObserver(updateVisibility);
  for (const section of [panel, settingsPanel]) observePanel.observe(section, { attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', updateVisibility);
  panel.addEventListener('settings:open', updateLocation);
  document.addEventListener('lastra-language', localize);
  localize();
  api.getAquarium().then((settings) => {
    saved = settings;
    render(saved);
    form.inert = false;
    if (lightPreview !== 'auto') sendPanelLighting();
  }).catch(() => {
    message = 'Could not load aquarium settings.';
    failed = true;
    update();
  });
}
