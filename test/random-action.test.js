'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createActionRunner } = require('../src/main/actions');
const { validateProfile } = require('../src/main/profile');
const { simulateGesture } = require('../src/main/mcp-simulate');
const { hasShortcutRule } = require('../src/main/shortcut-guards');
const { randomFields, repeatFields, seededRandom, RANDOM_LIMIT } = require('../src/shared/action-flow');

const text = (value) => ({ type: 'text', text: value });
const random = (pool = [text('one'), text('two'), text('three')], extra = {}) => ({ type: 'random', id: 'greeting', pool, ...extra });
const profile = (action) => ({ grid: { cols: 1, rows: 1 }, keys: [{ id: 'pick', action }] });

function runner(picks) {
  const typed = [];
  const values = [...picks];
  const api = createActionRunner({
    shell: {}, spawn() {}, audio: {}, input: { sendText: (value) => typed.push(value), sendChord() {} },
    random: () => values.shift() ?? 0,
  });
  return { typed, run: (action, options) => api.run(action, undefined, options) };
}

test('a profile accepts a random action with 2 to 10 actions and a stable ID', () => {
  assert.doesNotThrow(() => validateProfile(profile(random())));
  assert.doesNotThrow(() => validateProfile(profile(random(undefined, { avoidRepeat: true }))));
  assert.throws(() => validateProfile(profile(random([text('only')]))), /needs 2 to 10 actions/);
  assert.throws(() => validateProfile(profile(random(Array.from({ length: RANDOM_LIMIT + 1 }, () => text('x'))))), /needs 2 to 10 actions/);
  assert.throws(() => validateProfile(profile({ ...random(), id: 'not valid!' })), /valid ID/);
  assert.throws(() => validateProfile(profile(random(undefined, { avoidRepeat: 'yes' }))), /avoidRepeat/);
  assert.throws(() => validateProfile(profile(random([text('one'), null]))), /Invalid profile: key 1/);
  assert.throws(() => randomFields(random([text('one'), null])), /needs an action/);
  assert.throws(() => validateProfile(profile(random([text('one'), { type: 'nope' }]))), /option 2: unknown action type/);
});

test('nested random actions stop at the shared depth limit', () => {
  const nest = (levels) => levels === 0 ? text('leaf') : { type: 'random', id: `level-${levels}`, pool: [nest(levels - 1), text('other')] };
  assert.doesNotThrow(() => validateProfile(profile(nest(3))));
  assert.throws(() => validateProfile(profile(nest(4))), /too many nested random actions/);
});

test('each press runs the option the random source selects and reports it', async () => {
  const { typed, run } = runner([0, 0.5, 0.99, 1]);
  const first = await run(random(), { trace: true });
  assert.deepEqual(first.ok && first.message, 'Ran option 1 of 3');
  assert.deepEqual(first.steps.map(({ path, status }) => [path.join('.'), status]),
    [['', 'succeeded'], ['Option 1', 'succeeded'], ['Option 2', 'skipped'], ['Option 3', 'skipped']]);
  assert.equal((await run(random())).message, 'Ran option 2 of 3');
  assert.equal((await run(random())).message, 'Ran option 3 of 3');
  assert.equal((await run(random())).message, 'Ran option 3 of 3', 'a source that returns 1 stays inside the pool');
  assert.deepEqual(typed, ['one', 'two', 'three', 'three']);
});

test('avoidRepeat excludes the previous pick for the same ID only', async () => {
  const { typed, run } = runner([0, 0, 0, 0, 0]);
  const action = random(undefined, { avoidRepeat: true });
  for (let press = 0; press < 3; press++) await run(action);
  assert.deepEqual(typed, ['one', 'two', 'one']);
  await run({ ...action, id: 'other' });
  assert.equal(typed.at(-1), 'one', 'another ID keeps its own history');
  await run(random());
  assert.equal(typed.at(-1), 'one', 'without avoidRepeat the same option may run again');

  const pair = runner([0.9, 0.9, 0.9, 0.9]);
  const two = random([text('a'), text('b')], { avoidRepeat: true });
  for (let press = 0; press < 4; press++) await pair.run(two);
  assert.deepEqual(pair.typed, ['b', 'a', 'b', 'a']);
});

test('the picked action keeps its own checks and its failure names the option', async () => {
  const { run } = runner([0.5]);
  const failed = await run(random([text('one'), { type: 'text', text: '' }, text('three')]), { trace: true });
  assert.equal(failed.ok, false);
  assert.match(failed.message, /Missing "text"/);
  assert.equal(failed.steps.find(({ path }) => path.at(-1) === 'Option 2').status, 'failed');

  const guarded = runner([0]);
  let changed = false;
  const delayed = random([{ type: 'sequence', steps: [text('before'), { type: 'delay', ms: 0 }, text('after')] }, text('other')]);
  const result = await guarded.run(delayed, { guard: () => { if (changed) return 'The target window changed.'; changed = true; } });
  assert.equal(result.ok, false);
  assert.deepEqual(guarded.typed, []);
});

test('a result from the picked action is appended to the pick', async () => {
  const api = createActionRunner({
    shell: {}, spawn() {}, input: {}, audio: { change: () => 'Microphones muted' }, random: () => 0.6,
  });
  const result = await api.run(random([text('one'), { type: 'audio', device: 'microphone' }]), undefined);
  assert.equal(result.message, 'Ran option 2 of 2 · Microphones muted');
});

test('a seed makes an offline simulation reproducible', async () => {
  const scenario = (seed) => simulateGesture({ profile: profile(random()), key: 'pick', windowId: 1, ...(seed === undefined ? {} : { seed }) });
  const picked = async (seed) => (await scenario(seed)).steps.find(({ path, status }) => path.length === 1 && status === 'succeeded').path[0];
  const expected = (seed) => `Option ${Math.floor(seededRandom(seed)() * 3) + 1}`;
  const seen = new Set();
  for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
    assert.equal(await picked(seed), expected(seed));
    assert.equal(await picked(seed), await picked(seed));
    seen.add(await picked(seed));
  }
  assert.equal(seen.size, 3, 'the seeds cover every option');
  const unseeded = await scenario();
  assert.equal(unseeded.status, 'success');
  assert.equal(unseeded.effects.length, 1);
  await assert.rejects(scenario(-1), /seed between 0 and 4294967295/);
  await assert.rejects(scenario(1.5), /seed between 0 and 4294967295/);
});

test('walkers reach the actions inside a pool', () => {
  const guarded = { type: 'hotkey', keys: 'ctrl+w', shortcutGuard: { confirm: true } };
  assert.equal(hasShortcutRule(random([text('one'), guarded])), true);
  assert.equal(hasShortcutRule(random()), false);
  assert.equal(randomFields(random(undefined, { avoidRepeat: true })).avoidRepeat, true);
});

test('a repeat budgets a random step by its largest option', () => {
  const long = { type: 'sequence', steps: Array.from({ length: 9 }, () => ({ type: 'delay', ms: 1 })) };
  const repeated = (count) => ({ type: 'repeat', count, steps: [random([long, text('short')])] });
  // One random step costs 1 + (1 + 9) attempts for the sequence option.
  assert.doesNotThrow(() => repeatFields(repeated(9)));
  assert.throws(() => repeatFields(repeated(10)), /up to 100 total step attempts/);
});
