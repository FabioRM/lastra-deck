// @ts-check
'use strict';

const { randomBytes } = require('node:crypto');
const { DRAFT_ID, DraftRequestError } = require('./mcp-drafts');
const { diffValues } = require('./mcp-apply');
const { telemetryAlias } = require('./mcp-telemetry');
const { METRICS, normalizeRules } = require('./telemetry-thresholds');
const { MAX_PINS, WATCHLIST_PIN_IDS, WATCHLIST_SERVICE_ID } = require('./monitoring-watchlist');

const KIND = 'monitoring';
const TARGETS = ['thresholds', 'watchlist'];
const RULE_ID = /^threshold-[a-f0-9]{20}$/;
const SERVICE_ID = /^service-[a-f0-9]{20}$/;
const MAX_RULES = 32;
const MAX_EDITS = 32;
const RULE_FIELDS = ['metric', 'direction', 'limit', 'holdSeconds'];
const EDIT_FIELDS = { 'add-rule': ['rule'], 'update-rule': ['id', 'rule'], 'remove-rule': ['id'], 'set-pins': ['pins'] };
const COMMAND_FIELDS = { create: ['target', 'source'], inspect: ['draft', 'revision'], edit: ['draft', 'revision', 'edits'],
  preview: ['draft', 'revision'], compare: ['draft', 'revision'], discard: ['draft', 'revision'] };

const enumOf = (values) => ({ enum: values });
const text = { type: 'string' };
const count = { type: 'integer', minimum: 0 };
const flag = { type: 'boolean' };
const number = { type: 'number' };
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const list = (items, maxItems) => ({ type: 'array', items, maxItems });
const nullable = (value) => ({ anyOf: [value, { type: 'null' }] });
const id = { ...text, pattern: DRAFT_ID.source };
const revision = { ...count, minimum: 1 };
const ruleId = { ...text, pattern: RULE_ID.source };
const ruleFields = { metric: enumOf(Object.keys(METRICS)), direction: enumOf(['above', 'below']), limit: number,
  holdSeconds: { ...count, minimum: 2, maximum: 3600 } };
const pinId = { anyOf: [enumOf(WATCHLIST_PIN_IDS), { ...text, pattern: SERVICE_ID.source }] };
const target = enumOf(TARGETS);
const monitoringDraftInput = object({ command: enumOf(Object.keys(COMMAND_FIELDS)), target, source: enumOf(['active', 'empty']),
  draft: id, revision, edits: { ...list(object({ op: enumOf(Object.keys(EDIT_FIELDS)), id: ruleId,
    rule: object(ruleFields, []), pins: list(pinId, MAX_PINS) }, ['op']), MAX_EDITS), minItems: 1 } }, ['command']);
const ruleView = object({ id: ruleId, ...ruleFields, unit: enumOf(['%', '°C']) });
const pinView = object({ id: pinId, kind: enumOf(['hardware', 'app', 'service']), configured: nullable(flag) });
const difference = object({ baseCurrent: nullable(flag), changeCount: count, rules: list(object({ id: ruleId,
  change: enumOf(['added', 'updated', 'removed']), fields: list(enumOf([...RULE_FIELDS, 'unit']), 5),
  before: nullable(ruleView), after: nullable(ruleView) }), MAX_RULES * 2),
  pins: object({ before: list(pinId, MAX_PINS), after: list(pinId, MAX_PINS) }) }, ['baseCurrent', 'changeCount']);
const monitoringDraftOutput = object({ id, revision, activity: text, kind: { const: KIND }, target, discarded: flag,
  rules: list(ruleView, MAX_RULES), pins: list(pinView, MAX_PINS), comparison: difference }, ['id', 'kind']);

const supported = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every((key) => fields.includes(key));
const valid = (value, pattern) => typeof value === 'string' && pattern.test(value);

function monitoringDraftParams(value) {
  const command = value?.command;
  if (typeof command !== 'string' || !Object.hasOwn(COMMAND_FIELDS, command) || !supported(value, ['command', ...COMMAND_FIELDS[command]])) {
    throw new DraftRequestError('Choose a supported monitoring draft command.');
  }
  if (command === 'create') {
    if (!TARGETS.includes(value.target) || !['active', 'empty'].includes(value.source)) throw new DraftRequestError('Choose a monitoring target and draft source.');
    return value;
  }
  if (!valid(value.draft, DRAFT_ID) || ((command !== 'inspect' || value.revision !== undefined)
      && (!Number.isSafeInteger(value.revision) || value.revision < 1))) throw new DraftRequestError('Choose a monitoring draft and its current revision.');
  if (command === 'edit' && (!Array.isArray(value.edits) || value.edits.length < 1 || value.edits.length > MAX_EDITS
    || value.edits.some((edit) => typeof edit?.op !== 'string' || !Object.hasOwn(EDIT_FIELDS, edit.op) || !supported(edit, ['op', ...EDIT_FIELDS[edit.op]])))) {
    throw new DraftRequestError('Supply a batch of 1 to 32 monitoring edits.');
  }
  return value;
}

const ruleAlias = (rule) => telemetryAlias('threshold', rule.id);
const pinAlias = (raw) => {
  const service = WATCHLIST_SERVICE_ID.exec(raw);
  return service ? telemetryAlias('service', service[1]) : raw;
};
const publicRule = ({ id, metric, direction, limit, holdSeconds }) => ({ id: telemetryAlias('threshold', id), metric, direction,
  limit, holdSeconds, unit: METRICS[metric].unit });

function editRules(model, edits) {
  const next = structuredClone(model);
  for (const { op, id, rule } of edits) {
    if (op === 'set-pins') throw new DraftRequestError('Select threshold edits for this draft.');
    const position = op === 'add-rule' ? -1 : next.findIndex((item) => ruleAlias(item) === id);
    if (op !== 'add-rule' && (!valid(id, RULE_ID) || position < 0)) throw new DraftRequestError('The threshold alias is unavailable.');
    if (op === 'remove-rule') { next.splice(position, 1); continue; }
    if (!supported(rule, RULE_FIELDS) || !Object.keys(rule).length) throw new DraftRequestError('Choose supported threshold fields.');
    if (op === 'add-rule') {
      if (typeof rule.metric !== 'string' || !Object.hasOwn(METRICS, rule.metric)) throw new DraftRequestError('Choose a supported threshold metric.');
      next.push({ id: `draft-${randomBytes(12).toString('hex')}`, name: METRICS[rule.metric].name, ...rule });
    } else next[position] = { ...next[position], ...rule };
  }
  try { return normalizeRules({ version: 1, rules: next }); }
  catch (error) { throw new DraftRequestError(error.message); }
}

function servicePins(configuration) {
  return Array.isArray(configuration?.services) ? configuration.services.map((id) => `service:${id}`).filter((id) => WATCHLIST_SERVICE_ID.test(id)) : null;
}

function editPins(model, edits, configuration) {
  let pins = model;
  const configured = servicePins(configuration) ?? [];
  for (const { op, pins: selected } of edits) {
    if (op !== 'set-pins') throw new DraftRequestError('Select a pin edit for this draft.');
    if (!Array.isArray(selected) || selected.length > MAX_PINS || new Set(selected).size !== selected.length) {
      throw new DraftRequestError(`Choose up to ${MAX_PINS} different watchlist pins.`);
    }
    const allowed = new Map([...WATCHLIST_PIN_IDS, ...configured, ...pins].map((raw) => [pinAlias(raw), raw]));
    if (selected.some((id) => !allowed.has(id))) throw new DraftRequestError('A selected service or watchlist pin is unavailable.');
    pins = selected.map((id) => allowed.get(id));
  }
  return pins;
}

function ruleChanges(before, after) {
  const prior = new Map(before.map((item) => [ruleAlias(item), publicRule(item)]));
  const current = new Map(after.map((item) => [ruleAlias(item), publicRule(item)]));
  const rules = [];
  for (const id of new Set([...prior.keys(), ...current.keys()])) {
    const before = prior.get(id) ?? null;
    const after = current.get(id) ?? null;
    const fields = before && after ? diffValues(before, after).map(({ field }) => field) : [];
    if (fields.length || !before || !after) rules.push({ id, change: !before ? 'added' : !after ? 'removed' : 'updated', fields, before, after });
  }
  return { rules, changeCount: rules.length };
}

function pinChanges(prior, current) {
  const before = prior.map(pinAlias);
  const after = current.map(pinAlias);
  return { pins: { before, after }, changeCount: diffValues(before, after).length };
}

class AgentMonitoringDrafts {
  /**
   * @param {any} drafts Agent draft store shared with the other draft kinds.
   * @param {{ thresholds?: () => any, watchlist?: () => any }} [options]
   */
  constructor(drafts, { thresholds, watchlist } = {}) {
    this.drafts = drafts;
    this.thresholds = thresholds;
    this.watchlist = watchlist;
  }

  configuration(target) {
    try {
      const current = target === 'thresholds' ? this.thresholds() : this.watchlist();
      if (target === 'thresholds') return Array.isArray(current) ? current : null;
      return Array.isArray(current?.pins) ? current : null;
    } catch { return null; }
  }

  values(draft, configuration) {
    if (draft.target === 'thresholds') return { rules: draft.model.map(publicRule) };
    const services = servicePins(configuration);
    return { pins: draft.model.map((raw) => {
      const split = raw.split(':')[0];
      return { id: pinAlias(raw), kind: split, configured: split !== 'service' ? true : services ? services.includes(raw) : null };
    }) };
  }

  change(owner, activity, params) {
    if (params.command === 'create') {
      const current = params.source === 'active' ? this.configuration(params.target) : null;
      if (params.source === 'active' && current === null) throw new DraftRequestError('The active monitoring configuration is unavailable.');
      const model = current ? (params.target === 'thresholds' ? current : current.pins) : [];
      const draft = this.drafts.register(owner, activity, KIND, () => ({ target: params.target, model, baseline: structuredClone(model), source: params.source }));
      return this.result(draft, current);
    }
    const draft = this.drafts.resolve(owner, activity, params.draft, params.revision, KIND);
    if (params.command === 'discard') return { ...this.drafts.discard(owner, activity, draft.id, draft.revision, KIND), kind: KIND, target: draft.target };
    const active = draft.target === 'watchlist' || params.command === 'compare' ? this.configuration(draft.target) : null;
    switch (params.command) {
      case 'inspect':
      case 'preview': return this.result(draft, active);
      case 'edit':
        draft.model = draft.target === 'thresholds' ? editRules(draft.model, params.edits) : editPins(draft.model, params.edits, active);
        draft.revision++;
        return this.result(draft, active);
      case 'compare': {
        const current = draft.target === 'thresholds' ? active : active?.pins;
        const baseCurrent = draft.source === 'active' && current ? diffValues(draft.baseline, current).length === 0 : null;
        const changes = draft.target === 'thresholds' ? ruleChanges(draft.baseline, draft.model) : pinChanges(draft.baseline, draft.model);
        return { ...this.result(draft, active), comparison: { baseCurrent, ...changes } };
      }
      default: throw new DraftRequestError('The monitoring draft command is unavailable.');
    }
  }

  result(draft, configuration) {
    const { id, revision, activity, kind, target } = draft;
    return { id, revision, activity, kind, target, ...this.values(draft, configuration) };
  }
}

module.exports = { AgentMonitoringDrafts, monitoringDraftInput, monitoringDraftOutput, monitoringDraftParams };
