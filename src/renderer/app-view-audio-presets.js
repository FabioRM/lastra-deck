'use strict';

(() => {
  const { element, button } = window.LastraDom;

  function mount(container, read, dispatch) {
    const section = element('section', 'audio-presets-view');
    const group = element('div', 'audio-presets-buttons');
    group.setAttribute('aria-label', 'Activity presets');
    group.setAttribute('role', 'group');
    const review = element('div', 'audio-presets-review');
    const status = element('p', 'app-view-secondary');
    status.setAttribute('role', 'status');
    section.append(group, review, status);
    container.append(section);
    let visible = false;
    let view;
    let selected = 'main';
    let pending = false;
    let version = 0;

    async function refresh() {
      const ticket = ++version;
      try {
        const snapshot = await read();
        if (!visible || ticket !== version) return;
        view = snapshot;
        render();
      } catch {
        if (visible && ticket === version) status.textContent = 'Windows audio presets are unavailable.';
      }
    }

    async function change(command) {
      if (pending) return;
      pending = true;
      status.textContent = '';
      render();
      try {
        const outcome = await dispatch(command);
        if (visible && outcome?.message) status.textContent = outcome.message;
      } finally {
        pending = false;
        if (visible) await refresh();
      }
    }

    function render() {
      if (!view?.presets) return;
      group.replaceChildren(...view.presets.map(({ id, name }) => {
        const control = button(name, () => { selected = id; status.textContent = ''; render(); }, { className: 'audio-preset-select' });
        control.setAttribute('aria-pressed', String(id === selected));
        control.disabled = pending;
        return control;
      }));
      const preset = view.presets.find(({ id }) => id === selected);
      if (!preset) return;
      const dimensions = element('dl', 'audio-preset-levels');
      for (const channel of preset.channels) {
        const row = element('div', '');
        const caption = channel.name === channel.label ? channel.label : `${channel.label} · ${channel.name}`;
        row.append(element('dt', '', caption), element('dd', '', channel.available ? `${channel.current}% → ${channel.saved}%`
          : `Saved ${channel.saved}% · Device changed or unavailable`));
        dimensions.append(row);
      }
      const operations = element('div', 'audio-presets-buttons');
      const capture = button(preset.channels.length ? 'Replace with current levels' : 'Save current levels', () =>
        void change({ action: 'capture', preset: selected }));
      capture.disabled = pending || !view.canCapture;
      const apply = button('Apply shown levels', () => void change({ action: 'apply', preset: selected, token: preset.token }));
      apply.disabled = pending || !preset.token;
      const recheck = button('Refresh levels', () => void refresh(), { className: 'audio-preset-refresh' });
      recheck.disabled = pending;
      operations.append(capture, apply, recheck);
      review.replaceChildren(preset.channels.length ? dimensions : element('p', 'app-view-secondary', 'No levels saved.'), operations);
    }

    return {
      setVisible(value) {
        if (visible === value) return;
        visible = value;
        if (visible) void refresh();
        else version++;
      },
      destroy() { visible = false; version++; section.remove(); },
    };
  }

  window.LastraAudioPresets = { mount };
})();
