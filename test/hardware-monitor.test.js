'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { HardwareMonitor } = require('../src/main/hardware-monitor');

test('a failed hardware helper run is released and retried with growing delays', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const logs = [];
  const monitor = new HardwareMonitor('cache', (...args) => logs.push(args.join(' ')));
  let starts = 0;
  monitor.start = async () => { starts++; };

  const first = new AbortController();
  monitor.controller = first;
  monitor.scheduleRestart(first);
  assert.equal(monitor.controller, null, 'the next start() must not be blocked by the failed run');
  t.mock.timers.tick(4_999);
  assert.equal(starts, 0);
  t.mock.timers.tick(1);
  assert.equal(starts, 1);

  const second = new AbortController();
  monitor.controller = second;
  monitor.scheduleRestart(second);
  t.mock.timers.tick(9_999);
  assert.equal(starts, 1);
  t.mock.timers.tick(1);
  assert.equal(starts, 2);
});

test('stopping the hardware monitor cancels a pending restart', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const monitor = new HardwareMonitor('cache', () => {});
  let starts = 0;
  monitor.start = async () => { starts++; };
  const run = new AbortController();
  monitor.controller = run;
  monitor.scheduleRestart(run);
  monitor.stop();
  t.mock.timers.tick(600_000);
  assert.equal(starts, 0);

  const aborted = new AbortController();
  aborted.abort();
  monitor.controller = aborted;
  monitor.scheduleRestart(aborted);
  assert.equal(monitor.restartTimer, null, 'a run stopped on purpose is not restarted');
});
