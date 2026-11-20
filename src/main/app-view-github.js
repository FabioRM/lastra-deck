// @ts-check
'use strict';

const { createHmac, randomBytes } = require('node:crypto');
const { readMonitorConfig, openMonitorConfig } = require('./monitoring-config');

const API = 'https://api.github.com';
const WEB = 'https://github.com';
const MAX_REPOS = 4;
const RUN_COUNT = 20;
const DISPLAY_RUN_COUNT = 10;
const PR_COUNT = 10;
const BODY_LIMIT = 512 * 1024;
const SAMPLE_INTERVAL = 10 * 60_000;
const HOUR = 60 * 60_000;
const REQUEST_BUDGET = 48;
const REQUEST_TIMEOUT = 4_000;
const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const REPO = /^([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)\/([a-z0-9._-]{1,100})$/i;
const REVISION = /^[a-f0-9]{24}$/;
const SHA = /^[a-f0-9]{40,64}$/i;
const IN_PROGRESS = ['requested', 'queued', 'pending', 'waiting', 'in_progress'];
const FAILURE = ['action_required', 'failure', 'startup_failure', 'timed_out'];
const text = (value, max) => typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim().slice(0, max) : '';
const id = (value) => Number.isSafeInteger(value) && value > 0;
const additional = (value, keys) => Object.keys(value).some((key) => !keys.includes(key));
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);

function normalizeGitHub(config) {
  if (!object(config) || additional(config, ['version', 'repositories']) || config.version !== 1
      || !Array.isArray(config.repositories) || config.repositories.length > MAX_REPOS) throw new Error('Use version 1 and a list of up to four public repositories.');
  const keys = new Set();
  const repos = new Set();
  return config.repositories.map((row, index) => {
    const { id, name, repository, branch } = row ?? {};
    const valid = typeof repository === 'string' && REPO.exec(repository);
    const position = `Repository ${index + 1}`;
    if (!object(row) || additional(row, ['id', 'name', 'repository', 'branch']) || typeof id !== 'string' || !ID.test(id) || keys.has(id)
        || !valid || /^\.{1,2}$/.test(valid[2]) || repos.has(repository.toLowerCase())) {
      throw new Error(`${position} needs a unique ID and a public GitHub repository in owner/repo form.`);
    }
    if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 80 || /[\p{Cc}\p{Cf}]/u.test(name))) {
      throw new Error(`${position} needs a name of up to 80 characters.`);
    }
    if (branch !== undefined && (typeof branch !== 'string' || !branch || branch.length > 128 || /[\s\p{Cc}\p{Cf}~^:?*[\\]/u.test(branch)
        || branch.includes('..') || branch.includes('@{') || branch.split('/').some((part) => !part || part.startsWith('.') || part.endsWith('.lock'))
        || branch.startsWith('-') || branch.endsWith('.') || branch === '@')) throw new Error(`${position} needs a valid Git branch name.`);
    keys.add(id);
    repos.add(repository.toLowerCase());
    return { id, label: name?.trim() ?? repository, repository, branch: branch ?? null };
  });
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function runState({ status, conclusion }) {
  if (IN_PROGRESS.includes(status)) return 'pending';
  if (status !== 'completed') return 'unknown';
  if (conclusion === 'success') return 'passed';
  if (FAILURE.includes(conclusion)) return 'failed';
  if (conclusion === 'cancelled') return 'cancelled';
  return conclusion === 'neutral' || conclusion === 'skipped' ? 'neutral' : 'unknown';
}

function readRuns(value, branch) {
  if (!Array.isArray(value?.workflow_runs)) return null;
  const runs = [];
  for (const row of value.workflow_runs.slice(0, RUN_COUNT)) {
    if (!id(row?.id) || !id(row.workflow_id) || (branch && row.head_branch !== branch)) continue;
    const name = text(row.name, 100) || text(row.display_title, 100) || 'Workflow';
    const update = timestamp(row.updated_at);
    runs.push({ id: row.id, workflow: row.workflow_id, name, branch: text(row.head_branch, 128) || null,
      sha: typeof row.head_sha === 'string' && SHA.test(row.head_sha) ? row.head_sha.toLowerCase() : null, state: runState(row),
      attemptedAt: timestamp(row.run_started_at) ?? timestamp(row.created_at) ?? update, updatedAt: update });
  }
  runs.sort((a, b) => (b.attemptedAt ?? 0) - (a.attemptedAt ?? 0) || b.id - a.id);
  return uniqueBy(runs, (run) => run.id);
}

function readPulls(value) {
  if (!Array.isArray(value)) return null;
  const seen = new Set();
  return value.slice(0, PR_COUNT).flatMap((row) => {
    if (!id(row?.number) || row.state !== 'open' || seen.has(row.number)) return [];
    seen.add(row.number);
    return [{ id: row.number, name: text(row.title, 160) || `Pull request #${row.number}`, state: row.draft === true ? 'draft' : 'open',
      sha: typeof row.head?.sha === 'string' && SHA.test(row.head.sha) ? row.head.sha.toLowerCase() : null, updatedAt: timestamp(row.updated_at) }];
  });
}

function uniqueBy(rows, keyOf) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = keyOf(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchedCI(runs, sha) {
  if (!sha) return null;
  const current = uniqueBy(runs.filter((run) => run.sha === sha), (run) => run.workflow).map(({ state }) => state);
  if (!current.length) return null;
  return ['failed', 'pending', 'unknown', 'cancelled', 'passed', 'neutral'].find((state) => current.includes(state));
}

async function readJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('GitHub response body is unavailable.');
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
      size += value.byteLength;
      if (size > BODY_LIMIT) throw new Error('GitHub response exceeds the read limit.');
      chunks.push(Buffer.from(value));
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function retryAt(response, now) {
  const retry = response.headers.get('retry-after');
  const reset = response.headers.get('x-ratelimit-reset');
  const preferred = /^\d{1,10}$/.test(retry ?? '') ? now + Number(retry) * 1000 : Date.parse(retry ?? '');
  const resetAt = response.headers.get('x-ratelimit-remaining') === '0' && /^\d{1,12}$/.test(reset ?? '') ? Number(reset) * 1000 : 0;
  const at = Math.max(preferred || 0, resetAt);
  return at > now ? at : now + SAMPLE_INTERVAL;
}

class GitHubChecksView {
  /**
   * @param {string} file
   * @param {{ fetcher?: typeof globalThis.fetch, openConfig?: (file: string) => any, openExternal?: (url: string) => Promise<unknown>,
   *   canRead?: () => boolean, now?: () => number, monotonic?: () => number, key?: Buffer }} [options]
   */
  constructor(file, { fetcher = globalThis.fetch, openConfig, openExternal, canRead = () => true,
    now = Date.now, monotonic = () => performance.now(), key = randomBytes(32) } = {}) {
    this.file = file;
    this.fetcher = fetcher;
    this.openConfig = openConfig;
    this.openExternal = openExternal;
    this.canRead = canRead;
    this.now = now;
    this.monotonic = monotonic;
    this.key = key;
    this.requests = [];
    this.blockedUntil = 0;
  }

  settings() { return readMonitorConfig(this.file, 'GitHub checks', normalizeGitHub); }

  stop() {
    this.pending?.controller.abort();
    this.pending = null;
  }

  allowRequest() {
    if (this.now() < this.blockedUntil) return false;
    const at = this.monotonic();
    this.requests = this.requests.filter((stamp) => at - stamp < HOUR);
    if (this.requests.length >= REQUEST_BUDGET) {
      this.blockedUntil = this.now() + HOUR - (at - this.requests[0]);
      return false;
    }
    this.requests.push(at);
    return true;
  }

  async read(repo, kind, controller) {
    if (controller.signal.aborted || !this.canRead()) return { status: 'unavailable' };
    if (!this.allowRequest()) return { status: 'rate-limited' };
    const runs = kind === 'runs';
    const url = new URL(`/repos/${repo.repository}/${runs ? 'actions/runs' : 'pulls'}`, API);
    url.searchParams.set('per_page', String(runs ? RUN_COUNT : PR_COUNT));
    if (runs && repo.branch) url.searchParams.set('branch', repo.branch);
    if (!runs) { url.searchParams.set('state', 'open'); url.searchParams.set('sort', 'updated'); url.searchParams.set('direction', 'desc'); }
    try {
      const response = await this.fetcher(url, { method: 'GET', redirect: 'error',
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'Lastra' },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT)]) });
      const exhausted = response.headers.get('x-ratelimit-remaining') === '0';
      const limited = response.status === 429 || (response.status === 403 && (exhausted || response.headers.has('retry-after')));
      if (exhausted || limited) this.blockedUntil = Math.max(this.blockedUntil, retryAt(response, this.now()));
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        return { status: limited ? 'rate-limited' : [401, 403, 404].includes(response.status) ? 'not-public' : 'unavailable' };
      }
      const value = await readJson(response);
      const rows = runs ? readRuns(value, repo.branch) : readPulls(value);
      return rows === null ? { status: 'unavailable' } : { status: 'ready', rows, at: this.now() };
    } catch { return { status: 'unavailable' }; }
  }

  section(attempt, previous) {
    if (attempt.status === 'ready' || attempt.status === 'not-public') return attempt;
    const age = this.now() - previous?.at;
    return age >= 0 && age <= HOUR ? { ...previous, status: attempt.status, stale: true } : attempt;
  }

  async collect(repositories, previous, controller) {
    const byRepo = new Map();
    for (const repo of repositories) {
      if (controller.signal.aborted || !this.canRead()) break;
      const fetched = await Promise.all([this.read(repo, 'runs', controller), this.read(repo, 'pulls', controller)]);
      const prior = previous?.get(repo.id);
      byRepo.set(repo.id, { runs: this.section(fetched[0], prior?.runs), pulls: this.section(fetched[1], prior?.pulls) });
    }
    return byRepo;
  }

  rowRevision(config, repo, kind, resultId, at) {
    return createHmac('sha256', this.key).update(JSON.stringify([config, repo, kind, resultId, at])).digest('hex').slice(0, 24);
  }

  expose(config, repositories, byRepo) {
    const section = (data) => data && data.at !== undefined && (this.now() - data.at > HOUR || this.now() < data.at)
      ? { status: data.status === 'ready' ? 'unavailable' : data.status } : data ?? { status: 'unavailable' };
    const publicSection = (result, rows) => ({ status: result.status, sampledAt: result.at ?? null, stale: result.stale === true, rows });
    return { status: 'ready', retryAt: this.blockedUntil > this.now() ? this.blockedUntil : null, repositories: repositories.map((repo) => {
      const saved = byRepo?.get(repo.id);
      const checks = section(saved?.runs);
      const changes = section(saved?.pulls);
      const runs = checks.rows ?? [];
      return { id: repo.id, label: repo.label, repository: repo.repository, branch: repo.branch,
        runs: publicSection(checks, uniqueBy(runs, (run) => JSON.stringify([run.workflow, run.branch])).slice(0, DISPLAY_RUN_COUNT).map(({ id, name, branch, state, updatedAt }) => ({
          id, name, branch, state, updatedAt, revision: this.rowRevision(config, repo.id, 'runs', id, checks.at),
        }))),
        pulls: publicSection(changes, (changes.rows ?? []).map(({ id, name, state, sha, updatedAt }) => ({
          id, name, state, updatedAt, ci: matchedCI(runs, sha), ciStale: checks.stale === true,
          revision: this.rowRevision(config, repo.id, 'pulls', id, changes.at),
        }))),
      };
    }) };
  }

  async snapshot() {
    if (!this.canRead()) { this.stop(); return { status: 'unavailable' }; }
    let repositories;
    try { repositories = this.settings(); }
    catch (error) { this.stop(); this.cached = null; return { status: 'invalid', message: error.message }; }
    if (!repositories.length) { this.stop(); this.cached = null; return { status: 'setup' }; }
    const config = JSON.stringify(repositories);
    if (this.pending?.config === config) return this.pending.result;
    if (this.pending) this.stop();
    if (this.cached?.config !== config) this.cached = null;
    if (this.cached && (this.monotonic() - this.cached.at < SAMPLE_INTERVAL || this.now() < this.blockedUntil)) {
      return this.expose(config, repositories, this.cached.byRepo);
    }
    const ticket = { config, controller: new AbortController() };
    this.pending = ticket;
    ticket.result = this.collect(repositories, this.cached?.byRepo, ticket.controller).then((byRepo) => {
      let current;
      try { current = JSON.stringify(this.settings()); } catch {}
      if (this.pending !== ticket || !this.canRead() || current !== config) return { status: 'unavailable' };
      this.cached = { config, at: this.monotonic(), byRepo };
      return this.expose(config, repositories, byRepo);
    }).finally(() => { if (this.pending === ticket) this.pending = null; });
    return ticket.result;
  }

  async change(command) {
    if (!object(command)) throw new Error('Choose a GitHub checks action.');
    const { action, kind, repository, id: resultId, revision } = command;
    const fields = ['action', 'type', 'viewId', ...(action === 'open' ? ['kind', 'repository', 'id', 'revision'] : [])];
    if (additional(command, fields)) throw new Error('Choose a GitHub checks action.');
    if (action === 'stop') { this.stop(); return { ok: true }; }
    if (!this.canRead()) throw new Error('Open GitHub checks on the deck.');
    if (action === 'configure') return openMonitorConfig(this.file, 'GitHub checks', 'repositories', this.openConfig);
    if (action !== 'open' || !['runs', 'pulls'].includes(kind) || typeof repository !== 'string' || !ID.test(repository) || !id(resultId)
        || typeof revision !== 'string' || !REVISION.test(revision)) throw new Error('Choose a GitHub result from the current list.');
    const repositories = this.settings();
    const config = JSON.stringify(repositories);
    const target = this.cached?.config === config && this.expose(config, repositories, this.cached.byRepo).repositories.find(({ id }) => id === repository);
    if (!target || !target[kind].rows.some((row) => row.id === resultId && row.revision === revision)) {
      throw new Error('The GitHub result changed. Select it again.');
    }
    await this.openExternal(`${WEB}/${target.repository}/${kind === 'runs' ? 'actions/runs' : 'pull'}/${resultId}`);
    return { ok: true };
  }
}

module.exports = { GitHubChecksView, normalizeGitHub };
