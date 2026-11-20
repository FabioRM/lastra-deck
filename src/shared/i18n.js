'use strict';

{
  const italian = typeof module === 'object' ? require('./i18n-it') : window.LastraItalian;

  function translate(language, source, values = {}) {
    if (typeof source !== 'string') return '';
    const message = language === 'it' && Object.hasOwn(italian, source) ? italian[source] : source;
    return message.replace(/\{([a-z][a-z0-9]*)\}/gi, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
  }

  function mount(document) {
    const root = document.documentElement;
    const initial = new URL(document.URL).searchParams.get('language');
    const bindings = [];
    let language = 'en';
    const t = (source, values) => translate(language, source, values);
    const canTranslate = (value) => value && Object.hasOwn(italian, value);
    // HTML labels are registered before feature scripts add profile or provider content.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement.closest('script, style, textarea')) continue;
      const source = node.data.trim().replace(/\s+/g, ' ');
      if (!canTranslate(source)) continue;
      const before = node.data.match(/^\s*/)[0];
      const after = node.data.match(/\s*$/)[0];
      bindings.push({ node, source, before, after, previous: node.data });
    }
    for (const node of document.body.querySelectorAll('[title], [aria-label], [placeholder], [alt]')) {
      for (const name of ['title', 'aria-label', 'placeholder', 'alt']) {
        const source = node.getAttribute(name);
        if (canTranslate(source)) bindings.push({ node, name, source, previous: source });
      }
    }

    function set(next) {
      if ((next !== 'en' && next !== 'it') || next === language) return;
      language = root.lang = next;
      for (const binding of bindings) {
        const { node, source, name, before, after } = binding;
        if (!node.isConnected) continue;
        const current = name ? node.getAttribute(name) : node.data;
        if (current !== binding.previous) continue;
        const translated = t(source);
        binding.previous = name ? translated : before + translated + after;
        if (name) node.setAttribute(name, translated);
        else node.data = binding.previous;
      }
      document.dispatchEvent(new Event('lastra-language'));
    }
    set(initial);
    return Object.freeze({ t, set, get language() { return language; } });
  }

  if (typeof module === 'object') module.exports = { translate };
  else window.LastraI18n = mount(document);
}
