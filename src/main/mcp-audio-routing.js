// @ts-check
'use strict';

const { AgentAudioActions, audioActionInput } = require('./mcp-audio-actions');
const { SnapshotRequestError } = require('./mcp-snapshot');

const OUTPUT_ALIAS = /^output-[a-f0-9]{24}$/;
const device = { type: 'string', pattern: OUTPUT_ALIAS.source };
const fields = audioActionInput.properties;
const REQUEST = new RegExp(fields.request.pattern);
const REQUEST_KEY = new RegExp(fields.idempotencyKey.pattern);
const audioRouteInput = { ...audioActionInput, properties: { command: fields.command, target: device, before: device,
  idempotencyKey: fields.idempotencyKey, request: fields.request } };
const isAlias = (value) => typeof value === 'string' && OUTPUT_ALIAS.test(value);

function audioRouteParams(args) {
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    const { command, request, target, before, idempotencyKey } = args;
    if (['status', 'cancel'].includes(command) && Object.keys(args).length === 2
        && typeof request === 'string' && REQUEST.test(request)) return { command, request };
    if (command === 'request' && Object.keys(args).length === 4 && isAlias(target) && isAlias(before)
        && typeof idempotencyKey === 'string' && REQUEST_KEY.test(idempotencyKey)) {
      return { command, target, before, route: target, idempotencyKey };
    }
  }
  throw new SnapshotRequestError('Choose a current playback alias, a destination playback alias, and a request key.');
}

const name = (item) => typeof item?.name === 'string' && item.name.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 100) || 'Windows playback device';

class AgentAudioRouting extends AgentAudioActions {
  constructor(options) { super({ ...options, property: 'route' }); }

  endpoint(snapshot, owner, target) {
    const { roles, devices } = snapshot ?? {};
    if (!Array.isArray(roles) || roles.length !== 2 || !Array.isArray(devices)) return undefined;
    const active = devices.filter(({ state, id }) => state === 'active' && typeof id === 'string' && id);
    const selected = active.find(({ id }) => this.alias(owner, 'output', id) === target);
    const [console, media] = roles.map((id) => active.find((item) => item.id === id));
    if (!selected || !console || !media) return undefined;
    return { device: 'output', id: selected.id, label: name(selected), value: this.alias(owner, 'output', media.id),
      context: JSON.stringify([roles, name(console), name(media)]), roles: [...roles], labels: [name(console), name(media)] };
  }

  reviewDetails(endpoint) {
    const [console, multimedia] = endpoint.labels;
    return [{ field: 'Current Windows playback', value: { console, multimedia } },
      { field: 'Requested Windows playback', value: endpoint.label }];
  }

  confirmed(endpoint) { return endpoint.roles.every((id) => id === endpoint.id); }
}

module.exports = { AgentAudioRouting, audioRouteInput, audioRouteParams };
