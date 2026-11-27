'use strict';

{
  const api = window.lastra;
  if (api?.onAquarium) {
    const panel = document.getElementById('aquarium-panel');
    const view = window.LastraAquariumView.mount({
      canvas: document.getElementById('aquarium-canvas'),
      status: document.getElementById('aquarium-status'),
      canFeed: () => !panel.parentElement.hasAttribute('data-view-only'),
    });
    api.onAquarium(view.configure);
    api.onAquariumLightingPreview(view.previewPanelLighting);
    api.onFeeds((snapshot) => view.setLocation(snapshot?.weather));
    window.LastraAquarium = view;
  }
}
