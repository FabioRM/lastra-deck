'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createActionRunner } = require('../src/main/actions');
const { KEYEVENTF_KEYUP, KEYEVENTF_UNICODE, sendKeyboardEvents, textEvents } = require('../src/main/actions/input-win32');
const { MeasurementRun, PanelMeasurements, SETTLE_MS, RUN_MS } = require('../src/main/panel-measurement');
const { Pages, runPageAction } = require('../src/main/pages');
const { validateProfile } = require('../src/main/profile');

function fixture() {
  const run = new MeasurementRun({ id: 4, phase: 'active', now: 10_000, durationMs: 10_000, setup: { view: 'keys' } });
  const at = 10_000 + SETTLE_MS;
  const send = (events, id = 4) => run.receive({ run: id, events });
  return { run, at, send };
}

test('panel measurements separate contact, request, execution, feedback and passive input evidence', () => {
  const { run, at, send } = fixture();
  const trace = (id) => ({ run: 4, id });
  run.observe(at + 15, { cursor: { x: 2221, y: 551 }, window: 'known private window' });
  run.observe(at + 60, { cursor: { x: 2221, y: 551 }, window: 'known private window' });
  run.observe(at + 120, { cursor: { x: 2241, y: 551 }, window: 'other private window' });
  run.observe(at + 280, { cursor: { x: 2224, y: 555 }, window: 'known private window' });
  run.command(trace(1), 'request');
  run.command(trace(1), 'execution');
  run.command(trace(1), 'execution');
  run.command(trace(3), 'request');
  run.command(null, 'request', at + 3000);
  send([
    { kind: 'touch', id: 1, at: at + 100 }, { kind: 'pending', id: 1, at: at + 125 },
    { kind: 'feedback', id: 1, at: at + 170 }, { kind: 'outcome', id: 1, at: at + 160, status: 'success' },
    { kind: 'touch', id: 2, at: at + 1500 }, { kind: 'touch', id: 3, at: at + 1900 },
    { kind: 'outcome', id: 3, at: at + 1901, status: 'ignored' },
    { kind: 'touch', id: 257, at: at + 2000 }, { kind: 'touch', id: 4, at: at - 1 },
  ]);
  send([{ kind: 'touch', id: 6, at: at + 500 }], 9);
  const summary = run.summary();
  assert.equal(summary.input.foregroundTransitions, 2);
  assert.equal(summary.input.tapsWithoutRequest, 1);
  assert.equal(summary.input.tapsWithoutExecution, 2);
  assert.equal(summary.input.tapsWithMultipleExecutions, 1);
  assert.deepEqual(summary.input.untaggedCommands, { requests: 1, executions: 0 });
  assert.deepEqual(summary.input.taps[0], {
    offsetMs: 100, requests: 1, executions: 2, outcome: 'success', pendingFrameMs: 25, feedbackFrameMs: 70,
    displacementPx: 20, displacementAfterPx: 5, foregroundChanged: true,
  });
  assert.equal(summary.latency.feedbackFrameMs.p95, 70);
  assert.equal(summary.input.taps.length, 3);
  assert.doesNotMatch(JSON.stringify(summary), /2221|private window/);
});

test('provider acquisition samples, changed DOM frames and resource statistics remain independent', () => {
  const { run, at, send } = fixture();
  for (const offset of [20, 42, 80]) run.provider('media', at + offset);
  run.provider('media', at - 10);
  run.provider('unknown', at + 40);
  send([{ kind: 'redraw', surface: 'dashboard', at: at + 30 }, { kind: 'redraw', surface: 'keys', at: at + 65 }]);
  run.sample(at + 2000, [{ id: 'electron', status: 'ready', cpuPercent: 2, workingSetMiB: 90 },
    { id: 'hardware', status: 'inactive', cpuPercent: null, workingSetMiB: null }]);
  run.sample(at + 4000, [{ id: 'electron', status: 'ready', cpuPercent: 4, workingSetMiB: 110 },
    { id: 'hardware', status: 'ready', cpuPercent: 1, workingSetMiB: 45 }]);
  const summary = run.summary();
  assert.equal(summary.providerReads.media, 3);
  assert.deepEqual(summary.redrawFrames, { keys: 1, dashboard: 1, stats: 0, bar: 0 });
  assert.equal(summary.resourceSampleCount, 2);
  assert.equal(summary.resources.find(({ id }) => id === 'electron').workingSetMiB.mean, 100);
  assert.equal(summary.resources.find(({ id }) => id === 'hardware').inactive, 1);
  assert.equal(summary.resources.find(({ id }) => id === 'media').cpuPercent.max, null);
});

test('the last contact can use cursor observations after the run ends', () => {
  const { run, send } = fixture();
  const at = run.endedAt - 20;
  const observe = (time, x, window) => run.observe(time, { cursor: { x, y: 0 }, window });
  observe(at - 40, 100, 'game');
  observe(at + 50, 120, 'deck');
  observe(at + 200, 110, 'game');
  send([{ kind: 'touch', id: 1, at }]);
  const { input } = run.summary();
  assert.equal(input.foregroundTransitions, 0);
  assert.equal(input.taps[0].displacementAfterPx, 10);
  assert.equal(input.taps[0].foregroundChanged, true);
});

test('the recorder compares only a matched idle run and subsequent active run', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let now = 10_000;
  let view = 'keys';
  let cpuPercent = 1;
  const recorder = new PanelMeasurements({ now: () => now, input: () => null, setup: () => ({ view }),
    resources: () => ({ rows: [{ id: 'electron', status: 'ready', cpuPercent, workingSetMiB: 100 }] }), update() {} });
  function record(phase, reads) {
    recorder.start(phase);
    now += SETTLE_MS;
    for (let index = 0; index < reads; index++) recorder.run.provider('media', now);
    t.mock.timers.tick(20);
    now += RUN_MS + 500;
    t.mock.timers.tick(20);
  }
  record('idle', 2);
  assert.equal(recorder.snapshot().comparison.status, 'awaiting-pair');
  cpuPercent = 4;
  record('active', 5);
  const { comparison } = recorder.snapshot();
  assert.equal(comparison.status, 'comparable');
  assert.equal(comparison.providerReadDelta.media, 3);
  assert.equal(comparison.resourceDelta[0].meanCpuPercentagePoints, 3);
  assert.equal(comparison.resourceDelta[1].meanCpuPercentagePoints, null);
  record('idle', 2);
  assert.equal(recorder.snapshot().comparison.status, 'idle-is-newer');
  view = 'stats';
  record('active', 5);
  assert.deepEqual(recorder.snapshot().comparison, { status: 'different-setup', differences: ['view'] });
});

test('the measurement profile keeps the marker restricted to a contextual Notepad window', () => {
  const profile = validateProfile(require('../profiles/panel-measurement.json'));
  assert.deepEqual(profile.pages[0].keys, []);
  assert.deepEqual(profile.pages[1].apps, ['notepad.exe']);
  assert.deepEqual(profile.pages[1].keys[0].action, { type: 'text', text: 'x', targetApps: ['notepad.exe'] });
});

test('the keyboard delivery fixture separates target, Windows acceptance, and cursor observations', async (t) => {
  const profile = validateProfile(require('../profiles/panel-measurement.json'));
  const target = { executable: 'notepad.exe', id: '41:100', windowId: 100n };
  const duplicate = { ...target, id: '41:101', windowId: 101n };
  const scenarios = [
    { name: 'ordinary window, keyboard accepted', window: target, received: 'x' },
    { name: 'borderless window, stable foreground and keyboard accepted', window: target, received: 'x' },
    { name: 'elevated window, SendInput accepts zero events', window: target, blocked: true },
    { name: 'exclusive fullscreen loses foreground before dispatch', window: duplicate, displacement: 24 },
  ];
  for (const { name, window, received, blocked, displacement = 0 } of scenarios) {
    await t.test(name, async () => {
      const { run, at, send } = fixture();
      const trace = { run: 4, id: 1 };
      const pages = new Pages();
      pages.observe(target);
      const page = pages.current(profile);
      const binding = pages.binding(page);
      assert.equal(binding.target.windowId, target.windowId);

      const packets = [];
      const delivered = new Map();
      const readForeground = () => window.executable;
      readForeground.context = () => window;
      readForeground.windowId = () => window.windowId;
      const runner = createActionRunner({ readForeground, input: {
        sendText: (text) => sendKeyboardEvents(textEvents(text), (events) => {
          packets.push({ window: window.windowId, events });
          if (blocked) return 0;
          const keys = events.filter(({ u }) => !(u.ki.dwFlags & KEYEVENTF_KEYUP));
          delivered.set(window.windowId, keys.map(({ u }) => String.fromCharCode(u.ki.wScan)).join(''));
          return events.length;
        }),
      } });

      run.observe(at, { window: target.windowId, cursor: { x: 200, y: 40 } });
      send([{ kind: 'touch', id: trace.id, at: at + 60 }]);
      run.command(trace, 'request', at + 61);
      run.command(trace, 'execution', at + 62);
      const result = await runPageAction(page, page.keys[0].action, runner, readForeground, binding);
      run.observe(at + 80, { window: window.windowId, cursor: { x: 200 + displacement, y: 40 } });
      run.observe(at + 240, { window: window.windowId, cursor: { x: 200 + displacement, y: 40 } });
      send([{ kind: 'outcome', id: trace.id, at: at + 65, status: result.ok ? 'success' : 'error' }]);

      assert.equal(result.ok, Boolean(received));
      assert.equal(delivered.get(target.windowId), received);
      assert.equal(delivered.has(duplicate.windowId), false);
      if (window === duplicate) {
        assert.deepEqual(packets, []);
        assert.match(result.message, /target window.*unavailable/i);
      } else {
        assert.equal(packets.length, 1);
        assert.equal(packets[0].window, target.windowId);
        assert.deepEqual(packets[0].events.map(({ type, u }) => [type, u.ki.wScan, u.ki.dwFlags]), [
          [1, 'x'.charCodeAt(0), KEYEVENTF_UNICODE],
          [1, 'x'.charCodeAt(0), KEYEVENTF_UNICODE | KEYEVENTF_KEYUP],
        ]);
        if (blocked) assert.match(result.message, /Windows blocked keyboard input/);
      }
      const [tap] = run.summary().input.taps;
      assert.equal(tap.foregroundChanged, window !== target);
      assert.equal(tap.displacementPx, displacement);
      assert.equal(tap.displacementAfterPx, displacement);
      assert.equal(tap.outcome, received ? 'success' : 'error');
    });
  }
});
