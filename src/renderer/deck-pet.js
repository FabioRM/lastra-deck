'use strict';

{
  const api = window.lastra;
  if (api?.onDeckPet) {
    const { t } = window.LastraI18n;
    const { SPECIES, HABITATS, HABITAT_FEATURES, petIsSleeping, petNeeds } = window.LastraPet;
    const stage = document.getElementById('stage');
    const toggle = document.getElementById('pet-tab');
    const panel = document.getElementById('pet-habitat');
    const canvas = document.getElementById('pet-canvas');
    const fallback = panel.querySelector('.pet-scene-fallback');
    const name = document.getElementById('pet-name');
    const location = document.getElementById('pet-location');
    const mood = document.getElementById('pet-mood');
    const feedback = document.getElementById('pet-feedback');
    const feature = document.getElementById('pet-feature');
    const sky = document.getElementById('pet-sky');
    const featureName = document.getElementById('pet-feature-name');
    const sleepLabel = document.getElementById('pet-sleep-label');
    const sleepButton = sleepLabel.closest('button');
    const indicators = [...panel.querySelectorAll('[data-pet-need]')].map((row) => ({
      row, stat: row.dataset.petNeed, progress: row.querySelector('progress'), value: row.lastElementChild,
    }));
    const controls = [...panel.querySelectorAll('[data-pet-action]')];
    const messages = { feed: 'Snack enjoyed!', play: 'That was fun!', pet: 'Cuddles appreciated!',
      explore: 'Exploring the habitat', wash: 'Fresh and clean!', sleep: 'Taking a nap', wake: 'Wide awake!' };
    const moodByStat = { fullness: 'Could use a snack', joy: 'Wants some attention', play: 'Wants to play',
      energy: 'Time for a nap', hygiene: 'Could use a wash' };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let state;
    let scene;
    let sceneRequest;
    let world;
    let visible = false;
    let lostContext = false;
    let frame;
    let needsTimer;
    let feedbackTimer;
    let reaction;
    let feedbackMessage;
    let busy = false;
    let blocked = false;
    let lastFrame = 0;
    let sleeping = false;
    let needs;
    const passive = () => blocked || stage.hasAttribute('data-view-only');

    function renderNeeds() {
      needs = petNeeds(state.care);
      const currentSleep = petIsSleeping(state.care);
      const changed = sleeping !== currentSleep;
      sleeping = currentSleep;
      let attention;
      for (const { row, stat, progress, value } of indicators) {
        const score = needs[stat];
        const inverted = stat === 'fullness' || stat === 'energy';
        const reading = Math.round(inverted ? 100 - score : score);
        if (progress.value !== reading) progress.value = reading;
        const percent = `${reading}%`;
        if (value.textContent !== percent) value.textContent = percent;
        row.toggleAttribute('data-attention', score < 40);
        if (score < 40 && (!attention || score < needs[attention])) attention = stat;
      }
      mood.textContent = t(sleeping ? 'Taking a nap' : moodByStat[attention] ?? 'Feeling good');
      sleepLabel.textContent = t(sleeping ? 'Wake up' : 'Nap');
      sleepButton.setAttribute('aria-pressed', String(sleeping));
      for (const control of controls) {
        const action = control.dataset.petAction;
        control.disabled = passive() || (sleeping && action !== 'sleep' && action !== 'pet');
        control.setAttribute('aria-disabled', String(control.disabled || busy));
      }
      if (changed && !animate()) paint(performance.now());
    }

    function render() {
      if (!state) return;
      const settings = state.settings;
      const pet = SPECIES[settings.species];
      panel.dataset.habitat = settings.habitat;
      panel.toggleAttribute('data-motion', animate());
      panel.toggleAttribute('data-passive', passive());
      name.textContent = settings.name || pet.name;
      name.title = name.textContent;
      location.textContent = t(HABITATS[settings.habitat]);
      featureName.textContent = t(HABITAT_FEATURES[settings.habitat]);
      feature.setAttribute('aria-label', t('Explore {feature}', { feature: featureName.textContent }));
      fallback.firstElementChild.textContent = pet.emoji;
      renderNeeds();
      renderFeedback();
    }

    function animate() { return state.settings.motion && !reducedMotion.matches; }

    function paint(now, motion = animate()) {
      if (!visible || !scene || lostContext) return;
      scene.draw(now / 1000, motion, reaction, sleeping, needs);
      lastFrame = now;
    }

    function draw(now) {
      frame = undefined;
      if (!visible || !scene || lostContext) return;
      const motion = animate();
      if (!motion || now - lastFrame >= 15) {
        paint(now, motion);
      }
      if (motion) frame = requestAnimationFrame(draw);
    }

    function showCanvas(show) {
      canvas.hidden = !show;
      fallback.hidden = show;
      sky.hidden = !show;
    }

    function updateScene() {
      cancelAnimationFrame(frame);
      frame = undefined;
      if (!scene || !visible || lostContext) return;
      const { width, height } = canvas.parentElement.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      const settings = state.settings;
      const nextWorld = `${settings.habitat}:${settings.species}`;
      scene.resize(width, height);
      if (world !== nextWorld) {
        scene.setWorld(settings);
        world = nextWorld;
        reaction = undefined;
      }
      lastFrame = -Infinity;
      draw(performance.now());
      showCanvas(true);
    }

    function updateVisibility() {
      render();
      const next = Boolean(state && !panel.hidden && !document.hidden && !stage.inert && !blocked
        && !stage.hasAttribute('data-desktop-revealed'));
      if (visible === next) return;
      visible = next;
      if (!visible) {
        cancelAnimationFrame(frame);
        frame = undefined;
        clearInterval(needsTimer);
        return;
      }
      needsTimer = setInterval(renderNeeds, 5000);
      if (scene) updateScene();
      else sceneRequest ??= import('./deck-pet-scene.mjs').then(({ createPetScene }) => {
        if (!visible) return;
        scene = createPetScene(canvas);
        updateScene();
      }).catch((error) => {
        console.warn('The deck pet could not start its 3D scene.', error);
        showCanvas(false);
      }).finally(() => { sceneRequest = undefined; });
    }

    function setOpen(open, restoreFocus = false) {
      if (open === !panel.hidden) return;
      window.LastraDeckViews.setPanel(panel, open);
      toggle.setAttribute('aria-pressed', String(open));
      if (restoreFocus) toggle.focus({ preventScroll: true });
      if (!open) {
        reaction = undefined;
        feedbackMessage = undefined;
        clearTimeout(feedbackTimer);
      }
      updateVisibility();
    }

    function renderFeedback() {
      const { message, object } = feedbackMessage ?? {};
      feedback.textContent = t(message, object ? { object: t(object) } : undefined);
    }

    function announce(message, object) {
      feedbackMessage = { message, object };
      renderFeedback();
      clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => {
        feedbackMessage = undefined;
        renderFeedback();
      }, 3600);
    }

    toggle.addEventListener('click', () => setOpen(panel.hidden));
    panel.addEventListener('lastra:close-view', () => setOpen(false));
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false, true);
    });
    toggle.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false);
    });
    async function interact(action, hit = {}) {
      if (!action || busy || !visible || passive()) return;
      const wasSleeping = sleeping;
      if (wasSleeping && action !== 'sleep' && action !== 'pet') return;
      if (action === 'sky') {
        if (!scene) return;
        reaction = { action };
        announce('Looking up at the {object}', hit.label ?? scene.skyLabel());
        if (!animate()) paint(performance.now(), false);
        return;
      }
      busy = true;
      render();
      try {
        const result = await api.interactWithPet(action);
        if (!visible) return;
        if (!result?.ok) throw new Error('Pet action unavailable.');
        const effect = wasSleeping && !result.sleeping ? 'wake' : action;
        reaction = { action: effect, target: hit.target };
        if (hit.label && effect === 'explore') announce('Investigating {object}', hit.label);
        else announce(messages[effect]);
        if (!animate()) paint(performance.now(), false);
      } catch {
        if (visible) announce('Could not care for your pet.');
      } finally {
        busy = false;
        render();
      }
    }
    panel.addEventListener('click', (event) => {
      const action = event.target.closest('[data-pet-action]')?.dataset.petAction;
      if (action) void interact(action);
    });
    fallback.addEventListener('click', () => { void interact('pet'); });
    canvas.addEventListener('click', (event) => {
      if (!scene || !visible || busy || passive()) return;
      const hit = scene.pick(event.clientX, event.clientY);
      if (hit?.point && !sleeping) {
        scene.walk(hit.point, animate(), needs);
        if (!animate()) paint(performance.now(), false);
      } else if (hit?.action) void interact(hit.action, hit);
    });
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      lostContext = true;
      showCanvas(false);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      lostContext = false;
      updateScene();
    });
    document.addEventListener('lastra-language', render);
    document.addEventListener('visibilitychange', updateVisibility);
    document.addEventListener('lastra:session-blocked', ({ detail }) => {
      blocked = detail;
      updateVisibility();
    });
    new MutationObserver(updateVisibility).observe(stage, { attributes: true,
      attributeFilter: ['inert', 'data-desktop-revealed', 'data-view-only'] });
    new ResizeObserver(updateScene).observe(canvas.parentElement);
    window.addEventListener('resize', updateScene);
    reducedMotion.addEventListener('change', () => {
      render();
      updateScene();
    });
    api.onDeckPet((next) => {
      const changed = state && Object.keys(next.settings).some((key) => next.settings[key] !== state.settings[key]);
      state = next;
      toggle.hidden = false;
      render();
      if (changed) updateScene();
    });
  }
}
