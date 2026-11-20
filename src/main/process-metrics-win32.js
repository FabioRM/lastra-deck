// @ts-check
'use strict';

const { loadWin32, fn, withQueryableProcess } = require('./win32');

function createProcessReader(platform = process.platform) {
  if (platform !== 'win32') return () => null;
  const { koffi } = loadWin32();
  const getTimes = fn('GetProcessTimes');
  const getMemory = fn('K32GetProcessMemoryInfo');
  const times = Array.from({ length: 4 }, () => Buffer.alloc(8));
  // PROCESS_MEMORY_COUNTERS has two DWORDs followed by eight SIZE_T fields.
  const word = koffi.sizeof('size_t');
  const workingSetOffset = 8 + word;
  const memory = Buffer.alloc(8 + 8 * word);
  memory.writeUInt32LE(memory.length);

  return (pid) => {
    if (!Number.isInteger(pid) || pid <= 0 || pid > 0xFFFFFFFF) return null;
    return withQueryableProcess(pid, (handle) => {
      const readTimes = getTimes(handle, ...times);
      const readMemory = getMemory(handle, memory, memory.length);
      if (!readTimes && !readMemory) return null;
      const workingSet = !readMemory ? null
        : word === 8 ? Number(memory.readBigUInt64LE(workingSetOffset)) : memory.readUInt32LE(workingSetOffset);
      return {
        started: readTimes ? times[0].readBigUInt64LE() : null,
        cpuSeconds: readTimes ? Number(times[2].readBigUInt64LE() + times[3].readBigUInt64LE()) / 10_000_000 : null,
        workingSetKiB: workingSet === null ? null : workingSet / 1024,
      };
    });
  };
}

module.exports = { createProcessReader };
