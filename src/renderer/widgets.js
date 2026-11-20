'use strict';

{
  const { catalog, defaultSettings, groupWidgetPlacements, widgetTabLabel } = window.LastraWidgetLayout;
  const { element, stat, badge, gauge, graph, progress, list, action, decisionCard } = window.LastraWidgetComponents;
  const providers = window.LastraWidgetProviders;
  const mediaHelpers = window.LastraMediaHelpers;
  const { lastReading } = window.LastraReadingTime;
  const IMAGE = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/;
  const mediaStatus = {
    loading: 'Reading media…',
    empty: 'Start playback in a Windows media app.',
    unsupported: 'Windows media sessions unavailable',
    unavailable: 'Could not read Windows media',
  };
  const playbackLabels = { playing: 'Playing', paused: 'Paused', stopped: 'Stopped', changing: 'Updating' };
  const sensorSources = { managed: 'LibreHardwareMonitor', http: 'LibreHardwareMonitor HTTP', preview: 'Preview' };

  function setText(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }

  function card() {
    const root = element('article', 'lastra-widget');
    const header = element('header', 'widget-header');
    const title = element('h3', 'widget-title');
    const state = badge('');
    state.hidden = true;
    const source = element('div', 'widget-source');
    header.append(title, state);
    root.append(header, source);
    return { root, header, title, state, source };
  }

  function metricCard({ settings }) {
    if (settings.sensorId) return sensorMetricCard(settings);
    const view = card();
    const { metric, shape } = settings;
    const label = catalog['system-metric'].fields.metric.choices[metric];
    const value = stat();
    const isTemperature = metric.endsWith('Temp');
    const system = metric === 'cpu' || metric === 'ram';
    const history = shape === 'graph' ? graph(`${label} history`) : null;
    const meter = shape === 'gauge' ? gauge(label) : null;
    let stop;
    view.root.classList.add('widget-metric');
    view.title.textContent = label;
    view.root.append(value);
    if (meter) view.root.append(meter);
    if (history) view.root.append(history.element);

    function render(sample) {
      const reading = sample[metric];
      const available = Number.isFinite(reading);
      const stamp = system ? sample.sampledAt : sample.hardwareAt;
      const gap = system ? 3_000 : sample.hardwareStaleMs ?? 6_000;
      const stale = available && Number.isFinite(stamp) && Date.now() - stamp >= gap;
      const amount = available ? Math.round(isTemperature ? reading : reading * 100) : 0;
      const unit = isTemperature ? ' °C' : '%';
      setText(value, available ? `${amount}${unit}` : 'N/A');
      const source = (system ? 'Operating system' : sensorSources[sample.hardwareSource]) ?? 'No source';
      const attribution = [source, available && lastReading(stamp)].filter(Boolean).join(' · ');
      setText(view.source, attribution);
      view.source.title = attribution;
      setText(view.state, stale ? 'Cached' : available ? '' : 'Unavailable');
      view.state.hidden = available && !stale;
      if (meter) {
        meter.max = isTemperature ? 110 : 100;
        meter.value = amount;
        meter.hidden = !available;
      }
      history?.update(sample.history?.[metric] ?? [], isTemperature ? 110 : 1, gap);
    }

    render({});
    return {
      root: view.root,
      setVisible(visible) {
        stop?.();
        stop = visible ? providers.telemetry.subscribe(render) : undefined;
      },
    };
  }

  function sensorMetricCard({ sensorId, shape }) {
    const view = card();
    const value = stat();
    const history = shape === 'graph' ? graph('Selected sensor history') : null;
    const meter = shape === 'gauge' ? gauge('Selected sensor') : null;
    const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
    let stop;
    view.root.classList.add('widget-metric');
    view.root.append(value);
    if (meter) view.root.append(meter);
    if (history) view.root.append(history.element);

    function render(reading) {
      const available = Number.isFinite(reading?.value);
      const cached = available && Date.now() - reading.at >= reading.maxAge;
      const title = reading?.name ?? 'Selected sensor';
      setText(view.title, title);
      setText(value, available ? `${formatter.format(reading.value)}${reading.unit === '%' ? '' : ' '}${reading.unit}` : 'N/A');
      const attribution = [reading?.device, reading?.source, available && lastReading(reading.at)].filter(Boolean).join(' · ');
      setText(view.source, attribution);
      view.source.title = [attribution, reading?.deviceId].filter(Boolean).join(' · ');
      setText(view.state, cached ? 'Cached' : available ? '' : 'Unavailable');
      view.state.hidden = available && !cached;
      const gaugeMax = reading?.unit === '%' ? 100 : reading?.unit === '°C' ? 110 : null;
      if (meter) {
        meter.hidden = !available || !gaugeMax;
        meter.setAttribute('aria-label', title);
        if (gaugeMax) {
          meter.max = gaugeMax;
          meter.value = reading.value ?? 0;
        }
      }
      if (history) {
        const points = reading?.points ?? [];
        const amounts = points.map((point) => point[1]).filter(Number.isFinite);
        const now = Date.now();
        history.element.setAttribute('aria-label', `${title} history`);
        history.update(points, gaugeMax ?? Math.max(1, ...amounts), reading?.maxAge, {
          low: Math.min(0, ...amounts), from: now - 60_000, to: now,
        });
      }
    }

    render();
    return {
      root: view.root,
      setVisible(visible) {
        stop?.();
        stop = visible ? providers.sensorWidgets.subscribe(sensorId, render) : undefined;
      },
    };
  }

  function mediaCard({ type, settings }) {
    const view = card();
    const route = type === 'now-playing' ? undefined : type;
    const netflix = route === 'netflix';
    view.root.classList.add('widget-media', `widget-media-${settings.appearance}`);
    const summary = element('div', 'widget-media-summary');
    const artwork = element('img', 'widget-artwork');
    artwork.alt = '';
    artwork.hidden = true;
    const details = list();
    const timeline = progress('Track position');
    const controls = element('div', 'widget-actions');
    const previous = action('Previous track', () => command('previous'), '‹');
    const play = action('Play', () => command(playCommand), '▶');
    const next = action('Next track', () => command('next'), '›');
    controls.append(previous, play, next);
    if (netflix) controls.append(action('Open saved Netflix titles', () => window.LastraAppViews?.open('netflix'), 'Titles'));
    summary.append(artwork, details.element);
    view.root.append(summary, timeline, controls);
    let current = { status: 'loading' };
    let playCommand;
    let stop;
    let pending = false;
    let error = '';

    function render(snapshot) {
      const changed = current.trackId !== snapshot.trackId || current.sessionId !== snapshot.sessionId;
      if (changed) error = '';
      current = snapshot;
      const ready = snapshot.status === 'ready';
      const hasTrack = ready || snapshot.status === 'stale';
      const playing = snapshot.playback === 'playing';
      playCommand = playing
        ? snapshot.canPause && 'pause'
        : snapshot.canPlay && 'play';
      if (!playCommand && snapshot.canToggle) playCommand = 'toggle';
      setText(view.title, hasTrack ? snapshot.title || 'Unknown track' : catalog[type].name);
      const source = route ? catalog[type].provider : hasTrack ? mediaHelpers.source(snapshot.source || '') : 'Windows media sessions';
      const attribution = [source, hasTrack && lastReading(snapshot.sampledAt)].filter(Boolean).join(' · ');
      setText(view.source, attribution);
      view.source.title = attribution;
      setText(view.state, error || (ready ? playbackLabels[snapshot.playback] ?? 'Ready' : hasTrack ? 'Cached' : ''));
      view.state.hidden = !hasTrack && !error;
      details.update(hasTrack ? [snapshot.artist, snapshot.album].filter(Boolean)
        : [snapshot.status === 'empty' && route ? (netflix ? 'No identified Netflix player' : 'Start playback in the Spotify desktop app.')
          : mediaStatus[snapshot.status] ?? mediaStatus.unavailable]);
      const image = typeof snapshot.artwork === 'string' && snapshot.artwork.length <= 2_000_000 && IMAGE.test(snapshot.artwork);
      artwork.hidden = !image;
      if (image && artwork.getAttribute('src') !== snapshot.artwork) artwork.src = snapshot.artwork;
      if (!image) artwork.removeAttribute('src');
      const position = ready ? mediaHelpers.position(snapshot, Date.now()) : null;
      timeline.hidden = position === null || !snapshot.durationMs;
      if (!timeline.hidden) {
        timeline.max = snapshot.durationMs;
        timeline.value = position;
      }
      const label = playing ? 'Pause' : 'Play';
      play.setAttribute('aria-label', label);
      play.title = label;
      setText(play, playing ? 'Ⅱ' : '▶');
      previous.disabled = !ready || pending || !snapshot.canPrevious;
      play.disabled = !ready || pending || !playCommand;
      next.disabled = !ready || pending || !snapshot.canNext;
    }

    async function command(name) {
      if (current.status !== 'ready' || pending || !name) return;
      const { sessionId, trackId } = current;
      pending = true;
      error = '';
      render(current);
      try {
        const request = { command: name, sessionId, trackId };
        if (route) request.route = route;
        const reply = await window.lastra.changeNowPlaying(request);
        if (reply.status !== 'ok' && sessionId === current.sessionId && trackId === current.trackId) {
          error = reply.status === 'changed' ? 'Track changed' : 'Control unavailable';
        }
      } catch {
        error = 'Control unavailable';
      } finally {
        pending = false;
        render(current);
      }
    }

    render(current);
    return {
      root: view.root,
      setVisible(visible) {
        stop?.();
        stop = visible ? (route ? providers[route] : providers.media).subscribe(render) : undefined;
      },
    };
  }

  function audioControlCard({ type, settings }) {
    const { createFader, createLevelBinding } = window.LastraAudioFader;
    const audioLabel = catalog[type].fields.device.choices[settings.device];
    const adjustment = createFader(settings, audioLabel, type);
    const { input, dial, reset, show, controls, down, up, fine } = adjustment;
    const api = window.lastra;
    const routes = window.LastraControlModes.createRoutes({ api, providers, media: mediaHelpers, audioLabel, settings });
    const options = Object.entries(routes);
    const readings = new Map();
    const subscriptions = new Map();
    const selector = options.length > 1 ? element('select', 'widget-mode-picker') : null;
    let selected = 'audio';
    let visible = false;
    let pointer;
    let renderedChoices;

    const bindings = Object.fromEntries(options.map(([id, route]) => [id, createLevelBinding({
      min: 0,
      max: 100,
      async write({ id: endpoint, level }) {
        const target = readings.get(id)?.endpoint;
        if (!api || !visible || document.hidden || selected !== id || target?.id !== endpoint) {
          throw new Error('The control target changed.');
        }
        const confirmed = await route.write(target, level);
        const current = readings.get(id);
        if (confirmed?.endpoint && confirmed.endpoint.id === current?.endpoint?.id && confirmed.version >= current.version) {
          readings.set(id, confirmed);
        }
        return confirmed;
      },
      render({ available, level, status }) {
        if (selected !== id) return;
        const endpoint = readings.get(id)?.endpoint;
        const enabled = available && Number.isFinite(endpoint?.level);
        for (const control of controls) control.disabled = !enabled || !api;
        show(enabled ? level : null, status, enabled && route.format ? route.format(level, endpoint) : undefined, endpoint?.title);
      },
    })]));

    function renderChoices() {
      if (!selector) return;
      const available = options.filter(([id]) => Number.isFinite(readings.get(id)?.endpoint?.level));
      const choices = available.map(([id, route]) => [id, route.label, false]);
      if (!available.some(([id]) => id === selected)) choices.push([selected, `${routes[selected].label} unavailable`, true]);
      const signature = JSON.stringify(choices);
      if (signature !== renderedChoices) {
        renderedChoices = signature;
        selector.replaceChildren(...choices.map(([id, title, disabled]) =>
          Object.assign(element('option', '', title), { value: id, disabled })));
      }
      selector.value = selected;
      selector.title = readings.get(selected)?.endpoint?.title ?? 'Choose a control mode';
      selector.hidden = choices.length < 2;
      adjustment.title.hidden = !selector.hidden;
    }

    if (selector) {
      selector.setAttribute('aria-label', 'Control mode');
      adjustment.header.insertBefore(selector, adjustment.title);
      selector.addEventListener('change', () => {
        const id = selector.value;
        if (id === selected || !visible || !readings.get(id)?.endpoint?.id) { renderChoices(); return; }
        if (pointer) pointer.cancelled = true;
        dial?.cancel();
        routes[selected].cancel?.();
        bindings[selected].cancel();
        selected = id;
        adjustment.setMode(routes[selected]);
        const { endpoint, version } = readings.get(id);
        bindings[selected].receive(endpoint, version);
        renderChoices();
      });
      renderChoices();
    }

    if (dial) {
      dial.bind({
        begin: () => bindings[selected].begin(),
        step: (delta) => bindings[selected].step(delta, { defer: routes[selected].defer }),
        set: (level) => bindings[selected].change(level),
        tap: () => bindings[selected].change(routes[selected].reset),
        release: () => bindings[selected].release(),
        cancel: () => bindings[selected].cancel(),
      });
    } else if (input) {
      input.addEventListener('pointerdown', (event) => {
        if (input.disabled || !event.isPrimary || event.button !== 0) return;
        pointer = { id: event.pointerId, mode: selected };
        bindings[selected].begin();
        input.setPointerCapture(pointer.id);
      });
      input.addEventListener('input', () => {
        if (input.disabled || (pointer && (pointer.cancelled || pointer.mode !== selected))) return;
        bindings[selected].change(input.valueAsNumber, { defer: routes[selected].defer && Boolean(pointer) });
      });
      for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        input.addEventListener(eventName, (event) => {
          if (pointer?.id !== event.pointerId) return;
          const { mode, cancelled } = pointer;
          pointer = undefined;
          if (eventName === 'pointerup' && mode === selected && !cancelled) bindings[mode].release();
          else bindings[mode].cancel();
        });
      }
    } else {
      const step = () => fine.getAttribute('aria-pressed') === 'true' ? 1 : settings.step;
      fine.addEventListener('click', () => fine.setAttribute('aria-pressed', String(step() !== 1)));
      down.addEventListener('click', () => bindings[selected].step(-step()));
      up.addEventListener('click', () => bindings[selected].step(step()));
    }
    reset?.addEventListener('click', () => bindings[selected].change(routes[selected].reset));
    bindings.audio.receive(null);
    return {
      root: adjustment.root,
      setVisible(next) {
        if (visible === next) return;
        visible = next;
        if (visible) {
          for (const [id, route] of options) {
            subscriptions.set(id, route.subscribe((snapshot) => {
              const { endpoint, version } = route.read(snapshot);
              const previous = readings.get(id);
              if (previous?.endpoint?.id === endpoint?.id && Number.isFinite(previous?.version) && version < previous.version) return;
              readings.set(id, { endpoint, version });
              bindings[id].receive(endpoint, version, { resetVersion: route.scopedVersions });
              renderChoices();
            }));
          }
        } else {
          pointer = undefined;
          dial?.cancel();
          routes[selected].cancel?.();
          for (const stop of subscriptions.values()) stop();
          subscriptions.clear();
          readings.clear();
          for (const binding of Object.values(bindings)) {
            binding.receive(null);
            binding.cancel();
          }
          renderChoices();
        }
      },
    };
  }

  function timersCard({ settings, presets = [settings.quickMinutes] }) {
    const { timerSummary } = window.LastraTimers;
    const view = card();
    const rows = element('ul', 'widget-timer-list');
    const empty = element('p', 'widget-timer-empty', 'No timers yet');
    const quick = presets.map((minutes) => action(`Start a ${minutes}-minute countdown`,
      () => void change({ type: 'start', label: `${minutes} min`, durationMs: minutes * 60_000 }), `+ ${minutes} min`));
    const stopwatch = action('Start a stopwatch', () => void change({ type: 'start', label: 'Stopwatch', kind: 'stopwatch' }), '+ Stopwatch');
    const controls = element('div', 'widget-actions');
    const entries = new Map();
    let current = { status: 'loading', timers: [] };
    let pending = false;
    let error = '';
    let signature;
    let readOnly = false;
    let stop;
    let tick;
    view.root.classList.add('widget-timers');
    view.title.textContent = catalog.timers.name;
    controls.append(...quick, stopwatch);
    view.root.append(rows, empty, controls);

    function build() {
      entries.clear();
      rows.replaceChildren(...current.timers.map((timer) => {
        const row = element('li');
        const name = element('span', 'widget-timer-name', timer.label);
        const clock = element('span', 'widget-timer-time');
        const toggle = action('Pause', () => void change({ type: row.dataset.status === 'running' ? 'pause' : 'resume', id: timer.id }), 'Ⅱ');
        const remove = action('Remove', () => void change({ type: 'remove', id: timer.id }), '✕');
        name.title = timer.label;
        row.append(name, clock, toggle, remove);
        entries.set(timer.id, { timer, row, clock, toggle, remove });
        return row;
      }));
    }

    function render() {
      const ready = current.status === 'ready';
      const next = JSON.stringify(current.timers.map(({ id, label, status }) => [id, label, status]));
      if (next !== signature) {
        signature = next;
        build();
      }
      const now = Date.now();
      let running = false;
      for (const { timer, row, clock, toggle, remove } of entries.values()) {
        const { status, state, time } = timerSummary(timer, now);
        running ||= status === 'running';
        row.dataset.status = status;
        setText(clock, status === 'complete' ? state : status === 'paused' ? `${time} paused` : time);
        const label = `${status === 'running' ? 'Pause' : 'Resume'} ${timer.label}`;
        toggle.hidden = status === 'complete';
        toggle.setAttribute('aria-label', label);
        toggle.title = label;
        setText(toggle, status === 'running' ? 'Ⅱ' : '▶');
        const removal = `${status === 'complete' ? 'Dismiss' : 'Remove'} ${timer.label}`;
        remove.setAttribute('aria-label', removal);
        remove.title = removal;
        toggle.disabled = remove.disabled = readOnly || pending || !ready;
      }
      rows.hidden = !entries.size;
      empty.hidden = Boolean(entries.size) || !ready;
      for (const control of [...quick, stopwatch]) control.disabled = readOnly || pending || !ready;
      const note = error || current.warning || (ready ? '' : current.status === 'loading' ? 'Reading timers…' : 'Timers unavailable');
      setText(view.source, note || catalog.timers.provider);
      view.source.title = note;
      const finished = current.timers.filter(({ status }) => status === 'complete').length;
      setText(view.state, finished ? `${finished} finished` : '');
      view.state.hidden = !finished;
      if (running && !tick) tick = setInterval(render, 500);
      else if (!running && tick) tick = void clearInterval(tick);
    }

    async function change(command) {
      if (readOnly || pending || current.status !== 'ready') return;
      pending = true;
      error = '';
      render();
      try {
        const reply = await window.lastra?.changeTimers?.(command);
        if (!reply?.ok) error = reply?.message || 'Timer control unavailable';
      } catch {
        error = 'Timer control unavailable';
      } finally {
        pending = false;
        render();
      }
    }

    render();
    return {
      root: view.root,
      setReadOnly(value) { readOnly = value; render(); },
      setVisible(visible) {
        stop?.();
        stop = visible ? providers.timers.subscribe((state) => {
          current = state;
          render();
        }) : undefined;
        if (!visible && tick) tick = void clearInterval(tick);
      },
    };
  }

  function compositionCard({ settings, icons }) {
    const { root, render, usesTelemetry } = window.LastraCompositionCard.createCompositionCard(settings.composition, icons);
    let stop;
    return {
      root,
      setVisible(visible) {
        stop?.();
        stop = visible && usesTelemetry ? providers.telemetry.subscribe(render) : undefined;
      },
    };
  }

  const renderers = { 'system-metric': metricCard, 'now-playing': mediaCard, spotify: mediaCard, netflix: mediaCard,
    'audio-fader': audioControlCard, 'audio-encoder': audioControlCard, 'virtual-dial': audioControlCard,
    composition: compositionCard, timers: timersCard,
    decision: ({ settings }) => ({ root: decisionCard(settings.options), setVisible() {} }) };
  const selections = new WeakMap();

  function createWidget(instance) {
    const render = Object.hasOwn(renderers, instance.type) ? renderers[instance.type] : null;
    if (!render) return null;
    const widget = render({ ...instance, settings: { ...defaultSettings(instance.type), ...instance.settings } });
    widget.root.dataset.widgetId = instance.id;
    return widget;
  }

  function widgetStack(members, remembered, key) {
    const root = element('article', 'lastra-widget widget-stack');
    root.dataset.widgetStack = members[0].stackId;
    const toolbar = element('div', 'widget-stack-tabs');
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', 'Widget tabs');
    const title = element('strong', 'widget-stack-active');
    const number = element('span', 'widget-stack-position');
    const content = element('div', 'widget-stack-body');
    let index = Math.max(0, members.findIndex(({ id }) => id === remembered.get(key)));
    let visible = false;
    let widget;

    function place() {
      const selected = members[index];
      const label = widgetTabLabel(selected);
      title.textContent = label;
      title.title = label;
      number.textContent = `${index + 1} / ${members.length}`;
      if (widget) {
        widget.setVisible(false);
        widget.root.remove();
        widget = undefined;
      }
      if (visible) {
        widget = createWidget(selected);
        if (widget) {
          content.append(widget.root);
          widget.setVisible(true);
        }
      }
    }
    function move(offset) {
      index = (index + offset + members.length) % members.length;
      remembered.delete(key);
      remembered.set(key, members[index].id);
      while (remembered.size > 64) remembered.delete(remembered.keys().next().value);
      place();
    }
    toolbar.append(action('Previous widget tab', () => move(-1), '‹'), title, number,
      action('Next widget tab', () => move(1), '›'));
    toolbar.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      move(event.key === 'ArrowRight' ? 1 : -1);
    });
    root.append(toolbar, content);
    place();
    return {
      root,
      setVisible(value) {
        if (visible === value) return;
        visible = value;
        place();
      },
    };
  }

  function mount(container, instances, scope = '') {
    let remembered = selections.get(container);
    if (!remembered) {
      remembered = new Map();
      selections.set(container, remembered);
    }
    const mounted = groupWidgetPlacements(instances).map(({ members, layout }) => {
      const key = JSON.stringify([scope, members[0].stackId, members.map(({ id }) => id)]);
      const widget = members.length > 1 ? widgetStack(members, remembered, key) : createWidget(members[0]);
      if (!widget) return null;
      if (layout) {
        widget.root.style.gridColumn = `${layout.column + 1} / span ${layout.cols}`;
        widget.root.style.gridRow = `${layout.row + 1} / span ${layout.rows}`;
      }
      container.append(widget.root);
      return widget;
    }).filter(Boolean);
    let requested = container.isConnected && !container.closest('[hidden]');
    let visible = false;
    let destroyed = false;

    function updateVisibility() {
      const next = !destroyed && requested && !document.hidden;
      if (next === visible) return;
      visible = next;
      for (const widget of mounted) widget.setVisible(visible);
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      updateVisibility();
      document.removeEventListener('visibilitychange', updateVisibility);
      window.removeEventListener('pagehide', destroy);
      for (const widget of mounted) widget.root.remove();
    }

    document.addEventListener('visibilitychange', updateVisibility);
    window.addEventListener('pagehide', destroy);
    updateVisibility();
    return {
      setVisible(value) {
        requested = Boolean(value);
        updateVisibility();
      },
      destroy,
    };
  }

  window.LastraWidgets = { mount, timersCard };
}
