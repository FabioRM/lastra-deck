'use strict';

{
  const LIMIT = 24;
  const PATTERN = /^lhm:\/[a-z0-9/_-]{1,180}$/i;
  const isSensorId = (value) => typeof value === 'string' && PATTERN.test(value);

  function sensorIds(widgets) {
    return [...new Set(widgets.filter(({ type }) => type === 'system-metric')
      .map(({ settings }) => settings?.sensorId).filter(isSensorId))].slice(0, LIMIT);
  }

  function searchSensors(readings, value) {
    const words = value.trim().toLowerCase().split(/\s+/);
    return readings.filter(({ name, device, deviceId, source, group, unit }) => {
      const aliases = [
        group === 'gpu' && /\bmemory\b/i.test(name) && 'VRAM',
        group === 'memory' && 'RAM',
        group === 'storage' && 'disk drive',
        /^\/nvme\//i.test(deviceId ?? '') && 'SSD',
      ];
      const text = [name, device, deviceId, source, group, unit, ...aliases].filter(Boolean).join(' ').toLowerCase();
      return words.every((word) => text.includes(word));
    });
  }

  function preferredOverview(snapshot, selection) {
    if (selection === null) return snapshot.overview;
    const known = new Map([...snapshot.readings, ...snapshot.overview].map((item) => [item.id, item]));
    return selection.map((item) => known.get(item.id) ?? { ...item, status: 'unavailable', points: [] });
  }

  const api = { isSensorId, sensorIds, searchSensors, preferredOverview, SENSOR_LIMIT: LIMIT };
  if (typeof module === 'object') module.exports = api;
  else window.LastraSensorBinding = api;
}
