'use strict';

// Hidden page that plays soundboard clips. The main process sends each clip as bytes and decides
// what may play; this page only decodes, routes to an output and reports what happened.

{
  const host = window.lastraSoundHost;
  const voices = new Map();

  async function sinkFor(label) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const match = devices.find((device) => device.kind === 'audiooutput' && device.label === label
      && device.deviceId !== 'default' && device.deviceId !== 'communications');
    if (!match) throw new Error(`The output “${label}” is not connected.`);
    return match.deviceId;
  }

  async function outputs({ ticket }) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      host.report({ type: 'outputs', ticket, labels: devices
        .filter((device) => device.kind === 'audiooutput' && device.deviceId !== 'default' && device.deviceId !== 'communications')
        .map((device) => device.label) });
    } catch {
      host.report({ type: 'failed', ticket, message: 'Windows audio outputs are unavailable.' });
    }
  }

  async function play({ ticket, bytes, mime, volume, output }) {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const audio = new Audio();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      voices.delete(ticket);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
    };
    voices.set(ticket, release);
    try {
      audio.volume = Math.max(0, Math.min(1, Number(volume) || 0));
      if (output) await audio.setSinkId(await sinkFor(output));
      await new Promise((resolve, reject) => {
        audio.addEventListener('loadedmetadata', resolve, { once: true });
        audio.addEventListener('error', () => reject(new Error('This file is not a playable audio clip.')), { once: true });
        audio.src = url;
      });
      if (released) return;
      audio.addEventListener('ended', () => {
        release();
        host.report({ type: 'ended', ticket });
      }, { once: true });
      await audio.play();
      if (released) return;
      host.report({ type: 'started', ticket, durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : null });
    } catch (error) {
      const stopped = released;
      release();
      host.report({ type: 'failed', ticket, message: stopped ? 'The clip was stopped.' : error?.message || 'The clip could not be played.' });
    }
  }

  host.onCommand((command) => {
    if (command?.type === 'play') void play(command);
    else if (command?.type === 'outputs') void outputs(command);
    else if (command?.type === 'stop') for (const ticket of command.tickets ?? []) voices.get(ticket)?.();
    else if (command?.type === 'stop-all') for (const release of [...voices.values()]) release();
  });
  host.report({ type: 'ready' });
}
