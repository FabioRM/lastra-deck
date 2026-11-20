'use strict';

(() => {
  const api = window.lastra;
  if (!api?.onMacroChoice) return;
  const dialog = document.getElementById('macro-choice');
  const options = document.getElementById('macro-choice-options');
  const prompt = document.getElementById('macro-choice-title');
  const status = document.getElementById('macro-choice-status');
  const cancel = document.getElementById('macro-choice-cancel');
  let active;
  let busy = false;

  async function answer(id) {
    if (!active || busy) return;
    const { token } = active;
    busy = true;
    for (const button of dialog.querySelectorAll('button')) button.disabled = true;
    try {
      const accepted = await api.answerMacroChoice(token, id);
      if (active?.token === token && accepted !== true) status.textContent = 'That choice is no longer available.';
    } catch {
      if (active?.token === token) status.textContent = 'Could not send the choice.';
    } finally {
      if (active?.token === token) {
        busy = false;
        for (const button of dialog.querySelectorAll('button')) button.disabled = false;
      }
    }
  }

  cancel.addEventListener('click', () => void answer(null));
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    void answer(null);
  });
  api.onMacroChoice((next) => {
    active = next;
    busy = false;
    cancel.disabled = false;
    if (!next) {
      if (dialog.open) dialog.close();
      options.replaceChildren();
      return;
    }
    status.textContent = '';
    prompt.textContent = next.prompt;
    options.replaceChildren(...next.choices.map(({ id, label }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => void answer(id));
      return button;
    }));
    if (!dialog.open) dialog.showModal();
  });
})();
