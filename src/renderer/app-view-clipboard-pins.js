'use strict';

{
  const { element, button } = window.LastraDom;

  function mount(container, read, dispatch) {
    const root = element('section', 'clipboard-pins');
    const toolbar = element('div', 'clipboard-pins-toolbar');
    const list = element('div', 'clipboard-pins-list');
    const reviewPane = element('section', 'clipboard-pins-review');
    const heading = element('h4', '');
    heading.tabIndex = -1;
    const text = element('pre', 'clipboard-pins-text');
    const labelWrap = element('label', 'clipboard-pins-label', 'Pin name');
    const label = element('input', '');
    label.type = 'text';
    label.inputMode = 'none';
    label.maxLength = 80;
    label.autocomplete = 'off';
    const keyboard = element('div', 'clipboard-pins-keyboard');
    keyboard.setAttribute('aria-label', 'Touch keyboard');
    keyboard.hidden = true;
    labelWrap.append(label);
    const actions = element('div', 'clipboard-pins-toolbar');
    const removal = element('div', 'clipboard-pins-toolbar');
    const notice = element('p', 'app-view-secondary clipboard-pins-notice');
    const feedback = element('p', 'app-view-secondary clipboard-pins-feedback');
    feedback.setAttribute('role', 'status');
    let state;
    let review;
    let expires;
    let confirming = false;
    let visible = false;
    let busy = false;
    let generation = 0;
    let listSignature;

    const capture = button('Capture clipboard text', () => run({ action: 'capture' }, showReview));
    const reload = button('Reload pins', () => void load(), { className: 'clipboard-pins-reload' });
    const pin = button('Pin text', () => run({ action: 'pin', token: review?.token, label: label.value }, async () => {
      dropReview(false);
      await load();
      feedback.textContent = 'Text pinned.';
    }));
    const copy = button('Copy to clipboard', () => run({ action: 'copy', token: review?.token }, () => {
      feedback.textContent = 'Copied to clipboard.';
    }));
    const up = button('Move up', () => run({ action: 'move', id: review?.id, direction: 'up' }, load));
    const down = button('Move down', () => run({ action: 'move', id: review?.id, direction: 'down' }, load));
    const remove = button('Remove pin', () => { confirming = true; render(); });
    const keep = button('Keep pin', () => { confirming = false; render(); });
    const confirm = button('Remove', () => run({ action: 'remove', id: review?.id }, async () => {
      dropReview(false);
      await load();
      feedback.textContent = 'Pin removed.';
    }));
    const close = button('Close preview', () => dropReview(), { className: 'clipboard-pins-close' });
    toolbar.append(capture, reload);
    actions.append(pin, copy, up, down, remove, close);
    removal.append(element('span', '', 'Remove this pin?'), keep, confirm);
    reviewPane.append(heading, text, labelWrap, keyboard, actions, removal);
    root.append(toolbar, notice, list, reviewPane, feedback);
    container.replaceChildren(root);

    function render() {
      const pins = state?.pins ?? [];
      const index = pins.findIndex((item) => item.id === review?.id);
      const newPin = review?.kind === 'capture';
      const saved = review?.kind === 'saved';
      const full = pins.length >= (state?.limit ?? Infinity);
      capture.disabled = busy || !state || state.mode === 'invalid' || full;
      reload.disabled = busy;
      notice.textContent = state?.mode === 'invalid' ? 'The protected clipboard pin file could not be read.'
        : state?.mode === 'session' ? 'Pins are available until Lastra closes.'
          : full ? 'Remove a pin to make room for another.' : pins.length ? '' : 'Capture clipboard text to add a pin.';
      const signature = JSON.stringify(pins);
      if (signature !== listSignature) {
        listSignature = signature;
        list.replaceChildren(...pins.map(({ id, label: name }) => {
          const select = button(name, () => run({ action: 'preview', id }, showReview));
          select.dataset.pinId = id;
          return select;
        }));
      }
      for (const select of list.children) {
        select.setAttribute('aria-pressed', String(review?.id === select.dataset.pinId));
        select.disabled = busy;
      }
      reviewPane.hidden = !review;
      heading.textContent = newPin ? 'Captured text' : review?.label ?? '';
      text.textContent = review?.text ?? '';
      labelWrap.hidden = !newPin;
      label.disabled = busy;
      pin.hidden = !newPin;
      pin.disabled = busy || !label.value.trim();
      copy.hidden = up.hidden = down.hidden = remove.hidden = !saved;
      copy.disabled = remove.disabled = busy;
      up.disabled = busy || index <= 0;
      down.disabled = busy || index < 0 || index >= pins.length - 1;
      removal.hidden = !confirming;
      keep.disabled = confirm.disabled = busy;
    }

    function dropReview(discard = true) {
      const previous = review;
      clearTimeout(expires);
      review = undefined;
      confirming = false;
      label.value = '';
      keyboard.hidden = true;
      render();
      if (discard && previous) void dispatch({ action: 'discard', token: previous.token }, true);
    }

    function showReview(result) {
      dropReview(false);
      review = result.review;
      render();
      heading.focus({ preventScroll: true });
      expires = setTimeout(() => {
        dropReview();
        feedback.textContent = 'Preview expired. Open it again.';
      }, Math.max(0, review.expiresAt - Date.now()));
    }

    async function run(command, apply) {
      if (!visible || busy) return;
      const version = generation;
      busy = true;
      feedback.textContent = '';
      render();
      try {
        const result = await dispatch(command);
        if (visible && generation === version) {
          if (result?.ok) await apply(result);
        } else if (result?.review) void dispatch({ action: 'discard', token: result.review.token }, true);
      } finally {
        if (generation === version) {
          busy = false;
          render();
        }
      }
    }

    async function load() {
      const version = generation;
      let result;
      try { result = await read(); } catch { /* Show unavailable below. */ }
      if (visible && generation === version) {
        state = Array.isArray(result?.pins) ? result : { mode: 'invalid', pins: [] };
        render();
      }
    }

    label.addEventListener('click', () => { keyboard.hidden = false; });
    label.addEventListener('input', () => { pin.disabled = busy || !label.value.trim(); });
    window.mountLastraTouchKeyboard(keyboard, { extended: true, extraLetters: 'àèéìòù', getValue: () => label.value,
      setValue(value) {
        if (busy || value.length > label.maxLength) return;
        label.value = value;
        label.dispatchEvent(new Event('input'));
      },
      done: () => { keyboard.hidden = true; },
    });

    function viewOnly(event) {
      if (event.detail) {
        generation++;
        busy = false;
        dropReview();
      }
    }
    document.addEventListener('lastra:view-only', viewOnly);

    function setVisible(active) {
      if (visible === active) return;
      visible = active;
      generation++;
      busy = false;
      if (active) void load();
      else dropReview();
    }
    render();
    return { setVisible, destroy() { document.removeEventListener('lastra:view-only', viewOnly); setVisible(false); } };
  }

  window.LastraClipboardPins = { mount };
}
