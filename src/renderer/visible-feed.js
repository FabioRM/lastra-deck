'use strict';

window.createVisibleFeed = function createVisibleFeed(read, render, { interval = 2_000, error = 'Could not read data.' } = {}) {
  let generation = 0;
  let visible = false;
  let timer;

  async function refresh(token) {
    let state;
    try {
      state = await read();
    } catch {
      state = { error };
    }
    if (token !== generation) return;
    render(state);
    timer = setTimeout(() => refresh(token), typeof interval === 'function' ? interval(state) : interval);
  }

  function reload() {
    generation++;
    clearTimeout(timer);
    if (visible) void refresh(generation);
  }

  function setVisible(next) {
    if (visible === next) return;
    visible = next;
    if (visible) render({ status: 'loading' });
    reload();
  }

  return { setVisible, reload, destroy: () => setVisible(false) };
};
