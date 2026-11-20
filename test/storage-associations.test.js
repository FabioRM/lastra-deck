'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { StatsMonitor, hardwareReadings } = require('../src/main/stats');
const { hasVerifiedStorageSensors, volumeTemperature } = require('../src/main/storage-associations');

const BASIC = '{EBD0A0A2-B9E5-4433-87C0-68B6B72699C7}';
const SAMPLE_TIME = 1_800_000_000_000;
const volume = (id) => ({ id, capacity: 512 * 2 ** 30, free: 128 * 2 ** 30, busy: 17, read: 15 * 2 ** 20, write: 4 * 2 ** 20 });
const managed = { cpu: .4, ram: .6, sampledAt: SAMPLE_TIME, hardwareAt: SAMPLE_TIME, hardwareSource: 'managed',
  hardwareStaleMs: 6_000, storageNumbersVerified: true };
const drive = { id: '/nvme/2/temperature/0', name: 'Composite Temperature', device: 'Fixture NVMe SSD', kind: 'Storage', type: 'Temperature', value: 39 };
const primary = hardwareReadings(managed, [drive]).entries[0];

function simpleMapping() {
  return {
    disks: [{ number: 2, bus: 17, style: 2, model: 'fixture  nvme SSD', name: 'Example drive' }],
    partitions: [{ letter: 'C', disk: 2, gpt: BASIC }, { letter: 'D', disk: 2, gpt: BASIC }],
  };
}

test('verified Windows drive numbers carry the same physical temperature to separate basic volumes', () => {
  const mapping = simpleMapping();
  assert.equal(volumeTemperature('c:', mapping, [primary]), primary);
  assert.equal(volumeTemperature('D:', mapping, [primary]), primary);
  assert.equal(volumeTemperature('E:', mapping, [primary]), null);
  const legacy = { disks: [{ ...mapping.disks[0], style: 1, bus: 11 }], partitions: [{ letter: 'C', disk: 2, mbr: 0x07 }] };
  assert.equal(volumeTemperature('C:', legacy, [primary]), primary);
  legacy.partitions[0].mbr = 0x42;
  assert.equal(volumeTemperature('C:', legacy, [primary]), null);
});

test('ambiguous, distributed or mismatched drive mappings cannot supply a volume temperature', () => {
  const make = simpleMapping;
  const mutations = [
    (data) => { data.partitions[0].gpt = '{AF9B60A0-1431-4F62-BC68-3311714A69AD}'; },
    (data) => { data.disks[0].bus = 16; },
    (data) => { data.disks[0].bus = 8; },
    (data) => { data.disks[0].model = 'other physical drive'; },
    (data) => { data.partitions.push({ ...data.partitions[0], disk: 1 }); },
    (data) => { data.disks.push({ ...data.disks[0] }); },
    (data) => { data.disks[0].number = 1; },
  ];
  for (const mutate of mutations) {
    const data = make();
    mutate(data);
    assert.equal(volumeTemperature('C:', data, [primary]), null);
  }
  assert.equal(volumeTemperature('C:', make(), [primary, { ...primary, id: 'lhm:/ssd/2/temperature/0' }]), null);
  assert.equal(volumeTemperature('C:', make(), [{ ...primary, id: 'lhm:/nvme/2/temperature/1' }]), null);
  assert.equal(volumeTemperature('C:', make(), [{ ...primary, value: 0 }]), null);
  assert.equal(hasVerifiedStorageSensors({ ...managed, hardwareSource: 'http' }, [drive]), false);
  assert.equal(hasVerifiedStorageSensors({ ...managed, storageNumbersVerified: false }, [drive]), false);
  assert.equal(hasVerifiedStorageSensors(managed, [{ ...drive, value: 0 }]), false);
  assert.equal(hasVerifiedStorageSensors(managed, [drive]), true);
});

test('Stats retains the standalone physical sensor and fails closed when a volume association is unavailable', async () => {
  let now = SAMPLE_TIME;
  let reads = 0;
  let sample = { ...managed, storageNumbersVerified: false };
  const monitor = new StatsMonitor({
    sample: () => ({ sample, hardware: [drive] }), display: () => ({}), foreground: () => null, framesExecutable: null,
    now: () => now, readWindows: async () => ({ volumes: [volume('C:'), volume('D:')] }),
    readStorage: async () => { reads++; return simpleMapping(); },
  });
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  monitor.snapshot();
  await tick();
  const match = (item) => monitor.snapshot({ refresh: false }).readings.find(({ id }) => id === item);
  const temp = 'volume:C::temperature';
  assert.equal(reads, 0);
  assert.equal(match(temp).status, 'unavailable');
  assert.equal(match(primary.id).value, 39);
  sample.storageNumbersVerified = true;
  assert.equal(match(temp).status, 'unavailable');
  assert.equal(reads, 0, 'cached read alone never fetches physical identity');
  monitor.snapshot();
  await tick();
  assert.equal(reads, 1);
  assert.equal(match(temp).value, 39);
  assert.equal(match(temp).at, SAMPLE_TIME);
  assert.deepEqual(match(temp).points, [[SAMPLE_TIME, 39]]);
  const detail = monitor.snapshot({ refresh: false }).readings.filter(({ device }) => device === 'C:');
  assert.deepEqual(detail.map(({ name }) => name), ['Disk active time', 'Volume capacity', 'Free space', 'Read rate', 'Write rate', 'Drive temperature']);
  assert.equal(match('volume:D::temperature').value, 39);
  now += 8_000;
  assert.equal(match(temp).status, 'stale', 'temperature keeps its own sample age');
  now += 8_000;
  assert.equal(match(temp).status, 'unavailable', 'disk mapping expires');
  assert.deepEqual(match(temp).points, [], 'a missing association does not show another drive chart');
  now = SAMPLE_TIME + 500;
  sample = { ...sample, hardwareSource: 'http' };
  assert.equal(match(temp).status, 'unavailable');
  assert.equal(match(primary.id).value, 39);
  monitor.stop();
});
