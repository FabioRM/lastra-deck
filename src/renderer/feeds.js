'use strict';

(() => {
  const api = window.lastra ?? window.LastraDeckPreview?.panels;
  if (!api?.readFeeds) return;
  const { t } = window.LastraI18n;
  const panel = document.getElementById('feeds-panel');
  const status = document.getElementById('feeds-panel-status');
  const weather = document.getElementById('feeds-weather');
  const place = document.getElementById('feeds-place');
  const temp = document.getElementById('feeds-temp');
  const condition = document.getElementById('feeds-condition');
  const moonState = document.getElementById('feeds-moon-state');
  const range = document.getElementById('feeds-range');
  const quotes = document.getElementById('feeds-quotes');
  const currencies = document.getElementById('feeds-currencies');
  const accents = ['#8ac8c1', '#e0b45c', '#a3abda', '#d79bb5', '#8fd19e', '#f2bf72'];
  let timer = null;
  if (!weather || !place || !quotes) return;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  let solar = null;
  const moonLit = document.getElementById('feeds-moon-lit');

  function arc(progress) {
    const angle = Math.PI * (1 - Math.min(1, Math.max(0, progress)));
    return { x: 50 + Math.cos(angle) * 36, y: 72 - Math.sin(angle) * 54 };
  }

  function moonCycle(date) {
    const synodic = 29.530588853;
    const knownNew = Date.UTC(2000, 0, 6, 18, 14);
    const age = ((date.getTime() - knownNew) / 86_400_000) % synodic;
    return ((age + synodic) % synodic) / synodic;
  }

  function moonName(cycle) {
    if (cycle < 0.03 || cycle > 0.97) return 'new';
    if (cycle < 0.22) return 'waxing-crescent';
    if (cycle < 0.28) return 'first-quarter';
    if (cycle < 0.47) return 'waxing-gibbous';
    if (cycle < 0.53) return 'full';
    if (cycle < 0.72) return 'waning-gibbous';
    if (cycle < 0.78) return 'last-quarter';
    return 'waning-crescent';
  }

  function moonPath(cycle, northern) {
    const radius = 46;
    const sweep = Math.cos(cycle * Math.PI * 2) * radius;
    const width = Math.abs(sweep);
    const litOnRight = northern ? cycle < 0.5 : cycle >= 0.5;
    const side = litOnRight ? 1 : 0;
    const large = sweep < 0 ? 1 : 0;
    return `M 50 ${50 - radius} A ${radius} ${radius} 0 0 ${side} 50 ${50 + radius} A ${width} ${radius} 0 ${large} ${side ? 0 : 1} 50 ${50 - radius} Z`;
  }

  function daylight(date) {
    const sun = solar?.sun?.dawn == null ? null : solar.sun;
    if (!sun) {
      const start = new Date(date);
      start.setHours(6, 0, 0, 0);
      const end = new Date(date);
      end.setHours(20, 0, 0, 0);
      return { dawn: start.getTime() - 1_800_000, sunrise: start.getTime(), sunset: end.getTime(), dusk: end.getTime() + 1_800_000 };
    }
    return sun;
  }

  function applySky(date = new Date()) {
    const light = daylight(date);
    const time = date.getTime();
    const phase = time < light.dawn || time >= light.dusk ? 'night'
      : time < light.sunrise ? 'dawn'
        : time < light.sunset ? 'day' : 'dusk';
    const cycle = moonCycle(date);
    const northern = (solar?.latitude ?? 41) >= 0;
    weather.dataset.phase = phase;
    weather.dataset.moon = moonName(cycle);
    const sun = time <= light.sunrise ? arc(0) : time >= light.sunset ? arc(1) : arc((time - light.sunrise) / (light.sunset - light.sunrise));
    const moonRise = time < light.dawn ? light.sunset - 86_400_000 : light.sunset;
    const moonSet = time < light.dawn ? light.dawn : light.dawn + 86_400_000;
    const moon = arc((time - moonRise) / Math.max(1, moonSet - moonRise));
    weather.style.setProperty('--sun-x', `${sun.x}%`);
    weather.style.setProperty('--sun-y', `${sun.y}%`);
    weather.style.setProperty('--moon-x', `${moon.x}%`);
    weather.style.setProperty('--moon-y', `${moon.y}%`);
    if (moonLit) moonLit.setAttribute('d', moonPath(cycle, northern));
  }

  function sceneFor(label) {
    const key = String(label ?? '').toLowerCase();
    if (key.includes('thunder')) return 'storm';
    if (key.includes('snow')) return 'snow';
    if (key.includes('rain') || key.includes('shower') || key.includes('drizzle')) return 'rain';
    if (key.includes('fog') || key.includes('mist')) return 'fog';
    if (key.includes('cloud')) return 'cloud';
    return 'clear';
  }

  function accent(symbol) {
    const total = [...String(symbol)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return accents[total % accents.length];
  }

  function mark(symbol) {
    return String(symbol).replace('.US', '').replace(/[^A-Za-z0-9]/g, '').slice(0, 4);
  }

  function digits(value, places) {
    return value.toLocaleString(undefined, { minimumFractionDigits: places, maximumFractionDigits: places });
  }

  function formatQuote(value) {
    const abs = Math.abs(value);
    return digits(value, abs >= 1000 ? 1 : abs >= 1 ? 2 : 4);
  }

  function formatChange(value) {
    const sign = value > 0 ? '+' : '';
    return `${sign}${digits(value, 1)}%`;
  }

  function orb(symbol, change) {
    const wrap = el('div', 'feeds-orb');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 80 80');
    svg.setAttribute('aria-hidden', 'true');
    const radius = 32;
    const length = 2 * Math.PI * radius;
    for (const [name, offset] of [['feeds-orb-track', length], ['feeds-orb-value', length * (1 - Math.min(1, Math.abs(change || 0) / 8))]]) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', name);
      circle.setAttribute('cx', '40');
      circle.setAttribute('cy', '40');
      circle.setAttribute('r', String(radius));
      circle.style.strokeDasharray = String(length);
      circle.style.strokeDashoffset = String(offset);
      svg.append(circle);
    }
    wrap.append(svg, el('span', 'feeds-mark', mark(symbol)));
    return wrap;
  }

  function quoteCard(item, label) {
    const card = document.createElement('li');
    card.append(el('span', 'feeds-sheen'));
    if (item.error) {
      card.dataset.direction = 'bad';
      const copy = el('div', 'feeds-quote-copy');
      copy.append(el('p', 'feeds-symbol', item.symbol || ''), el('p', 'feeds-note', t(item.error)));
      card.append(copy);
      return card;
    }
    const direction = item.change > 0.05 ? 'up' : item.change < -0.05 ? 'down' : 'flat';
    card.dataset.direction = direction;
    card.style.setProperty('--accent', accent(item.symbol));
    const copy = el('div', 'feeds-quote-copy');
    copy.append(el('p', 'feeds-symbol', item.symbol));
    if (label) copy.append(el('p', 'feeds-name', label));
    copy.append(el('p', 'feeds-price', formatQuote(item.price)));
    if (item.change != null) copy.append(el('p', 'feeds-change', formatChange(item.change)));
    card.append(orb(item.symbol, item.change), copy);
    return card;
  }

  function currencyCard(item) {
    const card = document.createElement('li');
    if (item.error || !item.pair) {
      card.dataset.direction = 'bad';
      card.append(el('p', 'feeds-symbol', item.pair || ''), el('p', 'feeds-note', t(item.error || '')));
      return card;
    }
    card.style.setProperty('--accent', accent(item.pair));
    card.append(
      el('span', 'feeds-coin', item.pair.slice(0, 3)),
      el('span', 'feeds-flow'),
      el('p', 'feeds-rate', digits(item.rate, Math.abs(item.rate) >= 100 ? 2 : 4)),
      el('span', 'feeds-flow'),
      el('span', 'feeds-coin', item.pair.slice(3)),
    );
    return card;
  }

  function show(snapshot) {
    if (!snapshot) return;
    solar = snapshot.weather ?? null;
    const reading = snapshot.weather;
    applySky();
    status.textContent = '';
    if (reading?.error) {
      weather.dataset.scene = 'storm';
      place.textContent = reading.place || '';
      temp.textContent = '';
      condition.textContent = t(reading.error);
      moonState.textContent = '';
      range.textContent = '';
    } else if (reading?.label) {
      weather.dataset.scene = sceneFor(reading.label);
      place.textContent = reading.place || '';
      temp.textContent = `${reading.temperature}°`;
      condition.textContent = t(reading.label);
      moonState.textContent = t(moonName(moonCycle(new Date())));
      range.textContent = reading.low == null || reading.high == null ? '' : `${t('Min')} ${reading.low}° · ${t('Max')} ${reading.high}°`;
    } else {
      weather.dataset.scene = 'clear';
      place.textContent = '';
      temp.textContent = '';
      condition.textContent = t('Add a latitude and longitude in Lastra Settings to show the weather.');
      moonState.textContent = '';
      range.textContent = '';
    }
    const labels = snapshot.quotes?.labels ?? {};
    quotes.replaceChildren(...(snapshot.quotes?.rows ?? []).map((item) => quoteCard(item, item.symbol ? labels[item.symbol] : '')));
    currencies.replaceChildren(...(snapshot.currencies?.rows ?? []).map(currencyCard));
  }

  async function refresh() {
    try { show(await api.readFeeds()); }
    catch (error) { status.textContent = error.message; }
  }

  function setOpen(open) {
    if (panel.hidden === !open) return;
    window.LastraDeckViews.setPanel(panel, open);
    clearInterval(timer);
    timer = null;
    if (open) {
      applySky();
      void refresh();
      timer = setInterval(() => { applySky(); void refresh(); }, 60_000);
    }
  }

  panel.addEventListener('lastra:close-view', () => setOpen(false));
  api.onFeeds?.(show);
  window.LastraFeeds = { setOpen };

  function scatter(layer, count, paint) {
    if (!layer) return;
    const nodes = [];
    for (let index = 0; index < count; index += 1) nodes.push(paint(document.createElement('i'), index));
    layer.replaceChildren(...nodes);
  }
  scatter(document.querySelector('#feeds-weather .feeds-stars'), 72, (star) => {
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 76}%`;
    const size = Math.random() < 0.12 ? 3 : Math.random() < 0.4 ? 2 : 1.2;
    star.style.width = star.style.height = `${size}px`;
    star.style.animationDuration = `${1.5 + Math.random() * 3.4}s`;
    star.style.animationDelay = `${-Math.random() * 5}s`;
    return star;
  });
  scatter(document.querySelector('#feeds-weather .feeds-rain'), 46, (drop) => {
    drop.style.left = `${Math.random() * 100}%`;
    drop.style.animationDuration = `${0.42 + Math.random() * 0.7}s`;
    drop.style.animationDelay = `${-Math.random() * 1.4}s`;
    drop.style.height = `${16 + Math.random() * 26}px`;
    drop.style.setProperty('--drift', `${Math.round(Math.random() * 36 - 10)}px`);
    return drop;
  });
  scatter(document.querySelector('#feeds-weather .feeds-snow'), 34, (flake) => {
    flake.style.left = `${Math.random() * 100}%`;
    flake.style.animationDuration = `${6 + Math.random() * 9}s`;
    flake.style.animationDelay = `${-Math.random() * 12}s`;
    flake.style.setProperty('--drift', `${Math.round(Math.random() * 56 - 28)}px`);
    return flake;
  });
  scatter(document.querySelector('#feeds-weather .feeds-meteors'), 4, (meteor, index) => {
    meteor.className = 'feeds-meteor';
    meteor.style.top = `${6 + Math.random() * 36}%`;
    meteor.style.left = `${6 + index * 20}%`;
    meteor.style.animationDuration = `${8 + Math.random() * 7}s`;
    meteor.style.animationDelay = `${-index * 2.6}s`;
    return meteor;
  });
})();
