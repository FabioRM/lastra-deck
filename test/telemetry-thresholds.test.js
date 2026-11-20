'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { TelemetryThresholds, normalizeRules } = require('../src/main/telemetry-thresholds');
const { tempDir } = require('./helpers/temp-dir');

const rule = { id: 'gpu', name: 'High GPU load', metric: 'gpu', limit: 80, holdSeconds: 4 };
const config = (rules) => ({ version: 1, rules });

test('hardware thresholds validate measured units and use an inclusive configurable limit', () => {
  const [normalized] = normalizeRules(config([rule]));
  assert.equal(normalized.direction, 'above');
  assert.throws(() => normalizeRules(config([{ ...rule, metric: 'constructor' }])), /Rule 1.*Choose/);
  assert.throws(() => normalizeRules(config([{ ...rule, limit: 101 }])), /between 0 and 100/);
  assert.throws(() => normalizeRules(config([{ ...rule, holdSeconds: 1 }])), /2 and 3,600 seconds/);
});

test('short spikes, repeated cached readings and gaps cannot sustain an alert; fresh data can', (t) => {
  let monitor;
  t.after(() => monitor?.stop());
  const directory = tempDir(t, 'lastra-thresholds-');
  const file = path.join(directory, 'rules.json');
  fs.writeFileSync(file, JSON.stringify(config([rule])));
  let now = 0;
  const results = [];
  monitor = new TelemetryThresholds(file, { now: () => now, onResult: (_rule, active) => results.push(active) });
  monitor.start();
  const record = (value, at = now) => monitor.observe({ gpu: value, hardwareAt: at, sampledAt: now });
  const state = () => monitor.snapshot().rules[0].state;
  record(0.9);
  now = 4_000;
  record(0.9, 0);
  assert.equal(state(), 'pending');
  now = 6_500;
  record(0.9, 0);
  assert.equal(state(), 'unavailable');
  record(0.95);
  now = 8_000;
  record(0.5);
  assert.equal(state(), 'normal');
  now = 9_000;
  record(0.8);
  now = 13_000;
  record(0.8);
  assert.equal(state(), 'active');
  now = 20_000;
  record(null);
  assert.equal(state(), 'unavailable');
  now++;
  record(0.6);
  assert.equal(state(), 'normal');
  assert.deepEqual(results, [false, true, false]);
  fs.writeFileSync(file, '{}');
  monitor.reload();
  assert.match(monitor.snapshot().error, /require version 1/);
  assert.equal(state(), 'normal');
});

test('slower hardware refresh can sustain a threshold using its own freshness window', (t) => {
  let monitor;
  t.after(() => monitor?.stop());
  const directory = tempDir(t, 'lastra-threshold-gap-');
  const file = path.join(directory, 'rules.json');
  fs.writeFileSync(file, JSON.stringify(config([rule])));
  let now = 0;
  monitor = new TelemetryThresholds(file, { now: () => now });
  monitor.start();
  const record = (at) => monitor.observe({ gpu: .9, hardwareAt: at, sampledAt: now, hardwareStaleMs: 30_000 });
  record(0);
  now = 8_000;
  record(0);
  assert.equal(monitor.snapshot().rules[0].state, 'pending');
  now = 10_000;
  record(now);
  assert.equal(monitor.snapshot().rules[0].state, 'active');
});
