'use strict';

{
  const GRAPH_INSET = 2;
  const GRAPH_WIDTH = 146;
  const SVG = 'http://www.w3.org/2000/svg';
  const labels = { 'service-down': 'Service down', 'service-recovered': 'Recovered', deployment: 'Deployment', launch: 'Launch' };
  const priority = { 'service-down': 4, 'service-recovered': 3, deployment: 2, launch: 1 };

  function chartRange(now, windowMs = 60_000) { return { from: now - windowMs, to: now }; }

  function inRange(events, range) {
    return events.filter(({ at }) => at >= range.from && at <= range.to);
  }

  function markerColumns(events, { from, to }) {
    const columns = new Map();
    for (const event of events) {
      const x = GRAPH_INSET + (event.at - from) * GRAPH_WIDTH / (to - from);
      const column = Math.round(x);
      const prior = columns.get(column);
      if (!prior || priority[event.kind] > priority[prior.kind]) columns.set(column, { x, kind: event.kind });
    }
    return [...columns.values()];
  }

  function mount(api, onChange) {
    if (!api.statsIncidents || !api.onStatsIncidents) return null;
    const { element } = window.LastraWidgetComponents;
    const trigger = document.getElementById('stats-timeline-open');
    const outsideStatus = document.getElementById('stats-timeline-status');
    const dialog = element('dialog', '');
    dialog.id = 'stats-timeline-dialog';
    dialog.setAttribute('aria-labelledby', 'stats-timeline-title');
    const controls = () => element('div', 'stats-timeline-actions');
    const button = (label, handler) => {
      const item = element('button', '', label);
      item.type = 'button';
      item.addEventListener('click', handler);
      return item;
    };
    const field = (label, control) => {
      const item = element('label', '', label);
      item.append(control);
      return item;
    };
    const title = element('h2', '', 'Incident timeline');
    title.id = 'stats-timeline-title';
    const close = button(window.LastraI18n.t('Close'), () => dialog.close());
    close.id = 'stats-timeline-close';
    close.autofocus = true;
    const header = element('header', '');
    header.append(title, close);
    const span = element('p', 'stats-timeline-window');
    const list = element('ul', 'stats-timeline-events');
    const summary = element('p', 'stats-timeline-summary');
    const note = element('p', 'stats-timeline-message');
    note.setAttribute('role', 'status');
    const actions = controls();
    const dashboard = button('Open Grafana', () => { void openDashboard(dialogRange, note); });
    actions.append(dashboard);

    const form = element('form', 'stats-timeline-form');
    const kind = element('select', '');
    kind.append(...['deployment', 'launch'].map((value) => Object.assign(element('option', '', labels[value]), { value })));
    const marker = Object.assign(element('input', ''), { type: 'text', maxLength: 80, required: true, autocomplete: 'off' });
    const add = button('Add marker', () => {
      if (!marker.reportValidity()) return;
      void change({ type: 'mark', kind: kind.value, label: marker.value }, 'Marker added.', () => { marker.value = ''; });
    });
    form.append(field('Event', kind), field('Name', marker), add);
    form.addEventListener('submit', (event) => { event.preventDefault(); add.click(); });

    dialog.append(header, span, summary, list, actions, form, note);
    document.body.append(dialog);

    const format = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    let snapshot;
    let visible = false;
    let noWrites = false;
    let busy = false;
    let range;
    let dialogRange;
    let epoch = 0;
    let shownEvents;

    function paintDialog() {
      if (!dialog.open) return;
      form.hidden = noWrites;
      dashboard.hidden = noWrites || !snapshot?.dashboard;
      for (const item of [marker, kind, add, dashboard]) item.disabled = busy || noWrites;
      const events = inRange(snapshot?.events ?? [], dialogRange).reverse();
      const key = JSON.stringify(events.map(({ id }) => id));
      if (key === shownEvents) return;
      shownEvents = key;
      summary.textContent = !events.length ? 'No events in this range.' : events.length > 32 ? `Showing the latest 32 of ${events.length} events.` : '';
      list.replaceChildren(...events.slice(0, 32).map(({ kind, label, at }) => {
        const row = element('li', '');
        row.dataset.kind = kind;
        const time = element('time', '', format.format(at));
        time.dateTime = new Date(at).toISOString();
        row.append(time, element('span', 'stats-event-kind', labels[kind]), element('strong', '', label));
        return row;
      }));
    }

    function displayRange(next) {
      dialogRange = next;
      span.textContent = `${format.format(next.from)} – ${format.format(next.to)}`;
    }

    function update(next) {
      snapshot = next;
      trigger.hidden = !snapshot;
      if (visible) {
        paintDialog();
        onChange();
      }
    }

    async function change(command, success, done) {
      if (!visible || noWrites || busy) return;
      busy = true;
      paintDialog();
      try {
        const result = await api.statsIncidents(command);
        if (!result?.ok) throw new Error(result?.message || 'Could not update the incident timeline.');
        if (result.timeline) update(result.timeline);
        if (command.type === 'mark' && dialog.open && range) displayRange(range);
        note.textContent = success;
        done?.();
      } catch (error) { note.textContent = error.message; }
      finally { busy = false; paintDialog(); }
    }

    async function openDashboard(chart, status = outsideStatus) {
      if (!visible || noWrites || !snapshot?.dashboard || !chart) return;
      status.textContent = '';
      try {
        const result = await api.statsIncidents({ type: 'open', range: chart });
        if (!result?.ok) throw new Error(result?.message || 'Could not open the Grafana dashboard.');
      } catch (error) { status.textContent = error.message; }
    }

    trigger.addEventListener('click', () => {
      if (!visible || !range || !snapshot || document.querySelector('dialog[open]')) return;
      displayRange(range);
      shownEvents = undefined;
      marker.value = '';
      note.textContent = snapshot.warning ?? '';
      dialog.showModal();
      paintDialog();
    });
    api.onStatsIncidents((state) => { epoch++; update(state); });

    return {
      trigger, openDashboard,
      get canOpenDashboard() { return Boolean(snapshot?.dashboard) && !noWrites; },
      setRange(next) { range = next; },
      setViewOnly(value) { noWrites = value; paintDialog(); },
      setVisible(active) {
        if (active === visible) return;
        visible = active;
        const request = ++epoch;
        if (!active) {
          if (dialog.open) dialog.close();
          return;
        }
        void api.statsIncidents({ type: 'read' }).then((result) => {
          if (request === epoch && result?.ok) update(result.timeline);
        }).catch(() => {});
      },
      draw(svg, chart) {
        const events = inRange(snapshot?.events ?? [], chart);
        const columns = markerColumns(events, chart);
        let group = svg.querySelector('.stats-event-markers');
        if (!group && columns.length) {
          group = document.createElementNS(SVG, 'g');
          group.classList.add('stats-event-markers');
          group.setAttribute('aria-hidden', 'true');
          svg.append(group);
        }
        if (!group) return 0;
        columns.forEach(({ x, kind }, index) => {
          let marker = group.children[index];
          if (!marker) {
            marker = document.createElementNS(SVG, 'line');
            marker.setAttribute('y1', '0');
            marker.setAttribute('y2', '42');
            marker.setAttribute('vector-effect', 'non-scaling-stroke');
            group.append(marker);
          }
          marker.setAttribute('x1', x.toFixed(1));
          marker.setAttribute('x2', x.toFixed(1));
          marker.dataset.kind = kind;
        });
        while (group.children.length > columns.length) group.lastElementChild.remove();
        return events.length;
      },
    };
  }

  const api = { chartRange, inRange, markerColumns, mount };
  if (typeof module === 'object') module.exports = api;
  else window.LastraStatsTimeline = api;
}
