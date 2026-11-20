'use strict';

window.LastraObsModes = {
  mount(root, api, { settingsOnly = false } = {}) {
    const titles = { setup: 'Setup', live: 'Live', break: 'Break' };
    const stepLabels = { ready: 'Planned', pending: 'Waiting', running: 'Verifying', confirmed: 'Confirmed',
      already: 'Already matched', unverified: 'Unverified', skipped: 'Not sent' };
    const outputOptions = [['leave', 'Leave as is'], ['start', 'Start if stopped'], ['stop', 'Stop if active']];
    const el = (tag, text) => Object.assign(document.createElement(tag), { textContent: text ?? '' });
    const button = (text, action) => {
      const control = el('button', text);
      control.type = 'button';
      control.addEventListener('click', action);
      return control;
    };
    const label = (text, control) => {
      const field = el('label', text);
      field.append(control);
      return field;
    };
    const options = (items) => items.map(([value, name]) => Object.assign(el('option', name), { value }));
    const select = (items) => {
      const control = el('select');
      control.append(...options(items));
      return control;
    };
    const request = (command) => api.productionModes(command).catch((error) => ({ ok: false, message: error.message }));
    const controls = el('div');
    controls.className = 'obs-mode-controls';
    const settings = el('form');
    settings.className = 'obs-mode-settings';
    settings.hidden = true;
    const fields = el('div');
    fields.className = 'obs-mode-fields';
    const result = el('section');
    result.className = 'obs-mode-result';
    result.hidden = true;
    const status = el('p');
    status.setAttribute('role', 'status');
    const connectionStatus = el('p');
    const review = el('dialog');
    review.id = 'obs-mode-review';
    review.setAttribute('aria-labelledby', 'obs-mode-review-title');
    const reviewTitle = el('h2');
    reviewTitle.id = 'obs-mode-review-title';
    const reviewSteps = el('ol');
    const reviewStatus = el('p');
    reviewStatus.setAttribute('role', 'status');
    const reviewActions = el('div');
    reviewActions.className = 'obs-mode-controls';
    const cancel = button('Cancel', () => closeReview());
    cancel.id = 'obs-mode-review-cancel';
    cancel.autofocus = true;
    const apply = button('Apply mode', () => { void applyMode(); });
    reviewActions.append(cancel, apply);
    review.append(reviewTitle, reviewSteps, reviewStatus, reviewActions);
    document.body.append(review);

    const edit = button('Configure modes', () => openSettings());
    edit.disabled = true;
    edit.setAttribute('aria-expanded', 'false');
    const selectors = Object.entries(titles).map(([id, title]) => {
      const control = button(title, () => { void previewMode(id); });
      control.dataset.obsModePreview = id;
      const hint = el('small');
      control.append(hint);
      const box = el('fieldset');
      const scene = select([]);
      const bus = select([['preview', 'Preview'], ['program', 'Program']]);
      const record = select(outputOptions);
      const stream = select(outputOptions);
      box.dataset.obsMode = id;
      box.append(el('legend', title), label('Scene', scene), label('Scene destination', bus), label('Recording', record), label('Streaming', stream));
      fields.append(box);
      return { id, control, hint, scene, bus, record, stream };
    });
    controls.append(...(settingsOnly ? [edit] : selectors.map(({ control }) => control)));
    const settingsActions = el('div');
    settingsActions.className = 'obs-mode-controls';
    const save = button('Save modes', () => { void saveSettings(); });
    settingsActions.append(save, button('Cancel', () => closeSettings()));
    settings.addEventListener('submit', (event) => event.preventDefault());
    settings.append(fields, settingsActions);
    if (settingsOnly) root.append(controls, settings, status);
    else root.append(controls, connectionStatus, result, status);

    let state;
    let obs = { status: 'disabled', scenes: [] };
    let visible = false;
    let viewOnly = false;
    let busy = false;
    let epoch = 0;
    let loadEpoch = 0;
    let pending;
    let expiry;
    let paintedRun;

    function stepRows(steps) {
      return steps.map((step) => {
        const row = el('li');
        row.dataset.status = step.status;
        row.append(el('strong', step.label), el('span', [stepLabels[step.status], step.message].filter(Boolean).join(' · ')));
        return row;
      });
    }

    function message(value) { status.textContent = value ?? ''; }

    function paint() {
      connectionStatus.textContent = obs.status === 'connected' ? '' : 'Connect OBS to review or apply a production mode.';
      for (const { id, control, hint } of selectors) {
        const mode = state?.config.modes[id];
        const scene = mode?.scene ? `${mode.bus === 'preview' ? 'Preview' : 'Program'} · ${mode.scene}` : '';
        const outputs = ['record', 'stream'].flatMap((key) => mode?.[key] && mode[key] !== 'leave'
          ? [`${mode[key] === 'start' ? 'Start' : 'Stop'} ${key === 'record' ? 'recording' : 'streaming'}`] : []);
        const summary = [scene, ...outputs].filter(Boolean).join(' · ');
        control.disabled = !summary || obs.status !== 'connected' || busy || state?.run?.status === 'running';
        hint.textContent = summary || 'Unconfigured';
      }
      edit.disabled = !state || viewOnly || busy || state?.run?.status === 'running';
      save.disabled = edit.disabled;
      apply.disabled = !pending || viewOnly || busy;
      const run = state?.run;
      result.hidden = !run;
      if (!run || run === paintedRun) return;
      paintedRun = run;
      const heading = el('h3', `${titles[run.mode]} · ${{ running: 'In progress', confirmed: 'Verified', incomplete: 'Incomplete' }[run.status]}`);
      const list = el('ol');
      list.append(...stepRows(run.steps));
      result.replaceChildren(heading, list, ...(run.message ? [el('p', run.message)] : []));
    }

    function fillScenes(field, current) {
      const choices = [...new Set(obs.scenes ?? [])];
      const listed = choices.map((name) => [name, name]);
      if (current && !choices.includes(current)) listed.push([current, `${current} (unavailable)`]);
      field.replaceChildren(...options([['', 'No scene change'], ...listed]));
      field.value = current ?? '';
    }

    function openSettings() {
      if (!visible || edit.disabled) return;
      for (const { id, scene, bus, record, stream } of selectors) {
        const mode = state.config.modes[id];
        fillScenes(scene, mode.scene);
        bus.value = mode.bus;
        record.value = mode.record;
        stream.value = mode.stream;
      }
      message('');
      settings.hidden = false;
      edit.setAttribute('aria-expanded', 'true');
      selectors[0].scene.focus();
    }

    function closeSettings() {
      settings.hidden = true;
      edit.setAttribute('aria-expanded', 'false');
    }

    async function saveSettings() {
      if (!visible || viewOnly || save.disabled) return;
      const config = { version: 1, modes: Object.fromEntries(selectors.map(({ id, scene, bus, record, stream }) => [id, {
        scene: scene.value || null, bus: bus.value, record: record.value, stream: stream.value,
      }])) };
      busy = true;
      paint();
      const result = await request({ type: 'configure', revision: state.revision, config });
      busy = false;
      if (result.ok) {
        state = result.state;
        closeSettings();
      }
      message(result.ok ? 'Production modes saved.' : result.message);
      paint();
    }

    function closeReview() {
      const token = pending?.token;
      pending = undefined;
      clearTimeout(expiry);
      if (review.open) review.close();
      if (token) void request({ type: 'cancel', token });
    }

    async function previewMode(mode) {
      if (!visible || busy || document.querySelector('dialog[open]')) return;
      const requestEpoch = epoch;
      busy = true;
      message('Reading OBS state…');
      paint();
      const result = await request({ type: 'preview', mode });
      busy = false;
      message(result.ok ? '' : result.message);
      if (result.ok) {
        if (!visible || epoch !== requestEpoch || document.querySelector('dialog[open]')) {
          void request({ type: 'cancel', token: result.preview.token });
        } else {
          pending = result.preview;
          reviewTitle.textContent = `Review ${titles[mode]}`;
          apply.textContent = `Apply ${titles[mode]}`;
          reviewStatus.textContent = viewOnly ? 'View-only mode is on.' : '';
          reviewSteps.replaceChildren(...stepRows(pending.steps));
          review.showModal();
          expiry = setTimeout(() => {
            closeReview();
            message('The preview expired. Open it again to apply this mode.');
            paint();
          }, pending.expiresInMs);
        }
      }
      paint();
    }

    async function applyMode() {
      if (!pending || viewOnly || !visible || busy) return;
      const { token } = pending;
      pending = undefined;
      closeReview();
      busy = true;
      message('Applying the reviewed mode…');
      paint();
      const reply = await request({ type: 'apply', token });
      busy = false;
      if (reply.state) state = reply.state;
      message(reply.state ? '' : reply.message);
      paint();
    }

    review.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeReview();
    });
    api.onProductionModes((next) => {
      state = next;
      if (visible) paint();
    });

    return function sync(open, current) {
      const readOnly = document.getElementById('stage')?.hasAttribute('data-view-only') === true;
      const scenesChanged = JSON.stringify(obs.scenes) !== JSON.stringify(current.scenes);
      const sessionChanged = obs.generation !== current.generation || obs.status !== current.status;
      obs = current;
      if (!open || readOnly !== viewOnly || sessionChanged) {
        epoch++;
        closeReview();
      }
      viewOnly = readOnly;
      if (!open || viewOnly) closeSettings();
      if (!settings.hidden && scenesChanged) {
        for (const { scene } of selectors) fillScenes(scene, scene.value);
      }
      if (open && !visible) {
        const openedAt = ++loadEpoch;
        void request({ type: 'read' }).then((result) => {
          if (!visible || loadEpoch !== openedAt) return;
          if (result.ok) state = result.state;
          message(result.ok ? state.warning : result.message);
          paint();
        });
      }
      visible = open;
      if (visible) paint();
    };
  },
};
