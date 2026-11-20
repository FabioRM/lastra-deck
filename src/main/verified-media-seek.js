// @ts-check
'use strict';

const { confirmState } = require('./confirm-state');
const { playbackRequest } = require('./windows-media');

const TOLERANCE_MS = 2_000;
const MOVED = 'The selected media session or track changed.';
const fail = (message) => ({ ok: false, message });

function owns(reading, request) {
  return reading?.sessionId === request.sessionId && reading.trackId === request.trackId;
}

function seekable(reading, positionMs) {
  const { seekMinMs, seekMaxMs, positionMs: observed } = reading;
  return Number.isSafeInteger(seekMinMs) && Number.isSafeInteger(seekMaxMs) && seekMaxMs > seekMinMs
    && positionMs >= seekMinMs && positionMs <= seekMaxMs && Number.isFinite(observed);
}

async function seekVerified(player, target, guard = () => undefined, confirmation) {
  if (!target || typeof target !== 'object' || Array.isArray(target)
      || Object.keys(target).some((key) => !['sessionId', 'trackId', 'positionMs'].includes(key))) {
    return fail('Choose a position in the current media track.');
  }
  const command = playbackRequest({ command: 'seek', ...target });
  if (!command) return fail('Choose a position in the current media track.');
  const { positionMs } = command;
  const check = () => {
    const blocked = guard();
    if (blocked) throw new Error(blocked);
  };
  try {
    check();
    const before = await player.reviewSnapshot();
    check();
    if (before?.status !== 'ready') return fail('The media player is unavailable.');
    if (!owns(before, command)) return fail(MOVED);
    if (!seekable(before, positionMs)) return fail('The player does not expose that seek position.');
    if (Math.round(before.positionMs) === positionMs) return { ok: true, reading: before };
    const reply = await player.change(command);
    if (reply?.status === 'changed') return fail(MOVED);
    if (reply?.status !== 'ok') return fail('The player did not accept the seek.');

    let actual;
    await confirmState(async () => {
      check();
      const observed = await player.reviewSnapshot(command.sessionId);
      check();
      if (observed?.status === 'missing' || (observed?.status === 'ready' && !owns(observed, command))) throw new Error(MOVED);
      if (observed?.status !== 'ready' || !seekable(observed, positionMs)) return false;
      if (Math.abs(observed.positionMs - positionMs) > TOLERANCE_MS
          || (observed.positionMs === before.positionMs && observed.positionUpdatedAt === before.positionUpdatedAt)) return false;
      actual = observed;
      return true;
    }, 'The player did not confirm the new position.', confirmation);
    return { ok: true, reading: actual };
  } catch (error) { return fail(error.message); }
}

module.exports = { seekVerified };
