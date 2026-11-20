'use strict';

{
  function mount(container, read, dispatch) {
    let visible = false;
    let generation = 0;
    const picker = window.LastraSnippetPicker.mount(container, dispatch, {
      filterKinds: true, showHeading: false, onReload: load,
    });

    async function load() {
      if (!visible) return;
      const version = ++generation;
      const empty = { snippets: [], message: 'The snippet library is unavailable.' };
      const state = await read().catch(() => empty);
      if (visible && version === generation) picker.update(Array.isArray(state?.snippets) ? state : empty);
    }

    function setVisible(active) {
      if (visible === active) return;
      visible = active;
      generation++;
      if (visible) void load();
      else picker.hide();
    }

    return { setVisible, destroy: () => setVisible(false) };
  }

  window.LastraSnippetLibrary = { mount };
}
