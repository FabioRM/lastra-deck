'use strict';

{
  const { draftLayoutItems, proposeDraftLayout } = window.LastraPreviewLayout;
  const { catalog } = window.LastraWidgetLayout;

  function positionTile(tile, placement, geometry) {
    tile.style.left = placement.column * geometry.stepX + 'px';
    tile.style.top = placement.row * geometry.stepY + 'px';
    tile.style.width = (placement.cols - 1) * geometry.stepX + geometry.cell + 'px';
    tile.style.height = (placement.rows - 1) * geometry.stepY + geometry.cell + 'px';
  }

  function createPreviewLayoutControls(overlay, status, apply) {
    const marker = document.createElement('div');
    marker.className = 'preview-layout-marker';
    marker.hidden = true;
    let model;
    let drag;
    let restoreFocus;

    function cancel(message) {
      if (!drag) return;
      const { pointer } = drag;
      drag = undefined;
      marker.hidden = true;
      if (overlay.hasPointerCapture(pointer)) overlay.releasePointerCapture(pointer);
      if (message) status.textContent = message;
    }

    function propose(target, resize, dx, dy) {
      return proposeDraftLayout(model.page, model.grid, target, resize, dx, dy);
    }

    function finish(target, resize, proposal, keepFocus = false) {
      if (!proposal?.valid) {
        status.textContent = window.LastraI18n.t('Choose cells that fit without overlapping a key or widget.');
        return;
      }
      if (!proposal.changed) return;
      if (keepFocus) restoreFocus = { id: target.id, kind: target.kind, resize };
      apply(model.page, proposal);
      status.textContent = resize ? window.LastraI18n.t('Draft item resized.') : window.LastraI18n.t('Draft item moved.');
    }

    function pointerProposal(event) {
      const { x, y, target, resize } = drag;
      return propose(target, resize, Math.round((event.clientX - x) / model.geometry.stepX),
        Math.round((event.clientY - y) / model.geometry.stepY));
    }

    function handle(target, resize) {
      const control = document.createElement('button');
      control.type = 'button';
      control.className = resize ? 'preview-layout-resize' : 'preview-layout-move';
      const label = target.kind === 'widget' ? catalog[target.label]?.name ?? target.label : target.label;
      control.setAttribute('aria-label', `${resize ? 'Resize' : 'Move'} ${label}`);
      control.title = control.getAttribute('aria-label');
      if (resize) control.textContent = '↘';
      control.addEventListener('pointerdown', (event) => {
        if (!event.isPrimary || event.button !== 0 || drag) return;
        event.preventDefault();
        overlay.setPointerCapture(event.pointerId);
        drag = { target, resize, pointer: event.pointerId, x: event.clientX, y: event.clientY };
      });
      control.addEventListener('keydown', (event) => {
        const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
        if (!delta || drag) return;
        event.preventDefault();
        finish(target, resize, propose(target, resize, ...delta), true);
      });
      if (restoreFocus?.id === target.id && restoreFocus.kind === target.kind && restoreFocus.resize === resize) {
        restoreFocus = undefined;
        queueMicrotask(() => { if (control.isConnected) control.focus(); });
      }
      return control;
    }

    overlay.addEventListener('pointermove', (event) => {
      if (drag?.pointer !== event.pointerId) return;
      const proposal = pointerProposal(event);
      const { layout, valid } = proposal ?? {};
      marker.hidden = !layout || layout.cols < 1 || layout.rows < 1;
      if (!marker.hidden) {
        positionTile(marker, layout, model.geometry);
        marker.toggleAttribute('data-invalid', !valid);
      }
    });
    overlay.addEventListener('pointerup', (event) => {
      if (drag?.pointer !== event.pointerId) return;
      const { target, resize } = drag;
      const proposal = pointerProposal(event);
      cancel();
      finish(target, resize, proposal);
    });
    for (const eventName of ['pointercancel', 'lostpointercapture']) {
      overlay.addEventListener(eventName, (event) => {
        if (drag?.pointer === event.pointerId) cancel('Draft edit canceled.');
      });
    }
    window.addEventListener('keydown', (event) => {
      if (drag && event.key === 'Escape') {
        event.preventDefault();
        cancel('Draft edit canceled.');
      }
    });

    return {
      clear() {
        cancel();
        overlay.hidden = true;
        overlay.replaceChildren();
        model = undefined;
        restoreFocus = undefined;
      },
      render(page, grid, geometry) {
        if (drag && model.page === page && model.grid === grid
            && Object.entries(geometry).every(([key, value]) => Math.abs(value - model.geometry[key]) < 1)) return;
        cancel();
        model = { page, grid, geometry };
        overlay.hidden = false;
        Object.assign(overlay.style, { left: geometry.x + 'px', top: geometry.y + 'px',
          width: geometry.width + 'px', height: geometry.height + 'px' });
        const cells = draftLayoutItems(page, grid).map((target) => {
          const tile = document.createElement('div');
          tile.className = 'preview-layout-tile';
          positionTile(tile, target.layout, geometry);
          tile.append(handle(target, false), handle(target, true));
          return tile;
        });
        overlay.replaceChildren(...cells, marker);
      },
    };
  }

  window.createPreviewLayoutControls = createPreviewLayoutControls;
}
