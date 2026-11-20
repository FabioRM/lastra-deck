'use strict';

{
  function panelFixtures() {
    const fixtureTime = new Date(2030, 3, 18, 17, 24).getTime();
    const audio = {
      version: 1, sampledAt: fixtureTime,
      output: { id: 'sample-output', level: 66, muted: false },
      microphone: { id: 'sample-microphone', name: 'Sample microphone', level: 85, muted: false },
      inputs: [{ id: 'sample-microphone', name: 'Sample microphone', level: 85, muted: false }],
    };
    const media = {
      status: 'ready', sessionId: 'fixture-player', trackId: 'fixture-track', title: 'Sample track',
      artist: 'Sample artist', album: 'Sample album', source: 'Sample player',
      playback: 'paused', durationMs: 192_000, positionMs: 53_000, positionUpdatedAt: fixtureTime,
      seekMinMs: 0, seekMaxMs: 192_000, canPlay: true, canPrevious: true, canNext: true,
    };
    const groups = {
      cpu: 'Processor', gpu: 'Graphics', memory: 'Memory', display: 'Displays',
      frames: 'App performance', storage: 'Storage', cooling: 'Cooling',
    };
    const reading = (group, id, name, value, unit, device, status = 'live') => ({
      group, id, name, value, unit, device, source: 'Sample data', status,
      at: fixtureTime - (status === 'stale' ? 12_000 : 0),
      maxAge: 8_000,
      points: Array.from({ length: 13 }, (_, index) => [fixtureTime - 60_000 + index * 5_000,
        value * [0.78, .92, .86, .82, .77, .91, .96, 1.07, .97, .88, .91, .95, 1][index]]),
    });
    const overview = [
      reading('cpu', 'cpu', 'CPU load', 34, '%', ''),
      reading('gpu', 'gpu', 'GPU load', 68, '%', 'Sample GPU'),
      reading('memory', 'ram', 'RAM use', 71, '%', ''),
      reading('display', 'refresh', 'Refresh rate', 60, 'Hz', 'Sample display'),
      reading('frames', 'fps', 'Present rate', 118, 'FPS', 'Sample application'),
      reading('storage', 'disk', 'Free space', 264, 'GiB', 'Sample SSD'),
      reading('cooling', 'cpuTemp', 'CPU temperature', 61, '°C', 'Sample processor', 'stale'),
    ];
    const readonly = async () => ({ ok: false, message: 'Fixture preview is read-only.' });
    return {
      fixtureTime, audio, media,
      panels: Object.freeze({
        fixtureTime,
        onAudio(callback) { callback(audio); return () => {}; },
        onDashboardCalendar(callback) { callback('Sample calendar'); return () => {}; },
        readAudioPeaks: async () => ({ outputId: audio.output.id, output: .46, microphoneId: audio.microphone.id, microphone: .28 }),
        changeAudio: readonly, changeNowPlaying: readonly, openDashboardCalendar: readonly,
        readStats: async () => ({ groups, overview, readings: overview }),
        stopStats: async () => {},
        onStatsIncidents() { return () => {}; },
        statsIncidents: async ({ type } = {}) => type === 'read'
          ? { ok: true, timeline: { events: [], dashboard: null, warning: null } } : readonly(),
        statsSelection: async ({ type } = {}) => type === 'read'
          ? { ok: true, selected: null, limit: 7 } : readonly(),
        statsProcesses: async () => ({ status: 'unavailable', rows: [] }),
      }),
    };
  }

  window.LastraPanelFixtures = panelFixtures;
}
