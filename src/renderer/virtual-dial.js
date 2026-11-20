'use strict';

{
  const TURN = 2 * Math.PI;
  const DETENT = Math.PI / 12;
  const CENTER = .18;
  const FAST = .72;

  function polar(point, { x, y, radius }) {
    const dx = point.x - x;
    const dy = point.y - y;
    return { angle: Math.atan2(dy, dx), distance: Math.hypot(dx, dy) / radius };
  }

  function startDial(point, bounds, step) {
    const radius = Math.min(bounds.width, bounds.height) / 2;
    if (!Number.isFinite(radius) || radius <= 0) return null;
    const center = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2, radius };
    const { angle, distance } = polar(point, center);
    if (distance > 1) return null;
    return { center, first: point, angle: distance >= CENTER ? angle : undefined, dragged: false,
      step: distance >= FAST ? step : 1, remainder: 0, slop: Math.max(5, Math.min(9, radius * .14)) };
  }

  function moveDial(gesture, point) {
    const { x, y } = gesture.first;
    const { angle, distance } = polar(point, gesture.center);
    gesture.dragged ||= Math.hypot(point.x - x, point.y - y) >= gesture.slop;
    if (distance < CENTER) {
      gesture.angle = undefined;
      gesture.remainder = 0;
      return 0;
    }
    if (gesture.angle !== undefined) {
      const delta = angle - gesture.angle;
      gesture.remainder += ((delta + 3 * Math.PI) % TURN) - Math.PI;
    }
    gesture.angle = angle;
    if (!gesture.dragged) return 0;
    const ticks = Math.trunc((gesture.remainder + Math.sign(gesture.remainder) * 1e-9) / DETENT);
    gesture.remainder -= ticks * DETENT;
    return ticks * gesture.step;
  }

  function tapDial(gesture, point) {
    return !gesture.dragged && polar(point, gesture.center).distance <= 1
      && Math.hypot(point.x - gesture.first.x, point.y - gesture.first.y) < gesture.slop;
  }

  function createDial(settings, name) {
    const { element } = window.LastraWidgetComponents;
    const axis = element('div', 'widget-dial-axis');
    const face = element('div', 'widget-dial-face');
    face.setAttribute('aria-hidden', 'true');
    const control = element('input', 'widget-dial-control');
    control.type = 'range';
    control.min = '0';
    control.max = '100';
    control.step = '1';
    control.value = String(settings.defaultLevel);
    face.append(element('span', 'widget-dial-needle'));
    const dial = element('div', 'widget-dial');
    dial.append(face, control);
    const help = element('span', 'widget-dial-help');
    axis.append(dial, help);

    let handlers;
    let contact;
    const point = (event) => ({ x: event.clientX, y: event.clientY });
    const enabled = () => !control.disabled && control.getAttribute('aria-disabled') !== 'true';

    function setLabel(label, seekStart = false) {
      const tapLabel = seekStart ? 'go to the start of the seek range' : 'reset to the configured level';
      control.setAttribute('aria-label', label);
      control.setAttribute('aria-description', 'Turn the inner ring for fine steps or the outer ring for faster steps. Tap or press Enter to ' + tapLabel + '.');
      control.title = control.getAttribute('aria-description');
      help.textContent = 'Inner fine · Outer fast · ' + (seekStart ? 'Tap for start' : 'Tap to reset');
    }

    function cancel() {
      if (!contact) return;
      const { id } = contact;
      contact = undefined;
      if (control.hasPointerCapture(id)) control.releasePointerCapture(id);
      handlers?.cancel();
    }

    control.addEventListener('pointerdown', (event) => {
      if (!enabled() || event.button !== 0 || !event.isPrimary || contact || !handlers) return;
      event.preventDefault();
      const gesture = startDial(point(event), control.getBoundingClientRect(), settings.step);
      if (!gesture) return;
      control.focus({ preventScroll: true });
      contact = { id: event.pointerId, gesture };
      control.setPointerCapture(event.pointerId);
      handlers.begin();
    });
    control.addEventListener('pointermove', (event) => {
      if (contact?.id !== event.pointerId) return;
      if (!enabled()) { cancel(); return; }
      const delta = moveDial(contact.gesture, point(event));
      if (delta) handlers.step(delta);
    });
    control.addEventListener('pointerup', (event) => {
      if (contact?.id !== event.pointerId) return;
      if (!enabled()) { cancel(); return; }
      const { gesture } = contact;
      contact = undefined;
      const delta = moveDial(gesture, point(event));
      if (delta) handlers.step(delta);
      if (tapDial(gesture, point(event))) handlers.tap();
      handlers.release();
    });
    for (const name of ['pointercancel', 'lostpointercapture']) {
      control.addEventListener(name, (event) => { if (contact?.id === event.pointerId) cancel(); });
    }
    control.addEventListener('input', () => { if (!contact && enabled()) handlers?.set(control.valueAsNumber); });
    control.addEventListener('keydown', (event) => {
      if (!handlers || !enabled() || contact) return;
      const delta = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1,
        PageUp: settings.step, PageDown: -settings.step }[event.key];
      if (delta) {
        event.preventDefault();
        handlers.step(delta);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!event.repeat) handlers.tap();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        handlers.set(event.key === 'Home' ? 0 : 100);
      }
    });

    setLabel(name + ' level');
    return {
      axis, control, cancel, setLabel,
      bind(actions) { handlers = actions; },
      show(level, text) {
        const valid = Number.isFinite(level);
        dial.style.setProperty('--dial-percent', valid ? `${level}%` : '0%');
        dial.style.setProperty('--dial-angle', valid ? `${level * 3.6}deg` : '0deg');
        if (valid) control.value = String(level);
        control.setAttribute('aria-valuetext', text);
      },
    };
  }

  const api = { startDial, moveDial, tapDial, createDial };
  if (typeof module === 'object') module.exports = api;
  else window.LastraVirtualDial = api;
}
