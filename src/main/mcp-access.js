// @ts-check
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { writeAtomic } = require('./write-atomic');
const { protection } = require('./mcp-protection');
const { ID, WRAPPED, LINK_VERSION } = require('./mcp-link');
const { SCOPE: RUN_SCOPE } = require('./mcp-run-activity');

const SCOPES = Object.freeze({ layout: 'Deck layout', providers: 'Provider availability', drafts: 'Draft edits',
  apply: 'Request profile changes', navigate: 'Deck navigation', actions: 'Request saved key actions', telemetry: 'Telemetry and monitoring',
  'profile-switch': 'Request activity switches',
  audio: 'Windows audio readings', media: 'Windows media readings', spotify: 'Spotify Connect readings', obs: 'OBS production readings',
  workspaces: 'Windows workspace inventory', 'workspace-actions': 'Request workspace arrangements',
  projects: 'Project and development inventory',
  'project-actions': 'Request registered project commands',
  'workspace-targets': 'Request opening or focusing saved Windows apps',
  'workspace-external': 'Request opening saved PowerToys workspaces',
  'agent-choices': 'Request choices on the Lastra deck',
  'alert-actions': 'Request alert acknowledgements', 'obs-actions': 'Request OBS scene and source changes',
  'audio-actions': 'Request Windows audio level changes',
  'audio-mute': 'Request Windows speaker or microphone mute changes',
  'audio-routing': 'Request Windows playback routing',
  'audio-app-level': 'Request Windows app volume changes',
  'obs-output-actions': 'Request OBS recording and streaming changes',
  'media-actions': 'Request Windows playback changes',
  'spotify-control': 'Request Spotify Connect playback changes',
  [RUN_SCOPE]: 'Publish agent run activity' });
const activityScope = (scope) => ['layout', 'drafts', 'apply', 'navigate', 'actions', 'workspace-targets', 'workspace-external',
  'agent-choices', 'projects', 'project-actions', RUN_SCOPE].includes(scope);
const LIMIT = 24;
const MAX_GRANT_DURATION_MS = 24 * 60 * 60_000;
const TEMPORARY_GRANT_MS = 15 * 60_000;
const newId = () => randomBytes(16).toString('hex');
const unconfigured = () => ({ version: 1, enabled: false, paused: false, pipe: null, clients: [] });

function scopedValues(values) {
  return Array.isArray(values) && values.length > 0 && values.length <= Object.keys(SCOPES).length
    && new Set(values).size === values.length && values.every((value) => typeof value === 'string' && Object.hasOwn(SCOPES, value));
}

function profileId(value) {
  return typeof value === 'string' && /^[a-z0-9_-]{1,40}$/i.test(value);
}

function validProjectBinding(value, scopes) {
  return value === undefined || (value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2 && typeof value.id === 'string' && /^[a-z0-9_-]{1,48}$/.test(value.id)
    && typeof value.revision === 'string' && /^[a-f0-9]{64}$/.test(value.revision)
    && scopes.includes('projects') && scopes.every((scope) => ['projects', 'project-actions'].includes(scope)));
}

function readAccess(file, log) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 64 * 1024) throw new Error('Invalid agent access file');
    const state = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (state?.version !== 1 || (state.enabled !== true && state.enabled !== false) || typeof state.paused !== 'boolean'
        || !ID.test(state.pipe) || !Array.isArray(state.clients) || state.clients.length > LIMIT) throw new Error('Invalid agent access settings');
    const ids = new Set();
    for (const item of state.clients) {
      if (!item || !ID.test(item.id) || ids.has(item.id) || !WRAPPED.test(item.wrapped) || !scopedValues(item.scopes)
          || !validProjectBinding(item.project, item.scopes)
          || (item.expiresAt !== undefined && (!Number.isSafeInteger(item.expiresAt) || item.expiresAt < 1 || item.expiresAt > 8.64e15))
          || (item.scopes.some(activityScope) && !profileId(item.profile))) throw new Error('Invalid agent client grant');
      ids.add(item.id);
    }
    return state;
  } catch (error) {
    if (error.code !== 'ENOENT') log('Agent access settings unavailable. Access is disabled.');
    return unconfigured();
  }
}

class AgentAccess {
  constructor(file, { protect = protection, log = () => {}, now = Date.now } = {}) {
    this.file = file;
    this.protect = protect;
    this.now = now;
    this.state = readAccess(file, log);
  }

  update(fields) {
    const next = { ...this.state, ...fields };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    writeAtomic(this.file, JSON.stringify(next, null, 2) + '\n');
    this.state = next;
  }

  setEnabled(enabled) {
    if (this.state.enabled === enabled) return;
    this.update({ enabled, paused: false, pipe: this.state.pipe ?? newId() });
  }

  setPaused(paused) {
    if (this.state.paused === paused) return;
    this.update({ paused });
  }

  /**
   * @param {string[]} scopes
   * @param {string} [profile]
   * @param {{ durationMs?: number, project?: { id: string, revision: string } }} [options]
   */
  grant(scopes, profile, { durationMs, project } = {}) {
    if (!this.state.enabled) throw new Error('Enable agent access before adding clients.');
    if (!scopedValues(scopes) || (scopes.some(activityScope) && !profileId(profile))) throw new Error('Choose an agent access scope.');
    if (!validProjectBinding(project, scopes)) throw new Error('Choose a registered project for this grant.');
    if (durationMs !== undefined && (!Number.isSafeInteger(durationMs) || durationMs < 1 || durationMs > MAX_GRANT_DURATION_MS)) {
      throw new Error('Choose a valid agent access duration.');
    }
    const clients = this.activeClients();
    if (clients.length >= LIMIT) throw new Error('Revoke an unused agent client first.');
    const id = newId();
    const secret = randomBytes(32);
    let wrapped;
    try {
      wrapped = this.protect().protect(secret).toString('base64url');
    } finally {
      secret.fill(0);
    }
    const client = { id, wrapped, scopes, profile: scopes.some(activityScope) ? profile : null,
      ...(durationMs === undefined ? {} : { expiresAt: this.now() + durationMs }),
      ...(project ? { project: { id: project.id, revision: project.revision } } : {}) };
    this.update({ clients: [...clients, client] });
    return [LINK_VERSION, this.state.pipe, id, wrapped].join('.');
  }

  revoke(id) {
    const clients = this.state.clients.filter((item) => item.id !== id);
    if (clients.length !== this.state.clients.length) this.update({ clients });
  }

  client(id) {
    if (!this.state.enabled || this.state.paused) return null;
    return this.activeClients().find((item) => item.id === id) ?? null;
  }

  activeClients() {
    const now = this.now();
    return this.state.clients.filter(({ expiresAt }) => expiresAt === undefined || expiresAt > now);
  }

  pruneExpired() {
    const clients = this.activeClients();
    if (clients.length !== this.state.clients.length) this.update({ clients });
  }

  expirationDelay() {
    const now = this.now();
    const deadlines = this.state.clients.map(({ expiresAt }) => expiresAt).filter((time) => time > now);
    return deadlines.length ? Math.min(MAX_GRANT_DURATION_MS, Math.min(...deadlines) - now) : undefined;
  }

  secret(client) {
    const key = this.protect().unprotect(Buffer.from(client.wrapped, 'base64url'));
    if (key.length === 32) return key;
    key.fill(0);
    throw new Error('Invalid Lastra agent credential.');
  }
}

module.exports = { AgentAccess, SCOPES, activityScope, TEMPORARY_GRANT_MS };
