'use strict';

{
  function createFaderWriter(write, settle, interval = 80) {
    let pending = false;
    let queued;
    let timer;
    let revision = 0;

    async function flush() {
      timer = undefined;
      if (pending || !queued) return;
      const item = queued;
      const activeRevision = revision;
      pending = true;
      queued = undefined;
      let error;
      let result;
      try {
        result = await write(item);
      } catch (cause) {
        error = cause;
      } finally {
        pending = false;
        timer = setTimeout(flush, interval);
        if (activeRevision === revision) settle(error, result);
        else if (!queued) settle();
      }
    }

    return {
      get busy() { return pending || Boolean(queued); },
      push(item) {
        queued = item;
        if (!pending && !timer) void flush();
      },
      cancel() {
        revision++;
        clearTimeout(timer);
        timer = queued = undefined;
      },
    };
  }

  function createLevelBinding({ write, render, min, max, interval }) {
    let endpoint;
    let version = -1;
    let intent;
    let tracking = false;
    let blocked = false;
    let deferred = false;
    let error;
    const available = () => Boolean(endpoint?.id) && Number.isFinite(endpoint.level);
    const visibleLevel = () => tracking && intent !== undefined ? intent : endpoint?.level;
    const publish = () => render({ available: available(), level: visibleLevel(),
      status: error ?? (!available() ? 'Unavailable' : writer.busy ? 'Applying…' : '') });
    const writer = createFaderWriter(write, (failure, result) => {
      if (!writer.busy && !tracking) intent = undefined;
      error = failure?.message;
      if (result) receive(result.endpoint, result.version);
      else publish();
    }, interval);

    function receive(next, revision, { resetVersion = false } = {}) {
      if (resetVersion && next?.id !== endpoint?.id) version = -1;
      if (Number.isFinite(revision)) {
        if (revision < version) { publish(); return; }
        version = revision;
      }
      if (next?.id !== endpoint?.id || !Number.isFinite(next?.level)) {
        if (tracking) blocked = true;
        deferred = false;
        intent = undefined;
        error = undefined;
        writer.cancel();
      }
      endpoint = next;
      publish();
    }

    function change(value, { defer = false } = {}) {
      if (!available() || blocked || !Number.isFinite(value)) { publish(); return; }
      error = undefined;
      intent = Math.min(max, Math.max(min, Math.round(value)));
      deferred = defer && tracking;
      if (!deferred) writer.push({ id: endpoint.id, level: intent });
      publish();
    }

    return {
      receive,
      change,
      step(delta, options) { change((writer.busy || tracking ? intent ?? endpoint?.level : endpoint?.level) + delta, options); },
      begin() { tracking = available(); blocked = deferred = false; intent = undefined; },
      release() {
        if (deferred && available() && !blocked && intent !== undefined) writer.push({ id: endpoint.id, level: intent });
        tracking = blocked = deferred = false;
        if (!writer.busy) intent = undefined;
        publish();
      },
      cancel() { tracking = blocked = deferred = false; intent = undefined; writer.cancel(); publish(); },
    };
  }

  function sliderAxis(settings, label, element) {
    const axis = element('div', 'widget-fader-axis');
    const input = element('input', 'widget-fader-input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.value = String(settings.defaultLevel);
    input.setAttribute('aria-label', label + ' level');
    input.setAttribute('aria-orientation', settings.orientation);
    const marks = element('div', 'widget-fader-marks');
    marks.setAttribute('aria-hidden', 'true');
    marks.append(...[0, 25, 50, 75, 100].map((level) => element('span', '', String(level))));
    axis.append(input, marks);
    return { axis, input, controls: [input] };
  }

  function encoderAxis(label, element) {
    const axis = element('div', 'widget-encoder-axis');
    const down = element('button', 'widget-action', '−');
    const fine = element('button', 'widget-action', 'Fine');
    const up = element('button', 'widget-action', '+');
    down.setAttribute('aria-label', 'Decrease ' + label + ' level');
    up.setAttribute('aria-label', 'Increase ' + label + ' level');
    fine.setAttribute('aria-pressed', 'false');
    axis.append(down, fine, up);
    return { axis, down, up, fine, controls: [down, fine, up] };
  }

  function createFader(settings, label, type = 'audio-fader') {
    const { element } = window.LastraWidgetComponents;
    const root = element('article', 'lastra-widget widget-fader');
    if (settings.orientation) root.dataset.orientation = settings.orientation;
    const header = element('header', 'widget-header');
    const value = element('output', 'widget-fader-value');
    const title = element('h3', 'widget-title', label);
    header.append(title, value);
    const dial = type === 'virtual-dial' ? window.LastraVirtualDial.createDial(settings, label) : null;
    if (dial) root.classList.add('widget-virtual-dial');
    const { axis, controls, ...inputs } = dial ? { axis: dial.axis, controls: [dial.control] }
      : type === 'audio-encoder' ? encoderAxis(label, element) : sliderAxis(settings, label, element);
    const footer = element('footer', 'widget-fader-footer');
    const status = element('span', 'widget-source widget-fader-status');
    status.setAttribute('role', 'status');
    let reset;
    footer.append(status);
    if (!dial) {
      reset = element('button', 'widget-action', 'Reset');
      reset.type = 'button';
      reset.title = 'Reset to ' + settings.defaultLevel + '%';
      reset.setAttribute('aria-label', reset.title);
      footer.append(reset);
    }
    root.append(header, axis, footer);
    function show(level, message = '', formatted, source = '') {
      const text = Number.isFinite(level) ? formatted ?? level + '%' : 'N/A';
      value.textContent = text;
      if (inputs.input) {
        if (Number.isFinite(level)) inputs.input.value = String(level);
        inputs.input.setAttribute('aria-valuetext', text);
      }
      dial?.show(level, text);
      const detail = message || source;
      if (status.textContent !== detail) status.textContent = detail;
      status.title = detail;
      status.toggleAttribute('data-source', Boolean(source && !message));
    }
    function setMode({ label: next, valueLabel = 'level', resetLabel = 'Reset', resetTitle = 'Reset to ' + settings.defaultLevel + '%' }) {
      title.textContent = next;
      inputs.input?.setAttribute('aria-label', `${next} ${valueLabel}`);
      inputs.down?.setAttribute('aria-label', `Decrease ${next} ${valueLabel}`);
      inputs.up?.setAttribute('aria-label', `Increase ${next} ${valueLabel}`);
      if (reset) {
        reset.textContent = resetLabel;
        reset.title = resetTitle;
        reset.setAttribute('aria-label', resetTitle);
      }
      dial?.setLabel(`${next} ${valueLabel}`, valueLabel === 'position');
    }
    return { root, header, title, ...inputs, dial, reset, show, setMode, controls: reset ? [...controls, reset] : controls };
  }

  if (typeof module === 'object') module.exports = { createFaderWriter, createLevelBinding };
  else window.LastraAudioFader = { createFader, createLevelBinding };
}
