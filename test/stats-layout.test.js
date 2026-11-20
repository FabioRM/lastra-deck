'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { statsPage, statsScales, powerPairs } = require('../src/renderer/stats-layout');

test('Stats paginates all readings and distinguishes identical device models', () => {
  const rows = Array.from({ length: 25 }, (_, id) => ({
    id, group: 'gpu', device: 'GPU model', deviceId: id < 18 ? 'gpu1' : 'gpu2',
  }));
  const first = statsPage(rows, 'gpu', undefined, 0);
  assert.deepEqual(first.devices, [{ id: 'gpu1', name: 'GPU model' }, { id: 'gpu2', name: 'GPU model' }]);
  assert.equal(first.pageCount, 3);
  const visited = [0, 1, 2].flatMap((page) => statsPage(rows, 'gpu', 'gpu1', page).items);
  assert.deepEqual(visited, rows.slice(0, 18));
  const other = statsPage(rows, 'gpu', 'gpu2', 2);
  assert.equal(other.page, 0);
  assert.deepEqual(other.items, rows.slice(18));
});

test('Stats uses a shared scale for comparable charts across devices', () => {
  const items = [
    { group: 'gpu', unit: '°C', value: 45, points: [[0, 82]] },
    { group: 'gpu', unit: '°C', value: 71, points: [[0, 91]] },
    { group: 'gpu', unit: '%', value: 10, points: [] },
  ];
  const scales = statsScales(items);
  assert.deepEqual(scales.get('gpu:°C'), { low: 0, high: 95 });
  assert.deepEqual(scales.get('gpu:%'), { low: 0, high: 100 });
});

test('combined power graphs preserve separately scaled readings and match only component pairs', () => {
  const load = { id: 'power:gpu', group: 'power', unit: '%', value: 80, points: [[0, 80]] };
  const watts = { id: 'gpuPower', group: 'power', unit: 'W', value: 156, points: [[0, 156]] };
  assert.deepEqual(powerPairs([{ id: 'cpuPower', group: 'power' }, load, watts]), [{ load, watts }]);
  const scales = statsScales([load, watts]);
  assert.deepEqual(scales.get('power:%'), { low: 0, high: 100 });
  assert.deepEqual(scales.get('power:W'), { low: 0, high: 200 });
});
