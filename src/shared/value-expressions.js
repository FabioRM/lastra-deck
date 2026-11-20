'use strict';

{
  const MAX_VARIABLES = 64;
  const MAX_STRING = 4_096;
  const TYPES = ['string', 'integer', 'boolean'];
  const SCOPES = ['profile', 'page', 'run'];
  const ID = /^[a-z][a-z0-9_-]{0,39}$/;

  class ExpressionError extends Error {
    constructor(message, code = 'invalid-expression') {
      super(message);
      this.code = code;
    }
  }

  const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const validId = (value) => typeof value === 'string' && ID.test(value);
  const literalType = (value) => Number.isSafeInteger(value) ? 'integer'
    : typeof value === 'string' || typeof value === 'boolean' ? typeof value : null;
  const isExpression = (value) => record(value) && Object.hasOwn(value, 'expression');
  const exactFields = (value, fields) => Object.keys(value).length === fields.length
    && fields.every((key) => Object.hasOwn(value, key));

  function requireType(actual, expected) {
    if (actual && expected && actual !== expected) {
      throw new ExpressionError(`Expected ${expected}, received ${actual}.`, 'expression-type');
    }
  }

  function bound(value, type) {
    if (type === 'integer' && !Number.isSafeInteger(value)) {
      throw new ExpressionError('The integer result is outside the supported range.', 'expression-range');
    }
    if (type === 'string' && value.length > MAX_STRING) {
      throw new ExpressionError(`A string result must be at most ${MAX_STRING} characters.`, 'expression-range');
    }
    return value;
  }

  function divisor(value) {
    if (value === 0) throw new ExpressionError('Division by zero.', 'expression-range');
    return value;
  }

  const operations = {
    concat: { operands: 'string', result: 'string', min: 2, max: 12, apply: (values) => values.join('') },
    'to-string': { min: 1, max: 1, result: 'string', apply: ([value]) => String(value) },
    add: { operands: 'integer', result: 'integer', apply: ([left, right]) => left + right },
    subtract: { operands: 'integer', result: 'integer', apply: ([left, right]) => left - right },
    multiply: { operands: 'integer', result: 'integer', apply: ([left, right]) => left * right },
    divide: { operands: 'integer', result: 'integer', apply: ([left, right]) => Math.trunc(left / divisor(right)) },
    modulo: { operands: 'integer', result: 'integer', apply: ([left, right]) => left % divisor(right) },
    'less-than': { operands: 'integer', result: 'boolean', apply: ([left, right]) => left < right },
    equal: { matching: true, result: 'boolean', apply: ([left, right]) => left === right },
    not: { operands: 'boolean', min: 1, max: 1, result: 'boolean', apply: ([value]) => !value },
    and: { operands: 'boolean', result: 'boolean', lazy: ([left, right], read) => left.run(read) && right.run(read) },
    or: { operands: 'boolean', result: 'boolean', lazy: ([left, right], read) => left.run(read) || right.run(read) },
    if: { min: 3, max: 3, lazy: ([test, yes, no], read) => (test.run(read) ? yes : no).run(read) },
  };

  function compileExpression(value, expected, lookup) {
    if (!isExpression(value) || !exactFields(value, ['expression'])) {
      throw new ExpressionError('Use an object with one expression property.');
    }
    let nodes = 0;
    const references = [];
    function parse(node, depth) {
      if (++nodes > 100 || depth > 12) throw new ExpressionError('The expression is too large or deeply nested.');
      const literal = literalType(node);
      if (literal) {
        const value = bound(node, literal);
        return { type: literal, run: () => value };
      }
      if (!record(node)) throw new ExpressionError('Use literals, scoped variables, or operators as expression values.');
      if (exactFields(node, ['scope', 'var']) && SCOPES.includes(node.scope) && validId(node.var)) {
        const { scope, var: id } = node;
        references.push({ scope, id });
        return { type: lookup?.(scope, id), run: (read) => read(scope, id) };
      }
      if (!exactFields(node, ['op', 'args']) || typeof node.op !== 'string' || !Object.hasOwn(operations, node.op)) {
        throw new ExpressionError('Choose a known operator or use a variable with scope and var properties.');
      }
      const { op, args } = node;
      const { min = 2, max = 2, operands, result, matching, lazy, apply } = operations[op];
      if (!Array.isArray(args) || args.length < min || args.length > max || Object.keys(args).length !== args.length) {
        throw new ExpressionError(`Operator “${op}” needs ${min === max ? min : `${min} to ${max}`} operands.`);
      }
      const inputs = args.map((arg) => parse(arg, depth + 1));
      inputs.forEach(({ type }) => requireType(type, operands));
      if (matching) requireType(inputs[0].type, inputs[1].type);
      if (op === 'if') {
        requireType(inputs[0].type, 'boolean');
        requireType(inputs[1].type, inputs[2].type);
      }
      const type = result ?? inputs[1].type ?? inputs[2].type;
      return { type, run: (read) => bound(lazy ? lazy(inputs, read) : apply(inputs.map((input) => input.run(read))), type) };
    }
    const program = parse(value.expression, 0);
    requireType(program.type, expected);
    return { references, run: program.run };
  }

  function createExpressionScope(kind, raw, parent) {
    const input = raw === undefined ? [] : raw;
    if (!Array.isArray(input) || input.length > MAX_VARIABLES) {
      throw new ExpressionError(`The ${kind} scope can declare up to ${MAX_VARIABLES} variables.`, 'invalid-variables');
    }
    const byId = new Map();
    for (const item of input) {
      if (!record(item) || !exactFields(item, ['id', 'type', 'value']) || !validId(item.id)
          || byId.has(item.id) || !TYPES.includes(item.type)) {
        throw new ExpressionError(`Use unique lowercase IDs, types and values in the ${kind} scope.`, 'invalid-variables');
      }
      byId.set(item.id, { id: item.id, type: item.type, value: item.value });
    }

    const programs = new Map();
    const values = new Map();
    function entry(id) {
      const definition = byId.get(id);
      if (!definition) throw new ExpressionError(`Variable “${kind}.${id}” is missing.`, 'missing-variable');
      return definition;
    }

    function scopeFor(scope, id) {
      if (scope === kind) return context;
      if (parent) return parent.scopeFor(scope, id);
      throw new ExpressionError(`Scope “${scope}” is unavailable for variable “${scope}.${id}”.`, 'missing-variable');
    }

    const lookup = (scope, id) => scopeFor(scope, id).entry(id).type;
    const read = (scope, id) => scopeFor(scope, id).value(id);

    function validate(id, stack = []) {
      if (programs.has(id)) return programs.get(id);
      if (stack.includes(id)) {
        throw new ExpressionError(`Circular ${kind} variables ${[...stack, id].join(' → ')}.`, 'variable-cycle');
      }
      const { type, value } = entry(id);
      let program;
      try {
        if (isExpression(value)) program = compileExpression(value, type, lookup);
        else {
          const literal = literalType(value);
          if (!literal) throw new ExpressionError('Use a typed literal or a wrapped expression.');
          requireType(literal, type);
          const result = bound(value, type);
          program = { references: [], run: () => result };
        }
      } catch (error) {
        throw at(error, `Variable “${kind}.${id}”`);
      }
      for (const reference of program.references) {
        scopeFor(reference.scope, reference.id).validate(reference.id, reference.scope === kind ? [...stack, id] : []);
      }
      programs.set(id, program);
      return program;
    }

    function value(id) {
      if (!values.has(id)) {
        const program = validate(id);
        try { values.set(id, program.run(read)); }
        catch (error) { throw at(error, `Variable “${kind}.${id}”`); }
      }
      return values.get(id);
    }

    const context = {
      definitions: [...byId.values()], entry, scopeFor, validate, value,
      check() { for (const id of byId.keys()) value(id); },
      resolve(marker, expected) { return compileExpression(marker, expected, lookup).run(read); },
    };
    return context;
  }

  function at(error, location) {
    if (error instanceof ExpressionError && location) return new ExpressionError(`${location}: ${error.message}`, error.code);
    return error;
  }

  const api = { TYPES, MAX_VARIABLES, ExpressionError, isExpression, compileExpression, createExpressionScope, expressionErrorAt: at };
  if (typeof module === 'object') module.exports = api;
  else window.LastraValueExpressions = api;
}
