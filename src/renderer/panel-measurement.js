'use strict';

{
  const api = window.lastra;
  let run;
  let sequence = 0;
  let events = [];
  let timer;
  let renderFrame;
  const changed = new Set();
  const monitored = new Map([
    [document.getElementById('keys'), 'keys'], [document.getElementById('page-nav'), 'keys'],
    [document.getElementById('panel'), 'keys'], [document.getElementById('dashboard-panel'), 'dashboard'],
    [document.getElementById('stats-panel'), 'stats'], [document.getElementById('widget-bar'), 'bar'],
  ]);

  function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (run && events.length) api.reportPanelMeasurement({ run: run.id, events });
    events = [];
  }

  function report(event, trace = null) {
    if (!run || (trace && trace.run !== run.id)) return;
    events.push(trace ? { ...event, id: trace.id } : event);
    if (events.length >= 100) flush();
    else timer ??= setTimeout(flush, 100);
  }

  function active(at) { return run && run.startedAt <= at && at < run.endedAt; }

  const observer = new MutationObserver((mutations) => {
    if (!active(Date.now()) || document.hidden) return;
    for (const item of mutations) {
      const target = item.target.nodeType === Node.ELEMENT_NODE ? item.target : item.target.parentElement;
      if (!target || target.closest('[hidden]')) continue;
      if (item.type === 'attributes' && target.getAttribute(item.attributeName) === item.oldValue) continue;
      for (const [root, surface] of monitored) if (root.contains(target)) changed.add(surface);
    }
    if (!changed.size || renderFrame !== undefined) return;
    renderFrame = requestAnimationFrame((at) => {
      renderFrame = undefined;
      for (const surface of changed) report({ kind: 'redraw', surface, at: performance.timeOrigin + at });
      changed.clear();
    });
  });

  api?.onPanelMeasurement?.((state) => {
    if (run?.id === state?.id) return;
    flush();
    observer.disconnect();
    changed.clear();
    if (renderFrame !== undefined) cancelAnimationFrame(renderFrame);
    renderFrame = undefined;
    run = state;
    sequence = 0;
    if (!run) return;
    for (const root of monitored.keys()) observer.observe(root, {
      subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true,
      attributeFilter: ['class', 'data-state', 'data-live-tone', 'hidden', 'style', 'value', 'd'],
    });
  });

  window.LastraPanelMeasurement = {
    contact(event) {
      if (!run || !event.isTrusted || event.pointerType !== 'touch' || event.button !== 0) return null;
      const at = performance.timeOrigin + event.timeStamp;
      if (!active(at) || sequence >= 256) return null;
      const trace = { run: run.id, id: ++sequence };
      report({ kind: 'touch', at }, trace);
      return trace;
    },
    outcome(trace, status) {
      if (trace) report({ kind: 'outcome', status, at: performance.timeOrigin + performance.now() }, trace);
    },
    painted(trace, kind, badge, state) {
      if (!trace) return;
      requestAnimationFrame((at) => {
        if (!badge.isConnected || badge.hidden || badge.dataset.state !== state || document.hidden) return;
        // The next callback gives the preceding frame a paint opportunity. It cannot time panel scan-out.
        requestAnimationFrame(() => report({ kind, at: performance.timeOrigin + at }, trace));
      });
    },
  };
}
