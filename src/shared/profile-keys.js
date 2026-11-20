'use strict';

{
  const { createMacroResolver } = typeof module === 'object' ? require('./parameterized-macros') : window.LastraParameterizedMacros;
  const { createExpressionScope, ExpressionError, expressionErrorAt } = typeof module === 'object'
    ? require('./value-expressions') : window.LastraValueExpressions;
  const { resolveLinkedKey } = typeof module === 'object' ? require('./linked-controls') : window.LastraLinkedControls;
  const visualItems = [
    ['label', 'labelExpression', /^\P{Cc}{1,40}$/u, 'Enter a label of 1 to 40 characters.'],
    ['icon', 'iconExpression', /^[a-z0-9-]{1,60}$/, 'Enter a Lucide icon name.'],
  ];

  function createProfileKeys(profile) {
    const macros = createMacroResolver(profile.macros);
    const profileScope = createExpressionScope('profile', profile.variables);
    const pageScopes = new WeakMap();

    function pageScope(page) {
      if (!page || page === profile.bar || page.id === 'bar:') return profileScope;
      if (!pageScopes.has(page)) pageScopes.set(page, createExpressionScope('page', page.variables, profileScope));
      return pageScopes.get(page);
    }

    function runScope(key, page) {
      return createExpressionScope('run', key?.runVariables, pageScope(page));
    }

    function resolve(placement, page) {
      if (!placement) return placement;
      const key = resolveLinkedKey(profile, placement);
      const run = runScope(key, page);
      run.check();
      const behavior = macros.behavior(key, key.controlId ? profileScope : run);
      const visuals = {};
      for (const [field, expression, pattern, reason] of visualItems) {
        if (key[expression] === undefined) continue;
        try {
          const value = run.resolve(key[expression], 'string');
          if (!pattern.test(value) || !value.trim()) throw new ExpressionError(reason, 'expression-value');
          visuals[field] = value;
        } catch (error) { throw expressionErrorAt(error, `Key ${field}`); }
      }
      return Object.keys(visuals).length ? { ...behavior, ...visuals } : behavior;
    }

    function materialize(kind, item, page) {
      function copy(key) {
        if (!key) return key;
        const { runVariables, labelExpression, iconExpression, ...value } = resolve(key, page);
        return value;
      }
      if (kind === 'key') return copy(item);
      if (kind === 'group') return { ...item, keys: item.keys.map(copy) };
      if (kind === 'page') {
        const { variables, ...value } = item;
        return { ...value, keys: item.keys.map(copy) };
      }
      return item;
    }

    return { macros, profileScope, pageScope, runScope, resolve, materialize };
  }

  const api = { createProfileKeys };
  if (typeof module === 'object') module.exports = api;
  else window.LastraProfileKeys = api;
}
