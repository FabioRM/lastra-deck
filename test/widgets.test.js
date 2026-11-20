'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizeWidgetInstances, BAR_GRID } = require('../src/main/widgets');
const { validateProfile, toView } = require('../src/main/profile');
const { cells, projectPage, remapKeys } = require('../src/shared/widget-layout');
const { decisionResult } = require('../src/shared/decisions');
const { sharedSubscription, createMediaProvider } = require('../src/renderer/widget-providers');
const { createFaderWriter, createLevelBinding } = require('../src/renderer/audio-fader');

const metric = { id: 'stat', type: 'system-metric' };
const media = { id: 'media', type: 'now-playing' };

test('widget instances validate settings and preserve separate choices', () => {
  assert.deepEqual(normalizeWidgetInstances([
    metric, { ...metric, id: 'second', settings: { metric: 'gpu', shape: 'graph' } },
  ]), [
    { ...metric, settings: { metric: 'cpu', shape: 'stat' } },
    { ...metric, id: 'second', settings: { metric: 'gpu', shape: 'graph' } },
  ]);
  assert.throws(() => normalizeWidgetInstances([metric, metric]), /duplicate ID/);
  assert.throws(() => normalizeWidgetInstances([{ ...metric, settings: { path: 'C:/secret' } }]), /unsupported setting/);
  assert.throws(() => normalizeWidgetInstances([{ ...metric, type: 'constructor' }]), /unsupported widget type/);
  assert.throws(() => normalizeWidgetInstances(Array(13)), /up to 12/);
});

test('decision widgets validate each pick list and offer all coin and die outcomes', () => {
  const decision = { id: 'quick-choice', type: 'decision' };
  const options = ['Tea', 'Coffee', 'Water'];
  const [defaultWidget, configured] = normalizeWidgetInstances([
    decision, { ...decision, id: 'drinks', settings: { options: [' Tea ', 'Coffee', 'Water'] } },
  ], { grid: BAR_GRID });
  assert.deepEqual(defaultWidget.settings.options, ['Option A', 'Option B']);
  assert.deepEqual(defaultWidget.layout, { column: 0, row: 0, cols: 1, rows: 1 });
  assert.deepEqual(configured.settings.options, options);
  for (const invalid of [null, [], ['Only one'], ['Tea', 'tea'], ['Tea', 'A\nB'],
    ['Tea', 2], ['', 'Water'], ['x'.repeat(33), 'Tea'], Array.from({ length: 9 }, (_, i) => String(i))]) {
    assert.throws(() => normalizeWidgetInstances([{ ...decision, settings: { options: invalid } }]), /distinct pick options/);
  }
  assert.equal(decisionResult('coin', options, () => 0), 'Heads');
  assert.equal(decisionResult('coin', options, () => 0.5), 'Tails');
  for (let i = 0; i < 6; i++) assert.equal(decisionResult('die', options, () => (i + 0.5) / 6), String(i + 1));
  assert.equal(decisionResult('pick', options, () => 0), 'Tea');
  assert.equal(decisionResult('pick', options, () => 0.99999), 'Water');
});

test('faders validate the audio endpoint, direction and integer reset percent', () => {
  const entry = { id: 'voice', type: 'audio-fader', settings: { device: 'microphone', orientation: 'vertical', defaultLevel: 63 } };
  assert.deepEqual(normalizeWidgetInstances([entry]), [entry]);
  assert.throws(() => normalizeWidgetInstances([{ ...entry, settings: { defaultLevel: 101 } }]), /defaultLevel/);
  assert.throws(() => normalizeWidgetInstances([{ ...entry, settings: { orientation: 'diagonal' } }]), /orientation/);
});

test('the encoder stores a relative step with the same Windows endpoints and reset range', () => {
  const entry = { id: 'encoder', type: 'audio-encoder', settings: { device: 'output', step: 8, defaultLevel: 63 } };
  assert.deepEqual(normalizeWidgetInstances([entry]), [entry]);
  assert.throws(() => normalizeWidgetInstances([{ ...entry, settings: { step: 21 } }]), /step/);
});

test('fader writes coalesce within one drag and drop queued changes on cancellation', async () => {
  const writes = [];
  const applied = [];
  const intervals = [];
  const writer = createFaderWriter((item) => new Promise((resolve) => {
    writes.push(item);
    applied.push(resolve);
  }), () => intervals.shift()?.(), 0);
  const nextWrite = () => new Promise((resolve) => intervals.push(resolve));
  writer.push({ id: 'speakers', level: 10 });
  writer.push({ id: 'speakers', level: 25 });
  writer.push({ id: 'speakers', level: 42 });
  assert.equal(writes.length, 1);
  const first = nextWrite();
  applied.shift()();
  await first;
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(writes.map(({ level }) => level), [10, 42]);
  writer.push({ id: 'speakers', level: 80 });
  writer.cancel();
  applied.shift()();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(writer.busy, false);
  assert.deepEqual(writes.map(({ id }) => id), ['speakers', 'speakers']);
});

test('fader shows local intent during a drag and the latest Windows readback after release or cancellation', async () => {
  const writes = [];
  let state;
  let settle;
  const binding = createLevelBinding({
    min: 0, max: 100, interval: 1,
    render(next) { state = next; },
    write(item) { writes.push(item); return new Promise((resolve) => { settle = resolve; }); },
  });
  const sample = (id, level) => ({ id, level });
  binding.receive(sample('speakers', 30), 1);
  binding.begin();
  binding.change(50);
  binding.receive(sample('speakers', 35), 2);
  assert.equal(state.level, 50);
  binding.release();
  assert.equal(state.level, 35);
  assert.equal(state.status, 'Applying…');
  binding.receive(sample('speakers', 52), 4);
  settle({ endpoint: sample('speakers', 50), version: 3 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(state, { available: true, level: 52, status: '' });

  binding.begin();
  binding.change(60);
  binding.change(62);
  binding.cancel();
  assert.equal(state.level, 52);
  binding.receive(sample('speakers', 60), 5);
  settle({ endpoint: sample('speakers', 60), version: 5 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(writes.map(({ level }) => level), [50, 60]);
  assert.deepEqual(state, { available: true, level: 60, status: '' });

  binding.begin();
  binding.receive(null, 6);
  assert.equal(state.available, false);
  binding.receive(sample('headphones', 18), 7);
  binding.change(75);
  assert.equal(writes.length, 2);
  binding.release();
  assert.equal(state.level, 18);
  binding.step(-25);
  assert.deepEqual(writes.at(-1), { id: 'headphones', level: 0 });
  settle({ endpoint: sample('headphones', 0), version: 8 });
});

test('relative steps aggregate while a write is settling and resume from the newest source value', async () => {
  const writes = [];
  const completions = [];
  let state;
  const binding = createLevelBinding({ min: 0, max: 100, interval: 1, render(next) { state = next; },
    write(item) { writes.push(item.level); return new Promise((resolve) => completions.push(resolve)); } });
  const speakers = (level, version) => ({ endpoint: { id: 'speakers', level }, version });
  binding.receive(speakers(91).endpoint, 1);
  binding.step(5);
  binding.step(1);
  binding.step(10);
  assert.equal(state.level, 91);
  completions.shift()(speakers(96, 2));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(writes, [96, 100]);
  completions.shift()(speakers(98, 3));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(state.level, 98);

  binding.receive(speakers(40).endpoint, 4);
  binding.step(-1);
  assert.equal(writes.at(-1), 39);
  completions.shift()(speakers(39, 5));
});

test('page and bar widgets use the same shape and reserve only empty cells', () => {
  const key = { id: 'key', action: { type: 'hotkey', keys: 'ctrl+f' } };
  const profile = validateProfile({
    grid: { cols: 3, rows: 1 },
    pages: [{ id: 'page', keys: [key], widgets: [media] }],
    bar: { widgets: [metric, media] },
  });
  assert.deepEqual(toView(profile).widgets[0].layout, { column: 1, row: 0, cols: 2, rows: 1 });
  assert.deepEqual(toView(profile).bar.widgets.map(({ layout }) => layout.column), [0, 1]);
  assert.throws(() => validateProfile({
    grid: { cols: 3, rows: 1 },
    pages: [{ id: 'page', keys: [key], widgets: [{ ...metric, layout: { column: 0, row: 0, cols: 1, rows: 1 } }] }],
  }), /placement overlaps/);
  assert.throws(() => normalizeWidgetInstances([{ ...metric, layout: { column: 0, row: 1, cols: 1, rows: 1 } }], { grid: BAR_GRID }), /outside the grid/);
});

test('portrait projection preserves keys and widget settings without overlap', () => {
  const grid = { cols: 8, rows: 3 };
  const slots = Array(grid.cols * grid.rows).fill(null);
  slots[0] = { id: 'key1' };
  slots[9] = { id: 'key2' };
  const widgets = [
    { ...media, layout: { column: 4, row: 0, cols: 4, rows: 2 }, settings: { appearance: 'expanded' } },
    { ...metric, layout: { column: 0, row: 2, cols: 2, rows: 1 }, settings: { metric: 'ram', shape: 'graph' } },
  ];
  const view = projectPage(grid, slots, widgets, 3);
  assert.deepEqual(view.keys.filter(({ index }) => slots[index]).map(({ index }) => index), [0, 9]);
  assert.deepEqual(view.widgets.map(({ settings }) => settings), widgets.map(({ settings }) => settings));
  const used = [...view.keys, ...view.widgets].flatMap(({ layout }) => cells(layout, 3));
  assert.equal(used.length, new Set(used).size);
  assert.ok(view.widgets.every(({ layout }) => layout.column + layout.cols <= 3));
});

test('persistent keys have separate public IDs and reserve space in the bar', () => {
  const key = { id: 'play', action: { type: 'hotkey', keys: 'ctrl+space' } };
  const raw = { pages: [{ id: 'home', keys: [key] }], bar: { keys: [key], widgets: [metric] } };
  const profile = validateProfile(raw);
  const view = toView(profile);
  assert.equal(view.slots[0].id, 'play');
  assert.equal(view.bar.keys[0].id, 'bar:play');
  assert.equal(view.bar.keys[0].action, undefined);
  assert.equal(view.bar.widgets[0].layout.column, 1);
  raw.bar.widgets[0] = { ...metric, layout: { column: 0, row: 0, cols: 1, rows: 1 } };
  assert.throws(() => validateProfile(raw), /persistent bar.*placement overlaps/);
});

test('a page grid and wide keys reserve cells in landscape and portrait', () => {
  const wide = { id: 'wide', span: { cols: 3, rows: 2 }, action: { type: 'hotkey', keys: 'ctrl+f' } };
  const grid = { cols: 5, rows: 2 };
  const raw = {
    grid: { cols: 2, rows: 2 },
    pages: [{ id: 'wide', grid, keys: [wide], widgets: [media] }, { id: 'normal', keys: [] }],
  };
  const profile = validateProfile(raw);
  const view = toView(profile);
  assert.deepEqual(view.grid, grid);
  assert.deepEqual(toView(profile, { page: profile.pages[1] }).grid, raw.grid);
  assert.equal(view.widgets[0].layout.column, 3);
  const landscape = projectPage(view.grid, view.slots, view.widgets, 5);
  assert.deepEqual(landscape.keys[0].layout, { column: 0, row: 0, cols: 3, rows: 2 });
  const portrait = projectPage(view.grid, view.slots, view.widgets, 2);
  assert.deepEqual(portrait.keys[0].layout, { column: 0, row: 0, cols: 2, rows: 2 });
  for (const [columns, layout] of [[5, landscape], [2, portrait]]) {
    const used = [...layout.keys, ...layout.widgets].flatMap(({ layout }) => cells(layout, columns));
    assert.equal(used.length, new Set(used).size);
  }
  raw.pages[0].keys[1] = { ...wide, id: 'overlap' };
  assert.throws(() => validateProfile(raw), /key span overlaps/);
  assert.equal(remapKeys([wide], grid, { cols: 2, rows: 2 }), null);
  const single = { id: 'moved' };
  assert.equal(remapKeys([null, null, null, null, null, single], grid, { cols: 6, rows: 2 })[6], single);
});

test('a shared subscription starts once, replays the latest sample, and stops after its last consumer', () => {
  let starts = 0;
  let stops = 0;
  let publish;
  const provider = sharedSubscription((emit) => {
    starts++;
    publish = emit;
    return () => { stops++; };
  });
  const a = [];
  const b = [];
  const removeA = provider.subscribe((value) => a.push(value));
  publish(12);
  const removeB = provider.subscribe((value) => b.push(value));
  removeA();
  publish(19);
  assert.deepEqual(a, [12]);
  assert.deepEqual(b, [12, 19]);
  assert.equal(starts, 1);
  assert.equal(stops, 0);
  removeB();
  assert.equal(stops, 1);
});

test('two Media consumers share an in-flight request and retain cached artwork after reopening', async () => {
  const requests = [];
  const replies = [];
  const provider = createMediaProvider({
    getNowPlaying(id) {
      requests.push(id);
      return new Promise((resolve) => replies.push(resolve));
    },
  }, { pollMs: 60_000 });
  const wait = () => new Promise((resolve) => setImmediate(resolve));
  let first;
  let second;
  const removeFirst = provider.subscribe((value) => { first = value; });
  const removeSecond = provider.subscribe((value) => { second = value; });
  try {
    assert.equal(requests.length, 1);
    replies[0]({ status: 'ready', sessionId: 'player', trackId: 't', artwork: 'cached' });
    await wait();
    assert.equal(first.artwork, 'cached');
    assert.equal(second, first);
  } finally {
    removeFirst();
    removeSecond();
  }
  const reopen = provider.subscribe((value) => { second = value; });
  try {
    assert.deepEqual(requests, [undefined, 't']);
    replies[1]({ status: 'ready', sessionId: 'player', trackId: 't' });
    await wait();
    assert.equal(second.artwork, 'cached');
  } finally {
    reopen();
  }
});

test('Spotify widgets use the native Spotify route and share the same read', async () => {
  const spotify = { id: 'spotify', type: 'spotify', settings: { appearance: 'expanded' } };
  assert.deepEqual(normalizeWidgetInstances([spotify], { grid: BAR_GRID }), [
    { ...spotify, layout: { column: 0, row: 0, cols: 2, rows: 1 } },
  ]);
  const calls = [];
  const provider = createMediaProvider({
    getNowPlaying(...args) {
      calls.push(args);
      return { status: 'empty' };
    },
  }, { route: 'spotify', pollMs: 60_000 });
  let first, second;
  const removeFirst = provider.subscribe((value) => { first = value; });
  const removeSecond = provider.subscribe((value) => { second = value; });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, [[undefined, undefined, 'spotify']]);
    assert.equal(first.status, 'empty');
    assert.equal(first, second);
  } finally {
    removeFirst();
    removeSecond();
  }
});

test('media consumers retain the time of the last successful read and refresh on recovery', { timeout: 1500 }, async (t) => {
  const samples = [];
  let time = 1000;
  let reads = 0;
  const provider = createMediaProvider({ getNowPlaying() {
    time += 500;
    reads++;
    return reads === 2 ? { status: 'unavailable' }
      : { status: 'ready', sessionId: 'player', trackId: 't', title: 'Sample' };
  } }, { pollMs: 5, now: () => time });
  let resolve;
  const finished = new Promise((done) => { resolve = done; });
  const stop = provider.subscribe((value) => {
    if (value.status === 'loading') return;
    samples.push([value.status, value.sampledAt]);
    if (samples.length === 3) resolve();
  });
  t.after(stop);
  await finished;
  assert.deepEqual(samples, [['ready', 1500], ['stale', 1500], ['ready', 2500]]);
});
