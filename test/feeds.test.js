'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Feeds } = require('../src/main/feeds');

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
