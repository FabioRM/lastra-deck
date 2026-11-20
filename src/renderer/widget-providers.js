'use strict';

{
  function sharedSubscription(start) {
    const listeners = new Set();
    let latest;
    let stop;

    function publish(value) {
      latest = value;
      for (const listener of listeners) listener(value);
    }

    return {
      subscribe(listener) {
        const subscriber = (value) => listener(value);
        listeners.add(subscriber);
        if (listeners.size === 1) stop = start(publish);
        else if (latest !== undefined) listener(latest);
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          listeners.delete(subscriber);
          if (listeners.size === 0) {
            stop?.();
            stop = undefined;
            latest = undefined;
          }
        };
      },
    };
  }

  function createMediaProvider(api, { selectionId, route, pollMs = 1_000, now = Date.now } = {}) {
    let ready;
    let readAt = 0;
    let inFlight;
    return sharedSubscription((publish) => {
      if (!api?.getNowPlaying) {
        publish({ status: 'unsupported' });
        return;
      }
      let stopped = false;
      let timer;
      publish({ status: 'loading' });

      async function poll() {
        let next;
        try {
          inFlight ??= Promise.resolve(api.getNowPlaying(ready?.trackId, selectionId, route))
            .finally(() => { inFlight = undefined; });
          next = await inFlight;
        } catch {
          next = { status: 'unavailable' };
        }
        if (stopped) return;
        const delay = typeof pollMs === 'function' ? pollMs() : pollMs;
        if (next?.status === 'ready') {
          const sameTrack = next.sessionId === ready?.sessionId && next.trackId === ready?.trackId;
          const artwork = Object.hasOwn(next, 'artwork') ? next.artwork : sameTrack ? ready.artwork : null;
          readAt = now();
          ready = { ...next, artwork, sampledAt: readAt };
          publish(ready);
        } else if (next?.status === 'busy') {
          if (ready && now() - readAt > Math.max(3_500, delay * 2)) publish({ ...ready, status: 'stale' });
        } else if (ready && next?.status === 'unavailable') {
          publish({ ...ready, status: 'stale' });
        } else {
          ready = undefined;
          publish(next ?? { status: 'unavailable' });
        }
        if (!stopped) timer = setTimeout(poll, delay);
      }

      poll();
      return () => {
        stopped = true;
        clearTimeout(timer);
      };
    });
  }

  function retainedUpdates(start) {
    const listeners = new Set();
    let latest;
    start?.((value) => {
      latest = value;
      for (const listener of listeners) listener(value);
    });
    return {
      subscribe(listener) {
        listeners.add(listener);
        if (latest !== undefined) listener(latest);
        return () => listeners.delete(listener);
      },
    };
  }

  function createWidgetProviders(api) {
    let mediaInterval = 1_000;
    api?.onMonitoringSettings?.(({ media }) => {
      if ([1_000, 2_000, 3_000].includes(media)) mediaInterval = media;
    });
    const mediaDelay = () => mediaInterval;
    const media = createMediaProvider(api, { pollMs: mediaDelay, ...(api?.fixtureTime ? { now: () => api.fixtureTime } : {}) });
    const spotify = createMediaProvider(api, { route: 'spotify', pollMs: () => mediaInterval === 1_000 ? 1_250 : mediaInterval });
    const netflix = createMediaProvider(api, { route: 'netflix', pollMs: () => mediaInterval === 1_000 ? 1_450 : mediaInterval });
    const audio = sharedSubscription((publish) => api?.onAudio?.(publish));
    const obs = api?.onObs ? retainedUpdates(api.onObs) : null;
    const telemetry = sharedSubscription((publish) => {
      if (!api?.onSensors) {
        publish({ status: 'unsupported' });
        return;
      }
      let latest;
      const history = new window.TelemetryHistory();
      const stop = api.onSensors((sample) => {
        if (sample.history) {
          for (const [metric, values] of Object.entries(sample.history)) {
            if (Array.isArray(values) && Object.hasOwn(history.series, metric)) history.series[metric] = values.slice();
          }
        }
        history.record(sample);
        latest = { ...sample, history: history.series };
        publish(latest);
      });
      const timer = setInterval(() => {
        if (latest && Date.now() - latest.sampledAt > 1_500) publish(latest);
      }, 1_000);
      return () => {
        stop();
        clearInterval(timer);
      };
    });

    const timers = sharedSubscription((publish) => {
      if (!api?.onTimers || !api.readTimers) {
        publish({ status: 'unsupported', timers: [] });
        return undefined;
      }
      let active = true;
      let latest = -1;
      const accept = (state) => {
        // A pushed update can overtake the first read. Keep the newer of the two.
        if (!active || !Array.isArray(state?.timers) || (state.revision < latest && latest - state.revision < 1_000)) return;
        latest = state.revision;
        publish({ status: 'ready', ...state });
      };
      const stop = api.onTimers(accept);
      publish({ status: 'loading', timers: [] });
      void api.readTimers().then((result) => {
        if (result?.ok) accept(result.state);
        else if (active && latest < 0) publish({ status: 'unavailable', timers: [], message: result?.message });
      }).catch(() => { if (active && latest < 0) publish({ status: 'unavailable', timers: [] }); });
      return () => {
        active = false;
        stop();
      };
    });

    const sounds = sharedSubscription((publish) => {
      if (!api?.onSounds || !api.readSounds) {
        publish({ status: 'unsupported', playing: [] });
        return undefined;
      }
      let active = true;
      let latest = -1;
      const accept = (state) => {
        if (!active || !Array.isArray(state?.playing) || (state.revision < latest && latest - state.revision < 1_000)) return;
        latest = state.revision;
        publish({ status: 'ready', ...state });
      };
      const stop = api.onSounds(accept);
      publish({ status: 'loading', playing: [] });
      void api.readSounds().then((result) => {
        if (result?.ok) accept(result.state);
        else if (active && latest < 0) publish({ status: 'unavailable', playing: [] });
      }).catch(() => { if (active && latest < 0) publish({ status: 'unavailable', playing: [] }); });
      return () => {
        active = false;
        stop();
      };
    });

    const selected = new Map();
    let watchScheduled = false;
    let watchRevision = 0;
    function syncSensorWatch() {
      if (watchScheduled || !api?.watchSensorWidgets) return;
      watchScheduled = true;
      queueMicrotask(async () => {
        watchScheduled = false;
        const revision = ++watchRevision;
        try {
          const readings = await api.watchSensorWidgets([...selected.keys()]);
          if (revision === watchRevision) {
            for (const [id, callbacks] of selected) {
              for (const callback of callbacks) callback(readings?.[id]);
            }
          }
        } catch { /* A deck transition can suspend the read. The next sensor sample will refresh it. */ }
      });
    }
    const sensorWidgets = {
      subscribe(id, update) {
        const callbacks = selected.get(id) ?? new Set();
        selected.set(id, callbacks);
        callbacks.add(update);
        const stop = telemetry.subscribe((sample) => update(sample.sensorWidgets?.[id]));
        if (callbacks.size === 1) syncSensorWatch();
        return () => {
          stop();
          callbacks.delete(update);
          if (callbacks.size) return;
          selected.delete(id);
          syncSensorWatch();
        };
      },
    };
    const backlight = window.LastraBacklightWidgets?.createBacklightWidgets(api);
    if (backlight) {
      document.addEventListener('lastra:session-blocked', ({ detail }) => backlight.setBlocked(detail));
    }
    return { media, spotify, netflix, telemetry, audio, obs, timers, sounds, sensorWidgets, backlight };
  }

  if (typeof module === 'object') module.exports = { sharedSubscription, createMediaProvider };
  else window.LastraWidgetProviders = createWidgetProviders(window.lastra ?? window.LastraDeckPreview);
}
