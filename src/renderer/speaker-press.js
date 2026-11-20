'use strict';

{
  const HOLD_MS = 550;
  const MOVE_TOLERANCE = 18;

  function bind(button, { onShortPress, onLongPress }) {
    const document = button.ownerDocument;
    const window = document.defaultView;
    const controller = new AbortController();
    const listen = { signal: controller.signal };
    let active;
    let released;

    function stop() {
      const press = active;
      active = released = undefined;
      if (!press) return;
      clearTimeout(press.timer);
      if (button.hasPointerCapture(press.id)) button.releasePointerCapture(press.id);
    }

    function withinTolerance(event, press) {
      const { left, right, top, bottom } = button.getBoundingClientRect();
      const { clientX: x, clientY: y } = event;
      return x >= left && x <= right && y >= top && y <= bottom
        && Math.hypot(x - press.x, y - press.y) < press.tolerance;
    }

    function hold(press) {
      if (active !== press || press.long || button.disabled || !button.isConnected) return;
      press.long = true;
      onLongPress();
    }

    button.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0 || active || button.disabled) return;
      released = undefined;
      const scale = button.offsetWidth ? button.getBoundingClientRect().width / button.offsetWidth : 1;
      const press = active = {
        id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp,
        tolerance: MOVE_TOLERANCE * scale, long: false,
      };
      // Window listeners also cover a pointer that cannot be captured.
      try { button.setPointerCapture(press.id); } catch {}
      press.timer = setTimeout(() => hold(press), HOLD_MS);
    }, listen);

    const capture = { ...listen, capture: true };
    window.addEventListener('pointermove', (event) => {
      if (active?.id === event.pointerId && !withinTolerance(event, active)) stop();
    }, capture);
    window.addEventListener('pointerup', (event) => {
      const press = active;
      if (press?.id !== event.pointerId) return;
      if (!withinTolerance(event, press) || button.disabled) {
        stop();
        return;
      }
      clearTimeout(press.timer);
      if (event.timeStamp - press.time >= HOLD_MS) hold(press);
      // Implicit lostpointercapture follows pointerup before click. Keep the
      // short release separate from the active press so it survives that event.
      if (active === press) {
        active = undefined;
        if (!press.long) released = { id: press.id, time: event.timeStamp };
      }
    }, capture);
    function cancelPointer(event) {
      if (active?.id === event.pointerId) stop();
    }
    window.addEventListener('pointercancel', cancelPointer, capture);
    button.addEventListener('lostpointercapture', cancelPointer, listen);

    button.addEventListener('click', (event) => {
      if (button.disabled || event.defaultPrevented) return;
      const keyboard = event.detail === 0 && !event.pointerType && !event.sourceCapabilities?.firesTouchEvents;
      const shortRelease = released && (!event.pointerId || event.pointerId === released.id) && event.timeStamp >= released.time;
      if (keyboard || shortRelease) {
        released = undefined;
        onShortPress();
      } else {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, capture);

    button.addEventListener('keydown', (event) => {
      const menu = event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey) || event.key === 'ArrowDown';
      if (!menu || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      if (event.repeat || button.disabled) return;
      stop();
      onLongPress();
    }, listen);
    // A touch-generated context menu must not trigger a second action.
    button.addEventListener('contextmenu', (event) => event.preventDefault(), listen);
    button.addEventListener('blur', stop, listen);
    window.addEventListener('blur', stop, listen);
    window.addEventListener('pagehide', stop, listen);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); }, listen);

    return () => {
      stop();
      controller.abort();
    };
  }

  window.LastraSpeakerPress = { bind };
}
