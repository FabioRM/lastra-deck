'use strict';

{
  const MIN_CHOICES = 2;
  const MAX_CHOICES = 8;
  const MAX_CHOICE_LENGTH = 32;
  const DEFAULT_CHOICES = Object.freeze(['Option A', 'Option B']);

  function normalizeChoices(value) {
    if (!Array.isArray(value) || value.length < MIN_CHOICES || value.length > MAX_CHOICES) return null;
    const choices = Array.from(value, (choice) => typeof choice === 'string' ? choice.trim() : '');
    if (choices.some((choice) => !/^[^\p{Cc}\p{Zl}\p{Zp}]+$/u.test(choice) || [...choice].length > MAX_CHOICE_LENGTH)) return null;
    return new Set(choices.map((choice) => choice.toLowerCase())).size === choices.length ? choices : null;
  }

  function decisionResult(kind, choices, random = Math.random) {
    if (kind === 'coin') return random() < 0.5 ? 'Heads' : 'Tails';
    if (kind === 'die') return String(1 + Math.floor(6 * random()));
    if (kind === 'pick') return choices[Math.floor(choices.length * random())];
    throw new Error('Unknown decision tool');
  }

  const api = { MIN_CHOICES, MAX_CHOICES, MAX_CHOICE_LENGTH, DEFAULT_CHOICES, normalizeChoices, decisionResult };
  if (typeof module === 'object') module.exports = api;
  else window.LastraDecisions = api;
}
