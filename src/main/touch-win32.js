// @ts-check
'use strict';

const { loadWin32, fn } = require('./win32');

const TOUCH_POINTER = 3;
let readWin32Devices;

function createTouchReader() {
  const { koffi, types } = loadWin32();
  const { POINTER_DEVICE_INFO: POINTER, MONITORINFOEXW: MONITOR } = types;
  const getDevices = fn('GetPointerDevices');
  const getRects = fn('GetPointerDeviceRects');
  const getMonitor = fn('GetMonitorInfoW');

  return () => {
    const count = [0];
    if (!getDevices(count, null)) throw new Error('Could not read Windows pointer devices');
    if (count[0] === 0) return [];

    // Windows can add a device between the two calls.
    for (let attempt = 0; attempt < 2; attempt++) {
      const deviceData = Buffer.alloc(count[0] * koffi.sizeof(POINTER));
      if (!getDevices(count, deviceData)) continue;
      return koffi.decode(deviceData, POINTER, count[0])
        .filter(({ type }) => type === TOUCH_POINTER)
        .map(({ device, monitor, product, maxActiveContacts }) => {
          const monitorInfo = [{ size: koffi.sizeof(MONITOR) }];
          const hasMonitor = monitor && getMonitor(monitor, monitorInfo);
          const rect = [null];
          const hasRect = getRects(device, [null], rect);
          return {
            name: product || 'Touchscreen',
            contacts: maxActiveContacts,
            monitorName: hasMonitor ? monitorInfo[0].name : null,
            monitorBounds: hasMonitor ? toBounds(monitorInfo[0].bounds) : null,
            mappedBounds: hasRect ? toBounds(rect[0]) : null,
          };
        });
    }
    throw new Error('The touchscreen list changed while reading it');
  };
}

function toBounds({ left, top, right, bottom }) {
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function readTouchDevices() {
  if (process.platform !== 'win32') return [];
  readWin32Devices ??= createTouchReader();
  return readWin32Devices();
}

module.exports = { readTouchDevices };
