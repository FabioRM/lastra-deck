'use strict';

{
  const FIELD_LIMIT = 500;
  const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_-]{0,31})\s*\}\}/gi;

  function snippetFields(template) {
    return [...new Set([...template.matchAll(PLACEHOLDER)].map((match) => match[1]))];
  }

  function snippetDraft(template, values = {}) {
    const missing = new Set();
    const text = template.replace(PLACEHOLDER, (placeholder, field) => {
      const value = Object.hasOwn(values, field) ? values[field] : undefined;
      if (typeof value === 'string' && value.length <= FIELD_LIMIT && value.trim() && !/[\u0000-\u001f\u007f]/.test(value)) return value;
      missing.add(field);
      return placeholder;
    });
    return { text, missing: [...missing] };
  }

  const library = { FIELD_LIMIT, snippetFields, snippetDraft };
  if (typeof module === 'object') module.exports = library;
  else window.LastraSnippets = library;
}
