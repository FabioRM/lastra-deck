// @ts-check
'use strict';

const STORAGE_SENSOR = /^lhm:\/(hdd|ssd|nvme)\/(0|[1-9]\d{0,3})\/temperature\/0$/i;
const BASIC_GPT = 'ebd0a0a2-b9e5-4433-87c0-68b6b72699c7';
const BASIC_MBR = new Set([0x06, 0x07, 0x0b, 0x0c, 0x0e]);
// MSFT_Disk bus types for SCSI, ATA, USB, SAS, SATA, SD, MMC and NVMe.
const DIRECT_BUSES = new Set([1, 3, 7, 10, 11, 12, 13, 17]);
const PRIMARY_NAMES = new Set(['temperature', 'composite temperature']);

function primaryTemperature(id, name, value) {
  return typeof id === 'string' && STORAGE_SENSOR.test(id) && typeof name === 'string'
    && PRIMARY_NAMES.has(name.trim().toLowerCase()) && Number.isFinite(value) && value !== 0;
}

function hasVerifiedStorageSensors(sample, hardware) {
  return sample?.hardwareSource === 'managed' && sample.storageNumbersVerified === true
    && Array.isArray(hardware) && hardware.some((sensor) => sensor && primaryTemperature('lhm:' + sensor.id, sensor.name, sensor.value));
}

function directDisk(partition, disk) {
  if (!disk || !DIRECT_BUSES.has(disk.bus)) return false;
  if (disk.style === 1) return BASIC_MBR.has(partition.mbr);
  return disk.style === 2 && typeof partition.gpt === 'string'
    && partition.gpt.replace(/^\{|\}$/g, '').toLowerCase() === BASIC_GPT;
}

function model(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

function volumeTemperature(letter, mapping, entries) {
  if (typeof letter !== 'string' || !/^[a-z]:$/i.test(letter) || !Array.isArray(mapping?.partitions) || !Array.isArray(mapping.disks)) return null;
  const partitions = mapping.partitions.filter((part) => typeof part?.letter === 'string' && part.letter.toUpperCase() === letter[0].toUpperCase());
  if (partitions.length !== 1) return null;
  const [partition] = partitions;
  if (!Number.isSafeInteger(partition.disk) || partition.disk < 0) return null;
  const disks = mapping.disks.filter((disk) => disk?.number === partition.disk);
  if (disks.length !== 1 || !directDisk(partition, disks[0])) return null;
  const matches = entries.filter((item) => item?.group === 'storage' && item.unit === '°C'
    && primaryTemperature(item.id, item.name, item.value) && Number(STORAGE_SENSOR.exec(item.id)[2]) === partition.disk);
  if (matches.length !== 1) return null;
  const [observed] = matches;
  const driveModel = model(observed.device);
  return driveModel && [disks[0].model, disks[0].name].some((label) => model(label) === driveModel) ? observed : null;
}

module.exports = { hasVerifiedStorageSensors, volumeTemperature };
