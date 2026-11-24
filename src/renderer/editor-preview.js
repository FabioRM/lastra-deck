'use strict';

{
  const params = new URLSearchParams(location.search);
  const panelPreview = window.lastraPanelPreview;
  const isPreview = panelPreview || (window.parent !== window && params.get('editor-preview') === '1');
  if (isPreview) {
    document.getElementById('stage').inert = true;
    if (panelPreview) {
      document.getElementById('panel-preview-controls').hidden = false;
      document.getElementById('panel-preview-close').addEventListener('click', () => panelPreview.close());
    }
    const panel = params.get('panel-preview');
    const fixtures = ['dashboard', 'stats', 'apps'].includes(panel) ? window.LastraPanelFixtures() : null;
    if (!fixtures) {
      for (const meter of document.querySelectorAll('[data-peak]')) meter.parentElement.hidden = true;
    }
    const subscribers = new Set();
    const appearanceListeners = new Set();
    const audioListeners = new Set();
    const obsListeners = new Set();
    const sensorListeners = new Set();
    let view;
    let readings;
    let selectedReadings;
    let resolveInitial;
    const initial = new Promise((resolve) => { resolveInitial = resolve; });

    function audioSample() {
      return selectedReadings?.audio ?? fixtures?.audio ?? (readings ? readings.audio ?? { output: null, microphone: null }
        : { output: { id: 'sample-output', level: 66, muted: false },
          microphone: { id: 'sample-microphone', level: 85, muted: true },
          inputs: [{ id: 'sample-microphone', level: 85, muted: true }] });
    }

    function sensorSample() {
      if (selectedReadings?.sensors) return selectedReadings.sensors;
      if (readings) return readings.sensors ?? {};
      const now = Date.now();
      return { cpu: 0.34, ram: 0.71, gpu: 0.88, cpuTemp: 61, gpuTemp: 74,
        sampledAt: now, hardwareAt: now, hardwareSource: 'preview' };
    }

    function receive(data) {
      if (data?.type === 'lastra:editor-preview' && data.view) {
        window.LastraI18n.set(data.language);
        const previous = view;
        view = data.view;
        selectedReadings = data.readings;
        if (selectedReadings?.audio) for (const listener of audioListeners) listener(audioSample());
        if (selectedReadings?.sensors) for (const listener of sensorListeners) listener(sensorSample());
        const appearance = window.LastraAppearance.normalizeAppearance(data.appearance);
        for (const listener of appearanceListeners) listener(appearance);
        if (!previous) resolveInitial(view);
        else for (const listener of subscribers) listener(view);
      } else if (!fixtures && data?.type === 'lastra:editor-readings') {
        const previous = readings;
        readings = data.readings;
        if (!previous || !readings || previous.audio?.version !== readings.audio?.version) {
          for (const listener of audioListeners) listener(audioSample());
        }
        const nextObs = readings?.obs;
        if (JSON.stringify(previous?.obs) !== JSON.stringify(nextObs)) {
          for (const listener of obsListeners) listener(nextObs);
        }
        if (!previous || !readings || previous.sensors?.sampledAt !== readings.sensors?.sampledAt
            || JSON.stringify(previous.sensors?.sensorWidgets) !== JSON.stringify(readings.sensors?.sensorWidgets)) {
          for (const listener of sensorListeners) listener(sensorSample());
        }
      }
    }
    if (panelPreview) panelPreview.onUpdate(receive);
    else window.addEventListener('message', (event) => {
      if (event.source === window.parent) receive(event.data);
    });

    const panels = fixtures && Object.freeze({
      ...fixtures.panels,
      get fixtureTime() { return selectedReadings?.stats ? undefined : fixtures.fixtureTime; },
      onAudio(callback) {
        audioListeners.add(callback);
        callback(audioSample());
        return () => audioListeners.delete(callback);
      },
      readAudioPeaks: () => selectedReadings?.audio ? null : fixtures.panels.readAudioPeaks(),
      async readStats() {
        const sample = await fixtures.panels.readStats();
        if (!selectedReadings?.stats) return sample;
        const live = new Map(selectedReadings.stats.map((item) => [item.id, item]));
        const overview = sample.overview.map((item) => ({
          ...item, device: '', source: live.has(item.id) ? 'Windows telemetry' : 'Unavailable in live preview',
          value: null, status: 'unavailable', at: null, points: [], ...live.get(item.id),
        }));
        return { ...sample, overview, readings: overview };
      },
    });

    window.LastraDeckPreview = Object.freeze({
      ...(fixtures ? { panels, fixtureTime: fixtures.fixtureTime } : {}),
      ...(panel === 'apps' ? {
        async getAppViews() {
          const { appView } = await initial;
          return { views: [appView], pinned: [], selected: appView.id };
        },
        getAppViewData: () => ({ status: 'available', windows: [{ id: 'fixture-window', title: 'Sample app window' }] }),
      } : {}),
      getProfile: () => initial,
      onProfile(callback) {
        subscribers.add(callback);
        return () => subscribers.delete(callback);
      },
      onDeckAppearance(callback) {
        appearanceListeners.add(callback);
        return () => appearanceListeners.delete(callback);
      },
      onAudio(callback) {
        audioListeners.add(callback);
        callback(audioSample());
        return () => audioListeners.delete(callback);
      },
      onObs(callback) {
        obsListeners.add(callback);
        callback(readings?.obs);
        return () => obsListeners.delete(callback);
      },
      onSensors(callback) {
        sensorListeners.add(callback);
        callback(sensorSample());
        const timer = setInterval(() => { if (!readings && !selectedReadings?.sensors) callback(sensorSample()); }, 2_000);
        return () => {
          clearInterval(timer);
          sensorListeners.delete(callback);
        };
      },
      getNowPlaying(_artworkId, _selection, route) {
        if (fixtures) return fixtures.media;
        if (readings) return readings.media?.[route ?? 'default'] ?? { status: 'empty' };
        return { status: 'ready', sessionId: 'sample', trackId: 'sample', title: 'Sample track', artist: 'Sample artist',
          source: route === 'spotify' ? 'Spotify' : 'Windows media', playback: 'paused',
          durationMs: 180_000, positionMs: 53_000, canPlay: true, canPrevious: true, canNext: true };
      },
      updateGeometry(grid, { cols, rows, cell, columnGap, rowGap, scale, revision }) {
        const rect = grid.getBoundingClientRect();
        const stepX = (cell + columnGap) * scale;
        const stepY = (cell + rowGap) * scale;
        const width = cols * stepX - columnGap * scale;
        const height = rows * stepY - rowGap * scale;
        window.parent.postMessage({ type: 'lastra:editor-grid', revision, geometry: {
          x: rect.left + (rect.width - width) / 2, y: rect.top + (rect.height - height) / 2,
          width, height, stepX, stepY, cell: cell * scale,
        } }, '*');
      },
    });
  }
}
