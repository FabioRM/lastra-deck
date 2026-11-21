'use strict';

(() => {
  const stage = document.getElementById('stage');
  const notice = document.getElementById('view-only-status');
  const controls = 'button, input, select, textarea, a[href], [role="button"], [contenteditable="true"]';
  const passive = [
    '#dashboard-switch', '#home-page', '#previous', '#next', '#page-count',
    '#page-directory-open', '#page-directory-close', '#page-directory-home', '#page-directory-path button',
    '#quick-tools-open', '#quick-tools-close', '#quick-tools-desktop', '#pomodoro-break-close',
    '#quick-tools-backlight', '#deck-backlight-close', '#deck-backlight-refresh',
    '.widget-decision .widget-action',
    '.page-directory-folder', '.page-directory-row > button:first-child',
    '.key-feedback', '#key-feedback-close', '#key-confirmation-cancel',
    '#obs-tab', '#obs-return', '#obs-preview-toggle', '#obs-timers-toggle', '.obs-paging button', '#obs-items button', '#obs-confirm-cancel',
    '#obs-modes-toggle', '[data-obs-mode-preview]', '#obs-mode-review-cancel',
    '#app-views-tab', '#app-views-return', '#app-views-catalog-button', '.app-view-card',
    '#app-views-search', '#app-views-type', '#app-views-keyboard button',
    '.snippet-search, .snippet-reload, .snippet-kinds button, .snippet-results button, .snippet-fields input',
    '.snippet-search-toggle, .snippet-keyboard button',
    '.clipboard-pins-reload, .clipboard-pins-close',
    '.project-select',
    '.github-repository',
    '.audio-preset-select', '.audio-preset-refresh',
    '#app-views-previous', '#app-views-next', '#stats-panel :is(button, select)',
    '#stats-timeline-close',
    '#stats-processes-dialog :is(button, select)',
    '#emoji-tab', '#emoji-return', '#emoji-search', '#emoji-type', '#emoji-keyboard button', '#emoji-categories button',
    '.notes-toolbar > button', '.notes-pager button', '.notes-cancel', '.watchlist-card', '.watchlist-back',
    '.kubernetes-target select, .kubernetes-pod-actions :is(button, select), .kubernetes-refresh, .kubernetes-close-logs',
    '.widget-stack-tabs button', '#app-mixer-toggle', '#app-mixer-close', '#app-mixer-prev', '#app-mixer-next',
    '#microphone-mixer-toggle', '#microphone-mixer-close', '#microphone-mixer-options button', '#speaker-output-close',
  ].join(',');
  let enabled = false;

  const marked = new Map();
  const blocked = (el) => el?.matches(controls) && !el.matches(passive);

  function mark(control) {
    if (!control.matches('.key') && blocked(control) && !marked.has(control)) {
      marked.set(control, control.getAttribute('aria-disabled'));
      control.setAttribute('aria-disabled', 'true');
    }
  }

  function markWithin(node) {
    mark(node);
    node.querySelectorAll(controls).forEach(mark);
  }

  const observer = new MutationObserver((changes) => {
    for (const [control] of marked) if (!control.isConnected) marked.delete(control);
    for (const change of changes) {
      for (const node of change.addedNodes) if (node instanceof Element) markWithin(node);
    }
  });

  function set(value) {
    if (enabled === value) return;
    enabled = value;
    stage.toggleAttribute('data-view-only', enabled);
    notice.hidden = !enabled;
    if (enabled) {
      markWithin(stage);
      observer.observe(stage, { childList: true, subtree: true });
    } else {
      observer.disconnect();
      for (const [control, previous] of marked) {
        if (previous === null) control.removeAttribute('aria-disabled');
        else control.setAttribute('aria-disabled', previous);
      }
      marked.clear();
    }
    document.dispatchEvent(new CustomEvent('lastra:view-only', { detail: enabled }));
  }

  function cancel(event) {
    if (!enabled || !blocked(event.target.closest?.(controls))) return;
    // Let the grid keep tracking swipes that start on a key.
    if (event.type === 'pointerdown' && event.target.closest('.key, .emoji-key')) return;
    if (event.type === 'keydown' && ['Tab', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  for (const name of ['pointerdown', 'click', 'keydown', 'beforeinput', 'input', 'change']) {
    document.addEventListener(name, cancel, { capture: true });
  }
  window.LastraViewOnly = { set };
})();
