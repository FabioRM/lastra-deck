'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { buildDiagnostics, saveDiagnostics } = require('../src/main/diagnostics');
const { WindowsMedia } = require('../src/main/windows-media');
const { tempDir } = require('./helpers/temp-dir');

const NOW = Date.UTC(2026, 10, 19);
const PRIVATE = 'must-not-be-in-the-report';
const environment = {
  lastra: '0.2.0', electron: '45.3.3', system: 'win32', systemVersion: '10.0.26200', architecture: 'x64',
};
const edgeBounds = { x: -2560, y: 0, width: 2560, height: 720 };
const primaryBounds = { x: 0, y: 0, width: 3840, height: 2160 };

function fixture() {
  const input = { id: `hardware-id-${PRIVATE}`, name: `microphone-${PRIVATE}`, level: 83, muted: false };
  return {
    environment,
    display: {
      primaryDisplayId: 1,
      edgeDisplayId: 2,
      deckDisplayId: 2,
      displays: [
        { id: 1, label: PRIVATE, scaleFactor: 2, rotation: 0, size: { width: 1920, height: 1080 }, physical: primaryBounds },
        { id: 2, label: `XENEON EDGE ${PRIVATE}`, scaleFactor: 1, rotation: 0, size: edgeBounds, physical: edgeBounds },
      ],
      touchDevices: [{ name: PRIVATE, monitorName: PRIVATE, contacts: 5, mappedBounds: primaryBounds, monitorBounds: edgeBounds }],
    },
    audio: {
      output: { id: PRIVATE, name: PRIVATE, level: 62, muted: true },
      inputs: [input, { id: PRIVATE, name: PRIVATE, level: 50, muted: true }, { muted: null }],
      microphone: { ...input, muted: true, mutedCount: 1 },
    },
    phase: 'fault',
    sensors: { hardwareAt: NOW - 2300, hardwareSource: 'managed', cpu: 0.2, ram: 0.6, gpu: null, cpuTemp: 50, gpuTemp: null,
      url: `https://user:${PRIVATE}@localhost/sensors`, history: PRIVATE },
    obs: 'authentication',
    media: 'idle',
    wsl: 'ready',
    services: {
      status: 'ready',
      error: `Could not read C:\\Users\\${PRIVATE}\\service-checks.json`,
      checks: [
        { id: PRIVATE, name: PRIVATE, status: 'up', latest: { detail: `https://user:${PRIVATE}@example.net` } },
        { id: PRIVATE, name: PRIVATE, status: 'down' },
        { id: PRIVATE, name: PRIVATE, status: 'down' },
        { id: PRIVATE, name: PRIVATE, status: PRIVATE },
      ],
    },
    profileWarning: `Could not read C:\\Users\\${PRIVATE}\\profile.json`,
    profile: { commands: [PRIVATE] },
  };
}

test('diagnostics describe the touch target, audio state and aggregate service health without sensitive strings', () => {
  const report = buildDiagnostics(fixture(), NOW);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.capturedAt, '2026-11-19T00:00:00.000Z');
  assert.equal(report.display.primaryDisplay, 1);
  assert.equal(report.display.edgeDisplay, 2);
  assert.equal(report.display.deckDisplay, 2);
  assert.deepEqual(report.display.displays[1],
    { number: 2, width: 2560, height: 720, x: -2560, y: 0, coordinates: 'pixels', scale: 1, rotation: 0 });
  assert.deepEqual(report.display.touch.devices, [{ maxContacts: 5, mappedDisplay: 1, monitorDisplay: 2 }]);
  assert.deepEqual(report.audio, {
    status: 'sampled', output: { volume: 62, muted: true },
    microphones: { active: 3, muted: 1, unmuted: 1, unknown: 1 },
    preferredMicrophone: { volume: 83, muted: false },
    pushToTalk: 'fault',
  });
  assert.deepEqual(report.integrations.hardwareMonitor, { source: 'managed', ageSeconds: 2,
    available: { cpu: true, ram: true, gpu: false, cpuTemperature: true, gpuTemperature: false } });
  assert.deepEqual(report.integrations.serviceHealth, {
    status: 'ready', configurationError: true, checks: { waiting: 0, up: 1, retrying: 0, down: 2, unknown: 1 },
  });
  assert.equal(report.integrations.obs, 'authentication');
  assert.equal(report.profile.warning, true);
  assert.ok(!JSON.stringify(report).includes(PRIVATE));
});

test('diagnostics use safe fallback states and reject unexpected status and version strings', () => {
  const input = { ...fixture(), environment: { ...environment, lastra: `1.0-${PRIVATE}` }, audio: null,
    obs: PRIVATE, display: { displays: [], touchDevices: null, windowed: true }, services: null };
  const report = buildDiagnostics(input, NOW);
  assert.equal(report.environment.lastra, null);
  assert.equal(report.display.mode, 'windowed');
  assert.equal(report.display.edgeDisplay, null);
  assert.equal(report.display.touch.status, 'unavailable');
  assert.equal(report.integrations.obs, 'unavailable');
  assert.equal(report.integrations.serviceHealth.status, 'unavailable');
  assert.equal(report.audio.status, 'idle');
  assert.ok(!JSON.stringify(report).includes(PRIVATE));
});

test('media diagnostic state can be read without launching the native helper', () => {
  let started = 0;
  const launch = () => { started++; };
  assert.equal(new WindowsMedia('unused', { platform: 'win32', launch }).diagnosticStatus(), 'idle');
  assert.equal(new WindowsMedia('unused', { platform: 'linux', launch }).diagnosticStatus(), 'unsupported');
  assert.equal(started, 0);
});

test('export respects cancellation and saves a standalone sanitized JSON file when requested', async (t) => {
  const directory = tempDir(t, 'lastra-report-test-');
  const filePath = path.join(directory, 'lastra-diagnostics-2026-11-19.json');
  let collectCalls = 0;
  let canceled = true;
  const dialog = {
    showSaveDialog: (options) => {
      assert.equal(options.defaultPath, filePath);
      assert.deepEqual(options.filters, [{ name: 'JSON report', extensions: ['json'] }]);
      return { canceled, filePath };
    },
  };
  const collect = () => {
    collectCalls++;
    return buildDiagnostics(fixture(), NOW);
  };
  const options = { dialog, directory, collect, now: NOW };
  assert.equal(await saveDiagnostics(options), false);
  assert.equal(collectCalls, 0);
  assert.deepEqual(fs.readdirSync(directory), []);
  canceled = false;
  assert.equal(await saveDiagnostics(options), true);
  assert.equal(collectCalls, 1);
  assert.deepEqual(fs.readdirSync(directory), [path.basename(filePath)]);
  const text = fs.readFileSync(filePath, 'utf8');
  assert.equal(JSON.parse(text).schemaVersion, 1);
  assert.ok(!text.includes(PRIVATE));
});
