'use strict';

function mediaPosition(state, now) {
  if (!Number.isFinite(state.positionMs) || !Number.isFinite(state.durationMs)) return null;
  const elapsed = state.playback === 'playing' && state.positionUpdatedAt > 0
    ? Math.max(0, now - state.positionUpdatedAt) * state.rate : 0;
  return Math.max(0, Math.min(state.durationMs, state.positionMs + elapsed));
}

function mediaTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  const minutes = Math.floor(totalSeconds / 60);
  return minutes >= 60
    ? Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0') + ':' + seconds
    : minutes + ':' + seconds;
}

function mediaSource(value) {
  const app = value.replace(/^.*[\\/]/, '').replace(/\.exe$/i, '');
  const known = [
    [/spotify/i, 'Spotify'], [/^chrome$/i, 'Google Chrome'], [/^msedge$/i, 'Microsoft Edge'],
    [/^firefox$/i, 'Firefox'], [/^brave$/i, 'Brave'], [/^vlc$/i, 'VLC'],
    [/zunemusic|microsoft\.windowsmediaplayer/i, 'Windows Media Player'],
  ];
  return known.find(([pattern]) => pattern.test(app))?.[1] ?? (app.split('_')[0] || 'Windows media player');
}

if (typeof module !== 'undefined' && module.exports) module.exports = { mediaPosition, mediaTime, mediaSource };
if (typeof window !== 'undefined') window.LastraMediaHelpers = { position: mediaPosition, time: mediaTime, source: mediaSource };
