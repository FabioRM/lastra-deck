'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { WeatherMonitor, forecastLine, normalizeLocation } = require('../src/main/weather');
const { weatherScene, solarPhase } = require('../src/shared/weather-scene');

test('pet weather maps the full WMO table and distinguishable OpenWeather conditions', () => {
  const wmo = {
    clear: [0, 1], partly: [2], cloud: [3], fog: [45], frost: [48], drizzle: [51, 53, 55],
    ice: [56, 57, 66, 67], rain: [61, 63, 65], showers: [80, 81, 82],
    snow: [71, 73, 75, 77, 85, 86], storm: [95, 97], hail: [96, 99],
  };
  for (const [expected, codes] of Object.entries(wmo)) {
    for (const code of codes) assert.equal(weatherScene({ code }), expected);
  }
  for (const [code, expected] of [[200, 'storm'], [300, 'drizzle'], [500, 'rain'], [511, 'ice'], [521, 'showers'],
    [601, 'snow'], [613, 'sleet'], [701, 'fog'], [711, 'haze'], [731, 'dust'], [771, 'squall'], [781, 'tornado'],
    [800, 'clear'], [802, 'partly'], [804, 'cloud']]) {
    assert.equal(weatherScene({ provider: 'openweather', code }), expected);
  }
  const sun = { dawn: 1000, sunrise: 2000, sunset: 3000, dusk: 4000 };
  assert.equal(solarPhase({ sun }, new Date(1500)), 'dawn');
  assert.equal(solarPhase({ sun }, new Date(3500)), 'dusk');
  assert.equal(solarPhase({ isDay: false }), 'night');
});
const { readSettings } = require('../src/main/configuration-backup');

test('sunrise service times become daylight markers', async () => {
  const { readSun } = require('../src/main/weather');
  const sun = await readSun({ latitude: 41.9, longitude: 12.5 }, async (url) => {
    assert.match(String(url), /sunrise-sunset\.org/);
    return { ok: true, json: async () => ({ status: 'OK', results: {
      civil_twilight_begin: '2026-11-22T05:40:00+00:00',
      sunrise: '2026-11-22T06:10:00+00:00',
      sunset: '2026-11-22T16:00:00+00:00',
      civil_twilight_end: '2026-11-22T16:30:00+00:00',
    } }) };
  });
  assert.equal(sun.dawn, Date.parse('2026-11-22T05:40:00+00:00'));
  assert.ok(sun.sunrise < sun.sunset && sun.sunset < sun.dusk);
});

test('weather location and forecast stay within the published Open-Meteo fields', async () => {
  assert.equal(normalizeLocation({ latitude: '45.47', longitude: 9.18 }).latitude, 45.47);
  assert.equal(normalizeLocation({ latitude: 91, longitude: 0 }), null);
  assert.equal(forecastLine({ current: { temperature_2m: 18.2, weather_code: 2 } }), '18° · Cloudy');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lastra-weather-'));
  const updates = [];
  const weather = new WeatherMonitor(path.join(directory, 'weather.json'), {
    onChange: (snapshot) => updates.push(snapshot.line),
    fetch: async () => ({ ok: true, json: async () => ({ current: { temperature_2m: 7.4, weather_code: 71 } }) }),
  });
  assert.equal(weather.setLocation({ latitude: 45, longitude: 9 }).location.longitude, 9);
  assert.equal((await weather.refresh()).line, '7° · Snow');
  assert.deepEqual(updates.slice(0, 2), ['', '7° · Snow']);
  weather.setLocation({ latitude: '', longitude: '' });
  assert.equal(fs.existsSync(path.join(directory, 'weather.json')), false);
});

test('a configuration export keeps saved settings and activity profiles', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lastra-config-'));
  fs.writeFileSync(path.join(directory, 'deck-appearance.json'), '{"version":1,"theme":"dark"}');
  fs.writeFileSync(path.join(directory, 'profile-work.json'), '{"name":"Work"}');
  fs.writeFileSync(path.join(directory, 'spotify-account.json'), '{"token":"secret"}');
  const bundle = readSettings(directory);
  assert.equal(bundle.files['deck-appearance.json'].theme, 'dark');
  assert.equal(bundle.files['profile-work.json'].name, 'Work');
  assert.equal(bundle.files['spotify-account.json'], undefined);
});
