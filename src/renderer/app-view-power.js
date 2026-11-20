'use strict';

{
  const { element, stat, badge, gauge, list } = window.LastraWidgetComponents;
  const { t } = window.LastraI18n;
  const sources = { ac: 'AC power', battery: 'Battery power', unknown: 'Power source unknown' };
  const time = (at) => new Intl.DateTimeFormat(window.LastraI18n.language, { timeStyle: 'short' }).format(at);

  function duration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return hours ? t('{hours} h {minutes} min remaining', { hours, minutes: minutes % 60 })
      : minutes ? t('{minutes} min remaining', { minutes }) : t('Less than a minute remaining');
  }

  function card(title, data, isUps = false) {
    const root = element('article', 'power-card');
    const header = element('header', 'power-heading');
    header.append(element('h4', '', t(title)));
    root.append(header);
    switch (data?.status) {
      case 'ready':
      case 'stale': {
        const cached = data.status === 'stale';
        root.dataset.state = data.status;
        header.append(badge(t(cached ? 'Cached' : sources[data.source])));
        const reading = stat();
        const measurements = element('div', 'power-measurements');
        reading.textContent = data.battery === false ? t('No system battery')
          : data.percent == null ? t('Charge unavailable') : `${data.percent}%`;
        reading.classList.toggle('power-charge', Number.isFinite(data.percent));
        measurements.append(reading);
        if (Number.isFinite(data.watts)) {
          const caption = t(isUps ? 'UPS load power' : data.watts < 0 ? 'Discharging power' : 'Charging power');
          const power = element('div', 'power-watts');
          const magnitude = new Intl.NumberFormat(window.LastraI18n.language, { maximumFractionDigits: 1 }).format(Math.abs(data.watts));
          power.append(element('strong', '', magnitude + ' W'), element('small', '', caption));
          measurements.append(power);
        }
        root.append(measurements);
        if (Number.isFinite(data.percent)) {
          const level = gauge(t('Charge percentage'));
          level.value = data.percent;
          root.append(level);
        }
        const details = [];
        if (data.charging === true) details.push(t('Charging'));
        else if (!isUps && data.battery === true && data.source === 'ac') details.push(t('Plugged in'));
        if (data.remainingSeconds != null) details.push(duration(data.remainingSeconds));
        if (data.saver === true) details.push(t('Battery saver active'));
        if (isUps) details.push(t('Updated {time}', { time: time(data.sampledAt) }));
        for (const detail of details) root.append(element('p', 'app-view-secondary', detail));
        break;
      }
      default:
        root.append(element('p', 'app-view-secondary', t({
          disabled: 'No optional UPS source configured.', invalid: 'The UPS status file is unreadable or invalid.',
          unsupported: 'Windows power readings are unavailable on this system.',
        }[data?.status] ?? 'Could not read power status.')));
    }
    return root;
  }

  function mount(container, read) {
    const message = element('p', 'app-view-secondary');
    message.setAttribute('role', 'status');
    const content = element('div', 'power-content');
    container.replaceChildren(message, content);
    return window.createVisibleFeed(read, (view) => {
      const status = view.error ?? (view.status === 'loading' ? 'Reading power status…' : '');
      message.textContent = t(status);
      message.hidden = !status;
      if (!view.system) {
        content.replaceChildren();
        return;
      }
      const transitions = element('article', 'power-card');
      transitions.append(element('h4', '', t('Recent transitions')));
      if (view.transitions.length) {
        const history = list();
        history.update(view.transitions.map(({ at, source }) => `${time(at)} · ${t(sources[source])}`));
        transitions.append(history.element);
      } else transitions.append(element('p', 'app-view-secondary', t('No power changes observed.')));
      content.replaceChildren(card('System battery', view.system), card('UPS', view.ups, true), transitions);
    }, { interval: 4_000, error: 'Could not read power status.' });
  }

  window.LastraPowerView = { mount };
}
