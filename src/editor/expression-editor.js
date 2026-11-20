'use strict';

window.createLastraExpressionEditor = function createLastraExpressionEditor(dialog) {
  const heading = dialog.querySelector('h2');
  const instructions = dialog.querySelector('[data-expression-instructions]');
  const source = dialog.querySelector('textarea');
  const status = dialog.querySelector('[role="status"]');
  const reset = dialog.querySelector('[data-expression-reset]');
  let current;

  function read() {
    let value;
    try { value = JSON.parse(source.value); }
    catch { throw new Error(window.LastraI18n.t('Enter valid JSON to continue.')); }
    return { value, sample: current.inspect(value) };
  }

  dialog.querySelector('[data-expression-preview]').addEventListener('click', () => {
    try { status.textContent = read().sample; }
    catch (error) { status.textContent = error.message; }
  });
  dialog.querySelector('[data-expression-apply]').addEventListener('click', () => {
    try {
      const { value } = read();
      current.apply(value);
      dialog.close();
    } catch (error) { status.textContent = error.message; }
  });
  reset.addEventListener('click', () => {
    current.clear();
    dialog.close();
  });
  dialog.querySelector('[data-expression-close]').addEventListener('click', () => dialog.close());

  return (config) => {
    current = config;
    heading.textContent = config.title;
    instructions.textContent = config.instructions;
    source.value = JSON.stringify(config.value ?? config.example, null, 2);
    status.textContent = '';
    reset.hidden = !config.clear;
    dialog.showModal();
    source.focus();
  };
};
