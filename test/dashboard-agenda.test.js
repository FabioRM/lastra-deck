'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { MAX_BYTES, joinLink, parseAgenda } = require('../src/main/calendar-agenda');
const { DashboardAgenda, parseCalendar } = require('../src/main/dashboard-agenda');
const { deckRequestAllowed } = require('../src/main/deck-view-only');
const { tempDir } = require('./helpers/temp-dir');

const calendar = (...lines) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lastra fixture//EN', ...lines.flat(), 'END:VCALENDAR', ''].join('\r\n');
const event = (...lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'];
const rome = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Rome', 'BEGIN:DAYLIGHT', 'DTSTART:19700329T020000', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT', 'BEGIN:STANDARD', 'DTSTART:19701025T030000', 'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE',
];
const demo = (title = 'Calendar fixture', meeting = 'https://meet.google.com/abc-defg-hij') => calendar(event(
  'UID:private-agenda-id', 'DTSTART:20300124T100000Z', 'DTEND:20300124T110000Z', `SUMMARY:${title}`,
  `URL:${meeting}`, 'DESCRIPTION:private organizer details', 'ATTENDEE:mailto:private@example.test',
));
const now = Date.parse('2030-01-24T09:00:00Z');
const allowed = () => true;

test('calendar parsing preserves local time and recurring wall time across the DST boundary', () => {
  const recurring = event('UID:dst-series', 'SUMMARY:Daily stand-up', 'DTSTART;TZID=Europe/Rome:20260328T093000',
    'DTEND;TZID=Europe/Rome:20260328T100000', 'RRULE:FREQ=DAILY;COUNT=3');
  const payload = calendar(rome, recurring);
  const before = parseAgenda(payload, Date.parse('2026-03-28T08:00:00Z'));
  assert.equal(before.partial, false);
  assert.equal(before.next.startAt, Date.parse('2026-03-28T08:30:00Z'));
  const after = parseAgenda(payload, Date.parse('2026-03-28T09:01:00Z'));
  assert.equal(after.next.startAt, Date.parse('2026-03-29T07:30:00Z'));
  assert.equal(after.next.endAt, Date.parse('2026-03-29T08:00:00Z'));

  const floating = parseAgenda(calendar(event('UID:wall-clock', 'DTSTART:20260401T180000', 'SUMMARY:Local time')), 0);
  assert.equal(floating.next.startAt, new Date(2026, 3, 1, 18).getTime());
  const allDay = parseAgenda(calendar(event('UID:date-only', 'DTSTART;VALUE=DATE:20260401', 'SUMMARY:Day off',
    'URL:https://meet.google.com/abc-defg-hij')), 0);
  assert.equal(allDay.next.allDay, true);
  assert.equal(allDay.next.startAt, new Date(2026, 3, 1).getTime());
  assert.equal(allDay.next.endAt, new Date(2026, 3, 2).getTime());
  assert.equal(allDay.next.joinUrl, null);
});

test('calendar skips excluded and cancelled occurrences, honors explicit replacements, and bounds long recurrence', () => {
  const base = event('UID:repeat', 'SUMMARY:Check-in', 'DTSTART:20300124T090000Z', 'DTEND:20300124T093000Z',
    'RRULE:FREQ=DAILY;COUNT=4', 'EXDATE:20300124T090000Z');
  const cancelled = event('UID:repeat', 'RECURRENCE-ID:20300125T090000Z', 'STATUS:CANCELLED');
  const replacement = event('UID:repeat', 'RECURRENCE-ID:20300126T090000Z', 'DTSTART:20300126T120000Z', 'DTEND:20300126T123000Z',
    'SUMMARY:Moved check-in', 'CONFERENCE;VALUE=URI:https://meet.google.com/abc-defg-hij');
  const next = parseAgenda(calendar(base, cancelled, replacement), now);
  assert.equal(next.partial, false);
  assert.equal(next.next.title, 'Moved check-in');
  assert.equal(next.next.startAt, Date.parse('2030-01-26T12:00:00Z'));
  assert.equal(next.next.joinUrl, 'https://meet.google.com/abc-defg-hij');

  const tooOld = event('UID:historic', 'DTSTART:20000101T000000Z', 'RRULE:FREQ=MINUTELY', 'SUMMARY:Long series');
  const limited = parseAgenda(calendar(tooOld, event('UID:next', 'DTSTART:20300124T100000Z', 'SUMMARY:Concrete event')), now);
  assert.equal(limited.partial, true);
  assert.equal(limited.next.title, 'Concrete event');
  const unsupported = event('UID:tz-absent', 'DTSTART;TZID=Other/Time:20300124T100000', 'SUMMARY:Unknown offset');
  assert.deepEqual(parseAgenda(calendar(unsupported), now), { next: null, partial: true });
  const unknownOverride = event('UID:repeat', 'RECURRENCE-ID;RANGE=THISANDFUTURE:20300125T090000Z', 'DTSTART:20300125T100000Z');
  assert.deepEqual(parseAgenda(calendar(base, unknownOverride), now), { next: null, partial: true });
});

test('a timed meeting stays visible during an all-day event and only recognized HTTPS meetings may be joined', () => {
  const allDayStart = new Date(2030, 0, 24, 9).getTime();
  const data = calendar(event('UID:all-day', 'DTSTART;VALUE=DATE:20300124', 'SUMMARY:All day'),
    event('UID:call', 'DTSTART:20300124T100000', 'SUMMARY:Local meeting', 'DESCRIPTION:Join https://example.zoom.us/j/123456789?pwd=sample.'));
  const selected = parseAgenda(data, allDayStart);
  assert.equal(selected.next.title, 'Local meeting');
  assert.equal(selected.next.joinUrl, 'https://example.zoom.us/j/123456789?pwd=sample');
  assert.equal(joinLink('https://teams.microsoft.com/l/meetup-join/19%3Ameeting_abc%40thread.v2/0?context=test'),
    'https://teams.microsoft.com/l/meetup-join/19%3Ameeting_abc%40thread.v2/0?context=test');
  for (const url of ['http://meet.google.com/abc-defg-hij', 'https://meet.google.com.evil.test/abc-defg-hij',
    'https://user:secret@meet.google.com/abc-defg-hij', 'https://meet.google.com:9443/abc-defg-hij',
    'https://zoom.us/signin', 'https://zoom.us/j/12345#other', 'https://localhost/j/12345', 'file:///C:/fixture.ics']) {
    assert.equal(joinLink(url), null, url);
  }
});

function agendaFixture(t, additional = {}) {
  const directory = tempDir(t, 'lastra-agenda-');
  const selected = path.join(directory, 'private-calendar-name.ics');
  const settings = path.join(directory, 'dashboard-agenda.json');
  const opened = [];
  fs.writeFileSync(selected, demo());
  const providers = { choose: async () => selected, open: async (url) => opened.push(url), now: () => now, ...additional };
  return { selected, settings, opened, agenda: new DashboardAgenda(settings, providers), providers };
}

test('Dashboard agenda persists only a confirmed local source and dispatches a fresh explicit meeting token', async (t) => {
  const { agenda, settings, selected, opened, providers } = agendaFixture(t);
  assert.equal((await agenda.request({ type: 'read' }, allowed)).state.status, 'setup');
  assert.equal(fs.existsSync(settings), false);
  const selectedView = await agenda.request({ type: 'pick' }, allowed);
  assert.equal(selectedView.ok, true);
  assert.equal(selectedView.state.event.title, 'Calendar fixture');
  assert.doesNotMatch(JSON.stringify(selectedView), /private-calendar-name|private-agenda-id|meet.google.com|organizer|attendee/i);
  assert.deepEqual(opened, []);
  const saved = JSON.parse(fs.readFileSync(settings, 'utf8'));
  assert.equal(saved.source, fs.realpathSync(selected));
  const read = await new DashboardAgenda(settings, providers).request({ type: 'read' }, allowed);
  assert.equal(read.state.event.title, 'Calendar fixture');
  assert.notEqual(read.state.event.join, selectedView.state.event.join, 'tokens are limited to the current session');
  await agenda.request({ type: 'join', token: selectedView.state.event.join }, allowed);
  assert.deepEqual(opened, ['https://meet.google.com/abc-defg-hij']);

  fs.writeFileSync(selected, demo('Corrected time', 'https://meet.google.com/klm-nopq-rst'));
  const stamp = new Date(Date.now() + 60000);
  fs.utimesSync(selected, stamp, stamp);
  const stale = await agenda.request({ type: 'join', token: selectedView.state.event.join }, allowed);
  assert.equal(stale.ok, false);
  assert.match(stale.message, /agenda changed/);
  const current = await agenda.request({ type: 'read' }, allowed);
  assert.equal(current.state.event.title, 'Corrected time');
  assert.equal((await agenda.request({ type: 'join', token: current.state.event.join }, () => false)).ok, false);
  assert.equal(opened.length, 1);
  assert.equal((await agenda.request({ type: 'clear' }, allowed)).state.status, 'setup');
  assert.equal(fs.existsSync(selected), true, 'clearing a source leaves the selected calendar intact');
});

test('picker results guard asynchronous selection, reject bounded invalid input, and keep view-only reads passive', async (t) => {
  let signal;
  let release;
  const entered = new Promise((resolve) => { signal = resolve; });
  const { agenda, selected, settings, opened } = agendaFixture(t, {
    parse: (input, at) => new Promise((resolve) => {
      release = () => resolve(parseAgenda(input, at));
      signal();
    }),
  });
  const pending = agenda.request({ type: 'pick' }, allowed);
  await entered;
  assert.equal((await agenda.request({ type: 'pick' }, allowed)).ok, false);
  assert.equal((await agenda.request({ type: 'clear' }, allowed)).ok, true);
  release();
  assert.equal((await pending).ok, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(settings, 'utf8')), { version: 1, source: null });
  assert.deepEqual(opened, []);
  fs.writeFileSync(selected, 'X'.repeat(MAX_BYTES + 1));
  const oversized = await agenda.request({ type: 'pick' }, allowed);
  assert.match(oversized.message, /512 KiB/);
  await assert.rejects(parseCalendar('NOT AN ICALENDAR FILE', now), /iCalendar schedule/);
  assert.equal(deckRequestAllowed('dashboard:agenda', { type: 'read' }), true);
  for (const type of ['pick', 'clear', 'join']) assert.equal(deckRequestAllowed('dashboard:agenda', { type }), false);
});
