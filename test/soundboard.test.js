'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Soundboard } = require('../src/main/soundboard');
const { createActionRunner } = require('../src/main/actions');
const { validateProfile } = require('../src/main/profile');
const { simulateGesture } = require('../src/main/mcp-simulate');
const { deckRequestAllowed } = require('../src/main/deck-view-only');
const { toView } = require('../src/shared/deck-view');
const { soundKeyState, keyLiveAppearance } = require('../src/renderer/key-live-state');
const { MAX_VOICES, MAX_CLIP_BYTES, soundFields, soundReading, soundType } = require('../src/shared/sounds');

const applause = { type: 'sound', id: 'applause', file: 'C:\\Sounds\\applause.mp3' };
const clip = (extra = {}) => ({ id: 'applause', file: 'C:\\Sounds\\applause.mp3', volume: 100, again: 'restart', ...extra });

// A stand-in for the hidden player page: it answers like the real one and records what it was asked.
function board({ answer = 'started', durationMs = 2_000, files, startReady = true } = {}) {
  const posts = [];
  const changes = [];
  const clock = { now: 50_000 };
  let events;
  let closed;
  const setup = { answer, durationMs };
  const soundboard = new Soundboard({
    createHost(onEvent, onClosed) {
      events = onEvent;
      closed = onClosed;
      if (startReady) queueMicrotask(() => onEvent({ type: 'ready' }));
      return {
        post(message) {
          posts.push(message);
          if (message.type === 'outputs') queueMicrotask(() => onEvent({ type: 'outputs', ticket: message.ticket, labels: ['Speakers', 'Cable Input', 'Speakers', 7] }));
          if (message.type !== 'play' || setup.answer === 'silent') return;
          queueMicrotask(() => onEvent(setup.answer === 'started' ? { type: 'started', ticket: message.ticket, durationMs: setup.durationMs }
            : { type: 'failed', ticket: message.ticket, message: 'This file is not a playable audio clip.' }));
        },
        close() { closed(); },
      };
    },
    files: files ?? { stat: async () => ({ isFile: () => true, size: 4_096 }), readFile: async () => new Uint8Array([1, 2, 3]) },
    expandPath: (file) => file.replace('%USERPROFILE%', 'C:\\Users\\me'),
    now: () => clock.now,
    onChange: (state) => changes.push(state),
    replyTimeoutMs: 30,
  });
  return { soundboard, posts, changes, clock, setup, send: (event) => events(event), close: () => closed() };
}

test('a sound action needs an ID, a local audio file and settings in range', () => {
  assert.deepEqual(soundFields(applause), { command: 'play', ...clip() });
  assert.deepEqual(soundFields({ ...applause, file: ' %USERPROFILE%\\Music\\hit.WAV ', volume: 40, again: 'overlap', output: 'Cable Input' }),
    { command: 'play', id: 'applause', file: '%USERPROFILE%\\Music\\hit.WAV', volume: 40, again: 'overlap', output: 'Cable Input' });
  assert.deepEqual(soundFields({ type: 'sound', command: 'stop-all' }), { command: 'stop-all' });
  assert.throws(() => soundFields({ ...applause, command: 'stop-all' }), /takes no other setting/);
  assert.throws(() => soundFields({ ...applause, id: 'two words' }), /valid ID/);
  assert.throws(() => soundFields({ ...applause, file: '' }), /Choose an audio file/);
  assert.throws(() => soundFields({ ...applause, file: 'applause.mp3' }), /full path/);
  assert.throws(() => soundFields({ ...applause, file: '\\\\server\\share\\applause.mp3' }), /full path/);
  assert.throws(() => soundFields({ ...applause, file: 'https://example.com/a.mp3' }), /full path/);
  assert.throws(() => soundFields({ ...applause, file: 'C:\\Sounds\\run.exe' }), /audio file of type/);
  assert.throws(() => soundFields({ ...applause, volume: 101 }), /0 to 100/);
  assert.throws(() => soundFields({ ...applause, again: 'louder' }), /second press/);
  assert.throws(() => soundFields({ ...applause, output: '' }), /Windows output/);
  assert.throws(() => soundFields({ ...applause, command: 'record' }), /supported sound command/);
  assert.equal(soundType('C:\\a\\b.OGG'), 'audio/ogg');
  assert.equal(soundType('C:\\a\\b.txt'), null);

  const key = (action) => ({ grid: { cols: 1, rows: 1 }, keys: [{ id: 'sound', action }] });
  assert.doesNotThrow(() => validateProfile(key(applause)));
  assert.doesNotThrow(() => validateProfile(key({ type: 'sound', command: 'stop-all' })));
  assert.throws(() => validateProfile(key({ ...applause, file: 'C:\\Sounds\\run.bat' })), /key 1: Use an audio file/);
});

test('a clip plays at its volume on the chosen output and is tracked until it ends', async () => {
  const { soundboard, posts, changes, send } = board();
  assert.equal(await soundboard.play(clip({ volume: 40, output: 'Cable Input' })), 'Playing applause');
  const [play] = posts;
  assert.deepEqual([play.type, play.mime, play.volume, play.output, [...play.bytes]], ['play', 'audio/mpeg', 0.4, 'Cable Input', [1, 2, 3]]);
  assert.deepEqual(soundboard.snapshot().playing, [{ id: 'applause', startedAt: 50_000, durationMs: 2_000 }]);
  assert.deepEqual(soundReading(soundboard.snapshot(), 'applause', 50_500), { playing: true, remainingMs: 1_500 });
  send({ type: 'ended', ticket: play.ticket });
  assert.deepEqual(soundboard.snapshot().playing, []);
  assert.deepEqual(changes.map(({ playing }) => playing.length), [1, 0]);
  assert.deepEqual(soundReading(soundboard.snapshot(), 'applause', 50_500), { playing: false, remainingMs: null });
});

test('a second press restarts, overlaps or stops the clip', async () => {
  const restart = board();
  await restart.soundboard.play(clip());
  await restart.soundboard.play(clip());
  assert.deepEqual(restart.posts.map(({ type }) => type), ['play', 'stop', 'play']);
  assert.deepEqual(restart.posts[1].tickets, [restart.posts[0].ticket]);
  assert.equal(restart.soundboard.snapshot().playing.length, 1);

  const overlap = board();
  await overlap.soundboard.play(clip({ again: 'overlap' }));
  await overlap.soundboard.play(clip({ again: 'overlap' }));
  assert.deepEqual(overlap.posts.map(({ type }) => type), ['play', 'play']);
  assert.equal(overlap.soundboard.snapshot().playing.length, 2);

  const stop = board();
  await stop.soundboard.play(clip({ again: 'stop' }));
  assert.equal(await stop.soundboard.play(clip({ again: 'stop' })), 'Stopped applause');
  assert.deepEqual(stop.posts.map(({ type }) => type), ['play', 'stop']);
  assert.deepEqual(stop.soundboard.snapshot().playing, []);
});

test('stop every clip silences the player and reports the count', async () => {
  const { soundboard, posts } = board();
  assert.equal(soundboard.stopAll(), 'No clip is playing');
  await soundboard.play(clip({ again: 'overlap' }));
  await soundboard.play(clip({ id: 'drum', file: 'C:\\Sounds\\drum.wav' }));
  assert.equal(soundboard.stopAll(), 'Stopped 2 clips');
  assert.equal(posts.at(-1).type, 'stop-all');
  assert.deepEqual(soundboard.snapshot().playing, []);
  await soundboard.play(clip());
  assert.equal(soundboard.stopAll(), 'Stopped 1 clip');
});

test('at most eight clips play at once and a restart does not count twice', async () => {
  const { soundboard } = board();
  for (let index = 0; index < MAX_VOICES; index++) await soundboard.play(clip({ id: `clip-${index}` }));
  await assert.rejects(soundboard.play(clip({ id: 'one-more' })), /up to 8 clips/);
  await assert.rejects(soundboard.play(clip({ id: 'clip-0', again: 'overlap' })), /up to 8 clips/);
  assert.equal(await soundboard.play(clip({ id: 'clip-0' })), 'Playing applause');
  assert.equal(soundboard.snapshot().playing.length, MAX_VOICES);
});

test('only local audio files within the size limit are read', async () => {
  const read = [];
  const files = (stat) => ({ stat: async (file) => { read.push(file); return stat(file); }, readFile: async () => new Uint8Array(1) });
  const expanded = board({ files: files(() => ({ isFile: () => true, size: 10 })) });
  await expanded.soundboard.play(clip({ file: '%USERPROFILE%\\Music\\hit.wav' }));
  assert.deepEqual(read, ['C:\\Users\\me\\Music\\hit.wav']);
  await assert.rejects(expanded.soundboard.play(clip({ id: 'remote', file: '%REMOTE%\\hit.wav' })), /full path of an audio file/);

  const missing = board({ files: files(() => { throw Object.assign(new Error('nope'), { code: 'ENOENT' }); }) });
  await assert.rejects(missing.soundboard.play(clip()), /Audio file not found: applause/);
  const folder = board({ files: files(() => ({ isFile: () => false, size: 0 })) });
  await assert.rejects(folder.soundboard.play(clip()), /Audio file not found/);
  const large = board({ files: files(() => ({ isFile: () => true, size: MAX_CLIP_BYTES + 1 })) });
  await assert.rejects(large.soundboard.play(clip()), /up to 32 MB/);
  assert.deepEqual([missing.posts.length, folder.posts.length, large.posts.length], [0, 0, 0], 'nothing reaches the player');
  assert.equal(await missing.soundboard.play(clip({ id: 'other' })).catch(() => 'still rejects'), 'still rejects');
});

test('a clip the player cannot decode, a silent player and a closed player all fail cleanly', async () => {
  const broken = board({ answer: 'failed' });
  await assert.rejects(broken.soundboard.play(clip()), /not a playable audio clip/);
  assert.deepEqual(broken.soundboard.snapshot().playing, []);
  broken.setup.answer = 'started';
  assert.equal(await broken.soundboard.play(clip()), 'Playing applause', 'the same clip can be tried again');

  const silent = board({ answer: 'silent' });
  await assert.rejects(silent.soundboard.play(clip()), /did not answer/);

  const closing = board({ answer: 'silent' });
  const pending = closing.soundboard.play(clip());
  await new Promise((resolve) => setImmediate(resolve));
  closing.close();
  await assert.rejects(pending, /sound player closed/);

  const live = board();
  await live.soundboard.play(clip());
  live.close();
  assert.deepEqual(live.soundboard.snapshot().playing, [], 'a closed player plays nothing');
  assert.equal(await live.soundboard.play(clip()), 'Playing applause', 'the next press opens a new player');
});

test('commands wait until the player page is ready', async () => {
  const { soundboard, posts, send } = board({ startReady: false });
  const playing = soundboard.play(clip());
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(posts, []);
  send({ type: 'ready' });
  assert.equal(await playing, 'Playing applause');
  assert.equal(posts.length, 1);
});

test('the editor gets each output name once', async () => {
  const { soundboard } = board();
  assert.deepEqual(await soundboard.outputs(), ['Speakers', 'Cable Input']);
});

test('the runner hands a validated sound action to the soundboard', async () => {
  const calls = [];
  const runner = createActionRunner({ shell: {}, spawn() {}, input: {}, audio: {}, playSound: async (fields) => { calls.push(fields); return 'Playing applause'; } });
  assert.deepEqual(await runner.run(applause, undefined), { ok: true, message: 'Playing applause' });
  assert.deepEqual(calls, [{ command: 'play', ...clip() }]);
  await runner.run({ type: 'sound', command: 'stop-all' }, undefined);
  assert.deepEqual(calls[1], { command: 'stop-all' });
  assert.equal((await runner.run({ ...applause, file: 'relative.mp3' }, undefined)).ok, false);
  assert.equal(calls.length, 2);
  const missing = createActionRunner({ shell: {}, spawn() {}, input: {}, audio: {} });
  assert.match((await missing.run(applause, undefined)).message, /soundboard is unavailable/);
});

test('an offline simulation reports a sound effect without playing it', async () => {
  const result = await simulateGesture({ profile: { grid: { cols: 1, rows: 1 }, keys: [{ id: 'clip', action: applause }] }, key: 'clip', windowId: 1 });
  assert.equal(result.status, 'success');
  assert.deepEqual(result.effects, [{ atMs: 0, type: 'sound' }]);
  assert.equal(result.message, 'Would play applause.mp3');
});

test('a sound key reports its clip, and the stop key has no live state', () => {
  const profile = validateProfile({ grid: { cols: 2, rows: 1 }, keys: [
    { id: 'clip', label: 'Applause', action: applause },
    { id: 'stop', label: 'Stop sounds', action: { type: 'sound', command: 'stop-all' } },
  ] });
  const [first, second] = toView(profile).slots;
  assert.deepEqual([first.liveSource, first.readout, first.sound], ['sound', 'sound', { id: 'applause' }]);
  assert.deepEqual([second.liveSource, second.readout, second.sound], [undefined, undefined, undefined]);
});

test('sound keys read Ready and Playing with the time left', () => {
  const key = { id: 'applause' };
  const playing = { status: 'ready', playing: [{ id: 'applause', startedAt: 1_000, durationMs: 5_000 }, { id: 'applause', startedAt: 3_000, durationMs: 5_000 }] };
  assert.deepEqual(soundKeyState(undefined, key), { text: 'Checking…', pressed: null });
  assert.equal(soundKeyState({ status: 'unavailable', playing: [] }, key).text, 'Unavailable');
  assert.deepEqual(soundKeyState({ status: 'ready', playing: [] }, key, 0), { text: 'Ready', pressed: false, reading: '' });
  assert.deepEqual(soundKeyState(playing, key, 4_000), { text: 'Playing', pressed: true, reading: '0:04 left' }, 'the longest copy sets the time left');
  assert.deepEqual(soundKeyState(playing, { id: 'drum' }, 4_000), { text: 'Ready', pressed: false, reading: '' });
  const stream = { status: 'ready', playing: [{ id: 'applause', startedAt: 0, durationMs: null }] };
  assert.deepEqual(soundKeyState(stream, key, 4_000), { text: 'Playing', pressed: true, reading: '' });
  assert.equal(keyLiveAppearance('sound', 'Applause', soundKeyState(playing, key, 4_000)).tone, 'playing');
  assert.equal(keyLiveAppearance('sound', 'Applause', soundKeyState({ status: 'ready', playing: [] }, key, 0)).tone, 'neutral');
});

test('view-only mode can read the soundboard state', () => {
  assert.equal(deckRequestAllowed('sounds:read'), true);
});
