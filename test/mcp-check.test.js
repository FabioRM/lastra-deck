'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { once } = require('node:events');
const { test } = require('node:test');
const { ActionHistory } = require('../src/main/action-history');
const { AgentAccess } = require('../src/main/mcp-access');
const { AgentService } = require('../src/main/mcp-service');
const { check } = require('../scripts/mcp-check');
const { tempDir } = require('./helpers/temp-dir');

test('MCP check negotiates old and current protocols, follows discovery cursors and measures offline tools', async () => {
  const reports = await Promise.all(['2025-06-18', '2025-03-26', '2024-11-05']
    .map((protocol) => check({ protocol, rounds: 2, env: { ...process.env, LASTRA_AGENT_CREDENTIAL: 'offline fixture' } })));
  for (const { ok, connection, timings, discovered, liveTools } of reports) {
    assert.equal(ok, true);
    assert.equal(connection, 'unavailable');
    assert.deepEqual(liveTools, []);
    assert.ok(discovered.tools > 20 && discovered.prompts > 1);
    assert.deepEqual(discovered, reports[0].discovered);
    assert.equal(timings.ping.count, 2);
    assert.ok(timings.catalog.p95Ms >= timings.catalog.p50Ms);
  }
  await assert.rejects(check({ protocol: '2030-01-01' }), /protocol revision/);
  await assert.rejects(check({ live: true, env: {} }), /Set LASTRA_AGENT_CREDENTIAL/);
});

test('MCP check compares two live Windows grants and recovers after the listener restarts', { skip: process.platform !== 'win32' }, async (t) => {
  let service;
  t.after(() => service?.stop());
  const dir = tempDir(t, 'lastra-mcp-check-');
  const access = new AgentAccess(path.join(dir, 'agent-access.json'));
  service = new AgentService(access, { profile: () => 'main', history: new ActionHistory(), readers: {
    profile_layout: () => ({ page: 'sample' }), provider_status: () => ({ audio: 'unavailable' }),
  } });
  access.setEnabled(true);
  const layoutCredential = access.grant(['layout'], 'main');
  const providerCredential = access.grant(['providers'], 'main');
  function live(credential) {
    return check({ live: true, rounds: 2, env: { ...process.env, LASTRA_AGENT_CREDENTIAL: credential } });
  }
  service.setLocked(false);
  await once(service.server, 'listening');
  const [layout, providers] = await Promise.all([live(layoutCredential), live(providerCredential)]);
  assert.equal(layout.ok, true);
  assert.equal(providers.ok, true);
  assert.ok(layout.liveTools.includes('profile_layout'));
  assert.ok(!layout.liveTools.includes('provider_status'));
  assert.equal(layout.timings.providers, undefined);
  assert.ok(providers.liveTools.includes('provider_status'));
  assert.equal(providers.timings.providers.count, 2);
  assert.ok(!JSON.stringify(providers).includes(providerCredential));
  service.setLocked(true);
  assert.equal((await live(providerCredential)).ok, false);
  service.setLocked(false);
  await once(service.server, 'listening');
  assert.equal((await live(providerCredential)).ok, true);
});
