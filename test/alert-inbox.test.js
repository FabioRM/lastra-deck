'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { AlertInbox } = require('../src/main/alert-inbox');
const { tempDir } = require('./helpers/temp-dir');

const check = { id: 'service:one', name: 'Web', viewId: 'service-health', targetId: 'one', source: 'Service health' };

function fileFixture(t) {
  const directory = tempDir(t, 'lastra-alerts-');
  const file = path.join(directory, 'alerts.json');
  return file;
}

test('outages group by source and check, preserve acknowledgements, and reopen a recovered incident', (t) => {
  const file = fileFixture(t);
  let now = 10;
  let inbox = new AlertInbox(file, { now: () => now });
  inbox.update(check, 'recovered', 'HTTP 204');
  assert.deepEqual(inbox.snapshot().entries, []);
  inbox.update(check, 'active', 'HTTP 500');
  now++;
  inbox.update(check, 'active', 'HTTP 500');
  assert.equal(inbox.snapshot().entries[0].updatedAt, 10);
  assert.deepEqual(inbox.change({ action: 'acknowledge', id: check.id }), { ok: true });
  inbox = new AlertInbox(file, { now: () => now });
  assert.equal(inbox.snapshot().entries[0].acknowledgedAt, 11);
  now++;
  inbox.update(check, 'recovered', 'HTTP 204');
  assert.equal(inbox.snapshot().entries[0].status, 'recovered');
  assert.equal(inbox.snapshot().entries[0].acknowledgedAt, 11);
  now++;
  inbox.update(check, 'active', 'HTTP 503');
  assert.equal(inbox.snapshot().entries[0].occurrences, 2);
  assert.equal(inbox.snapshot().entries[0].acknowledgedAt, null);
  assert.equal(inbox.snapshot().entries[0].openedAt, 13);
  inbox.retireMissing('Service health', []);
  assert.equal(inbox.snapshot().entries[0].status, 'retired');
});

test('a malformed alert store survives and new alerts remain visible this session', (t) => {
  const file = fileFixture(t);
  fs.writeFileSync(file, '{broken');
  const inbox = new AlertInbox(file);
  inbox.update(check, 'active', 'No connection');
  assert.equal(inbox.snapshot().entries[0].status, 'active');
  assert.match(inbox.snapshot().warning, /Could not read/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});
