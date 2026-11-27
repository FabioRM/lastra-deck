'use strict';

{
  const WMO = {
    clear: [0, 1], partly: [2], cloud: [3], fog: [45], frost: [48], drizzle: [51, 53, 55],
    ice: [56, 57, 66, 67], rain: [61, 63, 65], showers: [80, 81, 82],
    snow: [71, 73, 75, 77, 85, 86], storm: [95, 97], hail: [96, 99],
  };
  const WMO_SCENES = new Map(Object.entries(WMO).flatMap(([scene, codes]) => codes.map((code) => [code, scene])));
  const LABELS = {
    clear: 'Clear', partly: 'Cloudy', cloud: 'Cloudy', fog: 'Fog', frost: 'Freezing fog', drizzle: 'Drizzle',
    ice: 'Freezing rain', rain: 'Rain', showers: 'Showers', snow: 'Snow', storm: 'Thunderstorm', hail: 'Thunderstorm with hail',
    sleet: 'Sleet', haze: 'Haze', dust: 'Dust', squall: 'Squall', tornado: 'Tornado',
  };
  const MOON_LABELS = {
    new: 'New moon', 'waxing-crescent': 'Waxing crescent', 'first-quarter': 'First quarter',
    'waxing-gibbous': 'Waxing gibbous', full: 'Full moon', 'waning-gibbous': 'Waning gibbous',
    'last-quarter': 'Last quarter', 'waning-crescent': 'Waning crescent',
  };
  const LIGHT = {
    'open-meteo': [51, 56, 61, 66, 71, 77, 80, 85],
    openweather: [200, 210, 230, 300, 310, 500, 520, 600, 612, 615, 620],
  };
  const HEAVY = {
    'open-meteo': [55, 57, 65, 67, 75, 82, 86, 97, 99],
    openweather: [202, 212, 232, 302, 312, 314, 502, 503, 504, 522, 602, 622],
  };

  function openWeatherScene(code) {
    if (!Number.isInteger(code)) return undefined;
    if (code === 800) return 'clear';
    if (code >= 801 && code <= 803) return 'partly';
    if (code === 804) return 'cloud';
    if (code === 511) return 'ice';
    if ([611, 612, 613, 615, 616].includes(code)) return 'sleet';
    if ([701, 741].includes(code)) return 'fog';
    if ([711, 721].includes(code)) return 'haze';
    if ([731, 751, 761, 762].includes(code)) return 'dust';
    if (code === 771) return 'squall';
    if (code === 781) return 'tornado';
    return { 2: 'storm', 3: 'drizzle', 5: code >= 520 ? 'showers' : 'rain', 6: 'snow' }[Math.floor(code / 100)];
  }

  function weatherScene({ provider, code, label } = {}) {
    const known = provider === 'openweather' ? openWeatherScene(code) : WMO_SCENES.get(code);
    if (known) return known;
    const key = typeof label === 'string' ? label.toLowerCase() : '';
    if (key.includes('hail')) return 'hail';
    if (key.includes('thunder')) return 'storm';
    if (key.includes('tornado')) return 'tornado';
    if (key.includes('squall')) return 'squall';
    if (key.includes('freez')) return key.includes('fog') ? 'frost' : 'ice';
    if (key.includes('sleet')) return 'sleet';
    if (key.includes('snow')) return 'snow';
    if (key.includes('drizzle')) return 'drizzle';
    if (key.includes('shower')) return 'showers';
    if (key.includes('rain')) return 'rain';
    if (/fog|mist/.test(key)) return 'fog';
    if (/dust|sand|ash/.test(key)) return 'dust';
    if (/haze|smoke/.test(key)) return 'haze';
    if (key.includes('cloud')) return 'cloud';
    return 'clear';
  }

  function solarPhase(reading, date = new Date()) {
    const sun = reading?.sun;
    if (Number.isFinite(sun?.dawn) && Number.isFinite(sun.dusk)) {
      const now = date.getTime();
      if (now < sun.dawn || now >= sun.dusk) return 'night';
      if (now < sun.sunrise) return 'dawn';
      return now < sun.sunset ? 'day' : 'dusk';
    }
    if (typeof reading?.isDay === 'boolean') return reading.isDay ? 'day' : 'night';
    const hour = date.getHours();
    return hour < 6 || hour >= 20 ? 'night' : 'day';
  }

  function weatherIntensity({ provider = 'open-meteo', code } = {}) {
    if (LIGHT[provider]?.includes?.(code)) return .61;
    return HEAVY[provider]?.includes?.(code) ? 1.19 : 1;
  }

  function moonPhase(cycle) {
    if (cycle < .03 || cycle > .97) return 'new';
    if (cycle < .22) return 'waxing-crescent';
    if (cycle < .28) return 'first-quarter';
    if (cycle < .47) return 'waxing-gibbous';
    if (cycle < .53) return 'full';
    if (cycle < .72) return 'waning-gibbous';
    if (cycle < .78) return 'last-quarter';
    return 'waning-crescent';
  }

  function moonCycle(date = new Date()) {
    const synodic = 29.530588853;
    const age = ((date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86_400_000) % synodic;
    return ((age + synodic) % synodic) / synodic;
  }

  const weather = { weatherScene, sceneLabel: (scene) => LABELS[scene], weatherIntensity,
    weatherLabel: (code) => LABELS[WMO_SCENES.get(code)] ?? 'Weather', solarPhase,
    moonPhase, moonLabel: (phase) => MOON_LABELS[phase], moonCycle };
  if (typeof module === 'object') module.exports = weather;
  else window.LastraWeather = weather;
}
