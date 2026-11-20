// @ts-check
'use strict';

const fs = require('node:fs');
const SYSTEM_BATTERY_STATE = 5;

function batteryWatts(data) {
  const charging = data[2] === 1 && data[3] === 0;
  const discharging = data[2] === 0 && data[3] === 1;
  if (data[1] !== 1 || (!charging && !discharging)) return null;
  const milliwatts = data.readInt32LE(16);
  // A charging/discharging flag must agree with the reported direction.
  if (milliwatts === -0x80000000 || (charging ? milliwatts <= 0 : milliwatts >= 0)) return null;
  return milliwatts / 1000;
}

function decodePowerStatus(data) {
  const flag = data[1];
  const battery = flag === 255 ? null : (flag & 128) === 0;
  const seconds = data.readUInt32LE(4);
  return {
    source: data[0] === 1 ? 'ac' : data[0] === 0 ? 'battery' : 'unknown',
    battery,
    percent: battery !== false && data[2] <= 100 ? data[2] : null,
    charging: battery === true ? Boolean(flag & 8) : null,
    remainingSeconds: battery !== false && seconds !== 0xFFFFFFFF ? seconds : null,
    saver: data[3] === 0 || data[3] === 1 ? data[3] === 1 : null,
  };
}

function createPowerReader(platform = process.platform) {
  if (platform !== 'win32') return () => ({ status: 'unsupported' });
  const koffi = require('koffi');
  const kernel = koffi.load('kernel32.dll');
  const query = kernel.func('int32_t __stdcall GetSystemPowerStatus(void *)');
  const power = koffi.load('powrprof.dll');
  const queryBattery = power.func('int32_t __stdcall CallNtPowerInformation(int, void *, uint32_t, void *, uint32_t)');
  const data = Buffer.alloc(12);
  const battery = Buffer.alloc(32);
  return () => {
    if (!query(data)) return { status: 'unavailable' };
    const state = decodePowerStatus(data);
    const watts = state.battery === true && queryBattery(SYSTEM_BATTERY_STATE, null, 0, battery, battery.length) === 0
      ? batteryWatts(battery) : null;
    return { status: 'ready', ...state, ...(watts === null ? {} : { watts }) };
  };
}

function readUpsSnapshot(file, now) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 4096) return { status: 'invalid' };
    const bytes = Buffer.alloc(4097);
    const length = fs.readSync(fd, bytes);
    if (length > 4096) return { status: 'invalid' };
    const data = JSON.parse(bytes.toString('utf8', 0, length).replace(/^\uFEFF/, ''));
    const sampledAt = typeof data?.sampledAt === 'string' && data.sampledAt.length <= 30 ? Date.parse(data.sampledAt) : NaN;
    if (data?.version !== 1 || !['ac', 'battery', 'unknown'].includes(data.source)
        || !Number.isFinite(sampledAt) || sampledAt > now + 30_000) return { status: 'invalid' };
    const percent = Number.isInteger(data.percent) && data.percent >= 0 && data.percent <= 100 ? data.percent : null;
    const remainingSeconds = Number.isInteger(data.remainingSeconds) && data.remainingSeconds >= 0
      && data.remainingSeconds <= 604_800 ? data.remainingSeconds : null;
    const watts = Number.isFinite(data.watts) && data.watts >= 0 && data.watts <= 1_000_000 ? data.watts : null;
    return { status: now - sampledAt > 120_000 ? 'stale' : 'ready', source: data.source, percent, remainingSeconds, sampledAt,
      ...(watts === null ? {} : { watts }) };
  } catch (error) {
    return { status: error.code === 'ENOENT' ? 'disabled' : 'invalid' };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

class PowerStatus {
  constructor({ readSystem, upsFile, now = Date.now }) {
    this.readSystem = readSystem;
    this.upsFile = upsFile;
    this.now = now;
    this.transitions = [];
  }

  observe(source, at = this.now()) {
    if (source !== 'ac' && source !== 'battery' || this.source === source) return;
    if (this.source) {
      this.transitions.unshift({ at, source });
      if (this.transitions.length > 5) this.transitions.pop();
    }
    this.source = source;
  }

  snapshot() {
    const now = this.now();
    let system;
    try { system = this.readSystem(); } catch { system = { status: 'unavailable' }; }
    if (system.status === 'ready') this.observe(system.source, now);
    return { system, ups: this.upsFile ? readUpsSnapshot(this.upsFile, now) : { status: 'disabled' }, transitions: [...this.transitions] };
  }
}

module.exports = { PowerStatus, createPowerReader, decodePowerStatus, batteryWatts, readUpsSnapshot };
