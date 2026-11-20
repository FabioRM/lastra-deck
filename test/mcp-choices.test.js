'use strict';

const assert = require('node:assert/strict');
const { setImmediate, setTimeout } = require('node:timers/promises');
const { test } = require('node:test');
const { AgentChoices, choiceParams } = require('../src/main/mcp-choices');
const { ActionHistory } = require('../src/main/action-history');

const owner = { id: 'a'.repeat(32) };
const other = { id: 'b'.repeat(32) };
const proposal = {
  command: 'request', target: 'Draft profile', question: 'Choose the first page',
  choices: [{ id: 'stats', label: 'Stats', effect: 'Use the existing Stats layout.' },
    { id: 'keys', label: 'Keys', effect: 'Use the existing Keys layout.' }],
};

function fixture(timeout) {
  const history = new ActionHistory();
  let allowed = true;
  let visible = true;
  let review;
  let resolve;
  const service = new AgentChoices({ canReview: () => visible, history, timeout,
    approve: (details) => { review = details; return new Promise((answer) => { resolve = answer; }); } });
  const send = (params, client = owner) => service.change(choiceParams(params), client, () => allowed);
  const status = ({ request }) => send({ command: 'status', request });
  return { send, status, history, review: () => review, answer: (answer) => resolve(answer),
    hide() { visible = false; service.checkPending(); }, show() { visible = true; },
    revoke() { allowed = false; service.checkPending(); } };
}

test('choice requests validate exact printable options and keep answers private to the requester', async () => {
  const f = fixture();
  assert.throws(() => f.send({ ...proposal, command: 'display' }));
  assert.throws(() => f.send({ ...proposal, choices: [proposal.choices[0], proposal.choices[0]] }), /distinct options/);
  assert.throws(() => f.send({ ...proposal, question: 'Incomplete\nquestion' }), /question/);
  const pending = f.send(proposal);
  assert.equal(pending.status, 'awaiting_confirmation');
  assert.deepEqual(f.review().choices, proposal.choices);
  assert.equal(f.review().caller, 'aaaaaaaa');
  assert.throws(() => f.send(proposal, other), /cannot display/);
  assert.throws(() => f.send({ command: 'status', request: pending.request }, other), /request is unavailable/);
  f.answer({ choice: 'stats' });
  await setImmediate();
  assert.deepEqual(f.status(pending), { ...pending, status: 'answered', choice: 'stats' });
  assert.doesNotMatch(JSON.stringify(f.history.snapshot()), /Choose the first page|existing Stats layout/);
});

test('declining, cancelling, hiding, revoking and expiring finish outstanding choices', async () => {
  const f = fixture(25);
  let pending = f.send(proposal);
  f.answer(false);
  await setImmediate();
  assert.equal(f.status(pending).status, 'declined');
  pending = f.send(proposal);
  assert.equal(f.send({ command: 'cancel', request: pending.request }).status, 'cancelled');
  assert.equal(f.review().signal.aborted, true);
  pending = f.send(proposal);
  f.hide();
  assert.equal(f.status(pending).status, 'cancelled');
  f.show();
  pending = f.send(proposal);
  await setTimeout(45);
  assert.equal(f.status(pending).status, 'expired');
  f.send(proposal);
  f.revoke();
  assert.equal(f.review().signal.aborted, true);
});
