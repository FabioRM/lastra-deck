// @ts-check
'use strict';

const os = require('node:os');
const { TelemetryHistory } = require('../renderer/telemetry-history');
const { collectWindows, collectStorageMapping, collectFrames, presentMonPath } = require('./stats-windows');
const { hasVerifiedStorageSensors, volumeTemperature } = require('./storage-associations');

const GROUPS = {
  cpu: 'Processor', gpu: 'Graphics', memory: 'Memory', display: 'Displays',
  frames: 'App performance', storage: 'Storage', cooling: 'Cooling', power: 'Power',
};
const SYSTEM = 'Windows';
const SECOND = 1_000;
const WINDOW = 60 * SECOND;
const STORAGE_INTERVAL = 12 * SECOND;
const STORAGE_AGE = 15 * SECOND;
const GIB = 1024 ** 3;
const MIB = 1024 ** 2;
const LHM_TYPES = {
  clock: 'MHz', power: 'W', temperature: '°C', load: '%', fan: 'RPM',
  data: 'GiB', smalldata: 'MiB', throughput: 'MiB/s', timing: 'ns',
};

function reading(group, id, name, unit, value, source, at, maxAge, device = '', deviceId = '') {
  return { group, id, name, unit, value: Number.isFinite(value) ? value : null, source, at, maxAge, device, deviceId };
}

function hardwareGroup(kind, type, name) {
  if (type === 'fan') return 'cooling';
  if (/^(gpu|gpu-)/i.test(kind)) return 'gpu';
  if (/cpu$/i.test(kind)) return ['temperature', 'power', 'clock', 'load'].includes(type) ? 'cpu' : null;
  if (/^(memory|ram|spd)/i.test(kind) || type === 'timing') return 'memory';
  if (/^(storage|hdd|nvme|ssd)/i.test(kind)) {
    return type !== 'load' || /activity|read|write|busy/i.test(name) ? 'storage' : null;
  }
  return null;
}

function hardwareReadings(sample, raw) {
  const age = sample.hardwareStaleMs ?? 6 * SECOND;
  const source = sample.hardwareSource === 'http' ? 'LibreHardwareMonitor HTTP'
    : sample.hardwareSource === 'preview' ? 'Sample data' : 'LibreHardwareMonitor';
  const entries = (Array.isArray(raw) ? raw : []).slice(0, 256).flatMap((sensor) => {
    if (!sensor || typeof sensor.id !== 'string' || !/^\/[a-z0-9/_-]{1,180}$/i.test(sensor.id)
        || typeof sensor.name !== 'string' || typeof sensor.kind !== 'string' || typeof sensor.type !== 'string') return [];
    const type = sensor.type.toLowerCase();
    const unit = LHM_TYPES[type];
    const group = hardwareGroup(sensor.kind, type, sensor.name);
    if (!group || typeof unit !== 'string') return [];
    if (group === 'cpu' && type === 'load' && /^CPU Total$/i.test(sensor.name)) return [];
    if (group === 'memory' && /^(Memory|Memory Used)$/i.test(sensor.name)) return [];
    const value = type === 'throughput' && Number.isFinite(sensor.value) ? sensor.value / MIB : sensor.value;
    const deviceId = sensor.id.split('/').slice(0, -2).join('/');
    return [reading(group, 'lhm:' + sensor.id, sensor.name.slice(0, 96), unit, value,
      source, sample.hardwareAt, age, String(sensor.device ?? '').slice(0, 96), deviceId)];
  });
  return { entries, source, age };
}

function selectReadings(readings, category, pattern, unit) {
  return readings.find(({ group, name, unit: readingUnit, value }) =>
    group === category && readingUnit === unit && value !== null && pattern.test(name));
}

function componentPower(entries, group, deviceId) {
  const supported = group === 'cpu' ? /^((cpu )?package( power)?( \(smu\))?|cpu total)$/i
    : /^gpu (power|package( power)?|total power|total board power|board power)$/i;
  const matches = entries.filter((entry) => entry.group === group && entry.unit === 'W' && entry.value >= 0
    && entry.value !== null && supported.test(entry.name) && (!deviceId || entry.deviceId === deviceId));
  if (new Set(matches.map((entry) => entry.deviceId)).size !== 1) return null;
  return matches.find((entry) => /board/i.test(entry.name)) ?? matches.find((entry) => /package/i.test(entry.name)) ?? matches[0];
}

class StatsMonitor {
  constructor({ sample, display, foreground, readWindows = collectWindows, readStorage = collectStorageMapping, readFrames = collectFrames,
    framesExecutable = presentMonPath(), now = Date.now, onSample, retained }) {
    this.sample = sample;
    this.display = display;
    this.foreground = foreground;
    this.readWindows = readWindows;
    this.readStorage = readStorage;
    this.readFrames = readFrames;
    this.framesExecutable = framesExecutable;
    this.now = now;
    this.onSample = onSample;
    this.retained = retained;
    this.history = new TelemetryHistory(Object.create(null));
    this.windows = { next: 0 };
    this.storage = { next: 0 };
    this.frames = { next: 0 };
    this.controller = null;
  }

  start() {
    this.controller ??= new AbortController();
  }

  stop() {
    this.controller?.abort();
    this.controller = null;
    this.windows.next = this.storage.next = this.frames.next = 0;
  }

  refresh(provider, interval, read) {
    if (provider.pending || this.now() < provider.next) return;
    const signal = this.controller.signal;
    provider.next = this.now() + interval;
    provider.pending = Promise.resolve().then(() => signal.aborted ? null : read(signal)).then((data) => {
      if (!signal.aborted && data) provider.latest = { data, at: this.now() };
    }).catch(() => {
      // Keep the last successful sample available until its stale deadline.
    }).finally(() => { provider.pending = null; });
  }

  refreshHardwareSources() {
    this.start();
    this.refresh(this.windows, 5 * SECOND, (signal) => {
      this.onSample?.('windowsStats');
      return this.readWindows({ signal });
    });
    const { sample, hardware } = this.sample() ?? {};
    if (hasVerifiedStorageSensors(sample, hardware)) {
      this.refresh(this.storage, STORAGE_INTERVAL, (signal) => {
        this.onSample?.('windowsStats');
        return this.readStorage({ signal });
      });
    }
  }

  async settingsSnapshot() {
    this.refreshHardwareSources();
    await Promise.allSettled([this.windows.pending, this.storage.pending]);
    return this.snapshot({ refresh: false });
  }

  refreshSources() {
    this.refreshHardwareSources();
    const app = this.foreground();
    const target = this.framesExecutable && !app?.shell && Number.isInteger(app?.pid) && app.pid > 0 ? app : null;
    if (this.frames.target !== target?.id) {
      this.frames.target = target?.id;
      this.frames.latest = null;
      this.frames.error = '';
      this.frames.next = 0;
      for (const id of ['fps', 'frameMs', 'frame95', 'fpsMin']) delete this.history.series[id];
    }
    if (target) this.refresh(this.frames, 5 * SECOND, async (signal) => {
      const current = () => !signal.aborted && this.frames.target === target.id && this.foreground()?.id === target.id;
      try {
        this.onSample?.('frames');
        const data = await this.readFrames(this.framesExecutable, target.pid, { signal });
        if (!current()) return null;
        this.frames.error = '';
        return data;
      } catch (error) {
        if (current()) {
          this.frames.error = /access denied/i.test(error.stderr ?? '') ? 'Windows denied access to frame capture. PresentMon requires the Performance Log Users group or elevation.'
            : 'PresentMon could not capture frames. Check the configured executable and its permissions.';
        }
        return null;
      }
    });
    return target;
  }

  /** @param {{ refresh?: boolean, range?: number }} [options] `range` is a retained-history window in ms. */
  snapshot({ refresh = true, range } = {}) {
    const target = refresh ? this.refreshSources() : null;
    const now = this.now();
    const { sample = {}, hardware, history = {} } = this.sample() ?? {};
    const { entries, source, age } = hardwareReadings(sample, hardware);
    const { at: windowsAt, data: windows } = this.windows.latest ?? {};
    const { at: storageAt, data: storageMapping } = this.storage.latest ?? {};
    const { at: frameAt, data: frames } = this.frames.latest ?? {};
    const totalRam = os.totalmem() / GIB;
    const windowsAge = 15 * SECOND;
    const storage = hasVerifiedStorageSensors(sample, hardware) && now - windowsAt < windowsAge
      && now - storageAt < STORAGE_AGE ? storageMapping : null;
    const frameAge = 12 * SECOND;
    const cpuTemp = selectReadings(entries, 'cpu', /package|tctl|tdie|core max/i, '°C');
    const gpuEntries = sample.gpuDevice ? entries.filter(({ deviceId }) => deviceId === sample.gpuDevice) : entries;
    const gpuLoad = selectReadings(gpuEntries, 'gpu', /^GPU Core$/i, '%')
      ?? selectReadings(gpuEntries, 'gpu', /^GPU D3D 3D$/i, '%');
    const gpuTemp = selectReadings(entries, 'gpu', /^(GPU Core|GPU Temperature)$/i, '°C');
    const overview = {
      cpu: reading('cpu', 'cpu', 'CPU load', '%', Number.isFinite(sample.cpu) ? sample.cpu * 100 : null,
        SYSTEM, sample.sampledAt, 3 * SECOND),
      gpu: reading('gpu', 'gpu', 'GPU load', '%', sample.gpu == null ? null : sample.gpu * 100,
        source, sample.hardwareAt, age, gpuLoad?.device),
      memory: reading('memory', 'ram', 'RAM use', '%', Number.isFinite(sample.ram) ? sample.ram * 100 : null,
        SYSTEM, sample.sampledAt, 3 * SECOND),
      display: reading('display', 'refresh', 'Display refresh rate', 'Hz', null, SYSTEM, now, 3 * SECOND),
      frames: reading('frames', 'fps', 'Present rate', 'FPS', frames?.fps, 'PresentMon', frameAt, frameAge, target?.name),
      storage: reading('storage', 'volume-info', 'Volume capacity', 'GiB', null, SYSTEM, windowsAt, windowsAge),
      cooling: reading('cooling', 'cpuTemp', 'CPU temperature', '°C', sample.cpuTemp,
        source, sample.hardwareAt, age, cpuTemp?.device),
    };
    const items = [
      overview.cpu, overview.memory, overview.frames,
      reading('memory', 'ramUsed', 'RAM used', 'GiB', Number.isFinite(sample.ram) ? sample.ram * totalRam : null,
        SYSTEM, sample.sampledAt, 3 * SECOND),
      reading('memory', 'ramTotal', 'RAM capacity', 'GiB', totalRam, SYSTEM, now, 3 * SECOND),
      reading('frames', 'frameMs', 'Mean frame time', 'ms', frames?.ms, 'PresentMon', frameAt, frameAge, target?.name),
      reading('frames', 'frame95', '95th percentile frame time', 'ms', frames?.p95, 'PresentMon', frameAt, frameAge, target?.name),
      reading('frames', 'fpsMin', 'Slowest frame rate', 'FPS', frames?.minFps, 'PresentMon', frameAt, frameAge, target?.name),
    ];
    if (!gpuLoad) items.push(overview.gpu);
    if (!cpuTemp) items.push(reading('cpu', 'cpuTemp', 'CPU temperature', '°C', sample.cpuTemp, source, sample.hardwareAt, age));
    if (!gpuTemp) items.push(reading('gpu', 'gpuTemp', 'GPU temperature', '°C', sample.gpuTemp, source, sample.hardwareAt, age));
    const speeds = windows?.memorySpeeds?.filter((speed) => Number.isFinite(speed) && speed > 0);
    for (const speed of speeds?.length ? speeds : [null]) {
      items.push(reading('memory', 'memorySpeed:' + speed, 'Configured memory speed', 'MT/s', speed, SYSTEM, windowsAt, windowsAge));
    }
    const { displays = [], selected } = this.display();
    for (const display of displays) {
      const value = display.displayFrequency > 1 ? display.displayFrequency : null;
      const item = reading('display', 'display:' + display.id, 'Refresh rate', 'Hz', value, SYSTEM, now,
        3 * SECOND, display.label || 'Display', String(display.id));
      items.push(item);
      if (display.id === selected || overview.display.value === null) overview.display = item;
    }
    const linkedSeries = new Map();
    for (const volume of windows?.volumes ?? []) {
      if (!/^[a-z]:$/i.test(volume?.id) || !Number.isFinite(volume.capacity) || volume.capacity <= 0) continue;
      const row = (id, label, unit, value) => reading('storage', `volume:${volume.id}:${id}`, label, unit,
        value, SYSTEM, windowsAt, windowsAge, volume.id);
      const activity = row('busy', 'Disk active time', '%', Number.isFinite(volume.busy) ? Math.max(0, Math.min(100, volume.busy)) : null);
      const capacity = row('capacity', 'Volume capacity', 'GiB', volume.capacity / GIB);
      const sensor = volumeTemperature(volume.id, storage, entries);
      const temperature = reading('storage', `volume:${volume.id}:temperature`, 'Drive temperature', '°C',
        sensor?.value, sensor?.source ?? 'Drive sensor', sensor?.at, sensor?.maxAge ?? age, volume.id);
      linkedSeries.set(temperature.id, sensor?.id ?? null);
      const bytes = (value, divisor) => Number.isFinite(value) ? value / divisor : null;
      items.push(activity, capacity, row('free', 'Free space', 'GiB', bytes(volume.free, GIB)),
        row('read', 'Read rate', 'MiB/s', bytes(volume.read, MIB)), row('write', 'Write rate', 'MiB/s', bytes(volume.write, MIB)), temperature);
      if (overview.storage.value === null) overview.storage = activity.value === null ? capacity : activity;
    }
    const placeholder = (group, label, unit, pattern) => {
      if (!selectReadings(entries, group, pattern, unit)) {
        items.push(reading(group, 'missing:' + label, label, unit, null, source, sample.hardwareAt, age));
      }
    };
    if (!selectReadings(entries, 'cpu', /./, 'MHz')) {
      items.push(reading('cpu', 'cpuClock', 'Reported processor frequency', 'MHz',
        windows?.cpuClock > 0 ? windows.cpuClock : null, SYSTEM, windowsAt, windowsAge));
    }
    placeholder('cpu', 'CPU package power', 'W', /package|total/i);
    placeholder('gpu', 'GPU clock', 'MHz', /./);
    placeholder('gpu', 'GPU power', 'W', /./);
    if (!selectReadings(entries, 'gpu', /memory used|vram used/i, 'MiB')
        && !selectReadings(entries, 'gpu', /memory used|vram used/i, 'GiB')) {
      items.push(reading('gpu', 'missing:vram', 'VRAM used', 'GiB', null, source, sample.hardwareAt, age));
    }
    placeholder('memory', 'Memory timings', 'ns', /./);
    placeholder('cooling', 'Fan speed', 'RPM', /./);
    if (!displays.length) items.push(overview.display);
    if (!windows?.volumes?.length) items.push(overview.storage);
    items.push(...entries);

    const cpuPower = componentPower(entries, 'cpu');
    const gpuPower = componentPower(entries, 'gpu', sample.gpuDevice ?? gpuLoad?.deviceId);
    const gpuDevices = new Set(entries.filter(({ group }) => group === 'gpu').map(({ deviceId }) => deviceId));
    const gpuOverviewPower = sample.gpuDevice || gpuDevices.size === 1 ? gpuPower : null;
    const companion = new Map([['cpu', cpuPower], ['gpu', gpuOverviewPower]]);
    const powerRows = [];
    for (const [load, sensor, caption] of /** @type {const} */ ([
      [overview.cpu, cpuPower, 'CPU package power'],
      [overview.gpu, gpuPower, 'GPU measured power'],
    ])) {
      const loadId = 'power:' + load.id;
      const gpuSensor = load.id === 'gpu' ? gpuLoad : null;
      const loadReading = { ...load, group: 'power', id: loadId };
      if (gpuSensor) Object.assign(loadReading, { value: gpuSensor.value, device: gpuSensor.device,
        deviceId: gpuSensor.deviceId });
      const unmatchedGpu = load.id === 'gpu' && !sample.gpuDevice && !gpuSensor && gpuDevices.size > 1;
      if (unmatchedGpu && sensor) loadReading.value = null;
      linkedSeries.set(loadId, unmatchedGpu && sensor ? null : gpuSensor?.id ?? load.id);
      const watts = reading('power', load.id + 'Power', caption, 'W', sensor?.value, sensor?.source ?? source,
        sensor?.at, sensor?.maxAge ?? age, sensor?.device, sensor?.deviceId);
      linkedSeries.set(watts.id, sensor?.id ?? null);
      powerRows.push(loadReading, watts);
    }
    items.push(...powerRows);

    if (refresh) {
      const activeIds = new Set(items.map(({ id }) => id));
      for (const id of Object.keys(this.history.series)) {
        if (!activeIds.has(id)) delete this.history.series[id];
      }
      for (const item of items) {
        if (!history[item.id] && !linkedSeries.has(item.id)) this.history.recordPoint(item.id, item.at, item.value, now);
      }
    }
    const statusOf = (item) => item.value === null || !Number.isFinite(item.at) ? 'unavailable' : now - item.at >= item.maxAge ? 'stale' : 'live';
    const unavailableReason = (item) => {
      if (item.group === 'frames') return this.framesExecutable ? 'No frames were captured from the foreground app.'
        : 'Set up PresentMon to measure the foreground app.';
      if (item.source === SYSTEM) return 'Windows has not supplied this reading.';
      if (item.source === 'Drive sensor') return 'No verified temperature sensor is linked to this volume.';
      return sample.hardwareAt == null ? 'No hardware monitor sample received.' : 'The hardware monitor did not report this reading.';
    };
    const serialize = (item, retainedRange) => {
      const status = statusOf(item);
      const wattSource = companion.get(item.id);
      const result = { ...item, status, ...(status === 'unavailable' ? { reason: unavailableReason(item) } : {}),
        ...(wattSource ? { watts: { value: wattSource.value, status: statusOf(wattSource),
        sampledAt: wattSource.at } } : {}) };
      const chart = retainedRange && this.retained.chart(item.id, retainedRange.ms, now);
      if (chart) return { ...result, points: chart.points, chartWindow: retainedRange.ms, chartLabel: retainedRange.label, chartGap: chart.gapMs };
      const id = linkedSeries.has(item.id) ? linkedSeries.get(item.id) : item.id;
      const points = id === null ? [] : history[id] ?? this.history.series[id] ?? [];
      const scale = ['cpu', 'gpu', 'ram'].includes(id) && Boolean(history[id]) ? 100 : 1;
      const recent = points.filter(([at]) => now - at <= WINDOW);
      return { ...result,
        points: scale === 1 ? recent : recent.map(([at, value]) => [at, Number.isFinite(value) ? value * scale : null]) };
    };
    const historyOptions = this.retained?.options() ?? [];
    const retainedRange = historyOptions.find(({ ms }) => ms === range);
    return {
      groups: GROUPS, overview: Object.values(overview).map((item) => serialize(item, retainedRange)), readings: items.map((item) => serialize(item)),
      ...(historyOptions.length ? { historyOptions } : {}),
      frameStatus: !this.framesExecutable ? 'Set up PresentMon to measure the foreground app.'
        : !target ? 'Bring an app to the foreground to measure frame performance.'
          : this.frames.error || (!frames ? 'Waiting for frames from ' + (target.name || 'the foreground app') + '.' : ''),
    };
  }
}

module.exports = { StatsMonitor, hardwareReadings, GROUPS, HISTORY_WINDOW_MS: WINDOW };
