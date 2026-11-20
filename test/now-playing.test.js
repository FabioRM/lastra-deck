'use strict';

const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const { PassThrough } = require('node:stream');
const test = require('node:test');
const { WindowsMedia, playbackRequest } = require('../src/main/windows-media');
const { mediaPosition, mediaSource, mediaTime } = require('../src/renderer/now-playing');

const sessionId = 'a'.repeat(32);
const trackId = 'b'.repeat(32);
const otherSession = 'c'.repeat(32);

function helper(handle) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stdin.on('data', (line) => {
    const { id, ...request } = JSON.parse(line);
    const reply = (result) => child.stdout.write(JSON.stringify({ id, result }) + '\n');
    const result = handle(request, reply);
    if (result) reply(result);
  });
  child.kill = () => child.emit('exit');
  return child;
}

test('playback requests are limited to supported commands and bound to the displayed session', () => {
  assert.equal(playbackRequest({ command: 'next' }), null);
  assert.equal(playbackRequest({ command: 'unknown', sessionId }), null);
  assert.equal(playbackRequest({ command: 'seek', sessionId, positionMs: 10 }), null);
  assert.equal(playbackRequest({ command: 'seek', sessionId, trackId, positionMs: -1 }), null);
  assert.deepEqual(playbackRequest({ command: 'pause', sessionId, positionMs: 20 }), { command: 'pause', sessionId });
  assert.deepEqual(playbackRequest({ command: 'seek', sessionId, trackId, positionMs: 200 }),
    { command: 'seek', sessionId, trackId, positionMs: 200 });
  assert.deepEqual(playbackRequest({ command: 'pause', sessionId, selectionId: sessionId }),
    { command: 'pause', sessionId, selectionId: sessionId });
  assert.equal(playbackRequest({ command: 'pause', sessionId, selectionId: otherSession }), null);
  assert.equal(playbackRequest({ command: 'pause', sessionId, selectionId: null }), null);
  assert.equal(playbackRequest({ command: 'pause', sessionId, before: 'unknown', expectedTrackId: trackId }), null);
  assert.deepEqual(playbackRequest({ command: 'pause', sessionId, before: 'playing', expectedTrackId: trackId }),
    { command: 'pause', sessionId, before: 'playing', expectedTrackId: trackId });
});

test('a Windows media review preserves an observed helper session through idle and releases it afterward', async (t) => {
  const child = helper((request) => request.command === 'snapshot' ? { status: 'ready', sessionId, trackId, detail: request.detail } : { status: 'ok' });
  const media = new WindowsMedia('', { platform: 'win32', idle: 15, launch: () => child });
  t.after(() => media.stop());
  assert.equal(await media.reviewSnapshot(sessionId).then(({ status }) => status), 'missing');
  await media.snapshotForAgent();
  const release = media.holdForReview();
  assert.ok(release);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(media.child, child);
  assert.equal((await media.reviewSnapshot(sessionId)).detail, 'review');
  const stopped = once(child, 'exit');
  release();
  release();
  await stopped;
  assert.equal(media.child, null);
});

test('Windows media rechecks the action grant before writing to the helper', async (t) => {
  const commands = [];
  const child = helper((request) => {
    commands.push(request.command);
    return { status: 'ready', sessionId, trackId };
  });
  const media = new WindowsMedia('', { platform: 'win32', launch: () => child });
  t.after(() => media.stop());
  await media.snapshotForAgent();
  let allowed = true;
  const pending = media.change({ command: 'pause', sessionId, before: 'playing', expectedTrackId: trackId }, () => allowed);
  allowed = false;
  assert.deepEqual(await pending, { status: 'cancelled' });
  assert.deepEqual(commands, ['snapshot']);
});

test('Spotify toggle only reaches its identified player and rechecks the target after reading media state', async () => {
  const requests = [];
  let playback = 'playing';
  const child = helper((request) => {
    requests.push(request);
    if (request.command === 'snapshot') return { status: 'ready', sessionId, trackId, playback, canPause: true };
    playback = 'paused';
    return { status: 'ok' };
  });
  const media = new WindowsMedia('', { platform: 'win32', launch: () => child });
  try {
    await assert.rejects(media.toggle('spotify', () => { throw new Error('Window changed'); }), /Window changed/);
    assert.equal(requests.length, 1);
    assert.equal(await media.toggle('spotify'), null);
    assert.deepEqual(requests.slice(-2), [
      { command: 'pause', route: 'spotify', sessionId },
      { command: 'snapshot', artworkId: trackId, selectionId: sessionId },
    ]);
  } finally {
    media.stop();
  }
});

test('a playback acknowledgement does not confirm an unchanged or replaced Spotify session', async (t) => {
  let controls = 0;
  let replaced = false;
  const child = helper((request) => {
    if (request.command === 'snapshot') {
      return request.selectionId && replaced ? { status: 'missing' }
        : { status: 'ready', sessionId, playback: 'playing', canPause: true };
    }
    controls++;
    return { status: 'ok' };
  });
  const media = new WindowsMedia('', { platform: 'win32', launch: () => child,
    confirmation: { timeoutMs: 50, intervalMs: 5 } });
  t.after(() => media.stop());
  await assert.rejects(media.toggle('spotify'), /did not confirm/);
  assert.equal(controls, 1);
  replaced = true;
  await assert.rejects(media.toggle('spotify'), /player changed/);
  assert.equal(controls, 2);
});

test('selected-player snapshots and commands share the default provider without redirecting', async (t) => {
  const sessions = [
    { id: sessionId, source: 'browser.exe', isDefault: true },
    { id: otherSession, source: 'browser.exe', isDefault: false },
  ];
  const requests = [];
  const child = helper((request) => {
    requests.push(request);
    const selected = request.selectionId ?? sessionId;
    const exists = sessions.some(({ id }) => id === selected);
    if (request.command === 'snapshot') {
      return exists ? { status: 'ready', sessionId: selected, sessions } : { status: 'missing', sessions };
    }
    return exists && request.sessionId === selected ? { status: 'ok' } : { status: 'changed' };
  });
  const media = new WindowsMedia('', { platform: 'win32', launch: () => child });
  t.after(() => media.stop());

  const [primary, secondary] = await Promise.all([media.snapshot(), media.snapshot(trackId, otherSession)]);
  assert.equal(primary.sessionId, sessionId);
  assert.equal(secondary.sessionId, otherSession);
  assert.equal(secondary.sessions.length, 2);
  assert.equal((await media.change({ command: 'pause', sessionId: otherSession, selectionId: otherSession })).status, 'ok');
  sessions.pop();
  assert.equal((await media.snapshot(undefined, otherSession)).status, 'missing');
  assert.equal((await media.change({ command: 'pause', sessionId: otherSession, selectionId: otherSession })).status, 'changed');
  assert.equal((await media.snapshot()).sessionId, sessionId);
  assert.equal((await media.snapshot(undefined, '')).status, 'missing');
  assert.deepEqual(requests.slice(0, 3), [
    { command: 'snapshot', artworkId: null },
    { command: 'snapshot', artworkId: trackId, selectionId: otherSession },
    { command: 'pause', sessionId: otherSession, selectionId: otherSession },
  ]);
});

test('two pending media reads leave room for one playback command', async (t) => {
  const snapshots = [];
  const controls = [];
  const child = helper((request, reply) => {
    if (request.command === 'snapshot') snapshots.push(reply);
    else controls.push({ request, reply });
  });
  const media = new WindowsMedia('', { platform: 'win32', launch: () => child });
  t.after(() => media.stop());

  const primary = media.snapshot();
  const explicit = media.snapshot(undefined, otherSession);
  assert.deepEqual(await media.snapshot(), { status: 'busy' });

  const command = { command: 'pause', sessionId: otherSession, selectionId: otherSession };
  const pause = media.change(command);
  assert.deepEqual(await media.change(command), { status: 'busy' });
  assert.deepEqual(await media.snapshot(), { status: 'busy' });
  assert.equal(snapshots.length, 2);
  assert.deepEqual(controls.map(({ request }) => request), [command]);

  snapshots[0]({ status: 'ready', sessionId });
  snapshots[1]({ status: 'ready', sessionId: otherSession });
  controls[0].reply({ status: 'ok' });
  assert.deepEqual(await Promise.all([primary, explicit, pause]), [
    { status: 'ready', sessionId },
    { status: 'ready', sessionId: otherSession },
    { status: 'ok' },
  ]);
});

test('Spotify snapshots and commands carry a dedicated route that cannot combine with a player selection', async (t) => {
  const requests = [];
  const child = helper((request) => {
    requests.push(request);
    if (request.command === 'snapshot') return { status: 'ready', sessionId: request.route ? otherSession : sessionId };
    return { status: request.route === 'spotify' && request.sessionId === otherSession ? 'ok' : 'changed' };
  });
  const media = new WindowsMedia('', { platform: 'win32', launch: () => child });
  t.after(() => media.stop());

  assert.equal((await media.snapshot()).sessionId, sessionId);
  assert.equal((await media.snapshot(trackId, undefined, 'spotify')).sessionId, otherSession);
  assert.equal((await media.snapshot(undefined, sessionId, 'spotify')).status, 'missing');
  assert.equal((await media.snapshot(undefined, undefined, 'browser')).status, 'missing');
  assert.equal((await media.change({ command: 'pause', sessionId, selectionId: sessionId, route: 'spotify' })).status, 'disabled');
  assert.equal((await media.change({ command: 'pause', sessionId, route: 'spotify' })).status, 'changed');
  assert.equal((await media.change({ command: 'next', sessionId: otherSession, route: 'spotify' })).status, 'ok');
  assert.deepEqual(requests, [
    { command: 'snapshot', artworkId: null },
    { command: 'snapshot', artworkId: trackId, route: 'spotify' },
    { command: 'pause', sessionId, route: 'spotify' },
    { command: 'next', sessionId: otherSession, route: 'spotify' },
  ]);
});

test('media reads start the helper lazily, commands reuse it, and idle closes it', async (t) => {
  const calls = [];
  const child = helper((request) => {
    calls.push(request);
    return request.command === 'snapshot'
      ? { status: 'ready', title: 'Example Track', sessionId, trackId }
      : { status: 'ok' };
  });
  let launches = 0;
  const media = new WindowsMedia('', { platform: 'win32', launch: () => { launches++; return child; }, idle: 15 });
  t.after(() => media.stop());

  assert.equal(launches, 0);
  assert.equal((await media.change({ command: 'pause', sessionId })).status, 'changed');
  assert.deepEqual(await media.snapshot(), { status: 'ready', title: 'Example Track', sessionId, trackId });
  await media.snapshot(trackId);
  assert.equal((await media.change({ command: 'pause', sessionId })).status, 'ok');
  assert.equal(launches, 1);
  assert.deepEqual(calls, [
    { command: 'snapshot', artworkId: null },
    { command: 'snapshot', artworkId: trackId },
    { command: 'pause', sessionId },
  ]);
  await once(child, 'exit');
  assert.equal((await media.change({ command: 'pause', sessionId })).status, 'changed');
});

test('unsupported systems avoid starting the helper and a hung worker times out', async (t) => {
  const unsupported = new WindowsMedia('', { platform: 'linux', launch: () => assert.fail('Unexpected launch') });
  assert.equal((await unsupported.snapshot()).status, 'unsupported');
  const hung = helper(() => undefined);
  const media = new WindowsMedia('', { platform: 'win32', launch: () => hung, timeout: 10 });
  t.after(() => media.stop());
  const exited = once(hung, 'exit');
  assert.equal((await media.snapshot()).status, 'unavailable');
  await exited;
  assert.equal((await media.snapshot()).status, 'unavailable');
});

test('timeline follows the published clock within the duration and keeps paused positions fixed', () => {
  const state = { positionMs: 50_000, durationMs: 65_000, positionUpdatedAt: 100, rate: 2, playback: 'playing' };
  assert.equal(mediaPosition(state, 1_100), 52_000);
  assert.equal(mediaPosition(state, 70_000), 65_000);
  assert.equal(mediaPosition({ ...state, playback: 'paused' }, 1_100), 50_000);
  assert.equal(mediaPosition({ ...state, durationMs: null }, 1_100), null);
  assert.equal(mediaTime(3_661_850), '1:01:01');
  assert.equal(mediaTime(8_300), '0:08');
  assert.equal(mediaSource('C:\\Apps\\chrome.exe'), 'Google Chrome');
});
