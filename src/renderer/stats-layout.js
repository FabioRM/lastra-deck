'use strict';

{
  const PAGE_SIZE = 8;

  function statsPage(readings, group, selectedDevice, index) {
    const devices = new Map();
    for (const reading of readings) {
      if (reading.group !== group) continue;
      const id = reading.deviceId || reading.device || '';
      if (!devices.has(id)) devices.set(id, { id, name: reading.device || 'Other readings', readings: [] });
      devices.get(id).readings.push(reading);
    }
    const selection = devices.get(selectedDevice) ?? devices.values().next().value;
    const pageCount = Math.max(1, Math.ceil((selection?.readings.length ?? 0) / PAGE_SIZE));
    const page = Math.max(0, Math.min(index, pageCount - 1));
    return {
      devices: [...devices.values()].map(({ id, name }) => ({ id, name })),
      selected: selection?.id,
      items: selection?.readings.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) ?? [],
      page, pageCount,
    };
  }

  function scaleKey({ group, unit }) {
    return group + ':' + unit;
  }

  function powerPairs(readings) {
    const power = new Map(readings.filter(({ group }) => group === 'power').map((item) => [item.id, item]));
    return ['cpu', 'gpu'].flatMap((component) => {
      const load = power.get('power:' + component);
      const watts = power.get(component + 'Power');
      return load && watts ? [{ load, watts }] : [];
    });
  }

  function statsScales(readings) {
    const scales = new Map();
    for (const item of readings) {
      const id = scaleKey(item);
      const scale = scales.get(id) ?? { low: 0, high: 1 };
      if (item.unit === '%') {
        scales.set(id, { low: 0, high: 100 });
        continue;
      }
      for (const value of [item.value, ...item.points.map(([, value]) => value)]) {
        if (!Number.isFinite(value)) continue;
        scale.low = Math.min(value, scale.low);
        scale.high = Math.max(value, scale.high);
      }
      scales.set(id, scale);
    }
    for (const [id, scale] of scales) {
      if (id.endsWith(':%')) continue;
      const increment = Math.pow(10, Math.floor(Math.log10(scale.high - scale.low))) / 2;
      scale.low = Math.floor(scale.low / increment) * increment;
      scale.high = Math.ceil(scale.high / increment) * increment;
    }
    return scales;
  }

  const layout = { statsPage, statsScales, scaleKey, powerPairs };
  if (typeof module === 'object') module.exports = layout;
  else window.LastraStatsLayout = layout;
}
