'use strict';

{
  function utcDate(year, month, day) {
    // Keep the grid on calendar dates across daylight-saving transitions.
    const date = new Date(0);
    date.setUTCFullYear(year, month, day);
    return date;
  }

  function monthCalendar(date, locale = 'en-GB') {
    const year = date.getFullYear();
    const month = date.getMonth();
    const today = date.getDate();
    const language = new Intl.Locale(locale);
    const week = language.getWeekInfo?.() ?? language.weekInfo;
    const firstDay = week?.firstDay ?? (['US', 'CA', 'JP', 'BR', 'IN', 'IL'].includes(language.maximize().region) ? 7 : 1);
    const formatDate = (options) => new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC', calendar: 'gregory' });
    const monthLabel = formatDate({ month: 'long', year: 'numeric' });
    const weekday = formatDate({ weekday: 'short' });
    const longWeekday = formatDate({ weekday: 'long' });
    const fullDate = formatDate({ dateStyle: 'full' });
    const number = new Intl.NumberFormat(language, { useGrouping: false });
    const startsOn = utcDate(year, month, 1);
    const offset = (startsOn.getUTCDay() - firstDay + 7) % 7;
    const dayAt = (index) => utcDate(year, month, 1 - offset + index);

    return {
      title: monthLabel.format(startsOn),
      weekdays: Array.from({ length: 7 }, (_, index) => {
        const day = dayAt(index);
        return { text: weekday.format(day), label: longWeekday.format(day) };
      }),
      weeks: Array.from({ length: 6 }, (_, row) => Array.from({ length: 7 }, (_, column) => {
        const day = dayAt(row * 7 + column);
        const dateNumber = day.getUTCDate();
        const outside = day.getUTCMonth() !== month;
        return {
          text: number.format(dateNumber), label: fullDate.format(day), date: day.toISOString().split('T')[0],
          outside, today: !outside && dateNumber === today,
        };
      })),
    };
  }

  function createCalendar(container) {
    const document = container.ownerDocument;
    const element = (tag, className) => {
      const node = document.createElement(tag);
      node.className = className;
      return node;
    };
    const table = element('table', 'dashboard-calendar-table');
    const title = element('caption', 'dashboard-calendar-title');
    const header = element('thead', 'dashboard-calendar-weekdays');
    const days = element('tbody', 'dashboard-calendar-days');
    const columns = document.createElement('tr');
    header.append(columns);
    table.append(title, header, days);
    container.replaceChildren(table);
    let lastDate;

    return {
      update(date, locale = 'en-GB') {
        const key = `${date.getFullYear()}/${date.getMonth()}/${date.getDate()}/${locale}`;
        if (key === lastDate) return;
        const month = monthCalendar(date, locale);
        title.textContent = month.title;
        columns.replaceChildren(...month.weekdays.map(({ text, label }) => {
          const heading = element('th', 'dashboard-calendar-weekday');
          heading.scope = 'col';
          heading.textContent = text;
          heading.setAttribute('aria-label', label);
          return heading;
        }));
        days.replaceChildren(...month.weeks.map((week) => {
          const row = element('tr', 'dashboard-calendar-week');
          for (const day of week) {
            const cell = element('td', 'dashboard-calendar-day');
            cell.classList.toggle('is-outside', day.outside);
            cell.classList.toggle('is-today', day.today);
            cell.setAttribute('aria-label', day.label);
            if (day.today) cell.setAttribute('aria-current', 'date');
            const time = document.createElement('time');
            time.dateTime = day.date;
            time.textContent = day.text;
            cell.append(time);
            row.append(cell);
          }
          return row;
        }));
        lastDate = key;
      },
    };
  }

  if (typeof module === 'object') module.exports = { monthCalendar };
  else window.LastraDashboardCalendar = { createCalendar };
}
