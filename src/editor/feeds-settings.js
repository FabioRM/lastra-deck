'use strict';

window.bindLastraFeeds = function bindLastraFeeds(api) {
  const { t } = window.LastraI18n;
  const byId = (id) => document.getElementById(id);
  const status = byId('feeds-status');
  const placeLine = byId('feeds-place');
  const symbolList = byId('feeds-symbol-list');
  const symbolCount = byId('feeds-symbol-count');
  const currencyList = byId('feeds-currency-list');
  const maxSymbols = 12;
  const maxPairs = 6;
  if (!byId('feeds-enabled') || !api.getFeeds) return;

  const fields = {
    enabled: byId('feeds-enabled'), dashboard: byId('feeds-dashboard'), stats: byId('feeds-stats'),
    weatherProvider: byId('feeds-weather-provider'), weatherKey: byId('feeds-weather-key'),
    placeQuery: byId('feeds-place-query'), placeResults: byId('feeds-place-results'),
    quotesProvider: byId('feeds-quotes-provider'), quotesKey: byId('feeds-quotes-key'),
    symbolQuery: byId('feeds-symbol-query'), symbolResults: byId('feeds-symbol-results'),
    currencyQuery: byId('feeds-currency-query'),
  };
  let place = null;
  let symbols = [];
  let labels = {};
  let pairs = [];
  let placeTimer = 0;
  let symbolTimer = 0;

  function chip(text, remove) {
    const item = document.createElement('li');
    item.append(document.createTextNode(text));
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '×';
    button.setAttribute('aria-label', t('Remove {name}', { name: text }));
    button.addEventListener('click', remove);
    item.append(button);
    return item;
  }

  function paintLists() {
    placeLine.hidden = !place;
    placeLine.textContent = place ? `${place.name} · ${place.latitude}, ${place.longitude}` : '';
    symbolList.replaceChildren(...symbols.map((symbol) => chip(labels[symbol] ? `${symbol} · ${labels[symbol]}` : symbol, () => {
      symbols = symbols.filter((item) => item !== symbol);
      delete labels[symbol];
      paintLists();
    })));
    symbolCount.textContent = t('{count} of {max} symbols', { count: symbols.length, max: maxSymbols });
    currencyList.replaceChildren(...pairs.map((pair) => chip(pair, () => {
      pairs = pairs.filter((item) => item !== pair);
      paintLists();
    })));
    fields.symbolQuery.disabled = symbols.length >= maxSymbols;
    byId('feeds-currency-add').disabled = pairs.length >= maxPairs;
  }

  function show(settings) {
    fields.enabled.checked = settings.views?.feeds !== false && settings.enabled !== false;
    fields.dashboard.checked = settings.views.dashboard !== false;
    fields.stats.checked = settings.views.stats !== false;
    fields.weatherProvider.value = settings.weather.provider;
    fields.weatherKey.value = '';
    fields.weatherKey.placeholder = settings.weather.hasKey ? t('Saved API key') : t('Only for OpenWeather');
    fields.quotesProvider.value = settings.quotes.provider || 'yahoo';
    fields.quotesKey.value = '';
    fields.quotesKey.placeholder = settings.quotes.hasKey ? t('Saved API key') : t('Only for Finnhub');
    place = settings.weather.latitude == null ? null : {
      name: settings.weather.place || t('Saved location'),
      latitude: settings.weather.latitude,
      longitude: settings.weather.longitude,
    };
    symbols = [...settings.quotes.symbols];
    labels = { ...settings.quotes.labels };
    pairs = [...settings.currencies.pairs];
    paintLists();
  }

  function results(list, items, choose) {
    list.hidden = !items.length;
    list.replaceChildren(...items.map((item) => {
      const entry = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.exchange ? `${item.symbol} · ${item.name} · ${item.exchange}` : item.name;
      button.addEventListener('click', () => choose(item));
      entry.append(button);
      return entry;
    }));
  }

  async function save() {
    status.textContent = '';
    const weather = {
      provider: fields.weatherProvider.value,
      latitude: place?.latitude ?? '',
      longitude: place?.longitude ?? '',
      place: place?.name ?? '',
    };
    const quotes = { provider: fields.quotesProvider.value, symbols, labels };
    if (fields.weatherKey.value.trim()) weather.apiKey = fields.weatherKey.value;
    if (fields.quotesKey.value.trim()) quotes.apiKey = fields.quotesKey.value;
    try {
      const saved = await api.setFeeds({
        enabled: fields.enabled.checked,
        views: { dashboard: fields.dashboard.checked, stats: fields.stats.checked },
        weather, quotes, currencies: { pairs },
      });
      show(saved);
      status.textContent = t('Feeds saved.');
    } catch (error) {
      status.textContent = error.message;
    }
  }

  fields.placeQuery.addEventListener('input', () => {
    clearTimeout(placeTimer);
    const query = fields.placeQuery.value.trim();
    if (query.length < 2) { fields.placeResults.hidden = true; return; }
    placeTimer = setTimeout(async () => {
      try { results(fields.placeResults, await api.searchFeedPlaces(query), (item) => {
        place = item;
        fields.placeQuery.value = '';
        fields.placeResults.hidden = true;
        paintLists();
      }); }
      catch (error) { status.textContent = error.message; }
    }, 250);
  });
  byId('feeds-locate').addEventListener('click', async () => {
    status.textContent = t('Finding the current location…');
    try {
      place = await api.locateFeeds();
      status.textContent = '';
      paintLists();
    } catch (error) { status.textContent = error.message; }
  });
  fields.symbolQuery.addEventListener('input', () => {
    clearTimeout(symbolTimer);
    const query = fields.symbolQuery.value.trim();
    if (!query) { fields.symbolResults.hidden = true; return; }
    symbolTimer = setTimeout(async () => {
      try { results(fields.symbolResults, await api.searchFeedSymbols(query), (item) => {
        if (symbols.length >= maxSymbols || symbols.includes(item.symbol)) return;
        symbols.push(item.symbol);
        labels[item.symbol] = item.name;
        fields.symbolQuery.value = '';
        fields.symbolResults.hidden = true;
        paintLists();
      }); }
      catch (error) { status.textContent = error.message; }
    }, 250);
  });
  byId('feeds-currency-add').addEventListener('click', () => {
    const pair = fields.currencyQuery.value.trim().toUpperCase();
    if (!/^[A-Z]{6}$/.test(pair) || pairs.includes(pair) || pairs.length >= maxPairs) {
      status.textContent = t('Enter a currency pair such as EURUSD.');
      return;
    }
    pairs.push(pair);
    fields.currencyQuery.value = '';
    status.textContent = '';
    paintLists();
  });
  byId('feeds-save').addEventListener('click', () => { void save(); });
  api.getFeeds().then(show).catch((error) => { status.textContent = error.message; });
};
