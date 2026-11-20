'use strict';

{
  const READOUTS = Object.freeze({
    auto: 'Automatic', none: 'Off', speakers: 'Speaker level', microphones: 'Microphone group level',
    'spotify-remaining': 'Spotify time remaining', cpu: 'CPU load', gpu: 'GPU load', ram: 'RAM usage',
    cpuTemp: 'CPU temperature', gpuTemp: 'GPU temperature',
  });
  // A timer or sound key shows its own time. That reading needs the key's timer or clip, so it is not offered for other keys.
  const DEFAULT_READOUTS = Object.freeze({ output: 'speakers', microphone: 'microphones', spotify: 'spotify-remaining', timer: 'timer', sound: 'sound' });
  const SENSOR_READOUTS = Object.freeze({ cpu: 'CPU', gpu: 'GPU', ram: 'RAM', cpuTemp: 'CPU', gpuTemp: 'GPU' });

  function resolveKeyReadout(setting, source) {
    return setting && setting !== 'auto' ? (setting === 'none' ? null : setting) : DEFAULT_READOUTS[source] ?? null;
  }

  const api = { READOUTS, DEFAULT_READOUTS, SENSOR_READOUTS, resolveKeyReadout };
  if (typeof module === 'object') module.exports = api;
  else window.LastraKeyReadouts = api;
}
