'use strict';

{
  const HOME = { yaw: 0, pitch: 0, zoom: 1 };
  const MAX_YAW = 1.05;
  const MAX_PITCH = .90;
  const MIN_ZOOM = .75;
  const MAX_ZOOM = 2.8;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function mount({ canvas, view, canEdit, select, move, commit }) {
    const controls = document.getElementById('aquarium-camera-controls');
    const feed = document.getElementById('aquarium-preview-feeding');
    const zoomOutput = document.getElementById('aquarium-preview-zoom');
    const buttons = Object.fromEntries([...controls.querySelectorAll('[data-aquarium-camera]')]
      .map((button) => [button.dataset.aquariumCamera, button]));
    let camera = HOME;
    let gesture;

    function setCamera(yaw, pitch, zoom) {
      camera = {
        yaw: clamp(yaw, -MAX_YAW, MAX_YAW),
        pitch: clamp(pitch, 0, MAX_PITCH),
        zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM),
      };
      view.setCamera(camera);
      zoomOutput.value = `${Math.round(camera.zoom * 100)}%`;
      buttons.left.disabled = camera.yaw <= -MAX_YAW;
      buttons.right.disabled = camera.yaw >= MAX_YAW;
      buttons.out.disabled = camera.zoom <= MIN_ZOOM;
      buttons.in.disabled = camera.zoom >= MAX_ZOOM;
      buttons.reset.disabled = camera.yaw === 0 && camera.pitch === 0 && camera.zoom === 1;
    }

    const orbit = (yaw, pitch) => setCamera(camera.yaw + yaw, camera.pitch + pitch, camera.zoom);
    const zoom = (factor) => setCamera(camera.yaw, camera.pitch, camera.zoom * factor);
    const commands = {
      left: () => orbit(-.22, 0),
      right: () => orbit(.22, 0),
      up: () => orbit(0, .16),
      down: () => orbit(0, -.16),
      out: () => zoom(1 / 1.2),
      in: () => zoom(1.2),
      reset: () => setCamera(HOME.yaw, HOME.pitch, HOME.zoom),
    };
    const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', '+': 'in', '=': 'in', '-': 'out', '0': 'reset' };
    setCamera(HOME.yaw, HOME.pitch, HOME.zoom);

    for (const [command, button] of Object.entries(buttons)) button.addEventListener('click', () => {
      if (canEdit() && !gesture) commands[command]();
    });
    feed.addEventListener('click', () => view.feedAtCenter());

    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('wheel', (event) => {
      if (!canEdit()) return;
      event.preventDefault();
      if (gesture) return;
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
      zoom(Math.exp(-clamp(event.deltaY * units, -400, 400) * .0018));
    }, { passive: false });

    canvas.addEventListener('pointerdown', (event) => {
      if (!canEdit() || gesture || !event.isPrimary || (event.button !== 0 && event.button !== 2)) return;
      const { clientX: x, clientY: y } = event;
      const hit = event.button === 0 ? view.pickDecoration(x, y, event.pointerType === 'touch' ? 13 : 7) : null;
      const original = hit && select(hit.index);
      gesture = { id: event.pointerId, x, y, hit: original ? hit : null, original, started: false, changed: false };
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(gesture.id);
    });

    function movePointer(event) {
      if (event.pointerId !== gesture?.id) return;
      const { clientX: x, clientY: y } = event;
      const dx = x - gesture.x, dy = y - gesture.y;
      if (!gesture.started && Math.hypot(dx, dy) < 3) return;
      gesture.started = true;
      canvas.dataset.gesture = gesture.hit ? 'placement' : 'orbit';
      gesture.x = x;
      gesture.y = y;
      if (gesture.hit) {
        const position = view.decorationPlacement(gesture.hit, x, y);
        if (position && move(gesture.hit.index, position)) gesture.changed = true;
      } else orbit(-dx * .008, dy * .009);
    }

    function finish(cancelled) {
      if (!gesture) return;
      const { id, hit, original, changed } = gesture;
      gesture = undefined;
      delete canvas.dataset.gesture;
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      if (!changed) return;
      if (cancelled) move(hit.index, original);
      commit();
    }

    canvas.addEventListener('pointermove', movePointer);
    canvas.addEventListener('pointerup', (event) => {
      if (event.pointerId !== gesture?.id) return;
      movePointer(event);
      finish(false);
    });
    for (const type of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(type, (event) => {
      if (event.pointerId === gesture?.id) finish(true);
    });

    canvas.addEventListener('keydown', (event) => {
      if (!canEdit() || event.altKey || event.ctrlKey || event.metaKey) return;
      if (gesture) {
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(true);
        }
        return;
      }
      const command = keys[event.key];
      if (command) {
        event.preventDefault();
        commands[command]();
      } else if ((event.key === 'Enter' || event.key === ' ') && !event.repeat && !feed.hidden) {
        event.preventDefault();
        view.feedAtCenter();
      }
    });

    return { cancel: () => finish(true) };
  }

  window.LastraAquariumPreviewControls = Object.freeze({ mount });
}
