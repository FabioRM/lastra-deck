'use strict';

{
  const labels = {
    alerts: ['unacknowledged alert', 'unacknowledged alerts', 'Alert count unavailable'],
    services: ['confirmed failed check', 'confirmed failed checks', 'Service check count unavailable'],
    timers: ['active production timer', 'active production timers', 'Production timer count unavailable'],
  };

  function badgeText(id, reading) {
    const [single, plural, unavailable] = labels[id];
    if (reading?.status === 'ready') {
      const { count } = reading;
      return { text: count ? (count > 99 ? '99+' : String(count)) : '', description: `${count} ${count === 1 ? single : plural}` };
    }
    if (reading?.status === 'unconfigured') return { text: '', description: 'No service checks configured' };
    if (reading?.status === 'warming') return { text: '…', description: 'Waiting for service checks' };
    if (reading?.status === 'stale') return { text: 'Stale', description: 'Service check readings are stale' };
    return { text: reading ? '?' : '', description: unavailable };
  }

  function createNavigationBadges(api) {
    let current;
    let receivedEvent = false;

    function paint(control) {
      const id = control.dataset.navigationBadge;
      const reading = current?.[id];
      const { text, description } = badgeText(id, reading);
      const badge = control.querySelector('.navigation-count');
      if (badge.textContent !== text) badge.textContent = text;
      badge.dataset.status = reading?.status ?? 'unavailable';
      badge.hidden = !text;
      badge.title = description;
      control.setAttribute('aria-description', description);
    }

    function update(readings) {
      current = readings;
      document.querySelectorAll('[data-navigation-badge]').forEach(paint);
    }

    api.onDeckBadges((readings) => {
      receivedEvent = true;
      update(readings);
    });
    void api.readDeckBadges().then((readings) => {
      if (!receivedEvent) update(readings);
    }).catch(() => {});

    return {
      attach(control, id) {
        if (!control || !Object.hasOwn(labels, id)) return;
        const badge = document.createElement('span');
        badge.className = 'navigation-count';
        badge.setAttribute('aria-hidden', 'true');
        control.dataset.navigationBadge = id;
        control.append(badge);
        paint(control);
      },
    };
  }

  if (typeof module === 'object') module.exports = { badgeText };
  else if (window.lastra?.onDeckBadges) window.LastraNavigationBadges = createNavigationBadges(window.lastra);
}
