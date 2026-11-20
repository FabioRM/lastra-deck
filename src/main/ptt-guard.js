// @ts-check
'use strict';

const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { setTimeout: wait } = require('node:timers/promises');

const READY_TIMEOUT_MS = 3000;
const MAX_GUARD_MS = 35_000;
const RESTORE_CHECK_MS = 40;
const DRIVER_SETTLE_MS = 800;

function startMicGuard(inputId, onLost) {
  const child = spawn(process.execPath, [__filename, inputId], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['pipe', 'pipe', 'ignore'],
    detached: true, // A Windows child-process job would otherwise end the guard with its parent.
    windowsHide: true,
  });
  const replies = createInterface({ input: child.stdout });
  let armed = false;
  let disarmed = false;
  let failed = false;
  let rejectReady;
  let timer;

  const ready = new Promise((resolve, reject) => {
    rejectReady = reject;
    timer = setTimeout(() => {
      failed = true;
      reject(new Error('The microphone guard did not start'));
    }, READY_TIMEOUT_MS);
    replies.once('line', (line) => {
      if (line !== 'ready' || disarmed || failed || child.exitCode !== null || child.signalCode !== null) return;
      clearTimeout(timer);
      armed = true;
      resolve();
    });
  });

  child.stdin.on('error', () => {}); // The child handles an unexpected pipe close.
  child.once('error', (err) => {
    failed = true;
    clearTimeout(timer);
    rejectReady(err);
  });
  child.once('exit', () => {
    clearTimeout(timer);
    replies.close();
    if (disarmed) return;
    if (armed) onLost();
    else rejectReady(new Error('The microphone guard could not start'));
  });

  return {
    ready,
    get available() {
      return armed && !disarmed && !failed && child.exitCode === null && child.signalCode === null;
    },
    disarm() {
      if (disarmed) return;
      disarmed = true;
      clearTimeout(timer);
      rejectReady(new Error('Push-to-talk was released'));
      if (!child.stdin.destroyed) child.stdin.end('disarm\n');
    },
  };
}

async function guardMicrophone(audio, inputId, commands, acknowledge, { sleep = wait, settleMs = DRIVER_SETTLE_MS } = {}) {
  const lines = createInterface({ input: commands });
  let timer;
  const disarmed = new Promise((resolve) => {
    lines.on('line', (line) => { if (line === 'disarm') resolve(true); });
    lines.once('close', () => resolve(false));
    lines.once('error', () => resolve(false));
    timer = setTimeout(() => resolve(false), MAX_GUARD_MS);
  });
  try {
    if (audio.readCaptureInput(inputId)?.muted !== true) {
      throw new Error('The microphone guard requires a muted capture device');
    }
    acknowledge();
    if (await disarmed) return;

    // Keep checking for a late unmute after the deck process exits.
    const attempts = Math.ceil(settleMs / RESTORE_CHECK_MS);
    let confirmed = false;
    for (let attempt = 0; attempt <= attempts; attempt++) {
      try {
        if (!confirmed) audio.requestCaptureMute(inputId, true);
        confirmed = audio.readCaptureMute(inputId) === true;
      } catch {
        confirmed = false;
      }
      if (attempt < attempts) await sleep(RESTORE_CHECK_MS);
    }
    if (!confirmed) throw new Error('The microphone guard could not confirm mute');
  } finally {
    clearTimeout(timer);
    lines.close();
    commands.pause();
  }
}

if (require.main === module) {
  const { createAudio } = require('./audio-win32');
  const audio = createAudio();
  process.stdout.on('error', () => {}); // The deck may exit between validation and acknowledgement.
  audio.read();
  guardMicrophone(audio, process.argv[2], process.stdin, () => process.stdout.write('ready\n'))
    .catch(() => { process.exitCode = 1; })
    .finally(() => audio.close());
}

module.exports = { guardMicrophone, startMicGuard };
