'use strict';

{
  const clocks = new Map();

  function readingTime(stamp) {
    if (!Number.isFinite(stamp) || stamp <= 0 || stamp > 8.64e15) return '';
    const language = typeof window === 'object' ? window.LastraI18n?.language : undefined;
    if (!clocks.has(language)) clocks.set(language, new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    return clocks.get(language).format(stamp);
  }

  function lastReading(stamp) {
    const time = readingTime(stamp);
    if (!time) return '';
    return typeof window === 'object' && window.LastraI18n
      ? window.LastraI18n.t('Updated {time}', { time }) : 'Updated ' + time;
  }

  const api = { readingTime, lastReading };
  if (typeof module === 'object') module.exports = api;
  else window.LastraReadingTime = api;
}
