// @ts-check
'use strict';

const { AgentAudioActions, audioActionInput } = require('./mcp-audio-actions');
const { SnapshotRequestError } = require('./mcp-snapshot');

const fields = audioActionInput.properties;
const audioAppLevelInput = { ...audioActionInput, properties: { ...fields,
  target: { type: 'string', pattern: '^app-[a-f0-9]{24}$' },
  before: { type: 'string', pattern: '^app-rev-[a-f0-9]{24}$' },
} };
const matches = (value, field) => typeof value === 'string' && new RegExp(audioAppLevelInput.properties[field].pattern).test(value);

function audioAppLevelParams(args) {
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    const { command, request, target, before, level, idempotencyKey } = args;
    if (['status', 'cancel'].includes(command) && Object.keys(args).length === 2 && matches(request, 'request')) return { command, request };
    if (command === 'request' && Object.keys(args).length === 5 && matches(target, 'target') && matches(before, 'before')
        && Number.isInteger(level) && level >= 0 && level <= 100 && matches(idempotencyKey, 'idempotencyKey')) {
      return { command, target, before, appLevel: level, idempotencyKey };
    }
  }
  throw new SnapshotRequestError('Choose a mixer app alias, its inspected revision, a volume from 0 to 100, and a request key.');
}

class AgentAppAudio extends AgentAudioActions {
  /** @param {import('./mcp-audio-actions').AgentAudioActionsOptions & { revision: (owner: string, id: string, revision: string) => string }} options */
  constructor({ revision, ...options }) {
    super({ ...options, property: 'appLevel' });
    this.revision = revision;
  }

  interrupt() {
    if (this.pending?.status === 'awaiting_confirmation') this.finish(this.pending, 'cancelled');
  }

  endpoint(snapshot, owner, target) {
    if (!Array.isArray(snapshot)) return undefined;
    const found = snapshot.find(({ id }) => this.alias(owner, 'app', id) === target);
    const { id, name, level, mixedLevel, count, binding } = found ?? {};
    const revision = this.revision(owner, id, binding?.revision);
    if (!revision || typeof binding?.identity !== 'string' || !Number.isInteger(level)) return undefined;
    const label = typeof name === 'string' && name.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 100);
    return { device: 'app', id, label: label || 'Windows mixer app', value: revision, context: binding.identity,
      stamp: binding.revision, level, mixedLevel, count };
  }

  reviewDetails({ level, mixedLevel, count }, desired) {
    return [
      { field: 'Windows playback sessions', value: count },
      { field: 'Current volume', value: mixedLevel ? `Mixed levels · ${level}% average` : `${level}%` },
      { field: 'Requested volume for each session', value: `${desired}%` },
    ];
  }

  sameTarget(endpoint, reviewed) { return super.sameTarget(endpoint, reviewed) && endpoint.context === reviewed.context; }
  confirmed(endpoint, desired) { return !endpoint.mixedLevel && endpoint.level === desired; }
}

module.exports = { AgentAppAudio, audioAppLevelInput, audioAppLevelParams };
