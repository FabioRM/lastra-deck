'use strict';

{
  const { element, button } = window.LastraDom;
  const states = { up: 'Available', down: 'Down', retrying: 'Retrying', waiting: 'Waiting', measuring: 'Measuring…' };
  const providers = { managed: 'LibreHardwareMonitor', http: 'LibreHardwareMonitor HTTP', preview: 'Preview' };
  const decimal = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
  const clock = new Intl.DateTimeFormat('en-GB', { timeStyle: 'short' });

  function reading(tile, sample) {
    if (tile.kind === 'hardware') {
      const system = tile.metric === 'cpu' || tile.metric === 'ram';
      const temperature = tile.metric.endsWith('Temp');
      const value = sample[tile.metric];
      const at = system ? sample.sampledAt : sample.hardwareAt;
      const stale = Number.isFinite(at) && Date.now() - at >= (system ? 3_000 : sample.hardwareStaleMs ?? 6_000);
      const source = system ? 'Operating system' : providers[sample.hardwareSource] ?? 'No source';
      return [Number.isFinite(value) ? `${Math.round(temperature ? value : value * 100)}${temperature ? ' °C' : '%'}` : 'Unavailable',
        source + (stale ? ' · Stale' : '')];
    }
    if (tile.kind === 'service') {
      const detail = ['Service health'];
      if (Number.isFinite(tile.latencyMs)) detail.push(`${Math.round(tile.latencyMs)} ms`);
      if (Number.isFinite(tile.sampledAt)) detail.push(clock.format(tile.sampledAt));
      return [states[tile.state] ?? 'Unavailable', detail.join(' · ')];
    }
    if (tile.state !== 'ready') return [states[tile.state] ?? 'Unavailable', tile.view === 'docker' ? 'Docker Engine' : 'Process usage'];
    if (tile.view === 'docker') return [`${tile.partial ? '≥' : ''}${tile.value} running`, 'Docker Engine'];
    return [`${decimal.format(tile.value)}${tile.metric === 'cpu' ? '%' : ' MiB'}`, 'Process usage'];
  }

  function mount(container, read, _dispatch, { openRelated }) {
    const overview = element('div', 'watchlist-cards');
    const message = element('p', 'app-view-secondary');
    const detail = element('section', 'watchlist-detail');
    message.setAttribute('role', 'status');
    detail.hidden = true;
    container.replaceChildren(message, overview, detail);
    let state = { tiles: [] };
    let sample = {};
    let visible = false;
    let tileSignature;
    let unsubscribe;
    let hardware;
    let cards = [];

    function updateCards() {
      const signature = JSON.stringify(state.tiles.map(({ id, label, view }) => [id, label, view]));
      if (signature !== tileSignature) {
        tileSignature = signature;
        cards = state.tiles.map((tile) => {
          const control = button('', () => {
            if (tile.kind === 'hardware') openHardware(tile);
            else if (tile.view) openRelated(tile.view, tile.target);
          }, 'watchlist-card');
          control.disabled = tile.kind !== 'hardware' && !tile.view;
          const value = element('strong', 'widget-stat');
          const source = element('span', 'app-view-secondary');
          control.append(element('span', '', tile.label), value, source);
          return { control, value, source };
        });
        overview.replaceChildren(...cards.map(({ control }) => control));
      }
      cards.forEach(({ value, source }, index) => {
        const [text, from] = reading(state.tiles[index], sample);
        if (value.textContent !== text) value.textContent = text;
        if (source.textContent !== from) source.textContent = from;
      });
    }

    function openHardware(tile) {
      detail.hidden = false;
      const slot = element('div', 'lastra-widget-grid watchlist-chart');
      const back = button('Back to watchlist', () => {
        hardware.destroy();
        hardware = null;
        detail.hidden = true;
        detail.replaceChildren();
        sync();
      }, 'watchlist-back');
      detail.replaceChildren(back, slot);
      hardware = window.LastraWidgets.mount(slot, [{ id: 'watchlist-detail', type: 'system-metric',
        settings: { metric: tile.metric, shape: 'graph' } }]);
      sync();
      back.focus({ preventScroll: true });
    }

    const feed = window.createVisibleFeed(read, (next) => {
      const text = next.error ?? (next.status === 'loading' ? 'Reading watchlist…'
        : next.tiles?.length === 0 ? 'Choose watchlist readings in Lastra Settings.' : '');
      message.textContent = text;
      message.hidden = !text;
      if (!next.tiles) return;
      state = next;
      updateCards();
    }, { interval: 3_000, error: 'Could not read the watchlist.' });

    function sync() {
      const showOverview = visible && !hardware;
      overview.hidden = Boolean(hardware);
      if (hardware) message.hidden = true;
      feed.setVisible(showOverview);
      if (showOverview && !unsubscribe) {
        unsubscribe = window.LastraWidgetProviders.telemetry.subscribe((reading) => {
          sample = reading;
          updateCards();
        });
      } else if (!showOverview && unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
      hardware?.setVisible(visible);
    }

    return {
      setVisible(active) {
        if (visible === active) return;
        visible = active;
        sync();
      },
      destroy() {
        visible = false;
        sync();
        hardware?.destroy();
      },
    };
  }

  window.LastraWatchlist = { mount };
}
