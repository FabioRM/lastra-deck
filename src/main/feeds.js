'use strict';

const { readJsonSettings, writeJsonSettings } = require('./json-settings-file');
const { openSecret, sealSecrets } = require('./sealed-secret');
const { normalizeLocation, readForecast, readSun } = require('./weather');

const WEATHER = ['open-meteo', 'openweather'];
const QUOTES = ['yahoo', 'stooq', 'finnhub'];
const OPTIONAL = ['dashboard', 'stats', 'feeds'];
const MAX_SYMBOLS = 12;
const MAX_PAIRS = 6;
const SYMBOL = /^[A-Za-z0-9.]{1,16}$/;
const PAIR = /^[A-Z]{6}$/;
const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'NYSEARCA', 'NYSEMKT', 'BATS', 'NMS', 'NYQ', 'NGM', 'PCX']);

function list(value, pattern, limit) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(/[\s,]+/);
  return [...new Set(source.map((item) => String(item).trim().toUpperCase()).filter((item) => pattern.test(item)))].slice(0, limit);
}

function provider(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function placeName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80);
}

function quoteLabels(value, symbols) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(symbols.flatMap((symbol) => {
    const label = placeName(value[symbol]);
    return label ? [[symbol, label]] : [];
  }));
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sessionStats(quote) {
  const price = finite(quote?.regularMarketPrice);
  const previous = finite(quote?.regularMarketPreviousClose ?? quote?.previousClose ?? quote?.chartPreviousClose);
  const reported = finite(quote?.regularMarketChangePercent);
  const change = reported ?? (price != null && previous ? Math.round((price - previous) / previous * 1000) / 10 : null);
  return {
    price,
    change,
    open: finite(quote?.regularMarketOpen),
    high: finite(quote?.regularMarketDayHigh),
    low: finite(quote?.regularMarketDayLow),
    close: previous,
    marketCap: finite(quote?.marketCap),
  };
}
function yahooSymbol(symbol) {
  const bare = symbol.endsWith('.US') ? symbol.slice(0, -3) : symbol;
  return SYMBOL.test(bare) ? bare : symbol;
}

function stooqSymbol(item) {
  const symbol = String(item.symbol ?? '').toUpperCase();
  if (!SYMBOL.test(symbol)) return '';
  if (symbol.includes('.')) return symbol;
  return US_EXCHANGES.has(String(item.exchDisp ?? item.exchange ?? '').toUpperCase().replace(/\s/g, '')) ? `${symbol}.US` : symbol;
}

function secret(raw, field) {
  try { return openSecret(raw, field) || ''; }
  catch { return ''; }
}

function readRaw(file) {
  return readJsonSettings(file, {
    maxBytes: 16_384,
    parse(data) {
      if (data?.version !== 1) throw new Error('Invalid feeds settings');
      return data;
    },
    fallback: () => ({ version: 1 }),
  });
}

class Feeds {
  constructor(file, { legacyWeather = '', fetch: fetchImpl = globalThis.fetch, onChange = () => {}, log = () => {} } = {}) {
    this.file = file;
    this.fetch = fetchImpl;
    this.onChange = onChange;
    this.log = log;
    this.raw = readRaw(file);
    if (!this.raw.weather && legacyWeather) {
      const legacy = readJsonSettings(legacyWeather, {
        maxBytes: 1_024,
        parse(data) { return data?.version === 1 ? normalizeLocation(data) : null; },
        fallback: () => null,
      });
      if (legacy) this.raw = { ...this.raw, weather: { provider: 'open-meteo', ...legacy } };
    }
    this.readings = { weather: null, quotes: [], currencies: [] };
  }

  allows(view) {
    if (view === 'keys' || view === 'obs' || view === 'apps' || view === 'emoji') return true;
    if (!OPTIONAL.includes(view)) return false;
    if (view === 'feeds') return this.raw.enabled !== false;
    return this.raw.views?.[view] !== false;
  }

  cycle() {
    return ['keys', 'dashboard', 'stats', 'feeds'].filter((view) => this.allows(view));
  }

  settings() {
    const weather = this.raw.weather ?? {};
    const quotes = this.raw.quotes ?? {};
    return {
      enabled: this.raw.enabled !== false,
      views: { dashboard: this.allows('dashboard'), stats: this.allows('stats'), feeds: this.allows('feeds') },
      weather: {
        provider: provider(weather.provider, WEATHER, 'open-meteo'),
        ...(normalizeLocation(weather) ?? { latitude: null, longitude: null }),
        place: placeName(weather.place),
        hasKey: Boolean(secret(this.raw, 'weatherApiKey')),
      },
      quotes: {
        provider: provider(quotes.provider, QUOTES, 'yahoo'),
        symbols: list(quotes.symbols, SYMBOL, MAX_SYMBOLS),
        labels: quoteLabels(quotes.labels, list(quotes.symbols, SYMBOL, MAX_SYMBOLS)),
        hasKey: Boolean(secret(this.raw, 'quotesApiKey')),
      },
      currencies: { pairs: list(this.raw.currencies?.pairs, PAIR, MAX_PAIRS) },
    };
  }

  snapshot() {
    const settings = this.settings();
    return { ...settings, cycle: this.cycle(), weather: { ...settings.weather, ...this.readings.weather },
      quotes: { ...settings.quotes, rows: this.readings.quotes },
      currencies: { ...settings.currencies, rows: this.readings.currencies } };
  }

  setSettings(value = {}) {
    const weather = { provider: provider(value.weather?.provider ?? this.raw.weather?.provider, WEATHER, 'open-meteo') };
    const quotes = { provider: provider(value.quotes?.provider ?? this.raw.quotes?.provider, QUOTES, 'yahoo') };
    const location = value.weather ? normalizeLocation(value.weather) : normalizeLocation(this.raw.weather);
    if (value.weather && (value.weather.latitude !== '' || value.weather.longitude !== '') && !location) {
      throw new Error('Enter a latitude from -90 to 90 and a longitude from -180 to 180.');
    }
    if (location) Object.assign(weather, location);
    const place = placeName(value.weather?.place ?? this.raw.weather?.place);
    if (place && location) weather.place = place;
    let weatherApiKey = secret(this.raw, 'weatherApiKey');
    let quotesApiKey = secret(this.raw, 'quotesApiKey');
    if (value.weather?.apiKey === null) weatherApiKey = '';
    else if (typeof value.weather?.apiKey === 'string' && value.weather.apiKey.trim()) weatherApiKey = value.weather.apiKey.trim();
    if (value.quotes?.apiKey === null) quotesApiKey = '';
    else if (typeof value.quotes?.apiKey === 'string' && value.quotes.apiKey.trim()) quotesApiKey = value.quotes.apiKey.trim();
    if (weather.provider === 'openweather' && !weatherApiKey) throw new Error('OpenWeather needs an API key.');
    if (quotes.provider === 'finnhub' && !quotesApiKey) throw new Error('Finnhub needs an API key.');
    quotes.symbols = list(value.quotes?.symbols ?? this.raw.quotes?.symbols, SYMBOL, MAX_SYMBOLS);
    quotes.labels = quoteLabels(value.quotes?.labels ?? this.raw.quotes?.labels, quotes.symbols);
    const next = {
      version: 1,
      enabled: value.enabled === undefined ? this.raw.enabled !== false : value.enabled === true,
      views: {
        dashboard: value.views?.dashboard === undefined ? this.allows('dashboard') : value.views.dashboard === true,
        stats: value.views?.stats === undefined ? this.allows('stats') : value.views.stats === true,
      },
      weather, quotes,
      currencies: { pairs: list(value.currencies?.pairs ?? this.raw.currencies?.pairs, PAIR, MAX_PAIRS) },
      ...(weatherApiKey ? { weatherApiKey } : {}),
      ...(quotesApiKey ? { quotesApiKey } : {}),
    };
    writeJsonSettings(this.file, next, { space: 2, failure: 'Could not save Feeds settings.' });
    sealSecrets(this.file, next, ['weatherApiKey', 'quotesApiKey'], this.log);
    this.raw = readRaw(this.file);
    this.onChange(this.snapshot());
    return this.snapshot();
  }

  async refresh() {
    const settings = this.settings();
    this.readings = {
      weather: await this.#weather(settings.weather),
      quotes: await this.#quotes(settings.quotes),
      currencies: await this.#currencies(settings.currencies.pairs),
    };
    this.onChange(this.snapshot());
    return this.snapshot();
  }

  async searchPlaces(query) {
    const name = String(query ?? '').trim();
    if (name.length < 2) return [];
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', name);
    url.searchParams.set('count', '6');
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');
    const response = await this.fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error('Place search is unavailable.');
    const body = await response.json();
    return (body.results ?? []).flatMap((item) => {
      const location = normalizeLocation(item);
      const label = placeName([item.name, item.admin1, item.country].filter(Boolean).join(', '));
      return location && label ? [{ ...location, name: label }] : [];
    }).slice(0, 6);
  }

  async locate() {
    const response = await this.fetch('https://get.geojs.io/v1/ip/geo.json', { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error('Current location is unavailable.');
    const body = await response.json();
    const location = normalizeLocation({ latitude: Number(body.latitude), longitude: Number(body.longitude) });
    if (!location) throw new Error('Current location is unavailable.');
    return { ...location, name: placeName([body.city, body.country].filter(Boolean).join(', ')) || 'Current location' };
  }

  async searchSymbols(query) {
    const text = String(query ?? '').trim();
    if (text.length < 1) return [];
    const selected = this.settings().quotes.provider;
    if (selected === 'finnhub') {
      const key = secret(this.raw, 'quotesApiKey');
      if (!key) throw new Error('Finnhub needs an API key.');
      const url = new URL('https://finnhub.io/api/v1/search');
      url.searchParams.set('q', text);
      url.searchParams.set('token', key);
      const response = await this.fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error('Symbol search is unavailable.');
      const body = await response.json();
      return (body.result ?? []).slice(0, 8).flatMap((item) => {
        const symbol = String(item.symbol ?? '').toUpperCase();
        return SYMBOL.test(symbol) ? [{ symbol, name: placeName(item.description) || symbol, exchange: '' }] : [];
      });
    }
    const url = new URL('https://query2.finance.yahoo.com/v1/finance/search');
    url.searchParams.set('q', text);
    url.searchParams.set('quotesCount', '8');
    url.searchParams.set('newsCount', '0');
    const response = await this.fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error('Symbol search is unavailable.');
    const body = await response.json();
    return (body.quotes ?? []).filter((item) => ['EQUITY', 'ETF'].includes(item.quoteType)).slice(0, 8).flatMap((item) => {
      const symbol = selected === 'stooq' ? stooqSymbol(item) : String(item.symbol ?? '').toUpperCase();
      return SYMBOL.test(symbol) ? [{ symbol, name: placeName(item.shortname || item.longname) || symbol, exchange: placeName(item.exchDisp) }] : [];
    });
  }

  async #weather(weather) {
    if (weather.latitude == null) return null;
    try {
      const reading = weather.provider === 'openweather'
        ? await this.#openWeather(weather)
        : await this.#openMeteo(weather);
      reading.latitude = weather.latitude;
      try { reading.sun = await readSun(weather, this.fetch); }
      catch { /* Daylight keeps the last successful sunrise and sunset. */ }
      return reading;
    } catch (error) {
      this.log('Could not read the weather feed.');
      return { error: error.message };
    }
  }

  async #openWeather(weather) {
    const key = secret(this.raw, 'weatherApiKey');
    const url = new URL('https://api.openweathermap.org/data/2.5/weather');
    url.searchParams.set('lat', String(weather.latitude));
    url.searchParams.set('lon', String(weather.longitude));
    url.searchParams.set('units', 'metric');
    url.searchParams.set('appid', key);
    const response = await this.fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error('OpenWeather is unavailable.');
    const body = await response.json();
    const temperature = Math.round(body?.main?.temp);
    const label = body?.weather?.[0]?.main || 'Weather';
    const low = body?.main?.temp_min;
    const high = body?.main?.temp_max;
    if (!Number.isFinite(temperature)) throw new Error('OpenWeather did not return a temperature.');
    return {
      temperature, label, line: `${temperature}° · ${label}`,
      low: Number.isFinite(low) ? Math.round(low) : null,
      high: Number.isFinite(high) ? Math.round(high) : null,
    };
  }

  async #openMeteo(weather) {
    const forecast = await readForecast(weather, this.fetch);
    const [temperature, label] = forecast.line.split(' · ');
    return { temperature: Number.parseInt(temperature, 10), label, line: forecast.line, low: forecast.low, high: forecast.high };
  }

  async #quotes(quotes) {
    if (!quotes.symbols.length) return [];
    try {
      if (quotes.provider === 'yahoo') {
        const rows = [];
        for (const symbol of quotes.symbols) {
          try { rows.push(await this.#yahooQuote(symbol)); }
          catch (error) { rows.push({ symbol, error: error.message }); }
        }
        if (rows.some((row) => row.error)) this.log('Could not read the quote feed.');
        return rows;
      }
      if (quotes.provider === 'finnhub') {
        const key = secret(this.raw, 'quotesApiKey');
        const rows = [];
        for (const symbol of quotes.symbols) {
          const url = new URL('https://finnhub.io/api/v1/quote');
          url.searchParams.set('symbol', symbol);
          url.searchParams.set('token', key);
          const response = await this.fetch(url, { signal: AbortSignal.timeout(8_000) });
          if (!response.ok) throw new Error('Finnhub is unavailable.');
          const body = await response.json();
          if (!Number.isFinite(body?.c)) throw new Error(`Finnhub has no price for ${symbol}.`);
          rows.push({ symbol, price: body.c, change: Number.isFinite(body.dp) ? body.dp : null });
        }
        return rows;
      }
      const url = new URL('https://stooq.com/q/l/');
      url.searchParams.set('s', quotes.symbols.join(' '));
      url.searchParams.set('f', 'sc');
      url.searchParams.set('h', '');
      url.searchParams.set('e', 'csv');
      const response = await this.fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error('Stooq is unavailable.');
      return String(await response.text()).trim().split(/\r?\n/).slice(1).flatMap((row) => {
        const [symbol, price] = row.split(',');
        const value = Number(price);
        return symbol && Number.isFinite(value) ? [{ symbol, price: value, change: null }] : [];
      });
    } catch (error) {
      this.log('Could not read the quote feed.');
      return [{ error: error.message }];
    }
  }

  async #yahooQuote(symbol) {
    const yahoo = yahooSymbol(symbol);
    let stats = null;
    try {
      const url = new URL('https://query1.finance.yahoo.com/v7/finance/quote');
      url.searchParams.set('symbols', yahoo);
      const response = await this.#yahoo(url);
      if (response.ok) stats = sessionStats((await response.json())?.quoteResponse?.result?.[0]);
    } catch { stats = null; }
    if (stats?.price == null) {
      const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}`);
      url.searchParams.set('range', '1d');
      url.searchParams.set('interval', '1d');
      const response = await this.#yahoo(url);
      if (!response.ok) throw new Error(`Yahoo Finance has no price for ${symbol}.`);
      stats = sessionStats((await response.json())?.chart?.result?.[0]?.meta);
    }
    if (stats?.price == null) throw new Error(`Yahoo Finance has no price for ${symbol}.`);
    return { symbol, ...stats };
  }

  async #yahoo(url) {
    const headers = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };
    const first = await this.fetch(url, { headers, signal: AbortSignal.timeout(8_000) });
    if (first.ok || ![401, 403].includes(first.status)) return first;
    const consent = await this.fetch('https://fc.yahoo.com', { headers, redirect: 'manual', signal: AbortSignal.timeout(8_000) });
    const setCookie = typeof consent.headers?.getSetCookie === 'function' ? consent.headers.getSetCookie() : [consent.headers?.get?.('set-cookie')];
    const cookie = setCookie.filter(Boolean).map((item) => String(item).split(';')[0]).join('; ');
    const crumbResponse = await this.fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { ...headers, Cookie: cookie }, signal: AbortSignal.timeout(8_000),
    });
    const crumb = (await crumbResponse.text()).trim();
    if (crumb && !crumb.startsWith('<')) url.searchParams.set('crumb', crumb);
    return this.fetch(url, { headers: { ...headers, Cookie: cookie }, signal: AbortSignal.timeout(8_000) });
  }

  async #rate(pair) {
    const hosts = [
      ['https://api.frankfurter.dev/v1/latest', 'base', 'symbols'],
      ['https://api.frankfurter.app/latest', 'from', 'to'],
    ];
    let last = new Error('Frankfurter is unavailable.');
    if (pair.includes('JPN')) throw new Error('Yen uses JPY. Add EURJPY.');
    for (const [origin, fromKey, toKey] of hosts) {
      try {
        const url = new URL(origin);
        url.searchParams.set(fromKey, pair.slice(0, 3));
        url.searchParams.set(toKey, pair.slice(3));
        const response = await this.fetch(url, { signal: AbortSignal.timeout(8_000) });
        if (!response.ok) throw new Error('Frankfurter is unavailable.');
        const rate = (await response.json())?.rates?.[pair.slice(3)];
        if (!Number.isFinite(rate)) throw new Error(`Frankfurter has no rate for ${pair}.`);
        return rate;
      } catch (error) {
        last = error;
      }
    }
    throw last;
  }

  async #fx(pair) {
    if (pair.includes('JPN')) throw new Error('Yen uses JPY. Add EURJPY.');
    try {
      const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(`${pair}=X`)}`);
      url.searchParams.set('range', '1d');
      url.searchParams.set('interval', '1d');
      const response = await this.#yahoo(url);
      if (response.ok) {
        const stats = sessionStats((await response.json())?.chart?.result?.[0]?.meta);
        if (stats.price != null) return { pair, rate: stats.price, change: stats.change, open: stats.open, high: stats.high, low: stats.low, close: stats.close };
      }
    } catch { /* Frankfurter still has the rate. */ }
    return { pair, rate: await this.#rate(pair) };
  }

  async #currencies(pairs) {
    if (!pairs.length) return [];
    const rows = [];
    for (const pair of pairs) {
      try { rows.push(await this.#fx(pair)); }
      catch (error) {
        this.log('Could not read the currency feed.');
        rows.push({ pair, error: error.message });
      }
    }
    return rows;
  }
}

module.exports = { Feeds, OPTIONAL, MAX_SYMBOLS, MAX_PAIRS };
