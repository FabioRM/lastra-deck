'use strict';

{
  const readings = [
    { metric: 'cpu', label: 'CPU', clock: 'sampledAt', temperatureMetric: 'cpuTemp' },
    { metric: 'ram', label: 'RAM', clock: 'sampledAt' },
    { metric: 'gpu', label: 'GPU', clock: 'hardwareAt', temperatureMetric: 'gpuTemp' },
  ];

  function createTelemetry() {
    const container = document.getElementById('telemetry-readings');
    const { lastReading } = window.LastraReadingTime;
    const { DEFAULT_APPEARANCE, normalizeAppearance } = window.LastraAppearance;
    let appearance = DEFAULT_APPEARANCE;
    let latest = {};
    const rows = readings.map((reading) => {
      const row = document.createElement('div');
      row.className = 'telemetry-reading';
      const labelNode = document.createElement('dt');
      const caption = document.createTextNode('');
      labelNode.append(caption);
      const temperature = reading.temperatureMetric && document.createElement('span');
      if (temperature) {
        temperature.className = 'telemetry-temperature';
        labelNode.append(temperature);
      }
      const valueNode = document.createElement('dd');
      const text = document.createElement('span');
      const digits = document.createTextNode('');
      const unit = document.createElement('span');
      unit.className = 'telemetry-unit';
      text.append(digits, unit);
      valueNode.append(text);
      row.append(labelNode, valueNode);
      container.append(row);
      return { ...reading, row, caption, temperature, valueNode, digits, unit, setting: reading.metric + 'Readout' };
    });

    function render(sample) {
      latest = sample;
      const now = Date.now();
      const hardwareMaxAge = sample.hardwareStaleMs ?? 6_000;
      const hardwareStale = Number.isFinite(sample.hardwareAt) && now - sample.hardwareAt >= hardwareMaxAge;
      for (const { metric, label, clock, temperatureMetric, row, caption, temperature, valueNode, digits, unit, setting } of rows) {
        const value = sample[metric];
        const available = Number.isFinite(value);
        const maxAge = clock === 'sampledAt' ? 3_000 : hardwareMaxAge;
        const stale = available && Number.isFinite(sample[clock]) && now - sample[clock] >= maxAge;
        row.dataset.state = available ? stale ? 'stale' : 'ready' : 'unavailable';
        const labelText = stale ? label + ' · stale' : label;
        const title = available ? lastReading(sample[clock]) : '';
        if (row.title !== title) row.title = title;
        const percent = available ? Math.round(Math.max(0, Math.min(1, value)) * 100) : null;
        const maxed = percent === 100;
        const reading = maxed ? 'MAX' : percent === null ? 'N/A' : String(percent);
        const suffix = available && !maxed && appearance.showPercentSigns ? '%' : '';
        const format = appearance[setting];
        if (row.dataset.readout !== format) {
          row.dataset.readout = format;
          valueNode.classList.toggle('telemetry-arc', format === 'gauge');
        }
        if (format === 'gauge') row.style.setProperty('--telemetry-angle', (percent ?? 0) * 1.8 + 'deg');
        row.toggleAttribute('data-maxed', maxed);
        if (caption.data !== labelText) caption.data = labelText;
        if (digits.data !== reading) digits.data = reading;
        if (unit.textContent !== suffix) unit.textContent = suffix;
        if (temperature) {
          const degrees = sample[temperatureMetric];
          const temperatureText = !hardwareStale && Number.isFinite(degrees) ? ` ${Math.round(degrees)} °C` : '';
          if (temperature.textContent !== temperatureText) temperature.textContent = temperatureText;
        }
      }
    }

    (window.lastra ?? window.LastraDeckPreview)?.onDeckAppearance?.((settings) => {
      appearance = normalizeAppearance(settings);
      render(latest);
    });
    render(latest);
    return render;
  }

  window.createTelemetry = createTelemetry;
}
