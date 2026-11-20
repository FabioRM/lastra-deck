'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { setImmediate: tick, setTimeout: delay } = require('node:timers/promises');
const { ActionHistory } = require('../src/main/action-history');
const { AgentMediaReader, mediaParams } = require('../src/main/mcp-media');
const { AgentWindowsMediaActions, windowsActionParams } = require('../src/main/mcp-windows-media-actions');

const sessionId = 'a'.repeat(32);
const pickerId = 'b'.repeat(32);
const trackId = 'c'.repeat(32);
const client = { id: 'authorized1234' };
const other = { id: 'other1234' };

async function fixture({ skipEffect } = {}) {
  const raw = { status: 'ready', sessionId, trackId, source: 'C:\\fixture\\Player.exe', title: 'Test media', playback: 'playing',
    canPause: true, canPlay: true, canNext: true, canPrevious: true, positionMs: 100, seekMinMs: 0, seekMaxMs: 60_000 };
  const snapshots = [];
  const sends = [];
  const reviews = [];
  const history = new ActionHistory();
  let writable = true;
  let allowed = true;
  let acknowledgeOnly = false;
  let held = 0;
  const player = {
    holdForReview() { held++; return () => { held--; }; },
    async reviewSnapshot(selectionId) { snapshots.push(selectionId); return { ...raw }; },
    async change(command) {
      sends.push(command);
      if (!acknowledgeOnly) {
        if (command.command === 'seek') raw.positionMs = command.positionMs;
        else if (['next', 'previous'].includes(command.command)) {
          if (skipEffect) skipEffect(raw);
          else raw.trackId = 'd'.repeat(32);
        }
        else raw.playback = command.command === 'play' ? 'playing' : 'paused';
      }
      return { status: 'ok' };
    },
  };
  const media = new AgentMediaReader({ windows: async () => ({ ...raw, sessions: [{ id: pickerId, source: 'windows' }] }) });
  const read = await media.windowsState(mediaParams({ section: 'active' }), client.id);
  const controller = new AgentWindowsMediaActions({ player, media, canReview: () => writable,
    history, confirmation: { intervalMs: 4, timeoutMs: 35 },
    approve: (proposal) => new Promise((resolve) => { reviews.push({ proposal, resolve }); }) });
  const call = (input, owner = client) => controller.change(owner, windowsActionParams(input), () => allowed);
  const request = (changes = {}, owner = client) => call({ command: 'request', action: 'pause', before: 'playing',
    session: read.active.id, idempotencyKey: 'pause-review', ...changes }, owner);
  const status = ({ request }) => call({ command: 'status', request }).then((result) => result.status);
  return { raw, session: read.active.id, media, call, request, status, controller, reviews, sends, history, snapshots, held: () => held,
    setWritable(value) { writable = value; controller.checkPending(); }, revoke() { allowed = false; controller.checkPending(); },
    sendOnly() { acknowledgeOnly = true; } };
}

test('Windows playback accepts its own current alias and confirms an exact approved pause once', async () => {
  const f = await fixture();
  assert.deepEqual(f.media.resolveWindows(client.id, f.session), { id: sessionId });
  assert.deepEqual(f.media.resolveWindows(client.id, f.media.alias(client.id, 'media-session', pickerId)), { id: pickerId, selectionId: pickerId });
  assert.equal(f.media.resolveWindows(other.id, f.session), undefined);
  await assert.rejects(f.request({}, other), /media session.*changed/i);
  const current = await f.request();
  assert.deepEqual(await f.request(), current);
  assert.equal(f.held(), 1);
  assert.deepEqual(f.sends, []);
  assert.equal(f.reviews[0].proposal.target, 'Player.exe');
  assert.equal(f.reviews[0].proposal.details[0].value.item, 'Test media');
  f.reviews[0].resolve(true);
  await tick();
  assert.equal(await f.status(current), 'confirmed');
  assert.equal(f.held(), 0);
  assert.deepEqual(f.snapshots, [undefined, undefined, undefined]);
  assert.deepEqual(f.sends, [{ command: 'pause', before: 'playing', sessionId, expectedTrackId: trackId }]);
  assert.deepEqual(Object.keys(await f.request()).sort(), ['request', 'status', 'updatedAt']);
  const audits = f.history.snapshot().entries;
  assert.equal(audits.length, 1);
  assert.equal(audits[0].context, client.id.slice(0, 8) + ' · ' + f.session);
  assert.equal(audits[0].outcome, 'succeeded');
  assert.doesNotMatch(JSON.stringify(audits), /Player\.exe|Test media/);
});

test('a changed media item, hidden deck, or revoked grant cannot dispatch the reviewed command', async () => {
  for (const reason of ['track', 'visibility', 'grant']) {
    const f = await fixture();
    const current = await f.request();
    if (reason === 'track') f.raw.trackId = 'd'.repeat(32);
    if (reason === 'visibility') f.setWritable(false);
    if (reason === 'grant') f.revoke();
    f.reviews[0].resolve(true);
    await tick();
    if (reason === 'grant') await assert.rejects(f.status(current), /grant changed/i);
    else assert.equal(await f.status(current), reason === 'track' ? 'stale' : 'cancelled');
    assert.deepEqual(f.sends, []);
    assert.equal(f.held(), 0);
    assert.deepEqual(f.history.snapshot().entries.map(({ outcome }) => outcome),
      [reason === 'track' ? 'failed' : 'cancelled']);
  }
});

test('seek checks the provider range, track identity and readback instead of trusting a write receipt', async () => {
  const f = await fixture();
  await assert.rejects(f.request({ action: 'seek', positionMs: 70_000 }), /media session.*changed/i);
  assert.equal(f.held(), 0);
  const first = await f.request({ action: 'seek', positionMs: 5000, idempotencyKey: 'verified-seek' });
  f.reviews[0].resolve(true);
  await tick();
  assert.equal(await f.status(first), 'confirmed');
  assert.deepEqual(f.sends[0], { command: 'seek', before: 'playing', sessionId, trackId, positionMs: 5000 });
  f.sendOnly();
  const second = await f.request({ action: 'seek', positionMs: 20_000, idempotencyKey: 'unverified-seek' });
  f.reviews[1].resolve(true);
  for (let count = 0; count < 20 && await f.status(second) !== 'unconfirmed'; count++) await delay(5);
  assert.equal(await f.status(second), 'unconfirmed');
  assert.equal(f.sends.length, 2);
});

test('next and previous use the reviewed track and verify a different item on that player', async () => {
  for (const action of ['next', 'previous']) {
    const f = await fixture();
    const entry = await f.request({ action });
    assert.match(f.reviews[0].proposal.operation, new RegExp(`Skip to ${action}`));
    f.reviews[0].resolve(true);
    await tick();
    assert.equal(await f.status(entry), 'confirmed');
    assert.deepEqual(f.sends, [{ command: action, before: 'playing', sessionId, expectedTrackId: trackId }]);
  }
});

test('skip blocks a lost capability and refuses to confirm a different player or an unchanged item', async () => {
  const disabled = await fixture();
  disabled.raw.canNext = false;
  await assert.rejects(disabled.request({ action: 'next' }), /media session.*changed/i);
  assert.deepEqual(disabled.sends, []);
  for (const skipEffect of [(raw) => { raw.sessionId = pickerId; raw.trackId = 'e'.repeat(32); }, () => {}]) {
    const f = await fixture({ skipEffect });
    const entry = await f.request({ action: 'previous' });
    f.reviews[0].resolve(true);
    for (let count = 0; count < 20 && await f.status(entry) !== 'unconfirmed'; count++) await delay(5);
    assert.equal(await f.status(entry), 'unconfirmed');
    assert.equal(f.sends.length, 1);
  }
});
