'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { GitHubChecksView, normalizeGitHub } = require('../src/main/app-view-github');
const { AppViews } = require('../src/main/app-views');
const { deckRequestAllowed } = require('../src/main/deck-view-only');
const { tempDir } = require('./helpers/temp-dir');

const repo = { id: 'fixture', name: 'Example fixture', repository: 'TestOwner/TestRepo', branch: 'feature/check' };
const config = (...repositories) => ({ version: 1, repositories });
const commit = 'a'.repeat(40);
const noMatch = 'b'.repeat(40);
const time = '2030-01-24T09:03:00Z';
const run = (id, overrides = {}) => ({ id, workflow_id: 4, status: 'completed', conclusion: 'failure', head_sha: commit,
  head_branch: repo.branch, name: 'Build', created_at: time, updated_at: time, html_url: 'https://fixture.invalid/external', ...overrides });
const pull = (number, overrides = {}) => ({ number, state: 'open', draft: false, head: { sha: commit }, title: 'Fixture PR', updated_at: time,
  body: 'private fixture payload', user: { login: 'author-to-omit' }, html_url: 'https://fixture.invalid/pr', ...overrides });
const json = (data, init) => Response.json(data, init);

function fixture(t, fetch, settings = config(repo)) {
  let view;
  t.after(() => view?.stop());
  const root = tempDir(t, 'lastra-github-checks-');
  const file = path.join(root, 'github-checks.json');
  const calls = [];
  const opened = [];
  const edited = [];
  let now = Date.parse(time);
  let monotonic = 0;
  let visible = true;
  const save = (value) => fs.writeFileSync(file, JSON.stringify(value));
  if (settings) save(settings);
  view = new GitHubChecksView(file, { now: () => now, monotonic: () => monotonic, canRead: () => visible,
    fetcher: (url, options) => { calls.push([url, options]); return fetch(url, options, calls.length); },
    openExternal: async (url) => { opened.push(url); }, openConfig: async (name) => { edited.push(name); return { ok: true }; },
    key: Buffer.alloc(32, 0x94),
  });
  const app = new AppViews(path.join(root, 'app-views.json'), { providers: { 'github-checks': view } });
  return { view, app, file, calls, opened, edited, save, advance: (ms) => { now += ms; monotonic += ms; },
    setVisible: (value) => { visible = value; }, now: () => now,
    change: (action) => app.change({ type: 'provider', viewId: 'github-checks', ...action }) };
}

test('GitHub checks starts disabled and accepts only explicit bounded public repo configuration', async (t) => {
  const f = fixture(t, () => assert.fail('An unconfigured view made a network request.'), null);
  assert.equal(f.app.snapshot().views.find(({ id }) => id === 'github-checks').provider, 'github-checks');
  assert.equal((await f.app.data('github-checks')).status, 'setup');
  assert.equal(fs.existsSync(f.file), false);
  await f.change({ action: 'configure' });
  assert.deepEqual(f.edited, [f.file]);
  assert.deepEqual(JSON.parse(fs.readFileSync(f.file, 'utf8')), config());
  for (const repository of ['https://github.com/Owner/Repo', 'owner/..', 'owner/%2f', 'owner/repo?scope=token', 'owner/repo/subpath', 'other owner/repo']) {
    assert.throws(() => normalizeGitHub(config({ ...repo, repository })), /owner\/repo form/);
  }
  assert.throws(() => normalizeGitHub(config(repo, { ...repo, id: 'duplicate', repository: repo.repository.toLowerCase() })), /unique ID/);
  assert.throws(() => normalizeGitHub(config({ ...repo, branch: '--bad branch' })), /valid Git branch/);
  assert.throws(() => normalizeGitHub(config({ ...repo, token: 'unsupported' })), /unique ID/);
  assert.deepEqual(normalizeGitHub(config({ id: 'test', repository: 'shell-owner/tool' })), [
    { id: 'test', label: 'shell-owner/tool', repository: 'shell-owner/tool', branch: null },
  ]);
});

test('workflow and PR fixtures display only current observed state and open exact reconstructed targets', async (t) => {
  const f = fixture(t, (url) => url.pathname.endsWith('/actions/runs') ? json({ workflow_runs: [
    run(14, { conclusion: 'success' }), run(12), run(15, { workflow_id: 5, name: 'Windows tests', status: 'in_progress' }),
    run(17, { workflow_id: 6, name: 'Other branch', head_branch: 'main' }), run(13, { workflow_id: 7, name: 'Security audit', conclusion: 'timed_out' }),
    run('999', { name: 'Malformed numeric ID' }),
  ] }) : json([pull(5), pull(12, { head: { sha: noMatch }, draft: true }), pull(12, { title: 'Duplicate' }), pull(2, { state: 'closed' })]));
  const result = (await f.app.data('github-checks')).repositories[0];
  assert.deepEqual(result.runs.rows.map(({ id, state }) => [id, state]), [[15, 'pending'], [14, 'passed'], [13, 'failed']]);
  assert.deepEqual(result.pulls.rows.map(({ id, state, ci }) => [id, state, ci]), [[5, 'open', 'failed'], [12, 'draft', null]]);
  assert.doesNotMatch(JSON.stringify(result), /fixture\.invalid|private fixture payload|author-to-omit|"sha"|Other branch/);
  const [workflow, prs] = f.calls;
  assert.equal(workflow[0].origin, 'https://api.github.com');
  assert.equal(workflow[0].pathname, '/repos/TestOwner/TestRepo/actions/runs');
  assert.equal(workflow[0].searchParams.get('branch'), repo.branch);
  assert.equal(workflow[0].searchParams.get('per_page'), '20');
  assert.equal(prs[0].pathname, '/repos/TestOwner/TestRepo/pulls');
  assert.equal(prs[0].searchParams.get('state'), 'open');
  for (const [, options] of f.calls) {
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['X-GitHub-Api-Version'], '2026-03-10');
    assert.equal(Object.keys(options.headers).some((name) => name.toLowerCase() === 'authorization'), false);
  }
  const action = (kind, row, extra) => ({ action: 'open', kind, repository: repo.id, id: row.id, revision: row.revision, ...extra });
  await f.change(action('runs', result.runs.rows[2]));
  await f.change(action('pulls', result.pulls.rows[0]));
  assert.deepEqual(f.opened, ['https://github.com/TestOwner/TestRepo/actions/runs/13', 'https://github.com/TestOwner/TestRepo/pull/5']);
  await assert.rejects(f.change(action('runs', result.runs.rows[2], { url: 'https://fixture.invalid/redirect' })), /Choose a GitHub checks action/);
  await assert.rejects(f.change(action('pulls', result.runs.rows[2])), /result changed/);
  assert.equal((await f.app.data('github-checks')).repositories[0].runs.rows[0].id, 15);
  assert.equal(f.calls.length, 2);
  f.save(config({ ...repo, repository: 'TestOwner/AnotherRepo' }));
  await assert.rejects(f.change(action('pulls', result.pulls.rows[0])), /result changed/);
});

test('rate limits preserve and label recent readings, remove expired results and never retry early', async (t) => {
  let mode = 'ready';
  const f = fixture(t, (url) => mode === 'limited' ? json({ message: 'server private details' }, { status: 429, headers: { 'Retry-After': '7200' } })
    : mode === 'private' ? json({}, { status: 404 }) : url.pathname.endsWith('/pulls') ? json([]) : json({ workflow_runs: [run(51)] }));
  const initial = await f.view.snapshot();
  assert.equal(initial.repositories[0].pulls.status, 'ready');
  assert.deepEqual(initial.repositories[0].pulls.rows, []);
  mode = 'limited';
  f.advance(600_000);
  const limited = await f.view.snapshot();
  const limitedRuns = limited.repositories[0].runs;
  assert.equal(limitedRuns.status, 'rate-limited');
  assert.equal(limitedRuns.stale, true);
  assert.equal(limitedRuns.rows[0].id, 51);
  assert.equal(limited.retryAt, f.now() + 7_200_000);
  assert.doesNotMatch(JSON.stringify(limited), /server private details/);
  assert.equal(f.calls.length, 4);
  f.advance(3_600_000);
  const expired = await f.view.snapshot();
  assert.deepEqual(expired.repositories[0].runs.rows, []);
  assert.equal(expired.repositories[0].runs.stale, false);
  assert.equal(f.calls.length, 4);
  await assert.rejects(f.change({ action: 'open', repository: repo.id, kind: 'runs', id: 51, revision: limitedRuns.rows[0].revision }), /result changed/);
  f.advance(3_600_000);
  mode = 'private';
  const missing = await f.view.snapshot();
  assert.equal(missing.repositories[0].runs.status, 'not-public');
  assert.equal(missing.repositories[0].runs.stale, false);
  assert.equal(f.calls.length, 6);
});

test('repository edits cannot bypass the anonymous request budget and cancellation drops offscreen reads', async (t) => {
  const f = fixture(t, (url) => url.pathname.endsWith('/pulls') ? json([]) : json({ workflow_runs: [] }));
  let current;
  for (let index = 0; index < 26; index++) {
    f.save(config({ ...repo, name: `Fixture ${index}` }));
    current = await f.view.snapshot();
  }
  assert.equal(f.calls.length, 48);
  assert.equal(current.repositories[0].runs.status, 'rate-limited');
  assert.ok(current.retryAt > f.now());
  f.setVisible(false);
  assert.equal((await f.view.snapshot()).status, 'unavailable');
  assert.equal(f.calls.length, 48);

  const held = fixture(t, (_url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
  }));
  const pending = held.view.snapshot();
  assert.equal(held.calls.length, 2);
  held.setVisible(false);
  await held.change({ action: 'stop' });
  assert.ok(held.calls.every(([, { signal }]) => signal.aborted));
  assert.equal((await pending).status, 'unavailable');
  assert.equal(deckRequestAllowed('app-views:change', { type: 'provider', viewId: 'github-checks', action: 'stop' }), true);
  assert.equal(deckRequestAllowed('app-views:change', { type: 'provider', viewId: 'github-checks', action: 'open' }), false);
});

test('oversized or malformed GitHub responses stay unavailable without inventing checks', async (t) => {
  const f = fixture(t, (url) => url.pathname.endsWith('/pulls')
    ? new Response('x'.repeat(513 * 1024), { status: 200 }) : json({ unexpected: [10] }));
  const result = (await f.view.snapshot()).repositories[0];
  assert.deepEqual(result.runs, { status: 'unavailable', sampledAt: null, stale: false, rows: [] });
  assert.deepEqual(result.pulls, result.runs);
  assert.deepEqual(f.opened, []);
});
