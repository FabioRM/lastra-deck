'use strict';

window.mountLastraTouchKeyboard = function mountTouchKeyboard(root, { getValue, setValue, done, extended = false, extraLetters = '' }) {
  const letterKeys = [];
  let shifted = false;
  const row = () => {
    const item = document.createElement('div');
    item.className = 'app-views-keyboard-row';
    root.append(item);
    return item;
  };
  const button = (parent, text, action) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = text;
    item.addEventListener('click', action);
    parent.append(item);
    return item;
  };
  const insert = (character) => setValue(getValue() + character);

  if (extended) {
    const numbers = row();
    for (const digit of '1234567890') button(numbers, digit, () => insert(digit));
  }
  for (const letters of ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM', ...(extraLetters ? [extraLetters.toUpperCase()] : [])]) {
    const keys = row();
    for (const letter of letters) {
      const key = button(keys, letter, () => insert(shifted ? letter : letter.toLowerCase()));
      letterKeys.push(key);
      if (extended) key.textContent = letter.toLowerCase();
    }
  }
  if (extended) {
    const punctuation = row();
    for (const character of ".,?!/@-_:") button(punctuation, character, () => insert(character));
  }
  const actions = row();
  if (extended) {
    const shift = button(actions, 'Shift', () => {
      shifted = !shifted;
      shift.setAttribute('aria-pressed', String(shifted));
      for (const key of letterKeys) key.textContent = shifted ? key.textContent.toUpperCase() : key.textContent.toLowerCase();
    });
    shift.setAttribute('aria-pressed', 'false');
  }
  button(actions, 'Delete', () => setValue(Array.from(getValue()).slice(0, -1).join('')));
  button(actions, 'Space', () => insert(' '));
  button(actions, 'Clear', () => setValue(''));
  button(actions, 'Done', done);
};
