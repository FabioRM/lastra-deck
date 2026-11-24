'use strict';

window.bindLastraFeeds = function bindLastraFeeds(api) {
  const { t } = window.LastraI18n;
  const byId = (id) => document.getElementById(id);
  const status = byId('feeds-status');
  const placeLine = byId('feeds-place');
  const symbolList = byId('feeds-symbol-list');
  const symbolCount = byId('feeds-symbol-count');
  const currencyList = byId('feeds-currency-list');
  const editor = byId('feeds-fields');
  const saveButton = byId('feeds-save');
  const boardLimit = 8;
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
  let placeRequest = 0;
  let symbolRequest = 0;
  let loaded = false;
  let loading = false;
  let savedQuotesProvider;

  function report(message, error = false) {
    status.textContent = t(message);
    status.classList.toggle('error', error);
  }

  function updateKeyFields() {
    fields.weatherKey.disabled = fields.weatherProvider.value !== 'openweather';
    fields.quotesKey.disabled = fields.quotesProvider.value !== 'finnhub';
  }

  function updateSymbolField() {
    const changePending = fields.quotesProvider.value !== savedQuotesProvider;
    byId('feeds-provider-hint').hidden = !changePending;
    fields.symbolQuery.disabled = changePending || symbols.length + pairs.length >= boardLimit;
  }

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
    symbolCount.textContent = t('{count} of {max} on the deck', { count: symbols.length + pairs.length, max: boardLimit });
    currencyList.replaceChildren(...pairs.map((pair) => chip(pair, () => {
      pairs = pairs.filter((item) => item !== pair);
      paintLists();
    })));
    const full = symbols.length + pairs.length >= boardLimit;
    updateSymbolField();
    byId('feeds-currency-add').disabled = full;
  }

  function show(settings) {
    fields.enabled.checked = settings.views?.feeds !== false && settings.enabled !== false;
    fields.dashboard.checked = settings.views.dashboard !== false;
    fields.stats.checked = settings.views.stats !== false;
    fields.weatherProvider.value = settings.weather.provider;
    fields.weatherKey.value = '';
    fields.weatherKey.placeholder = settings.weather.hasKey ? t('Saved API key') : t('Only for OpenWeather');
    savedQuotesProvider = settings.quotes.provider || 'yahoo';
    fields.quotesProvider.value = savedQuotesProvider;
    fields.quotesKey.value = '';
    fields.quotesKey.placeholder = settings.quotes.hasKey ? t('Saved API key') : t('Only for Finnhub');
    updateKeyFields();
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
    if (editor.disabled) return;
    editor.disabled = saveButton.disabled = true;
    placeRequest++;
    symbolRequest++;
    fields.placeResults.hidden = fields.symbolResults.hidden = true;
    report('Saving Feeds…');
    const weather = {
      provider: fields.weatherProvider.value,
      latitude: place?.latitude ?? '',
      longitude: place?.longitude ?? '',
      place: place?.name ?? '',
    };
    const quotes = { provider: fields.quotesProvider.value, symbols, labels };
    if (!fields.weatherKey.disabled && fields.weatherKey.value.trim()) weather.apiKey = fields.weatherKey.value;
    if (!fields.quotesKey.disabled && fields.quotesKey.value.trim()) quotes.apiKey = fields.quotesKey.value;
    try {
      const saved = await api.setFeeds({
        enabled: fields.enabled.checked,
        views: { dashboard: fields.dashboard.checked, stats: fields.stats.checked },
        weather, quotes, currencies: { pairs },
      });
      show(saved);
      report('Feeds saved.');
    } catch (error) {
      report(error.message || 'Could not save Feeds.', true);
    } finally {
      editor.disabled = saveButton.disabled = false;
      if (document.activeElement === document.body) saveButton.focus({ preventScroll: true });
    }
  }

  fields.weatherProvider.addEventListener('change', updateKeyFields);
  fields.quotesProvider.addEventListener('change', () => {
    symbolRequest++;
    clearTimeout(symbolTimer);
    fields.symbolResults.hidden = true;
    updateKeyFields();
    updateSymbolField();
  });
  fields.placeQuery.addEventListener('input', () => {
    clearTimeout(placeTimer);
    const request = ++placeRequest;
    const query = fields.placeQuery.value.trim();
    fields.placeResults.hidden = true;
    report('');
    if (query.length < 2) return;
    placeTimer = setTimeout(async () => {
      try {
        const items = await api.searchFeedPlaces(query);
        if (request !== placeRequest) return;
        results(fields.placeResults, items, (item) => {
          place = item;
          fields.placeQuery.value = '';
          fields.placeResults.hidden = true;
          paintLists();
          fields.placeQuery.focus();
        });
      } catch (error) { if (request === placeRequest) report(error.message, true); }
    }, 250);
  });
  byId('feeds-locate').addEventListener('click', async () => {
    const request = ++placeRequest;
    clearTimeout(placeTimer);
    fields.placeResults.hidden = true;
    report('Finding the current location…');
    try {
      const next = await api.locateFeeds();
      if (request !== placeRequest) return;
      place = next;
      fields.placeQuery.value = '';
      report('');
      paintLists();
    } catch (error) { if (request === placeRequest) report(error.message, true); }
  });
  fields.symbolQuery.addEventListener('input', () => {
    clearTimeout(symbolTimer);
    const request = ++symbolRequest;
    const query = fields.symbolQuery.value.trim();
    fields.symbolResults.hidden = true;
    report('');
    if (!query) return;
    symbolTimer = setTimeout(async () => {
      try {
        const items = await api.searchFeedSymbols(query);
        if (request !== symbolRequest) return;
        results(fields.symbolResults, items, (item) => {
          if (symbols.length + pairs.length >= boardLimit || symbols.includes(item.symbol)) return;
          symbols.push(item.symbol);
          labels[item.symbol] = item.name;
          fields.symbolQuery.value = '';
          fields.symbolResults.hidden = true;
          paintLists();
          (fields.symbolQuery.disabled ? saveButton : fields.symbolQuery).focus();
        });
      } catch (error) { if (request === symbolRequest) report(error.message, true); }
    }, 250);
  });
  byId('feeds-currency-add').addEventListener('click', () => {
    const pair = fields.currencyQuery.value.trim().toUpperCase();
    if (!/^[A-Z]{6}$/.test(pair) || pairs.includes(pair) || symbols.length + pairs.length >= boardLimit) {
      report(pairs.includes(pair) ? 'This currency pair is already on the deck.' : 'Enter a currency pair such as EURUSD.', true);
      return;
    }
    pairs.push(pair);
    fields.currencyQuery.value = '';
    report('');
    paintLists();
  });
  saveButton.addEventListener('click', () => void save());
  byId('feeds-settings-panel').addEventListener('settings:open', async () => {
    if (loaded || loading) return;
    loading = true;
    report('Loading Feeds settings…');
    try {
      show(await api.getFeeds());
      loaded = true;
      editor.disabled = saveButton.disabled = false;
      report('');
    } catch (error) {
      report(error.message || 'Could not load Feeds settings.', true);
    } finally {
      loading = false;
    }
  });
};
