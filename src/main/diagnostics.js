// @ts-check
'use strict';

const path = require('node:path');
const { physicalSize } = require('./display');
const { sameBounds } = require('./touch-diagnostics');
const { writeAtomic } = require('./write-atomic');

const DISPLAY_LIMIT = 32;
const TOUCH_LIMIT = 32;
const SERVICE_STATES = ['waiting', 'up', 'retrying', 'down'];

function oneOf(value, choices, fallback = 'unknown') {
  return choices.includes(value) ? value : fallback;
}

function number(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function flag(value) {
  return typeof value === 'boolean' ? value : null;
}

function version(value) {
  return typeof value === 'string' && /^\d{1,6}(?:\.\d{1,6}){1,3}$/.test(value) ? value : null;
}

function endpoint(value) {
  return value ? { volume: number(value.level, 0, 100), muted: flag(value.muted) } : null;
}

function audioSummary(audio, phase) {
  const inputs = Array.isArray(audio?.inputs) ? audio.inputs : [];
  const muted = inputs.filter((item) => item?.muted === true).length;
  const unmuted = inputs.filter((item) => item?.muted === false).length;
  return {
    status: audio ? 'sampled' : 'idle',
    output: endpoint(audio?.output),
    microphones: { active: inputs.length, muted, unmuted, unknown: inputs.length - muted - unmuted },
    preferredMicrophone: endpoint(inputs.find((device) => audio?.microphone?.id && device?.id === audio.microphone.id)),
    pushToTalk: oneOf(phase, ['idle', 'opening', 'talking', 'closing', 'fault'], 'unavailable'),
  };
}

function serviceSummary(service) {
  const totals = { waiting: 0, up: 0, retrying: 0, down: 0, unknown: 0 };
  const checks = Array.isArray(service?.checks) ? service.checks : [];
  for (const check of checks) totals[oneOf(check?.status, SERVICE_STATES)]++;
  return {
    status: oneOf(service?.status, ['ready', 'empty'], 'unavailable'),
    configurationError: Boolean(service?.error),
    checks: totals,
  };
}

function telemetrySummary(sensors, now) {
  const age = Number.isFinite(sensors?.hardwareAt) ? Math.max(0, now - sensors.hardwareAt) : null;
  return {
    source: oneOf(sensors?.hardwareSource, ['managed', 'http', 'disabled', 'unavailable'], 'idle'),
    ageSeconds: age === null ? null : Math.round(age / 1_000),
    available: {
      cpu: Number.isFinite(sensors?.cpu), ram: Number.isFinite(sensors?.ram), gpu: Number.isFinite(sensors?.gpu),
      cpuTemperature: Number.isFinite(sensors?.cpuTemp), gpuTemperature: Number.isFinite(sensors?.gpuTemp),
    },
  };
}

function displaySummary({ displays, primaryDisplayId, edgeDisplayId, deckDisplayId, windowed, touchDevices, platform }) {
  const listed = displays.slice(0, DISPLAY_LIMIT);
  const indexOfBounds = (bounds) => {
    const index = listed.findIndex((display) => sameBounds(bounds, display.physical));
    return index < 0 ? null : index + 1;
  };
  const displayIndex = (id) => {
    const index = id == null ? -1 : listed.findIndex((display) => display.id === id);
    return index < 0 ? null : index + 1;
  };
  return {
    mode: windowed ? 'windowed' : 'deck',
    count: displays.length,
    primaryDisplay: displayIndex(primaryDisplayId),
    edgeDisplay: displayIndex(edgeDisplayId),
    deckDisplay: displayIndex(deckDisplayId),
    displays: listed.map((display, index) => {
      const size = physicalSize(display);
      return {
        number: index + 1,
        width: number(display.physical?.width ?? size.width, 1, 65_536),
        height: number(display.physical?.height ?? size.height, 1, 65_536),
        x: number(display.physical?.x ?? display.bounds?.x, -65_536, 65_536),
        y: number(display.physical?.y ?? display.bounds?.y, -65_536, 65_536),
        coordinates: display.physical ? 'pixels' : 'dip',
        scale: number(display.scaleFactor, 0.25, 10),
        rotation: oneOf(display.rotation, [0, 90, 180, 270], null),
      };
    }),
    touch: {
      status: platform !== 'win32' ? 'unsupported' : touchDevices === null ? 'unavailable' : 'sampled',
      count: touchDevices?.length ?? null,
      devices: (touchDevices ?? []).slice(0, TOUCH_LIMIT).map((device) => ({
        maxContacts: number(device.contacts, 0, 1024),
        mappedDisplay: indexOfBounds(device.mappedBounds),
        monitorDisplay: indexOfBounds(device.monitorBounds),
      })),
    },
  };
}

function buildDiagnostics({ environment, display, audio, phase, sensors, obs, media, wsl, services,
  profileWarning, panelMeasurement }, now = Date.now()) {
  return {
    schemaVersion: 1,
    capturedAt: new Date(now).toISOString(),
    environment: {
      lastra: version(environment.lastra),
      electron: version(environment.electron),
      system: oneOf(environment.system, ['win32', 'linux', 'darwin']),
      systemVersion: version(environment.systemVersion),
      architecture: oneOf(environment.architecture, ['x64', 'ia32', 'arm64', 'arm', 'riscv64']),
    },
    display: displaySummary({ ...display, platform: environment.system }),
    audio: audioSummary(audio, phase),
    integrations: {
      hardwareMonitor: telemetrySummary(sensors, now),
      obs: oneOf(obs, ['disabled', 'invalid', 'connecting', 'syncing', 'connected', 'authentication', 'disconnected'], 'unavailable'),
      windowsMedia: oneOf(media, ['idle', 'starting', 'running', 'unsupported', 'unavailable'], 'unavailable'),
      wsl: oneOf(wsl, ['idle', 'ready', 'empty', 'unsupported', 'unavailable'], 'unavailable'),
      serviceHealth: serviceSummary(services),
    },
    profile: { warning: Boolean(profileWarning) },
    ...(panelMeasurement ? { panelMeasurement } : {}),
  };
}

async function saveDiagnostics({ dialog, directory, collect, now = Date.now() }) {
  const date = new Date(now).toISOString().slice(0, 10);
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export Lastra diagnostics',
    defaultPath: path.join(directory, `lastra-diagnostics-${date}.json`),
    filters: [{ name: 'JSON report', extensions: ['json'] }],
  });
  if (canceled || !filePath) return false;
  writeAtomic(filePath, JSON.stringify(collect(), null, 2) + '\n');
  return true;
}

module.exports = { buildDiagnostics, saveDiagnostics };
