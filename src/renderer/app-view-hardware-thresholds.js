'use strict';

{
  const { element } = window.LastraWidgetComponents;
  const states = { active: 'Alerting', pending: 'Confirming', normal: 'In range', unavailable: 'Reading unavailable' };
  const colors = { active: 'down', pending: 'retrying', normal: 'up' };
  const valueFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

  function card(rule) {
    const root = element('article', 'service-check');
    root.dataset.ruleId = rule.id;
    root.tabIndex = -1;
    const header = element('header');
    const state = element('span', 'service-check-state', states[rule.state]);
    state.dataset.state = colors[rule.state] ?? '';
    header.append(element('h4', '', rule.name), state);
    const condition = rule.direction === 'above' ? 'at or above' : 'at or below';
    const value = Number.isFinite(rule.value) ? ` · Now ${valueFormat.format(rule.value)} ${rule.unit}` : '';
    root.append(header, element('p', 'app-view-secondary',
      `${rule.metricName} ${condition} ${rule.limit} ${rule.unit} for ${rule.holdSeconds} s${value}`));
    return root;
  }

  function mount(container, read, dispatch) {
    const root = element('section', 'service-health');
    const toolbar = element('header');
    const edit = element('button', '', 'Edit thresholds');
    edit.type = 'button';
    const notice = element('p', 'service-health-notice');
    notice.setAttribute('role', 'status');
    const list = element('div', 'service-health-list');
    toolbar.append(edit);
    root.append(toolbar, notice, list);
    container.replaceChildren(root);
    let signature;
    let target;

    edit.addEventListener('click', async () => {
      edit.disabled = true;
      try { await dispatch({ action: 'configure' }); } finally { edit.disabled = false; }
    });

    function focusItem(id) {
      target = id;
      const item = list.querySelector(`[data-rule-id="${CSS.escape(id)}"]`);
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
        item.focus({ preventScroll: true });
        target = null;
      }
    }

    function render(state) {
      const next = JSON.stringify(state);
      if (next === signature) return;
      signature = next;
      const rules = state.rules ?? [];
      notice.textContent = state.error ?? (state.status === 'loading' ? 'Reading thresholds…'
        : rules.length ? '' : 'Add a rule to monitor a hardware reading.');
      list.replaceChildren(...rules.map(card));
      if (target) focusItem(target);
    }

    return { ...window.createVisibleFeed(read, render, { error: 'Could not read hardware thresholds.' }), focusItem };
  }

  window.LastraHardwareThresholds = { mount };
}
