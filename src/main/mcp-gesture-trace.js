// @ts-check
'use strict';

const { DraftRequestError } = require('./mcp-drafts');
const { RUN_MS } = require('./panel-measurement');

const PHASES = ['idle', 'active'];
const OUTCOME_STATUS = { success: 'success', error: 'failed', unavailable: 'unavailable', cancelled: 'cancelled' };
const OUTCOMES = [...Object.keys(OUTCOME_STATUS), 'ignored', 'superseded', 'unreported'];
const LIMITATIONS = ['gesture-and-context-supplied-by-scenario', 'branch-provider-and-window-timeline-missing',
  'frame-timing-and-counts-observed-only', 'delivery-to-target-unverified'];
const REASONS = ['ambiguous-dispatch', 'outcome-unreported', 'outcome-not-simulatable'];
const FRAME_GRACE_MS = 500;
const MAX_DELAY_MS = RUN_MS + FRAME_GRACE_MS;
const MAX_DISPLACEMENT_PX = 0x7fffffff;

const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const nullableNumber = (maximum, type = 'number') => ({ type: [type, 'null'], minimum: 0, maximum });
const object = (properties, required) => ({ type: 'object', additionalProperties: false, properties, required });
const tapProperties = {
  offsetMs: integer(0, RUN_MS), requests: integer(0, Number.MAX_SAFE_INTEGER), executions: integer(0, Number.MAX_SAFE_INTEGER),
  outcome: { enum: OUTCOMES }, pendingFrameMs: nullableNumber(MAX_DELAY_MS), feedbackFrameMs: nullableNumber(MAX_DELAY_MS),
  foregroundChanged: { type: ['boolean', 'null'] },
  displacementPx: nullableNumber(MAX_DISPLACEMENT_PX, 'integer'), displacementAfterPx: nullableNumber(MAX_DISPLACEMENT_PX, 'integer'),
};
const tapSchema = object(tapProperties, ['offsetMs', 'requests', 'executions', 'outcome', 'pendingFrameMs', 'feedbackFrameMs']);
const traceInput = object({ version: { const: 1 }, phase: { enum: PHASES }, durationMs: integer(1, RUN_MS), tap: tapSchema },
  ['version', 'phase', 'durationMs', 'tap']);
const traceOutput = object({ mode: { const: 'offline' }, trace: traceInput,
  outcomeComparison: object({ matches: { type: ['boolean', 'null'] }, reason: { enum: REASONS },
    measuredStatus: { enum: Object.values(OUTCOME_STATUS) } }, ['matches']),
  limitations: { type: 'array', items: { enum: LIMITATIONS }, minItems: LIMITATIONS.length, maxItems: LIMITATIONS.length },
}, ['mode', 'trace', 'outcomeComparison', 'limitations']);

function fields(value, schema) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((name) => Object.hasOwn(schema.properties, name))
    && schema.required.every((name) => Object.hasOwn(value, name));
}

function within(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function latency(value, max) {
  return value === null || (Number.isFinite(value) && value >= 0 && value <= max);
}

function traceOf(trace) {
  if (!fields(trace, traceInput) || trace.version !== 1 || !PHASES.includes(trace.phase)
      || !within(trace.durationMs, 1, RUN_MS)) {
    throw new DraftRequestError('Supply one contact from an approved version 1 Panel measurement trace.');
  }
  if (!fields(trace.tap, tapSchema)) throw new DraftRequestError('Supply the supported fields for one Panel measurement contact.');
  const { offsetMs, requests, executions, outcome, pendingFrameMs, feedbackFrameMs, foregroundChanged, displacementPx, displacementAfterPx } = trace.tap;
  // Contact offsets round to milliseconds while frame intervals retain hundredths.
  const maxFrameMs = Math.min(MAX_DELAY_MS, trace.durationMs - offsetMs + FRAME_GRACE_MS + 0.5);
  if (!within(offsetMs, 0, trace.durationMs) || !within(requests, 0, Number.MAX_SAFE_INTEGER)
      || !within(executions, 0, Number.MAX_SAFE_INTEGER) || !OUTCOMES.includes(outcome)
      || !latency(pendingFrameMs, maxFrameMs) || !latency(feedbackFrameMs, maxFrameMs)
      || (foregroundChanged != null && typeof foregroundChanged !== 'boolean')
      || [displacementPx, displacementAfterPx].some((value) => value != null && !within(value, 0, MAX_DISPLACEMENT_PX))) {
    throw new DraftRequestError('The Panel measurement contact contains unsupported timing or measurements.');
  }
  return { version: 1, phase: trace.phase, durationMs: trace.durationMs, tap: {
    offsetMs, requests, executions, outcome, pendingFrameMs, feedbackFrameMs,
    ...(foregroundChanged !== undefined ? { foregroundChanged } : {}),
    ...(displacementPx !== undefined ? { displacementPx } : {}),
    ...(displacementAfterPx !== undefined ? { displacementAfterPx } : {}),
  } };
}

function traceReplay(trace, status) {
  const { requests, executions, outcome } = trace.tap;
  let reason;
  if (requests !== 1 || executions !== 1) reason = 'ambiguous-dispatch';
  else if (outcome === 'unreported') reason = 'outcome-unreported';
  else if (!Object.hasOwn(OUTCOME_STATUS, outcome)) reason = 'outcome-not-simulatable';
  const outcomeComparison = reason ? { matches: null, reason } : {
    matches: OUTCOME_STATUS[outcome] === status, measuredStatus: OUTCOME_STATUS[outcome],
  };
  return { mode: 'offline', trace, outcomeComparison, limitations: LIMITATIONS.slice() };
}

module.exports = { traceInput, traceOutput, traceOf, traceReplay };
