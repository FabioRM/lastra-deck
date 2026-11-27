'use strict';

{
  const api = window.lastra;
  if (api?.onAquarium) {
    const panel = document.getElementById('aquarium-panel');
    const canvas = document.getElementById('aquarium-canvas');
    const status = document.getElementById('aquarium-status');
    const { normalizeAquarium, aquariumLight } = window.LastraAquariumSettings;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let settings;
    let location;
    let visible = false;
    let scene;
    let load;
    let frameTimer;
    let frameRequest;
    let lightTimer;
    let previous;
    let failed = false;
    const rates = { eco: 24, balanced: 30, high: 40 };

    function stop() {
      clearTimeout(frameTimer);
      clearTimeout(lightTimer);
      if (frameRequest !== undefined) cancelAnimationFrame(frameRequest);
      frameTimer = lightTimer = frameRequest = previous = undefined;
    }

    function fail(error) {
      stop();
      failed = true;
      status.hidden = false;
      console.warn('Could not start the 3D aquarium.', error);
    }

    function motion() {
      if (settings.motion === 'still' || reducedMotion.matches) return 0;
      return settings.motion === 'gentle' ? .54 : 1;
    }

    function refreshLight() {
      clearTimeout(lightTimer);
      const now = new Date();
      const phase = window.LastraWeather.moonCycle(now);
      const moon = .5 - .5 * Math.cos(phase * Math.PI * 2);
      scene.setLight({ ...aquariumLight(settings, now, location), moon });
      const interval = 30_000;
      lightTimer = setTimeout(() => {
        refreshLight();
        if (!motion()) requestPaint();
      }, interval - now.getTime() % interval);
    }

    function requestPaint() {
      if (!visible || !scene || failed || frameRequest !== undefined || frameTimer !== undefined) return;
      frameRequest = requestAnimationFrame(paint);
    }

    function paint(now) {
      frameRequest = undefined;
      if (!visible || !scene || failed) return;
      const ratio = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      if (ratio > 0 && Math.abs(Math.log(ratio / scene.ratio)) > .31) {
        stop();
        scene.dispose();
        scene = undefined;
        start();
        return;
      }
      const speed = motion() || (scene.isFeeding() ? 1 : 0);
      try {
        scene.draw(Math.min(.085, (now - (previous ?? now)) / 1000) * speed);
      } catch (error) {
        fail(error);
        return;
      }
      previous = now;
      if (motion() || scene.isFeeding()) {
        const interval = 1000 / rates[settings.quality];
        const elapsed = performance.now() - now;
        // Sleep between frames so the panel does not wake for every display refresh.
        frameTimer = setTimeout(() => { frameTimer = undefined; requestPaint(); }, Math.max(1, interval - elapsed - 7));
      }
    }

    function start() {
      if (!visible || !settings?.enabled || failed) return;
      if (scene) {
        refreshLight();
        requestPaint();
      } else if (!load) {
        load = import('./aquarium-scene.mjs').then(async ({ createAquarium }) => {
          if (!visible || !settings.enabled) return;
          const creating = settings;
          const next = await createAquarium(canvas,creating,()=>visible && settings===creating);
          if (!visible || settings !== creating) next?.dispose();
          else scene = next;
        }).catch(fail).finally(() => {
          load = undefined;
          start();
        });
      }
    }

    function configure(next) {
      const updated = normalizeAquarium(next);
      const old = settings;
      settings = updated;
      canvas.tabIndex = updated.touch ? 0 : -1;
      if (scene && old) {
        const rebuild = ['seed', 'layout', 'substrate', 'growth', 'water', 'bubbles', 'quality', 'tank', 'depth',
          'current', 'plants', 'rocks', 'rockStyle', 'algae', 'algaeDensity', 'coralStyle', 'coralDensity',
          'spongeStyle', 'spongeDensity', 'bubblePattern', 'bubbleDensity', 'turtleVisits'].some((key) => old[key] !== updated[key])
          || Object.keys(updated.stock).some((id) => old.stock[id] !== updated.stock[id])
          || JSON.stringify(old.decorations) !== JSON.stringify(updated.decorations);
        if (rebuild) {
          stop();
          scene.dispose();
          scene = undefined;
        } else if (updated.motion !== old.motion) {
          stop();
        }
        scene?.configure(updated);
      }
      if (!updated.enabled) stop();
      else start();
    }

    api.onAquarium(configure);
    api.onFeeds((snapshot) => {
      const weather = snapshot?.weather;
      if (location?.latitude === weather?.latitude && location?.longitude === weather?.longitude) return;
      location = weather;
      if (visible && scene && !failed) {
        refreshLight();
        requestPaint();
      }
    });
    const resize = new ResizeObserver(() => requestPaint());
    window.LastraAquarium = {
      setVisible(value) {
        if (visible === value) return;
        visible = value;
        if (visible) { resize.observe(panel); start(); }
        else { resize.disconnect(); stop(); }
      },
    };
    reducedMotion.addEventListener('change', () => {
      stop();
      start();
    });
    function feed(x, y) {
      if (!visible || !scene || failed || !settings.touch || panel.parentElement.hasAttribute('data-view-only')) return;
      if (!scene.feed(x,y)) return;
      if (!motion()) previous = undefined;
      requestPaint();
    }
    canvas.addEventListener('pointerdown', ({ button, clientX, clientY }) => {
      if (button === 0) feed(clientX, clientY);
    });
    canvas.addEventListener('keydown', (event) => {
      if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return;
      event.preventDefault();
      const bounds = canvas.getBoundingClientRect();
      feed(bounds.left + bounds.width/2, bounds.top + bounds.height/2);
    });
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      fail('WebGL context lost');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      scene?.dispose();
      scene = undefined;
      failed = false;
      status.hidden = true;
      start();
    });
    window.addEventListener('pagehide', () => {
      stop();
      scene?.dispose();
    }, { once: true });
  }
}
