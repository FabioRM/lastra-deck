// @ts-check
'use strict';

const { randomBytes } = require('node:crypto');
const { EventEmitter } = require('node:events');

const EVENT_SCOPES = Object.freeze({
  page: 'layout', foreground: 'layout', action: 'layout', profile: 'layout',
  audio: 'providers', playback: 'providers', providers: 'providers', alerts: 'providers',
});
const TYPES = Object.keys(EVENT_SCOPES);
const MAX_EVENTS = 120;

const eventInput = {
  type: 'object', additionalProperties: false,
  properties: {
    types: { type: 'array', minItems: 1, maxItems: TYPES.length, uniqueItems: true, items: { enum: TYPES } },
    after: { type: 'string', pattern: '^[a-f0-9]{16}:[0-9]{1,12}$' }, limit: { type: 'integer', minimum: 1, maximum: 40 },
  },
};
const eventOutput = {
  type: 'object', required: ['cursor', 'events', 'resyncRequired'],
  properties: {
    cursor: { type: 'string' }, resyncRequired: { type: 'boolean' }, more: { type: 'boolean' },
    events: { type: 'array', items: {
      type: 'object', required: ['type', 'revision', 'at', 'data'], properties: {
        type: { enum: TYPES }, revision: { type: 'integer' }, at: { type: 'integer' }, data: { type: 'object' },
      },
    } },
  },
};

class EventRequestError extends Error {}

/** @param {any} [value] Untrusted tool arguments. */
function eventParams(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some((key) => !Object.hasOwn(eventInput.properties, key))) {
    throw new EventRequestError('Choose event types, a cursor, or a limit.');
  }
  const { types, after, limit = 20 } = value;
  if ((types !== undefined && (!Array.isArray(types) || !types.length || types.length > TYPES.length
        || new Set(types).size !== types.length || types.some((type) => typeof type !== 'string' || !Object.hasOwn(EVENT_SCOPES, type))))
      || (after !== undefined && (typeof after !== 'string' || !/^[a-f0-9]{16}:[0-9]{1,12}$/.test(after)))
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 40) {
    throw new EventRequestError('Choose valid event types, a revision cursor, and a limit from 1 to 40.');
  }
  return { types, after, limit };
}

class AgentEvents extends EventEmitter {
  /** @param {{ now?: () => number, interval?: number }} [options] */
  constructor({ now = Date.now, interval = 250 } = {}) {
    super();
    this.now = now;
    this.interval = interval;
    this.events = [];
    this.lastState = new Map();
    this.pending = new Map();
    this.reset();
  }

  cursor(revision = this.revision) {
    return this.epoch + ':' + revision;
  }

  publish(type, activity, data) {
    if (!Object.hasOwn(EVENT_SCOPES, type)) return;
    const key = activity + '/' + type;
    if (type === 'action') {
      this.append(type, activity, data);
      return;
    }
    const signature = JSON.stringify(data);
    if (this.lastState.get(key) === signature) {
      this.pending.delete(key);
      return;
    }
    this.pending.set(key, { type, activity, data, signature });
    this.timer ??= setTimeout(() => this.flush(), this.interval).unref();
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    for (const [key, { type, activity, data, signature }] of this.pending) {
      this.lastState.set(key, signature);
      this.append(type, activity, data);
    }
    this.pending.clear();
  }

  append(type, activity, data) {
    const item = { type, activity, data, revision: ++this.revision, at: this.now() };
    this.events.push(item);
    if (this.events.length > MAX_EVENTS) this.events.shift();
    this.emit('event', item);
  }

  read({ after, limit }, allows) {
    const [epoch, value] = after?.split(':') ?? [];
    const from = value === undefined ? (this.events[0]?.revision ?? 1) - 1 : Number(value);
    if (after !== undefined && (epoch !== this.epoch || from > this.revision || from < (this.events[0]?.revision ?? 1) - 1)) {
      return { cursor: this.cursor(), events: [], resyncRequired: true, more: false };
    }
    const matches = this.events.filter((event) => event.revision > from && allows(event));
    const selected = matches.slice(0, limit);
    const more = selected.length < matches.length;
    const events = selected.map(({ activity, ...event }) => event);
    return { cursor: this.cursor(more ? selected.at(-1).revision : this.revision), events, resyncRequired: false, more };
  }

  reset() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.epoch = randomBytes(8).toString('hex');
    this.revision = 0;
    this.events.length = 0;
    this.lastState.clear();
    this.pending.clear();
  }

  close() {
    this.reset();
    this.removeAllListeners();
  }
}

module.exports = { AgentEvents, EVENT_SCOPES, EventRequestError, eventInput, eventOutput, eventParams };
