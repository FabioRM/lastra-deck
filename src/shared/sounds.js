'use strict';

// Rules for soundboard clips, shared by the profile check, the action runner, the deck and the editor.

{
  const SOUND_ID = /^[a-z0-9_-]{1,40}$/i;
  const SOUND_TYPES = Object.freeze({
    wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac',
    m4a: 'audio/mp4', aac: 'audio/aac', weba: 'audio/webm', webm: 'audio/webm',
  });
  const SOUND_COMMANDS = { play: 'Play a clip', 'stop-all': 'Stop every clip' };
  const SOUND_AGAIN = { restart: 'Restart the clip', overlap: 'Play another copy over it', stop: 'Stop the clip' };
  const SOUND_VOLUME = { min: 0, max: 100, value: 100 };
  const MAX_VOICES = 8;
  const MAX_CLIP_BYTES = 32 * 1024 * 1024;
  const PLAY_FIELDS = ['id', 'file', 'volume', 'output', 'again'];
  // A drive path, or one that starts with a Windows folder variable such as %USERPROFILE%.
  const LOCAL_FILE = /^(?:[a-z]:|%[^%\\/]+%)[\\/]/i;

  function soundType(file) {
    const extension = /\.([a-z0-9]+)$/i.exec(file)?.[1].toLowerCase();
    return extension && Object.hasOwn(SOUND_TYPES, extension) ? SOUND_TYPES[extension] : null;
  }

  function soundName(file) {
    return file.replace(/^.*[\\/]/, '').replace(/\.[a-z0-9]+$/i, '');
  }

  /** Validate a key's sound action. */
  function soundFields(action) {
    const command = action.command ?? 'play';
    if (!Object.hasOwn(SOUND_COMMANDS, command)) throw new Error('Choose a supported sound command');
    if (command === 'stop-all') {
      if (PLAY_FIELDS.some((field) => action[field] !== undefined)) throw new Error('Stop every clip takes no other setting');
      return { command };
    }
    const { id, output } = action;
    const file = typeof action.file === 'string' ? action.file.trim() : '';
    const volume = action.volume ?? SOUND_VOLUME.value;
    const again = action.again ?? 'restart';
    if (typeof id !== 'string' || !SOUND_ID.test(id)) throw new Error('A sound needs a valid ID');
    if (!file || file.length > 260 || /\p{Cc}/u.test(file)) throw new Error('Choose an audio file');
    if (!LOCAL_FILE.test(file)) throw new Error('Use the full path of an audio file on this PC');
    if (!soundType(file)) throw new Error(`Use an audio file of type ${Object.keys(SOUND_TYPES).join(', ')}`);
    if (!Number.isInteger(volume) || volume < SOUND_VOLUME.min || volume > SOUND_VOLUME.max) throw new Error('Set the clip volume from 0 to 100');
    if (!Object.hasOwn(SOUND_AGAIN, again)) throw new Error('Choose what a second press does');
    if (output !== undefined && (typeof output !== 'string' || !/^\P{Cc}{1,200}$/u.test(output))) throw new Error('Choose a Windows output by its name');
    return { command, id, file, volume, again, ...(output === undefined ? {} : { output }) };
  }

  /** Whether the clip of a key is playing and how long it has left. `sounds` is the soundboard snapshot. */
  function soundReading(sounds, id, now) {
    const voices = Array.isArray(sounds?.playing) ? sounds.playing.filter((voice) => voice.id === id) : [];
    if (!voices.length) return { playing: false, remainingMs: null };
    const ends = voices.map(({ startedAt, durationMs }) => Number.isFinite(durationMs) ? startedAt + durationMs - now : NaN);
    return { playing: true, remainingMs: ends.some(Number.isNaN) ? null : Math.max(0, ...ends) };
  }

  const api = { SOUND_ID, SOUND_TYPES, SOUND_COMMANDS, SOUND_AGAIN, SOUND_VOLUME, MAX_VOICES, MAX_CLIP_BYTES,
    soundType, soundName, soundFields, soundReading };
  if (typeof module === 'object') module.exports = api;
  else window.LastraSounds = api;
}
