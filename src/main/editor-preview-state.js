// @ts-check
'use strict';

const METRICS = ['cpu', 'ram', 'gpu', 'cpuTemp', 'gpuTemp'];
const MEDIA_ROUTES = ['default', 'spotify', 'netflix'];
const PREVIEW_STATS = new Set(['cpu', 'gpu', 'ram', 'cpuTemp']);

function previewAudio(value) {
  const endpoint = (input, id) => Number.isFinite(input?.level)
    ? { id, level: input.level, muted: input.muted === true } : null;
  return {
    output: endpoint(value?.output, 'preview-output'),
    microphone: endpoint(value?.microphone, 'preview-microphone'),
    inputs: (value?.inputs ?? []).map((item, index) => endpoint(item, 'preview-input-' + index)).filter(Boolean),
    sampledAt: value?.sampledAt,
    version: value?.version,
  };
}

function previewSensors(value, history) {
  const readings = Object.fromEntries(METRICS.filter((key) => Number.isFinite(value?.[key])).map((key) => [key, value[key]]));
  const series = Object.fromEntries(METRICS.filter((key) => Array.isArray(history?.[key])).map((key) =>
    [key, history[key].slice(-60).filter((sample) => Array.isArray(sample) && sample.length === 2
      && Number.isFinite(sample[0]) && (sample[1] === null || Number.isFinite(sample[1])))]));
  return { ...readings, history: series, sampledAt: value?.sampledAt, hardwareAt: value?.hardwareAt,
    hardwareStaleMs: value?.hardwareStaleMs, hardwareSource: value?.hardwareSource };
}

function previewStats(snapshot) {
  return (snapshot?.overview ?? []).filter(({ id }) => PREVIEW_STATS.has(id))
    .map(({ id, value, status, at, maxAge, points }) => ({ id, value, status, at, maxAge, points: points.slice(-60) }));
}

function previewObs(value) {
  if (!value) return null;
  const { status, studio, program, preview, scenes, recording, streaming } = value;
  return { status, studio, program, preview, scenes,
    ...(status === 'connected' ? { recording: recording?.active, streaming: streaming?.active } : {}) };
}

function previewText(value) {
  return typeof value === 'string' ? value.replace(/[\p{Cc}]/gu, '').slice(0, 240) : undefined;
}

class PreviewMedia {
  constructor() {
    this.samples = new Map();
  }

  record(route, sample, now = Date.now()) {
    const key = route ?? 'default';
    if (!MEDIA_ROUTES.includes(key) || !sample) return;
    if (sample.status === 'ready') {
      const { title, artist, album, source, playback, durationMs, positionMs, timelineUpdatedAt } = sample;
      this.samples.set(key, {
        status: 'ready', sessionId: 'preview-' + key, trackId: previewText(sample.trackId), sampledAt: now,
        title: previewText(title), artist: previewText(artist), album: previewText(album), source: previewText(source),
        playback: ['playing', 'paused', 'stopped'].includes(playback) ? playback : undefined,
        durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
        positionMs: Number.isFinite(positionMs) ? positionMs : undefined,
        timelineUpdatedAt: Number.isFinite(timelineUpdatedAt) ? timelineUpdatedAt : undefined,
      });
    } else if (['empty', 'missing', 'unsupported'].includes(sample.status)) {
      this.samples.set(key, { status: sample.status === 'missing' ? 'unavailable' : sample.status });
    } else if (sample.status === 'unavailable') {
      const prior = this.samples.get(key);
      this.samples.set(key, { ...prior, status: Number.isFinite(prior?.sampledAt) ? 'stale' : 'unavailable' });
    }
  }

  snapshot(now = Date.now(), freshness = 3_500) {
    return Object.fromEntries([...this.samples].map(([key, sample]) => [
      key, sample.status === 'ready' && now - sample.sampledAt > freshness ? { ...sample, status: 'stale' } : sample,
    ]));
  }
}

module.exports = { previewAudio, previewSensors, previewStats, previewObs, PreviewMedia };
