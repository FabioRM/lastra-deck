'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { test } = require('node:test');
const { ActionHistory } = require('../src/main/action-history');
const { buildDiagnostics } = require('../src/main/diagnostics');
const { AgentAccess } = require('../src/main/mcp-access');
const { LIVE_OPERATIONS } = require('../src/main/mcp-catalog');
const { connectAgent } = require('../src/main/mcp-client');
const { AgentDrafts } = require('../src/main/mcp-drafts');
const { AgentGestureFixtures, fixtureParams } = require('../src/main/mcp-gesture-fixtures');
const { AgentService } = require('../src/main/mcp-service');
const { MeasurementRun, SETTLE_MS } = require('../src/main/panel-measurement');
const { tempDir } = require('./helpers/temp-dir');

const owner = 'a'.repeat(32);
const activity = 'work';
const allowed = () => true;
const delayed = (ms) => ({ type: 'sequence', steps: [{ type: 'delay', ms }, { type: 'hotkey', keys: 'Ctrl+S' }] });
const profile = (action = delayed(120)) => ({ pages: [{ id: 'main', apps: ['code.exe'], keys: [{ id: 'key', action }] }] });
const scenario = { page: 'main', key: 'key', gesture: 'tap', windowId: 1, keyboardLayout: 'us', values: { foreground: 'code.exe' },
  timeline: [{ atMs: 90, windowId: 2 }] };

function tempDirectory(t) {
  return tempDir(t, 'lastra-gesture-trace-');
}

function traceSample() {
  const run = new MeasurementRun({ id: 1, phase: 'active', now: 10_000, setup: { view: 'keys' } });
  const at = 10_000 + SETTLE_MS + 1_000;
  run.observe(at - 40, { window: 'private-original-window', cursor: { x: 700, y: 800 } });
  run.observe(at + 20, { window: 'private-other-window', cursor: { x: 708, y: 800 } });
  run.command({ run: 1, id: 1 }, 'request', at + 10);
  run.command({ run: 1, id: 1 }, 'execution', at + 11);
  run.receive({ run: 1, events: [
    { id: 1, kind: 'touch', at }, { id: 1, kind: 'pending', at: at + 16.67 },
    { id: 1, kind: 'outcome', at: at + 129, status: 'unavailable' }, { id: 1, kind: 'feedback', at: at + 133.34 },
  ] });
  const { panelMeasurement } = buildDiagnostics({ environment: {}, display: { displays: [] },
    panelMeasurement: { version: 1, runs: [run.summary()] } });
  const [{ phase, durationMs, input }] = panelMeasurement.runs;
  return { version: panelMeasurement.version, phase, durationMs, tap: input.taps[0] };
}

function replayParams(draft) {
  return { command: 'replay', draft: draft.id, revision: 1, scenario, trace: traceSample() };
}

test('replays a redacted contact from an actual version 1 export with virtual timing and leaves the archive unchanged', async (t) => {
  const file = path.join(tempDirectory(t), 'fixtures.json');
  const drafts = new AgentDrafts();
  const draft = drafts.create(owner, activity, profile());
  const fixtures = new AgentGestureFixtures({ file, drafts });
  const request = (params) => fixtures.change(owner, activity, fixtureParams(params), allowed);
  const params = replayParams(draft);
  await request({ command: 'record', draft: draft.id, revision: 1, label: 'Existing fixture', scenario });
  const archive = fs.readFileSync(file, 'utf8');

  const result = await request(params);
  assert.deepEqual(result.replay.trace, params.trace);
  assert.deepEqual(result.replay.outcomeComparison, { matches: true, measuredStatus: 'unavailable' });
  assert.equal(result.replay.mode, 'offline');
  assert.ok(result.replay.limitations.includes('branch-provider-and-window-timeline-missing'));
  assert.equal(result.observed.elapsedMs, 120);
  assert.equal(result.replay.trace.tap.feedbackFrameMs, 133.34);
  assert.equal(result.replay.trace.tap.foregroundChanged, true);
  assert.deepEqual(result.effects, []);
  assert.ok(result.steps.some(({ type, status }) => type === 'hotkey' && status === 'skipped'));

  const withoutTimeline = await request({ ...params, scenario: { ...scenario, timeline: [] } });
  assert.equal(withoutTimeline.observed.status, 'success');
  assert.deepEqual(withoutTimeline.replay.outcomeComparison, { matches: false, measuredStatus: 'unavailable' });
  assert.deepEqual(withoutTimeline.effects, [{ atMs: 120, type: 'chord' }]);
  assert.doesNotMatch(JSON.stringify(withoutTimeline), /Ctrl\+S|private-.*-window/);
  assert.equal(fs.readFileSync(file, 'utf8'), archive);
});

test('ambiguous or unsupported recorded outcomes still produce offline macro choices and effects', async (t) => {
  const file = path.join(tempDirectory(t), 'fixtures.json');
  const drafts = new AgentDrafts();
  const action = { type: 'choose', id: 'workflow', prompt: 'Choose a sample workflow', timeoutMs: 1000, choices: [
    { id: 'notes', label: 'Notes', action: { type: 'text', text: 'private sample' } },
    { id: 'review', label: 'Review', action: { type: 'delay', ms: 300 } },
  ] };
  const draft = drafts.create(owner, activity, profile(action));
  const fixtures = new AgentGestureFixtures({ file, drafts });
  const params = replayParams(draft);
  params.scenario = { ...scenario, timeline: [], answers: { workflow: 'review' } };
  for (const [patch, reason] of [
    [{ requests: 0, executions: 0 }, 'ambiguous-dispatch'], [{ executions: 2 }, 'ambiguous-dispatch'],
    [{ outcome: 'unreported' }, 'outcome-unreported'], [{ outcome: 'ignored' }, 'outcome-not-simulatable'],
    [{ outcome: 'superseded' }, 'outcome-not-simulatable'],
  ]) {
    const trace = { ...params.trace, tap: { ...params.trace.tap, ...patch } };
    const result = await fixtures.change(owner, activity, fixtureParams({ ...params, trace }), allowed);
    assert.deepEqual(result.replay.outcomeComparison, { matches: null, reason });
    assert.equal(result.observed.status, 'success');
    assert.equal(result.observed.elapsedMs, 300);
    assert.deepEqual(result.effects, []);
  }
  assert.equal(fs.existsSync(file), false);
});

test('rejects raw data, invalid limits, and inferred gestures or pages before running a replay', () => {
  const params = replayParams({ id: 'a'.repeat(24) });
  for (const extra of [
    { path: 'private-report.json' }, { version: 2 }, { phase: 'unknown' }, { durationMs: 60_001 },
  ]) assert.throws(() => fixtureParams({ ...params, trace: { ...params.trace, ...extra } }), /Panel measurement trace/);
  assert.throws(() => fixtureParams({ ...params, trace: { ...params.trace, tap: [] } }), /Panel measurement contact/);
  for (const extra of [
    { offsetMs: 60_001 }, { pendingFrameMs: NaN }, { feedbackFrameMs: 60_400 }, { requests: Infinity }, { executions: -1 },
    { outcome: 'arbitrary' }, { foregroundChanged: 'true' }, { displacementPx: {} }, { windowTitle: 'private' },
  ]) assert.throws(() => fixtureParams({ ...params, trace: { ...params.trace, tap: { ...params.trace.tap, ...extra } } }), /Panel measurement contact/);
  assert.throws(() => fixtureParams({ ...params, scenario: { key: 'key', page: 'main' } }), /explicitly/);
  assert.throws(() => fixtureParams({ ...params, scenario: { key: 'key', gesture: 'tap' } }), /explicitly/);
  assert.throws(() => fixtureParams({ ...params, scenario: { ...scenario, answers: { workflow: 'not an ID' } } }), /prompt and answer IDs/);
  assert.throws(() => fixtureParams({ ...params, fixture: params.draft }), /fields required/);
});

test('replay is draft-scoped and rechecks draft revision and authorization after virtual simulation', async (t) => {
  const file = path.join(tempDirectory(t), 'fixtures.json');
  const drafts = new AgentDrafts();
  const draft = drafts.create(owner, activity, profile());
  let complete;
  const fixtures = new AgentGestureFixtures({ file, drafts, simulate: () => new Promise((resolve) => {
    complete = () => resolve({ status: 'success', elapsedMs: 120, effects: [], steps: [] });
  }) });
  const params = fixtureParams(replayParams(draft));
  await assert.rejects(fixtures.change('b'.repeat(32), activity, params, allowed), /draft is unavailable/);
  await assert.rejects(fixtures.change(owner, 'meeting', params, allowed), /draft is unavailable/);
  let authorized = true;
  const pending = fixtures.change(owner, activity, params, () => authorized);
  authorized = false;
  complete();
  await assert.rejects(pending, /grant or activity changed/);
  const stale = fixtures.change(owner, activity, params, allowed);
  drafts.edit(owner, activity, draft.id, 1, [{ op: 'page-settings', page: 'main', settings: { name: 'New revision' } }]);
  complete();
  await assert.rejects(stale, /draft changed/);
  assert.equal(fs.existsSync(file), false);
});

test('the existing linked MCP gesture operation exposes replay and audits it without retaining trace values', async (t) => {
  const directory = tempDirectory(t);
  const file = path.join(directory, 'fixtures.json');
  const address = process.platform === 'win32' ? undefined : () => path.join(directory, 'mcp.sock');
  const protect = () => ({ protect: (bytes) => Buffer.from(bytes), unprotect: (bytes) => Buffer.from(bytes) });
  const access = new AgentAccess(path.join(directory, 'access.json'), { protect });
  const drafts = new AgentDrafts();
  const fixtures = new AgentGestureFixtures({ file, drafts });
  const history = new ActionHistory();
  const service = new AgentService(access, { address, history, profile: () => activity, readers: {
    gesture_fixture: (params, client, check) => fixtures.change(client.id, activity, params, check),
  } });
  t.after(() => service.stop());
  access.setEnabled(true);
  const credential = access.grant(['drafts'], activity);
  const withoutDrafts = access.grant(['layout'], activity);
  const draft = drafts.create(access.state.clients[0].id, activity, profile());
  service.setLocked(false);
  await once(service.server, 'listening');
  const client = await connectAgent(credential, { protect, address });
  t.after(() => client.close());
  const layout = await connectAgent(withoutDrafts, { protect, address });
  t.after(() => layout.close());
  assert.ok(LIVE_OPERATIONS.gesture_fixture.inputSchema.properties.command.enum.includes('replay'));
  assert.equal((await layout.call('gesture_fixture', replayParams(draft))).ok, false);
  const response = await client.call('gesture_fixture', replayParams(draft));
  assert.equal(response.ok, true);
  assert.equal(response.data.replay.outcomeComparison.matches, true);
  assert.doesNotMatch(JSON.stringify(history.snapshot()), /133\.34|code\.exe|cancelled|Ctrl\+S/);
  assert.equal(fs.existsSync(file), false);
});
