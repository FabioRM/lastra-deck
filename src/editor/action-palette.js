'use strict';

{
  const actions = [
    { id: 'launch', name: 'Launch program', category: 'Apps & files', help: 'Start an executable or switch to its open window.', example: 'notepad.exe' },
    { id: 'open', name: 'Open link or file', category: 'Apps & files', help: 'Open a URL, file, or folder in its default app.', example: 'https://example.com' },
    { id: 'workspace', name: 'Restore workspace', category: 'Apps & files', help: 'Open a saved group of apps and position their windows.', example: 'work' },
    { id: 'hotkey', name: 'Keyboard shortcut', category: 'Keyboard', help: 'Send a key combination to the foreground app.', example: 'Ctrl+Shift+S' },
    { id: 'text', name: 'Type text', category: 'Keyboard', help: 'Enter text in the foreground app.', example: 'Meeting notes' },
    { id: 'media', name: 'Media key', category: 'Audio & media', help: 'Control playback or speaker volume.', example: 'Play / pause' },
    { id: 'spotify-playback', name: 'Spotify play or pause', category: 'Audio & media', help: 'Toggle the Spotify desktop session reported by Windows.', example: 'Spotify playback' },
    { id: 'obs-scene', name: 'Select OBS scene', category: 'Audio & media', help: 'Select a scene on the configured OBS program or preview bus and wait for OBS to confirm it.', example: 'Change to Wide shot' },
    { id: 'sound', name: 'Play sound', category: 'Audio & media', help: 'Play an audio clip on a Windows output, or stop every clip.', example: 'Applause on the speakers' },
    { id: 'audio', name: 'Toggle device mute', category: 'Audio & media', help: 'Mute or unmute the speakers or microphones.', example: 'Microphone' },
    { id: 'timer', name: 'Timer', category: 'Timers', help: 'Start, pause or resume a named countdown or stopwatch and show its time on the key.', example: 'Tea · 3:00' },
    { id: 'delay', name: 'Delay', category: 'Flow', help: 'Wait before the next action runs.', example: '250 ms' },
    { id: 'wait-for', name: 'Wait for state', category: 'Flow', help: 'Wait for a Windows or OBS condition to match within a timeout.', example: 'Foreground app is Code.exe' },
    { id: 'if', name: 'If / else', category: 'Flow', help: 'Choose an action by the current Windows or OBS state.', example: 'If microphones are muted → Open meeting notes' },
    { id: 'sequence', name: 'Sequence', category: 'Flow', help: 'Run several actions in order.', example: 'Launch program → Delay → Keyboard shortcut' },
    { id: 'repeat', name: 'Bounded repeat', category: 'Flow', help: 'Run several actions a limited number of times, optionally while a condition matches.', example: 'Three short steps while the same app stays active' },
    { id: 'choose', name: 'Ask for a choice', category: 'Flow', help: 'Pause for a selection on the deck and run the action assigned to that choice.', example: 'Choose a setup or review workflow' },
    { id: 'random', name: 'Random action', category: 'Flow', help: 'Run one action picked at random from a list each time the key is pressed.', example: 'One of three greetings' },
    { id: 'macro', name: 'Run shared macro', category: 'Shared', help: 'Reuse a saved macro with parameters specific to this key.', example: 'Start meeting with the selected scene' },
  ];

  const actionNames = Object.fromEntries(actions.map(({ id, name }) => [id, name]));

  function findActions(query, category, allowed, translate = (value) => value) {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return actions.filter((action) => {
      if ((category && action.category !== category) || (allowed && !allowed.includes(action.id))) return false;
      const captions = Object.values(action);
      const searchable = [...captions, ...captions.map((value) => translate(value))].join(' ').toLowerCase();
      return terms.every((term) => searchable.includes(term));
    });
  }

  function createActionPalette(dialog) {
    const { t } = window.LastraI18n;
    const search = dialog.querySelector('input');
    const category = dialog.querySelector('select');
    const results = dialog.querySelector('.palette-results');
    const empty = dialog.querySelector('.palette-empty');
    let allowed = [];
    let current;
    let choose;

    function addText(parent, tag, text, className = '') {
      const el = document.createElement(tag);
      el.className = className;
      el.textContent = text;
      parent.append(el);
      return el;
    }

    function render() {
      results.replaceChildren();
      const matches = findActions(search.value, category.value, allowed, t);
      empty.hidden = matches.length > 0;
      let lastCategory;
      for (const action of matches) {
        if (action.category !== lastCategory) {
          addText(results, 'h3', t(action.category));
          lastCategory = action.category;
        }
        const button = addText(results, 'button', '', 'palette-action');
        button.type = 'button';
        button.dataset.action = action.id;
        if (action.id === current) button.setAttribute('aria-current', 'true');
        addText(button, 'strong', t(action.name));
        addText(button, 'span', t(action.help));
        addText(button, 'code', t(action.example));
        button.addEventListener('click', () => {
          dialog.close();
          choose(action.id);
        });
      }
    }

    search.addEventListener('input', render);
    category.addEventListener('change', render);
    dialog.querySelector('.palette-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
      const buttons = [...results.querySelectorAll('button')];
      if (event.key === 'Enter' && event.target === search && buttons.length) {
        event.preventDefault();
        buttons[0].click();
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const index = buttons.indexOf(event.target);
      if (index < 0 && event.target !== search) return;
      const destination = buttons[index + (event.key === 'ArrowDown' ? 1 : -1)] ?? search;
      event.preventDefault();
      destination.focus();
    });

    return (typeIds, currentType, onChoose) => {
      allowed = typeIds;
      current = currentType;
      choose = onChoose;
      search.value = '';
      category.replaceChildren(new Option(t('All categories'), ''));
      for (const item of new Set(findActions('', '', allowed).map((action) => action.category))) {
        category.append(new Option(t(item), item));
      }
      render();
      dialog.showModal();
      search.focus();
    };
  }

  if (typeof module === 'object') module.exports = { actionNames, findActions };
  else window.lastraActionPalette = { actionNames, createActionPalette };
}
