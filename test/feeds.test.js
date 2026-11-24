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
      if (address.includes('open-meteo.com/v1/forecast')) return { ok: true, json: async () => ({ current: { temperature_2m: 12.2, weather_code: 0 } }) };
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
  assert.equal(JSON.stringify(saved).includes('secret-key'), false);
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

test('Feeds keeps ticker market caps and the reported cash for both currencies, then removes empty groups immediately', async (t) => {
  let circulationRequests = 0;
  let capitalisationRequests = 0;
  const json = (data) => ({ ok: true, json: async () => data });
  const feeds = new Feeds(path.join(tempDir(t, 'lastra-feeds-'), 'feeds.json'), {
    fetch: async (url) => {
      const address = new URL(url);
      if (address.hostname === 'stats.bis.org') {
        circulationRequests++;
        return { ok: true, text: async () => [
          'BIS_UNIT,REP_CTY,UNIT_MULT,TIME_PERIOD,OBS_VALUE,COMMENT_TS',
          'USD,US,9,2024,2367.55,"Notes and coins, total"',
          'EUR,XM,9,2024,1625.7,',
          'USD,US,9,2023,2284,',
          'GBP,GB,9,2024,,',
        ].join('\r\n') };
      }
      if (address.pathname.includes('finance/quote')) return json({ quoteResponse: { result: [{ regularMarketPrice: 155, marketCap: null }] } });
      if (address.pathname.includes('fundamentals-timeseries')) {
        capitalisationRequests++;
        return json({ timeseries: { result: [{ meta: { symbol: ['MSFT'] }, trailingMarketCap: [
          { asOfDate: '2026-10-01', currencyCode: 'USD', reportedValue: { raw: 2e12 } },
          { asOfDate: '2026-11-01', currencyCode: 'USD', reportedValue: { raw: 3.2e12 } },
        ] }] } });
      }
      if (address.pathname.includes('finance/chart')) return json({ chart: { result: [{ meta: { regularMarketPrice: 1.1 } }] } });
      throw new Error('Unexpected request in fixture');
    },
  });
  feeds.setSettings({ quotes: { symbols: ['MSFT'] }, currencies: { pairs: ['EURUSD', 'GBPUSD'] } });
  const result = await feeds.refresh();
  assert.equal(result.quotes.rows[0].marketCap, 3.2e12);
  assert.equal(result.quotes.rows[0].marketCapCurrency, 'USD');
  assert.equal(result.quotes.rows[0].marketCapDate, '2026-11-01');
  assert.deepEqual(result.currencies.rows[0].circulation, [
    { code: 'EUR', amount: 1625.7e9, year: '2024' }, { code: 'USD', amount: 2367.55e9, year: '2024' },
  ]);
  assert.deepEqual(result.currencies.rows[1].circulation[0], { code: 'GBP' });
  await feeds.refresh();
  assert.equal(circulationRequests, 1);
  assert.equal(capitalisationRequests, 1);
  const withoutQuotes = feeds.setSettings({ quotes: { symbols: [] } });
  assert.deepEqual(withoutQuotes.quotes.rows, []);
  assert.equal(withoutQuotes.currencies.rows.length, 2);
  const withoutMarkets = feeds.setSettings({ currencies: { pairs: [] } });
  assert.deepEqual(withoutMarkets.currencies.rows, []);
  await feeds.refresh();
  assert.equal(circulationRequests, 1);
  assert.equal(capitalisationRequests, 1);
});
