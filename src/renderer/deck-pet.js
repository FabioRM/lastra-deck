'use strict';

{
  const api = window.lastra;
  if (api?.onDeckPet) {
    const { t } = window.LastraI18n;
    const { weatherScene, sceneLabel, weatherIntensity, solarPhase, moonPhase, moonLabel, moonCycle } = window.LastraWeather;
    const { SPECIES, HABITATS, HABITAT_FEATURES, petEmotion, petIsSleeping, petNeeds, petWakeAt } = window.LastraPet;
    const stage = document.getElementById('stage');
    const toggle = document.getElementById('pet-tab');
    const panel = document.getElementById('pet-habitat');
    const expand = document.getElementById('pet-expand');
    const environment = document.getElementById('pet-environment');
    const weatherPlace = document.getElementById('pet-weather-place');
    const weatherTemperature = document.getElementById('pet-weather-temperature');
    const weatherCondition = document.getElementById('pet-weather-condition');
    const weatherValues = [...environment.querySelectorAll('[data-pet-weather]')];
    const canvas = document.getElementById('pet-canvas');
    const fallback = panel.querySelector('.pet-scene-fallback');
    const name = document.getElementById('pet-name');
    const location = document.getElementById('pet-location');
    const mood = document.getElementById('pet-mood');
    const feedback = document.getElementById('pet-feedback');
    const feature = document.getElementById('pet-feature');
    const sky = document.getElementById('pet-sky');
    const playLabel = document.getElementById('pet-play-label');
    const sleepLabel = document.getElementById('pet-sleep-label');
    const sleepButton = sleepLabel.closest('button');
    const indicators = [...panel.querySelectorAll('[data-pet-need]')].map((row) => ({
      row, stat: row.dataset.petNeed, progress: row.querySelector('progress'), value: row.lastElementChild,
    }));
    const controls = [...panel.querySelectorAll('[data-pet-action]')];
    const messages = { feed: 'Snack enjoyed!', play: 'That was fun!', pet: 'Cuddles appreciated!',
      explore: 'Exploring the habitat', wash: 'Fresh and clean!', medicine: 'Medicine taken!', sleep: 'Taking a nap', wake: 'Wide awake!' };
    const emotionLabels = { calm: 'Feeling good', joyful: 'Happy', affectionate: 'Affectionate', curious: 'Curious',
      relaxed: 'Relaxed', hungry: 'Could use a snack', lonely: 'Feeling lonely', bored: 'Bored',
      sleepy: 'Time for a nap', sleeping: 'Taking a nap', uncomfortable: 'Could use a wash', unwell: 'Feeling unwell' };
    const actionEmotions = { feed: 'relaxed', play: 'joyful', pet: 'affectionate', wash: 'relaxed', medicine: 'relaxed', wake: 'joyful',
      explore: 'curious', observe: 'curious', drink: 'relaxed', forage: 'relaxed', splash: 'joyful',
      rest: 'relaxed', groom: 'relaxed', frolic: 'joyful' };
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let state;
    let scene;
    let sceneRequest;
    let world;
    let visible = false;
    let windowVisible = true;
    let lostContext = false;
    let frame;
    let frameWake;
    let statusTimer;
    let feedbackTimer;
    let changesTimer;
    let emotionTimer;
    let reaction;
    let feedbackMessage;
    let busy = false;
    let blocked = false;
    let fastUntil = 0;
    let sleeping = false;
    let needs;
    let emotion;
    let transientEmotion;
    let careRequest = 0;
    let appliedCareRequest = 0;
    let expanded = false;
    let weatherReading;
    let weatherRequested = false;
    let climate;
    let weatherMinute;
    const sceneSizes = new ResizeObserver(updateScene);
    const passive = () => blocked || stage.hasAttribute('data-view-only');

    function renderControls() {
      for (const control of controls) {
        const action = control.dataset.petAction;
        const disabled = passive() || (sleeping && action !== 'sleep' && action !== 'pet')
          || (action === 'sleep' && !sleeping && Math.round(needs.energy) === 100);
        if (control.disabled !== disabled) control.disabled = disabled;
        const aria = String(disabled || busy);
        if (control.getAttribute('aria-disabled') !== aria) control.setAttribute('aria-disabled', aria);
      }
    }

    function renderNeeds() {
      const now = Date.now();
      needs = petNeeds(state.care, now);
      sleeping = petIsSleeping(state.care, now);
      for (const { row, stat, progress, value } of indicators) {
        const score = needs[stat];
        const reading = Math.round(score);
        if (progress.value !== reading) progress.value = reading;
        const percent = `${reading}%`;
        if (value.textContent !== percent) value.textContent = percent;
        row.toggleAttribute('data-attention', score < 40);
      }
      const nextEmotion = transientEmotion && !sleeping ? transientEmotion : petEmotion(needs, sleeping);
      const emotionChanged = emotion !== nextEmotion;
      if (emotionChanged) panel.dataset.emotion = nextEmotion;
      emotion = nextEmotion;
      const moodLabel = t(emotionLabels[emotion]);
      if (mood.textContent !== moodLabel) mood.textContent = moodLabel;
      const napLabel = t(sleeping ? 'Wake up' : 'Nap');
      if (sleepLabel.textContent !== napLabel) sleepLabel.textContent = napLabel;
      if (sleepButton.getAttribute('aria-pressed') !== String(sleeping)) sleepButton.setAttribute('aria-pressed', String(sleeping));
      renderControls();
      if (emotionChanged && !animate()) requestPaint();
    }

    function render() {
      if (!visible) return;
      const settings = state.settings;
      const pet = SPECIES[settings.species];
      panel.dataset.habitat = settings.habitat;
      panel.toggleAttribute('data-motion', animate());
      panel.toggleAttribute('data-passive', passive());
      name.textContent = settings.name || pet.name;
      name.title = name.textContent;
      location.textContent = t(HABITATS[settings.habitat]);
      feature.title = t('Explore {feature}', { feature: t(HABITAT_FEATURES[settings.habitat]) });
      feature.setAttribute('aria-label', feature.title);
      sky.title = t('Look up');
      sky.setAttribute('aria-label', sky.title);
      expand.title = t(expanded ? 'Exit full screen' : 'Full-screen habitat');
      expand.setAttribute('aria-label', expand.title);
      playLabel.textContent = window.LastraI18n.language === 'it' ? t('Play time') : 'Play';
      fallback.firstElementChild.textContent = pet.emoji;
      renderNeeds();
      renderFeedback();
    }

    function animate() { return state.settings.motion && !reducedMotion.matches; }

    function stopDrawing() {
      cancelAnimationFrame(frame);
      clearTimeout(frameWake);
      frame = frameWake = undefined;
      fastUntil = 0;
      scene?.pause();
    }

    function requestPaint(reacting = false) {
      if (!visible || !scene || lostContext) return;
      if (reacting && animate()) {
        fastUntil = performance.now() + 3_500;
        clearTimeout(frameWake);
        frameWake = undefined;
      }
      if (frame === undefined && frameWake === undefined) frame = requestAnimationFrame(draw);
    }

    function draw(now) {
      frame = undefined;
      if (!visible || panel.hidden || document.hidden || !scene || lostContext) return;
      const motion = animate();
      const effect = scene.draw(now / 1000, motion, reaction, sleeping, needs, emotion, climate);
      if (effect && !passive()) void applyHabitatCare(effect);
      if (motion) {
        const period = 1_000 / (now < fastUntil ? 60 : 30);
        // Wake shortly before the target refresh instead of running a callback on every refresh.
        const delay = Math.max(0, now + period - performance.now() - 5);
        if (delay > 0) frameWake = setTimeout(() => {
          frameWake = undefined;
          requestPaint();
        }, delay);
        else requestPaint();
      }
    }

    function showCanvas(show) {
      if (canvas.hidden === !show) return;
      canvas.hidden = !show;
      fallback.hidden = show;
      sky.hidden = !show;
    }

    function updateScene() {
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
      showCanvas(true);
      requestPaint();
    }

    function scheduleStatus() {
      clearTimeout(statusTimer);
      if (!visible) return;
      const now = Date.now();
      const untilWake = petWakeAt(state.care) - now;
      const needsDelay = untilWake > 0 ? Math.min(5_000, untilWake) : 30_000;
      const weatherDelay = climate ? 60_000 - now % 60_000 : Infinity;
      statusTimer = setTimeout(() => {
        if (!visible) return;
        renderNeeds();
        renderWeather();
        scheduleStatus();
      }, Math.min(needsDelay, weatherDelay));
    }

    function updateVisibility() {
      const next = Boolean(state && windowVisible && !panel.hidden && !document.hidden && !stage.inert && !blocked
        && !stage.hasAttribute('data-desktop-revealed'));
      if (visible === next) {
        if (visible) {
          panel.toggleAttribute('data-passive', passive());
          renderControls();
        }
        return;
      }
      visible = next;
      if (!visible) {
        stopDrawing();
        sceneSizes.disconnect();
        window.removeEventListener('resize', updateScene);
        panel.removeAttribute('data-motion');
        clearTimeout(statusTimer);
        clearTimeout(feedbackTimer);
        clearTimeout(emotionTimer);
        clearTimeout(changesTimer);
        for (const { row } of indicators) delete row.dataset.change;
        transientEmotion = feedbackMessage = undefined;
        return;
      }
      render();
      renderWeather(true);
      scheduleStatus();
      sceneSizes.observe(canvas.parentElement);
      window.addEventListener('resize', updateScene);
      if (!weatherReading && !weatherRequested && api.readFeeds) {
        weatherRequested = true;
        void api.readFeeds().then((snapshot) => {
          if (!weatherReading) receiveWeather(snapshot);
        }).catch(() => {});
      }
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
      updateVisibility();
      if (!open) {
        reaction = undefined;
        setExpanded(false);
      }
    }

    function formatSunTime(timestamp) {
      if (!Number.isFinite(timestamp)) return '';
      const locale = window.LastraI18n.language === 'it' ? 'it-IT' : 'en-GB';
      const options = { hour: '2-digit', minute: '2-digit' };
      if (weatherReading.timezone) {
        try { return new Intl.DateTimeFormat(locale, { ...options, timeZone: weatherReading.timezone }).format(timestamp); }
        catch { /* The provider may return a non-IANA time zone. */ }
      }
      const offset = weatherReading.timezoneOffset;
      return new Intl.DateTimeFormat(locale, Number.isFinite(offset) ? { ...options, timeZone: 'UTC' } : options)
        .format(timestamp + (offset ?? 0) * 1000);
    }

    function renderWeather(force = false) {
      const now = new Date();
      const minute = Math.floor(now.getTime() / 60_000);
      if (!force && weatherMinute === minute) return;
      weatherMinute = minute;
      const reading = weatherReading;
      const usable = !reading?.error && Number.isFinite(reading?.temperature);
      const kind = usable ? weatherScene(reading) : undefined;
      const phase = usable ? solarPhase(reading, now) : undefined;
      const intensity = usable ? weatherIntensity(reading) : undefined;
      const changed = kind !== climate?.kind || phase !== climate?.phase || reading?.wind !== climate?.wind
        || reading?.cloudCover !== climate?.cloudCover || intensity !== climate?.intensity;
      climate = usable ? { kind, phase, wind: reading.wind, cloudCover: reading.cloudCover, intensity } : undefined;
      if (changed && climate) {
        panel.dataset.climate = kind;
        panel.dataset.phase = phase;
      } else if (changed) {
        delete panel.dataset.climate;
        delete panel.dataset.phase;
      }
      if (expanded) {
        weatherPlace.textContent = reading?.place || (usable ? t('Weather') : '');
        weatherTemperature.textContent = usable ? `${reading.temperature}°` : '';
        weatherCondition.textContent = usable ? t(sceneLabel(kind) ?? reading.label) : t(reading?.error
          || (reading?.latitude != null ? 'Weather is loading…' : 'Add a latitude and longitude in Lastra Settings to show the weather.'));
        const measured = (value, unit) => Number.isFinite(value) ? `${value}${unit}` : '';
        const fields = !usable ? {} : {
          range: [measured(reading.low, '°'), measured(reading.high, '°')].filter(Boolean).join(' / '),
          feelsLike: measured(reading.feelsLike, '°'), humidity: measured(reading.humidity, '%'),
          wind: [measured(reading.wind, ' km/h'), measured(reading.windDirection, '°')].filter(Boolean).join(' · '),
          pressure: measured(reading.pressure, ' hPa'), cloudCover: measured(reading.cloudCover, '%'),
          sunrise: formatSunTime(reading.sun?.sunrise), sunset: formatSunTime(reading.sun?.sunset),
          moon: t(moonLabel(moonPhase(moonCycle(now)))),
        };
        for (const field of weatherValues) {
          field.textContent = fields[field.dataset.petWeather] ?? '';
          field.parentElement.hidden = !field.textContent;
        }
      }
      if (changed && !animate()) requestPaint();
    }

    function receiveWeather(snapshot) {
      weatherReading = snapshot?.weather;
      if (visible) {
        renderWeather(true);
        scheduleStatus();
      }
    }

    function setExpanded(open) {
      if (expanded === open) return;
      expanded = open;
      panel.toggleAttribute('data-expanded', open);
      environment.hidden = !open;
      expand.setAttribute('aria-pressed', String(open));
      window.LastraDeckViews.setPetExpanded(open);
      render();
      if (visible) {
        if (open) renderWeather(true);
        updateScene();
      }
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

    function express(action) {
      transientEmotion = actionEmotions[action];
      clearTimeout(emotionTimer);
      emotionTimer = setTimeout(() => {
        if (!visible) return;
        transientEmotion = undefined;
        renderNeeds();
      }, 2700);
      renderNeeds();
    }

    async function updateCare(action, automatic = false) {
      const request = ++careRequest;
      const result = await api.interactWithPet(action, automatic);
      if (!result?.ok || !result.care) throw new Error('Pet action unavailable.');
      if (request >= appliedCareRequest && result.care.at >= state.care.at) {
        appliedCareRequest = request;
        const previousCare = state.care;
        state = { ...state, care: result.care };
        if (!visible) return result.care;
        const now = Date.now();
        const before = petNeeds(previousCare, now);
        const after = petNeeds(result.care, now);
        for (const { row, stat } of indicators) {
          if (Math.round(before[stat]) === Math.round(after[stat])) continue;
          row.dataset.change = after[stat] > before[stat] ? 'up' : 'down';
        }
        clearTimeout(changesTimer);
        changesTimer = setTimeout(() => {
          for (const { row } of indicators) delete row.dataset.change;
        }, 870);
        renderNeeds();
        scheduleStatus();
      }
      return result.care;
    }

    async function applyHabitatCare({ action, automatic }) {
      try {
        await updateCare(action, automatic);
        if (visible && !automatic) {
          express(action);
          if (!animate()) requestPaint();
        }
      } catch {
        if (visible && !automatic) announce('Could not care for your pet.');
      }
    }

    toggle.addEventListener('click', () => setOpen(panel.hidden));
    expand.addEventListener('click', () => setExpanded(!expanded));
    panel.addEventListener('lastra:close-view', () => setOpen(false));
    panel.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (expanded) {
        event.preventDefault();
        setExpanded(false);
        expand.focus({ preventScroll: true });
      } else setOpen(false, true);
    });
    toggle.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false);
    });
    async function interact(action, hit = {}) {
      if (!action || busy || !visible || passive()) return;
      const wasSleeping = sleeping;
      if (wasSleeping && action !== 'sleep' && action !== 'pet') return;
      if (scene && !lostContext && (action === 'sky' || action === 'explore' || action === 'wildlife')) {
        reaction = { action, target: hit.target };
        express('observe');
        if (action === 'sky') announce('Looking up at the {object}', hit.label ?? scene.skyLabel());
        else if (action === 'wildlife') announce('Watching the {object}', hit.label);
        else announce('Investigating {object}', hit.label ?? HABITAT_FEATURES[state.settings.habitat]);
        requestPaint(true);
        return;
      }
      busy = true;
      renderControls();
      try {
        const care = await updateCare(action);
        if (!visible) return;
        if (action === 'sleep' && !wasSleeping && !petIsSleeping(care)) return;
        const effect = wasSleeping && !petIsSleeping(care) ? 'wake' : action;
        reaction = { action: effect };
        express(effect);
        announce(messages[effect]);
        requestPaint(true);
      } catch {
        if (visible) announce('Could not care for your pet.');
      } finally {
        busy = false;
        if (visible) renderControls();
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
        requestPaint(true);
      } else if (hit?.action) void interact(hit.action, hit);
    });
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      lostContext = true;
      stopDrawing();
      showCanvas(false);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      lostContext = false;
      updateScene();
    });
    document.addEventListener('lastra-language', () => {
      render();
      if (visible) renderWeather(true);
    });
    document.addEventListener('visibilitychange', updateVisibility);
    document.addEventListener('lastra:session-blocked', ({ detail }) => {
      blocked = detail;
      updateVisibility();
    });
    const visibilityObserver = new MutationObserver(updateVisibility);
    visibilityObserver.observe(stage, { attributeFilter: ['inert', 'data-desktop-revealed', 'data-view-only'] });
    visibilityObserver.observe(panel, { attributeFilter: ['hidden'] });
    reducedMotion.addEventListener('change', () => {
      if (!visible) return;
      stopDrawing();
      render();
      updateScene();
    });
    api.onDeckWindowVisibility?.((shown) => {
      windowVisible = shown;
      updateVisibility();
    });
    api.onFeeds?.(receiveWeather);
    api.onDeckPet((next) => {
      const changed = state && Object.keys(next.settings).some((key) => next.settings[key] !== state.settings[key]);
      const motionChanged = state && state.settings.motion !== next.settings.motion;
      state = next;
      if (toggle.hidden) toggle.hidden = false;
      if (!visible) {
        updateVisibility();
        return;
      }
      if (motionChanged) stopDrawing();
      render();
      if (changed) updateScene();
      else if (!animate()) requestPaint();
      scheduleStatus();
    });
  }
}
