'use strict';

const fs = require('node:fs');
const { readJsonSettings, writeJsonSettings } = require('./json-settings-file');
const { weatherLabel } = require('../shared/weather-scene');

const rounded = (value) => Number.isFinite(value) ? Math.round(value) : null;

function sunTimes(rise, set) {
  if (!Number.isFinite(rise) || !Number.isFinite(set) || rise >= set) return null;
  const sunrise = rise * 1_000;
  const sunset = set * 1_000;
  return { dawn: sunrise - 1_800_000, sunrise, sunset, dusk: sunset + 1_800_000 };
}

function coordinate(value, limit) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number < -limit || number > limit) return null;
  return Math.round(number * 1000) / 1000;
}

function normalizeLocation(value) {
  const latitude = coordinate(value?.latitude, 90);
  const longitude = coordinate(value?.longitude, 180);
  if (latitude == null || longitude == null) return null;
  return { latitude, longitude };
}

function forecastLine(payload) {
  const current = payload?.current;
  const temperature = current?.temperature_2m;
  const code = current?.weather_code;
  if (!Number.isFinite(temperature) || !Number.isInteger(code)) throw new Error('The weather forecast is incomplete.');
  return `${Math.round(temperature)}° · ${weatherLabel(code)}`;
}

async function readForecast(location, fetchImpl = globalThis.fetch) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(location.latitude));
  url.searchParams.set('longitude', String(location.longitude));
  url.searchParams.set('current', 'temperature_2m,weather_code,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,pressure_msl,cloud_cover,is_day');
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,sunrise,sunset');
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('timeformat', 'unixtime');
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error('The weather forecast is unavailable.');
  const body = await response.json();
  const line = forecastLine(body);
  const { current, daily } = body;
  return {
    line, temperature: rounded(current.temperature_2m), code: current.weather_code, label: weatherLabel(current.weather_code),
    low: rounded(daily?.temperature_2m_min?.[0]), high: rounded(daily?.temperature_2m_max?.[0]),
    feelsLike: rounded(current.apparent_temperature), humidity: rounded(current.relative_humidity_2m),
    wind: rounded(current.wind_speed_10m), windDirection: rounded(current.wind_direction_10m),
    pressure: rounded(current.pressure_msl), cloudCover: rounded(current.cloud_cover),
    isDay: current.is_day === 1 ? true : current.is_day === 0 ? false : undefined,
    sun: sunTimes(daily?.sunrise?.[0], daily?.sunset?.[0]),
    timezone: typeof body.timezone === 'string' ? body.timezone : null,
  };
}

async function readSun(location, fetchImpl = globalThis.fetch) {
  const url = new URL('https://api.sunrise-sunset.org/json');
  url.searchParams.set('lat', String(location.latitude));
  url.searchParams.set('lng', String(location.longitude));
  url.searchParams.set('formatted', '0');
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error('Sunrise times are unavailable.');
  const body = await response.json();
  const results = body?.status === 'OK' ? body.results : null;
  const time = (key) => {
    const value = Date.parse(results?.[key]);
    return Number.isFinite(value) ? value : null;
  };
  const sun = {
    dawn: time('civil_twilight_begin'),
    sunrise: time('sunrise'),
    sunset: time('sunset'),
    dusk: time('civil_twilight_end'),
  };
  if (Object.values(sun).some((value) => value == null) || sun.sunrise >= sun.sunset) throw new Error('Sunrise times are incomplete.');
  return sun;
}

class WeatherMonitor {
  constructor(file, { fetch: fetchImpl = globalThis.fetch, onChange = () => {}, log = () => {} } = {}) {
    this.file = file;
    this.fetch = fetchImpl;
    this.onChange = onChange;
    this.log = log;
    this.reading = null;
    this.location = readJsonSettings(file, {
      maxBytes: 1_024,
      parse(data) {
        const location = data?.version === 1 ? normalizeLocation(data) : null;
        if (!location) throw new Error('Invalid weather location');
        return location;
      },
      fallback: () => null,
      onError: () => log('Could not read the weather location.'),
    });
    this.line = '';
  }

  snapshot() {
    return { location: this.location, line: this.line, ...(this.reading ?? {}) };
  }

  setLocation(value) {
    const location = value == null || value.latitude === '' || value.longitude === '' ? null : normalizeLocation(value);
    if ((value?.latitude !== '' && value?.longitude !== '' && value != null) && !location) {
      throw new Error('Enter a latitude from -90 to 90 and a longitude from -180 to 180.');
    }
    this.location = location;
    this.line = '';
    this.reading = null;
    if (location) writeJsonSettings(this.file, { version: 1, ...location }, { failure: 'Could not save the weather location.' });
    else {
      try { fs.rmSync(this.file, { force: true }); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    this.onChange(this.snapshot());
    return this.snapshot();
  }

  async refresh() {
    if (!this.location) return this.snapshot();
    try {
      const forecast = await readForecast(this.location, this.fetch);
      if (forecast.line !== this.line) {
        this.line = forecast.line;
        const [temperature, label] = forecast.line.split(' · ');
        this.reading = { temperature: Number.parseInt(temperature, 10), label };
        this.onChange(this.snapshot());
      }
    } catch (error) {
      this.log('Could not read the weather forecast:', error.message);
    }
    return this.snapshot();
  }
}

module.exports = { WeatherMonitor, forecastLine, normalizeLocation, readForecast, readSun, rounded, sunTimes, weatherLabel };
