// @ts-check
'use strict';

const net = require('node:net');
const { randomBytes } = require('node:crypto');
const { ID, AUTH_TAG, pipeAddress, proof, checkProof, readFrames, writeFrame } = require('./mcp-link');
const { LIVE_OPERATIONS } = require('./mcp-catalog');
const { SnapshotRequestError } = require('./mcp-snapshot');
const { DraftRequestError } = require('./mcp-drafts');
const { activityScope } = require('./mcp-access');
const { EVENT_SCOPES, EventRequestError } = require('./mcp-events');
const { NavigationRequestError } = require('./mcp-navigation');
const { AgentActionError } = require('./mcp-actions');
const { VisualPreviewError } = require('./mcp-visual-preview');
const { RunActivityError } = require('./mcp-run-activity');

const MAX_CONNECTIONS = 24;
const reject = (message) => ({ ok: false, message });
const nonce = () => randomBytes(32).toString('base64url');

/**
 * @typedef {object} AgentServiceOptions
 * @property {any} profile
 * @property {any} readers
 * @property {any} history
 * @property {import('./mcp-events').AgentEvents} [events]
 * @property {(project: any) => boolean} [projectAllowed]
 * @property {() => void} [onChange]
 * @property {(message: string) => void} [log]
 * @property {(pipe: string) => string} [address]
 */

class AgentService {
  /**
   * @param {any} access
   * @param {AgentServiceOptions} options
   */
  constructor(access, { profile, readers, history, events, projectAllowed = () => false, onChange = () => {}, log = () => {}, address = pipeAddress }) {
    this.access = access;
    this.profile = profile;
    this.readers = readers;
    this.history = history;
    this.events = events;
    this.projectAllowed = projectAllowed;
    this.onChange = onChange;
    this.log = log;
    this.address = address;
    this.connections = new Map();
    this.locked = true;
    events?.on('event', (event) => this.notify(event));
  }

  setLocked(locked) {
    this.locked = locked;
    this.reconcile();
  }

  client(id) {
    const client = this.access.client(id);
    return client && (!client.project || this.projectAllowed(client.project)) ? client : null;
  }

  reconcile() {
    try { this.access.pruneExpired(); }
    catch { this.log('Could not remove expired agent grants from disk.'); }
    const { enabled, paused, pipe } = this.access.state;
    if (!enabled || paused || this.locked) {
      this.stop();
      this.events?.reset();
      return;
    }
    for (const [socket, state] of this.connections) {
      if (state.client && !this.client(state.client)) socket.destroy();
    }
    clearTimeout(this.expiration);
    const delay = this.access.expirationDelay();
    if (delay !== undefined) {
      this.expiration = setTimeout(() => { this.reconcile(); this.onChange(); }, delay).unref();
    }
    if (this.server) return;
    const server = net.createServer((socket) => this.accept(socket));
    this.server = server;
    server.once('error', () => {
      if (this.server !== server) return;
      this.stop();
      this.log('Could not open the local agent connection.');
      this.onChange();
    });
    server.once('listening', () => this.onChange());
    server.listen(this.address(pipe));
  }

  stop() {
    clearTimeout(this.expiration);
    const server = this.server;
    this.server = null;
    for (const socket of this.connections.keys()) socket.destroy();
    server?.close();
  }

  connected() {
    return new Set([...this.connections.values()].filter(({ stage }) => stage === 'ready').map(({ client }) => client));
  }

  accept(socket) {
    socket.on('error', () => socket.destroy());
    if (this.locked || !this.access.state.enabled || this.access.state.paused || this.connections.size >= MAX_CONNECTIONS) {
      socket.destroy();
      return;
    }
    const state = { stage: 'hello', subscriptions: new Map() };
    this.connections.set(socket, state);
    socket.setTimeout(3_000, () => socket.destroy());
    socket.once('close', () => {
      this.connections.delete(socket);
      if (state.stage === 'ready') this.onChange();
    });
    readFrames(socket, (packet) => {
      if (socket.destroyed) return;
      if (state.stage !== 'ready') {
        try { this.authenticate(socket, state, packet); } catch { socket.destroy(); }
      } else {
        void this.dispatch(socket, state, packet).catch(() => socket.destroy());
      }
    }, () => socket.destroy());
  }

  authenticate(socket, state, packet) {
    const { pipe } = this.access.state;
    if (state.stage === 'hello') {
      if (packet.type !== 'hello' || typeof packet.client !== 'string' || !ID.test(packet.client)
          || typeof packet.nonce !== 'string' || !AUTH_TAG.test(packet.nonce) || this.locked) return socket.destroy();
      const client = this.client(packet.client);
      if (!client) return socket.destroy();
      const key = this.access.secret(client);
      try {
        const challenge = nonce();
        state.stage = 'proof';
        state.client = client.id;
        state.expected = proof(key, 'client', pipe, client.id, packet.nonce, challenge);
        writeFrame(socket, { type: 'challenge', nonce: challenge, proof: proof(key, 'server', pipe, client.id, packet.nonce, challenge) });
      } finally {
        key.fill(0);
      }
      return;
    }
    if (packet.type !== 'proof' || this.locked || !this.client(state.client) || !checkProof(state.expected, packet.proof)) return socket.destroy();
    state.expected = undefined;
    state.stage = 'ready';
    socket.setTimeout(0);
    writeFrame(socket, { type: 'ready' });
    this.onChange();
  }

  hasGrant(client, operation) {
    if (operation.requiresEvents && !this.events) return false;
    const hasScope = (scope) => client.scopes.includes(scope) && (!activityScope(scope) || client.profile === this.profile());
    if (operation.allScopes && !operation.allScopes.every(hasScope)) return false;
    return operation.anyScopes ? operation.anyScopes.some(hasScope) : !operation.scope || hasScope(operation.scope);
  }

  canSee(client, type, activity) {
    const scope = EVENT_SCOPES[type];
    return Boolean(client && scope && client.scopes.includes(scope)
      && (scope !== 'layout' || (client.profile === activity && activity === this.profile())));
  }

  notify(event) {
    if (this.locked) return;
    for (const [socket, state] of this.connections) {
      if (socket.destroyed || state.stage !== 'ready' || !state.subscriptions.size
          || !this.canSee(this.client(state.client), event.type, event.activity)) continue;
      if (socket.writableLength > 256 * 1024) { socket.destroy(); continue; }
      for (const [subscription, types] of state.subscriptions) {
        if (types.has(event.type)) writeFrame(socket, { type: 'notice', subscription });
      }
    }
  }

  interested(type) {
    if (this.locked) return false;
    return [...this.connections].some(([socket, state]) => !socket.destroyed && state.stage === 'ready'
      && this.canSee(this.client(state.client), type, this.profile())
      && [...state.subscriptions.values()].some((types) => types.has(type)));
  }

  eventOperation(name, params, state, client) {
    if (!this.events) throw new EventRequestError('Deck events are unavailable.');
    if (name === 'event_unsubscribe') return { unsubscribed: state.subscriptions.delete(params.subscription) };
    const activity = this.profile();
    const allowed = Object.keys(EVENT_SCOPES).filter((type) => this.canSee(client, type, activity));
    const types = new Set(params.types ?? allowed);
    if ([...types].some((type) => !allowed.includes(type))) throw new EventRequestError('An event scope is unavailable.');
    if (name === 'events_since') {
      return this.events.read(params, (event) => types.has(event.type) && this.canSee(client, event.type, event.activity));
    }
    if (state.subscriptions.size >= 4) throw new EventRequestError('Unsubscribe from an event resource before adding another.');
    const subscription = randomBytes(12).toString('hex');
    state.subscriptions.set(subscription, types);
    return { subscription, cursor: this.events.cursor() };
  }

  async dispatch(socket, state, { type, id, operation: name, args }) {
    if (type !== 'call' || !Number.isSafeInteger(id) || id < 0 || typeof name !== 'string') return socket.destroy();
    if (state.pending) return socket.destroy();
    const operation = Object.hasOwn(LIVE_OPERATIONS, name) ? LIVE_OPERATIONS[name] : null;
    const client = this.client(state.client);
    if (!client || this.locked) return socket.destroy();
    const authorized = () => {
      const current = this.client(state.client);
      return !socket.destroyed && Boolean(current) && !this.locked && Boolean(operation) && this.hasGrant(current, operation);
    };
    state.pending = true;
    try {
      const result = await this.history.run({
        label: operation?.label ?? 'Unknown agent request',
        origin: 'agent',
        context: client.id.slice(0, 8) + ' · ' + (operation?.target ?? 'Lastra'),
      }, async () => {
        if (!operation) return reject('The agent operation is unavailable.');
        if (!this.hasGrant(client, operation)) return reject('Access to this scope or profile is unavailable.');
        let parameters;
        try {
          if (operation.parameters) parameters = operation.parameters(args);
          else if (args !== undefined && (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length)) {
            return reject('This agent operation does not take parameters.');
          }
        } catch (error) {
          return reject(error instanceof SnapshotRequestError || error instanceof DraftRequestError || error instanceof EventRequestError || error instanceof NavigationRequestError
            || error instanceof AgentActionError || error instanceof VisualPreviewError || error instanceof RunActivityError
            ? error.message : 'The agent parameters are invalid.');
        }
        if (name === 'connection') return { ok: true, data: {
          status: 'connected', scopes: [...client.scopes],
          ...(client.expiresAt === undefined ? {} : { expiresAt: client.expiresAt }),
          ...(client.project ? { projectRestricted: true } : {}),
          available: Object.entries(LIVE_OPERATIONS).filter(([, operation]) => !operation.internal && this.hasGrant(client, operation)).map(([id]) => id),
        } };
        let data;
        try {
          data = operation.requiresEvents
            ? this.eventOperation(name, parameters, state, client)
            : await this.readers[name](parameters, client, authorized);
        }
        catch (error) {
          return reject(error instanceof SnapshotRequestError || error instanceof DraftRequestError || error instanceof EventRequestError
            || error instanceof NavigationRequestError || error instanceof AgentActionError || error instanceof VisualPreviewError
            || error instanceof RunActivityError
            ? error.message : 'The Lastra operation is unavailable.');
        }
        if (!authorized()) return reject('The agent grant or target changed.');
        return { ok: true, data };
      });
      if (!socket.destroyed) writeFrame(socket, { type: 'result', id, ...result });
    } finally {
      state.pending = false;
    }
  }
}

module.exports = { AgentService };
