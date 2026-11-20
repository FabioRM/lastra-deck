'use strict';

{
  const node = typeof module === 'object';
  const { keyReading, keyLiveState, keyLiveAppearance } = node ? require('../renderer/key-live-state') : window.LastraKeyLiveState;
  const { lastReading } = node ? require('../renderer/reading-time') : window.LastraReadingTime;
  const { READOUTS, SENSOR_READOUTS } = node ? require('../shared/key-readouts') : window.LastraKeyReadouts;
  const { WAIT_CONDITIONS } = node ? require('../shared/action-flow') : window.LastraActionFlow;
  const { catalog, defaultSettings } = node ? require('../shared/widget-layout') : window.LastraWidgetLayout;
  const { obsSceneState } = node ? require('../shared/linked-controls') : window.LastraLinkedControls;

  const AUDIO = 'Windows audio';
  const STATS = 'Lastra telemetry';
  const OBS = 'OBS WebSocket';
  const MEDIA = { default: 'now-playing', spotify: 'spotify', netflix: 'netflix' };
  const audioKeys = { speakers: 'output', microphones: 'microphone' };

  function row(id, label, provider, reading) {
    return { id, label, provider, value: reading?.text ?? 'Unavailable', sampledAt: reading?.sampledAt, stale: reading?.stale === true };
  }

  function mediaProvider(route) {
    return catalog[MEDIA[route]].provider;
  }

  function mediaRows(route, sample) {
    const provider = mediaProvider(route);
    const reading = (text) => text ? { text, sampledAt: sample.sampledAt, stale: sample.status === 'stale' } : null;
    const available = ['ready', 'stale'].includes(sample?.status);
    return [row(`${route}.title`, 'Track title', provider, available && reading(sample.title)),
      row(`${route}.playback`, 'Playback state', provider, available && reading(sample.playback))];
  }

  function liveRows(readings = {}, now = Date.now()) {
    const { audio, media, sensors, obs } = readings;
    const live = { audio, spotify: media?.spotify, sensors };
    const readouts = Object.keys(READOUTS).filter((id) => id !== 'auto' && id !== 'none').map((id) => {
      const provider = Object.hasOwn(audioKeys, id) ? AUDIO : id === 'spotify-remaining' ? mediaProvider('spotify') : STATS;
      return row(id, READOUTS[id], provider, keyReading(id, audioKeys[id], live, now));
    });
    const mute = (source) => {
      const result = keyLiveState(source, audio, null, now);
      return { text: result.text, stale: result.text === 'Cached', sampledAt: audio?.sampledAt };
    };
    const obsReadings = { 'obs-connected': obs?.status, 'obs-scene': obs?.status === 'connected' ? obs.program : undefined,
      'obs-recording': obs?.recording, 'obs-streaming': obs?.streaming };
    return [...readouts,
      row('speaker-muted', WAIT_CONDITIONS['speaker-muted'].label, AUDIO, mute('output')),
      row('microphones-muted', WAIT_CONDITIONS['microphones-muted'].label, AUDIO, mute('microphone')),
      ...Object.entries(obsReadings).map(([id, value]) => row(id, WAIT_CONDITIONS[id].label, OBS,
        value === undefined ? null : { text: String(value) })),
      ...Object.keys(MEDIA).flatMap((route) => mediaRows(route, media?.[route])),
    ];
  }

  function keyPreview(key, readings, now) {
    const source = key.liveSource ?? key.audio;
    const live = key.sceneTarget ? obsSceneState(readings.obs, key.sceneTarget)
      : source ? keyLiveState(source, readings.audio, readings.media?.spotify, now) : { text: '', pressed: null };
    const reading = key.readout && keyReading(key.readout, source, { ...readings, spotify: readings.media?.spotify }, now);
    const name = keyLiveAppearance(source, key.label, live).label;
    const details = [live.text, reading?.stale && live.text !== 'Cached' && 'Cached', reading?.text,
      key.unavailable ?? live.unavailable].filter(Boolean);
    return { name, details: details.length ? details : [key.readout ? 'Reading unavailable' : 'No live reading assigned'] };
  }

  function widgetPreview(widget, readings, now) {
    const name = catalog[widget.type].name;
    const settings = { ...defaultSettings(widget.type), ...widget.settings };
    if (['audio-fader', 'audio-encoder', 'virtual-dial'].includes(widget.type)) {
      const source = settings.device;
      const audio = { ...readings.audio, inputs: undefined };
      const id = source === 'microphone' ? 'microphones' : 'speakers';
      const reading = keyReading(id, source, { audio }, now);
      const state = keyLiveState(source, audio, null, now);
      return { name, details: [source === 'output' ? 'Speakers' : 'Microphone', state.text, reading?.text].filter(Boolean) };
    }
    const route = Object.keys(MEDIA).find((id) => MEDIA[id] === widget.type);
    if (route) return { name, details: mediaRows(route, readings.media?.[route]).map(({ value, stale }) => stale ? `${value} (cached)` : value) };
    const parts = widget.type === 'composition' ? settings.composition?.parts ?? [] : [{ metric: settings.metric }];
    const details = parts.flatMap(({ metric, text }) => {
      if (text) return [text];
      if (!Object.hasOwn(SENSOR_READOUTS, metric)) return [];
      const reading = keyReading(metric, null, readings, now);
      return [reading ? `${reading.text}${reading.stale ? ' (cached)' : ''}` : `${READOUTS[metric]} unavailable`];
    });
    return { name: settings.composition?.name ?? name, details };
  }

  function createInspector(dialog, read) {
    const query = dialog.querySelector('input[type="search"]');
    const rows = dialog.querySelector('tbody');
    const preview = dialog.querySelector('[data-variable-preview]');
    const status = dialog.querySelector('[role="status"]');
    let selection;
    let readings = {};
    let timer;
    let revision = 0;
    const child = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });

    function render() {
      const now = Date.now();
      const terms = query.value.toLowerCase().trim().split(/\s+/);
      const matches = liveRows(readings, now).filter(({ id, label, provider, value }) =>
        terms.every((term) => `${id} ${label} ${provider} ${value}`.toLowerCase().includes(term)));
      rows.replaceChildren(...matches.map(({ id, label, provider, value, sampledAt, stale }) => {
        const line = child('tr', '');
        const heading = child('th', label);
        heading.scope = 'row';
        heading.append(child('small', id));
        line.append(heading, child('td', provider), child('td', stale && value !== 'Cached' ? `${value} (cached)` : value),
          child('td', lastReading(sampledAt)));
        return line;
      }));
      if (!matches.length) {
        const empty = child('td', 'No matching variables');
        empty.colSpan = 4;
        const line = child('tr', '');
        line.append(empty);
        rows.append(line);
      }
      const model = selection.key ? keyPreview(selection.key, readings, now)
        : selection.widget ? widgetPreview(selection.widget, readings, now) : null;
      preview.hidden = !model;
      preview.replaceChildren(...(model ? [child('h3', model.name), child('p', model.details.join(' · '))] : []));
    }

    function stop() { clearTimeout(timer); return ++revision; }

    async function refresh(ticket) {
      try {
        const snapshot = await read();
        if (ticket !== revision || !dialog.open) return;
        readings = snapshot.readings ?? {};
        status.textContent = '';
      } catch {
        if (ticket !== revision || !dialog.open) return;
        readings = {};
        status.textContent = window.LastraI18n.t('Live readings unavailable');
      }
      render();
      timer = setTimeout(() => void refresh(ticket), 1_000);
    }

    function wake() {
      const ticket = stop();
      if (dialog.open && !document.hidden) void refresh(ticket);
    }

    query.addEventListener('input', render);
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', stop);
    document.addEventListener('visibilitychange', wake);
    return (target = {}) => {
      selection = target;
      readings = {};
      query.value = '';
      status.textContent = window.LastraI18n.t('Reading provider state…');
      dialog.showModal();
      query.focus();
      render();
      wake();
    };
  }

  if (node) module.exports = { liveRows, keyPreview, widgetPreview };
  else window.createLastraLiveVariables = createInspector;
}
