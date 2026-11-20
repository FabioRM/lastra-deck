'use strict';

{
  const node = typeof module === 'object';
  const { SENSOR_READOUTS, DEFAULT_READOUTS } = node ? require('../shared/key-readouts') : window.LastraKeyReadouts;
  const { timerSummary, formatTimer } = node ? require('../shared/timers') : window.LastraTimers;
  const { soundReading } = node ? require('../shared/sounds') : window.LastraSounds;
  const { position, time } = node ? (() => {
    const { mediaPosition, mediaTime } = require('./now-playing');
    return { position: mediaPosition, time: mediaTime };
  })() : window.LastraMediaHelpers;
  const unavailable = Object.freeze({ text: 'Unavailable', pressed: null });
  const cached = Object.freeze({ text: 'Cached', pressed: null });
  const playback = {
    playing: { text: 'Playing', pressed: true },
    paused: { text: 'Paused', pressed: false },
    stopped: { text: 'Stopped', pressed: false },
    changing: { text: 'Changing…', pressed: null },
    opened: { text: 'Ready', pressed: null },
  };

  function muteState(values) {
    if (values.includes(true) && values.includes(false)) return { text: 'Partly muted', pressed: 'mixed' };
    if (!values.length || values.some((value) => typeof value !== 'boolean')) return unavailable;
    return values[0] ? { text: 'Muted', pressed: true } : { text: 'Unmuted', pressed: false };
  }

  const isStale = (stamp, now, maxAge) => Number.isFinite(stamp) && now - stamp >= maxAge;

  function keyLiveState(source, audio, spotify, now = Date.now()) {
    if (source === 'output' || source === 'microphone') {
      const values = source === 'output' ? [audio?.output?.muted] : (audio?.inputs ?? [audio?.microphone]).map((input) => input?.muted);
      const state = muteState(values);
      return state !== unavailable && isStale(audio?.sampledAt, now, 3000) ? cached : state;
    }
    if (source === 'spotify') {
      if (!spotify || spotify.status === 'loading') return { text: 'Checking…', pressed: null };
      if (spotify.status === 'stale') return cached;
      return spotify.status === 'ready' && Object.hasOwn(playback, spotify.playback) ? playback[spotify.playback] : unavailable;
    }
    return unavailable;
  }

  /**
   * State and reading of a timer key. `timers` is the latest timer snapshot and `key` the timer the key controls.
   * A key whose timer has not started reads Ready with its preset duration.
   */
  function timerKeyState(timers, key, now = Date.now()) {
    if (!timers || timers.status === 'loading') return { text: 'Checking…', pressed: null };
    if (timers.status !== 'ready') return unavailable;
    const timer = timers.timers.find(({ id }) => id === key?.id);
    if (!timer) {
      return { text: 'Ready', pressed: false, reading: key?.kind === 'countdown' && Number.isFinite(key.durationMs) ? formatTimer(key.durationMs) : '' };
    }
    const { status, state, time: reading } = timerSummary(timer, now);
    return { text: state, pressed: status === 'running' ? true : status === 'paused' ? 'mixed' : false, reading, finished: status === 'complete' };
  }

  /** State and reading of a sound key. `sounds` is the latest soundboard snapshot and `key` the clip the key plays. */
  function soundKeyState(sounds, key, now = Date.now()) {
    if (!sounds || sounds.status === 'loading') return { text: 'Checking…', pressed: null };
    if (sounds.status !== 'ready') return unavailable;
    const { playing, remainingMs } = soundReading(sounds, key?.id, now);
    if (!playing) return { text: 'Ready', pressed: false, reading: '' };
    return { text: 'Playing', pressed: true, reading: remainingMs === null ? '' : `${formatTimer(remainingMs)} left` };
  }

  function keyLiveAppearance(source, label, { pressed, finished }) {
    const state = pressed === null ? 'unknown' : pressed === 'mixed' ? 'mixed' : pressed ? 'on' : 'off';
    const tone = source === 'timer' ? (finished ? 'muted' : pressed === true ? 'playing' : 'neutral')
      : pressed === null ? 'neutral' : ['spotify', 'obs-scene', 'sound'].includes(source) ? (pressed ? 'playing' : 'neutral')
      : pressed === false ? 'neutral' : 'muted';
    if (pressed !== null && source === 'spotify' && label === 'Play or pause') label = pressed ? 'Pause Spotify' : 'Play Spotify';
    if (pressed === true && source === 'output' && label === 'Mute speakers') label = 'Unmute speakers';
    return { state, tone, label };
  }

  function keyReading(readout, source, { audio, spotify, sensors }, now = Date.now()) {
    const prefix = DEFAULT_READOUTS[source] === readout ? ''
      : readout === 'speakers' ? 'Speakers ' : readout === 'microphones' ? 'Mics ' : '';
    const percent = (value) => Math.round(Math.max(0, Math.min(100, value))) + '%';
    const fromAudio = (text) => ({ text, sampledAt: audio.sampledAt, stale: isStale(audio.sampledAt, now, 3000) });
    if (readout === 'speakers') return Number.isFinite(audio?.output?.level) ? fromAudio(prefix + percent(audio.output.level)) : null;
    if (readout === 'microphones') {
      const inputs = audio?.inputs ?? [audio?.microphone];
      const levels = inputs.map((entry) => entry?.level).filter(Number.isFinite);
      if (!levels.length) return null;
      const approximate = levels.length !== inputs.length || levels.some((level) => level !== levels[0]);
      const average = levels.reduce((sum, level) => sum + level, 0) / levels.length;
      return fromAudio(prefix + (approximate ? '≈' : '') + percent(average));
    }
    if (readout === 'spotify-remaining') {
      if (!['ready', 'stale'].includes(spotify?.status)) return null;
      const stale = spotify.status === 'stale';
      const sampledAt = spotify.sampledAt;
      const at = stale && !Number.isFinite(sampledAt) ? spotify.positionMs : position({ rate: 1, ...spotify }, stale ? sampledAt : now);
      if (!Number.isFinite(at) || !Number.isFinite(spotify.durationMs)) return null;
      return { text: time(spotify.durationMs - at + 999) + ' left', sampledAt, stale };
    }
    if (!Object.hasOwn(SENSOR_READOUTS, readout) || !Number.isFinite(sensors?.[readout])) return null;
    const hardware = readout !== 'cpu' && readout !== 'ram';
    const sampledAt = hardware ? sensors.hardwareAt : sensors.sampledAt;
    const maxAge = hardware ? (sensors.hardwareStaleMs ?? 6000) : 3000;
    if (!Number.isFinite(sampledAt)) return null;
    const value = sensors[readout];
    const reading = readout.endsWith('Temp') ? `${Math.round(value)} °C` : percent(value * 100);
    return { text: `${SENSOR_READOUTS[readout]} ${reading}`, sampledAt, stale: isStale(sampledAt, now, maxAge) };
  }

  const api = { keyLiveState, keyLiveAppearance, keyReading, timerKeyState, soundKeyState };
  if (node) module.exports = api;
  else window.LastraKeyLiveState = api;
}
