'use strict';

(() => {
  const api = window.lastra;
  if (!api?.getEmojiCatalog) return;
  const { t } = window.LastraI18n;
  const byId = (id) => document.getElementById('emoji-' + id);
  const tab = byId('tab');
  const panel = byId('panel');
  const search = byId('search');
  const keyboard = byId('keyboard');
  const type = byId('type');
  const categories = byId('categories');
  const browser = byId('browser');
  const grid = byId('grid');
  const tones = byId('tones');
  const toneOptions = byId('tone-options');
  const status = byId('status');
  const stage = document.getElementById('stage');
  const frequentGroup = { id: 'frequent', label: 'Frequently used', icon: '🕒' };
  const searchTerm = (value) => value.normalize('NFKD').toLowerCase().replace(/[\p{M}\uFE0F]/gu, '');
  const searchAliases = { '2615': 'coffee', '26a1': 'lightning', '1f3ae': 'controller', '1f50d': 'magnifying glass' };
  const holdMs = 500;
  let entries = [];
  let byEntry = new Map();
  let preferredTones = {};
  let groups = [];
  let sections = new Map();
  let renderedQuery;
  let session = 0;
  let pointer;
  let toneKey;
  let hoveredTone;
  let skipClick = false;

  function keyboardOpen(open, restoreFocus = true) {
    if (open) closeTones();
    keyboard.hidden = !open;
    browser.hidden = open;
    type.setAttribute('aria-expanded', String(open));
    if (!open) {
      if (renderedQuery !== search.value) render();
      syncCategory();
      if (restoreFocus) type.focus({ preventScroll: true });
    }
  }

  function renderCategories() {
    categories.hidden = !groups.length;
    categories.replaceChildren(...groups.map(({ id, icon, label }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.group = id;
      button.setAttribute('aria-controls', grid.id);
      const picture = document.createElement('span');
      picture.className = 'emoji-category-icon';
      picture.setAttribute('aria-hidden', 'true');
      picture.textContent = icon;
      button.append(picture, t(label));
      return button;
    }));
  }

  function syncCategory() {
    if (browser.hidden) return;
    let current;
    const top = Math.ceil(grid.scrollTop);
    for (const [id, section] of sections) {
      if (section.offsetTop > top) break;
      current = id;
    }
    for (const button of categories.children) {
      if (button.dataset.group === current) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
    }
  }

  function renderTiles(matches) {
    const tiles = document.createElement('div');
    tiles.className = 'emoji-tiles';
    for (const entry of matches) {
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'emoji-key';
      key.dataset.base = entry.id;
      if (entry.tones) {
        key.setAttribute('aria-controls', tones.id);
        key.setAttribute('aria-expanded', 'false');
        key.setAttribute('aria-description', window.LastraI18n.t('Hold or press Alt+Down Arrow for skin tones.'));
      }
      updateKey(key, entry);
      tiles.append(key);
    }
    return tiles;
  }

  function render() {
    closeTones();
    renderedQuery = search.value;
    const words = renderedQuery.trim().split(/\s+/).filter(Boolean)
      .map((word) => ({ word, normalized: searchTerm(word) }));
    sections = new Map();
    if (words.length) {
      const matches = entries.filter(({ searchable }) => searchable.some(({ keywords, glyph }) =>
        words.every(({ word, normalized }) => (normalized && keywords.includes(normalized)) || glyph.includes(word))));
      grid.replaceChildren(renderTiles(matches));
      if (entries.length) status.textContent = matches.length ? '' : window.LastraI18n.t('No matching emoji');
    } else {
      for (const { id, label, items } of groups) {
        const section = document.createElement('section');
        section.className = 'emoji-group';
        section.id = 'emoji-group-' + id;
        const title = document.createElement('h3');
        title.textContent = t(label);
        section.append(title, renderTiles(items));
        sections.set(id, section);
      }
      grid.replaceChildren(...sections.values());
      if (entries.length) status.textContent = '';
    }
    grid.scrollTop = 0;
    syncCategory();
  }
  document.addEventListener('lastra-language', () => {
    if (panel.hidden || !entries.length) return;
    renderCategories();
    render();
  });

  function updateKey(key, entry) {
    const preferred = entry.tones?.find(({ id }) => id === preferredTones[entry.id]) ?? entry;
    key.dataset.emoji = preferred.id;
    key.textContent = preferred.glyph;
    key.title = preferred.label;
    key.setAttribute('aria-label', preferred.label);
  }

  function highlightTone(choice) {
    hoveredTone?.removeAttribute('data-hovered');
    hoveredTone = choice;
    hoveredTone?.setAttribute('data-hovered', '');
  }

  function closeTones(restoreFocus = false) {
    if (!toneKey) return;
    toneKey.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toneKey.focus({ preventScroll: true });
    toneKey = undefined;
    highlightTone();
    tones.hidden = true;
  }

  function openTones(key, focus = false) {
    const entry = byEntry.get(key?.dataset.base);
    if (!entry?.tones || stage.hasAttribute('data-view-only')) return false;
    closeTones();
    toneKey = key;
    key.setAttribute('aria-expanded', 'true');
    tones.toggleAttribute('data-paired', entry.tones.length > 5);
    toneOptions.replaceChildren(...[entry, ...entry.tones].map(({ id, glyph, label }) => {
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.className = 'emoji-tone-choice';
      choice.dataset.emoji = id;
      choice.textContent = glyph;
      choice.title = label;
      choice.setAttribute('aria-label', label);
      if (id === key.dataset.emoji) choice.setAttribute('aria-current', 'true');
      return choice;
    }));
    tones.style.left = tones.style.top = '0px';
    tones.hidden = false;
    const frame = panel.getBoundingClientRect();
    const anchor = key.getBoundingClientRect();
    const scale = frame.width / panel.offsetWidth || 1;
    const width = tones.offsetWidth;
    const height = tones.offsetHeight;
    const left = (anchor.left + anchor.width / 2 - frame.left) / scale - width / 2;
    const above = (anchor.top - frame.top) / scale - 8;
    const below = (anchor.bottom - frame.top) / scale + 8;
    const top = above >= height || panel.clientHeight - below < above ? above - height : below;
    tones.style.left = Math.max(0, Math.min(left, panel.clientWidth - width)) + 'px';
    tones.style.top = Math.max(0, Math.min(top, panel.clientHeight - height)) + 'px';
    if (focus) toneOptions.querySelector('[aria-current]')?.focus({ preventScroll: true });
    return true;
  }

  function setSearch(value) {
    search.value = value.slice(0, search.maxLength);
    if (keyboard.hidden) render();
  }

  function close(restoreFocus = false) {
    if (panel.hidden) return;
    session++;
    endPress();
    closeTones();
    window.LastraDeckViews.setPanel(panel, false);
    tab.setAttribute('aria-expanded', 'false');
    if (restoreFocus) tab.focus({ preventScroll: true });
  }

  async function open() {
    const current = ++session;
    window.LastraDeckViews.setPanel(panel, true);
    tab.setAttribute('aria-expanded', 'true');
    // Keep positions fixed until the next visit, even when a key gains a use.
    entries = [];
    byEntry = new Map();
    groups = [];
    search.value = '';
    renderCategories();
    render();
    keyboardOpen(false, false);
    status.textContent = window.LastraI18n.t('Loading emoji…');
    try {
      const catalog = await api.getEmojiCatalog();
      if (current !== session) return;
      entries = catalog.entries.map((entry) => ({ ...entry,
        searchable: [entry, ...(entry.tones ?? [])].map(({ id, glyph, label }) => ({
          glyph, keywords: searchTerm(label + ' ' + (searchAliases[id] || '')),
        })),
      }));
      byEntry = new Map(entries.map((entry) => [entry.id, entry]));
      preferredTones = catalog.tones;
      const entriesByGroup = Map.groupBy(entries, ({ group }) => group);
      groups = catalog.groups.map((group) => ({ ...group, items: entriesByGroup.get(group.id) }));
      if (catalog.frequent.length) {
        groups.unshift({ ...frequentGroup, items: catalog.frequent.map((id) => byEntry.get(id)) });
      }
      renderCategories();
      renderedQuery = undefined;
      if (keyboard.hidden) render();
      else status.textContent = '';
    } catch {
      if (current === session) status.textContent = window.LastraI18n.t('The emoji catalog is unavailable.');
    }
  }

  async function pick(key, id = key?.dataset.emoji) {
    if (!key?.isConnected || panel.hidden || browser.hidden || stage.hasAttribute('data-view-only')) return;
    const current = session;
    try {
      const result = await api.insertEmoji(id);
      if (current !== session) return;
      status.textContent = result.message || '';
      if (result.ok) {
        const entry = byEntry.get(key.dataset.base);
        if (entry.tones) {
          preferredTones[entry.id] = id;
          for (const button of grid.querySelectorAll('[data-base="' + entry.id + '"]')) updateKey(button, entry);
        }
      }
    } catch {
      if (current === session) status.textContent = window.LastraI18n.t('The emoji could not be inserted.');
    }
  }

  function chooseTone(choice, restoreFocus = false) {
    const key = toneKey;
    const id = choice.dataset.emoji;
    closeTones(restoreFocus);
    void pick(key, id);
  }

  function endPress() {
    clearTimeout(pointer?.timer);
    pointer = undefined;
  }

  window.mountLastraTouchKeyboard(keyboard, {
    getValue: () => search.value, setValue: setSearch, done: () => keyboardOpen(false),
  });
  tab.addEventListener('click', () => { if (panel.hidden) void open(); else close(true); });
  panel.addEventListener('lastra:close-view', () => close());
  categories.addEventListener('click', (event) => {
    const button = event.target.closest('[data-group]');
    if (!button) return;
    if (search.value) setSearch('');
    grid.scrollTop = sections.get(button.dataset.group).offsetTop;
    syncCategory();
  });
  type.addEventListener('click', () => keyboardOpen(keyboard.hidden));
  search.addEventListener('click', () => keyboardOpen(true));
  search.addEventListener('input', () => setSearch(search.value));
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') keyboardOpen(false);
  });
  document.addEventListener('pointerdown', (event) => {
    skipClick = false;
    if (toneKey && !tones.contains(event.target)) closeTones();
  }, true);
  grid.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (!event.isPrimary) {
      endPress();
      closeTones();
      return;
    }
    endPress();
    const key = event.target.closest('.emoji-key');
    const hasTones = key?.hasAttribute('aria-controls') && !stage.hasAttribute('data-view-only');
    const direct = event.pointerType !== 'mouse';
    if (!direct && !hasTones) return;
    const scale = grid.getBoundingClientRect().width / grid.offsetWidth || 1;
    const press = { id: event.pointerId, x: event.clientX, y: event.clientY, scale, key, direct,
      scrollTop: grid.scrollTop, moved: false, scrolling: false };
    pointer = press;
    if (hasTones) {
      press.timer = setTimeout(() => {
        if (pointer === press && !press.moved && key.isConnected && !panel.hidden && !browser.hidden) {
          press.opened = openTones(key);
        }
      }, holdMs);
    }
  });

  function trackMovement(event) {
    const dx = (event.clientX - pointer.x) / pointer.scale;
    const dy = (event.clientY - pointer.y) / pointer.scale;
    pointer.moved ||= Math.hypot(dx, dy) >= 20;
    if (pointer.moved) clearTimeout(pointer.timer);
    if (pointer.opened && pointer.moved) {
      highlightTone(document.elementFromPoint(event.clientX, event.clientY)?.closest('.emoji-tone-choice'));
    } else if (pointer.direct && pointer.moved) {
      pointer.scrolling ||= Math.abs(dy) > Math.abs(dx);
      if (pointer.scrolling) grid.scrollTop = pointer.scrollTop - dy;
    }
  }

  document.addEventListener('pointermove', (event) => {
    if (pointer?.id === event.pointerId) trackMovement(event);
  });
  document.addEventListener('pointerup', (event) => {
    if (pointer?.id !== event.pointerId) return;
    trackMovement(event);
    const { key, moved, opened } = pointer;
    endPress();
    if (opened) {
      skipClick = true;
      if (toneKey === key && hoveredTone) chooseTone(hoveredTone);
    } else if (event.pointerType !== 'mouse' && !moved
      && document.elementFromPoint(event.clientX, event.clientY)?.closest('.emoji-key') === key) {
      void pick(key);
    }
  });
  for (const eventName of ['pointercancel', 'lostpointercapture']) {
    document.addEventListener(eventName, (event) => {
      if (pointer?.id !== event.pointerId) return;
      endPress();
      closeTones();
    });
  }
  grid.addEventListener('scroll', () => {
    if (!pointer?.scrolling) endPress();
    closeTones();
    syncCategory();
  });
  grid.addEventListener('click', (event) => {
    // Direct-input taps are handled on pointer release.
    if (event.detail && skipClick) return;
    if (!event.pointerType || event.pointerType === 'mouse') {
      if (!event.sourceCapabilities?.firesTouchEvents) void pick(event.target.closest('.emoji-key'));
    }
  });
  grid.addEventListener('contextmenu', (event) => {
    const key = event.target.closest('.emoji-key');
    if (!key) return;
    event.preventDefault();
    if (!pointer) openTones(key, true);
  });
  toneOptions.addEventListener('click', (event) => {
    const choice = event.target.closest('.emoji-tone-choice');
    if (choice && toneKey && (!skipClick || !event.detail)) chooseTone(choice, !event.detail);
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toneKey) {
      event.preventDefault();
      event.stopPropagation();
      closeTones(true);
    } else if (event.key === 'Escape' && keyboard.hidden) {
      event.preventDefault();
      close(true);
    } else if (event.altKey && event.key === 'ArrowDown' && openTones(event.target.closest('.emoji-key'), true)) {
      event.preventDefault();
    }
  });
  document.addEventListener('lastra:view-only', () => {
    endPress();
    closeTones();
  });
})();
