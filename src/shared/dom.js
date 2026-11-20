'use strict';

// Small DOM builders shared by the deck renderer and the editor. Text is only ever written
// through textContent; nothing here parses HTML.
{
  // Options: className (set when non-empty), text (textContent, skipped when null/undefined),
  // label (aria-label), title, dataset (copied onto node.dataset) and attrs (setAttribute for
  // every entry whose value is not null/undefined).
  function decorate(node, { className, text, label, title, dataset, attrs } = {}) {
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    if (label) node.setAttribute('aria-label', label);
    if (title) node.title = title;
    if (dataset) Object.assign(node.dataset, dataset);
    if (attrs) {
      for (const [name, value] of Object.entries(attrs)) {
        if (value != null) node.setAttribute(name, String(value));
      }
    }
    return node;
  }

  // element(tag, className?, text?) or element(tag, { className, text, label, title, dataset, attrs }).
  function element(tag, options, text) {
    const settings = options !== null && typeof options === 'object' ? options : { className: options, text };
    return decorate(document.createElement(tag), settings);
  }

  // button(text, onClick?, { className, disabled, pressed, label, title, dataset, attrs }).
  // Always type="button". `pressed` sets aria-pressed when defined; `disabled` is applied when
  // defined; `label` is the aria-label, never the visible text.
  function button(text, onClick, { disabled, pressed, ...options } = {}) {
    const control = decorate(document.createElement('button'), { ...options, text });
    control.type = 'button';
    if (disabled !== undefined) control.disabled = Boolean(disabled);
    if (pressed !== undefined) control.setAttribute('aria-pressed', String(pressed));
    if (onClick) control.addEventListener('click', onClick);
    return control;
  }

  const dom = { element, button };
  if (typeof module === 'object') module.exports = dom;
  else window.LastraDom = dom;
}
