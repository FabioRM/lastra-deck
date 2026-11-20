// @ts-check
'use strict';

const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { promisify } = require('node:util');
const { sharedPowerShell } = require('./powershell-worker');

const run = promisify(execFile);
const VOLUME_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$activity = @{}
Get-CimInstance Win32_PerfFormattedData_PerfDisk_LogicalDisk | ForEach-Object { $activity[$_.Name] = $_ }
$volumes = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {
    $perf = $activity[$_.DeviceID]
    [PSCustomObject]@{
        id = $_.DeviceID
        capacity = $_.Size
        free = $_.FreeSpace
        busy = if ($null -ne $perf.PercentIdleTime) { 100 - $perf.PercentIdleTime } else { $null }
        read = $perf.DiskReadBytesPersec
        write = $perf.DiskWriteBytesPersec
    }
})
$memorySpeeds = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object { $_.ConfiguredClockSpeed } |
    Where-Object { $_ -gt 0 } | Sort-Object -Unique)
$cpuClock = (Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation -Filter "Name='_Total'").ProcessorFrequency
[PSCustomObject]@{ volumes = $volumes; memorySpeeds = $memorySpeeds; cpuClock = $cpuClock } |
    ConvertTo-Json -Depth 4 -Compress
`;
const STORAGE_SCRIPT = String.raw`
try {
    $namespace = 'root/Microsoft/Windows/Storage'
    $disks = @(Get-CimInstance -Namespace $namespace -ClassName MSFT_Disk -Property Number,Model,FriendlyName,BusType,PartitionStyle -ErrorAction Stop |
        Select-Object -First 65 | ForEach-Object {
            [PSCustomObject]@{ number = $_.Number; model = $_.Model; name = $_.FriendlyName; bus = $_.BusType; style = $_.PartitionStyle }
        })
    $partitions = @(Get-CimInstance -Namespace $namespace -ClassName MSFT_Partition -Property DiskNumber,DriveLetter,GptType,MbrType -ErrorAction Stop |
        Where-Object DriveLetter -Match '^[a-z]$' | Select-Object -First 65 | ForEach-Object {
            [PSCustomObject]@{ letter = [string]$_.DriveLetter; disk = $_.DiskNumber; gpt = $_.GptType; mbr = $_.MbrType }
        })
    if ($disks.Count -gt 64 -or $partitions.Count -gt 64) { '{}' }
    else { [PSCustomObject]@{ disks = $disks; partitions = $partitions } | ConvertTo-Json -Depth 4 -Compress }
} catch {
    '{}'
}
`;

function collectWindowsData(script, signal, timeout = 6_000) {
  if (process.platform !== 'win32') return null;
  return sharedPowerShell().run(script, { signal, timeout, maxBuffer: 65_536 }).then((stdout) => JSON.parse(stdout));
}

/** @typedef {{ signal?: AbortSignal }} CollectOptions */

/** @param {CollectOptions} [options] */
function collectWindows({ signal } = {}) { return collectWindowsData(VOLUME_SCRIPT, signal); }
/** @param {CollectOptions} [options] */
function collectStorageMapping({ signal } = {}) { return collectWindowsData(STORAGE_SCRIPT, signal, 4000); }

// PresentMon quotes CSV fields containing separators or quotes.
function csvRow(line) {
  const fields = [];
  for (const match of line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)) {
    const field = match[1];
    fields.push(field.startsWith('"') ? field.slice(1, -1).replaceAll('""', '"') : field.trim());
  }
  return fields;
}

function parseFrames(csv, pid) {
  let header;
  const chains = new Map();
  for (const line of csv.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const fields = csvRow(line);
    if (fields[0] === 'Application') {
      header = {
        pid: fields.indexOf('ProcessID'),
        chain: fields.indexOf('SwapChainAddress'),
        time: fields.indexOf('MsBetweenPresents'),
      };
      continue;
    }
    if (!header || Number(fields[header.pid]) !== pid) continue;
    const ms = Number(fields[header.time]);
    if (!Number.isFinite(ms) || ms <= 0) continue;
    const chain = fields[header.chain];
    if (!chains.has(chain)) chains.set(chain, []);
    chains.get(chain).push(ms);
  }
  const frames = [...chains.values()].sort((a, b) => b.length - a.length)[0];
  if (!frames || frames.length < 2) return null;
  const ms = frames.reduce((sum, time) => sum + time, 0) / frames.length;
  const sorted = [...frames].sort((a, b) => a - b);
  return { fps: 1000 / ms, ms, p95: sorted[Math.ceil(sorted.length * 0.95) - 1], minFps: 1000 / sorted.at(-1) };
}

function presentMonPath(setting = process.env.LASTRA_PRESENTMON_EXE) {
  if (process.platform !== 'win32' || typeof setting !== 'string' || !path.isAbsolute(setting)
      || path.extname(setting).toLowerCase() !== '.exe') return null;
  return setting;
}

/**
 * @param {string} executable
 * @param {number} pid
 * @param {CollectOptions} [options]
 */
function collectFrames(executable, pid, { signal } = {}) {
  const session = `Lastra-${process.pid}-${randomUUID()}`;
  const args = ['--process_id', String(pid), '--timed', '3', '--terminate_after_timed', '--output_stdout',
    '--no_console_stats', '--no_track_input', '--v1_metrics', '--session_name', session];
  // Allow a running session to end on its own when changing views so ETW can clean it up.
  if (signal?.aborted) return null;
  return run(executable, args, { timeout: 9_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024, cwd: os.tmpdir() })
    .then(({ stdout }) => parseFrames(stdout, pid));
}

module.exports = { collectWindows, collectStorageMapping, collectFrames, parseFrames, presentMonPath };
