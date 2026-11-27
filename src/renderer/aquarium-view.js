'use strict';

{
  const { normalizeAquarium, aquariumLight } = window.LastraAquariumSettings;
  const rates = { eco: 30, balanced: 60, high: 60 };
  const geometryFields = ['seed', 'layout', 'substrate', 'growth', 'water', 'bubbles', 'quality', 'tank', 'depth',
    'current', 'plants', 'rocks', 'rockStyle', 'algae', 'algaeDensity', 'coralStyle', 'coralDensity',
    'spongeStyle', 'spongeDensity', 'bubblePattern', 'bubbleDensity', 'turtleVisits'];

  function needsRebuild(old, updated) {
    return geometryFields.some((key) => old[key] !== updated[key])
      || Object.keys(updated.stock).some((id) => old.stock[id] !== updated.stock[id])
      || JSON.stringify(old.decorations) !== JSON.stringify(updated.decorations);
  }

  function mount({ canvas, status, canFeed = () => true, maxRate = Infinity, editable = false }) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const resize = new ResizeObserver(start);
    let settings, location, scene, load, frame, lightTimer, previous, nextFrame;
    let placement;
    let decorationIndex = null;
    let camera = { yaw: 0, pitch: 0, zoom: 1 };
    let lightPreview = 'auto';
    let panelLighting = null;
    let visible = false, failed = false, contextLost = false, closed = false;
    let generation = 0;
    const canRender = () => settings && (settings.enabled || panelLighting);

    function stop() {
      clearTimeout(lightTimer);
      if (frame !== undefined) cancelAnimationFrame(frame);
      lightTimer = frame = previous = nextFrame = undefined;
    }

    function releaseScene() {
      stop();
      generation++;
      scene?.dispose();
      scene = undefined;
    }

    function fail(error) {
      if (contextLost) stop();
      else releaseScene();
      failed = true;
      status.hidden = false;
      console.warn('Could not start the 3D aquarium.', error);
    }

    function clearFailure() {
      if (contextLost) return;
      failed = false;
      status.hidden = true;
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
      const mode = panelLighting?.mode ?? lightPreview;
      const light = mode === 'auto' ? aquariumLight(settings, now, location)
        : { day: Number(mode === 'day'), twilight: 0 };
      scene.setLight({ ...light, moon }, panelLighting ?? settings);
      if (mode !== 'auto') return;
      const interval = 30_000;
      lightTimer = setTimeout(() => {
        refreshLight();
        requestPaint();
      }, interval - now.getTime() % interval);
    }

    function requestPaint() {
      if (!visible || !canRender() || !scene || failed || frame !== undefined) return;
      frame = requestAnimationFrame(paint);
    }

    function paint(now) {
      frame = undefined;
      if (!visible || !canRender() || !scene || failed) return;
      const ratio = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      if (!ratio) return;
      if (Math.abs(Math.log(ratio / scene.ratio)) > .22) {
        releaseScene();
        start();
        return;
      }
      const speed = motion() || (scene.isFeeding() ? 1 : 0);
      if (speed && now + 1 < nextFrame) {
        requestPaint();
        return;
      }
      try {
        const interval = 1000 / Math.min(maxRate, rates[settings.quality]);
        const elapsed = Math.min(.085, (now - (previous ?? now)) / 1000);
        scene.draw(elapsed * speed);
        previous = now;
        // Anchor to display frames and drop missed deadlines after a slow paint.
        nextFrame = Math.max(now - interval * .50, nextFrame ?? now) + interval;
      } catch (error) {
        fail(error);
        return;
      }
      if (speed && (motion() || scene.isFeeding())) requestPaint();
      else previous = nextFrame = undefined;
    }

    function start() {
      if (closed || !visible || !canRender() || failed || !canvas.clientHeight || !canvas.clientWidth) return;
      if (scene) {
        refreshLight();
        requestPaint();
        return;
      }
      if (load) return;
      const revision = generation;
      const isCurrent = () => !closed && visible && canRender() && revision === generation;
      load = import('./aquarium-scene.mjs').then(async ({ createAquarium }) => {
        if (!isCurrent()) return;
        scene = await createAquarium(canvas, settings, isCurrent, { editable });
        scene?.configure(settings);
        scene?.setCamera?.(camera);
        if (placement) scene?.previewDecoration(placement.index, placement.item);
        if (decorationIndex !== null) scene?.highlightDecoration(decorationIndex);
      }).catch((error) => {
        if (isCurrent()) fail(error);
      }).finally(() => {
        load = undefined;
        start();
      });
    }

    function configure(next) {
      const updated = normalizeAquarium(next);
      const rebuild = settings && needsRebuild(settings, updated);
      const changedMotion = settings?.motion !== updated.motion;
      settings = updated;
      placement = undefined;
      labelCanvas();
      if (rebuild || !canRender()) {
        releaseScene();
        clearFailure();
      } else if (changedMotion) stop();
      scene?.configure(updated);
      start();
    }

    function labelCanvas() {
      if (!settings || editable) return;
      canvas.tabIndex = settings.touch ? 0 : -1;
      canvas.setAttribute('role', settings.touch ? 'button' : 'img');
      const label = settings.touch ? 'Feed the aquarium' : 'Aquarium';
      canvas.setAttribute('aria-label', window.LastraI18n.t(label));
    }

    document.addEventListener('lastra-language', labelCanvas);

    function feed(x, y) {
      if (!visible || !scene || failed || !settings.touch || !canFeed()) return;
      if (!scene.feed(x, y)) return;
      if (!motion() && frame === undefined) previous = nextFrame = undefined;
      requestPaint();
    }

    function feedAtCenter() {
      const bounds = canvas.getBoundingClientRect();
      feed(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    }

    if (!editable) {
      canvas.addEventListener('pointerdown', ({ button, clientX, clientY }) => {
        if (button === 0) feed(clientX, clientY);
      });
      canvas.addEventListener('keydown', (event) => {
        if (!settings?.touch || event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return;
        event.preventDefault();
        feedAtCenter();
      });
    }
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      contextLost = true;
      generation++;
      fail('WebGL context lost');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      releaseScene();
      contextLost = false;
      clearFailure();
      start();
    });
    function motionChanged() {
      stop();
      start();
    }
    reducedMotion.addEventListener('change', motionChanged);
    window.addEventListener('pagehide', () => {
      closed = true;
      resize.disconnect();
      document.removeEventListener('lastra-language', labelCanvas);
      reducedMotion.removeEventListener('change', motionChanged);
      releaseScene();
    }, { once: true });

    return {
      configure,
      isUpdating: () => Boolean(load),
      setCamera(pose) {
        camera = pose;
        scene?.setCamera?.(camera);
        requestPaint();
      },
      setLightPreview(mode) {
        if (!editable || lightPreview === mode) return;
        lightPreview = mode;
        if (visible && scene && !failed) {
          refreshLight();
          requestPaint();
        }
      },
      previewPanelLighting(lighting) {
        panelLighting = lighting;
        if (settings && !canRender()) releaseScene();
        else start();
      },
      pickDecoration(x, y, padding) { return scene?.pickDecoration?.(x, y, padding); },
      decorationPlacement(grab, x, y) { return scene?.decorationPlacement?.(grab, x, y); },
      feedAtCenter,
      previewDecoration(index, item) {
        placement = { index, item };
        scene?.previewDecoration(index, item);
        requestPaint();
      },
      highlightDecoration(index) {
        if (decorationIndex === index) return;
        decorationIndex = index;
        scene?.highlightDecoration(index);
        requestPaint();
      },
      setLocation(value) {
        if (location?.latitude === value?.latitude && location?.longitude === value?.longitude) return;
        location = value;
        if (visible && scene && !failed) {
          refreshLight();
          requestPaint();
        }
      },
      setVisible(value) {
        if (visible === value) return;
        visible = value;
        if (visible) {
          clearFailure();
          resize.observe(canvas);
          start();
        } else {
          resize.disconnect();
          generation++;
          stop();
        }
      },
    };
  }

  window.LastraAquariumView = Object.freeze({ mount });
}
