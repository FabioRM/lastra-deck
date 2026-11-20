// @ts-check
'use strict';

const { loadWin32, fn } = require('./win32');

const XENEON_EDGE = /^\\\\\?\\DISPLAY#CRXED00#[^#]+#/i;

function createBacklightDriver() {
  if (process.platform !== 'win32') return null;
  const { koffi, types } = loadWin32();
  const { MONITORINFOEXW: info, DISPLAY_DEVICEW: device, PHYSICAL_MONITOR: physical } = types;
  const monitorFromWindow = fn('MonitorFromWindow');
  const getMonitor = fn('GetMonitorInfoW');
  const getDevice = fn('EnumDisplayDevicesW');
  const physicalCount = fn('GetNumberOfPhysicalMonitorsFromHMONITOR');
  const openPhysical = fn('GetPhysicalMonitorsFromHMONITOR');
  const closePhysical = fn('DestroyPhysicalMonitor');
  const readBrightness = fn('GetMonitorBrightness');
  const writeBrightness = fn('SetMonitorBrightness');

  function identify(window) {
    const monitor = monitorFromWindow(window, 0);
    if (!monitor) return null;
    const native = [{ size: koffi.sizeof(info) }];
    if (!getMonitor(monitor, native)) return null;
    const first = [{ size: koffi.sizeof(device) }];
    const second = [{ size: koffi.sizeof(device) }];
    if (!getDevice(native[0].name, 0, first, 1) || getDevice(native[0].name, 1, second, 1)) return null;
    const { id } = first[0];
    return XENEON_EDGE.test(id) ? { monitor, identity: id.toLowerCase() } : null;
  }

  async function withMonitor(target, action) {
    const count = [0];
    if (!physicalCount(target.monitor, count) || count[0] !== 1) return null;
    const entry = Buffer.alloc(koffi.sizeof(physical));
    if (!openPhysical(target.monitor, 1, entry)) return null;
    const { handle } = koffi.decode(entry, physical);
    // This driver can report an opaque handle with value zero on success.
    try {
      return await action({
        read: () => new Promise((resolve, reject) => {
          const minimum = [0], current = [0], maximum = [0];
          readBrightness.async(handle, minimum, current, maximum, (error, ok) => {
            if (error) reject(error);
            else resolve(ok ? { minimum: minimum[0], current: current[0], maximum: maximum[0] } : null);
          });
        }),
        write: (value) => new Promise((resolve, reject) => {
          writeBrightness.async(handle, value, (error, ok) => {
            if (error) reject(error);
            else resolve(Boolean(ok));
          });
        }),
      });
    } finally {
      closePhysical(handle);
    }
  }

  return { identify, withMonitor };
}

module.exports = { createBacklightDriver };
