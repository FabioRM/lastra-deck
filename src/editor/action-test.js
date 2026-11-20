'use strict';

{
  const { WAIT_CONDITIONS, layoutTokens } = window.LastraActionFlow;
  const { actionNames } = window.lastraActionPalette;
  const { element } = window.LastraWidgetComponents;
  const statuses = { succeeded: 'Simulated', failed: 'Failed', warning: 'Continued after a failure', skipped: 'Skipped' };

  function scenarioFields(action) {
    const conditions = new Set();
    const prompts = new Map();
    let target;
    let photoshop = false;
    let shortcut = false;
    let layout = false;
    function visit(step) {
      if (!step) return;
      if (step.condition && ['wait-for', 'if', 'repeat'].includes(step.type)) conditions.add(step.condition);
      target ??= step.targetApps?.[0];
      photoshop ||= step.requiresPhotoshopWorkspace === true;
      shortcut ||= Boolean(step.shortcutGuard);
      layout ||= Boolean(step.shortcutGuard?.layout) || layoutTokens(step.keys);
      step.steps?.forEach(visit);
      if (step.type === 'choose') {
        if (!prompts.has(step.id)) prompts.set(step.id, step);
        step.choices?.forEach((choice) => visit(choice.action));
      }
      if (step.type === 'random') step.pool?.forEach(visit);
      visit(step.then);
      visit(step.else);
    }
    visit(action);
    return { conditions, target, photoshop, shortcut, layout, prompts };
  }

  function renderStep(step) {
    const item = element('li', '');
    item.dataset.status = step.status;
    item.style.marginInlineStart = `${Math.max(0, step.path.length - 1)}em`;
    const path = step.path.map((part) => part === 'then' ? 'If matched' : part === 'else' ? 'Otherwise'
      : typeof part === 'number' ? `Step ${part}` : part);
    const heading = element('div', '');
    heading.append(element('span', '', [...path, actionNames[step.type]].join(' · ')),
      element('strong', '', statuses[step.status]));
    item.append(heading);
    for (const [index, outcome] of step.attempts.entries()) {
      const prefix = step.attempts.length > 1 ? `Attempt ${index + 1} · ` : '';
      if (prefix || outcome.message) item.append(element('p', 'muted', prefix + (outcome.message ?? statuses[outcome.status])));
    }
    return item;
  }

  function createLastraKeyTest(dialog, simulate) {
    const form = dialog.querySelector('form');
    const gestures = dialog.querySelector('#key-test-gesture');
    const states = dialog.querySelector('#key-test-states');
    const run = dialog.querySelector('#simulate-key');
    const status = dialog.querySelector('#key-test-status');
    const steps = dialog.querySelector('#key-test-steps');
    let actions, apps, shortcutLanguage, request = 0;

    function clear() {
      request++;
      run.disabled = false;
      status.textContent = '';
      steps.replaceChildren();
    }

    function renderStates() {
      clear();
      const { conditions, target, photoshop, shortcut, layout, prompts } = scenarioFields(actions.get(gestures.value));
      if (target || apps.length || photoshop || shortcut || layout) conditions.add('foreground');
      const fields = [];
      for (const [id, condition] of Object.entries(WAIT_CONDITIONS)) {
        if (!conditions.has(id)) continue;
        const label = element('label', 'field', `Simulated ${condition.label.toLowerCase()}`);
        let control;
        if (condition.field) {
          control = element('input', '');
          control.maxLength = 160;
          control.placeholder = id === 'foreground' ? 'Code.exe' : window.LastraI18n.t('Unavailable');
          if (id === 'foreground') control.value = target ?? apps[0] ?? (photoshop ? 'photoshop.exe' : '');
        } else {
          control = element('select', '');
          for (const [value, name] of [['', 'Unavailable'], ['true', 'Yes'], ['false', 'No']]) {
            const option = element('option', '', name);
            option.value = value;
            control.append(option);
          }
        }
        control.name = id;
        label.append(control);
        fields.push(label);
      }
      if (photoshop) {
        const label = element('label', 'check', window.LastraI18n.t('Simulate the Photoshop workspace'));
        const control = element('input', '');
        control.name = 'photoshopWorkspace';
        control.type = 'checkbox';
        label.prepend(control);
        fields.push(label);
      }
      if (layout) {
        const label = element('label', 'field', window.LastraI18n.t('Simulated keyboard layout'));
        const control = element('select', '');
        for (const [value, text] of [['', 'Unknown'], ['us', 'US'], ['it', 'Italian'], ['it142', 'Italian (142)']]) {
          const option = element('option', '', text);
          option.value = value;
          control.append(option);
        }
        control.name = 'keyboardLayout';
        label.append(control);
        fields.push(label);
      }
      for (const { id, prompt, choices } of prompts.values()) {
        const label = element('label', 'field', prompt);
        const control = element('select', '');
        control.dataset.choiceSample = id;
        for (const { id: value, label: text } of [{ id: '', label: 'Choose no option · timeout' }, ...choices]) {
          const option = element('option', '', text);
          option.value = value;
          control.append(option);
        }
        label.append(control);
        fields.push(label);
      }
      states.replaceChildren(...fields);
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (run.disabled) return;
      clear();
      const current = request;
      const values = {};
      for (const [id, condition] of Object.entries(WAIT_CONDITIONS)) {
        const value = form.elements.namedItem(id)?.value.trim();
        if (value) values[id] = condition.field ? value : value === 'true';
      }
      const photoshopWorkspace = form.elements.namedItem('photoshopWorkspace')?.checked;
      const keyboardLayout = form.elements.namedItem('keyboardLayout')?.value;
      const answers = Object.fromEntries([...states.querySelectorAll('[data-choice-sample]')].filter((field) => field.value)
        .map((field) => [field.dataset.choiceSample, field.value]));
      run.disabled = true;
      status.textContent = window.LastraI18n.t('Simulating…');
      try {
        const result = await simulate({ action: actions.get(gestures.value), apps, values, answers, photoshopWorkspace, keyboardLayout, shortcutLanguage });
        if (!dialog.open || current !== request) return;
        const outcome = result.message ?? (result.ok ? 'Simulation completed.' : 'Simulation failed.');
        status.textContent = outcome + (result.elapsedMs ? ` · ${result.elapsedMs} ms simulated` : '');
        const traced = result.steps.length > 1 && result.steps[0].status === 'succeeded' ? result.steps.slice(1) : result.steps;
        steps.replaceChildren(...traced.map(renderStep));
      } catch (error) {
        if (dialog.open && current === request) status.textContent = error.message;
      } finally {
        if (current === request) run.disabled = false;
      }
    });
    gestures.addEventListener('change', renderStates);
    states.addEventListener('input', clear);
    dialog.querySelector('#close-key-test').addEventListener('click', () => dialog.close());

    return (key, pageApps, language) => {
      if (dialog.open) return;
      apps = pageApps;
      shortcutLanguage = language;
      actions = new Map([[key.confirm ? 'Confirmed action' : 'Tap', key.action],
        ['Long press', key.hold], ['Double tap', key.double]].filter(([, action]) => action));
      gestures.replaceChildren(...[...actions.keys()].map((label) => element('option', '', label)));
      renderStates();
      dialog.showModal();
    };
  }

  window.createLastraKeyTest = createLastraKeyTest;
}
