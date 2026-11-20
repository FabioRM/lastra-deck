'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ChoicePrompts } = require('../src/main/choice-prompts');
const { simulateGesture } = require('../src/main/mcp-simulate');
const { validateProfile } = require('../src/main/profile');
const { composeMacro } = require('../src/main/mcp-macros');

const text = (value) => ({ type: 'text', text: value });
const action = { type: 'choose', id: 'workflow', prompt: 'Choose a workflow', timeoutMs: 1200, choices: [
  { id: 'notes', label: 'Notes', action: text('notes') },
  { id: 'review', label: 'Review', action: { type: 'delay', ms: 300 } },
] };
const sequence = { type: 'sequence', steps: [{ ...action, onError: 'continue' }, text('following step')] };
const profile = (keyAction = sequence) => ({ grid: { cols: 1, rows: 1 }, keys: [{ id: 'prompt', action: keyAction }] });
const scenario = (options = {}) => simulateGesture({ profile: profile(), key: 'prompt', ...options });

test('a single pending deck choice requires its token, a valid option, and the original context', async () => {
  const views = [];
  const prompts = new ChoicePrompts((value) => views.push(value));
  let valid = true;
  const options = { prompt: action.prompt, options: action.choices, timeoutMs: 1000 };
  const guard = () => { if (!valid) throw new Error('Target changed'); };
  const first = prompts.ask(options, guard);
  const { token, choices } = views[0];
  assert.deepEqual(choices, [{ id: 'notes', label: 'Notes' }, { id: 'review', label: 'Review' }]);
  assert.equal(prompts.answer('invalid', 'notes'), false);
  assert.equal(prompts.answer(token, 'invalid'), false);
  assert.match((await prompts.ask(options, guard)).message, /another macro/i);
  assert.equal(prompts.answer(token, 'notes'), true);
  assert.deepEqual(await first, { id: 'notes' });
  assert.equal(views.at(-1), null);

  const second = prompts.ask(options, guard);
  const next = views.at(-1).token;
  assert.equal(prompts.answer(token, 'notes'), false);
  valid = false;
  assert.equal(prompts.answer(next, 'notes'), false);
  await assert.rejects(second, /target changed/i);
  assert.equal(views.at(-1), null);
});

test('simulator branches from the answer and then continues with subsequent steps', async () => {
  const selected = await scenario({ answers: { workflow: 'review' } });
  assert.equal(selected.status, 'success');
  assert.equal(selected.elapsedMs, 300);
  assert.equal(selected.effects.length, 1);
  assert.equal(selected.effects[0].atMs, 300);
  assert.equal(selected.steps.find(({ path }) => path.at(-1) === 'Choice 1').status, 'skipped');
  assert.equal(selected.steps.find(({ path }) => path.at(-1) === 'Choice 2').status, 'succeeded');
  assert.equal((await scenario({ answers: { workflow: 'notes' } })).effects.length, 2);
});

test('invalid choices, timeout, cancellation and a target change skip later effects', async () => {
  const wrong = await scenario({ answers: { workflow: 'unknown' } });
  assert.equal(wrong.status, 'failed');
  assert.equal(wrong.effects.length, 0);
  const expired = await scenario();
  assert.equal(expired.elapsedMs, 1200);
  assert.match(expired.message, /choice timed out/i);
  assert.deepEqual(expired.effects, []);
  const cancelled = await scenario({ timeline: [{ atMs: 150, cancel: true }] });
  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(cancelled.effects, []);
  const changed = await scenario({ windowId: 1, timeline: [{ atMs: 150, windowId: 2 }] });
  assert.equal(changed.status, 'unavailable');
  assert.deepEqual(changed.effects, []);
});

test('choice authoring validates every branch and preserves macro review requirements', () => {
  const duplicate = { ...action, choices: [action.choices[0], { ...action.choices[1], id: 'notes' }] };
  assert.throws(() => validateProfile(profile(duplicate)), /unique ID/);
  assert.throws(() => validateProfile(profile({ ...action, choices: [action.choices[0]] })), /needs 2 to 6/);
  const broken = { ...action, choices: [action.choices[0], { ...action.choices[1], action: { type: 'hotkey', keys: 'Ctrl+not-a-key' } }] };
  assert.equal(composeMacro({ profile: profile(broken) }).valid, false);
  assert.equal(composeMacro({ profile: profile() }).valid, true);
});
