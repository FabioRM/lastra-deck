// @ts-check
'use strict';

const { sharedPowerShell } = require('./powershell-worker');

const PROCESSES = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$processes = @(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter 'IDProcess > 0' -Property Name,IDProcess,PercentProcessorTime,WorkingSetPrivate,ElapsedTime |
  Select-Object -First 4096 | ForEach-Object {
    [PSCustomObject]@{ pid = $_.IDProcess; name = $_.Name; cpu = $_.PercentProcessorTime
      memory = $_.WorkingSetPrivate; age = $_.ElapsedTime }
  })
$gpu = $null
`;
const GPU = String.raw`
try {
  $gpu = @(Get-CimInstance Win32_PerfRawData_GPUPerformanceCounters_GPUEngine -Property Name,UtilizationPercentage,Timestamp_Sys100NS |
    Select-Object -First 4096 | ForEach-Object {
      [PSCustomObject]@{ instance = $_.Name; active = [string]$_.UtilizationPercentage; at = [string]$_.Timestamp_Sys100NS }
    })
} catch {}
`;
const OUTPUT = '[PSCustomObject]@{ processes = $processes; gpu = $gpu } | ConvertTo-Json -Depth 4 -Compress';

/** @param {{ gpu?: boolean, signal?: AbortSignal }} [options] */
async function readProcessTelemetry({ gpu, signal } = {}) {
  if (process.platform !== 'win32') return null;
  const stdout = await sharedPowerShell().run(PROCESSES + (gpu ? GPU : '') + OUTPUT, {
    signal, timeout: 6_000, maxBuffer: 2 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

module.exports = { readProcessTelemetry };
