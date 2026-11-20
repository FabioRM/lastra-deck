// @ts-check
'use strict';

// The CommonJS build exports the namespace object that the bundled typings describe as the default export.
const ICAL = /** @type {typeof import('ical.js').default} */ (/** @type {unknown} */ (require('ical.js')));

const MAX_BYTES = 512 * 1024;
const MAX_EVENTS = 256;
const MAX_OCCURRENCES = 2048;
const MAX_TOTAL_OCCURRENCES = 16_384;
const TEMPORAL = ['dtstart', 'dtend', 'recurrence-id', 'exdate', 'rdate'];
const CONFERENCE_FIELDS = ['conference', 'x-microsoft-skypeteamsmeetingurl', 'url', 'location'];

function joinLink(input) {
  if (typeof input !== 'string' || input.length > 2048 || !/^https:\/\//i.test(input) || /[\s\\\p{Cc}]/u.test(input)) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
    const { hostname: host, pathname } = url;
    if (host === 'meet.google.com' && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/i.test(pathname)) return url.href;
    if ((host === 'teams.microsoft.com' || host === 'teams.cloud.microsoft') && /^\/l\/meetup-join\/[^/]+\/\d+\/?$/.test(pathname)) return url.href;
    if (host === 'teams.live.com' && /^\/meet\/\d+\/?$/.test(pathname)) return url.href;
    if ((host === 'zoom.us' || host.endsWith('.zoom.us')) && /^\/[jw]\/\d+\/?$/.test(pathname)) return url.href;
  } catch { /* Ignore a malformed meeting link. */ }
  return null;
}

function conference(component) {
  for (const name of CONFERENCE_FIELDS) {
    for (const property of component.getAllProperties(name).slice(0, 8)) {
      const target = joinLink(property.getFirstValue());
      if (target) return target;
    }
  }
  const description = component.getFirstPropertyValue('description');
  const hints = typeof description === 'string' ? description.slice(0, 8192).match(/https:\/\/[^<>\s"']+/gi) ?? [] : [];
  for (const hint of hints.slice(0, 12)) {
    const target = joinLink(hint.replace(/[.,;)\]]+$/, ''));
    if (target) return target;
  }
  return null;
}

function knownTimes(component) {
  return TEMPORAL.every((name) => component.getAllProperties(name).every((property) => {
    const zone = property.getParameter('tzid');
    return !zone || ['UTC', 'GMT', 'Z'].includes(zone) || Boolean(component.getTimeZoneByID(zone));
  }));
}

function cancelled(component) { return String(component.getFirstPropertyValue('status')).toUpperCase() === 'CANCELLED'; }

function timeValue(value) {
  const millis = value?.toJSDate().getTime();
  return Number.isSafeInteger(millis) ? millis : null;
}

function summary(value) {
  return typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) : '';
}

function eventRecord(component, start, end, uid, now, original) {
  const startAt = timeValue(start);
  const endAt = timeValue(end);
  if (startAt === null || endAt === null || endAt < startAt) return null;
  const allDay = start.isDate === true;
  const lastAt = endAt === startAt ? startAt + 60_000 : endAt;
  if (lastAt <= now) return null;
  return { uid, startAt, endAt, lastAt, allDay,
    title: summary(component.getFirstPropertyValue('summary')) || summary(original?.getFirstPropertyValue('summary')) || 'Calendar event',
    joinUrl: allDay ? null : conference(component) ?? (original ? conference(original) : null) };
}

function recordsFor(components, now, budget) {
  const candidates = [];
  let partial = false;
  const byId = new Map();
  for (const [index, component] of components.entries()) {
    const uid = component.getFirstPropertyValue('uid');
    const id = typeof uid === 'string' && uid.length <= 256 && uid ? uid : `anonymous-event-${index}`;
    const grouped = byId.get(id) ?? { masters: [], exceptions: [] };
    const exception = component.hasProperty('recurrence-id');
    grouped[exception ? 'exceptions' : 'masters'].push(component);
    byId.set(id, grouped);
  }

  for (const [uid, { masters, exceptions }] of byId) {
    if (masters.length > 1) { partial = true; continue; }
    const main = masters[0];
    if (main && cancelled(main)) continue;
    try {
      if (main && !knownTimes(main)) { partial = true; continue; }
      const overrides = new Map();
      let supported = true;
      for (const component of exceptions) {
        if (!knownTimes(component) || component.getFirstProperty('recurrence-id').getParameter('range')) { supported = false; break; }
        const original = timeValue(component.getFirstPropertyValue('recurrence-id'));
        if (original === null) { supported = false; break; }
        if (overrides.has(original)) { overrides.set(original, null); partial = true; }
        else overrides.set(original, component);
      }
      if (!supported) { partial = true; continue; }
      for (const component of overrides.values()) {
        if (!component || cancelled(component)) continue;
        const day = new ICAL.Event(component, { exceptions: [] });
        const record = eventRecord(component, day.startDate, day.endDate, uid, now, main);
        if (record) candidates.push(record);
      }
      if (!main) continue;
      const event = new ICAL.Event(main, { exceptions: [] });
      if (!event.isRecurring()) {
        const record = eventRecord(main, event.startDate, event.endDate, uid, now);
        if (record) candidates.push(record);
        continue;
      }
      const iterator = event.iterator();
      let completed = false;
      for (let index = 0; index < MAX_OCCURRENCES && budget.remaining > 0; index++, budget.remaining--) {
        const occurrence = iterator.next();
        if (!occurrence) { completed = true; break; }
        if (overrides.has(timeValue(occurrence))) continue;
        const { startDate, endDate } = event.getOccurrenceDetails(occurrence);
        const record = eventRecord(main, startDate, endDate, uid, now);
        if (record) { candidates.push(record); completed = true; break; }
      }
      if (!completed) partial = true;
    } catch { partial = true; }
  }
  return { candidates, partial };
}

function parseAgenda(input, now) {
  if (typeof input !== 'string' || Buffer.byteLength(input) > MAX_BYTES) throw new Error('The calendar file exceeds 512 KiB.');
  const parsed = ICAL.parse(input.replace(/^\uFEFF/, ''));
  if (parsed?.[0] !== 'vcalendar') throw new Error('The calendar file needs a single iCalendar schedule.');
  const calendar = new ICAL.Component(parsed);
  if (String(calendar.getFirstPropertyValue('method')).toUpperCase() === 'CANCEL') return { next: null, partial: false };
  const components = calendar.getAllSubcomponents('vevent');
  const { candidates, partial } = recordsFor(components.slice(0, MAX_EVENTS), now, { remaining: MAX_TOTAL_OCCURRENCES });
  candidates.sort((a, b) => a.startAt - b.startAt || a.endAt - b.endAt);
  const initial = candidates[0] ?? null;
  const next = initial?.allDay && initial.startAt <= now
    ? candidates.find((item) => !item.allDay && item.startAt < initial.endAt) ?? initial
    : initial;
  return { next, partial: partial || components.length > MAX_EVENTS };
}

module.exports = { MAX_BYTES, joinLink, parseAgenda };
