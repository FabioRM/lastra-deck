'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Feeds } = require('../src/main/feeds');
const { tempDir } = require('./helpers/temp-dir');

function directory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lastra-feeds-'));
}

test('feeds chooses a weather provider, keeps the API key out of the deck snapshot, and can hide optional views', async () => {
  const folder = directory();
  fs.writeFileSync(path.join(folder, 'weather.json'), JSON.stringify({ version: 1, latitude: 45.47, longitude: 9.19 }));
  const feeds = new Feeds(path.join(folder, 'feeds.json'), {
    legacyWeather: path.join(folder, 'weather.json'),
    fetch: async (url) => {
      const address = String(url);
      if (address.includes('open-meteo.com/v1/forecast')) return { ok: true, json: async () => ({
        timezone: 'Europe/Rome',
        current: { temperature_2m: 12.2, weather_code: 0, apparent_temperature: 11, relative_humidity_2m: 76,
          wind_speed_10m: 18.5, wind_direction_10m: 225, pressure_msl: 1012.7, cloud_cover: 4, is_day: 1 },
        daily: { temperature_2m_max: [15], temperature_2m_min: [5], sunrise: [18000], sunset: [55000] },
      }) };
      if (address.includes('api.openweathermap.org')) return { ok: true, json: async () => ({
        main: { temp: 4.2, feels_like: 1.7, temp_min: 2.5, temp_max: 8, humidity: 92, pressure: 1018 },
        weather: [{ main: 'Rain', id: 511, icon: '13n' }], wind: { speed: 4, deg: 210 }, clouds: { all: 89 },
        timezone: 3600, sys: { sunrise: 18000, sunset: 55000 },
      }) };
      if (address.includes('geocoding-api.open-meteo.com')) return { ok: true, json: async () => ({ results: [{ name: 'Milan', admin1: 'Lombardy', country: 'Italy', latitude: 45.46, longitude: 9.19 }] }) };
      if (address.includes('stooq.com')) return { ok: true, text: async () => 'Symbol,Close\nAAPL.US,271.5\n' };
      if (address.includes('frankfurter.app')) return { ok: true, json: async () => ({ rates: { USD: 1.08 } }) };
      if (address.includes('finance/search')) return { ok: true, json: async () => ({ quotes: [{ symbol: 'AAPL', shortname: 'Apple Inc.', exchDisp: 'NASDAQ', quoteType: 'EQUITY' }] }) };
      throw new Error(address);
    },
  });
  assert.equal(feeds.settings().weather.latitude, 45.47);
  feeds.setSettings({
    quotes: { provider: 'stooq', symbols: 'AAPL.US' },
    currencies: { pairs: 'EURUSD' },
  });
  assert.deepEqual(feeds.cycle(), ['keys', 'dashboard', 'stats', 'feeds']);
  const shown = await feeds.refresh();
  assert.equal(shown.weather.line, '12° · Clear');
  assert.deepEqual([shown.weather.code, shown.weather.feelsLike, shown.weather.humidity, shown.weather.wind, shown.weather.windDirection,
    shown.weather.pressure, shown.weather.cloudCover, shown.weather.isDay, shown.weather.sun.sunrise],
  [0, 11, 76, 19, 225, 1013, 4, true, 18_000_000]);
  assert.equal(shown.quotes.rows[0].price, 271.5);
  assert.equal(shown.currencies.rows[0].rate, 1.08);
  assert.equal(JSON.stringify(shown).includes('secret-key'), false);
  const saved = feeds.setSettings({
    enabled: false, views: { dashboard: false, stats: true },
    weather: { provider: 'openweather', apiKey: 'secret-key', latitude: 45, longitude: 9 },
    quotes: { provider: 'stooq', symbols: 'aapl.us, !!!' },
    currencies: { pairs: 'eurusd' },
  });
  assert.equal(saved.enabled, false);
  assert.deepEqual(saved.cycle, ['keys', 'stats']);
  assert.equal(saved.weather.hasKey, true);
  assert.equal(saved.weather.temperature, undefined);
  assert.equal(JSON.stringify(saved).includes('secret-key'), false);
  const localForecast = (await feeds.refresh()).weather;
  assert.deepEqual([localForecast.code, localForecast.isDay, localForecast.wind, localForecast.timezoneOffset], [511, false, 14, 3600]);
  assert.deepEqual(saved.quotes.symbols, ['AAPL.US']);
  assert.throws(() => feeds.setSettings({ quotes: { provider: 'finnhub', symbols: 'AAPL' } }), /Finnhub needs an API key/);
  const places = await feeds.searchPlaces('Milan');
  assert.equal(places[0].name, 'Milan, Lombardy, Italy');
  const found = await feeds.searchSymbols('Apple');
  assert.equal(found[0].symbol, 'AAPL.US');
  const capped = feeds.setSettings({ quotes: { provider: 'yahoo', symbols: Array.from({ length: 20 }, (_, index) => `S${index}`), labels: { S0: 'First' } } });
  assert.equal(capped.quotes.symbols.length, 12);
  assert.equal(capped.quotes.labels.S0, 'First');
});

test('a refresh started before saving Feeds cannot replace readings for the saved configuration', async (t) => {
  let startOldRequest;
  let finishOldRequest;
  const oldStarted = new Promise((resolve) => { startOldRequest = resolve; });
  const oldResponse = new Promise((resolve) => { finishOldRequest = resolve; });
  const response = (price) => ({ ok: true, json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: price } }] } }) });
  const feeds = new Feeds(path.join(tempDir(t, 'lastra-feeds-'), 'feeds.json'), {
    fetch: async (url) => {
      if (url.pathname.includes('EURUSD')) {
        startOldRequest();
        return oldResponse;
      }
      return response(0.84);
    },
  });
  feeds.setSettings({ currencies: { pairs: ['EURUSD'] } });
  const first = feeds.refresh();
  await oldStarted;
  feeds.setSettings({ currencies: { pairs: ['EURGBP'] } });
  await feeds.refresh();
  finishOldRequest(response(1.08));
  await first;
  assert.equal(feeds.snapshot().currencies.rows[0].pair, 'EURGBP');
  assert.equal(feeds.snapshot().currencies.rows[0].rate, 0.84);
});

test('Feeds keeps ticker market caps and currency rates, then removes empty groups immediately', async (t) => {
  let capitalisationRequests = 0;
  let rateRequests = 0;
  const json = (data) => ({ ok: true, json: async () => data });
  const feeds = new Feeds(path.join(tempDir(t, 'lastra-feeds-'), 'feeds.json'), {
    fetch: async (url) => {
      const address = new URL(url);
      if (address.pathname.includes('finance/quote')) return json({ quoteResponse: { result: [{ regularMarketPrice: 155, marketCap: null }] } });
      if (address.pathname.includes('fundamentals-timeseries')) {
        capitalisationRequests++;
        return json({ timeseries: { result: [{ meta: { symbol: ['MSFT'] }, trailingMarketCap: [
          { asOfDate: '2026-10-01', currencyCode: 'USD', reportedValue: { raw: 2e12 } },
          { asOfDate: '2026-11-01', currencyCode: 'USD', reportedValue: { raw: 3.2e12 } },
        ] }] } });
      }
      if (address.pathname.includes('finance/chart')) {
        rateRequests++;
        return json({ chart: { result: [{ meta: { regularMarketPrice: 1.1 } }] } });
      }
      throw new Error('Unexpected request in fixture');
    },
  });
  feeds.setSettings({ quotes: { symbols: ['MSFT'] }, currencies: { pairs: ['EURUSD', 'GBPUSD'] } });
  const result = await feeds.refresh();
  assert.equal(result.quotes.rows[0].marketCap, 3.2e12);
  assert.equal(result.quotes.rows[0].marketCapCurrency, 'USD');
  assert.equal(result.quotes.rows[0].marketCapDate, '2026-11-01');
  assert.deepEqual(result.currencies.rows.map(({ pair, rate }) => [pair, rate]), [['EURUSD', 1.1], ['GBPUSD', 1.1]]);
  assert.equal(rateRequests, 2);
  await feeds.refresh();
  assert.equal(capitalisationRequests, 1);
  const withoutQuotes = feeds.setSettings({ quotes: { symbols: [] } });
  assert.deepEqual(withoutQuotes.quotes.rows, []);
  assert.equal(withoutQuotes.currencies.rows.length, 2);
  const withoutMarkets = feeds.setSettings({ currencies: { pairs: [] } });
  assert.deepEqual(withoutMarkets.currencies.rows, []);
  await feeds.refresh();
  assert.equal(rateRequests, 4);
  assert.equal(capitalisationRequests, 1);
});
