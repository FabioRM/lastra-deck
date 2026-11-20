'use strict';

{
  function seekPosition({ min, max }, level) {
    return Math.round(min + (max - min) * level / 100);
  }

  function mediaEndpoint(sample, position, now = Date.now()) {
    const { sessionId, trackId, seekMinMs: min, seekMaxMs: max } = sample ?? {};
    if (sample?.status !== 'ready' || !sessionId || !trackId || !Number.isSafeInteger(min)
        || !Number.isSafeInteger(max) || min < 0 || max <= min) return null;
    const value = position(sample, now);
    if (!Number.isFinite(value)) return null;
    const bounded = Math.min(max, Math.max(min, value));
    return { id: `${sessionId}:${trackId}`, level: (bounded - min) * 100 / (max - min), label: 'Media scrub',
      title: sample.title || 'Current Windows media track', target: { sessionId, trackId, min, max } };
  }

  function obsEndpoint(view) {
    const { detail, generation, sourceScene: scene } = view ?? {};
    if (view?.status !== 'connected' || !Number.isSafeInteger(generation) || !scene || !detail?.name
        || !['number', 'string'].includes(typeof detail.id) || !Number.isFinite(detail.volume)
        || detail.volume < 0 || detail.volume > 1) return null;
    const { id: item, name: source } = detail;
    const target = { generation, scene, source, item };
    return { id: JSON.stringify(target), level: Math.round(detail.volume * 100), label: 'OBS volume',
      title: `${scene} · ${source}`, target };
  }

  function createRoutes({ api, providers, media, audioLabel, settings }) {
    const { device, defaultLevel, modePicker } = settings;
    const audio = {
      label: audioLabel, reset: defaultLevel, subscribe: providers.audio.subscribe,
      read: (sample) => ({ endpoint: sample?.[device], version: sample?.version }),
      async write(endpoint, level) {
        const result = await api.changeAudio(device, level, endpoint.id);
        if (!result?.ok) throw new Error(result?.message ?? 'Could not change the audio level.');
        return result.confirmed;
      },
    };
    const routes = { audio };
    if (modePicker !== 'on') return routes;
    if (api?.seekMediaVerified) routes.media = {
      label: 'Media scrub', valueLabel: 'position', reset: 0, resetLabel: 'Start', resetTitle: 'Go to the start of the seek range', defer: true,
      scopedVersions: true,
      subscribe: providers.media.subscribe,
      read: (sample) => ({ endpoint: mediaEndpoint(sample, media.position), version: sample?.positionUpdatedAt }),
      format: (level, endpoint) => media.time(seekPosition(endpoint.target, level)),
      async write(endpoint, level) {
        const { sessionId, trackId } = endpoint.target;
        const result = await api.seekMediaVerified({ sessionId, trackId, positionMs: seekPosition(endpoint.target, level) });
        if (!result?.ok) throw new Error(result?.message ?? 'Could not confirm the media position.');
        return this.read(result.reading);
      },
    };
    if (api?.changeObs && providers.obs) routes.obs = {
      label: 'OBS volume', reset: defaultLevel, scopedVersions: true, subscribe: providers.obs.subscribe,
      read: (sample) => ({ endpoint: obsEndpoint(sample), version: sample?.sampledAt }),
      async write(endpoint, level) {
        const result = await api.changeObs({ type: 'volume', value: level, ...endpoint.target });
        if (!result?.ok) throw new Error(result?.message ?? 'Could not confirm the OBS source level.');
      },
    };
    if (providers.backlight) {
      const owner = crypto.randomUUID();
      routes.backlight = {
        label: 'Brightness', reset: defaultLevel, defer: true, subscribe: providers.backlight.subscribe,
        read(sample) {
          const { reading, version } = sample ?? {};
          const endpoint = reading?.ok && typeof reading.token === 'string' && Number.isInteger(reading.percent)
            ? { id: reading.token, level: reading.percent, title: 'XENEON EDGE brightness' } : null;
          return { endpoint, version };
        },
        async write(endpoint, level) {
          return this.read(await providers.backlight.write(owner, endpoint.id, level));
        },
        cancel: () => providers.backlight.cancel(owner),
      };
    }
    return routes;
  }

  const api = { createRoutes, mediaEndpoint, obsEndpoint, seekPosition };
  if (typeof module === 'object') module.exports = api;
  else window.LastraControlModes = api;
}
