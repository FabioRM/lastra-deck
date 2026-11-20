'use strict';

{
  const { t } = window.LastraI18n;
  const cancel = document.querySelector('#cancel');
  const approve = document.querySelector('#approve');
  const editor = document.querySelector('#open-editor');
  const target = document.querySelector('#target');
  cancel.addEventListener('click', () => window.lastraReview.answer(false));
  approve.addEventListener('click', () => {
    approve.disabled = true;
    window.lastraReview.answer(true);
  });
  editor.addEventListener('click', () => {
    editor.disabled = approve.disabled = true;
    window.lastraReview.answer('editor');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') window.lastraReview.answer(false);
  });

  function node(tag, value) {
    const element = document.createElement(tag);
    if (value !== undefined) element.textContent = value;
    return element;
  }

  function reading(label, value) {
    const container = node('div');
    container.append(node('h3', t(label)), node('pre', value === undefined ? t('Absent') : JSON.stringify(value, null, 2)));
    return container;
  }

  window.lastraReview.state().then((proposal) => {
    document.querySelector('#operation').textContent = t(proposal.operation);
    const action = proposal.kind === 'action';
    const choice = proposal.kind === 'choice';
    const subject = t('Agent {id} · {target}', { id: proposal.caller, target: proposal.target });
    const page = proposal.page ? ' · ' + t('Page: {name}', { name: proposal.page }) : '';
    target.textContent = action || choice ? subject : subject + page + ' · ' + t('{number} changes', { number: proposal.changes.length });
    const changes = document.createDocumentFragment();
    if (choice) {
      const question = node('p', proposal.question);
      question.className = 'choice-question';
      changes.append(question);
      for (const { id, label, effect } of proposal.choices) {
        const section = node('article');
        section.className = 'choice-option';
        const button = node('button', t('Choose {option}', { option: label }));
        button.type = 'button';
        button.addEventListener('click', () => {
          for (const option of document.querySelectorAll('.choice-option button')) option.disabled = true;
          window.lastraReview.answer({ choice: id });
        });
        section.append(node('h2', label), node('p', effect), button);
        changes.append(section);
      }
    } else if (action) {
      for (const { field, value } of proposal.details) {
        const section = node('article');
        section.append(node('h2', field), node('pre', typeof value === 'string' ? value : JSON.stringify(value, null, 2)));
        changes.append(section);
      }
    } else {
      for (const { field, before, after } of proposal.changes) {
        const section = node('article');
        const values = node('div');
        values.className = 'values';
        values.append(reading('Current', before), reading('Proposed', after));
        section.append(node('h2', field), values);
        changes.append(section);
      }
    }
    const details = document.querySelector('#changes');
    details.setAttribute('aria-label', t(choice ? 'Decision options' : action ? 'Saved action and target' : 'Proposed changes'));
    details.replaceChildren(changes);
    approve.disabled = false;
    approve.hidden = choice || Boolean(proposal.editorOnly);
    editor.hidden = !proposal.allowEditor;
  }).catch(() => { target.textContent = t('The proposed changes are unavailable.'); });
}
