'use strict';

{
  const { WAIT_CONDITIONS } = typeof module === 'object' ? require('./action-flow') : window.LastraActionFlow;
  const { isExpression, compileExpression, createExpressionScope, expressionErrorAt } = typeof module === 'object'
    ? require('./value-expressions') : window.LastraValueExpressions;
  const MAX_MACROS = 64;
  const MAX_PARAMETERS = 16;
  const TYPES = ['string', 'integer', 'boolean'];
  const ID = /^[a-z][a-z0-9_-]{0,39}$/;
  const BEHAVIOR = ['action', 'hold', 'double'];
  const SAMPLE = Symbol('Macro parameter sample');
  const CALL_FIELDS = ['type', 'macro', 'args', 'onError', 'attempts'];

  const TYPES_BY_ACTION = {
    launch: { target: 'string', cwd: 'string', reuseWindow: 'boolean' },
    open: { target: 'string' }, workspace: { workspace: 'string' }, hotkey: { keys: 'string' },
    text: { text: 'string' }, media: { key: 'string' }, delay: { ms: 'integer' },
    'wait-for': { timeoutMs: 'integer' }, repeat: { count: 'integer', timeoutMs: 'integer' }, choose: { timeoutMs: 'integer' },
    audio: { device: 'string' }, 'obs-scene': { scene: 'string', bus: 'string' }, timer: { label: 'string', durationMs: 'integer' },
    sound: { file: 'string', volume: 'integer', output: 'string' },
  };
  const SAMPLE_STRINGS = { 'hotkey.keys': 'Ctrl+F', 'media.key': 'playpause', 'obs-scene.bus': 'program', 'audio.device': 'output',
    'sound.file': 'C:\\Sounds\\sample.wav' };

  class MacroError extends Error {
    constructor(message, code = 'invalid-macro') {
      super(message);
      this.code = code;
    }
  }

  const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const typeOf = (value) => Number.isSafeInteger(value) ? 'integer' : typeof value;
  const validId = (value) => typeof value === 'string' && ID.test(value);

  function onlyFields(value, fields) {
    return record(value) && Object.keys(value).every((name) => fields.includes(name));
  }

  function parameterType(definition, seen, where) {
    if (!onlyFields(definition, ['id', 'type', 'default']) || !validId(definition.id) || seen.has(definition.id)
        || !TYPES.includes(definition.type)) throw new MacroError(`${where}: use unique parameter IDs and a supported type.`);
    const param = { id: definition.id, type: definition.type };
    if (Object.hasOwn(definition, 'default')) {
      if (typeOf(definition.default) !== param.type) throw new MacroError(`${where}: ${param.id} default must be ${param.type}.`);
      param.default = definition.default;
    }
    seen.add(param.id);
    return param;
  }

  function normalizeMacros(raw) {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length > MAX_MACROS) throw new MacroError(`Provide up to ${MAX_MACROS} shared macros.`);
    const seen = new Set();
    return raw.map((item, index) => {
      const where = `Shared macro ${index + 1}`;
      if (!onlyFields(item, ['id', 'label', 'parameters', 'action']) || !validId(item.id) || seen.has(item.id)) {
        throw new MacroError(`${where}: use a unique lowercase ID.`);
      }
      if (typeof item.label !== 'string' || !/^\P{Cc}{1,40}$/u.test(item.label.trim())) {
        throw new MacroError(`${where}: enter a label up to 40 characters.`);
      }
      const parameters = item.parameters === undefined ? [] : item.parameters;
      if (!Array.isArray(parameters) || parameters.length > MAX_PARAMETERS || !record(item.action)) {
        throw new MacroError(`${where}: provide an action and up to ${MAX_PARAMETERS} parameters.`);
      }
      const names = new Set();
      seen.add(item.id);
      return { id: item.id, label: item.label.trim(), parameters: parameters.map((param) => parameterType(param, names, where)), action: item.action };
    });
  }

  function fieldType(action, field) {
    if (['if', 'wait-for', 'repeat'].includes(action.type) && field === 'expected') {
      return Object.hasOwn(WAIT_CONDITIONS, action.condition) ? typeOf(WAIT_CONDITIONS[action.condition].value) : undefined;
    }
    const fields = Object.hasOwn(TYPES_BY_ACTION, action.type) ? TYPES_BY_ACTION[action.type] : undefined;
    return fields && Object.hasOwn(fields, field) ? fields[field] : undefined;
  }

  function sampleValue(type, action, field) {
    if (type === 'boolean') return true;
    if (type === 'integer') return field === 'timeoutMs' ? 5_000 : field === 'count' ? 1 : field === 'durationMs' ? 60_000 : 100;
    if (field === 'expected' && action.condition === 'foreground') return 'sample.exe';
    return SAMPLE_STRINGS[`${action.type}.${field}`] ?? 'sample';
  }

  function parameterValue(value, type, scope, where) {
    if (!record(value) || !Object.hasOwn(value, 'parameter')) return value;
    if (!onlyFields(value, ['parameter']) || !validId(value.parameter)) throw new MacroError(`${where}: use one explicit parameter reference.`);
    const binding = scope?.get(value.parameter);
    if (!binding) throw new MacroError(`${where}: parameter “${value.parameter}” is unavailable.`, 'missing-parameter');
    if (binding.type !== type) throw new MacroError(`${where}: parameter “${value.parameter}” must be ${type}.`);
    return binding.value;
  }

  function argumentValue(value, type, scope, where, evaluate) {
    if (!type || !isExpression(value)) return parameterValue(value, type, scope, where);
    try { return evaluate(value, type); }
    catch (error) { throw expressionErrorAt(error, where); }
  }

  function assertStatic(value, path, depth = 0) {
    if (!value || typeof value !== 'object') return;
    if (depth > 48) throw new MacroError(`${path}: unsupported nested data.`);
    if (isExpression(value) || (record(value) && Object.hasOwn(value, 'parameter'))) {
      throw new MacroError(`${path}: this field must use a literal value.`);
    }
    for (const child of Object.values(value)) assertStatic(child, path, depth + 1);
  }

  function createMacroResolver(raw) {
    const definitions = normalizeMacros(raw);
    const byId = new Map(definitions.map((definition) => [definition.id, definition]));

    function expandCall(action, scope, stack, budget, evaluate) {
      if (!onlyFields(action, CALL_FIELDS) || !validId(action.macro) || (action.args !== undefined && !record(action.args))) {
        throw new MacroError('A shared macro call needs a macro ID and a parameter object.');
      }
      const { macro, args = {} } = action;
      const definition = byId.get(macro);
      if (!definition) throw new MacroError(`Shared macro “${macro}” is unavailable.`, 'missing-macro');
      if (stack.includes(macro)) throw new MacroError(`Circular shared macro call: ${[...stack, macro].join(' → ')}.`, 'macro-cycle');
      if (stack.length >= 16) throw new MacroError('A shared macro call can nest up to 16 definitions.');
      const names = new Set(definition.parameters.map(({ id }) => id));
      if (Object.keys(args).some((name) => !names.has(name))) throw new MacroError(`Shared macro “${macro}” has an unknown argument.`);
      const callee = new Map(definition.parameters.map(({ id, type, default: fallback }) => {
        const where = `Shared macro “${macro}”, argument “${id}”`;
        const value = Object.hasOwn(args, id) ? argumentValue(args[id], type, scope, where, evaluate) : fallback;
        if (value === undefined) throw new MacroError(`${where} is required.`, 'missing-parameter');
        if (value !== SAMPLE && typeOf(value) !== type) throw new MacroError(`${where} must be ${type}.`);
        return [id, { type, value }];
      }));
      assertStatic(action.onError, 'Call retry policy');
      assertStatic(action.attempts, 'Call retry attempts');
      const { onError, attempts, ...body } = expand(definition.action, callee, [...stack, macro], budget, 0, evaluate);
      // Sequence retry/continue belongs to the calling step. Inner steps keep their policies.
      if (Object.hasOwn(action, 'onError')) body.onError = action.onError;
      if (Object.hasOwn(action, 'attempts')) body.attempts = action.attempts;
      return body;
    }

    function expand(action, scope, stack, budget, depth, evaluate) {
      if (!record(action)) throw new MacroError('A shared macro must contain an action object.');
      if (++budget.nodes > 20_000 || depth > 16) throw new MacroError('The expanded shared macro exceeds the action limit.');
      if (action.type === 'macro') return expandCall(action, scope, stack, budget, evaluate);
      const entries = Object.entries(action).map(([field, existing]) => {
        let value = existing;
        const path = `${action.type}.${field}`;
        if (((action.type === 'sequence' || action.type === 'repeat') && field === 'steps' && Array.isArray(value))
            || (action.type === 'random' && field === 'pool' && Array.isArray(value))) {
          const steps = value.map((next) => expand(next, scope, stack, budget, depth + 1, evaluate));
          if (steps.some((next, index) => next !== value[index])) value = steps;
        } else if (action.type === 'if' && (field === 'then' || field === 'else')) {
          value = expand(value, scope, stack, budget, depth + 1, evaluate);
        } else if (action.type === 'choose' && field === 'choices' && Array.isArray(value)) {
          const choices = value.map((choice) => {
            if (!record(choice)) throw new MacroError('Each choice needs a label and an action.');
            const expanded = expand(choice.action, scope, stack, budget, depth + 1, evaluate);
            return expanded !== choice.action ? { ...choice, action: expanded } : choice;
          });
          if (choices.some((choice, index) => choice !== value[index])) value = choices;
        } else if (action.type === 'launch' && field === 'args' && Array.isArray(value)) {
          const args = value.map((argument) => {
            const selected = argumentValue(argument, 'string', scope, path, evaluate);
            if (selected === argument) assertStatic(argument, path);
            return selected === SAMPLE ? 'sample' : selected;
          });
          if (args.some((argument, index) => argument !== value[index])) value = args;
        } else {
          const type = fieldType(action, field);
          if (type) {
            value = argumentValue(existing, type, scope, path, evaluate);
            if (value === SAMPLE) value = sampleValue(type, action, field);
          }
          if (value === existing) assertStatic(value, path);
        }
        return [field, value];
      });
      return entries.some(([field, value]) => action[field] !== value) ? Object.fromEntries(entries) : action;
    }

    function sample(definition) {
      const scope = new Map(definition.parameters.map(({ id, type, default: fallback }) => [id, { type, value: fallback ?? SAMPLE }]));
      const evaluate = (expression, type) => {
        const program = compileExpression(expression, type);
        return program.references.length ? SAMPLE : program.run();
      };
      return expand(definition.action, scope, [definition.id], { nodes: 0 }, 0, evaluate);
    }

    function resolve(action, context = createExpressionScope('run')) {
      return expand(action, undefined, [], { nodes: 0 }, 0, context.resolve);
    }

    function behavior(key, context) {
      if (!key) return key;
      const actions = BEHAVIOR.filter((field) => key[field] !== undefined).map((field) => [field, resolve(key[field], context)]);
      return actions.some(([field, value]) => key[field] !== value) ? { ...key, ...Object.fromEntries(actions) } : key;
    }

    return { definitions, resolve, sample, behavior };
  }

  const api = { MAX_MACROS, MAX_PARAMETERS, TYPES, MacroError, createMacroResolver, actionValueType: fieldType };
  if (typeof module === 'object') module.exports = api;
  else window.LastraParameterizedMacros = api;
}
