'use strict';

{
  const WAIT_TIMEOUT = { min: 100, max: 30_000, value: 5_000 };
  const REPEAT_COUNT = { min: 1, max: 10, value: 3 };
  const REPEAT_TIMEOUT = { ...WAIT_TIMEOUT, value: 10_000 };
  const MAX_REPEAT_STEPS = 100;
  const CHOICE_LIMIT = 6;
  const CHOICE_TIMEOUT = { min: 1_000, max: 60_000, value: 30_000 };
  const CHOICE_ID = /^[a-z0-9_-]{1,40}$/i;
  const RANDOM_LIMIT = 10;
  const MAX_DELAY_MS = 10_000;
  const WAIT_CONDITIONS = {
    foreground: { label: 'Foreground app', field: 'Executable', value: '' },
    'speaker-muted': { label: 'Speaker mute', value: true },
    'microphones-muted': { label: 'Microphone group mute', value: true },
    'obs-connected': { label: 'OBS connection', value: true },
    'obs-scene': { label: 'OBS program scene', field: 'Scene name', value: '' },
    'obs-recording': { label: 'OBS recording', value: true },
    'obs-streaming': { label: 'OBS streaming', value: true },
  };
  const FAILURE_MODES = { stop: 'Stop the macro', continue: 'Continue to the next step', retry: 'Retry this step' };

  function conditionFields(action) {
    const key = action.condition;
    if (!Object.hasOwn(WAIT_CONDITIONS, key)) throw new Error('Choose a supported wait condition');
    const expected = typeof action.expected === 'string' ? action.expected.trim() : action.expected;
    if (typeof expected !== typeof WAIT_CONDITIONS[key].value || expected === '' || (typeof expected === 'string' && expected.length > 160)) {
      throw new Error('Enter the expected value for the wait condition');
    }
    if (key === 'foreground' && !/^[^\\/:*?"<>|\x00-\x1f]+\.exe$/i.test(expected)) {
      throw new Error('Use an executable name such as Code.exe');
    }
    return { key, expected: key === 'foreground' ? expected.toLowerCase() : expected };
  }

  function waitFields(action) {
    const condition = conditionFields(action);
    const timeoutMs = action.timeoutMs ?? WAIT_TIMEOUT.value;
    if (!Number.isInteger(timeoutMs) || timeoutMs < WAIT_TIMEOUT.min || timeoutMs > WAIT_TIMEOUT.max) {
      throw new Error(`Wait timeout must be between ${WAIT_TIMEOUT.min} and ${WAIT_TIMEOUT.max} ms`);
    }
    return { ...condition, timeoutMs };
  }

  function repeatFields(action) {
    const { count } = action;
    const timeoutMs = action.timeoutMs ?? REPEAT_TIMEOUT.value;
    if (!Number.isInteger(count) || count < REPEAT_COUNT.min || count > REPEAT_COUNT.max) {
      throw new Error(`A repeat needs ${REPEAT_COUNT.min} to ${REPEAT_COUNT.max} iterations`);
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < REPEAT_TIMEOUT.min || timeoutMs > REPEAT_TIMEOUT.max) {
      throw new Error(`Repeat timeout must be between ${REPEAT_TIMEOUT.min} and ${REPEAT_TIMEOUT.max} ms`);
    }
    if (action.condition === undefined && action.expected !== undefined) throw new Error('Choose a condition for the expected value');
    function work(step, depth = 1) {
      if (!step || depth > 3) return 1;
      const attempts = step.onError === 'retry' && canRetry(step.type) ? stepPolicy(step).attempts : 1;
      if (step.type === 'sequence' && Array.isArray(step.steps)) {
        return 1 + step.steps.slice(0, 20).reduce((total, item) => total + work(item, depth + 1), 0);
      }
      if (step.type === 'if') return 1 + work(step.then, depth + 1) + (step.else ? work(step.else, depth + 1) : 0);
      if (step.type === 'choose' && Array.isArray(step.choices)) {
        return 1 + step.choices.slice(0, CHOICE_LIMIT).reduce((total, option) => total + work(option?.action, depth + 1), 0);
      }
      if (step.type === 'random' && Array.isArray(step.pool)) {
        return 1 + Math.max(0, ...step.pool.slice(0, RANDOM_LIMIT).map((option) => work(option, depth + 1)));
      }
      return attempts;
    }
    if (Array.isArray(action.steps) && count * action.steps.slice(0, 20).reduce((total, step) => total + work(step), 0) > MAX_REPEAT_STEPS) {
      throw new Error(`A repeat supports up to ${MAX_REPEAT_STEPS} total step attempts`);
    }
    return { count, timeoutMs, condition: action.condition !== undefined ? conditionFields(action) : null };
  }

  function choiceFields(action) {
    const { id, prompt, choices } = action;
    const timeoutMs = action.timeoutMs ?? CHOICE_TIMEOUT.value;
    const validText = (text, limit) => typeof text === 'string' && text.trim() && text.length <= limit && !/\p{Cc}/u.test(text);
    if (typeof id !== 'string' || !CHOICE_ID.test(id)) throw new Error('A choice needs a valid ID');
    if (!validText(prompt, 140)) throw new Error('Enter a choice prompt of 1 to 140 characters');
    if (!Number.isInteger(timeoutMs) || timeoutMs < CHOICE_TIMEOUT.min || timeoutMs > CHOICE_TIMEOUT.max) {
      throw new Error(`Choice timeout must be between ${CHOICE_TIMEOUT.min} and ${CHOICE_TIMEOUT.max} ms`);
    }
    if (!Array.isArray(choices) || choices.length < 2 || choices.length > CHOICE_LIMIT) {
      throw new Error(`A prompt needs 2 to ${CHOICE_LIMIT} choices`);
    }
    const ids = new Set();
    const options = choices.map((option) => {
      if (!option || typeof option.id !== 'string' || !CHOICE_ID.test(option.id) || ids.has(option.id)
          || !validText(option.label, 48) || !option.action || typeof option.action !== 'object') {
        throw new Error('Each choice needs a unique ID, a label of 1 to 48 characters, and an action');
      }
      ids.add(option.id);
      return { id: option.id, label: option.label.trim(), action: option.action };
    });
    return { id, prompt: prompt.trim(), timeoutMs, options };
  }

  function randomFields(action) {
    const { id, pool, avoidRepeat } = action;
    if (typeof id !== 'string' || !CHOICE_ID.test(id)) throw new Error('A random action needs a valid ID');
    if (!Array.isArray(pool) || pool.length < 2 || pool.length > RANDOM_LIMIT) {
      throw new Error(`A random action needs 2 to ${RANDOM_LIMIT} actions`);
    }
    if (pool.some((option) => !option || typeof option !== 'object' || Array.isArray(option))) {
      throw new Error('Each random option needs an action');
    }
    if (avoidRepeat !== undefined && typeof avoidRepeat !== 'boolean') throw new Error('Set avoidRepeat to true or false');
    return { id, pool, avoidRepeat: avoidRepeat === true };
  }

  /** A reproducible stand-in for Math.random, so a simulation can replay the same picks. */
  function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = Math.imul(state ^ (state >>> 15), state | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    };
  }

  function delayMs(action) {
    const ms = Number(action.ms);
    if (!Number.isFinite(ms) || ms < 0 || ms > MAX_DELAY_MS) {
      throw new Error(`Invalid delay. Enter a value between 0 and ${MAX_DELAY_MS} ms`);
    }
    return ms;
  }

  function canRetry(type) {
    return type === 'launch' || type === 'wait-for';
  }

  function stepPolicy(action) {
    if (!action || typeof action !== 'object') throw new Error('No action assigned');
    const mode = action.onError ?? 'stop';
    if (!Object.hasOwn(FAILURE_MODES, mode)) throw new Error('Choose stop, continue, or retry for step failures');
    if (mode === 'retry' && !canRetry(action.type)) throw new Error('This step cannot be retried safely');
    const attempts = mode === 'retry' ? action.attempts ?? 2 : 1;
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3 || (mode === 'retry' && attempts < 2)) {
      throw new Error('A retrying step needs two or three attempts');
    }
    return { mode, attempts };
  }

  function layoutTokens(combo) {
    return typeof combo === 'string' && /(?:^|\+)\s*(?:char:|scan:|[/`=;:]\s*(?:\+|$))|(?:^|\+)\s*\+$/.test(combo.trim().toLowerCase());
  }

  const api = { WAIT_CONDITIONS, WAIT_TIMEOUT, REPEAT_COUNT, REPEAT_TIMEOUT, MAX_REPEAT_STEPS, CHOICE_LIMIT, CHOICE_TIMEOUT, CHOICE_ID,
    RANDOM_LIMIT, FAILURE_MODES, conditionFields, waitFields, repeatFields, choiceFields, randomFields, seededRandom,
    delayMs, canRetry, stepPolicy, layoutTokens };
  if (typeof module === 'object') module.exports = api;
  else window.LastraActionFlow = api;
}
